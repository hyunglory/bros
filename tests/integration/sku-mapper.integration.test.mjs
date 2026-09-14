import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import {
  createImportValidationService,
  createMasterService,
  createSkuMapper,
  createSourceProductUpsertService,
} from "../../packages/importer/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

test(
  "P2-10 maps deterministic SKUs, preserves source evidence, and rejects unsafe merges",
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
      { applicationName: "bros-test" },
    );
    const db = database.db;
    const validation = createImportValidationService(database);
    const upsert = createSourceProductUpsertService(database);
    const master = createMasterService(database);
    const mapper = createSkuMapper(database);
    const brand = await db
      .insertInto("app.brand")
      .values({ brand_key: "sku-fixture", name_en: "SkuFixture" })
      .returning(["id"])
      .executeTakeFirstOrThrow();
    await db
      .insertInto("app.brand_alias")
      .values({ brand_id: brand.id, alias_name: "SkuFixture", alias_norm: "skufixture" })
      .execute();
    const fixtureMaster = await db
      .insertInto("app.product_master")
      .values({
        product_name: "Fixture Mapper Master",
        product_name_norm: "fixture mapper master",
        created_method: "FIXTURE",
      })
      .returning("id")
      .executeTakeFirstOrThrow();

    async function imported({
      externalProductId = "sku-source",
      collectedAt,
      options,
      identifier = externalProductId,
      identifiers = [{ type: "MODEL_NO", value: identifier }],
      raw,
    }) {
      const input = {
        platformCode: "MUSINSA",
        externalProductId,
        productName: "SKU Fixture Runner",
        brandName: "SkuFixture",
        currencyCode: "KRW",
        identifiers,
        options,
        raw: raw ?? { modelNo: identifier },
      };
      const batch = await validation.persist({
        platformCode: "MUSINSA",
        sourceName: "synthetic-sku-fixture",
        context: { collectedAt },
        rows: [
          { outcome: "MAPPED", input, issues: [], sourceRowNumber: 1, sourceLocator: "fixture!A1" },
        ],
      });
      await upsert.process(batch.batchPublicId);
      const item = await db
        .selectFrom("app.import_item")
        .innerJoin("app.import_batch", "app.import_batch.id", "app.import_item.import_batch_id")
        .select(["app.import_item.public_id", "app.import_item.source_product_id"])
        .where("app.import_batch.public_id", "=", batch.batchPublicId)
        .executeTakeFirstOrThrow();
      const persistedBatch = await db
        .selectFrom("app.import_batch")
        .select("status")
        .where("public_id", "=", batch.batchPublicId)
        .executeTakeFirstOrThrow();
      const persistedItem = await db
        .selectFrom("app.import_item")
        .select(["status", "error_code"])
        .where("public_id", "=", item.public_id)
        .executeTakeFirstOrThrow();
      assert.ok(
        persistedBatch.status === "SUCCEEDED" || persistedBatch.status === "PARTIAL_FAILED",
        `source batch status: ${persistedBatch.status}, item: ${JSON.stringify(persistedItem)}`,
      );
      await master.process(item.public_id);
      return item;
    }

    await t.test("re-import keeps SKU ownership while source facts update", async () => {
      const first = await imported({
        collectedAt: "2026-09-14T00:00:00Z",
        options: [
          {
            rawOptionName: "Black / 270",
            sourceOrder: 0,
            externalSkuId: "black-270",
            currentPrice: "10000",
            stockStatus: "IN_STOCK",
            raw: { source: "first" },
          },
          {
            rawOptionName: "White / 270",
            sourceOrder: 1,
            externalSkuId: "white-270",
            currentPrice: "11000",
            stockStatus: "OUT_OF_STOCK",
            raw: { source: "first" },
          },
        ],
      });
      const created = await mapper.process(first.public_id);
      assert.equal(created.action, "MAPPED");
      assert.equal(created.mappedCount, 2);
      assert.deepEqual(await mapper.process(first.public_id), created);
      const originalSkus = await db
        .selectFrom("app.product_sku")
        .select(["public_id", "option_key", "sku_name", "status"])
        .orderBy("option_key")
        .execute();
      assert.equal(originalSkus.length, 2);
      assert.ok(originalSkus.every((sku) => sku.status === "REVIEW_REQUIRED"));

      const again = await imported({
        collectedAt: "2026-09-14T00:01:00Z",
        identifier: "sku-source",
        options: [
          {
            rawOptionName: "black\u00a0/ 270",
            sourceOrder: 1,
            externalSkuId: "black-270",
            currentPrice: "12000",
            stockStatus: "OUT_OF_STOCK",
            raw: { source: "second" },
          },
          {
            rawOptionName: "White / 270",
            sourceOrder: 0,
            externalSkuId: "white-270",
            currentPrice: "11000",
            stockStatus: "IN_STOCK",
            raw: { source: "second" },
          },
        ],
      });
      const remapped = await mapper.process(again.public_id);
      assert.equal(remapped.action, "MAPPED");
      assert.deepEqual([...remapped.skuPublicIds].sort(), [...created.skuPublicIds].sort());
      const skus = await db.selectFrom("app.product_sku").selectAll().execute();
      assert.equal(skus.length, 2);
      const sourceSkus = await db
        .selectFrom("app.source_sku")
        .selectAll()
        .orderBy("option_key")
        .execute();
      assert.equal(sourceSkus.length, 2);
      assert.equal(sourceSkus[0].current_price, "12000.0000");
      assert.equal(sourceSkus[0].raw_json.option.raw.source, "second");
      assert.equal(sourceSkus[0].option_json.normalizedOptionName, "black / 270");
    });

    await t.test("normalization collision is review-only with no partial SKU writes", async () => {
      const item = await imported({
        externalProductId: "normalization-collision",
        collectedAt: "2026-09-14T00:02:00Z",
        options: [
          { rawOptionName: "Black", sourceOrder: 0, raw: {} },
          { rawOptionName: "black", sourceOrder: 1, raw: {} },
        ],
        raw: { modelNo: "normalization-collision" },
      });
      await db
        .updateTable("app.source_product")
        .set({ product_id: fixtureMaster.id, match_status: "MATCHED" })
        .where("id", "=", item.source_product_id)
        .execute();
      const before = await db
        .selectFrom("app.product_sku")
        .select(({ fn }) => fn.countAll().as("n"))
        .executeTakeFirstOrThrow();
      const mapped = await mapper.process(item.public_id);
      assert.equal(mapped.action, "REVIEW_REQUIRED");
      assert.equal(mapped.reason, "DUPLICATE_NORMALIZED_OPTION");
      const after = await db
        .selectFrom("app.product_sku")
        .select(({ fn }) => fn.countAll().as("n"))
        .executeTakeFirstOrThrow();
      assert.equal(after.n, before.n);
    });

    await t.test("existing source link conflict is preflighted before any SKU write", async () => {
      const item = await imported({
        externalProductId: "link-conflict",
        collectedAt: "2026-09-14T00:03:00Z",
        options: [
          { rawOptionName: "First", sourceOrder: 0, raw: {} },
          { rawOptionName: "Conflicting", sourceOrder: 1, raw: {} },
        ],
      });
      await db
        .updateTable("app.source_product")
        .set({ product_id: fixtureMaster.id, match_status: "MATCHED" })
        .where("id", "=", item.source_product_id)
        .execute();
      const otherMaster = await db
        .insertInto("app.product_master")
        .values({
          product_name: "Other SKU Owner",
          product_name_norm: "other sku owner",
          created_method: "FIXTURE",
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      const otherSku = await db
        .insertInto("app.product_sku")
        .values({
          product_id: otherMaster.id,
          sku_name: "Conflicting",
          option_key: "v1:conflicting",
          option_json: {},
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await db
        .insertInto("app.source_sku")
        .values({
          source_product_id: item.source_product_id,
          sku_id: otherSku.id,
          raw_option_name: "Conflicting",
          option_key: "v1:conflicting",
          option_json: {},
          raw_json: {},
        })
        .execute();
      const before = await db
        .selectFrom("app.product_sku")
        .select(({ fn }) => fn.countAll().as("n"))
        .executeTakeFirstOrThrow();
      const mapped = await mapper.process(item.public_id);
      assert.equal(mapped.reason, "SOURCE_SKU_LINK_CONFLICT");
      const after = await db
        .selectFrom("app.product_sku")
        .select(({ fn }) => fn.countAll().as("n"))
        .executeTakeFirstOrThrow();
      assert.equal(after.n, before.n);
    });

    await t.test("unlinked MASTER and empty options are safe skips", async () => {
      const unlinked = await imported({
        externalProductId: "unlinked-source",
        collectedAt: "2026-09-14T00:03:00Z",
        options: [{ rawOptionName: "Black", sourceOrder: 0, raw: {} }],
        raw: {},
        identifiers: [],
      });
      assert.equal((await mapper.process(unlinked.public_id)).reason, "MASTER_NOT_LINKED");
      const empty = await imported({
        externalProductId: "empty-options",
        collectedAt: "2026-09-14T00:04:00Z",
        options: [],
        raw: { modelNo: "empty-options" },
      });
      await db
        .updateTable("app.source_product")
        .set({ product_id: fixtureMaster.id, match_status: "MATCHED" })
        .where("id", "=", empty.source_product_id)
        .execute();
      assert.equal((await mapper.process(empty.public_id)).reason, "NO_SOURCE_OPTIONS");
    });
  },
);
