import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { TextDecoder } from "node:util";

import { createRedactedLogger, loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import { createPgBossQueue } from "../../packages/queue/dist/index.js";
import { createLocalObjectStorage } from "../../packages/storage/dist/index.js";
import { createWorker, enqueueBrowserRun } from "../../apps/worker/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

async function until(read, accept, timeout = 60000) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (accept(value)) return value;
    await delay(100);
  }
  assert.fail(`Browser durable condition timed out: ${JSON.stringify(value)}`);
}

async function objectBytes(storage, key) {
  const reader = (await storage.getObject(key)).getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value);
      size += next.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

test(
  "P6-01 queues a browser run, records DB state, and persists redacted evidence",
  { timeout: 120000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    const storageRoot = await mkdtemp(join(tmpdir(), "bros-p6-artifacts-"));
    await migrateToLatest(fixture.db);
    const config = loadConfig({
      DATABASE_URL: fixture.connectionString,
      DB_POOL_MAX: "8",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_ROOT: storageRoot,
    });
    const database = createDatabaseClient(config.database, { applicationName: "bros-p6-test" });
    const queue = createPgBossQueue(config.database, { pollingIntervalSeconds: 0.5 });
    const worker = createWorker(config, {
      logger: createRedactedLogger({ write: () => undefined }),
      queue,
    });
    const storage = createLocalObjectStorage({ root: storageRoot });
    t.after(async () => {
      await worker.stop().catch(() => undefined);
      await database.close();
      await fixture.cleanup();
      await rm(storageRoot, { force: true, recursive: true });
    });
    const job = await database.db
      .insertInto("app.automation_job")
      .values({
        allow_manual_run: true,
        allow_parallel: true,
        config_json: JSON.stringify({ mode: "success" }),
        cooldown_seconds: 0,
        enabled: true,
        handler_key: "demo.browser",
        job_code: `p6-demo-${randomUUID()}`,
        job_name: "P6 durable demo",
        job_type: "BROWSER",
        max_retries: 0,
        profile_key: "demo-profile",
        timeout_seconds: 60,
      })
      .returning("public_id")
      .executeTakeFirstOrThrow();
    const row = (publicId) =>
      database.db
        .selectFrom("app.automation_run")
        .selectAll()
        .where("public_id", "=", publicId)
        .executeTakeFirstOrThrow();

    await worker.start();
    const requestKey = `browser.manual:${randomUUID()}`;
    const [receipt, duplicate] = await Promise.all([
      enqueueBrowserRun(database, queue, {
        input: { mode: "success" },
        jobPublicId: job.public_id,
        requestKey,
      }),
      enqueueBrowserRun(database, queue, {
        input: { mode: "success" },
        jobPublicId: job.public_id,
        requestKey,
      }),
    ]);
    assert.deepEqual(receipt, duplicate);
    const succeeded = await until(
      () => row(receipt.publicId),
      (run) => run.status === "SUCCESS",
    );
    assert.equal(succeeded.attempt_no, 1);
    assert.equal(succeeded.current_step, "completed");
    assert.equal(succeeded.error_code, null);
    assert.ok(succeeded.finished_at >= succeeded.started_at);
    assert.equal(succeeded.result_json.demo.result, "COMPLETED");
    assert.equal(succeeded.result_json.artifact.screenshotKey, succeeded.screenshot_key);
    assert.match(succeeded.result_json.artifact.startKey, /\/start\.png$/);
    assert.equal(succeeded.result_json.artifact.traceKey, succeeded.trace_key);
    assert.deepEqual(
      (await objectBytes(storage, succeeded.result_json.artifact.startKey)).slice(0, 8),
      Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    assert.deepEqual(
      (await objectBytes(storage, succeeded.screenshot_key)).slice(0, 8),
      Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    assert.deepEqual(
      (await objectBytes(storage, succeeded.trace_key)).slice(0, 2),
      Uint8Array.from([80, 75]),
    );
    const resultObject = JSON.parse(
      new TextDecoder().decode(
        await objectBytes(storage, succeeded.result_json.artifact.resultKey),
      ),
    );
    assert.equal(resultObject.status, "SUCCESS");
    assert.equal(resultObject.result.demoResult, "COMPLETED");
    assert.doesNotMatch(JSON.stringify(succeeded), /postgresql:|cookie|authorization/i);

    const failedReceipt = await enqueueBrowserRun(database, queue, {
      input: { mode: "failure" },
      jobPublicId: job.public_id,
    });
    const failed = await until(
      () => row(failedReceipt.publicId),
      (run) => run.status === "FAILED",
    );
    assert.equal(failed.current_step, "failed");
    assert.equal(failed.error_code, "FLOW_LOGIC_ERROR");
    assert.equal(failed.result_json.demo.result, "REJECTED");
    assert.match(failed.result_json.artifact.startKey, /\/start\.png$/);
    assert.match(failed.screenshot_key, /failure\.png$/);
    assert.match(failed.trace_key, /trace\.zip$/);
  },
);
