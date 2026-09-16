import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import {
  createBrandNormalizer,
  createImportValidationService,
  createSourceProductUpsertService,
  createMasterService,
  masterIdentityLockKeys,
} from "../../packages/importer/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

test("P2-09 atomic creation, replay, review and identity races", { timeout: 60_000 }, async (t) => {
  const fixture = await createDatabaseFixture();
  let database;
  t.after(async () => {
    await database?.close();
    await fixture.cleanup();
  });
  await migrateToLatest(fixture.db);
  database = createDatabaseClient(loadConfig({ DATABASE_URL: fixture.connectionString }).database, {
    applicationName: "bros-test",
  });
  const db = database.db;
  const validation = createImportValidationService(database);
  const upsert = createSourceProductUpsertService(database);
  const service = createMasterService(database);
  let sequence = 0;
  async function brand() {
    const name = `FixtureBrand${++sequence}`;
    const row = await db
      .insertInto("app.brand")
      .values({ brand_key: name, name_en: name })
      .returning(["id", "public_id"])
      .executeTakeFirstOrThrow();
    await db
      .insertInto("app.brand_alias")
      .values({ brand_id: row.id, alias_name: name, alias_norm: name.toLowerCase() })
      .execute();
    return name;
  }
  async function imported(brandName, overrides = {}) {
    const input = {
      platformCode: "MUSINSA",
      externalProductId: `source-${++sequence}`,
      productName: "Fixture Runner",
      brandName,
      raw: { modelNo: "MODEL-A" },
      ...overrides,
    };
    const batch = await validation.persist({
      platformCode: input.platformCode,
      sourceName: "synthetic-fixture",
      context: { collectedAt: "2026-09-14T00:00:00Z" },
      rows: [
        { outcome: "MAPPED", input, issues: [], sourceRowNumber: 1, sourceLocator: "fixture!A1" },
      ],
    });
    await upsert.process(batch.batchPublicId);
    const item = await db
      .selectFrom("app.import_item")
      .innerJoin("app.import_batch", "app.import_batch.id", "app.import_item.import_batch_id")
      .select(["app.import_item.public_id", "source_product_id", "app.import_item.id"])
      .where("app.import_batch.public_id", "=", batch.batchPublicId)
      .executeTakeFirstOrThrow();
    return { ...item, batchPublicId: batch.batchPublicId, input };
  }
  async function masterCount() {
    return (
      await db
        .selectFrom("app.product_master")
        .select(({ fn }) => fn.countAll().as("n"))
        .executeTakeFirstOrThrow()
    ).n;
  }

  await t.test(
    "parallel batches and GTIN labels converge; identifiers remain unverified; item replay is stable",
    async () => {
      const name = await brand();
      const items = await Promise.all(
        ["GTIN", "EAN", "UPC", "GTIN"].map((type) =>
          imported(name, { identifiers: [{ type, value: "012345678905" }], raw: {} }),
        ),
      );
      const before = Number(await masterCount());
      const results = await Promise.all(items.map((item) => service.process(item.public_id)));
      assert.equal(results.filter((r) => r.action === "CREATED").length, 1);
      assert.equal(results.filter((r) => r.action === "MATCHED").length, 3);
      assert.equal(new Set(results.map((r) => r.masterPublicId)).size, 1);
      assert.equal(Number(await masterCount()), before + 1);
      assert.deepEqual(await service.process(items[0].public_id), results[0]);
      const ids = await db.selectFrom("app.product_identifier").selectAll().execute();
      assert.equal(ids.length, 1);
      assert.equal(ids[0].is_verified, false);
      assert.equal(ids[0].evidence_json.stage, "P2-09/v1");
      const item = await db
        .selectFrom("app.import_item")
        .select("raw_json")
        .where("id", "=", items[0].id)
        .executeTakeFirstOrThrow();
      assert.deepEqual(item.raw_json.mappedInput, items[0].input);
      assert.ok(item.raw_json.masterCreation.input.identifiers.candidates[0].provenance.length);
    },
  );

  await t.test("same item concurrent calls replay one committed result", async () => {
    const item = await imported(await brand(), { raw: { modelNo: "REPLAY-MODEL" } });
    const before = Number(await masterCount());
    const results = await Promise.all(
      Array.from({ length: 4 }, () => service.process(item.public_id)),
    );
    results.forEach((result) => assert.deepEqual(result, results[0]));
    assert.equal(Number(await masterCount()), before + 1);
  });

  await t.test(
    "overlapping identifiers in opposite orders acquire locks consistently",
    async () => {
      const name = await brand();
      const identifiers = [
        { type: "MODEL_NO", value: "ORDERED-MODEL" },
        { type: "MPN", value: "ORDERED-PART" },
      ];
      const items = await Promise.all([
        imported(name, { identifiers, raw: {} }),
        imported(name, { identifiers: [...identifiers].reverse(), raw: {} }),
      ]);
      const results = await Promise.all(items.map((item) => service.process(item.public_id)));
      assert.deepEqual(results.map((r) => r.action).sort(), ["CREATED", "MATCHED"]);
      assert.equal(results[0].masterPublicId, results[1].masterPublicId);
    },
  );

  await t.test(
    "existing source link is preserved when an otherwise valid match points elsewhere",
    async () => {
      const name = await brand();
      const first = await imported(name, { raw: { modelNo: "LINKED-MODEL" } });
      const created = await service.process(first.public_id);
      const item = await imported(name, { raw: { modelNo: "LINKED-MODEL" } });
      const other = await db
        .insertInto("app.product_master")
        .values({
          product_name: "Other",
          product_name_norm: "other",
          created_method: "FIXTURE",
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      await db
        .updateTable("app.source_product")
        .set({ product_id: other.id, match_status: "MATCHED" })
        .where("id", "=", item.source_product_id)
        .execute();
      const result = await service.process(item.public_id);
      assert.equal(result.reason, "EXISTING_LINK_CONFLICT");
      assert.notEqual(result.masterPublicId, created.masterPublicId);
      const source = await db
        .selectFrom("app.source_product")
        .select(["product_id", "match_status"])
        .where("id", "=", item.source_product_id)
        .executeTakeFirstOrThrow();
      assert.deepEqual(source, { product_id: other.id, match_status: "REVIEW_REQUIRED" });
    },
  );

  await t.test(
    "equal-time exports with different explicit identifiers are review-only",
    async () => {
      const name = await brand();
      const first = await imported(name, {
        externalProductId: "equal-time-source",
        raw: {},
        identifiers: [{ type: "MPN", value: "FIRST" }],
      });
      const second = await imported(name, {
        externalProductId: "equal-time-source",
        raw: {},
        identifiers: [{ type: "MPN", value: "SECOND" }],
      });
      const before = await masterCount();
      const results = await Promise.all(
        [first, second].map((item) => service.process(item.public_id)),
      );
      results.forEach((r) => assert.equal(r.reason, "SOURCE_IDENTITY_AMBIGUOUS"));
      assert.equal(await masterCount(), before);
    },
  );

  await t.test(
    "similar titles without identifiers remain review and update batch aggregates",
    async () => {
      const name = await brand();
      const items = await Promise.all([imported(name, { raw: {} }), imported(name, { raw: {} })]);
      const before = await masterCount();
      const results = await Promise.all(items.map((item) => service.process(item.public_id)));
      results.forEach((r) => assert.equal(r.action, "REVIEW_REQUIRED"));
      assert.equal(await masterCount(), before);
      for (const item of items) {
        const batch = await db
          .selectFrom("app.import_batch")
          .selectAll()
          .where("public_id", "=", item.batchPublicId)
          .executeTakeFirstOrThrow();
        assert.equal(batch.status, "SUCCEEDED");
        assert.equal(batch.review_count, 1);
        assert.equal(batch.success_count, 0);
        assert.equal(
          batch.total_count,
          batch.review_count + batch.success_count + batch.failed_count + batch.skipped_count,
        );
        const source = await db
          .selectFrom("app.source_product")
          .selectAll()
          .where("id", "=", item.source_product_id)
          .executeTakeFirstOrThrow();
        assert.equal(source.match_status, "REVIEW_REQUIRED");
        assert.equal(source.product_id, null);
      }
    },
  );

  await t.test(
    "different variants before SKU mapping and conflicting brands do not merge",
    async () => {
      const name = await brand();
      const first = await imported(name, {
        raw: { modelNo: "VARIANT-MODEL" },
        options: [{ rawOptionName: "White", sourceOrder: 0, raw: {} }],
      });
      assert.equal((await service.process(first.public_id)).action, "CREATED");
      const second = await imported(name, {
        raw: { modelNo: "VARIANT-MODEL" },
        options: [{ rawOptionName: "Black", sourceOrder: 0, raw: {} }],
      });
      assert.equal((await service.process(second.public_id)).reason, "HARD_CONFLICT");
      const third = await imported(await brand(), { raw: { modelNo: "VARIANT-MODEL" } });
      assert.equal((await service.process(third.public_id)).action, "REVIEW_REQUIRED");
    },
  );

  await t.test(
    "ambiguous masters, truncated extraction and multi-value source identity cannot create or link",
    async () => {
      const name = await brand();
      const resolved = await createBrandNormalizer(database).normalize({
        platformCode: "MUSINSA",
        rawBrandName: name,
      });
      const brandRow = await db
        .selectFrom("app.brand")
        .select("id")
        .where("public_id", "=", resolved.brand.publicId)
        .executeTakeFirstOrThrow();
      for (let i = 0; i < 2; i++) {
        const row = await db
          .insertInto("app.product_master")
          .values({
            brand_id: brandRow.id,
            product_name: "Duplicate",
            product_name_norm: "duplicate",
            created_method: "FIXTURE",
          })
          .returning("id")
          .executeTakeFirstOrThrow();
        await db
          .insertInto("app.product_identifier")
          .values({
            product_id: row.id,
            identifier_type: "MODEL_NO",
            identifier_value: "AMBIGUOUS",
            identifier_norm: "AMBIGUOUS",
            evidence_type: "FIXTURE",
            is_verified: true,
          })
          .execute();
      }
      const ambiguous = await imported(name, { raw: { modelNo: "AMBIGUOUS" } });
      assert.equal((await service.process(ambiguous.public_id)).reason, "AMBIGUOUS_STRONG_MATCH");
      let nested = {};
      for (let i = 0; i < 18; i++) nested = { nested };
      const truncated = await imported(name, { raw: { modelNo: "AMBIGUOUS", nested } });
      assert.equal(
        (await service.process(truncated.public_id)).reason,
        "IDENTIFIER_EXTRACTION_TRUNCATED",
      );
      const multiple = await imported(await brand(), { raw: { gtin: ["100", "200"] } });
      assert.equal((await service.process(multiple.public_id)).reason, "AMBIGUOUS_SOURCE_IDENTITY");
    },
  );

  await t.test(
    "old or changed source snapshot is skipped without overwriting a newer link",
    async () => {
      const item = await imported(await brand(), { raw: { modelNo: "STALE-MODEL" } });
      await db
        .updateTable("app.source_product")
        .set({ raw_product_name: "newer title", collected_at: "2026-09-15T00:00:00Z" })
        .where("id", "=", item.source_product_id)
        .execute();
      assert.equal((await service.process(item.public_id)).action, "SKIPPED");
      const source = await db
        .selectFrom("app.source_product")
        .select(["raw_product_name", "match_status"])
        .where("id", "=", item.source_product_id)
        .executeTakeFirstOrThrow();
      assert.deepEqual(source, { raw_product_name: "newer title", match_status: "UNMATCHED" });
    },
  );

  await t.test(
    "failure after MASTER insertion rolls back all writes and allows retry",
    async () => {
      const item = await imported(await brand(), { raw: { modelNo: "ROLLBACK-MODEL" } });
      const before = await masterCount();
      await fixture.client.query(
        `CREATE FUNCTION app.fail_master_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture-private-marker' USING ERRCODE = '23514'; END $$`,
      );
      await fixture.client.query(
        `CREATE TRIGGER fail_master_item BEFORE UPDATE ON app.import_item FOR EACH ROW EXECUTE FUNCTION app.fail_master_item()`,
      );
      try {
        await assert.rejects(
          service.process(item.public_id),
          (error) =>
            error.code === "MASTER_PERSISTENCE_FAILED" &&
            !error.message.includes("fixture-private-marker"),
        );
        assert.equal(await masterCount(), before);
        const source = await db
          .selectFrom("app.source_product")
          .select("product_id")
          .where("id", "=", item.source_product_id)
          .executeTakeFirstOrThrow();
        assert.equal(source.product_id, null);
      } finally {
        await fixture.client.query("DROP TRIGGER fail_master_item ON app.import_item");
        await fixture.client.query("DROP FUNCTION app.fail_master_item()");
      }
      assert.equal((await service.process(item.public_id)).action, "CREATED");
    },
  );

  await t.test(
    "lock exhaustion is bounded, rolls back, and the same item can be retried",
    async () => {
      const item = await imported(await brand(), { raw: { modelNo: "BLOCKED-MODEL" } });
      const key = masterIdentityLockKeys([
        { type: "MODEL_NO", normalizedValue: "BLOCKED-MODEL" },
      ])[0];
      const blocker = await fixture.client.connect();
      await blocker.query("BEGIN");
      await blocker.query("SELECT pg_advisory_xact_lock($1::bigint)", [key]);
      const before = await masterCount();
      try {
        await assert.rejects(
          createMasterService(database, { lockTimeoutMs: 60, maxAttempts: 2 }).process(
            item.public_id,
          ),
          { code: "MASTER_LOCK_RETRY_EXHAUSTED" },
        );
        assert.equal(await masterCount(), before);
        const saved = await db
          .selectFrom("app.import_item")
          .select("raw_json")
          .where("id", "=", item.id)
          .executeTakeFirstOrThrow();
        assert.equal(saved.raw_json.masterCreation, undefined);
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
      }
      assert.equal((await service.process(item.public_id)).action, "CREATED");
    },
  );

  await t.test(
    "automatic retry takes a fresh snapshot after an observed lock timeout",
    async () => {
      const item = await imported(await brand(), { raw: { modelNo: "RETRY-MODEL" } });
      const key = masterIdentityLockKeys([{ type: "MODEL_NO", normalizedValue: "RETRY-MODEL" }])[0];
      const blocker = await fixture.client.connect();
      await blocker.query("BEGIN");
      await blocker.query("SELECT pg_advisory_xact_lock($1::bigint)", [key]);
      const running = createMasterService(database, { lockTimeoutMs: 200, maxAttempts: 5 }).process(
        item.public_id,
      );
      void running.catch(() => undefined);
      const transactions = new Set();
      try {
        const deadline = Date.now() + 3_000;
        while (transactions.size < 2 && Date.now() < deadline) {
          const rows = await fixture.client.query(
            "SELECT xact_start::text AS started FROM pg_stat_activity WHERE application_name = 'bros-test' AND wait_event = 'advisory'",
          );
          rows.rows.forEach((row) => transactions.add(row.started));
          if (transactions.size < 2) await delay(10);
        }
        assert.equal(
          transactions.size,
          2,
          "observed separate transactions waiting for the identity lock",
        );
      } finally {
        await blocker.query("ROLLBACK");
        blocker.release();
      }
      assert.equal((await running).action, "CREATED");
    },
  );
});
