import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import {
  createImageRegistrar,
  createImportResultRecorder,
  createImportValidationService,
  createMasterService,
  createSkuMapper,
  createSourceProductUpsertService,
} from "../../packages/importer/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

test(
  "P2-12 records mixed outcomes atomically and makes item replay stable",
  { timeout: 60_000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    let database;
    t.after(async () => {
      await database?.close();
      await fixture.cleanup();
    });
    await migrateToLatest(fixture.db);
    database = createDatabaseClient(
      loadConfig({ DATABASE_URL: fixture.connectionString }).database,
      {
        applicationName: "bros-test",
      },
    );
    const db = database.db;
    const validation = createImportValidationService(database);
    const upsert = createSourceProductUpsertService(database);
    const master = createMasterService(database);
    const sku = createSkuMapper(database);
    const image = createImageRegistrar(database);
    const recorder = createImportResultRecorder(database);

    const brand = await db
      .insertInto("app.brand")
      .values({ brand_key: "result-fixture", name_en: "ResultFixture" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("app.brand_alias")
      .values({ brand_id: brand.id, alias_name: "ResultFixture", alias_norm: "resultfixture" })
      .execute();

    function mappedRow(sourceRowNumber, externalProductId, overrides = {}) {
      return {
        outcome: "MAPPED",
        input: {
          platformCode: "MUSINSA",
          externalProductId,
          productName: `결과 추적 상품 ${sourceRowNumber}`,
          brandName: "ResultFixture",
          raw: {},
          ...overrides,
        },
        issues: [],
        sourceLocator: `fixture!A${sourceRowNumber}`,
        sourceRowNumber,
      };
    }

    async function persistSingle(externalProductId) {
      const result = await validation.persist({
        context: { collectedAt: "2026-09-14T02:00:00Z" },
        platformCode: "MUSINSA",
        rows: [
          mappedRow(1, externalProductId, {
            identifiers: [{ type: "MODEL_NO", value: externalProductId }],
          }),
        ],
        sourceName: "p2-12-fixture",
      });
      await upsert.process(result.batchPublicId);
      const item = await db
        .selectFrom("app.import_item")
        .innerJoin("app.import_batch", "app.import_batch.id", "app.import_item.import_batch_id")
        .select(["app.import_item.public_id", "app.import_batch.public_id as batch_public_id"])
        .where("app.import_batch.public_id", "=", result.batchPublicId)
        .executeTakeFirstOrThrow();
      return item;
    }

    await t.test(
      "mixed concurrent records produce exact aggregates and preserve stage evidence",
      async () => {
        const persisted = await validation.persist({
          context: { collectedAt: "2026-09-14T01:00:00Z" },
          platformCode: "MUSINSA",
          sourceName: "p2-12-mixed-fixture",
          rows: [
            mappedRow(1, "result-success", {
              identifiers: [{ type: "GTIN", value: "012345678905" }],
            }),
            mappedRow(2, "result-review"),
            mappedRow(3, "result-stale", {
              identifiers: [{ type: "MODEL_NO", value: "RESULT-STALE" }],
            }),
            {
              issues: [{ code: "MISSING_EXTERNAL_PRODUCT_ID", path: "/externalProductId" }],
              outcome: "REJECTED",
              raw: { productName: "식별자 없는 상품" },
              sourceLocator: "fixture!A4",
              sourceRowNumber: 4,
            },
          ],
        });
        await upsert.process(persisted.batchPublicId);
        const items = await db
          .selectFrom("app.import_item")
          .select([
            "app.import_item.id",
            "app.import_item.public_id",
            "app.import_item.source_product_id",
            "app.import_item.status",
          ])
          .innerJoin("app.import_batch", "app.import_batch.id", "app.import_item.import_batch_id")
          .where("app.import_batch.public_id", "=", persisted.batchPublicId)
          .orderBy("app.import_item.id")
          .execute();
        assert.equal(items.length, 4);
        const [successItem, reviewItem, staleItem] = items;
        const beforeBatch = await db
          .selectFrom("app.import_batch")
          .select(["finished_at"])
          .where("public_id", "=", persisted.batchPublicId)
          .executeTakeFirstOrThrow();
        await db
          .updateTable("app.source_product")
          .set({ raw_product_name: "동시 수집으로 변경된 상품명" })
          .where("id", "=", staleItem.source_product_id)
          .execute();

        for (const item of [successItem, reviewItem, staleItem]) {
          await master.process(item.public_id);
          await sku.process(item.public_id);
          await image.process(item.public_id);
        }
        const results = await Promise.all(items.map((item) => recorder.record(item.public_id)));
        assert.equal(results.filter((result) => result.batch.completed).length, 1);
        assert.deepEqual(results.map((result) => result.item.status).sort(), [
          "FAILED",
          "REVIEW_REQUIRED",
          "SKIPPED",
          "SUCCEEDED",
        ]);

        const savedBatch = await db
          .selectFrom("app.import_batch")
          .selectAll()
          .where("public_id", "=", persisted.batchPublicId)
          .executeTakeFirstOrThrow();
        assert.deepEqual(
          {
            failed: savedBatch.failed_count,
            review: savedBatch.review_count,
            skipped: savedBatch.skipped_count,
            status: savedBatch.status,
            success: savedBatch.success_count,
            total: savedBatch.total_count,
          },
          { failed: 1, review: 1, skipped: 1, status: "PARTIAL_FAILED", success: 1, total: 4 },
        );
        assert.equal(savedBatch.finished_at.getTime(), beforeBatch.finished_at.getTime());
        assert.deepEqual(
          {
            completed: savedBatch.config_json.pipelineTracking.completed,
            failed: savedBatch.config_json.pipelineTracking.failedCount,
            recorded: savedBatch.config_json.pipelineTracking.recordedCount,
            review: savedBatch.config_json.pipelineTracking.reviewCount,
            skipped: savedBatch.config_json.pipelineTracking.skippedCount,
            stage: savedBatch.config_json.pipelineTracking.stage,
            success: savedBatch.config_json.pipelineTracking.successCount,
          },
          {
            completed: true,
            failed: 1,
            recorded: 4,
            review: 1,
            skipped: 1,
            stage: "P2-12/v1",
            success: 1,
          },
        );
        assert.equal(typeof savedBatch.config_json.pipelineTracking.completedAt, "string");
        assert.ok(Number.isFinite(Date.parse(savedBatch.config_json.pipelineTracking.completedAt)));

        const savedItems = await db
          .selectFrom("app.import_item")
          .select(["action_type", "error_code", "public_id", "raw_json", "status"])
          .where("import_batch_id", "=", savedBatch.id)
          .orderBy("id")
          .execute();
        assert.deepEqual(
          savedItems.map((item) => [item.status, item.action_type, item.error_code]),
          [
            ["SUCCEEDED", "CREATED", null],
            ["REVIEW_REQUIRED", "REVIEW_REQUIRED", null],
            ["SKIPPED", "SKIPPED", null],
            ["FAILED", "FAILED", "MISSING_EXTERNAL_PRODUCT_ID"],
          ],
        );
        assert.equal(savedItems[0].raw_json.pipelineTracking.result.reason, "PIPELINE_SUCCEEDED");
        assert.equal(savedItems[0].raw_json.masterCreation.stage, "P2-09/v1");
        assert.equal(savedItems[0].raw_json.skuMapping.stage, "P2-10/v1");
        assert.equal(savedItems[0].raw_json.imageRegistration.stage, "P2-11/v1");
        assert.equal(
          savedItems[2].raw_json.pipelineTracking.result.reason,
          "SOURCE_SNAPSHOT_CHANGED",
        );

        const completedAt = savedBatch.config_json.pipelineTracking.completedAt;
        const replay = await Promise.all(items.map((item) => recorder.record(item.public_id)));
        assert.ok(replay.every((result) => result.batch.completedAt === completedAt));
        assert.ok(replay.every((result) => result.batch.recordedCount === 4));
      },
    );

    await t.test("an explicit stage failure is safe, isolated, and replayable", async () => {
      const item = await persistSingle("result-explicit-failure");
      const result = await recorder.recordFailure({
        errorCode: "SKU_STAGE_FAILED",
        itemPublicId: item.public_id,
        stage: "P2-10",
      });
      assert.deepEqual(
        {
          batchStatus: result.batch.status,
          failed: result.batch.failedCount,
          itemStatus: result.item.status,
          reason: result.item.reason,
        },
        { batchStatus: "FAILED", failed: 1, itemStatus: "FAILED", reason: "SKU_STAGE_FAILED" },
      );
      const saved = await db
        .selectFrom("app.import_item")
        .select(["error_code", "error_message", "raw_json"])
        .where("public_id", "=", item.public_id)
        .executeTakeFirstOrThrow();
      assert.equal(saved.error_code, "SKU_STAGE_FAILED");
      assert.equal(saved.error_message, "Import pipeline stage failed");
      assert.equal(saved.raw_json.pipelineTracking.failureStage, "P2-10");
      assert.deepEqual(
        await recorder.recordFailure({
          errorCode: "SKU_STAGE_FAILED",
          itemPublicId: item.public_id,
          stage: "P2-10",
        }),
        result,
      );
    });

    await t.test("an accepted item cannot be finalized before every downstream stage", async () => {
      const item = await persistSingle("result-incomplete");
      await assert.rejects(recorder.record(item.public_id), { code: "PIPELINE_STAGE_INCOMPLETE" });
      const savedItem = await db
        .selectFrom("app.import_item")
        .select("raw_json")
        .where("public_id", "=", item.public_id)
        .executeTakeFirstOrThrow();
      const savedBatch = await db
        .selectFrom("app.import_batch")
        .select("config_json")
        .where("public_id", "=", item.batch_public_id)
        .executeTakeFirstOrThrow();
      assert.equal(savedItem.raw_json.pipelineTracking, undefined);
      assert.equal(savedBatch.config_json.pipelineTracking, undefined);
    });
  },
);
