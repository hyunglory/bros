import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import { createProductMatcher } from "../../packages/importer/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

test(
  "P2-08 discovers a verified existing MASTER without changing product links",
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

    const brandRow = await database.db
      .insertInto("app.brand")
      .values({ brand_key: "NIKE_MATCHER_FIXTURE", name_en: "Nike" })
      .returning(["id", "public_id as publicId"])
      .executeTakeFirstOrThrow();
    const masterRow = await database.db
      .insertInto("app.product_master")
      .values({
        brand_id: brandRow.id,
        created_method: "IMPORT_MATCHER_FIXTURE",
        product_name: "Nike Air Max 90 White",
        product_name_norm: "nike air max 90 white",
      })
      .returning(["id", "public_id as publicId"])
      .executeTakeFirstOrThrow();
    const identifierRow = await database.db
      .insertInto("app.product_identifier")
      .values({
        evidence_type: "FIXTURE",
        identifier_norm: "8801234567890",
        identifier_type: "EAN",
        identifier_value: "8801234567890",
        is_verified: true,
        product_id: masterRow.id,
      })
      .returning("public_id as publicId")
      .executeTakeFirstOrThrow();
    await database.db
      .insertInto("app.product_sku")
      .values({
        option_key: "white / 270",
        product_id: masterRow.id,
        sku_name: "White / 270",
      })
      .execute();

    const beforeLinks = await database.db
      .selectFrom("app.source_product")
      .select(({ fn }) => fn.countAll().as("count"))
      .executeTakeFirstOrThrow();
    const result = await createProductMatcher(database).match({
      brand: {
        aliasName: "Nike",
        aliasScope: "GLOBAL",
        brand: {
          brandKey: "NIKE_MATCHER_FIXTURE",
          nameEn: "Nike",
          nameKo: null,
          publicId: brandRow.publicId,
        },
        normalizedName: "nike",
        status: "RESOLVED",
      },
      identifiers: {
        candidates: [
          {
            normalizedValue: "8801234567890",
            provenance: [{ kind: "RAW_JSON", path: "/detail/gtin" }],
            type: "GTIN",
            value: "8801234567890",
          },
        ],
        truncated: false,
      },
      optionNames: [{ rawOptionName: "White / 270" }],
      productName: "Nike Air Max 90 White",
    });

    assert.equal(result.outcome, "MATCH_EXISTING");
    assert.equal(result.selectedMasterPublicId, masterRow.publicId);
    assert.equal(result.candidates[0].masterPublicId, masterRow.publicId);
    assert.equal(
      result.candidates[0].evidence.find((evidence) => evidence.type === "VERIFIED_GTIN_EXACT")
        .masterIdentifierPublicId,
      identifierRow.publicId,
    );
    assert.deepEqual(result.candidates[0].conflicts, []);

    const afterLinks = await database.db
      .selectFrom("app.source_product")
      .select(({ fn }) => fn.countAll().as("count"))
      .executeTakeFirstOrThrow();
    assert.equal(afterLinks.count, beforeLinks.count);
  },
);
