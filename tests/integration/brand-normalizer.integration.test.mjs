import assert from "node:assert/strict";
import test from "node:test";
import { createBrandNormalizer } from "../../packages/importer/dist/index.js";
import { loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

async function insertBrand(db, { brandKey, nameEn, nameKo, isActive = true }) {
  return db
    .insertInto("app.brand")
    .values({
      brand_key: brandKey,
      is_active: isActive,
      name_en: nameEn ?? null,
      name_ko: nameKo ?? null,
    })
    .returning(["id", "public_id as publicId"])
    .executeTakeFirstOrThrow();
}

test(
  "P2-05 resolves approved aliases with platform precedence and leaves unknown brands unresolved",
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
    const normalizer = createBrandNormalizer(database);
    const oliveYoung = await database.db
      .selectFrom("app.platform")
      .select("id")
      .where("code", "=", "OLIVEYOUNG")
      .executeTakeFirstOrThrow();
    const nike = await insertBrand(database.db, {
      brandKey: "NIKE",
      nameEn: "Nike",
      nameKo: "나이키",
    });
    const platformNike = await insertBrand(database.db, {
      brandKey: "NIKE_PLATFORM_FIXTURE",
      nameEn: "Nike Platform Fixture",
    });
    const inactive = await insertBrand(database.db, {
      brandKey: "INACTIVE_FIXTURE",
      nameEn: "Inactive Fixture",
      isActive: false,
    });
    await database.db
      .insertInto("app.brand_alias")
      .values([
        { alias_name: "NIKE", alias_norm: "nike", brand_id: nike.id },
        { alias_name: "나이키", alias_norm: "나이키", brand_id: nike.id },
        {
          alias_name: "Nike",
          alias_norm: "nike",
          brand_id: platformNike.id,
          platform_id: oliveYoung.id,
        },
        { alias_name: "Retired", alias_norm: "retired", brand_id: inactive.id },
      ])
      .execute();

    const platformMatch = await normalizer.normalize({
      platformCode: "OLIVEYOUNG",
      rawBrandName: "  nike  ",
    });
    assert.deepEqual(platformMatch, {
      aliasName: "Nike",
      aliasScope: "PLATFORM",
      brand: {
        brandKey: "NIKE_PLATFORM_FIXTURE",
        nameEn: "Nike Platform Fixture",
        nameKo: null,
        publicId: platformNike.publicId,
      },
      normalizedName: "nike",
      status: "RESOLVED",
    });

    const globalMatch = await normalizer.normalize({
      platformCode: "MUSINSA",
      rawBrandName: "나이키",
    });
    assert.equal(globalMatch.status, "RESOLVED");
    assert.equal(globalMatch.aliasScope, "GLOBAL");
    assert.equal(globalMatch.brand.publicId, nike.publicId);

    const before = await database.db
      .selectFrom("app.brand")
      .select(({ fn }) => fn.countAll().as("count"))
      .executeTakeFirstOrThrow();
    assert.deepEqual(
      await normalizer.normalize({ platformCode: "MUSINSA", rawBrandName: "Unknown Brand" }),
      {
        normalizedName: "unknown brand",
        reason: "UNKNOWN_ALIAS",
        status: "UNRESOLVED",
      },
    );
    assert.deepEqual(await normalizer.normalize({ platformCode: "MUSINSA", rawBrandName: "  " }), {
      normalizedName: undefined,
      reason: "MISSING_BRAND_NAME",
      status: "UNRESOLVED",
    });
    assert.deepEqual(
      await normalizer.normalize({ platformCode: "MISSING", rawBrandName: "Nike" }),
      {
        normalizedName: "nike",
        reason: "UNKNOWN_PLATFORM",
        status: "UNRESOLVED",
      },
    );
    assert.deepEqual(
      await normalizer.normalize({ platformCode: "MUSINSA", rawBrandName: "Retired" }),
      {
        normalizedName: "retired",
        reason: "UNKNOWN_ALIAS",
        status: "UNRESOLVED",
      },
    );
    const after = await database.db
      .selectFrom("app.brand")
      .select(({ fn }) => fn.countAll().as("count"))
      .executeTakeFirstOrThrow();
    assert.equal(after.count, before.count);
  },
);
