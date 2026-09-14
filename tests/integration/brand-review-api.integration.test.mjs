import assert from "node:assert/strict";
import test from "node:test";

import { createApiApp } from "../../apps/api/dist/index.js";
import { createRedactedLogger, loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import {
  createBrandNormalizer,
  createImportChunkProcessor,
  createImportValidationService,
} from "../../packages/importer/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

function quietLogger() {
  return createRedactedLogger({
    write() {
      return true;
    },
  });
}

test(
  "P2-16 brand review approves exact aliases, rejects safely, resolves precedence, and reprocesses source",
  { timeout: 60000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    let database;
    let runtime;
    t.after(async () => {
      await runtime?.close();
      await database?.close();
      await fixture.cleanup();
    });
    await migrateToLatest(fixture.db);
    const config = loadConfig({
      DATABASE_URL: fixture.connectionString,
      DB_POOL_MAX: "8",
      API_LOCAL_UNAUTHENTICATED: "true",
      IMPORT_MAX_QUEUED_BATCHES: "32",
    });
    database = createDatabaseClient(config.database, { applicationName: "bros-test" });
    const published = [];
    let queueFailure = false;
    const queue = {
      start() {
        return Promise.resolve();
      },
      stop() {
        return Promise.resolve();
      },
      async publish(name, data) {
        if (queueFailure) throw new Error("private-queue-marker");
        published.push({ name, data });
        return { provider: "fake", providerId: `receipt-${published.length}` };
      },
      work() {
        return Promise.resolve();
      },
    };
    runtime = createApiApp(config, quietLogger(), { queue });
    const validation = createImportValidationService(database);
    const processor = createImportChunkProcessor(database, { chunkSize: 2, concurrency: 2 });
    let sequence = 0;
    await runtime.start();

    async function brand(key) {
      return (
        await fixture.client.query(
          "INSERT INTO app.brand(brand_key,name_en) VALUES($1,$2) RETURNING id,public_id",
          [key, key],
        )
      ).rows[0];
    }

    async function unresolved(rawBrandName, platformCode = "MUSINSA") {
      sequence += 1;
      const value = await validation.persist({
        platformCode,
        sourceName: `brand-review-${sequence}.xlsx`,
        context: { collectedAt: "2026-09-14T10:00:00.000Z" },
        rows: [
          {
            outcome: "MAPPED",
            issues: [],
            sourceRowNumber: 1,
            sourceLocator: `Sheet1!A${sequence}`,
            input: {
              platformCode,
              externalProductId: `BRAND-REVIEW-${sequence}`,
              productName: `Brand Review Product ${sequence}`,
              brandName: rawBrandName,
              identifiers: [{ type: "STYLE_CODE", value: `REVIEW-${sequence}` }],
              options: [],
              images: [],
              raw: { preserved: `raw-${sequence}` },
            },
          },
        ],
      });
      await processor.process(value.batchPublicId, {
        signal: new globalThis.AbortController().signal,
        finalAttempt: true,
      });
      const item = (
        await fixture.client.query(
          `SELECT i.public_id,i.raw_json,s.public_id AS source_public_id
             FROM app.import_item i
             JOIN app.import_batch b ON b.id=i.import_batch_id
             JOIN app.source_product s ON s.id=i.source_product_id
            WHERE b.public_id=$1`,
          [value.batchPublicId],
        )
      ).rows[0];
      assert.equal(item.raw_json.masterCreation.input.brand.status, "UNRESOLVED");
      assert.equal(item.raw_json.raw.preserved, `raw-${sequence}`);
      return item;
    }

    const nike = await brand("P2_16_NIKE");
    const adidas = await brand("P2_16_ADIDAS");
    const first = await unresolved("나 익 히");
    const duplicate = await unresolved("나   익 히");
    const raceA = await unresolved("Race Alias");
    const raceB = await unresolved("Race Alias");
    const inactive = await unresolved("Inactive Platform Alias");

    await t.test("safe list and operation boundary", async () => {
      const list = await runtime.app.inject(
        "/api/v1/brand-reviews?decision=PENDING&platform=MUSINSA&query=%EB%82%98%20%EC%9D%B5",
      );
      assert.equal(list.statusCode, 200);
      assert.equal(list.json().items[0].publicId, first.public_id);
      assert.equal(list.json().items[0].sourceProductPublicId, first.source_public_id);
      assert.equal(list.json().items[0].normalizedName, "나 익 히");
      assert.doesNotMatch(list.body, /raw_json|raw-1|source_product_id|platform_id/);
      const missingHeader = await runtime.app.inject({
        method: "POST",
        url: `/api/v1/brand-reviews/${first.public_id}/approve`,
        headers: { "content-type": "application/json" },
        payload: {
          expectedVersion: 0,
          brandPublicId: nike.public_id,
          scope: "PLATFORM",
          changeReason: "확인",
        },
      });
      assert.equal(missingHeader.statusCode, 403);
    });

    let approvedBatch;
    await t.test(
      "approval commits alias, immutable decision, queue receipt and a one-item reprocess batch",
      async () => {
        const response = await runtime.app.inject({
          method: "POST",
          url: `/api/v1/brand-reviews/${first.public_id}/approve`,
          headers: {
            "content-type": "application/json",
            "x-bros-operation": "brand-review-approve",
          },
          payload: {
            expectedVersion: 0,
            brandPublicId: nike.public_id,
            scope: "PLATFORM",
            changeReason: "공식 상품 페이지 확인",
          },
        });
        assert.equal(response.statusCode, 200, response.body);
        assert.equal(response.json().decision, "APPROVED");
        assert.equal(response.json().aliasCreated, true);
        approvedBatch = response.json().reprocessBatchPublicId;
        assert.deepEqual(published.at(-1), {
          name: "product.import",
          data: { publicId: approvedBatch },
        });

        const original = (
          await fixture.client.query(
            "SELECT status,raw_json FROM app.import_item WHERE public_id=$1",
            [first.public_id],
          )
        ).rows[0];
        assert.equal(original.status, "REVIEW_REQUIRED");
        assert.equal(original.raw_json.raw.preserved, "raw-1");
        assert.deepEqual(
          {
            decision: original.raw_json.brandReview.decision,
            reason: original.raw_json.brandReview.reason,
            scope: original.raw_json.brandReview.scope,
            version: original.raw_json.brandReview.version,
          },
          { decision: "APPROVED", reason: "공식 상품 페이지 확인", scope: "PLATFORM", version: 1 },
        );
        assert.equal(original.raw_json.brandReview.brand.publicId, nike.public_id);
        const reprocess = (
          await fixture.client.query(
            `SELECT b.import_type,b.status,b.total_count,b.config_json,i.status AS item_status,i.raw_json
             FROM app.import_batch b JOIN app.import_item i ON i.import_batch_id=b.id
            WHERE b.public_id=$1`,
            [approvedBatch],
          )
        ).rows[0];
        assert.equal(reprocess.import_type, "BRAND_REVIEW_REPROCESS");
        assert.equal(reprocess.status, "RUNNING");
        assert.equal(reprocess.item_status, "PENDING");
        assert.equal(reprocess.raw_json.raw.preserved, "raw-1");
        assert.equal(reprocess.raw_json.masterCreation, undefined);
        assert.equal(reprocess.config_json.importQueue.status, "QUEUED");
      },
    );

    await t.test(
      "approved alias resolves exactly and the new batch completes the affected Source",
      async () => {
        const normalized = await createBrandNormalizer(database).normalize({
          platformCode: "MUSINSA",
          rawBrandName: "  나   익 히  ",
        });
        assert.equal(normalized.status, "RESOLVED");
        assert.equal(normalized.aliasScope, "PLATFORM");
        assert.equal(normalized.brand.publicId, nike.public_id);
        await processor.process(approvedBatch, {
          signal: new globalThis.AbortController().signal,
          finalAttempt: true,
        });
        const completed = (
          await fixture.client.query(
            `SELECT b.status,i.status AS item_status,s.product_id,i.raw_json
             FROM app.import_batch b JOIN app.import_item i ON i.import_batch_id=b.id
             JOIN app.source_product s ON s.id=i.source_product_id
            WHERE b.public_id=$1`,
            [approvedBatch],
          )
        ).rows[0];
        assert.equal(completed.status, "SUCCEEDED");
        assert.equal(completed.item_status, "SUCCEEDED");
        assert.ok(completed.product_id);
        assert.equal(completed.raw_json.raw.preserved, "raw-1");
      },
    );

    await t.test(
      "duplicate approval reuses the alias and concurrent conflicting decisions serialize",
      async () => {
        const response = await runtime.app.inject({
          method: "POST",
          url: `/api/v1/brand-reviews/${duplicate.public_id}/approve`,
          headers: {
            "content-type": "application/json",
            "x-bros-operation": "brand-review-approve",
          },
          payload: {
            expectedVersion: 0,
            brandPublicId: nike.public_id,
            scope: "PLATFORM",
            changeReason: "동일 alias",
          },
        });
        assert.equal(response.statusCode, 200);
        assert.equal(response.json().aliasCreated, false);

        const request = (reviewPublicId, brandPublicId) =>
          runtime.app.inject({
            method: "POST",
            url: `/api/v1/brand-reviews/${reviewPublicId}/approve`,
            headers: {
              "content-type": "application/json",
              "x-bros-operation": "brand-review-approve",
            },
            payload: { expectedVersion: 0, brandPublicId, scope: "PLATFORM", changeReason: "경합" },
          });
        const responses = await Promise.all([
          request(raceA.public_id, nike.public_id),
          request(raceB.public_id, adidas.public_id),
        ]);
        assert.deepEqual(responses.map((value) => value.statusCode).sort(), [200, 409]);
        assert.equal(
          (
            await fixture.client.query(
              "SELECT count(*)::int AS count FROM app.brand_alias WHERE alias_norm='race alias'",
            )
          ).rows[0].count,
          1,
        );
      },
    );

    await t.test("inactive platform blocks approval without a partial alias", async () => {
      await fixture.client.query("UPDATE app.platform SET is_active=false WHERE code='MUSINSA'");
      try {
        const response = await runtime.app.inject({
          method: "POST",
          url: `/api/v1/brand-reviews/${inactive.public_id}/approve`,
          headers: {
            "content-type": "application/json",
            "x-bros-operation": "brand-review-approve",
          },
          payload: {
            expectedVersion: 0,
            brandPublicId: nike.public_id,
            scope: "PLATFORM",
            changeReason: "비활성 플랫폼 검증",
          },
        });
        assert.equal(response.statusCode, 409);
        assert.equal(response.json().error.code, "BRAND_REVIEW_PLATFORM_INACTIVE");
        assert.equal(
          (
            await fixture.client.query(
              "SELECT count(*)::int AS count FROM app.brand_alias WHERE alias_norm='inactive platform alias'",
            )
          ).rows[0].count,
          0,
        );
      } finally {
        await fixture.client.query("UPDATE app.platform SET is_active=true WHERE code='MUSINSA'");
      }
    });

    await t.test("platform alias wins over global alias", async () => {
      const globalRaw = "Scoped Brand";
      const scoped = await unresolved(globalRaw, "MUSINSA");
      await fixture.client.query(
        "INSERT INTO app.brand_alias(brand_id,alias_name,alias_norm,platform_id) VALUES($1,$2,$3,NULL)",
        [nike.id, globalRaw, "scoped brand"],
      );
      const response = await runtime.app.inject({
        method: "POST",
        url: `/api/v1/brand-reviews/${scoped.public_id}/approve`,
        headers: { "content-type": "application/json", "x-bros-operation": "brand-review-approve" },
        payload: {
          expectedVersion: 0,
          brandPublicId: adidas.public_id,
          scope: "PLATFORM",
          changeReason: "플랫폼 공식 표기",
        },
      });
      assert.equal(response.statusCode, 200, response.body);
      const normalizer = createBrandNormalizer(database);
      const platform = await normalizer.normalize({
        platformCode: "MUSINSA",
        rawBrandName: globalRaw,
      });
      const global = await normalizer.normalize({
        platformCode: "OLIVEYOUNG",
        rawBrandName: globalRaw,
      });
      assert.equal(platform.status, "RESOLVED");
      assert.equal(platform.aliasScope, "PLATFORM");
      assert.equal(platform.brand.publicId, adidas.public_id);
      assert.equal(global.status, "RESOLVED");
      assert.equal(global.aliasScope, "GLOBAL");
      assert.equal(global.brand.publicId, nike.public_id);
    });

    await t.test(
      "rejection creates no alias or reprocess batch, and queue failure rolls back approval",
      async () => {
        const rejected = await unresolved("Reject Me");
        const beforeBatches = (
          await fixture.client.query("SELECT count(*)::int AS count FROM app.import_batch")
        ).rows[0].count;
        const response = await runtime.app.inject({
          method: "POST",
          url: `/api/v1/brand-reviews/${rejected.public_id}/reject`,
          headers: {
            "content-type": "application/json",
            "x-bros-operation": "brand-review-reject",
          },
          payload: { expectedVersion: 0, changeReason: "브랜드명이 아닌 판매 문구" },
        });
        assert.equal(response.statusCode, 200);
        assert.equal(response.json().reprocessBatchPublicId, null);
        assert.equal(
          (await fixture.client.query("SELECT count(*)::int AS count FROM app.import_batch"))
            .rows[0].count,
          beforeBatches,
        );
        assert.equal(
          (
            await fixture.client.query(
              "SELECT count(*)::int AS count FROM app.brand_alias WHERE alias_norm='reject me'",
            )
          ).rows[0].count,
          0,
        );
        assert.equal(
          (
            await createBrandNormalizer(database).normalize({
              platformCode: "MUSINSA",
              rawBrandName: "Reject Me",
            })
          ).status,
          "UNRESOLVED",
        );

        const rollback = await unresolved("Rollback Alias");
        queueFailure = true;
        const failed = await runtime.app.inject({
          method: "POST",
          url: `/api/v1/brand-reviews/${rollback.public_id}/approve`,
          headers: {
            "content-type": "application/json",
            "x-bros-operation": "brand-review-approve",
          },
          payload: {
            expectedVersion: 0,
            brandPublicId: nike.public_id,
            scope: "GLOBAL",
            changeReason: "롤백 검증",
          },
        });
        queueFailure = false;
        assert.equal(failed.statusCode, 503);
        assert.doesNotMatch(failed.body, /private-queue-marker/);
        assert.equal(
          (
            await fixture.client.query(
              "SELECT count(*)::int AS count FROM app.brand_alias WHERE alias_norm='rollback alias'",
            )
          ).rows[0].count,
          0,
        );
        const rolledBackItem = (
          await fixture.client.query("SELECT raw_json FROM app.import_item WHERE public_id=$1", [
            rollback.public_id,
          ])
        ).rows[0];
        assert.equal(rolledBackItem.raw_json.brandReview, undefined);
      },
    );
  },
);

test("P2-16 business API stays disabled without explicit loopback mode", async (t) => {
  const runtime = createApiApp(
    loadConfig({ DATABASE_URL: "postgresql://unused@127.0.0.1:1/unused" }),
    quietLogger(),
  );
  t.after(() => runtime.close());
  const response = await runtime.app.inject("/api/v1/brand-reviews");
  assert.equal(response.statusCode, 503);
  assert.equal(response.json().error.code, "BUSINESS_API_DISABLED");
});
