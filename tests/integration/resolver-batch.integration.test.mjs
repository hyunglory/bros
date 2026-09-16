import assert from "node:assert/strict";
import test from "node:test";
import { fork, spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import { URL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { loadConfig, createRedactedLogger } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import { createPgBossQueue } from "../../packages/queue/dist/index.js";
import {
  createImportValidationService,
  createSourceProductUpsertService,
} from "../../packages/importer/dist/index.js";
import {
  createResolveRunService,
  enqueueResolveBatch,
  createResolverPipeline,
  createIdentifierResolveHandler,
  createBraveSearchProvider,
  createIdentifierPatternRegistry,
  createFixtureProviderBudget,
  reconcileResolveRuns,
  createResolverCaptureExporter,
  evaluationDigest,
  validateEvaluationDataset,
} from "../../packages/resolver/dist/index.js";
import { createWorker } from "../../apps/worker/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";
import { createIdentifierReviewManagement } from "../../apps/api/dist/identifier-review-management.js";

async function until(read, accept, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const value = await read();
    if (accept(value)) return value;
    await delay(40);
  }
  assert.fail("Resolver condition timed out");
}
const signal = () => new globalThis.AbortController().signal;
const noCandidates = {
  providerId: "batch-fixture",
  async search() {
    return { providerId: this.providerId, outcome: "NOT_FOUND", candidates: [], truncated: false };
  },
};
const patterns = {
  version: "batch-fixture/v1",
  patterns: [
    {
      id: "TITLE",
      brandKey: "fixture",
      identifierType: "MODEL_NO",
      source: "TITLE",
      regex: "(?<identifier>AB-[0-9]{3})",
    },
    {
      id: "RAW",
      brandKey: "fixture",
      identifierType: "MODEL_NO",
      source: "RAW",
      regex: "(?<identifier>AB-[0-9]{3})",
    },
  ],
};

test(
  "P3-12 atomic batch admission, fenced orchestration and provider limits",
  { timeout: 120000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    const workers = [];
    let database, queue;
    t.after(async () => {
      for (const worker of workers) await worker.stop();
      await queue?.stop();
      await database?.close();
      await fixture.cleanup();
    });
    await migrateToLatest(fixture.db);
    const config = loadConfig({ DATABASE_URL: fixture.connectionString, DB_POOL_MAX: "8" });
    database = createDatabaseClient(config.database, { applicationName: "bros-test" });
    queue = createPgBossQueue(config.database, {
      retryDelay: 1,
      pollingIntervalSeconds: 0.5,
      superviseIntervalSeconds: 1,
    });
    await queue.start();
    const db = database.db;
    const uuid = async () => (await fixture.client.query("select uuidv7() as id")).rows[0].id;
    const brand = await db
      .insertInto("app.brand")
      .values({ brand_key: "fixture", name_en: "Fixture" })
      .returningAll()
      .executeTakeFirstOrThrow();
    await db
      .insertInto("app.brand_alias")
      .values({ brand_id: brand.id, alias_name: "Fixture", alias_norm: "fixture" })
      .execute();
    let sequence = 0;
    async function source(name = "AB-123", identifiers = []) {
      const id = `resolve-${++sequence}`;
      const input = {
        platformCode: "MUSINSA",
        externalProductId: id,
        productName: name,
        brandName: "Fixture",
        identifiers,
        raw: { model: name },
        options: [],
        images: [],
      };
      const batch = await createImportValidationService(database).persist({
        platformCode: "MUSINSA",
        sourceName: "resolver-fixture",
        context: { collectedAt: "2026-09-15T00:00:00Z" },
        rows: [
          { outcome: "MAPPED", input, issues: [], sourceLocator: "fixture!A1", sourceRowNumber: 1 },
        ],
      });
      await createSourceProductUpsertService(database).process(batch.batchPublicId);
      return (
        await db
          .selectFrom("app.source_product")
          .select("public_id")
          .where("external_product_id", "=", id)
          .executeTakeFirstOrThrow()
      ).public_id;
    }
    const pipeline = createResolverPipeline(database, {
      patterns,
      provider: noCandidates,
      providerMinIntervalMs: 1,
      captureSourceKind: "SYNTHETIC",
    });
    const service = createResolveRunService(database);
    async function admit(ids, version = pipeline.version, options = {}) {
      return enqueueResolveBatch(
        database,
        queue,
        { requestPublicId: await uuid(), sourceProductPublicIds: ids, resolverVersion: version },
        options,
      );
    }
    async function job(publicId, attempt = 1, retryLimit = 2) {
      const run = await service.get(publicId);
      return {
        data: { publicId },
        provider: run.execution.provider,
        providerId: run.execution.providerId,
        attempt,
        retryLimit,
        signal: signal(),
      };
    }
    const one = async (id, version = pipeline.version) =>
      (await admit([id], version)).results[0].publicId;
    const handler = createIdentifierResolveHandler(database, pipeline);

    await t.test(
      "chunk boundaries, concurrent replay, isolated missing source, atomic publish rollback and backpressure",
      async () => {
        const ids = await Promise.all(Array.from({ length: 5 }, () => source()));
        const missing = await uuid();
        const request = {
          requestPublicId: await uuid(),
          sourceProductPublicIds: [...ids, missing, ids[0]],
          resolverVersion: pipeline.version,
        };
        const replies = await Promise.all([
          enqueueResolveBatch(database, queue, request, { chunkSize: 2 }),
          enqueueResolveBatch(database, queue, request, { chunkSize: 2 }),
        ]);
        assert.equal(
          replies.flatMap((r) => r.results).filter((r) => r.disposition === "ACCEPTED").length,
          5,
        );
        assert.equal(
          replies.flatMap((r) => r.results).filter((r) => r.disposition === "REPLAYED").length,
          5,
        );
        assert.ok(replies.every((r) => r.results.at(-1).code === "SOURCE_PRODUCT_NOT_FOUND"));
        const runs = replies[0].results.filter((r) => r.publicId);
        for (const item of runs) {
          const delivery = await job(item.publicId);
          const queued = await fixture.client.query("select data from bros_queue.job where id=$1", [
            delivery.providerId,
          ]);
          assert.deepEqual(queued.rows[0].data, { publicId: item.publicId });
        }
        const failedRequest = {
          requestPublicId: await uuid(),
          sourceProductPublicIds: [ids[0]],
          resolverVersion: pipeline.version,
        };
        const failingQueue = {
          ...queue,
          async publish(...args) {
            await queue.publish(...args);
            throw new Error("private-enqueue-marker");
          },
        };
        const before = await fixture.client.query("select count(*) from bros_queue.job");
        const failed = await enqueueResolveBatch(database, failingQueue, failedRequest);
        assert.equal(failed.results[0].code, "RESOLVE_ENQUEUE_FAILED");
        assert.equal(
          (await fixture.client.query("select count(*) from bros_queue.job")).rows[0].count,
          before.rows[0].count,
        );
        assert.equal(
          (
            await db
              .selectFrom("app.identifier_resolve_run")
              .select("id")
              .where("admission_key", "=", `${failedRequest.requestPublicId}:${ids[0]}`)
              .execute()
          ).length,
          0,
        );
        assert.equal(
          (await admit([ids[0]], pipeline.version, { maxQueuedRuns: 1 })).results[0].code,
          "RESOLVE_BACKPRESSURE",
        );
        assert.equal(
          (await enqueueResolveBatch(database, queue, { ...request, resolverVersion: "changed" }))
            .results[0].code,
          "RESOLVE_ADMISSION_CONFLICT",
        );
        for (const item of runs) await service.cancel(item.publicId);
      },
    );

    await t.test(
      "P2 legacy norm flows through Evidence and recommendation audit, never promotes",
      async () => {
        const master = await db
          .insertInto("app.product_master")
          .values({
            brand_id: brand.id,
            product_name: "Verified",
            product_name_norm: "verified",
            status: "ACTIVE",
            identifier_status: "VERIFIED",
            created_method: "FIXTURE",
          })
          .returningAll()
          .executeTakeFirstOrThrow();
        await db
          .insertInto("app.product_identifier")
          .values({
            product_id: master.id,
            identifier_type: "MODEL_NO",
            identifier_value: "AB-123",
            identifier_norm: "AB-123",
            is_verified: true,
            evidence_type: "FIXTURE",
          })
          .execute();
        const id = await one(await source());
        const input = (await service.get(id)).input;
        await assert.rejects(service.start(id), { code: "RESOLVE_RUN_STATE_CONFLICT" });
        await handler(await job(id));
        await handler(await job(id, 2));
        const saved = await service.get(id);
        assert.equal(saved.status, "SUCCEEDED");
        assert.equal(saved.candidates.length, 1);
        assert.equal(saved.candidates[0].candidateNorm, "AB123");
        assert.equal(saved.candidates[0].decisionStatus, "CANDIDATE");
        assert.equal(saved.result.candidates[0].recommendedDecision, "AUTO_ACCEPTED");
        assert.equal(saved.result.automaticPromotionEnabled, false);
        assert.equal(saved.result.providerFailures.length, 0);
        assert.deepEqual(saved.input, input);
        const exported = await createResolverCaptureExporter(database).export(id);
        assert.equal(exported.execution.attempt, 1);
        assert.equal(exported.execution.payload.sourceKind, "SYNTHETIC");
        assert.equal(exported.execution.payload.providerAttempted, false);
        assert.equal(exported.execution.payload.capture.costUsd, 0);
        assert.ok(
          exported.execution.payload.capture.collection.candidates.some(
            (c) => c.candidateValue === "AB-123",
          ),
        );
        assert.ok(exported.execution.payload.capture.conflictContext.candidateFacts.length > 0);
        assert.equal(exported.execution.payload.capture.registryVersion, patterns.version);
        assert.deepEqual(await createResolverCaptureExporter(database).export(id), exported);
        assert.equal(
          (await db.selectFrom("app.product_identifier").selectAll().execute()).length,
          1,
        );
        const explicit = await one(
          await source("Unpatterned", [{ type: "MODEL_NO", value: "AB-123" }]),
        );
        await handler(await job(explicit));
        assert.ok(
          (await service.get(explicit)).candidates[0].evidence.some(
            (e) => e.provenance.locator === "/import/input/identifiers/0/value",
          ),
        );
      },
    );

    await t.test(
      "retry success, exhausted partial provider failure, NOT_FOUND and fixed errors",
      async () => {
        const id = await one(await source("AB-555"));
        let calls = 0;
        const retryPipeline = {
          ...pipeline,
          async resolve(input, sig) {
            if (++calls === 1) throw new Error("private-provider-marker");
            return pipeline.resolve(input, sig);
          },
        };
        const retry = createIdentifierResolveHandler(database, retryPipeline);
        await assert.rejects(retry(await job(id)), { code: "RESOLVER_FAILED" });
        assert.equal((await service.get(id)).execution.status, "RETRY_WAIT");
        await retry(await job(id, 2));
        assert.equal((await service.get(id)).status, "SUCCEEDED");
        const failingProvider = {
          providerId: "failure-fixture",
          async search() {
            return { providerId: this.providerId, outcome: "ERROR", code: "RATE_LIMIT" };
          },
        };
        const failing = createResolverPipeline(database, {
          patterns,
          provider: failingProvider,
          providerMinIntervalMs: 1,
        });
        const limited = await one(await source("no-code"), failing.version);
        const limitedHandler = createIdentifierResolveHandler(database, failing);
        await assert.rejects(limitedHandler(await job(limited)), { code: "RATE_LIMIT" });
        await limitedHandler(await job(limited, 3));
        const saved = await service.get(limited);
        assert.equal(saved.status, "SUCCEEDED");
        assert.equal(saved.outcome, "REVIEW_REQUIRED");
        assert.deepEqual(saved.result.providerFailures, [
          { providerId: "failure-fixture", code: "RATE_LIMIT" },
        ]);
        const empty = await one(await source("no-code"));
        await handler(await job(empty));
        assert.equal((await service.get(empty)).outcome, "NOT_FOUND");
        const crash = await one(await source("no-code"));
        await assert.rejects(
          createIdentifierResolveHandler(database, {
            ...pipeline,
            async resolve() {
              throw new Error("private-worker-marker");
            },
          })(await job(crash, 3)),
          { code: "RESOLVER_FAILED" },
        );
        assert.equal((await service.get(crash)).status, "FAILED");
        assert.doesNotMatch(JSON.stringify(await service.get(crash)), /private-worker-marker/);
      },
    );

    await t.test(
      "stale attempt, cancellation, timeout, wrong receipt and resolver version fence writes",
      async () => {
        const id = await one(await source("AB-666"));
        let release, entered;
        const held = new Promise((resolve) => {
          entered = resolve;
        });
        const slow = createIdentifierResolveHandler(database, {
          ...pipeline,
          async resolve(input, sig) {
            entered();
            await new Promise((resolve) => {
              release = resolve;
            });
            return pipeline.resolve(input, sig);
          },
        });
        const first = slow(await job(id));
        await held;
        await handler(await job(id, 2));
        release();
        await first;
        assert.equal((await service.get(id)).execution.attempt, 2);
        assert.equal((await service.get(id)).candidates.length, 1);
        assert.equal(
          (await createResolverCaptureExporter(database).export(id)).execution.attempt,
          2,
        );
        const cancelled = await one(await source());
        await service.cancel(cancelled);
        await handler(await job(cancelled));
        assert.equal((await service.get(cancelled)).candidates.length, 0);
        const invalid = await one(await source());
        await assert.rejects(handler({ ...(await job(invalid)), providerId: "wrong" }), {
          code: "RESOLVE_DELIVERY_MISMATCH",
        });
        await service.cancel(invalid);
        const version = await one(await source(), "old-policy");
        await assert.rejects(handler(await job(version)), { code: "RESOLVER_VERSION_MISMATCH" });
        assert.equal((await service.get(version)).status, "FAILED");
        const timeout = await one(await source());
        await assert.rejects(
          createIdentifierResolveHandler(
            database,
            {
              ...pipeline,
              resolve() {
                return new Promise(() => {
                  /* Simulate an uncooperative dependency. */
                });
              },
            },
            { runTimeoutMs: 100 },
          )(await job(timeout, 3)),
          { code: "TIMEOUT" },
        );
        assert.equal((await service.get(timeout)).status, "FAILED");
      },
    );

    await t.test(
      "candidate insertion failure rolls back both candidates and audit, then retries",
      async () => {
        const id = await one(await source());
        await fixture.client.query(
          "CREATE FUNCTION app.fail_resolver_candidate() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'private-db-marker'; END $$",
        );
        await fixture.client.query(
          "CREATE TRIGGER fail_resolver_candidate BEFORE INSERT ON app.identifier_candidate FOR EACH ROW EXECUTE FUNCTION app.fail_resolver_candidate()",
        );
        try {
          await assert.rejects(handler(await job(id)), { code: "RESOLVER_FAILED" });
        } finally {
          await fixture.client.query(
            "DROP TRIGGER fail_resolver_candidate ON app.identifier_candidate",
          );
          await fixture.client.query("DROP FUNCTION app.fail_resolver_candidate()");
        }
        const failed = await service.get(id);
        assert.equal(failed.candidates.length, 0);
        assert.deepEqual(failed.result, {});
        await assert.rejects(createResolverCaptureExporter(database).export(id), {
          code: "CAPTURE_RUN_NOT_SUCCEEDED",
        });
        await handler(await job(id, 2));
        assert.equal((await service.get(id)).candidates.length, 1);
        assert.equal(
          (await createResolverCaptureExporter(database).export(id)).execution.attempt,
          2,
        );
      },
    );

    await t.test(
      "capture export is private, deterministic, evaluator-compatible and never overwrites",
      async () => {
        const id = await one(await source("AB-555"));
        await handler(await job(id));
        const exporter = createResolverCaptureExporter(database);
        const exported = await exporter.export(id);
        assert.equal(exported.execution.payload.providerAttempted, true);
        assert.equal(exported.execution.payload.capture.costUsd, null);
        assert.equal(exported.execution.payload.costScope, "COMPLETED_ATTEMPT_ONLY");
        assert.equal(exported.captureDigest, evaluationDigest(exported.execution));
        const publicRun = await createIdentifierReviewManagement(database).run(id);
        assert.doesNotMatch(
          JSON.stringify(publicRun),
          /executionCapture|inputDigest|decisionDigest|conflictContext|costUsd/,
        );
        const golden = JSON.parse(
          await readFile(
            new URL("../../packages/resolver/test/fixtures/golden-v1.json", import.meta.url),
            "utf8",
          ),
        );
        const dataset = globalThis.structuredClone(golden);
        dataset.cases = [{ ...dataset.cases[0], capture: exported.execution.payload.capture }];
        assert.doesNotThrow(() => validateEvaluationDataset(dataset));
        const directory = await mkdtemp(join(tmpdir(), "bros-capture-export-"));
        try {
          const path = join(directory, "capture.json");
          const args = ["scripts/export-resolver-capture.mjs", id, path];
          const env = { ...process.env, DATABASE_URL: fixture.connectionString };
          const first = spawnSync(process.execPath, args, { env, encoding: "utf8" });
          assert.equal(first.status, 0, first.stderr);
          assert.deepEqual(JSON.parse(await readFile(path, "utf8")), exported);
          assert.doesNotMatch(first.stdout + first.stderr, /AB-555|evidence|postgresql/);
          const again = spawnSync(process.execPath, args, { env, encoding: "utf8" });
          assert.equal(again.status, 1);
          assert.match(again.stderr, /CAPTURE_OUTPUT_EXISTS/);
          assert.deepEqual(JSON.parse(await readFile(path, "utf8")), exported);
        } finally {
          await rm(directory, { recursive: true, force: true });
        }
      },
    );

    await t.test(
      "capture update failure rolls back candidates; corrupt or missing required capture fails closed",
      async () => {
        const id = await one(await source("AB-556"));
        await fixture.client.query(
          "CREATE FUNCTION app.fail_capture_update() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.result_json ? 'executionCapture' THEN RAISE EXCEPTION 'private-capture-db-marker'; END IF; RETURN NEW; END $$",
        );
        await fixture.client.query(
          "CREATE TRIGGER fail_capture_update BEFORE UPDATE ON app.identifier_resolve_run FOR EACH ROW EXECUTE FUNCTION app.fail_capture_update()",
        );
        try {
          await assert.rejects(handler(await job(id)), { code: "RESOLVER_FAILED" });
        } finally {
          await fixture.client.query(
            "DROP TRIGGER fail_capture_update ON app.identifier_resolve_run",
          );
          await fixture.client.query("DROP FUNCTION app.fail_capture_update()");
        }
        const failed = await service.get(id);
        assert.deepEqual(failed.result, {});
        assert.equal(failed.candidates.length, 0);
        await handler(await job(id, 2));
        assert.equal(
          (await createResolverCaptureExporter(database).export(id)).execution.attempt,
          2,
        );
        for (const remove of [false, true]) {
          const invalidId = await one(await source("AB-557"));
          const invalidHandler = createIdentifierResolveHandler(database, {
            ...pipeline,
            async resolve(input, sig) {
              const result = globalThis.structuredClone(await pipeline.resolve(input, sig));
              if (remove) delete result.executionCapture;
              else result.executionCapture.capture.reference = "token=private-capture-marker";
              return result;
            },
          });
          await assert.rejects(invalidHandler(await job(invalidId)), {
            code: "INVALID_RESOLVER_CAPTURE",
          });
          const saved = await service.get(invalidId);
          assert.equal(saved.status, "FAILED");
          assert.equal(saved.candidates.length, 0);
          assert.deepEqual(saved.result, {});
          assert.doesNotMatch(JSON.stringify(saved), /private-capture-marker/);
        }
      },
    );

    await t.test(
      "provider recorded cost stays per attempt and never uses configured request price",
      async () => {
        const priced = createResolverPipeline(database, {
          patterns,
          captureSourceKind: "SYNTHETIC",
          providerMinIntervalMs: 1,
          provider: {
            providerId: "metered-fixture/v1",
            async search() {
              return {
                outcome: "NOT_FOUND",
                providerId: this.providerId,
                candidates: [],
                truncated: false,
                costUsd: 0.000002,
              };
            },
          },
        });
        const id = await one(await source("AB-558"), priced.version);
        await createIdentifierResolveHandler(database, priced)(await job(id, 2));
        const exported = await createResolverCaptureExporter(database).export(id);
        assert.equal(exported.execution.payload.capture.costUsd, 0.000002);
        assert.equal(exported.execution.payload.capture.providerVersion, "metered-fixture/v1");
        assert.equal(exported.execution.payload.costScope, "COMPLETED_ATTEMPT_ONLY");
        const defaultPipeline = createResolverPipeline(database);
        const defaultId = await one(await source("AB-559"), defaultPipeline.version);
        await createIdentifierResolveHandler(database, defaultPipeline)(await job(defaultId));
        assert.equal(
          (await createResolverCaptureExporter(database).export(defaultId)).execution.payload
            .sourceKind,
          "UNCLASSIFIED",
        );
      },
    );

    await t.test(
      "concurrent Brave fixture calls obey spacing and shared fixture budget",
      async () => {
        const timestamps = [];
        const policy = {
          timeoutMs: 1000,
          minIntervalMs: 30,
          failureThreshold: 5,
          circuitOpenMs: 1000,
          rateLimitCooldownMs: 100,
          requestCostMicrousd: 1,
          maxRequestCostMicrousd: 1,
          dailyBudgetMicrousd: 2,
        };
        const provider = createBraveSearchProvider({
          registry: createIdentifierPatternRegistry(patterns),
          mode: "fixture",
          policy,
          budget: createFixtureProviderBudget(),
          secretProvider: {
            async get() {
              return "fixture-key";
            },
          },
          transport: async () => {
            timestamps.push(Date.now());
            return new globalThis.Response(JSON.stringify({ web: { results: [] } }), {
              headers: { "content-type": "application/json" },
            });
          },
        });
        const fixturePipeline = createResolverPipeline(database, {
          patterns,
          provider,
          providerMinIntervalMs: 35,
        });
        const ids = await Promise.all(Array.from({ length: 4 }, () => source("No model")));
        const admitted = await admit(ids, fixturePipeline.version);
        const fixtureHandler = createIdentifierResolveHandler(database, fixturePipeline);
        await Promise.all(
          admitted.results.map(async (item) => fixtureHandler(await job(item.publicId))),
        );
        assert.equal(timestamps.length, 2);
        assert.ok(timestamps[1] - timestamps[0] >= 30);
        const saved = await Promise.all(admitted.results.map((item) => service.get(item.publicId)));
        assert.equal(
          saved.filter((r) => r.result.providerFailures.some((f) => f.code === "BUDGET_EXCEEDED"))
            .length,
          2,
        );
      },
    );

    await t.test(
      "actual Worker registers configurable concurrency and isolates failing jobs",
      async () => {
        let active = 0,
          maximum = 0;
        const measured = {
          ...pipeline,
          async resolve(input, sig) {
            active++;
            maximum = Math.max(maximum, active);
            try {
              await delay(150);
              if (input.productName === "FAIL") throw new Error("private-isolated-marker");
              return await pipeline.resolve(input, sig);
            } finally {
              active--;
            }
          },
        };
        const ids = await Promise.all([
          source("FAIL"),
          ...Array.from({ length: 5 }, () => source("AB-777")),
        ]);
        const accepted = await admit(ids);
        const worker = createWorker(config, {
          queue: createPgBossQueue(config.database, {
            pollingIntervalSeconds: 0.5,
            retryDelay: 1,
            superviseIntervalSeconds: 1,
          }),
          resolverPipeline: measured,
          logger: createRedactedLogger({
            write() {
              return true;
            },
          }),
        });
        workers.push(worker);
        await worker.start();
        assert.equal(await worker.isReady(), true);
        const runs = await until(
          () => Promise.all(accepted.results.map((item) => service.get(item.publicId))),
          (values) => values.every((v) => ["SUCCEEDED", "FAILED"].includes(v.status)),
        );
        assert.equal(runs.filter((r) => r.status === "SUCCEEDED").length, 5);
        assert.equal(runs[0].status, "FAILED");
        assert.ok(maximum > 1 && maximum <= 4, `observed concurrency ${maximum}`);
        t.diagnostic(`Resolver observed concurrency ${maximum}; success 5 / isolated failure 1`);
        await worker.stop();
        workers.pop();
      },
    );

    await t.test(
      "terminal or missing queue deliveries reconcile without replay or fabricated success",
      async () => {
        const ids = await Promise.all([source(), source(), source()]);
        const accepted = await admit(ids);
        const runs = await Promise.all(accepted.results.map((item) => job(item.publicId)));
        await fixture.client.query(
          "update app.identifier_resolve_run set status='RUNNING', started_at=clock_timestamp() where public_id=any($1::uuid[])",
          [runs.map((r) => r.data.publicId)],
        );
        await fixture.client.query("update bros_queue.job set state='failed' where id=$1", [
          runs[0].providerId,
        ]);
        await fixture.client.query("delete from bros_queue.job where id=$1", [runs[1].providerId]);
        const result = await reconcileResolveRuns(database, queue);
        assert.equal(result.failed, 2);
        assert.equal(
          (await service.get(runs[0].data.publicId)).errorCode,
          "RESOLVE_RETRIES_EXHAUSTED",
        );
        assert.equal(
          (await service.get(runs[1].data.publicId)).errorCode,
          "RESOLVE_QUEUE_INCONSISTENT",
        );
        assert.equal((await service.get(runs[2].data.publicId)).status, "RUNNING");
        await service.cancel(runs[2].data.publicId);
      },
    );
  },
);

test(
  "P3-12 actual process death and restarted Worker recover the same run",
  { timeout: 60000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    const children = [];
    let database, queue;
    t.after(async () => {
      for (const child of children)
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, "exit");
          child.kill("SIGKILL");
          await exited;
        }
      await queue?.stop();
      await database?.close();
      await fixture.cleanup();
    });
    await migrateToLatest(fixture.db);
    const config = loadConfig({ DATABASE_URL: fixture.connectionString });
    database = createDatabaseClient(config.database, { applicationName: "bros-test" });
    queue = createPgBossQueue(config.database, {
      expireInSeconds: 2,
      retryDelay: 1,
      pollingIntervalSeconds: 0.5,
      superviseIntervalSeconds: 1,
    });
    await queue.start();
    const platform = await database.db
      .selectFrom("app.platform")
      .select("id")
      .where("code", "=", "MUSINSA")
      .executeTakeFirstOrThrow();
    const source = await database.db
      .insertInto("app.source_product")
      .values({
        platform_id: platform.id,
        external_product_id: "restart",
        raw_product_name: "Fixture restart",
        raw_json: "{}",
        collected_at: "2026-09-15T00:00:00Z",
        last_seen_at: "2026-09-15T00:00:00Z",
      })
      .returning("public_id")
      .executeTakeFirstOrThrow();
    const pipeline = createResolverPipeline(database);
    const requestId = (await fixture.client.query("select uuidv7() as id")).rows[0].id;
    const accepted = await enqueueResolveBatch(database, queue, {
      requestPublicId: requestId,
      sourceProductPublicIds: [source.public_id],
      resolverVersion: pipeline.version,
    });
    const id = accepted.results[0].publicId;
    function spawn(mode) {
      const child = fork(new URL("./resolver-process-fixture.mjs", import.meta.url), [mode], {
        env: { ...process.env, DATABASE_URL: fixture.connectionString, APP_ENV: "test" },
        stdio: ["ignore", "pipe", "pipe", "ipc"],
      });
      children.push(child);
      return child;
    }
    const first = spawn("hold");
    await until(
      () => createResolveRunService(database).get(id),
      (r) => r.status === "RUNNING",
    );
    const exited = once(first, "exit");
    first.kill("SIGKILL");
    await exited;
    const second = spawn("normal");
    const saved = await until(
      () => createResolveRunService(database).get(id),
      (r) => r.status === "SUCCEEDED",
      30000,
    );
    assert.ok(saved.execution.attempt >= 2);
    assert.equal(saved.input.sourceProductPublicId, source.public_id);
    assert.equal(saved.outcome, "REVIEW_REQUIRED");
    assert.equal(saved.result.providerFailures[0].code, "PROVIDER_DISABLED");
    second.send("stop");
    await once(second, "exit");
  },
);
