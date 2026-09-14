import { chromium } from "playwright";
import type { LaunchOptions, Page } from "playwright";

const DEFAULT_LAUNCH_TIMEOUT_MS = 30_000;
const MAX_LAUNCH_TIMEOUT_MS = 300_000;

export interface BrowserConnection {
  close(): Promise<void>;
  isConnected(): boolean;
  newPage(): Promise<Page>;
  on(event: "disconnected", listener: () => void): unknown;
}

export interface BrowserLauncher {
  launch(options: LaunchOptions): Promise<BrowserConnection>;
}

export interface BrowserLaunchRequest {
  headless?: boolean;
  slowMoMs?: number;
  timeoutMs?: number;
}

export interface BrowserManager {
  activeCount(): number;
  close(): Promise<void>;
  launch(request?: BrowserLaunchRequest): Promise<BrowserConnection>;
  withBrowser<T>(
    request: BrowserLaunchRequest | undefined,
    action: (browser: BrowserConnection) => Promise<T>,
  ): Promise<T>;
}

export class BrowserManagerError extends Error {
  constructor(readonly code: "BROWSER_MANAGER_CLOSED" | "INVALID_BROWSER_LAUNCH_OPTIONS") {
    super(
      code === "BROWSER_MANAGER_CLOSED"
        ? "Browser manager is closed"
        : "Invalid browser launch options",
    );
    this.name = "BrowserManagerError";
  }
}

function assertTimeout(timeoutMs: number): void {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > MAX_LAUNCH_TIMEOUT_MS) {
    throw new BrowserManagerError("INVALID_BROWSER_LAUNCH_OPTIONS");
  }
}

function assertSlowMo(slowMoMs: number | undefined): void {
  if (
    slowMoMs !== undefined &&
    (!Number.isInteger(slowMoMs) || slowMoMs < 0 || slowMoMs > MAX_LAUNCH_TIMEOUT_MS)
  ) {
    throw new BrowserManagerError("INVALID_BROWSER_LAUNCH_OPTIONS");
  }
}

export function createBrowserManager(options: { launcher?: BrowserLauncher } = {}): BrowserManager {
  const launcher = options.launcher ?? chromium;
  const browsers = new Set<BrowserConnection>();
  const launches = new Set<Promise<BrowserConnection>>();
  let closePromise: Promise<void> | undefined;
  let state: "accepting" | "closing" | "closed" = "accepting";

  const launch = async (request: BrowserLaunchRequest = {}): Promise<BrowserConnection> => {
    if (state !== "accepting") throw new BrowserManagerError("BROWSER_MANAGER_CLOSED");

    const timeout = request.timeoutMs ?? DEFAULT_LAUNCH_TIMEOUT_MS;
    assertTimeout(timeout);
    assertSlowMo(request.slowMoMs);

    const pending = launcher.launch({
      handleSIGHUP: false,
      handleSIGINT: false,
      handleSIGTERM: false,
      headless: request.headless ?? true,
      timeout,
      ...(request.slowMoMs === undefined ? {} : { slowMo: request.slowMoMs }),
    });
    launches.add(pending);
    try {
      const browser = await pending;
      if (state !== "accepting") {
        await browser.close();
        throw new BrowserManagerError("BROWSER_MANAGER_CLOSED");
      }
      browsers.add(browser);
      browser.on("disconnected", () => browsers.delete(browser));
      return browser;
    } finally {
      launches.delete(pending);
    }
  };

  return {
    activeCount: () => browsers.size,
    launch,
    withBrowser: async <T>(
      request: BrowserLaunchRequest | undefined,
      action: (browser: BrowserConnection) => Promise<T>,
    ) => {
      const browser = await launch(request);
      try {
        return await action(browser);
      } finally {
        await browser.close();
      }
    },
    close: () => {
      closePromise ??= (async () => {
        state = "closing";
        await Promise.allSettled([...launches]);
        await Promise.all([...browsers].map((browser) => browser.close()));
        browsers.clear();
        state = "closed";
      })();
      return closePromise;
    },
  };
}
