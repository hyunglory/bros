import assert from "node:assert/strict";
import test from "node:test";

import { loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import { createImportValidationService } from "../../packages/importer/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

const context = { collectedAt: "2026-09-14T10:00:00+09:00", sourceAsOfDate: "2026-09-13" };

function mappedRow(overrides = {}) {
  return {
    input: {
      externalProductId: "A000000110553",
      platformCode: "OLIVEYOUNG",
      productName: "검증 상품",
      raw: { cells: { 원본상품코드: "A000000110553", 상품명: "검증 상품" } },
      ...overrides,
    },
    issues: [],
    outcome: "MAPPED",
    sourceLocator: "상품 목록!A6:U6",
    sourceRowNumber: 6,
  };
}

function rejectedRow(overrides = {}) {
  return {
    issues: [{ code: "MISSING_EXTERNAL_PRODUCT_ID", path: "/원본상품코드" }],
    outcome: "REJECTED",
    raw: { cells: { 원본상품코드: "", 상품명: "식별자 없는 상품" } },
    sourceLocator: "상품 목록!A7:U7",
    sourceRowNumber: 7,
    ...overrides,
  };
}

test(
  "P2-04 persists mapped and rejected source rows without creating source products",
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
    const service = createImportValidationService(database);

    const result = await service.persist({
      context,
      platformCode: "OLIVEYOUNG",
      rows: [mappedRow(), rejectedRow()],
      sourceName: "더망고_상품정보_20260913.xlsx",
    });
    assert.deepEqual(result, {
      acceptedCount: 1,
      batchPublicId: result.batchPublicId,
      rejectedCount: 1,
      totalCount: 2,
    });

    const batch = await database.db
      .selectFrom("app.import_batch")
      .select(["status", "total_count", "success_count", "failed_count", "finished_at"])
      .where("public_id", "=", result.batchPublicId)
      .executeTakeFirstOrThrow();
    assert.deepEqual(batch, {
      failed_count: 1,
      finished_at: null,
      status: "RUNNING",
      success_count: 1,
      total_count: 2,
    });

    const rows = await database.db
      .selectFrom("app.import_item")
      .select([
        "status",
        "action_type",
        "error_code",
        "external_product_id",
        "raw_json",
        "input_row_no",
      ])
      .orderBy("input_row_no")
      .execute();
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map(({ status, action_type, error_code, external_product_id, input_row_no }) => ({
        action_type,
        error_code,
        external_product_id,
        input_row_no,
        status,
      })),
      [
        {
          action_type: null,
          error_code: null,
          external_product_id: "A000000110553",
          input_row_no: 6,
          status: "PENDING",
        },
        {
          action_type: "FAILED",
          error_code: "MISSING_EXTERNAL_PRODUCT_ID",
          external_product_id: null,
          input_row_no: 7,
          status: "FAILED",
        },
      ],
    );
    assert.deepEqual(rows[0].raw_json, {
      context,
      mappedInput: mappedRow().input,
      raw: mappedRow().input.raw,
      schemaVersion: 1,
      sourceLocator: "상품 목록!A6:U6",
      sourceRowNumber: 6,
      validation: { issues: [], outcome: "ACCEPTED", stage: "P2-04" },
    });
    assert.deepEqual(rows[1].raw_json, {
      context,
      raw: rejectedRow().raw,
      schemaVersion: 1,
      sourceLocator: "상품 목록!A7:U7",
      sourceRowNumber: 7,
      validation: {
        issues: [{ code: "MISSING_EXTERNAL_PRODUCT_ID", path: "/원본상품코드" }],
        outcome: "REJECTED",
        stage: "P2-04",
      },
    });
    assert.equal(
      await database.db
        .selectFrom("app.source_product")
        .select("id")
        .execute()
        .then((items) => items.length),
      0,
    );
  },
);

test(
  "P2-04 replaces unsafe rejected raw with a safe issue envelope and rejects platform mismatch",
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
    const service = createImportValidationService(database);
    const secret = "must-not-persist";

    await service.persist({
      context,
      platformCode: "OLIVEYOUNG",
      rows: [
        rejectedRow({ raw: { cells: { cookie: secret }, headers: ["cookie"] } }),
        mappedRow({ externalProductId: "wrong-platform", platformCode: "MUSINSA" }),
      ],
      sourceName: "source.xlsx",
    });
    const rows = await database.db
      .selectFrom("app.import_item")
      .select(["error_code", "raw_json"])
      .orderBy("input_row_no")
      .execute();
    assert.equal(rows[0].error_code, "PLATFORM_CODE_MISMATCH");
    assert.equal(rows[0].raw_json.mappedInput, undefined);
    assert.equal(rows[1].error_code, "MISSING_EXTERNAL_PRODUCT_ID");
    assert.equal(rows[1].raw_json.raw, null);
    assert.deepEqual(rows[1].raw_json.validation.issues, [
      { code: "MISSING_EXTERNAL_PRODUCT_ID", path: "/원본상품코드" },
      { code: "SENSITIVE_FIELD", path: "/raw/cells/cookie" },
    ]);
    assert.doesNotMatch(JSON.stringify(rows[1].raw_json), new RegExp(secret));
  },
);
