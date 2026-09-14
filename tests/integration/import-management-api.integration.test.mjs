import assert from "node:assert/strict";
import test from "node:test";

import { createApiApp } from "../../apps/api/dist/index.js";
import { createRedactedLogger, loadConfig } from "../../packages/core/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

function quietLogger() {
  return createRedactedLogger({
    write() {
      return true;
    },
  });
}

test(
  "P2-14 Import management API paginates, filters, projects safe detail, and resumes idempotently",
  { timeout: 30000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    await migrateToLatest(fixture.db);
    const published = [];
    const queue = {
      start() {
        return Promise.resolve();
      },
      stop() {
        return Promise.resolve();
      },
      async publish(name, data) {
        published.push({ name, data });
        return { provider: "fake", providerId: `receipt-${published.length}` };
      },
      work() {
        return Promise.resolve();
      },
    };
    const config = loadConfig({
      DATABASE_URL: fixture.connectionString,
      API_LOCAL_UNAUTHENTICATED: "true",
      IMPORT_MAX_QUEUED_BATCHES: "1",
    });
    const runtime = createApiApp(config, quietLogger(), { queue });
    t.after(async () => {
      await runtime.close();
      await fixture.cleanup();
    });
    await runtime.start();
    const platform = (
      await fixture.client.query("SELECT id FROM app.platform WHERE code='MUSINSA'")
    ).rows[0];
    async function insertBatch({
      source,
      createdAt,
      status = "FAILED",
      configJson = {},
      terminal = true,
    }) {
      const batch = (
        await fixture.client.query(
          `INSERT INTO app.import_batch(platform_id,import_type,status,total_count,success_count,failed_count,source_name,config_json,finished_at,created_at)
       VALUES($1,'XLSX',$2,1,0,$3,$4,$5,$6,$7) RETURNING id,public_id`,
          [
            platform.id,
            status,
            terminal ? 1 : 0,
            source,
            configJson,
            terminal ? createdAt : null,
            createdAt,
          ],
        )
      ).rows[0];
      const item = (
        await fixture.client.query(
          `INSERT INTO app.import_item(import_batch_id,external_product_id,status,action_type,error_code,error_message,raw_json,processed_at,created_at,input_row_no)
       VALUES($1,NULL,$2,$3,$4,$5,$6,$7,$8,1) RETURNING public_id`,
          [
            batch.id,
            terminal ? "FAILED" : "PENDING",
            terminal ? "FAILED" : null,
            terminal ? "MISSING_EXTERNAL_PRODUCT_ID" : null,
            terminal ? "Required identifier is missing" : null,
            { secretMarker: "must-not-leak" },
            terminal ? createdAt : null,
            createdAt,
          ],
        )
      ).rows[0];
      return { batchPublicId: batch.public_id, itemPublicId: item.public_id };
    }
    const older = await insertBatch({
      source: "older.xlsx",
      createdAt: "2026-09-14T02:00:00.000500Z",
    });
    const newer = await insertBatch({
      source: "newer.xlsx",
      createdAt: "2026-09-14T02:00:00.000900Z",
      configJson: {
        importQueue: {
          version: "P2-13/v1",
          provider: "pg-boss",
          providerId: "private-provider-id",
          status: "SUCCESS",
          progress: { phase: "pipeline", chunks: 1, visitedCount: 1 },
        },
        pipelineTracking: { completed: true },
      },
    });
    const recoverable = await insertBatch({
      source: "recoverable.xlsx",
      createdAt: "2026-09-14T03:00:00Z",
      status: "RUNNING",
      terminal: false,
      configJson: {
        importQueue: {
          version: "P2-13/v1",
          provider: "pg-boss",
          providerId: "lost-receipt",
          status: "FAILED",
        },
      },
    });

    const first = await runtime.app.inject("/api/v1/import-batches?status=FAILED&limit=1");
    assert.equal(first.statusCode, 200);
    assert.equal(first.json().items[0].publicId, newer.batchPublicId);
    assert.ok(first.json().nextCursor);
    assert.doesNotMatch(first.body, /private-provider-id|secretMarker|must-not-leak/);
    const second = await runtime.app.inject(
      `/api/v1/import-batches?status=FAILED&limit=1&cursor=${encodeURIComponent(first.json().nextCursor)}`,
    );
    assert.equal(second.statusCode, 200);
    assert.equal(second.json().items[0].publicId, older.batchPublicId);
    assert.equal(second.json().nextCursor, null);
    assert.equal(
      (await runtime.app.inject("/api/v1/import-batches?cursor=broken")).statusCode,
      400,
    );

    const detail = await runtime.app.inject(
      `/api/v1/import-batches/${newer.batchPublicId}?itemStatus=FAILED`,
    );
    assert.equal(detail.statusCode, 200);
    assert.equal(detail.json().items[0].errorCode, "MISSING_EXTERNAL_PRODUCT_ID");
    assert.equal(detail.json().items[0].sourceProductPublicId, null);
    assert.equal(detail.json().batch.processingStatus, "SUCCESS");
    assert.equal(detail.json().batch.pipelineCompleted, true);
    assert.doesNotMatch(detail.body, /secretMarker|must-not-leak|private-provider-id/);
    assert.equal(
      (await runtime.app.inject(`/api/v1/import-batches/${older.itemPublicId}`)).statusCode,
      404,
    );

    const missingHeader = await runtime.app.inject({
      method: "POST",
      url: `/api/v1/import-batches/${recoverable.batchPublicId}/retry`,
      headers: { "content-type": "application/json" },
      payload: { mode: "resume" },
    });
    assert.equal(missingHeader.statusCode, 403);
    const resume = await runtime.app.inject({
      method: "POST",
      url: `/api/v1/import-batches/${recoverable.batchPublicId}/retry`,
      headers: { "content-type": "application/json", "x-bros-operation": "import-retry" },
      payload: { mode: "resume" },
    });
    assert.equal(resume.statusCode, 202);
    assert.deepEqual(resume.json(), {
      publicId: recoverable.batchPublicId,
      status: "QUEUED",
      statusUrl: `/api/v1/import-batches/${recoverable.batchPublicId}`,
    });
    assert.deepEqual(published, [
      { name: "product.import", data: { publicId: recoverable.batchPublicId } },
    ]);
    const replay = await runtime.app.inject({
      method: "POST",
      url: `/api/v1/import-batches/${recoverable.batchPublicId}/retry`,
      headers: { "content-type": "application/json", "x-bros-operation": "import-retry" },
      payload: { mode: "replay" },
    });
    assert.equal(replay.statusCode, 200);
    assert.equal(replay.json().processingStatus, "QUEUED");
    assert.equal(published.length, 1);
    assert.doesNotMatch(replay.body, /receipt|provider/);
    const blocked = await insertBatch({
      source: "blocked.xlsx",
      createdAt: "2026-09-14T04:00:00Z",
      status: "RUNNING",
      terminal: false,
      configJson: {
        importQueue: {
          version: "P2-13/v1",
          provider: "pg-boss",
          providerId: "failed-receipt",
          status: "FAILED",
        },
      },
    });
    const limited = await runtime.app.inject({
      method: "POST",
      url: `/api/v1/import-batches/${blocked.batchPublicId}/retry`,
      headers: { "content-type": "application/json", "x-bros-operation": "import-retry" },
      payload: { mode: "resume" },
    });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().error.code, "IMPORT_BACKPRESSURE");
    assert.equal(limited.json().error.details.retryAfterSeconds, 5);
  },
);

test("P2-14 business API stays disabled without explicit loopback mode", async (t) => {
  const config = loadConfig({ DATABASE_URL: "postgresql://unused@127.0.0.1:1/unused" });
  const runtime = createApiApp(config, quietLogger());
  t.after(() => runtime.close());
  const response = await runtime.app.inject("/api/v1/import-batches");
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, "BUSINESS_API_DISABLED");
});
