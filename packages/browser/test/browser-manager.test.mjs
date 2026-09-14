import assert from "node:assert/strict";
import test from "node:test";
import { BrowserManagerError, createBrowserManager } from "../dist/index.js";

class FakeBrowser {
  connected = true;
  closeCalls = 0;
  listeners = new Set();

  async close() {
    this.closeCalls += 1;
    this.disconnect();
  }

  disconnect() {
    if (!this.connected) return;
    this.connected = false;
    for (const listener of this.listeners) listener();
  }

  isConnected() {
    return this.connected;
  }

  on(event, listener) {
    assert.equal(event, "disconnected");
    this.listeners.add(listener);
  }
}

function createLauncher() {
  const calls = [];
  const browsers = [];
  return {
    browsers,
    calls,
    launcher: {
      async launch(options) {
        calls.push(options);
        const browser = new FakeBrowser();
        browsers.push(browser);
        return browser;
      },
    },
  };
}

test("launches headed or headless Chromium with worker-owned signal handling", async () => {
  const fixture = createLauncher();
  const manager = createBrowserManager({ launcher: fixture.launcher });
  const value = await manager.withBrowser(
    { headless: false, slowMoMs: 25, timeoutMs: 2_000 },
    async (browser) => {
      assert.equal(manager.activeCount(), 1);
      assert.equal(browser.isConnected(), true);
      return "complete";
    },
  );

  assert.equal(value, "complete");
  assert.deepEqual(fixture.calls, [
    {
      env: fixture.calls[0].env,
      handleSIGHUP: false,
      handleSIGINT: false,
      handleSIGTERM: false,
      headless: false,
      slowMo: 25,
      timeout: 2_000,
    },
  ]);
  assert.equal(fixture.browsers[0].closeCalls, 1);
  assert.equal(manager.activeCount(), 0);
});

test("removes browsers that crash and gracefully closes every active browser once", async () => {
  const fixture = createLauncher();
  const manager = createBrowserManager({ launcher: fixture.launcher });
  await manager.launch();
  await manager.launch();
  assert.equal(manager.activeCount(), 2);

  fixture.browsers[0].disconnect();
  assert.equal(manager.activeCount(), 1);
  await Promise.all([manager.close(), manager.close()]);

  assert.equal(fixture.browsers[0].closeCalls, 0);
  assert.equal(fixture.browsers[1].closeCalls, 1);
  assert.equal(manager.activeCount(), 0);
  await assert.rejects(
    manager.launch(),
    (error) => error instanceof BrowserManagerError && error.code === "BROWSER_MANAGER_CLOSED",
  );
});

test("closes a browser that completes launch after manager shutdown begins", async () => {
  let release;
  const delayedLaunch = new Promise((resolve) => {
    release = resolve;
  });
  const manager = createBrowserManager({ launcher: { launch: () => delayedLaunch } });
  const pending = manager.launch();
  const closing = manager.close();
  const browser = new FakeBrowser();
  release(browser);

  await assert.rejects(
    pending,
    (error) => error instanceof BrowserManagerError && error.code === "BROWSER_MANAGER_CLOSED",
  );
  await closing;
  assert.equal(browser.closeCalls, 1);
});

test("rejects unsafe launch timing without reflecting supplied values", async () => {
  const manager = createBrowserManager({ launcher: createLauncher().launcher });
  for (const request of [
    { timeoutMs: 0 },
    { timeoutMs: 300_001 },
    { slowMoMs: -1 },
    { slowMoMs: 300_001 },
  ]) {
    await assert.rejects(
      manager.launch(request),
      (error) =>
        error instanceof BrowserManagerError && error.code === "INVALID_BROWSER_LAUNCH_OPTIONS",
    );
  }
});

test("Chromium gets an allowlisted environment, never parent credentials or injection options", async () => {
  const fixture = createLauncher();
  const keys = [
    "BROS_SECRET_PROVIDER_IMAGE_API_KEY",
    "DATABASE_URL",
    "NODE_OPTIONS",
    "DEBUG",
    "AWS_SECRET_ACCESS_KEY",
  ];
  const previous = keys.map((key) => process.env[key]);
  try {
    for (const key of keys) process.env[key] = "synthetic-secret";
    const manager = createBrowserManager({ launcher: fixture.launcher });
    await manager.launch();
    for (const key of keys) assert.equal(fixture.calls[0].env[key], undefined);
    await manager.close();
  } finally {
    keys.forEach((key, i) => {
      if (previous[i] === undefined) Reflect.deleteProperty(process.env, key);
      else process.env[key] = previous[i];
    });
  }
});
