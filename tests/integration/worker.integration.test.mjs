import assert from "node:assert/strict";
import test from "node:test";
import { fork, spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { loadConfig, createRedactedLogger } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { createPgBossQueue } from "../../packages/queue/dist/index.js";
import {
  enqueueSystemTest,
  createSystemTestHandler,
  createWorker,
} from "../../apps/worker/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

async function until(read, accept) {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await delay(100);
  }
  throw new Error("Worker test condition timed out");
}

test(
  "real Worker process records system.test, retries, recovers and shuts down",
  { timeout: 60000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    const config = loadConfig({ DATABASE_URL: fixture.connectionString });
    const db = createDatabaseClient(config.database, { applicationName: "bros-test" });
    const queue = createPgBossQueue(config.database, {
      retryDelay: 1,
      pollingIntervalSeconds: 0.5,
      expireInSeconds: 3,
      superviseIntervalSeconds: 1,
    });
    const children = [];
    t.after(async () => {
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, "exit");
          child.kill("SIGKILL");
          await exited;
        }
      }
      await queue.stop();
      await db.close();
      await fixture.cleanup();
    });
    await migrateToLatest(fixture.db);
    await queue.start();
    async function launch(mode, shutdownTimeout = "5000") {
      const child = fork(new URL("./worker-process-fixture.mjs", import.meta.url), [mode], {
        env: {
          ...process.env,
          APP_ENV: "test",
          DATABASE_URL: fixture.connectionString,
          WORKER_SHUTDOWN_TIMEOUT_MS: shutdownTimeout,
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
      const [message] = await once(child, "message");
      assert.equal(message.ready, true);
      return { child, exited, output: () => output };
    }
    function signal(worker) {
      if (process.platform === "win32") worker.child.send("signal");
      else worker.child.kill("SIGTERM");
    }
    async function stop(worker) {
      signal(worker);
      assert.equal((await worker.exited)[0], 0, worker.output());
      assert.match(worker.output(), /WORKER_STOPPED/);
      assert.doesNotMatch(worker.output(), /worker-private-marker|postgresql:\/\//);
    }
    const row = async (publicId) =>
      (
        await fixture.client.query("SELECT * FROM app.automation_run WHERE public_id=$1", [
          publicId,
        ])
      ).rows[0];
    const enqueue = () => enqueueSystemTest(db, queue, `system.test:${randomUUID()}`);

    await t.test(
      "offline enqueue is atomic and idempotent; real Worker records SUCCESS",
      async () => {
        const key = `system.test:${randomUUID()}`;
        const [receipt, duplicate] = await Promise.all([
          enqueueSystemTest(db, queue, key),
          enqueueSystemTest(db, queue, key),
        ]);
        assert.deepEqual(receipt, duplicate);
        assert.equal((await row(receipt.publicId)).status, "QUEUED");
        assert.equal((await row(receipt.publicId)).queue_job_id, receipt.providerId);
        const worker = await launch("normal");
        const result = await until(
          () => row(receipt.publicId),
          (run) => run.status === "SUCCESS",
        );
        assert.equal(result.attempt_no, 1);
        assert.deepEqual(result.result_json, { platformCount: "4" });
        assert.ok(result.finished_at >= result.started_at);
        await stop(worker);
        assert.match(worker.output(), /SYSTEM_TEST_SUCCESS/);
        let called = false;
        const handler = createSystemTestHandler(db, async () => {
          called = true;
          return {};
        });
        await handler({
          provider: receipt.provider,
          providerId: receipt.providerId,
          data: { publicId: receipt.publicId },
          attempt: 2,
          retryLimit: 2,
          signal: globalThis.AbortSignal.timeout(1000),
        });
        assert.equal(called, false);
        assert.equal((await row(receipt.publicId)).attempt_no, 1);
      },
    );
    await t.test("retry and terminal failure are recorded without raw errors", async () => {
      let worker = await launch("retry");
      const retry = await enqueue();
      await until(
        () => row(retry.publicId),
        (run) => run.status === "RETRY_WAIT",
      );
      const success = await until(
        () => row(retry.publicId),
        (run) => run.status === "SUCCESS",
      );
      assert.equal(success.attempt_no, 2);
      assert.equal(success.error_code, null);
      await stop(worker);
      worker = await launch("fail");
      const failure = await enqueue();
      const failed = await until(
        () => row(failure.publicId),
        (run) => run.status === "FAILED",
      );
      assert.equal(failed.attempt_no, 3);
      assert.equal(failed.error_code, "SYSTEM_TEST_FAILED");
      assert.doesNotMatch(JSON.stringify(failed), /worker-private-marker/);
      await stop(worker);
    });
    await t.test("crashed RUNNING attempt is completed by the restarted Worker", async () => {
      const worker = await launch("hold");
      const held = once(worker.child, "message");
      const receipt = await enqueue();
      await held;
      assert.equal((await row(receipt.publicId)).status, "RUNNING");
      worker.child.kill("SIGKILL");
      await worker.exited;
      const restarted = await launch("normal");
      const result = await until(
        () => row(receipt.publicId),
        (run) => run.status === "SUCCESS",
      );
      assert.equal(result.attempt_no, 2);
      await stop(restarted);
    });
    await t.test(
      "SIGTERM drains active work and deadline terminates a noncooperative handler",
      async () => {
        let worker = await launch("hold");
        let held = once(worker.child, "message");
        const receipt = await enqueue();
        await held;
        signal(worker);
        worker.child.send("release");
        assert.equal((await worker.exited)[0], 0, worker.output());
        assert.equal((await row(receipt.publicId)).status, "SUCCESS");
        worker = await launch("hold", "1000");
        held = once(worker.child, "message");
        await enqueue();
        await held;
        signal(worker);
        assert.equal((await worker.exited)[0], 1, worker.output());
        assert.match(worker.output(), /WORKER_SHUTDOWN_TIMEOUT/);
      },
    );
    await t.test("unused Worker stop is idempotent and its start gate stays closed", async () => {
      const worker = createWorker(config, {
        logger: createRedactedLogger({ write: () => undefined }),
      });
      assert.equal(await worker.isReady(), false);
      await Promise.all([worker.stop(), worker.stop()]);
      await assert.rejects(worker.start(), /cannot restart/);
    });
    await t.test("a late attempt cannot overwrite a newer SUCCESS", async () => {
      const receipt = await enqueue();
      let release;
      let entered;
      const barrier = new Promise((resolve) => {
        release = resolve;
      });
      const ready = new Promise((resolve) => {
        entered = resolve;
      });
      t.after(() => release());
      const logger = createRedactedLogger({ write: () => undefined });
      const oldHandler = createSystemTestHandler(
        db,
        async () => {
          entered();
          await barrier;
          return { winner: 1 };
        },
        logger,
      );
      const newHandler = createSystemTestHandler(db, async () => ({ winner: 2 }), logger);
      const job = {
        provider: receipt.provider,
        providerId: receipt.providerId,
        data: { publicId: receipt.publicId },
        attempt: 1,
        retryLimit: 2,
        signal: new globalThis.AbortController().signal,
      };
      const old = oldHandler(job);
      await ready;
      await newHandler({ ...job, attempt: 2 });
      const rejected = assert.rejects(old, /System test failed/);
      release();
      await rejected;
      const result = await row(receipt.publicId);
      assert.equal(result.status, "SUCCESS");
      assert.equal(result.attempt_no, 2);
      assert.deepEqual(result.result_json, { winner: 2 });
    });
    await t.test(
      "startup registration failure cleans up, and stop failure preserves DB until owner termination",
      async () => {
        let stopped = false;
        const queueStub = {
          start: async () => undefined,
          publish: async () => {
            throw new Error();
          },
          work: async () => {
            throw new Error("private-marker");
          },
          stop: async () => {
            stopped = true;
          },
        };
        let worker = createWorker(config, { queue: queueStub });
        await assert.rejects(worker.start(), /Worker startup failed/);
        assert.equal(stopped, true);
        assert.equal(worker.data.database.poolStats().total, 0);
        worker = createWorker(config, {
          queue: {
            ...queueStub,
            work: async () => undefined,
            stop: async () => {
              throw new Error("stop failed");
            },
          },
          logger: createRedactedLogger({ write: () => undefined }),
        });
        await worker.start();
        assert.equal(await worker.isReady(), true);
        await assert.rejects(worker.stop(), /stop failed/);
        assert.equal(await worker.isReady(), false);
        assert.ok(worker.data.database.poolStats().total > 0);
        await worker.data.database.close();
      },
    );
    t.diagnostic(
      process.platform === "win32"
        ? "Windows SIGTERM handler dispatched by IPC; crash uses actual SIGKILL"
        : "POSIX SIGTERM and SIGKILL delivered",
    );
  },
);

test("Worker CLI fails safely when configuration is invalid", async () => {
  const child = spawn(process.execPath, ["apps/worker/dist/main.js"], {
    env: { ...process.env, DATABASE_URL: "worker-private-marker" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  assert.equal((await once(child, "exit"))[0], 1);
  assert.match(output, /WORKER_STARTUP_FAILED/);
  assert.doesNotMatch(output, /worker-private-marker/);
});
