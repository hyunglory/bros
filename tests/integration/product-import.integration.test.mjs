import assert from "node:assert/strict";
import test from "node:test";
import { fork } from "node:child_process";
import { once } from "node:events";
import { URL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { loadConfig, createRedactedLogger } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import { createPgBossQueue } from "../../packages/queue/dist/index.js";
import {
  createImportValidationService,
  createMasterService,
  createImportResultRecorder,
  createSourceProductUpsertService,
  createImportChunkProcessor,
} from "../../packages/importer/dist/index.js";
import {
  enqueueProductImport,
  createProductImportHandler,
  createWorker,
} from "../../apps/worker/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

async function until(read, accept, timeout = 20000) {
  const deadline = Date.now() + timeout;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (accept(value)) return value;
    await delay(50);
  }
  assert.fail(`Import condition timed out: ${JSON.stringify(value)}`);
}

test(
  "P2-13 durable batch queue, bounded chunks, retries and restart",
  { timeout: 240000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    await migrateToLatest(fixture.db);
    const config = loadConfig({ DATABASE_URL: fixture.connectionString, DB_POOL_MAX: "8" });
    const database = createDatabaseClient(config.database, { applicationName: "bros-test" });
    const db = database.db;
    const queue = createPgBossQueue(config.database, {
      pollingIntervalSeconds: 0.5,
      retryDelay: 1,
      superviseIntervalSeconds: 1,
    });
    const workers = [];
    const children = [];
    t.after(async () => {
      for (const child of children)
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, "exit");
          child.kill("SIGKILL");
          await exited;
        }
      for (const worker of workers) await worker.stop();
      await queue.stop();
      await database.close();
      await fixture.cleanup();
    });
    await queue.start();
    const validation = createImportValidationService(database);
    const brand = await db
      .insertInto("app.brand")
      .values({ brand_key: "queue-fixture", name_en: "QueueFixture" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("app.brand_alias")
      .values({ brand_id: brand.id, alias_name: "QueueFixture", alias_norm: "queuefixture" })
      .execute();
    let sequence = 0;
    async function batch(count, prefix = `batch-${++sequence}`, rejected = false) {
      return validation.persist({
        platformCode: "MUSINSA",
        sourceName: "synthetic-queue-fixture",
        context: { collectedAt: "2026-09-14T03:00:00Z" },
        rows: Array.from({ length: count }, (_, index) => ({
          outcome: "MAPPED",
          issues: [],
          sourceRowNumber: index + 1,
          sourceLocator: `fixture!A${index + 1}`,
          input: {
            platformCode: "MUSINSA",
            externalProductId: rejected && index % 10 === 0 ? "" : `${prefix}-${index}`,
            productName: "Queue Fixture Runner",
            brandName: "QueueFixture",
            identifiers: [{ type: "GTIN", value: "012345678905" }],
            options: [{ rawOptionName: "Black / M", sourceOrder: 0, raw: {} }],
            images: [
              {
                imageType: "MAIN",
                sourceOrder: 0,
                sourceUrl: "https://cdn.example/queue.jpg",
                raw: {},
              },
            ],
            raw: {},
          },
        })),
      });
    }
    const row = (publicId) =>
      db
        .selectFrom("app.import_batch")
        .selectAll()
        .where("public_id", "=", publicId)
        .executeTakeFirstOrThrow();
    const delivery = (receipt, attempt = 1, retryLimit = 2) => ({
      provider: receipt.provider,
      providerId: receipt.providerId,
      data: { publicId: receipt.publicId },
      attempt,
      retryLimit,
      signal: new globalThis.AbortController().signal,
    });
    const logger = createRedactedLogger({
      write() {
        return true;
      },
    });

    await t.test("atomic admission, concurrent replay, and queued-batch backpressure", async () => {
      const first = await batch(1);
      const second = await batch(1);
      const receipts = await Promise.all(
        Array.from({ length: 4 }, () =>
          enqueueProductImport(database, queue, first.batchPublicId, { maxQueuedBatches: 1 }),
        ),
      );
      receipts.forEach((receipt) => assert.deepEqual(receipt, receipts[0]));
      await assert.rejects(
        enqueueProductImport(database, queue, second.batchPublicId, { maxQueuedBatches: 1 }),
        { code: "IMPORT_BACKPRESSURE" },
      );
      assert.equal((await row(second.batchPublicId)).config_json.importQueue, undefined);
      const jobs = await fixture.client.query(
        "select data from bros_queue.job where name='product.import'",
      );
      assert.equal(jobs.rows.length, 1);
      assert.deepEqual(jobs.rows[0].data, { publicId: first.batchPublicId });
      await createProductImportHandler(database, { chunkSize: 1 }, logger)(delivery(receipts[0]));
      await fixture.client.query(
        `CREATE FUNCTION app.reject_queue_receipt() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.public_id = '${second.batchPublicId}' AND NEW.config_json ? 'importQueue' THEN RAISE EXCEPTION 'private-marker'; END IF; RETURN NEW; END $$`,
      );
      await fixture.client.query(
        "CREATE TRIGGER reject_queue_receipt BEFORE UPDATE ON app.import_batch FOR EACH ROW EXECUTE FUNCTION app.reject_queue_receipt()",
      );
      try {
        await assert.rejects(enqueueProductImport(database, queue, second.batchPublicId));
      } finally {
        await fixture.client.query("DROP TRIGGER reject_queue_receipt ON app.import_batch");
        await fixture.client.query("DROP FUNCTION app.reject_queue_receipt()");
      }
      assert.equal((await row(second.batchPublicId)).config_json.importQueue, undefined);
      assert.equal(
        (
          await fixture.client.query(
            "select count(*)::int as n from bros_queue.job where data->>'publicId'=$1",
            [second.batchPublicId],
          )
        ).rows[0].n,
        0,
      );
    });

    await t.test(
      "mixed source and image failures retry independently and keep successful item results",
      async () => {
        const value = await batch(4, "fault");
        const receipt = await enqueueProductImport(database, queue, value.batchPublicId);
        await fixture.client.query(
          `CREATE FUNCTION app.fail_import_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.external_product_id = 'fault-0' THEN RAISE EXCEPTION 'private-source-marker'; END IF; RETURN NEW; END $$`,
        );
        await fixture.client.query(
          "CREATE TRIGGER fail_import_source BEFORE INSERT ON app.source_product FOR EACH ROW EXECUTE FUNCTION app.fail_import_source()",
        );
        await fixture.client.query(
          `CREATE FUNCTION app.fail_import_image() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS (SELECT 1 FROM app.source_product WHERE id=NEW.source_product_id AND external_product_id='fault-1') THEN RAISE EXCEPTION 'private-image-marker'; END IF; RETURN NEW; END $$`,
        );
        await fixture.client.query(
          "CREATE TRIGGER fail_import_image BEFORE INSERT ON app.product_image FOR EACH ROW EXECUTE FUNCTION app.fail_import_image()",
        );
        const handler = createProductImportHandler(database, { chunkSize: 2 }, logger);
        try {
          await assert.rejects(handler(delivery(receipt)), { code: "IMPORT_PROCESSING_FAILED" });
          assert.equal(
            (await row(value.batchPublicId)).config_json.importQueue.status,
            "RETRY_WAIT",
          );
          await handler(delivery(receipt, 3));
          const saved = await row(value.batchPublicId);
          assert.equal(saved.status, "PARTIAL_FAILED");
          assert.equal(saved.success_count, 2);
          assert.equal(saved.failed_count, 2);
          assert.equal(saved.config_json.pipelineTracking.completed, true);
          const items = await db
            .selectFrom("app.import_item")
            .selectAll()
            .where("import_batch_id", "=", saved.id)
            .orderBy("input_row_no")
            .execute();
          assert.equal(items[0].error_code, "SOURCE_UPSERT_FAILED");
          assert.equal(items[1].error_code, "IMAGE_STAGE_FAILED");
          assert.doesNotMatch(
            JSON.stringify(saved.config_json) + JSON.stringify(items),
            /private-.*-marker/,
          );
          await assert.rejects(createMasterService(database).process(items[1].public_id), {
            code: "IMPORT_ITEM_FINALIZED",
          });
          const before = JSON.stringify(items);
          await handler(delivery(receipt, 4));
          assert.equal(
            JSON.stringify(
              await db
                .selectFrom("app.import_item")
                .selectAll()
                .where("import_batch_id", "=", saved.id)
                .orderBy("input_row_no")
                .execute(),
            ),
            before,
          );
        } finally {
          await fixture.client.query("DROP TRIGGER fail_import_source ON app.source_product");
          await fixture.client.query("DROP FUNCTION app.fail_import_source()");
          await fixture.client.query("DROP TRIGGER fail_import_image ON app.product_image");
          await fixture.client.query("DROP FUNCTION app.fail_import_image()");
        }
      },
    );

    await t.test(
      "a new intermediate failure updates DB status without violating aggregate checks",
      async () => {
        const value = await batch(2, "intermediate");
        await createSourceProductUpsertService(database).process(value.batchPublicId);
        const saved = await row(value.batchPublicId);
        const items = await db
          .selectFrom("app.import_item")
          .select("public_id")
          .where("import_batch_id", "=", saved.id)
          .execute();
        const recorder = createImportResultRecorder(database);
        const result = await recorder.recordFailure({
          itemPublicId: items[0].public_id,
          stage: "P2-09",
          errorCode: "MASTER_STAGE_FAILED",
        });
        assert.equal(result.batch.completed, false);
        assert.equal((await row(value.batchPublicId)).status, "PARTIAL_FAILED");
      },
    );

    await t.test(
      "chunk reads wait for completion and source concurrency stays bounded",
      async () => {
        const value = await batch(6, "bounded");
        await fixture.client.query(
          `CREATE FUNCTION app.slow_bounded_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.external_product_id LIKE 'bounded-%' THEN PERFORM pg_sleep(0.3); END IF; RETURN NEW; END $$`,
        );
        await fixture.client.query(
          "CREATE TRIGGER slow_bounded_source BEFORE INSERT ON app.source_product FOR EACH ROW EXECUTE FUNCTION app.slow_bounded_source()",
        );
        let release;
        let reached;
        const gate = new Promise((resolve) => {
          release = resolve;
        });
        const atCheckpoint = new Promise((resolve) => {
          reached = resolve;
        });
        const processor = createImportChunkProcessor(database, { chunkSize: 3, concurrency: 2 });
        const running = processor.process(value.batchPublicId, {
          signal: new globalThis.AbortController().signal,
          finalAttempt: true,
          checkpoint: async (progress) => {
            if (progress.phase === "source" && progress.chunks === 1) {
              reached();
              await gate;
            }
          },
        });
        try {
          const concurrent = await until(
            async () =>
              (
                await fixture.client.query(
                  "select count(*)::int as n from pg_stat_activity where datname=current_database() and wait_event='PgSleep'",
                )
              ).rows[0].n,
            (n) => n >= 2,
          );
          assert.equal(concurrent, 2);
          await atCheckpoint;
          const count = async () =>
            (
              await fixture.client.query(
                "select count(*)::int as n from app.source_product where external_product_id like 'bounded-%'",
              )
            ).rows[0].n;
          assert.equal(await count(), 3);
          await delay(50);
          assert.equal(await count(), 3);
          await assert.rejects(
            processor.process(value.batchPublicId, {
              signal: new globalThis.AbortController().signal,
              finalAttempt: true,
            }),
            { code: "IMPORT_BATCH_BUSY" },
          );
        } finally {
          release();
          await running;
          await fixture.client.query("DROP TRIGGER slow_bounded_source ON app.source_product");
          await fixture.client.query("DROP FUNCTION app.slow_bounded_source()");
        }
        assert.equal((await row(value.batchPublicId)).success_count, 6);
      },
    );

    await t.test(
      "retry keeps completed siblings and explicit resume replaces a lost delivery",
      async () => {
        const value = await batch(3, "transient");
        const receipt = await enqueueProductImport(database, queue, value.batchPublicId);
        await fixture.client.query(
          `CREATE FUNCTION app.transient_import_image() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF EXISTS (SELECT 1 FROM app.source_product WHERE id=NEW.source_product_id AND external_product_id='transient-0') THEN RAISE EXCEPTION 'private-transient-marker'; END IF; RETURN NEW; END $$`,
        );
        await fixture.client.query(
          "CREATE TRIGGER transient_import_image BEFORE INSERT ON app.product_image FOR EACH ROW EXECUTE FUNCTION app.transient_import_image()",
        );
        const handler = createProductImportHandler(database, { chunkSize: 2 }, logger);
        try {
          await assert.rejects(handler(delivery(receipt)), { code: "IMPORT_PROCESSING_FAILED" });
        } finally {
          await fixture.client.query("DROP TRIGGER transient_import_image ON app.product_image");
          await fixture.client.query("DROP FUNCTION app.transient_import_image()");
        }
        const saved = await row(value.batchPublicId);
        const itemRows = () =>
          db
            .selectFrom("app.import_item")
            .selectAll()
            .where("import_batch_id", "=", saved.id)
            .orderBy("input_row_no")
            .execute();
        const before = await itemRows();
        assert.equal(before[0].raw_json.pipelineTracking, undefined);
        assert.ok(before[1].raw_json.pipelineTracking);
        assert.ok(before[2].raw_json.pipelineTracking);
        const replacement = await enqueueProductImport(database, queue, value.batchPublicId, {
          resume: true,
        });
        assert.notEqual(replacement.providerId, receipt.providerId);
        await assert.rejects(handler(delivery(receipt, 2)), { code: "IMPORT_DELIVERY_MISMATCH" });
        await handler(delivery(replacement));
        const after = await itemRows();
        assert.equal((await row(value.batchPublicId)).success_count, 3);
        assert.deepEqual(after.slice(1), before.slice(1));
        assert.equal(after[0].raw_json.imageRegistration.result.createdCount, 1);
      },
    );

    await t.test(
      "1k synthetic rows run through the actual Worker and repeated enqueue creates no duplicates",
      async () => {
        const value = await batch(1000, "large", true);
        const receipt = await enqueueProductImport(database, queue, value.batchPublicId);
        const consumer = createPgBossQueue(config.database, { pollingIntervalSeconds: 0.5 });
        const worker = createWorker(config, { queue: consumer, logger });
        workers.push(worker);
        await worker.start();
        const started = Date.now();
        const saved = await until(
          () => row(value.batchPublicId),
          (r) => r.config_json.importQueue.status === "SUCCESS",
          150000,
        );
        t.diagnostic(`1k import elapsed ${Date.now() - started} ms`);
        assert.equal(saved.success_count, 900);
        assert.equal(saved.failed_count, 100);
        assert.equal(saved.config_json.pipelineTracking.recordedCount, 1000);
        assert.equal(saved.config_json.pipelineTracking.completed, true);
        assert.deepEqual(saved.config_json.importQueue.progress, {
          phase: "pipeline",
          chunks: 10,
          visitedCount: 1000,
        });
        const counts = async () =>
          (
            await fixture.client.query(`SELECT
      (SELECT count(*)::int FROM app.source_product WHERE external_product_id LIKE 'large-%') AS sources,
      (SELECT count(*)::int FROM app.source_sku s JOIN app.source_product p ON p.id=s.source_product_id WHERE p.external_product_id LIKE 'large-%') AS skus,
      (SELECT count(*)::int FROM app.product_image i JOIN app.source_product p ON p.id=i.source_product_id WHERE p.external_product_id LIKE 'large-%') AS images`)
          ).rows[0];
        assert.deepEqual(await counts(), { sources: 900, skus: 900, images: 900 });
        assert.deepEqual(await enqueueProductImport(database, queue, value.batchPublicId), receipt);
        await createProductImportHandler(database, {}, logger)(delivery(receipt, 10));
        assert.deepEqual(await counts(), { sources: 900, skus: 900, images: 900 });
        await worker.stop();
      },
    );

    await t.test(
      "real process death after committed items resumes on provider redelivery",
      async () => {
        const value = await batch(30, "restart");
        const fastQueue = createPgBossQueue(config.database, {
          expireInSeconds: 5,
          retryDelay: 1,
          pollingIntervalSeconds: 0.5,
          superviseIntervalSeconds: 1,
        });
        await fastQueue.start();
        const receipt = await enqueueProductImport(database, fastQueue, value.batchPublicId);
        await fastQueue.stop();
        await fixture.client.query(
          `CREATE FUNCTION app.slow_import_source() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.external_product_id LIKE 'restart-%' THEN PERFORM pg_sleep(0.1); END IF; RETURN NEW; END $$`,
        );
        await fixture.client.query(
          "CREATE TRIGGER slow_import_source BEFORE INSERT ON app.source_product FOR EACH ROW EXECUTE FUNCTION app.slow_import_source()",
        );
        async function launch() {
          const child = fork(new URL("./product-import-process-fixture.mjs", import.meta.url), [], {
            env: {
              ...process.env,
              APP_ENV: "test",
              DATABASE_URL: fixture.connectionString,
              DB_POOL_MAX: "8",
              IMPORT_CHUNK_SIZE: "5",
              IMPORT_CONCURRENCY: "2",
            },
            silent: true,
          });
          children.push(child);
          child.stdout.resume();
          child.stderr.resume();
          assert.equal((await once(child, "message"))[0].ready, true);
          return child;
        }
        const child = await launch();
        await until(
          async () =>
            (
              await fixture.client.query(
                "select count(*)::int as n from app.source_product where external_product_id like 'restart-%'",
              )
            ).rows[0].n,
          (n) => n >= 4 && n < 30,
        );
        const exited = once(child, "exit");
        child.kill("SIGKILL");
        await exited;
        const next = await launch();
        const saved = await until(
          () => row(value.batchPublicId),
          (r) => r.config_json.importQueue.status === "SUCCESS",
          25000,
        );
        assert.ok(saved.config_json.importQueue.attempt >= 2);
        assert.equal(saved.success_count, 30);
        assert.equal(saved.config_json.pipelineTracking.recordedCount, 30);
        assert.equal(
          (
            await fixture.client.query(
              "select count(*)::int as n from app.source_product where external_product_id like 'restart-%'",
            )
          ).rows[0].n,
          30,
        );
        assert.equal(saved.config_json.importQueue.providerId, receipt.providerId);
        const stopped = once(next, "exit");
        if (process.platform === "win32") next.send("signal");
        else next.kill("SIGTERM");
        assert.equal((await stopped)[0], 0);
        await fixture.client.query("DROP TRIGGER slow_import_source ON app.source_product");
        await fixture.client.query("DROP FUNCTION app.slow_import_source()");
      },
    );
  },
);
