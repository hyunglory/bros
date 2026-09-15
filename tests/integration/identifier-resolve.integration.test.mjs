import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import {
  createImportValidationService,
  createSourceProductUpsertService,
} from "../../packages/importer/dist/index.js";
import { createResolveRunService } from "../../packages/resolver/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

const candidate = {
  identifierType: "MODEL_NO",
  candidateValue: "AB-123",
  candidateNorm: "AB123",
  confidenceScore: "98.25",
  rankNo: 1,
  evidence: [{ type: "SOURCE_FIELD", path: "/modelNo", value: "AB-123" }],
  conflicts: [{ type: "CONFLICT_COLOR", observed: "red", expected: "blue" }],
};

test("P3-01 durable resolve runs and atomic candidate lifecycle", { timeout: 60000 }, async (t) => {
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
  let service = createResolveRunService(database);
  const validation = createImportValidationService(database);
  const upsert = createSourceProductUpsertService(database);
  const mapped = {
    platformCode: "MUSINSA",
    externalProductId: "resolve-fixture",
    productName: "Initial name",
    productUrl: "https://example.com/item",
    identifiers: [{ type: "MODEL_NO", value: "EXPLICIT-1" }],
    options: [{ rawOptionName: "Red", sourceOrder: 0, raw: { color: "red" } }],
    images: [
      { imageType: "MAIN", sourceUrl: "https://example.com/image.jpg", sourceOrder: 0, raw: {} },
    ],
    raw: { modelNo: "AB-123" },
  };
  async function imported(input, collectedAt) {
    const batch = await validation.persist({
      platformCode: "MUSINSA",
      sourceName: "synthetic-resolve",
      context: { collectedAt },
      rows: [
        { outcome: "MAPPED", input, issues: [], sourceLocator: "fixture!A1", sourceRowNumber: 1 },
      ],
    });
    await upsert.process(batch.batchPublicId);
  }
  await imported(mapped, "2026-09-15T00:00:00Z");
  const source = await db.selectFrom("app.source_product").selectAll().executeTakeFirstOrThrow();
  const create = () =>
    service.create({ sourceProductPublicId: source.public_id, resolverVersion: "resolver-v1" });

  await t.test(
    "captures mapped provenance and freezes snapshots across actual reimport and restart",
    async () => {
      const first = await create();
      const initial = await service.get(first.publicId);
      assert.equal(initial.status, "QUEUED");
      assert.equal(initial.input.schemaVersion, 1);
      assert.equal(initial.input.productPublicId, null);
      assert.deepEqual(initial.input.import.input, mapped);
      assert.equal(initial.startedAt, null);
      assert.equal(initial.finishedAt, null);
      // A stale import is newer in item order, but must not become the snapshot.
      await imported({ ...mapped, productName: "Stale" }, "2026-09-14T00:00:00Z");
      assert.deepEqual((await service.get((await create()).publicId)).input.import.input, mapped);
      await imported(
        { ...mapped, productName: "Updated name", raw: { modelNo: "NEW-1" } },
        "2026-09-15T01:00:00Z",
      );
      const second = await create();
      assert.notEqual(first.publicId, second.publicId);
      assert.equal((await service.get(second.publicId)).input.productName, "Updated name");
      await database.close();
      database = createDatabaseClient(
        loadConfig({ DATABASE_URL: fixture.connectionString }).database,
        { applicationName: "bros-test" },
      );
      service = createResolveRunService(database);
      const started = await service.start(first.publicId);
      assert.deepEqual(started.input, initial.input);
      assert.equal(started.resolverVersion, "resolver-v1");
      started.input.raw.modelNo = "caller mutation";
      assert.deepEqual((await service.get(first.publicId)).input, initial.input);
      await service.succeed(first.publicId, []);
    },
  );

  await t.test(
    "success preserves evidence/conflict and never accepts or writes identifiers",
    async () => {
      const run = await create();
      await service.start(run.publicId);
      await service.succeed(run.publicId, [
        candidate,
        {
          ...candidate,
          candidateNorm: "XY456",
          candidateValue: "XY-456",
          rankNo: 2,
          confidenceScore: null,
        },
      ]);
      const result = await service.get(run.publicId);
      assert.equal(result.status, "SUCCEEDED");
      assert.equal(result.outcome, "CANDIDATES");
      assert.ok(Date.parse(result.createdAt) <= Date.parse(result.startedAt));
      assert.ok(Date.parse(result.startedAt) <= Date.parse(result.finishedAt));
      assert.deepEqual(result.candidates[0].evidence, candidate.evidence);
      assert.deepEqual(result.candidates[0].conflicts, candidate.conflicts);
      assert.equal(result.candidates[0].confidenceScore, "98.25");
      for (const item of result.candidates) {
        assert.equal(item.decisionStatus, "CANDIDATE");
        assert.equal(item.versionNo, 1);
        assert.equal(item.decidedAt, null);
        assert.equal(item.decidedBy, null);
        assert.equal("id" in item, false);
      }
      assert.equal(
        (await database.db.selectFrom("app.product_identifier").selectAll().execute()).length,
        0,
      );
      assert.equal(
        (await database.db.selectFrom("app.product_master").selectAll().execute()).length,
        0,
      );
      for (const operation of [
        () => service.start(run.publicId),
        () => service.succeed(run.publicId, []),
        () => service.fail(run.publicId, "TIMEOUT"),
        () => service.cancel(run.publicId),
      ]) {
        await assert.rejects(operation, { code: "RESOLVE_RUN_STATE_CONFLICT" });
      }
      assert.deepEqual(await service.get(run.publicId), result);
    },
  );

  await t.test("empty candidate list succeeds with NOT_FOUND and no error", async () => {
    const run = await create();
    await service.start(run.publicId);
    assert.equal((await service.succeed(run.publicId, [])).outcome, "NOT_FOUND");
    const result = await service.get(run.publicId);
    assert.equal(result.status, "SUCCEEDED");
    assert.equal(result.outcome, "NOT_FOUND");
    assert.equal(result.errorCode, null);
    assert.equal(result.errorMessage, null);
  });

  await t.test("failure persists a fixed diagnostic and rejects raw provider errors", async () => {
    const run = await create();
    await assert.rejects(() => service.fail(run.publicId, "TIMEOUT"), {
      code: "RESOLVE_RUN_STATE_CONFLICT",
    });
    await service.start(run.publicId);
    await assert.rejects(() => service.fail(run.publicId, "token=private-value"), {
      code: "INVALID_RESOLVE_INPUT",
    });
    await service.fail(run.publicId, "TIMEOUT");
    const result = await service.get(run.publicId);
    assert.equal(result.status, "FAILED");
    assert.equal(result.errorCode, "TIMEOUT");
    assert.equal(result.errorMessage, "Identifier resolution timed out");
    assert.ok(result.finishedAt);
    assert.equal(result.outcome, null);
    assert.deepEqual(result.candidates, []);
    await assert.rejects(() => service.start(run.publicId), { code: "RESOLVE_RUN_STATE_CONFLICT" });
  });

  await t.test("queued/running cancellation is terminal", async () => {
    for (const running of [false, true]) {
      const run = await create();
      if (running) await service.start(run.publicId);
      await service.cancel(run.publicId);
      const result = await service.get(run.publicId);
      assert.equal(result.status, "CANCELLED");
      assert.ok(result.finishedAt);
      assert.equal(result.startedAt === null, !running);
      await assert.rejects(() => service.succeed(run.publicId, [candidate]), {
        code: "RESOLVE_RUN_STATE_CONFLICT",
      });
    }
  });

  await t.test("invalid/duplicate candidates leave the running transaction untouched", async () => {
    const run = await create();
    await service.start(run.publicId);
    for (const values of [
      [candidate, candidate],
      [{ ...candidate, decisionStatus: "AUTO_ACCEPTED" }],
      [{ ...candidate, evidence: [{ password: "private-value" }] }],
    ]) {
      await assert.rejects(() => service.succeed(run.publicId, values), {
        code: "INVALID_RESOLVE_INPUT",
      });
    }
    const result = await service.get(run.publicId);
    assert.equal(result.status, "RUNNING");
    assert.deepEqual(result.candidates, []);
    await service.succeed(run.publicId, [candidate]);
  });

  await t.test(
    "DB failure after candidate insertion rolls back candidates and success together",
    async () => {
      const run = await create();
      await service.start(run.publicId);
      await fixture.client
        .query(`CREATE FUNCTION app.reject_resolve_success() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN IF NEW.status = 'SUCCEEDED' THEN RAISE EXCEPTION 'synthetic failure'; END IF; RETURN NEW; END $$;
      CREATE TRIGGER reject_resolve_success BEFORE UPDATE ON app.identifier_resolve_run
      FOR EACH ROW EXECUTE FUNCTION app.reject_resolve_success()`);
      try {
        await assert.rejects(() => service.succeed(run.publicId, [candidate]));
      } finally {
        await fixture.client.query(
          "DROP TRIGGER reject_resolve_success ON app.identifier_resolve_run; DROP FUNCTION app.reject_resolve_success()",
        );
      }
      const result = await service.get(run.publicId);
      assert.equal(result.status, "RUNNING");
      assert.deepEqual(result.candidates, []);
      await service.succeed(run.publicId, [candidate]);
    },
  );

  await t.test("concurrent start and competing terminal transitions have one winner", async () => {
    const run = await create();
    const starts = await Promise.allSettled([
      service.start(run.publicId),
      service.start(run.publicId),
    ]);
    assert.equal(starts.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(
      starts.find((item) => item.status === "rejected").reason.code,
      "RESOLVE_RUN_STATE_CONFLICT",
    );
    const finishes = await Promise.allSettled([
      service.succeed(run.publicId, [candidate]),
      service.fail(run.publicId, "TIMEOUT"),
      service.cancel(run.publicId),
    ]);
    assert.equal(finishes.filter((item) => item.status === "fulfilled").length, 1);
    for (const failure of finishes.filter((item) => item.status === "rejected"))
      assert.equal(failure.reason.code, "RESOLVE_RUN_STATE_CONFLICT");
    const result = await service.get(run.publicId);
    assert.equal(result.candidates.length, result.status === "SUCCEEDED" ? 1 : 0);
  });

  await t.test(
    "direct sources preserve MASTER association and reject secret-bearing snapshots",
    async () => {
      const currentDb = database.db;
      const product = await currentDb
        .insertInto("app.product_master")
        .values({ product_name: "Fixture", product_name_norm: "fixture", created_method: "MANUAL" })
        .returningAll()
        .executeTakeFirstOrThrow();
      const direct = await currentDb
        .insertInto("app.source_product")
        .values({
          platform_id: source.platform_id,
          product_id: product.id,
          external_product_id: "direct",
          raw_product_name: "Direct fixture",
          raw_json: "null",
          collected_at: new Date(),
          last_seen_at: new Date(),
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const run = await service.create({
        sourceProductPublicId: direct.public_id,
        resolverVersion: "v2",
      });
      const result = await service.get(run.publicId);
      assert.equal(result.input.import, null);
      assert.equal(result.input.productPublicId, product.public_id);
      assert.equal(result.input.raw, null);
      assert.equal(result.resolverVersion, "v2");
      await currentDb
        .updateTable("app.source_product")
        .set({ raw_json: JSON.stringify({ token: "private-value" }) })
        .where("id", "=", direct.id)
        .execute();
      await assert.rejects(
        () => service.create({ sourceProductPublicId: direct.public_id, resolverVersion: "v2" }),
        { code: "INVALID_RESOLVE_INPUT" },
      );
      assert.equal(
        (
          await currentDb
            .selectFrom("app.identifier_resolve_run")
            .selectAll()
            .where("source_product_id", "=", direct.id)
            .execute()
        ).length,
        1,
      );
      assert.equal((await service.get(run.publicId)).input.raw, null);
    },
  );

  await t.test("missing resources and invalid IDs fail without creating runs", async () => {
    await assert.rejects(() => service.get("123"), { code: "INVALID_RESOLVE_INPUT" });
    const missing = "01890f47-0c4d-7abc-8def-1234567890ab";
    await assert.rejects(() => service.get(missing), { code: "RESOLVE_RUN_NOT_FOUND" });
    await assert.rejects(
      () => service.create({ sourceProductPublicId: missing, resolverVersion: "v1" }),
      { code: "SOURCE_PRODUCT_NOT_FOUND" },
    );
  });
});
