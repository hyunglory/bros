import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { createApiApp } from "../apps/api/dist/index.js";
import { createWorker } from "../apps/worker/dist/index.js";
import { createRedactedLogger, loadConfig } from "../packages/core/dist/index.js";
import { createDatabaseClient } from "../packages/db/dist/index.js";
import { migrateToLatest } from "../packages/db/dist/migration-runtime.js";
import {
  XlsxImportAdapter,
  createImportValidationService,
  enqueueProductImport,
} from "../packages/importer/dist/index.js";
import { createPgBossQueue } from "../packages/queue/dist/index.js";
import { createDatabaseFixture } from "../tests/integration/database-fixture.mjs";

// Opt-in local verification. Never run private XLSX fixtures in public CI.
// This reuses the 20 source locators in SOURCE_MAPPING_SPEC section 5.
const sampleRows = [
  7, 9, 6, 11, 8, 12, 36, 47, 1206, 1342, 48, 49, 2603, 2604, 2605, 10271, 11083, 11875, 12334,
  12335,
];
let checkpoint = "input";
class SampleVerificationError extends Error {}
const check = (condition, code) => {
  if (!condition) throw new SampleVerificationError(code);
};
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const tally = (rows, key) => {
  const result = {};
  for (const row of rows) result[row[key]] = (result[row[key]] ?? 0) + 1;
  return result;
};

async function main() {
  const inputPath = process.argv[2];
  check(Boolean(inputPath), "XLSX_PATH_REQUIRED");
  const workbook = await readFile(inputPath);
  const digest = sha256(workbook);
  const contextTime = new Date().toISOString();
  const parsed = await new XlsxImportAdapter().parse({
    workbook,
    sourceFileName: basename(inputPath),
    collectedAt: contextTime,
  });
  const rows = sampleRows.map((n) => parsed.rows.find((row) => row.sourceRowNumber === n));
  check(rows.every(Boolean), "SAMPLE_LOCATOR_MISSING");
  const accepted = rows.filter((r) => r.outcome === "MAPPED");
  const rejected = rows.filter((r) => r.outcome === "REJECTED");
  check(accepted.length === 16 && rejected.length === 4, "SAMPLE_MAPPING_CHANGED");
  check(
    rejected.every((r) => r.issues.some((i) => i.code === "MISSING_EXTERNAL_PRODUCT_ID")),
    "REJECTION_REASON_CHANGED",
  );
  check(
    new Set(accepted.map((r) => JSON.stringify([r.input.platformCode, r.input.externalProductId])))
      .size === 16,
    "DUPLICATE_SAMPLE_IDENTITY",
  );
  const expectedImages = accepted.reduce(
    (n, r) =>
      n + (r.input.images?.length ?? 0) + (r.input.options ?? []).filter((o) => o.imageUrl).length,
    0,
  );
  const platformFor = (row) => {
    if (row.outcome === "MAPPED") return row.input.platformCode;
    const code = { "MUSINSA.com": "MUSINSA", "OliveYoung.co.kr": "OLIVEYOUNG" }[
      row.raw.cells["원본사이트"]
    ];
    check(Boolean(code), "REJECTED_ROW_PLATFORM_UNKNOWN");
    return code;
  };
  const groups = new Map();
  for (const row of rows) {
    const code = platformFor(row);
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(row);
  }
  checkpoint = "database";
  const fixture = await createDatabaseFixture();
  let database;
  let producer;
  let api;
  const workers = [];
  const evidence = [];
  try {
    await migrateToLatest(fixture.db);
    const config = loadConfig({
      DATABASE_URL: fixture.connectionString,
      DB_POOL_MAX: "8",
      API_LOCAL_UNAUTHENTICATED: "true",
      APP_ENV: "test",
      IMPORT_CHUNK_SIZE: "5",
      IMPORT_CONCURRENCY: "2",
    });
    database = createDatabaseClient(config.database, { applicationName: "bros-test" });
    const logger = createRedactedLogger({
      write() {
        return true;
      },
    });
    producer = createPgBossQueue(config.database, { pollingIntervalSeconds: 0.5 });
    await producer.start();
    api = createApiApp(config, logger, { queue: producer });
    await api.start();
    for (let i = 0; i < 2; i++) {
      const worker = createWorker(config, {
        logger,
        queue: createPgBossQueue(config.database, { pollingIntervalSeconds: 0.5 }),
      });
      workers.push(worker);
      await worker.start();
    }
    const validation = createImportValidationService(database);
    const select = async (query, args = []) => (await fixture.client.query(query, args)).rows;
    const domainSnapshot = async () => ({
      sources: await select(`SELECT public_id,platform_id,external_product_id,product_id,
        raw_product_name,raw_brand_name,raw_json,collected_at,last_seen_at,match_status,current_price,normal_price,currency_code
        FROM app.source_product ORDER BY public_id`),
      images: await select("SELECT * FROM app.product_image ORDER BY public_id"),
      masters: await select("SELECT * FROM app.product_master ORDER BY public_id"),
      skus: await select("SELECT * FROM app.product_sku ORDER BY public_id"),
      sourceSkus: await select("SELECT * FROM app.source_sku ORDER BY public_id"),
    });
    const originalItems = async () =>
      select(
        "SELECT public_id,status,action_type,error_code,raw_json,processed_at FROM app.import_item ORDER BY public_id",
      );
    const batchRow = async (id) =>
      (await select("SELECT * FROM app.import_batch WHERE public_id=$1", [id]))[0];
    async function waitBatch(id) {
      const deadline = Date.now() + 60000;
      while (Date.now() < deadline) {
        const row = await batchRow(id);
        if (row.config_json.importQueue?.status === "SUCCESS") return row;
        check(row.config_json.importQueue?.status !== "FAILED", "WORKER_FAILED");
        await delay(100);
      }
      throw new SampleVerificationError("WORKER_COMPLETION_TIMEOUT");
    }
    async function importPass(label, context = parsed.context) {
      const batches = await Promise.all(
        [...groups].map(async ([platformCode, selectedRows]) => {
          const created = await validation.persist({
            context,
            platformCode,
            rows: selectedRows,
            sourceName: "phase2-local-sample",
          });
          const receipt = await enqueueProductImport(database, producer, created.batchPublicId);
          return { ...created, receipt, platformCode, rows: selectedRows };
        }),
      );
      const summary = [];
      for (const batch of batches) {
        const result = await waitBatch(batch.batchPublicId);
        check(result.config_json.pipelineTracking?.completed === true, "PIPELINE_INCOMPLETE");
        const items = await select(
          "SELECT * FROM app.import_item WHERE import_batch_id=$1 ORDER BY input_row_no",
          [result.id],
        );
        check(items.length === batch.rows.length, "ITEM_COUNT_MISMATCH");
        for (const item of items) {
          const row = batch.rows.find((r) => r.sourceRowNumber === item.input_row_no);
          assert.deepEqual(item.raw_json.raw, row.outcome === "MAPPED" ? row.input.raw : row.raw);
          assert.deepEqual(item.raw_json.context, context);
          check(item.raw_json.sourceLocator === row.sourceLocator, "SOURCE_LOCATOR_CHANGED");
          check(Boolean(item.raw_json.pipelineTracking), "TRACKING_MISSING");
          if (row.outcome === "MAPPED") {
            check(item.status === "REVIEW_REQUIRED", "UNKNOWN_BRAND_NOT_REVIEWED");
            assert.deepEqual(item.raw_json.mappedInput, row.input);
            check(
              item.raw_json.masterCreation?.input.brand.status === "UNRESOLVED",
              "UNAPPROVED_BRAND_RESOLVED",
            );
            check(
              item.raw_json.imageRegistration?.result.action === "REGISTERED",
              "IMAGE_STAGE_MISSING",
            );
            const source = (
              await select("SELECT * FROM app.source_product WHERE id=$1", [item.source_product_id])
            )[0];
            assert.deepEqual(source.raw_json, row.input.raw);
            check(
              source.external_product_id === row.input.externalProductId,
              "EXTERNAL_ID_CHANGED",
            );
            check(source.product_id === null, "UNSUPPORTED_MASTER_CREATED");
            const images = await select(
              "SELECT * FROM app.product_image WHERE source_product_id=$1",
              [source.id],
            );
            const urls = [
              ...(row.input.images ?? []).map((i) => i.sourceUrl),
              ...(row.input.options ?? []).filter((o) => o.imageUrl).map((o) => o.imageUrl),
            ];
            assert.deepEqual(images.map((i) => i.source_url).sort(), urls.sort());
            check(
              images.every(
                (i) =>
                  i.process_status === "REGISTERED" &&
                  i.storage_provider === null &&
                  i.metadata_json.stage === "P2-11/v1",
              ),
              "IMAGE_METADATA_CHANGED",
            );
          } else {
            check(
              item.status === "FAILED" &&
                item.error_code === "MISSING_EXTERNAL_PRODUCT_ID" &&
                item.source_product_id === null,
              "INVALID_ROW_PERSISTED",
            );
          }
        }
        const counts = tally(items, "status");
        check(
          result.failed_count === (counts.FAILED ?? 0) &&
            result.review_count === (counts.REVIEW_REQUIRED ?? 0) &&
            result.success_count === 0 &&
            result.skipped_count === 0,
          "BATCH_AGGREGATE_MISMATCH",
        );
        const detail = await api.app.inject(`/api/v1/import-batches/${batch.batchPublicId}`);
        check(
          detail.statusCode === 200 && detail.json().items.length === items.length,
          "IMPORT_API_TRACE_FAILED",
        );
        check(
          !detail.body.includes('"raw_json"') && !detail.body.includes('"providerId"'),
          "IMPORT_API_LEAK",
        );
        assert.deepEqual(
          await enqueueProductImport(database, producer, batch.batchPublicId),
          batch.receipt,
        );
        summary.push({
          platform: batch.platformCode,
          status: result.status,
          total: result.total_count,
          review: result.review_count,
          failed: result.failed_count,
          pipelineCompleted: true,
          queueStatus: result.config_json.importQueue.status,
        });
      }
      evidence.push({ label, collectedAt: context.collectedAt, batches: summary });
    }
    checkpoint = "first_import";
    await importPass("first");
    const before = await domainSnapshot();
    check(
      before.sources.length === 16 && before.images.length === expectedImages,
      "DOMAIN_COUNTS_MISMATCH",
    );
    check(
      before.masters.length === 0 && before.skus.length === 0 && before.sourceSkus.length === 0,
      "UNSUPPORTED_RELATION_CREATED",
    );
    const frozen = await originalItems();
    checkpoint = "reimport";
    await importPass("reimport");
    assert.deepEqual(await domainSnapshot(), before);
    const after = await originalItems();
    assert.deepEqual(
      after.filter((item) => frozen.some((v) => v.public_id === item.public_id)),
      frozen,
    );
    checkpoint = "concurrent_reimport";
    await Promise.all([importPass("concurrent-A"), importPass("concurrent-B")]);
    assert.deepEqual(await domainSnapshot(), before);
    const concurrentItems = await originalItems();
    checkpoint = "later_collection_reimport";
    const later = await new XlsxImportAdapter().parse({
      workbook,
      sourceFileName: basename(inputPath),
      collectedAt: new Date().toISOString(),
    });
    check(later.context.collectedAt > parsed.context.collectedAt, "COLLECTION_TIME_NOT_ADVANCED");
    assert.deepEqual(
      later.rows.filter((row) => sampleRows.includes(row.sourceRowNumber)),
      parsed.rows.filter((row) => sampleRows.includes(row.sourceRowNumber)),
    );
    await importPass("later-collection", later.context);
    const laterSnapshot = await domainSnapshot();
    check(
      laterSnapshot.sources.every(
        (source) =>
          source.collected_at.toISOString() === later.context.collectedAt &&
          source.last_seen_at.toISOString() === later.context.collectedAt,
      ),
      "SOURCE_FRESHNESS_NOT_UPDATED",
    );
    const stableSnapshot = (snapshot) => ({
      ...snapshot,
      sources: snapshot.sources.map((source) => ({
        ...source,
        collected_at: null,
        last_seen_at: null,
      })),
    });
    assert.deepEqual(stableSnapshot(laterSnapshot), stableSnapshot(before));
    const finalItems = await originalItems();
    check(finalItems.length === rows.length * 5, "APPEND_ONLY_HISTORY_COUNT");
    assert.deepEqual(
      finalItems.filter((item) => concurrentItems.some((v) => v.public_id === item.public_id)),
      concurrentItems,
    );
    assert.deepEqual(
      finalItems.filter((item) => after.some((v) => v.public_id === item.public_id)),
      after,
    );
    const aliases = await select("SELECT count(*)::int AS n FROM app.brand_alias");
    const brands = await select("SELECT count(*)::int AS n FROM app.brand");
    check(aliases[0].n === 0 && brands[0].n === 0, "BRAND_AUTO_CREATION");
    let cursor;
    const reviews = [];
    do {
      const response = await api.app.inject(
        `/api/v1/brand-reviews?decision=PENDING&limit=10${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`,
      );
      check(response.statusCode === 200, "BRAND_REVIEW_API_FAILED");
      reviews.push(...response.json().items);
      cursor = response.json().nextCursor;
      check(reviews.length <= 100, "BRAND_REVIEW_CURSOR_LOOP");
    } while (cursor);
    check(
      reviews.length === accepted.length * 5 &&
        new Set(reviews.map((r) => r.publicId)).size === reviews.length,
      "BRAND_REVIEW_TRACE_MISMATCH",
    );
    const products = await api.app.inject("/api/v1/products");
    check(
      products.statusCode === 200 && products.json().items.length === 0,
      "PHANTOM_MASTER_API_RESULT",
    );
    checkpoint = "file_integrity";
    check(sha256(await readFile(inputPath)) === digest, "SOURCE_FILE_CHANGED");
    const postgresVersion = (await select("SHOW server_version"))[0].server_version;
    return {
      version: "phase2-sample/v1",
      verifiedAt: new Date().toISOString(),
      postgresVersion,
      sourceSha256: digest,
      sourceBytes: workbook.length,
      inventory: parsed.summary,
      sourceRows: sampleRows,
      context: parsed.context,
      mapped: accepted.length,
      rejected: rejected.length,
      explicitIdentifiers: accepted.reduce((n, r) => n + (r.input.identifiers?.length ?? 0), 0),
      evidence,
      counts: {
        sourceProducts: before.sources.length,
        sourceImages: before.images.length,
        masters: before.masters.length,
        skus: before.skus.length,
        sourceSkus: before.sourceSkus.length,
        importBatches: evidence.length * groups.size,
        importItems: finalItems.length,
        brandReviews: reviews.length,
      },
      checks: {
        inputUnchanged: true,
        rawPreserved: true,
        imageMetadataPreserved: true,
        stableDomainPublicIds: true,
        reimportIdempotent: true,
        concurrentReimportIdempotent: true,
        laterCollectionIdempotent: true,
        priorItemsUnchanged: true,
        repeatedEnqueueIdempotent: true,
        aggregatesCorrect: true,
        unknownBrandsNotCreated: true,
        apiTrace: true,
      },
      limitations: [
        "Representative 20 rows only; full XLSX inventory is mapping-only",
        "No supplied approved brands/product identifiers; positive MASTER/SKU links require separate evidence",
        "Image metadata only; no image download or object storage write",
      ],
    };
  } finally {
    for (const worker of workers) await worker.stop();
    await api?.close();
    await producer?.stop();
    await database?.close();
    await fixture.cleanup();
  }
}

try {
  console.log(JSON.stringify(await main(), null, 2));
} catch (error) {
  // Assertions/driver errors can contain private row values. Only our fixed codes are safe.
  console.error(
    JSON.stringify({
      result: "FAIL",
      checkpoint,
      code: error instanceof SampleVerificationError ? error.message : "VERIFICATION_FAILED",
    }),
  );
  process.exitCode = 1;
}
