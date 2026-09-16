import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import { masterIdentityLockKeys } from "../../packages/importer/dist/index.js";
import {
  createIdentifierPromotionService,
  createResolveRunService,
  IdentifierPromotionError,
} from "../../packages/resolver/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

test(
  "P3-11 durable approval, scope isolation, concurrency and atomic rollback",
  { timeout: 90_000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    let database;
    t.after(async () => {
      await database?.close();
      await fixture.cleanup();
    });
    await migrateToLatest(fixture.db);
    const connect = () =>
      createDatabaseClient(loadConfig({ DATABASE_URL: fixture.connectionString }).database, {
        applicationName: "bros-test",
      });
    database = connect();
    let db = database.db;
    let service = createIdentifierPromotionService(database);
    let sequence = 0;
    const platform = await db
      .selectFrom("app.platform")
      .select("id")
      .where("code", "=", "MUSINSA")
      .executeTakeFirstOrThrow();
    const brand = await db
      .insertInto("app.brand")
      .values({ brand_key: "promotion", name_en: "Promotion" })
      .returning("id")
      .executeTakeFirstOrThrow();
    const request = (item, actor = "reviewer") => ({
      actor,
      candidatePublicId: item.candidate.publicId,
      expectedVersionNo: 1,
    });
    const rejects = (input, code) =>
      assert.rejects(
        () => service.promoteManual(input),
        (error) => error instanceof IdentifierPromotionError && error.code === code,
      );
    async function seed(options = {}) {
      const number = ++sequence;
      const product =
        options.product ??
        (await db
          .insertInto("app.product_master")
          .values({
            brand_id: brand.id,
            product_name: `Product ${number}`,
            product_name_norm: `product ${number}`,
            created_method: "FIXTURE",
            status: "ACTIVE",
          })
          .returningAll()
          .executeTakeFirstOrThrow());
      const source = await db
        .insertInto("app.source_product")
        .values({
          platform_id: platform.id,
          external_product_id: `promotion-${number}`,
          product_id: options.unlinked ? null : product.id,
          raw_product_name: `Source ${number}`,
          raw_brand_name: "Promotion",
          product_url: "https://example.com/product",
          raw_json: JSON.stringify({ modelNo: `PROMO-${number}` }),
          collected_at: new Date("2026-09-15T00:00:00Z"),
          last_seen_at: new Date("2026-09-15T00:00:00Z"),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const runs = createResolveRunService(database);
      const run = await runs.create({
        sourceProductPublicId: source.public_id,
        resolverVersion: "promotion-test/v1",
      });
      await runs.start(run.publicId);
      const input = {
        identifierType: options.type ?? "MODEL_NO",
        candidateValue: options.value ?? `PROMO-${number}`,
        candidateNorm: options.norm ?? `PROMO${number}`,
        confidenceScore: "91.25",
        rankNo: 1,
        evidence: [
          { type: "SOURCE_FIELD", path: "/modelNo", value: options.value ?? `PROMO-${number}` },
        ],
        conflicts: [],
      };
      await runs.succeed(run.publicId, [input]);
      const candidate = (await runs.get(run.publicId)).candidates[0];
      return { product, source, run, candidate, input };
    }
    async function identifier(item, options = {}) {
      return db
        .insertInto("app.product_identifier")
        .values({
          product_id: item.product.id,
          sku_id: options.skuId ?? null,
          identifier_type: options.type ?? item.input.identifierType,
          identifier_value: options.value ?? item.input.candidateValue,
          identifier_norm: options.norm ?? item.input.candidateNorm,
          is_primary: options.primary ?? true,
          is_verified: false,
          evidence_type: "FIXTURE",
          evidence_json: JSON.stringify({ original: "preserve" }),
          source_url: "https://example.com/original",
        })
        .returningAll()
        .executeTakeFirstOrThrow();
    }
    async function state() {
      return {
        identifiers: await db
          .selectFrom("app.product_identifier")
          .selectAll()
          .orderBy("id")
          .execute(),
        candidates: await db
          .selectFrom("app.identifier_candidate")
          .selectAll()
          .orderBy("id")
          .execute(),
        masters: await db.selectFrom("app.product_master").selectAll().orderBy("id").execute(),
        runs: await db.selectFrom("app.identifier_resolve_run").selectAll().orderBy("id").execute(),
        sources: await db.selectFrom("app.source_product").selectAll().orderBy("id").execute(),
      };
    }
    async function unchangedFailure(item, code) {
      const before = await state();
      await rejects(request(item), code);
      assert.deepEqual(await state(), before);
    }

    await t.test(
      "manual approval writes linked audit and preserves run/source; replay survives restart and reimport",
      async () => {
        const item = await seed();
        assert.equal((await state()).identifiers.length, 0);
        const before = await state();
        const result = await service.promoteManual(request(item));
        assert.deepEqual(result, {
          candidatePublicId: item.candidate.publicId,
          decisionStatus: "ACCEPTED",
          versionNo: 2,
        });
        const after = await state();
        assert.deepEqual(after.runs, before.runs);
        assert.deepEqual(after.sources, before.sources);
        const promoted = after.identifiers[0];
        assert.equal(promoted.is_verified, true);
        assert.equal(promoted.is_primary, true);
        assert.equal(promoted.sku_id, null);
        assert.equal(promoted.confidence_score, "91.25");
        assert.equal(promoted.evidence_type, "MANUAL_REVIEW");
        assert.deepEqual(promoted.evidence_json.evidence, item.input.evidence);
        assert.equal(after.masters[0].identifier_status, "VERIFIED");
        assert.equal(after.masters[0].version_no, item.product.version_no + 1);
        const accepted = after.candidates[0];
        assert.deepEqual(accepted.evidence_json.slice(0, -1), item.input.evidence);
        const receipt = accepted.evidence_json.at(-1);
        assert.equal(receipt.identifierPublicId, promoted.public_id);
        assert.equal(receipt.runPublicId, item.run.publicId);
        assert.equal(receipt.productPublicId, item.product.public_id);
        assert.equal(receipt.actor, "reviewer");
        assert.equal(receipt.decidedAt, accepted.decided_at.toISOString());
        await database.close();
        database = connect();
        db = database.db;
        service = createIdentifierPromotionService(database);
        assert.deepEqual(await service.promoteManual(request(item)), result);
        assert.deepEqual(await state(), after);
        await rejects(request(item, "other-reviewer"), "VERSION_CONFLICT");
        await rejects({ ...request(item), expectedVersionNo: 2 }, "CANDIDATE_STATE_CONFLICT");
        await db
          .updateTable("app.source_product")
          .set({ raw_product_name: "Reimported" })
          .where("id", "=", item.source.id)
          .execute();
        const reimported = await state();
        assert.deepEqual(await service.promoteManual(request(item)), result);
        assert.deepEqual(await state(), reimported);
      },
    );

    await t.test(
      "MASTER upsert retains previous evidence and SKU primary with the same norm",
      async () => {
        const item = await seed();
        const sku = await db
          .insertInto("app.product_sku")
          .values({ product_id: item.product.id, sku_name: "red", option_key: "red" })
          .returning("id")
          .executeTakeFirstOrThrow();
        const skuIdentifier = await identifier(item, { skuId: sku.id });
        const oldPrimary = await identifier(item, { value: "OLD", norm: "OLD" });
        const existing = await identifier(item, { primary: false });
        await service.promoteManual(request(item));
        const rows = await db
          .selectFrom("app.product_identifier")
          .selectAll()
          .where("product_id", "=", item.product.id)
          .execute();
        assert.equal(rows.length, 3);
        assert.deepEqual(
          rows.find((row) => row.id === skuIdentifier.id),
          skuIdentifier,
        );
        assert.equal(rows.find((row) => row.id === oldPrimary.id).is_primary, false);
        const updated = rows.find((row) => row.id === existing.id);
        assert.equal(updated.is_primary, true);
        assert.equal(updated.is_verified, true);
        assert.equal(updated.source_url, existing.source_url);
        assert.deepEqual(updated.evidence_json.previous.evidence, existing.evidence_json);
        assert.equal(updated.evidence_json.previous.evidenceType, existing.evidence_type);
        const second = await seed({
          product: item.product,
          value: item.input.candidateValue,
          norm: item.input.candidateNorm,
        });
        await service.promoteManual(request(second));
        const twice = await db
          .selectFrom("app.product_identifier")
          .selectAll()
          .where("id", "=", existing.id)
          .executeTakeFirstOrThrow();
        assert.deepEqual(twice.evidence_json.previous.evidence, updated.evidence_json);
      },
    );

    await t.test(
      "REVIEW_REQUIRED may be manually approved without changing its original score",
      async () => {
        const item = await seed();
        await db
          .updateTable("app.identifier_candidate")
          .set({ decision_status: "REVIEW_REQUIRED", confidence_score: null })
          .where("public_id", "=", item.candidate.publicId)
          .execute();
        await service.promoteManual(request(item));
        const row = await db
          .selectFrom("app.product_identifier")
          .selectAll()
          .where("product_id", "=", item.product.id)
          .executeTakeFirstOrThrow();
        assert.equal(row.confidence_score, null);
      },
    );

    for (const status of ["REJECTED", "AUTO_ACCEPTED", "ACCEPTED"]) {
      await t.test(`${status} cannot bypass manual approval lifecycle`, async () => {
        const item = await seed();
        await db
          .updateTable("app.identifier_candidate")
          .set({ decision_status: status })
          .where("public_id", "=", item.candidate.publicId)
          .execute();
        await unchangedFailure(item, "CANDIDATE_STATE_CONFLICT");
      });
    }
    await t.test(
      "conflicts, corrupt norms and unsafe persisted evidence fail without mutation",
      async () => {
        for (const [patch, code] of [
          [{ conflict_json: JSON.stringify([{ code: "CONFLICT_BRAND" }]) }, "IDENTIFIER_CONFLICT"],
          [{ candidate_norm: "not canonical" }, "PERSISTED_CANDIDATE_INVALID"],
          [
            { evidence_json: JSON.stringify([{ token: "fixture-secret" }]) },
            "PERSISTED_CANDIDATE_INVALID",
          ],
        ]) {
          const item = await seed();
          await db
            .updateTable("app.identifier_candidate")
            .set(patch)
            .where("public_id", "=", item.candidate.publicId)
            .execute();
          await unchangedFailure(item, code);
        }
      },
    );
    await t.test(
      "unlinked, remapped, stale source and unsuccessful run cannot promote",
      async () => {
        const unlinked = await seed({ unlinked: true });
        await unchangedFailure(unlinked, "PRODUCT_NOT_FOUND");
        const remapped = await seed();
        await db
          .updateTable("app.source_product")
          .set({ product_id: unlinked.product.id })
          .where("id", "=", remapped.source.id)
          .execute();
        await unchangedFailure(remapped, "SOURCE_STATE_CONFLICT");
        for (const patch of [
          { raw_product_name: "Changed" },
          { raw_json: JSON.stringify({ changed: true }) },
          { collected_at: new Date("2026-09-15T01:00:00Z") },
        ]) {
          const item = await seed();
          await db
            .updateTable("app.source_product")
            .set(patch)
            .where("id", "=", item.source.id)
            .execute();
          await unchangedFailure(item, "SOURCE_STATE_CONFLICT");
        }
        const failed = await seed();
        await db
          .updateTable("app.identifier_resolve_run")
          .set({ status: "FAILED" })
          .where("public_id", "=", failed.run.publicId)
          .execute();
        await unchangedFailure(failed, "SOURCE_STATE_CONFLICT");
      },
    );
    await t.test("automatic promotion never touches the database", async () => {
      const before = await state();
      await assert.rejects(() => service.promoteAuto(), { code: "AUTO_PROMOTION_DISABLED" });
      assert.deepEqual(await state(), before);
    });
    await t.test(
      "same concurrent approval replays; conflicting reviewers have exactly one winner",
      async () => {
        const item = await seed();
        const results = await Promise.all([
          service.promoteManual(request(item)),
          service.promoteManual(request(item)),
        ]);
        assert.deepEqual(results[0], results[1]);
        const row = await db
          .selectFrom("app.identifier_candidate")
          .selectAll()
          .where("public_id", "=", item.candidate.publicId)
          .executeTakeFirstOrThrow();
        assert.equal(row.version_no, 2);
        assert.equal(row.evidence_json.filter((entry) => entry.type === "MANUAL_REVIEW").length, 1);
        const other = await seed();
        const race = await Promise.allSettled([
          service.promoteManual(request(other, "first")),
          service.promoteManual(request(other, "second")),
        ]);
        assert.equal(race.filter((entry) => entry.status === "fulfilled").length, 1);
        assert.equal(
          race.find((entry) => entry.status === "rejected").reason.code,
          "VERSION_CONFLICT",
        );
      },
    );
    await t.test(
      "cross-MASTER identifier race including GTIN/EAN allows a single winner",
      async () => {
        for (const pair of [
          ["MODEL_NO", "MODEL_NO", "RACE123"],
          ["GTIN", "EAN", "1234567890123"],
        ]) {
          const left = await seed({ type: pair[0], value: pair[2], norm: pair[2] });
          const right = await seed({ type: pair[1], value: pair[2], norm: pair[2] });
          const race = await Promise.allSettled([
            service.promoteManual(request(left)),
            service.promoteManual(request(right)),
          ]);
          assert.equal(race.filter((entry) => entry.status === "fulfilled").length, 1);
          assert.equal(
            race.find((entry) => entry.status === "rejected").reason.code,
            "IDENTIFIER_CONFLICT",
          );
          assert.equal(
            (
              await db
                .selectFrom("app.product_identifier")
                .selectAll()
                .where("identifier_norm", "=", pair[2])
                .execute()
            ).length,
            1,
          );
        }
      },
    );
    await t.test(
      "different concurrent values on one MASTER keep a single primary and both receipts",
      async () => {
        const left = await seed();
        const right = await seed({ product: left.product });
        await Promise.all([
          service.promoteManual(request(left)),
          service.promoteManual(request(right)),
        ]);
        const rows = await db
          .selectFrom("app.product_identifier")
          .selectAll()
          .where("product_id", "=", left.product.id)
          .execute();
        assert.equal(rows.length, 2);
        assert.equal(rows.filter((row) => row.is_primary).length, 1);
        assert.ok(rows.every((row) => row.is_verified));
        for (const item of [left, right]) {
          const row = await db
            .selectFrom("app.identifier_candidate")
            .selectAll()
            .where("public_id", "=", item.candidate.publicId)
            .executeTakeFirstOrThrow();
          assert.equal(row.evidence_json.at(-1).decision, "ACCEPTED");
        }
      },
    );
    await t.test(
      "P2 identity advisory lock blocks P3 approval until the P2 write commits",
      async () => {
        const item = await seed({ type: "EAN", value: "5901234123457", norm: "5901234123457" });
        const competing = await seed();
        const client = await fixture.client.connect();
        const key = masterIdentityLockKeys([
          { type: "GTIN", normalizedValue: item.input.candidateNorm },
        ])[0];
        let pending;
        try {
          await client.query("BEGIN");
          await client.query("SELECT pg_advisory_xact_lock($1::bigint)", [key]);
          pending = service.promoteManual(request(item)).then(
            (value) => ({ value }),
            (error) => ({ error }),
          );
          // Observe the actual PostgreSQL waiter rather than assume a timing-based race.
          for (let attempt = 0; attempt < 200; attempt++) {
            const waiters = await fixture.client.query(
              "SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted AND database = (SELECT oid FROM pg_database WHERE datname = current_database())",
            );
            if (waiters.rowCount > 0) break;
            if (attempt === 199) assert.fail("promotion did not wait on the P2 identity lock");
            await delay(10);
          }
          await client.query(
            "INSERT INTO app.product_identifier (product_id, identifier_type, identifier_value, identifier_norm, evidence_type) VALUES ($1, 'GTIN', $2, $2, 'FIXTURE')",
            [competing.product.id, item.input.candidateNorm],
          );
          await client.query("COMMIT");
          assert.equal((await pending).error.code, "IDENTIFIER_CONFLICT");
        } finally {
          await client.query("ROLLBACK");
          client.release();
          await pending;
        }
      },
    );
    await t.test(
      "late MASTER failure rolls back inserted/updated identifiers, primary, decision and audit",
      async () => {
        for (const updateExisting of [false, true]) {
          const item = await seed();
          await identifier(item, { value: `OLD${sequence}`, norm: `OLD${sequence}` });
          if (updateExisting) await identifier(item, { primary: false });
          await fixture.client.query(
            "CREATE FUNCTION app.promotion_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected promotion failure'; END $$",
          );
          await fixture.client.query(
            "CREATE TRIGGER promotion_fail BEFORE UPDATE ON app.product_master FOR EACH ROW EXECUTE FUNCTION app.promotion_fail()",
          );
          const before = await state();
          try {
            await assert.rejects(
              () => service.promoteManual(request(item)),
              /injected promotion failure/,
            );
            assert.deepEqual(await state(), before);
          } finally {
            await fixture.client.query("DROP TRIGGER promotion_fail ON app.product_master");
            await fixture.client.query("DROP FUNCTION app.promotion_fail()");
          }
          assert.equal((await service.promoteManual(request(item))).versionNo, 2);
        }
      },
    );
  },
);
