import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { TextEncoder } from "node:util";

import {
  createArtifactRetentionRepository,
  createArtifactRetentionService,
} from "../../apps/worker/dist/index.js";
import { loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import { createLocalObjectStorage } from "../../packages/storage/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

test(
  "P6-05 deletes only expired Browser evidence, honors a hold, and keeps an audit trail",
  { timeout: 120_000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    const root = await mkdtemp(join(tmpdir(), "bros-artifact-retention-"));
    await migrateToLatest(fixture.db);
    const config = loadConfig({
      DATABASE_URL: fixture.connectionString,
      DB_POOL_MAX: "4",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_ROOT: root,
    });
    const database = createDatabaseClient(config.database, { applicationName: "bros-test" });
    const storage = createLocalObjectStorage({ root });
    t.after(async () => {
      await database.close();
      await fixture.cleanup();
      await rm(root, { force: true, recursive: true });
    });

    const runId = "018f0cb2-ef9d-7b29-a13d-9a4f00000021";
    const prefix = `automation/2026/08/01/${runId}`;
    const screenshotKey = `${prefix}/failure.png`;
    const traceKey = `${prefix}/trace.zip`;
    const resultKey = `${prefix}/result.json`;
    const sourceOriginalKey = "images/source/keep-original.jpg";
    for (const key of [screenshotKey, traceKey, resultKey, sourceOriginalKey]) {
      await storage.putObject({ body: new TextEncoder().encode(key), key });
    }
    const job = await database.db
      .insertInto("app.automation_job")
      .values({
        allow_manual_run: true,
        allow_parallel: true,
        config_json: JSON.stringify({}),
        cooldown_seconds: 0,
        enabled: true,
        handler_key: "demo.browser",
        job_code: `retention-${randomUUID()}`,
        job_name: "Retention fixture",
        job_type: "BROWSER",
        max_retries: 0,
        profile_key: "retention-profile",
        timeout_seconds: 60,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    const finishedAt = new Date("2026-08-01T00:00:00.000Z");
    await database.db
      .insertInto("app.automation_run")
      .values({
        attempt_no: 1,
        automation_job_id: job.id,
        finished_at: finishedAt,
        input_json: JSON.stringify({}),
        request_key: `retention:${randomUUID()}`,
        result_json: JSON.stringify({ artifact: { resultKey } }),
        screenshot_key: screenshotKey,
        started_at: finishedAt,
        status: "SUCCESS",
        trace_key: traceKey,
        trigger_type: "MANUAL",
      })
      .executeTakeFirstOrThrow();

    const service = createArtifactRetentionService({
      now: () => new Date("2026-09-14T12:00:00.000Z"),
      repository: createArtifactRetentionRepository(database),
      storage,
    });
    await service.placeHold({ objectKey: traceKey, reason: "incident investigation" });
    assert.deepEqual(await service.runCleanup(), { deleted: 2, failed: 0, held: 1, scanned: 3 });
    await assert.rejects(storage.getObject(screenshotKey));
    await assert.rejects(storage.getObject(resultKey));
    await storage.getObject(traceKey);
    await storage.getObject(sourceOriginalKey);

    const firstEvents = await database.db
      .selectFrom("app.artifact_retention_event")
      .select(["event_type", "object_key", "storage_provider", "storage_bucket"])
      .orderBy("id")
      .execute();
    assert.deepEqual(
      firstEvents.map((event) => event.event_type),
      ["HOLD_SET", "DELETED", "DELETED"],
    );
    assert.equal(firstEvents[1].storage_provider, "LOCAL");
    assert.equal(firstEvents[1].storage_bucket, "local");

    await service.releaseHold({ objectKey: traceKey, reason: "incident resolved" });
    assert.deepEqual(await service.runCleanup(), { deleted: 1, failed: 0, held: 0, scanned: 3 });
    await assert.rejects(storage.getObject(traceKey));
    await storage.getObject(sourceOriginalKey);
    const eventCount = await database.db
      .selectFrom("app.artifact_retention_event")
      .select((eb) => eb.fn.count("id").as("count"))
      .executeTakeFirstOrThrow();
    assert.equal(eventCount.count, "5");
  },
);
