import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import {
  createInternalCatalogProvider,
  InternalCatalogProviderError,
} from "../../packages/resolver/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

test(
  "P3-04 reuses verified internal catalog candidates without mutation",
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
    const provider = createInternalCatalogProvider(database);

    async function brand(key, active = true) {
      return db
        .insertInto("app.brand")
        .values({ brand_key: key, name_en: key, is_active: active })
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    async function master({
      brandId,
      name,
      norm,
      status = "ACTIVE",
      identifierStatus = "VERIFIED",
    }) {
      return db
        .insertInto("app.product_master")
        .values({
          brand_id: brandId,
          product_name: name,
          product_name_norm: norm,
          created_method: "FIXTURE",
          status,
          identifier_status: identifierStatus,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    async function identifier({
      productId,
      type = "MODEL_NO",
      value,
      norm,
      verified = true,
      skuId = null,
    }) {
      return db
        .insertInto("app.product_identifier")
        .values({
          product_id: productId,
          sku_id: skuId,
          identifier_type: type,
          identifier_value: value,
          identifier_norm: norm,
          is_verified: verified,
          evidence_type: "FIXTURE",
          evidence_json: JSON.stringify({ source: "fixture" }),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    async function sku({ productId, key, status = "ACTIVE" }) {
      return db
        .insertInto("app.product_sku")
        .values({ product_id: productId, sku_name: key, option_key: key, status })
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    const verifiedBrand = await brand("catalog-brand");
    const secondBrand = await brand("second-brand");
    const inactiveBrand = await brand("inactive-brand", false);
    const exactMaster = await master({
      brandId: verifiedBrand.id,
      name: "Exact shoe",
      norm: "exact shoe",
    });
    const exactSku = await sku({ productId: exactMaster.id, key: "red" });
    await identifier({
      productId: exactMaster.id,
      skuId: exactSku.id,
      value: "EXACT-1",
      norm: "EXACT1",
    });
    const ambiguousLeft = await master({
      brandId: verifiedBrand.id,
      name: "Ambiguous left",
      norm: "ambiguous",
    });
    const ambiguousRight = await master({
      brandId: secondBrand.id,
      name: "Ambiguous right",
      norm: "ambiguous",
    });
    await identifier({ productId: ambiguousLeft.id, value: "AMB-1", norm: "AMB1" });
    await identifier({ productId: ambiguousRight.id, value: "AMB-1", norm: "AMB1" });
    const variantLeft = await master({
      brandId: verifiedBrand.id,
      name: "Variant shoe",
      norm: "variant shoe",
    });
    const variantRight = await master({
      brandId: verifiedBrand.id,
      name: "Variant shoe",
      norm: "variant shoe",
    });
    await sku({ productId: variantLeft.id, key: "blue" });
    await sku({ productId: variantRight.id, key: "green" });
    const unverified = await master({
      brandId: verifiedBrand.id,
      name: "Unverified",
      norm: "unverified",
    });
    await identifier({ productId: unverified.id, value: "NO-1", norm: "NO1", verified: false });
    const review = await master({
      brandId: verifiedBrand.id,
      name: "Review",
      norm: "review",
      identifierStatus: "REVIEW_REQUIRED",
    });
    await identifier({ productId: review.id, value: "NO-2", norm: "NO2" });
    const inactive = await master({
      brandId: verifiedBrand.id,
      name: "Inactive",
      norm: "inactive",
      status: "INACTIVE",
    });
    await identifier({ productId: inactive.id, value: "NO-3", norm: "NO3" });
    const hidden = await master({ brandId: inactiveBrand.id, name: "Hidden", norm: "hidden" });
    await identifier({ productId: hidden.id, value: "NO-4", norm: "NO4" });

    await t.test(
      "exact verified identifier returns only the active verified master and its SKU",
      async () => {
        const before = await db
          .selectFrom("app.product_identifier")
          .select((builder) => builder.fn.countAll().as("count"))
          .executeTakeFirstOrThrow();
        const result = await provider.search({
          kind: "IDENTIFIER",
          identifierType: "MODEL_NO",
          identifierNorm: "EXACT1",
        });
        assert.equal(result.outcome, "EXACT");
        assert.equal(result.truncated, false);
        assert.deepEqual(result.matches, [
          {
            brandKey: "catalog-brand",
            productName: "Exact shoe",
            productPublicId: exactMaster.public_id,
            matchedSkuPublicIds: [exactSku.public_id],
            matchedIdentifier: { type: "MODEL_NO", value: "EXACT-1", norm: "EXACT1" },
          },
        ]);
        assert.equal(Object.isFrozen(result), true);
        assert.equal(Object.isFrozen(result.matches), true);
        assert.equal("decisionStatus" in result.matches[0], false);
        const after = await db
          .selectFrom("app.product_identifier")
          .select((builder) => builder.fn.countAll().as("count"))
          .executeTakeFirstOrThrow();
        assert.deepEqual(after, before);
      },
    );

    await t.test("same exact identifier across verified masters is AMBIGUOUS", async () => {
      const result = await provider.search({
        kind: "IDENTIFIER",
        identifierType: "MODEL_NO",
        identifierNorm: "AMB1",
      });
      assert.equal(result.outcome, "AMBIGUOUS");
      assert.equal(result.matches.length, 2);
      assert.deepEqual(result.matches.map((match) => match.productName).sort(), [
        "Ambiguous left",
        "Ambiguous right",
      ]);
    });

    await t.test(
      "brand/name/variant lookup is exact-only and preserves variant specificity",
      async () => {
        const nameOnly = await provider.search({
          kind: "BRAND_NAME_VARIANT",
          brandKey: "catalog-brand",
          productNameNorm: "variant shoe",
        });
        assert.equal(nameOnly.outcome, "AMBIGUOUS");
        assert.equal(nameOnly.matches.length, 2);
        const blue = await provider.search({
          kind: "BRAND_NAME_VARIANT",
          brandKey: "catalog-brand",
          productNameNorm: "variant shoe",
          optionKey: "blue",
        });
        assert.equal(blue.outcome, "EXACT");
        assert.deepEqual(blue.matches[0].matchedSkuPublicIds.length, 1);
        assert.equal(blue.matches[0].productPublicId, variantLeft.public_id);
        const wrongBrand = await provider.search({
          kind: "BRAND_NAME_VARIANT",
          brandKey: "catalog-brand",
          productNameNorm: "variant-shoe",
          optionKey: "blue",
        });
        assert.equal(wrongBrand.outcome, "MISS");
      },
    );

    await t.test(
      "unverified, review, inactive, inactive-brand, type mismatch, and missing catalog are misses",
      async () => {
        for (const query of [
          { kind: "IDENTIFIER", identifierType: "MODEL_NO", identifierNorm: "NO1" },
          { kind: "IDENTIFIER", identifierType: "MODEL_NO", identifierNorm: "NO2" },
          { kind: "IDENTIFIER", identifierType: "MODEL_NO", identifierNorm: "NO3" },
          { kind: "IDENTIFIER", identifierType: "MODEL_NO", identifierNorm: "NO4" },
          { kind: "IDENTIFIER", identifierType: "GTIN", identifierNorm: "EXACT1" },
          { kind: "IDENTIFIER", identifierType: "MODEL_NO", identifierNorm: "UNKNOWN" },
          { kind: "BRAND_NAME_VARIANT", brandKey: "catalog-brand", productNameNorm: "missing" },
        ]) {
          const result = await provider.search(query);
          assert.equal(result.outcome, "MISS");
          assert.deepEqual(result.matches, []);
        }
      },
    );

    await t.test("invalid query rejects before any catalog lookup", async () => {
      for (const query of [
        null,
        {},
        { kind: "IDENTIFIER", identifierType: "MODEL_NO", identifierNorm: " " },
        {
          kind: "BRAND_NAME_VARIANT",
          brandKey: "catalog-brand",
          productNameNorm: "x",
          optionKey: " ",
        },
        { kind: "IDENTIFIER", identifierType: "MODEL_NO", identifierNorm: "X", extra: true },
      ]) {
        await assert.rejects(
          () => provider.search(query),
          (error) =>
            error instanceof InternalCatalogProviderError && error.code === "INVALID_CATALOG_QUERY",
        );
      }
    });
  },
);
