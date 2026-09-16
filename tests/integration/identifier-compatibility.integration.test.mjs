import { compatibleIdentityLockKeys } from "../../packages/contracts/dist/server.js";
import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { compatibleIdentifierNorm } from "../../packages/contracts/dist/index.js";
import { loadConfig } from "../../packages/core/dist/index.js";
import {
  compatibleStoredIdentifierNorm,
  createDatabaseClient,
} from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import {
  createImportValidationService,
  createSourceProductUpsertService,
  createMasterService,
  masterIdentityLockKeys,
  normalizeIdentifierValue,
} from "../../packages/importer/dist/index.js";
import {
  createIdentifierPromotionService,
  createInternalCatalogProvider,
  createResolveRunService,
} from "../../packages/resolver/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

test(
  "BLK-006 legacy/P3 comparison and lock bridge on PostgreSQL",
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
    const platform = await db
      .selectFrom("app.platform")
      .select("id")
      .where("code", "=", "MUSINSA")
      .executeTakeFirstOrThrow();
    const brand = await db
      .insertInto("app.brand")
      .values({ brand_key: "COMPAT", name_en: "Compat" })
      .returningAll()
      .executeTakeFirstOrThrow();
    await db
      .insertInto("app.brand_alias")
      .values({ brand_id: brand.id, alias_name: "Compat", alias_norm: "compat" })
      .execute();
    let sequence = 0;
    async function master(name = "Compatible shoe") {
      return db
        .insertInto("app.product_master")
        .values({
          brand_id: brand.id,
          product_name: name,
          product_name_norm: name.toLowerCase(),
          created_method: "FIXTURE",
          status: "ACTIVE",
          identifier_status: "VERIFIED",
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    async function identifier(product, norm, verified = true) {
      return db
        .insertInto("app.product_identifier")
        .values({
          product_id: product.id,
          identifier_type: "MODEL_NO",
          identifier_value: norm,
          identifier_norm: norm,
          is_verified: verified,
          evidence_type: "FIXTURE",
          evidence_json: JSON.stringify({ legacy: norm }),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    async function run(product, value) {
      const number = ++sequence;
      const source = await db
        .insertInto("app.source_product")
        .values({
          platform_id: platform.id,
          product_id: product.id,
          external_product_id: `compat-source-${number}`,
          raw_product_name: "Compatible shoe",
          raw_brand_name: "Compat",
          raw_json: JSON.stringify({ modelNo: value }),
          collected_at: new Date("2026-09-15T00:00:00Z"),
          last_seen_at: new Date("2026-09-15T00:00:00Z"),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const runs = createResolveRunService(database);
      const created = await runs.create({
        sourceProductPublicId: source.public_id,
        resolverVersion: "compat-test/v1",
      });
      await runs.start(created.publicId);
      await runs.succeed(created.publicId, [
        {
          identifierType: "MODEL_NO",
          candidateValue: value,
          candidateNorm: compatibleIdentifierNorm("MODEL_NO", value),
          confidenceScore: "91.00",
          rankNo: 1,
          evidence: [{ type: "SOURCE_FIELD", value }],
          conflicts: [],
        },
      ]);
      return (await runs.get(created.publicId)).candidates[0];
    }
    async function imported(value, name = "Compatible shoe") {
      const number = ++sequence;
      const batch = await createImportValidationService(database).persist({
        platformCode: "MUSINSA",
        sourceName: "compat-fixture",
        context: { collectedAt: "2026-09-15T00:00:00Z" },
        rows: [
          {
            outcome: "MAPPED",
            issues: [],
            sourceLocator: `compat!A${number}`,
            sourceRowNumber: number,
            input: {
              platformCode: "MUSINSA",
              externalProductId: `compat-import-${number}`,
              productName: name,
              brandName: "Compat",
              raw: { modelNo: value },
            },
          },
        ],
      });
      await createSourceProductUpsertService(database).process(batch.batchPublicId);
      const item = await db
        .selectFrom("app.import_item")
        .selectAll()
        .where(
          "import_batch_id",
          "=",
          (
            await db
              .selectFrom("app.import_batch")
              .select("id")
              .where("public_id", "=", batch.batchPublicId)
              .executeTakeFirstOrThrow()
          ).id,
        )
        .executeTakeFirstOrThrow();
      return item.public_id;
    }
    const approve = (candidate) =>
      createIdentifierPromotionService(database).promoteManual({
        candidatePublicId: candidate.publicId,
        actor: "reviewer",
        expectedVersionNo: 1,
      });

    await t.test(
      "P2 spelling differs; only supported code separators share a comparison key",
      async () => {
        assert.equal(normalizeIdentifierValue("AB-123"), "AB-123");
        assert.equal(compatibleIdentifierNorm("MODEL_NO", "AB-123"), "AB123");
        assert.equal(compatibleIdentifierNorm("MODEL_NO", "AB123"), "AB123");
        assert.notEqual(compatibleIdentifierNorm("MODEL_NO", "AB/123"), "AB123");
        assert.notEqual(compatibleIdentifierNorm("BRAND_CODE", "AB-123"), "AB123");
        assert.notEqual(compatibleIdentifierNorm("BARCODE", "AB-123"), "AB123");
        const p2 = masterIdentityLockKeys([{ type: "MODEL_NO", normalizedValue: "AB-123" }]);
        const p3 = compatibleIdentityLockKeys([{ type: "MODEL_NO", normalizedValue: "AB123" }]);
        assert.ok(p2.some((key) => p3.includes(key)));
        assert.deepEqual(
          p2,
          [...p2].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0)),
        );
        for (const original of [
          "AB-123",
          "AB_123",
          "AB 123",
          "ＡＢ－１２３",
          "AB–123",
          "AB/123",
          "AB.123",
          "ABß123",
        ]) {
          const p2Norm = normalizeIdentifierValue(original);
          const sqlKey = await fixture.client.query(
            "SELECT CASE WHEN $1::text in ('MODEL_NO','STYLE_CODE','PRODUCT_NO','MPN','GTIN','EAN','UPC') THEN upper(regexp_replace(normalize($2::text,NFKC), '[[:space:]_‐‑‒–—−-]', '', 'g')) ELSE $2::text END AS key",
            ["MODEL_NO", p2Norm],
          );
          assert.equal(
            sqlKey.rows[0].key,
            compatibleIdentifierNorm("MODEL_NO", original),
            original,
          );
        }
      },
    );

    await t.test(
      "verified legacy row is found by P3 catalog and blocks a different MASTER approval",
      async () => {
        const legacy = await master();
        await identifier(legacy, "AB-123");
        const catalog = await createInternalCatalogProvider(database).search({
          kind: "IDENTIFIER",
          identifierType: "MODEL_NO",
          identifierNorm: "AB123",
        });
        assert.equal(catalog.outcome, "EXACT");
        assert.equal(catalog.matches[0].productPublicId, legacy.public_id);
        const other = await master("Other shoe");
        const candidate = await run(other, "AB123");
        const before = await db.selectFrom("app.product_identifier").selectAll().execute();
        await assert.rejects(() => approve(candidate), { code: "IDENTIFIER_CONFLICT" });
        assert.deepEqual(
          await db.selectFrom("app.product_identifier").selectAll().execute(),
          before,
        );
      },
    );

    await t.test("P2 import reuses a P3 code row and preserves the target MASTER", async () => {
      const target = await master("Imported shoe");
      await identifier(target, "P3CODE1");
      const itemId = await imported("P3-CODE-1", "Imported shoe");
      const result = await createMasterService(database).process(itemId);
      assert.equal(result.action, "MATCHED");
      assert.equal(result.masterPublicId, target.public_id);
      assert.equal(
        (
          await db
            .selectFrom("app.product_master")
            .selectAll()
            .where("product_name", "=", "Imported shoe")
            .execute()
        ).length,
        1,
      );
    });

    await t.test(
      "existing legacy row on the target MASTER is updated without a second alias row",
      async () => {
        const target = await master("Upgrade shoe");
        const old = await identifier(target, "UP-123", false);
        const candidate = await run(target, "UP123");
        await approve(candidate);
        const rows = await db
          .selectFrom("app.product_identifier")
          .selectAll()
          .where("product_id", "=", target.id)
          .execute();
        assert.equal(rows.length, 1);
        assert.equal(rows[0].public_id, old.public_id);
        assert.equal(rows[0].is_verified, true);
        assert.deepEqual(rows[0].evidence_json.previous.evidence, old.evidence_json);
      },
    );

    await t.test(
      "P2 legacy lock wait and commit make P3 approval observe the new competing row",
      async () => {
        const left = await master("Wait shoe");
        const right = await master("Competing shoe");
        const candidate = await run(left, "WA-123");
        const blocker = await fixture.client.connect();
        const p2Keys = masterIdentityLockKeys([{ type: "MODEL_NO", normalizedValue: "WA-123" }]);
        const p3Keys = compatibleIdentityLockKeys([{ type: "MODEL_NO", normalizedValue: "WA123" }]);
        const shared = p2Keys.find((key) => p3Keys.includes(key));
        assert.ok(shared);
        let pending;
        try {
          await blocker.query("BEGIN");
          await blocker.query("SELECT pg_advisory_xact_lock($1::bigint)", [shared]);
          pending = approve(candidate).then(
            (value) => ({ value }),
            (error) => ({ error }),
          );
          for (let attempt = 0; attempt < 200; attempt++) {
            const waiters = await fixture.client.query(
              "SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())",
            );
            if (waiters.rowCount > 0) break;
            if (attempt === 199) assert.fail("P3 did not wait on the legacy/canonical shared key");
            await delay(10);
          }
          await blocker.query(
            "INSERT INTO app.product_identifier(product_id,identifier_type,identifier_value,identifier_norm,evidence_type) VALUES ($1,'MODEL_NO','WA-123','WA-123','FIXTURE')",
            [right.id],
          );
          await blocker.query("COMMIT");
          assert.equal((await pending).error.code, "IDENTIFIER_CONFLICT");
        } finally {
          await blocker.query("ROLLBACK");
          blocker.release();
          await pending;
        }
      },
    );

    await t.test(
      "actual concurrent P2 import/P3 approval leaves one semantic identifier across MASTERs",
      async () => {
        const target = await master("Race shoe");
        const candidate = await run(target, "ZX-123");
        const itemId = await imported("ZX-123", "Separate running product");
        const race = await Promise.allSettled([
          createMasterService(database).process(itemId),
          approve(candidate),
        ]);
        const rows = await db
          .selectFrom("app.product_identifier")
          .selectAll()
          .where("identifier_type", "=", "MODEL_NO")
          .execute();
        const semantic = rows.filter(
          (row) => compatibleIdentifierNorm("MODEL_NO", row.identifier_norm) === "ZX123",
        );
        assert.equal(semantic.length, 1);
        if (race[1].status === "rejected") {
          assert.equal(race[1].reason.code, "IDENTIFIER_CONFLICT");
          assert.equal(race[0].status, "fulfilled");
          assert.equal(race[0].value.action, "CREATED");
        } else {
          assert.equal(race[0].status, "fulfilled");
          assert.equal(race[0].value.action, "MATCHED");
          assert.equal(race[0].value.masterPublicId, target.public_id);
        }
      },
    );

    await t.test(
      "different legacy spellings across MASTERs remain ambiguous for catalog lookup",
      async () => {
        const left = await master("Alias left");
        const right = await master("Alias right");
        await identifier(left, "AL-123");
        await identifier(right, "AL123");
        const result = await createInternalCatalogProvider(database).search({
          kind: "IDENTIFIER",
          identifierType: "MODEL_NO",
          identifierNorm: "AL123",
        });
        assert.equal(result.outcome, "AMBIGUOUS");
        assert.equal(result.matches.length, 2);
      },
    );

    await t.test(
      "migration supplies a non-unique expression index without rewriting legacy rows",
      async () => {
        const result = await fixture.client.query(
          "SELECT indexname FROM pg_indexes WHERE schemaname='app' AND indexname='product_identifier_compat_lookup_idx'",
        );
        assert.equal(result.rowCount, 1);
        assert.equal(
          (
            await db
              .selectFrom("app.product_identifier")
              .selectAll()
              .where("identifier_norm", "=", "AB-123")
              .execute()
          ).length,
          1,
        );
      },
    );
    await t.test("invalid legacy GTIN retains its exact P2 key", async () => {
      const product = await master("Invalid legacy code");
      const row = await db
        .insertInto("app.product_identifier")
        .values({
          product_id: product.id,
          identifier_type: "GTIN",
          identifier_value: "GTIN-INVALID",
          identifier_norm: "GTIN-INVALID",
          evidence_type: "FIXTURE",
        })
        .returning("id")
        .executeTakeFirstOrThrow();
      const found = await db
        .selectFrom("app.product_identifier")
        .select(compatibleStoredIdentifierNorm("app.product_identifier").as("comparison"))
        .where("id", "=", row.id)
        .executeTakeFirstOrThrow();
      assert.equal(found.comparison, "GTIN-INVALID");
      assert.equal(compatibleIdentifierNorm("GTIN", "GTIN-INVALID"), undefined);
    });
  },
);
