import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import {
  createImageRegistrar,
  createImportValidationService,
  createMasterService,
  createSkuMapper,
  createSourceProductUpsertService,
} from "../../packages/importer/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

test(
  "P2-11 registers immutable source image revisions without generating images",
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
    const skuMapper = createSkuMapper(database);
    const registrar = createImageRegistrar(database);
    const brand = await db
      .insertInto("app.brand")
      .values({ brand_key: "image-fixture", name_en: "ImageFixture" })
      .returning("id")
      .executeTakeFirstOrThrow();
    await db
      .insertInto("app.brand_alias")
      .values({ brand_id: brand.id, alias_name: "ImageFixture", alias_norm: "imagefixture" })
      .execute();

    async function imported({
      externalProductId,
      collectedAt,
      identifier = externalProductId,
      identifiers = identifier === null ? [] : [{ type: "MODEL_NO", value: identifier }],
      images = [],
      options = [],
      productName = externalProductId,
      raw = identifier === null ? {} : { modelNo: identifier },
    }) {
      const input = {
        platformCode: "MUSINSA",
        externalProductId,
        productName,
        brandName: "ImageFixture",
        identifiers,
        images,
        options,
        raw,
      };
      const batch = await validation.persist({
        platformCode: "MUSINSA",
        sourceName: "synthetic-image-fixture",
        context: { collectedAt },
        rows: [
          { outcome: "MAPPED", input, issues: [], sourceLocator: "fixture!A1", sourceRowNumber: 1 },
        ],
      });
      await upsert.process(batch.batchPublicId);
      const item = await db
        .selectFrom("app.import_item")
        .innerJoin("app.import_batch", "app.import_batch.id", "app.import_item.import_batch_id")
        .select(["app.import_item.public_id", "app.import_item.source_product_id"])
        .where("app.import_batch.public_id", "=", batch.batchPublicId)
        .executeTakeFirstOrThrow();
      const masterResult = await master.process(item.public_id);
      if (
        options.length > 0 &&
        (masterResult.action === "CREATED" || masterResult.action === "MATCHED")
      ) {
        await skuMapper.process(item.public_id);
      }
      return { input, item, masterResult };
    }

    const baseImages = [
      {
        imageType: "MAIN",
        sourceOrder: 0,
        sourceUrl: "https://cdn.example/main-v1.jpg",
        raw: { column: "M" },
      },
      {
        imageType: "DETAIL",
        sourceOrder: 0,
        sourceUrl: "https://cdn.example/detail.jpg",
        raw: { column: "N" },
      },
    ];
    const baseOptions = [
      {
        rawOptionName: "Black",
        sourceOrder: 0,
        imageUrl: "https://cdn.example/black.jpg",
        raw: { column: "K", position: 0 },
      },
    ];

    await t.test("registers product and SKU image metadata and replays the same item", async () => {
      const { item } = await imported({
        externalProductId: "image-main",
        collectedAt: "2026-09-14T01:00:00Z",
        images: baseImages,
        options: baseOptions,
        productName: "ALPHA-COAT",
      });
      const first = await registrar.process(item.public_id);
      assert.equal(first.action, "REGISTERED");
      assert.equal(first.createdCount, 3);
      assert.equal(first.reusedCount, 0);
      assert.deepEqual(await registrar.process(item.public_id), first);
      const rows = await db
        .selectFrom("app.product_image")
        .selectAll()
        .where("source_product_id", "=", item.source_product_id)
        .orderBy("metadata_json", "asc")
        .execute();
      assert.equal(rows.length, 3);
      assert.ok(rows.every((row) => row.process_status === "REGISTERED"));
      assert.ok(
        rows.every(
          (row) =>
            row.storage_provider === null && row.object_key === null && row.content_hash === null,
        ),
      );
      const optionImage = rows.find((row) => row.metadata_json.scope === "OPTION");
      assert.ok(optionImage?.sku_id);
      assert.equal(optionImage.product_id, rows[0].product_id);
      assert.deepEqual(optionImage.metadata_json.raw, { column: "K", position: 0 });
    });

    await t.test(
      "same URL is reused and a changed slot URL creates the next immutable revision",
      async () => {
        const same = await imported({
          externalProductId: "image-main",
          collectedAt: "2026-09-14T01:01:00Z",
          images: baseImages,
          options: baseOptions,
          productName: "ALPHA-COAT",
        });
        const reused = await registrar.process(same.item.public_id);
        assert.equal(reused.createdCount, 0);
        assert.equal(reused.reusedCount, 3);
        const changed = await imported({
          externalProductId: "image-main",
          collectedAt: "2026-09-14T01:02:00Z",
          images: [
            { ...baseImages[0], sourceUrl: "https://cdn.example/main-v2.jpg" },
            baseImages[1],
          ],
          options: baseOptions,
          productName: "ALPHA-COAT",
        });
        const revised = await registrar.process(changed.item.public_id);
        assert.equal(revised.createdCount, 1);
        assert.equal(revised.reusedCount, 2);
        const mains = await db
          .selectFrom("app.product_image")
          .select(["source_url", "source_revision"])
          .where("source_product_id", "=", changed.item.source_product_id)
          .where("image_type", "=", "SOURCE_MAIN")
          .orderBy("source_revision")
          .execute();
        assert.deepEqual(mains, [
          { source_url: "https://cdn.example/main-v1.jpg", source_revision: 1 },
          { source_url: "https://cdn.example/main-v2.jpg", source_revision: 2 },
        ]);
      },
    );

    await t.test("one shared URL can retain two option occurrences and SKU owners", async () => {
      const sharedUrl = "https://cdn.example/shared-option.jpg";
      const { item } = await imported({
        externalProductId: "shared-option-images",
        collectedAt: "2026-09-14T01:03:00Z",
        options: [
          { rawOptionName: "Black", sourceOrder: 0, imageUrl: sharedUrl, raw: {} },
          { rawOptionName: "White", sourceOrder: 1, imageUrl: sharedUrl, raw: {} },
        ],
        productName: "ZEBRA-SHOE",
      });
      const result = await registrar.process(item.public_id);
      assert.equal(result.createdCount, 2);
      const rows = await db
        .selectFrom("app.product_image")
        .select(["sku_id", "source_revision", "metadata_json"])
        .where("source_product_id", "=", item.source_product_id)
        .orderBy("source_revision")
        .execute();
      assert.deepEqual(
        rows.map((row) => row.source_revision),
        [1, 2],
      );
      assert.equal(new Set(rows.map((row) => row.sku_id)).size, 2);
      assert.equal(new Set(rows.map((row) => row.metadata_json.occurrenceKey)).size, 2);
    });

    await t.test(
      "unmatched source images register without product ownership and can be enriched later",
      async () => {
        const first = await imported({
          externalProductId: "unmatched-image-source",
          collectedAt: "2026-09-14T01:04:00Z",
          identifier: null,
          images: [
            {
              imageType: "MAIN",
              sourceOrder: 0,
              sourceUrl: "https://cdn.example/unmatched.jpg",
              raw: {},
            },
          ],
          productName: "QUARTZ-BAG",
        });
        assert.equal(first.masterResult.action, "REVIEW_REQUIRED");
        const registered = await registrar.process(first.item.public_id);
        assert.equal(registered.createdCount, 1);
        let row = await db
          .selectFrom("app.product_image")
          .selectAll()
          .where("source_product_id", "=", first.item.source_product_id)
          .executeTakeFirstOrThrow();
        assert.equal(row.product_id, null);
        const second = await imported({
          externalProductId: "unmatched-image-source",
          collectedAt: "2026-09-14T01:05:00Z",
          identifier: "NEW-IMAGE-IDENTITY",
          images: [
            {
              imageType: "MAIN",
              sourceOrder: 0,
              sourceUrl: "https://cdn.example/unmatched.jpg",
              raw: {},
            },
          ],
          productName: "QUARTZ-BAG",
        });
        assert.equal(second.masterResult.action, "CREATED");
        const enriched = await registrar.process(second.item.public_id);
        assert.equal(enriched.createdCount, 0);
        assert.equal(enriched.imagePublicIds[0], registered.imagePublicIds[0]);
        row = await db
          .selectFrom("app.product_image")
          .selectAll()
          .where("public_id", "=", registered.imagePublicIds[0])
          .executeTakeFirstOrThrow();
        assert.ok(row.product_id);
      },
    );

    await t.test(
      "missing images skip and equal-time conflicting snapshots write no image",
      async () => {
        const missing = await imported({
          externalProductId: "missing-images",
          collectedAt: "2026-09-14T01:06:00Z",
          productName: "VIOLET-HAT",
        });
        assert.equal((await registrar.process(missing.item.public_id)).reason, "NO_SOURCE_IMAGES");
        const first = await imported({
          externalProductId: "ambiguous-images",
          collectedAt: "2026-09-14T01:07:00Z",
          images: [
            { imageType: "MAIN", sourceOrder: 0, sourceUrl: "https://cdn.example/a.jpg", raw: {} },
          ],
          productName: "COPPER-WATCH",
        });
        const second = await imported({
          externalProductId: "ambiguous-images",
          collectedAt: "2026-09-14T01:07:00Z",
          images: [
            { imageType: "MAIN", sourceOrder: 0, sourceUrl: "https://cdn.example/b.jpg", raw: {} },
          ],
          productName: "COPPER-WATCH",
        });
        const before = await db
          .selectFrom("app.product_image")
          .select(({ fn }) => fn.countAll().as("n"))
          .executeTakeFirstOrThrow();
        for (const candidate of [first, second]) {
          const result = await registrar.process(candidate.item.public_id);
          assert.equal(result.reason, "SOURCE_IMAGE_SNAPSHOT_AMBIGUOUS");
        }
        const after = await db
          .selectFrom("app.product_image")
          .select(({ fn }) => fn.countAll().as("n"))
          .executeTakeFirstOrThrow();
        assert.equal(after.n, before.n);
      },
    );

    await t.test("concurrent repeated imports converge on one source image", async () => {
      const request = {
        externalProductId: "concurrent-image",
        collectedAt: "2026-09-14T01:08:00Z",
        images: [
          {
            imageType: "MAIN",
            sourceOrder: 0,
            sourceUrl: "https://cdn.example/concurrent.jpg",
            raw: {},
          },
        ],
        productName: "SILVER-RING",
      };
      const first = await imported(request);
      const second = await imported(request);
      const results = await Promise.all([
        registrar.process(first.item.public_id),
        registrar.process(second.item.public_id),
      ]);
      assert.equal(
        results.reduce((count, result) => count + result.createdCount, 0),
        1,
      );
      assert.equal(new Set(results.flatMap((result) => result.imagePublicIds)).size, 1);
      const rows = await db
        .selectFrom("app.product_image")
        .selectAll()
        .where("source_product_id", "=", first.item.source_product_id)
        .execute();
      assert.equal(rows.length, 1);
    });

    await t.test("a registration failure rolls back every image and permits replay", async () => {
      const { item } = await imported({
        externalProductId: "rollback-image",
        collectedAt: "2026-09-14T01:09:00Z",
        images: [
          {
            imageType: "MAIN",
            sourceOrder: 0,
            sourceUrl: "https://cdn.example/fail.jpg",
            raw: {},
          },
          {
            imageType: "DETAIL",
            sourceOrder: 0,
            sourceUrl: "https://cdn.example/before-fail.jpg",
            raw: {},
          },
        ],
        productName: "GOLD-BELT",
      });
      await fixture.client.query(
        `CREATE FUNCTION app.fail_source_image() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.source_url = 'https://cdn.example/fail.jpg' THEN RAISE EXCEPTION 'fixture-private-marker' USING ERRCODE = '23514'; END IF; RETURN NEW; END $$`,
      );
      await fixture.client.query(
        `CREATE TRIGGER fail_source_image BEFORE INSERT ON app.product_image FOR EACH ROW EXECUTE FUNCTION app.fail_source_image()`,
      );
      try {
        await assert.rejects(
          registrar.process(item.public_id),
          (error) =>
            error.code === "IMAGE_PERSISTENCE_FAILED" &&
            !error.message.includes("fixture-private-marker"),
        );
        const rows = await db
          .selectFrom("app.product_image")
          .selectAll()
          .where("source_product_id", "=", item.source_product_id)
          .execute();
        assert.equal(rows.length, 0);
        const saved = await db
          .selectFrom("app.import_item")
          .select("raw_json")
          .where("public_id", "=", item.public_id)
          .executeTakeFirstOrThrow();
        assert.equal(saved.raw_json.imageRegistration, undefined);
      } finally {
        await fixture.client.query("DROP TRIGGER fail_source_image ON app.product_image");
        await fixture.client.query("DROP FUNCTION app.fail_source_image()");
      }
      assert.equal((await registrar.process(item.public_id)).createdCount, 2);
    });
  },
);
