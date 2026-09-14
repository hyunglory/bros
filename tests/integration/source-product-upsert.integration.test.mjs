import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import {
  createImportValidationService,
  createSourceProductUpsertService,
} from "../../packages/importer/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

function mappedRow({
  externalProductId = "A000000110553",
  productName = "초기 상품명",
  sourceRowNumber = 6,
  ...overrides
} = {}) {
  return {
    input: {
      externalProductId,
      platformCode: "OLIVEYOUNG",
      productName,
      raw: { cells: { 원본상품코드: externalProductId, 상품명: productName } },
      ...overrides,
    },
    issues: [],
    outcome: "MAPPED",
    sourceLocator: `상품 목록!A${sourceRowNumber}:U${sourceRowNumber}`,
    sourceRowNumber,
  };
}

function rejectedRow(sourceRowNumber = 7) {
  return {
    issues: [{ code: "MISSING_EXTERNAL_PRODUCT_ID", path: "/원본상품코드" }],
    outcome: "REJECTED",
    raw: { cells: { 원본상품코드: "", 상품명: "식별자 없는 상품" } },
    sourceLocator: `상품 목록!A${sourceRowNumber}:U${sourceRowNumber}`,
    sourceRowNumber,
  };
}

async function persist(validation, { collectedAt, rows }) {
  return validation.persist({
    context: { collectedAt, sourceAsOfDate: "2026-09-13" },
    platformCode: "OLIVEYOUNG",
    rows,
    sourceName: "더망고_상품정보_20260913.xlsx",
  });
}

test(
  "P2-06 creates once, updates newer source data, and preserves newer data from stale imports",
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
    const validation = createImportValidationService(database);
    const upsert = createSourceProductUpsertService(database);

    const first = await persist(validation, {
      collectedAt: "2026-09-14T10:00:00+09:00",
      rows: [mappedRow(), mappedRow({ externalProductId: "A000000110554", sourceRowNumber: 7 })],
    });
    assert.deepEqual(await upsert.process(first.batchPublicId), {
      batchPublicId: first.batchPublicId,
      createdCount: 2,
      failedCount: 0,
      matchedCount: 0,
      status: "SUCCEEDED",
      updatedCount: 0,
    });

    const newer = await persist(validation, {
      collectedAt: "2026-09-14T11:00:00+09:00",
      rows: [
        mappedRow({
          currencyCode: "KRW",
          currentPrice: "12000.0000",
          productName: "갱신된 상품명",
        }),
      ],
    });
    assert.deepEqual(await upsert.process(newer.batchPublicId), {
      batchPublicId: newer.batchPublicId,
      createdCount: 0,
      failedCount: 0,
      matchedCount: 0,
      status: "SUCCEEDED",
      updatedCount: 1,
    });
    const stale = await persist(validation, {
      collectedAt: "2026-09-14T09:00:00+09:00",
      rows: [mappedRow({ productName: "과거 상품명" })],
    });
    assert.deepEqual(await upsert.process(stale.batchPublicId), {
      batchPublicId: stale.batchPublicId,
      createdCount: 0,
      failedCount: 0,
      matchedCount: 1,
      status: "SUCCEEDED",
      updatedCount: 0,
    });

    const sources = await database.db
      .selectFrom("app.source_product")
      .select([
        "external_product_id",
        "raw_product_name",
        "current_price",
        "currency_code",
        "collected_at",
      ])
      .orderBy("external_product_id")
      .execute();
    assert.deepEqual(sources, [
      {
        collected_at: new Date("2026-09-14T11:00:00+09:00"),
        currency_code: "KRW",
        current_price: "12000.0000",
        external_product_id: "A000000110553",
        raw_product_name: "갱신된 상품명",
      },
      {
        collected_at: new Date("2026-09-14T10:00:00+09:00"),
        currency_code: null,
        current_price: null,
        external_product_id: "A000000110554",
        raw_product_name: "초기 상품명",
      },
    ]);
    assert.equal(
      await database.db
        .selectFrom("app.source_product")
        .select("id")
        .execute()
        .then((items) => items.length),
      2,
    );
  },
);

test(
  "P2-06 completes a mixed validation batch with exact terminal counts",
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
    const validation = createImportValidationService(database);
    const upsert = createSourceProductUpsertService(database);
    const batch = await persist(validation, {
      collectedAt: "2026-09-14T10:00:00+09:00",
      rows: [mappedRow(), rejectedRow()],
    });

    assert.deepEqual(await upsert.process(batch.batchPublicId), {
      batchPublicId: batch.batchPublicId,
      createdCount: 1,
      failedCount: 1,
      matchedCount: 0,
      status: "PARTIAL_FAILED",
      updatedCount: 0,
    });
    const completed = await database.db
      .selectFrom("app.import_batch")
      .select(["status", "total_count", "success_count", "failed_count", "finished_at"])
      .where("public_id", "=", batch.batchPublicId)
      .executeTakeFirstOrThrow();
    assert.equal(completed.status, "PARTIAL_FAILED");
    assert.equal(completed.total_count, 2);
    assert.equal(completed.success_count, 1);
    assert.equal(completed.failed_count, 1);
    assert.ok(completed.finished_at instanceof Date);
  },
);
