import assert from "node:assert/strict";
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { createSessionManager, SessionManagerError } from "../dist/index.js";

class FakeContext {
  closeCalls = 0;
  listeners = new Set();

  async close() {
    this.closeCalls += 1;
    for (const listener of this.listeners) listener();
  }

  on(event, listener) {
    assert.equal(event, "close");
    this.listeners.add(listener);
  }
}

function createLauncher() {
  const calls = [];
  const contexts = [];
  return {
    calls,
    contexts,
    launcher: {
      async launchPersistentContext(userDataDir, options) {
        calls.push({ options, userDataDir });
        const context = new FakeContext();
        contexts.push(context);
        return context;
      },
    },
  };
}

async function createFixture(context) {
  const root = await mkdtemp(join(tmpdir(), "bros-browser-profile-"));
  context.after(async () => {
    await rm(root, { force: true, recursive: true });
  });
  return root;
}

test("reuses an isolated persistent profile directory after a valid session check", async (context) => {
  const root = await createFixture(context);
  const fixture = createLauncher();
  const manager = createSessionManager({ launcher: fixture.launcher, profileRoot: root });

  const first = await manager.open({ profileKey: "mango", verifySession: async () => true });
  const second = await manager.open({ profileKey: "mango", verifySession: async () => true });

  assert.equal(first.state, "VALID");
  assert.equal(second.state, "VALID");
  assert.equal(fixture.calls.length, 2);
  assert.equal(fixture.calls[0].userDataDir, fixture.calls[1].userDataDir);
  assert.equal(fixture.calls[0].userDataDir, join(root, "mango"));
  assert.deepEqual(fixture.calls[0].options, {
    env: fixture.calls[0].options.env,
    handleSIGHUP: false,
    handleSIGINT: false,
    handleSIGTERM: false,
    headless: true,
    timeout: 30_000,
  });
  assert.equal((await lstat(join(root, "mango"))).isSymbolicLink(), false);
  await manager.close();
});

test("closes expired sessions and never stores token content itself", async (context) => {
  const root = await createFixture(context);
  const fixture = createLauncher();
  const manager = createSessionManager({ launcher: fixture.launcher, profileRoot: root });
  const result = await manager.open({ profileKey: "mango", verifySession: async () => false });

  assert.deepEqual(result, { profileKey: "mango", state: "EXPIRED" });
  assert.equal(fixture.contexts[0].closeCalls, 1);
  assert.equal(manager.activeCount(), 0);
  await assert.rejects(readFile(join(root, "mango", "tokens.json")), { code: "ENOENT" });
  await manager.close();
});

test("rejects unsafe profile roots, invalid keys, and symlinked profile directories", async (context) => {
  const root = await createFixture(context);
  assert.throws(
    () =>
      createSessionManager({
        launcher: createLauncher().launcher,
        profileRoot: "relative-profile-root",
      }),
    (error) => error instanceof SessionManagerError && error.code === "PROFILE_STORAGE_UNSAFE",
  );

  const manager = createSessionManager({ launcher: createLauncher().launcher, profileRoot: root });
  await assert.rejects(
    manager.profilePath("invalid-key"),
    (error) => error instanceof SessionManagerError && error.code === "INVALID_PROFILE_KEY",
  );
  await writeFile(join(root, "mango"), "not a directory");
  await assert.rejects(
    manager.profilePath("mango"),
    (error) => error instanceof SessionManagerError && error.code === "PROFILE_STORAGE_UNSAFE",
  );
  await manager.close();
});

test("closes open contexts on shutdown and refuses late profile launches", async (context) => {
  const root = await createFixture(context);
  const fixture = createLauncher();
  const manager = createSessionManager({ launcher: fixture.launcher, profileRoot: root });
  await manager.open({ profileKey: "mango", verifySession: async () => true });
  assert.equal(manager.activeCount(), 1);

  await Promise.all([manager.close(), manager.close()]);
  assert.equal(fixture.contexts[0].closeCalls, 1);
  await assert.rejects(
    manager.open({ profileKey: "mango", verifySession: async () => true }),
    (error) => error instanceof SessionManagerError && error.code === "SESSION_MANAGER_CLOSED",
  );
});

test(
  "Linux production profiles reject weak permissions and symlink ancestors",
  { skip: process.platform !== "linux" },
  async (t) => {
    const root = await createFixture(t);
    const launcher = createLauncher();
    const manager = createSessionManager({
      launcher: launcher.launcher,
      profileRoot: root,
      production: true,
    });
    const path = await manager.profilePath("demo");
    assert.equal((await lstat(path)).mode & 0o777, 0o700);
    await chmod(path, 0o755);
    await assert.rejects(manager.open({ profileKey: "demo", verifySession: async () => true }), {
      code: "PROFILE_STORAGE_UNSAFE",
    });
    assert.equal(launcher.calls.length, 0);
    await mkdir(join(root, "target"), { mode: 0o700 });
    await symlink(join(root, "target"), join(root, "linked"));
    const unsafe = createSessionManager({
      launcher: launcher.launcher,
      profileRoot: join(root, "linked", "nested"),
      production: true,
    });
    await assert.rejects(unsafe.profilePath("demo"), { code: "PROFILE_STORAGE_UNSAFE" });
  },
);

test("profile launches sanitize errors and never inherit secret environment", async (t) => {
  const root = await createFixture(t);
  const manager = createSessionManager({
    profileRoot: root,
    launcher: {
      async launchPersistentContext(_path, options) {
        assert.equal(options.env.DATABASE_URL, undefined);
        throw new Error("cookie=must-not-escape");
      },
    },
  });
  await assert.rejects(
    manager.open({ profileKey: "demo", verifySession: async () => true }),
    (error) => error.code === "SESSION_LAUNCH_FAILED" && !error.message.includes("must-not-escape"),
  );
  await manager.close();
});
