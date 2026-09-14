import { chmod, lstat, mkdir } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";

import { createBrowserSecretKeys } from "@bros/core";
import { chromium } from "playwright";
import type { BrowserContext, LaunchOptions } from "playwright";
import { browserLaunchEnvironment } from "./launch-environment.js";

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
      | "SESSION_LAUNCH_FAILED"
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
              : code === "SESSION_LAUNCH_FAILED"
                ? "Browser session launch failed"
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

async function ensureDirectory(path: string, production: boolean): Promise<void> {
  try {
    if (production && process.platform !== "linux") throw new Error();
    const ancestors: string[] = [];
    for (let parent = dirname(path); ; parent = dirname(parent)) {
      ancestors.unshift(parent);
      if (parent === dirname(parent)) break;
    }
    for (const parent of ancestors) {
      const info = await lstat(parent).catch(async (error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOENT") throw error;
        await mkdir(parent, { mode: 0o700 });
        return lstat(parent);
      });
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error();
      if (production && info.uid !== 0 && info.uid !== process.getuid?.()) throw new Error();
      if (
        production &&
        (info.mode & 0o022) !== 0 &&
        !(info.uid === 0 && (info.mode & 0o1000) !== 0)
      )
        throw new Error();
    }
    await mkdir(path, { mode: 0o700 }).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "EEXIST") throw error;
    });
    const details = await lstat(path);
    if (!details.isDirectory() || details.isSymbolicLink()) {
      throw new SessionManagerError("PROFILE_STORAGE_UNSAFE");
    }
    if (production && ((details.mode & 0o077) !== 0 || details.uid !== process.getuid?.()))
      throw new Error();
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
  profileRoot?: string;
  production?: boolean;
}): SessionManager {
  const profileRoot = options.profileRoot ?? process.env.BROS_BROWSER_PROFILE_ROOT;
  const production = options.production === true || process.env.APP_ENV === "production";
  if (!profileRoot || !isAbsolute(profileRoot)) {
    throw new SessionManagerError("PROFILE_STORAGE_UNSAFE");
  }

  const launcher = options.launcher ?? chromium;
  const root = resolve(profileRoot);
  const contexts = new Set<BrowserContext>();
  const launches = new Set<Promise<BrowserContext>>();
  let closePromise: Promise<void> | undefined;
  let state: "accepting" | "closing" | "closed" = "accepting";

  const profilePath = async (profileKey: string): Promise<string> => {
    assertProfileKey(profileKey);
    await ensureDirectory(root, production);
    const path = resolve(root, profileKey);
    assertContained(root, path);
    await ensureDirectory(path, production);
    return path;
  };

  const open = async (request: ProfileSessionRequest): Promise<ProfileSessionResult> => {
    if (state !== "accepting") throw new SessionManagerError("SESSION_MANAGER_CLOSED");
    const timeout = request.timeoutMs ?? DEFAULT_LAUNCH_TIMEOUT_MS;
    assertTiming(timeout, request.slowMoMs);
    const userDataDir = await profilePath(request.profileKey);
    if (state !== "accepting") throw new SessionManagerError("SESSION_MANAGER_CLOSED");

    const pending = launcher.launchPersistentContext(userDataDir, {
      env: browserLaunchEnvironment(),
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
    } catch (error) {
      if (error instanceof SessionManagerError) throw error;
      throw new SessionManagerError("SESSION_LAUNCH_FAILED");
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
