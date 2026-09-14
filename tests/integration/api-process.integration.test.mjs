import assert from "node:assert/strict";
import { fork, spawn } from "node:child_process";
import { once } from "node:events";
import { URL } from "node:url";
import test from "node:test";
import { createDatabaseFixture } from "./database-fixture.mjs";

async function waitMessage(child, event) {
  for (;;) {
    const [message] = await once(child, "message");
    if (message.event === event) return message;
  }
}

test(
  "SIGTERM handler drains the DB pool and enforces a shutdown deadline",
  { timeout: 15000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    const children = [];
    t.after(async () => {
      // Clean children before DROP DATABASE even when an assertion or timeout fails.
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, "exit");
          child.kill("SIGKILL");
          await exited;
        }
      }
      await fixture.cleanup();
    });
    for (const deadline of [false, true]) {
      const child = fork(new URL("./api-process-fixture.mjs", import.meta.url), [], {
        env: {
          ...process.env,
          APP_ENV: "test",
          DATABASE_URL: fixture.connectionString,
          API_HOST: "127.0.0.1",
          API_SHUTDOWN_TIMEOUT_MS: deadline ? "150" : "5000",
        },
        silent: true,
      });
      children.push(child);
      let output = "";
      child.stdout.on("data", (data) => {
        output += data;
      });
      child.stderr.on("data", (data) => {
        output += data;
      });
      const exited = once(child, "exit");
      const { port } = await waitMessage(child, "ready");
      assert.equal((await globalThis.fetch(`http://127.0.0.1:${port}/ready`)).status, 200);
      const held = waitMessage(child, "held");
      child.send("hold");
      await held;
      // Windows child.kill(SIGTERM) forcibly terminates without delivering a POSIX signal.
      // Exercise the registered signal handler there; Linux CI delivers the real signal.
      if (process.platform === "win32") child.send("signal");
      else child.kill("SIGTERM");
      if (!deadline) child.send("release");
      const [code] = await exited;
      assert.equal(code, deadline ? 1 : 0, output);
      assert.match(output, deadline ? /API_SHUTDOWN_TIMEOUT/ : /API_STOPPED/);
      assert.doesNotMatch(output, /postgresql:\/\//);
    }
    t.diagnostic(
      process.platform === "win32"
        ? "Windows: registered SIGTERM handler dispatched through IPC"
        : "POSIX: real SIGTERM delivered",
    );
  },
);

test("CLI rejects invalid configuration with a nonzero exit and safe output", async () => {
  const child = spawn(process.execPath, ["apps/api/dist/main.js"], {
    env: { ...process.env, DATABASE_URL: "invalid-secret-marker", APP_ENV: "test" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const [code] = await once(child, "exit");
  assert.equal(code, 1);
  assert.match(output, /API_STARTUP_FAILED/);
  assert.doesNotMatch(output, /invalid-secret-marker/);
});
