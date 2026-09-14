import { chmod, lstat, mkdir } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

import { createBrowserSecretKeys } from "@bros/core";
import { chromium } from "playwright";
import type { BrowserContext, LaunchOptions } from "playwright";

const DEFAULT_LAUNCH_TIMEOUT_MS = 30_000;
const MAX_LAUNCH_TIMEOUT_MS = 300_000;

export interface PersistentContextLauncher {
  launchPersistentContext(userDataDir: string, options: LaunchOptions): Promise<BrowserContext>;
}

export interface ProfileSessionRequest {
  headless?: boolean;
  profileKey: string;
  slowMoMs?: number;
  timeoutMs?: number;
  verifySession(context: BrowserContext): Promise<boolean>;
}

export type ProfileSessionResult =
  | Readonly<{ context: BrowserContext; profileKey: string; state: "VALID" }>
  | Readonly<{ profileKey: string; state: "EXPIRED" }>;

export interface SessionManager {
  activeCount(): number;
  close(): Promise<void>;
  open(request: ProfileSessionRequest): Promise<ProfileSessionResult>;
  profilePath(profileKey: string): Promise<string>;
}

export class SessionManagerError extends Error {
  constructor(
    readonly code:
      | "INVALID_PROFILE_KEY"
      | "INVALID_SESSION_OPTIONS"
      | "PROFILE_STORAGE_UNSAFE"
      | "SESSION_CHECK_FAILED"
      | "SESSION_MANAGER_CLOSED",
  ) {
    super(
      code === "INVALID_PROFILE_KEY"
        ? "Invalid browser profile key"
        : code === "INVALID_SESSION_OPTIONS"
          ? "Invalid browser session options"
          : code === "PROFILE_STORAGE_UNSAFE"
            ? "Browser profile storage is unsafe"
            : code === "SESSION_CHECK_FAILED"
              ? "Browser session check failed"
              : "Session manager is closed",
    );
    this.name = "SessionManagerError";
  }
}

function assertProfileKey(profileKey: string): void {
  try {
    createBrowserSecretKeys(profileKey);
  } catch {
    throw new SessionManagerError("INVALID_PROFILE_KEY");
  }
}

function assertTiming(timeoutMs: number, slowMoMs: number | undefined): void {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_LAUNCH_TIMEOUT_MS) {
    throw new SessionManagerError("INVALID_SESSION_OPTIONS");
  }
  if (
    slowMoMs !== undefined &&
    (!Number.isInteger(slowMoMs) || slowMoMs < 0 || slowMoMs > MAX_LAUNCH_TIMEOUT_MS)
  ) {
    throw new SessionManagerError("INVALID_SESSION_OPTIONS");
  }
}

async function ensureDirectory(path: string): Promise<void> {
  try {
    await mkdir(path, { mode: 0o700, recursive: true });
    const details = await lstat(path);
    if (!details.isDirectory() || details.isSymbolicLink()) {
      throw new SessionManagerError("PROFILE_STORAGE_UNSAFE");
    }
    await chmod(path, 0o700);
  } catch (error) {
    if (error instanceof SessionManagerError) throw error;
    throw new SessionManagerError("PROFILE_STORAGE_UNSAFE");
  }
}

function assertContained(root: string, candidate: string): void {
  const fromRoot = relative(root, candidate);
  if (fromRoot === "" || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
    throw new SessionManagerError("PROFILE_STORAGE_UNSAFE");
  }
}

export function createSessionManager(options: {
  launcher?: PersistentContextLauncher;
  profileRoot: string;
}): SessionManager {
  if (!isAbsolute(options.profileRoot)) {
    throw new SessionManagerError("PROFILE_STORAGE_UNSAFE");
  }

  const launcher = options.launcher ?? chromium;
  const root = resolve(options.profileRoot);
  const contexts = new Set<BrowserContext>();
  const launches = new Set<Promise<BrowserContext>>();
  let closePromise: Promise<void> | undefined;
  let state: "accepting" | "closing" | "closed" = "accepting";

  const profilePath = async (profileKey: string): Promise<string> => {
    assertProfileKey(profileKey);
    await ensureDirectory(root);
    const path = resolve(root, profileKey);
    assertContained(root, path);
    await ensureDirectory(path);
    return path;
  };

  const open = async (request: ProfileSessionRequest): Promise<ProfileSessionResult> => {
    if (state !== "accepting") throw new SessionManagerError("SESSION_MANAGER_CLOSED");
    const timeout = request.timeoutMs ?? DEFAULT_LAUNCH_TIMEOUT_MS;
    assertTiming(timeout, request.slowMoMs);
    const userDataDir = await profilePath(request.profileKey);
    if (state !== "accepting") throw new SessionManagerError("SESSION_MANAGER_CLOSED");

    const pending = launcher.launchPersistentContext(userDataDir, {
      handleSIGHUP: false,
      handleSIGINT: false,
      handleSIGTERM: false,
      headless: request.headless ?? true,
      timeout,
      ...(request.slowMoMs === undefined ? {} : { slowMo: request.slowMoMs }),
    });
    launches.add(pending);
    try {
      const context = await pending;
      if (state !== "accepting") {
        await context.close();
        throw new SessionManagerError("SESSION_MANAGER_CLOSED");
      }
      contexts.add(context);
      context.on("close", () => contexts.delete(context));

      let valid: boolean;
      try {
        valid = await request.verifySession(context);
      } catch {
        await context.close();
        throw new SessionManagerError("SESSION_CHECK_FAILED");
      }
      if (!valid) {
        await context.close();
        return { profileKey: request.profileKey, state: "EXPIRED" };
      }
      return { context, profileKey: request.profileKey, state: "VALID" };
    } finally {
      launches.delete(pending);
    }
  };

  return {
    activeCount: () => contexts.size,
    close: () => {
      closePromise ??= (async () => {
        state = "closing";
        await Promise.allSettled([...launches]);
        await Promise.all([...contexts].map((context) => context.close()));
        contexts.clear();
        state = "closed";
      })();
      return closePromise;
    },
    open,
    profilePath,
  };
}
