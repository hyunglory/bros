import assert from "node:assert/strict";
import test from "node:test";
import { loadConfig, createRedactedLogger } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import {
  createResolveRunService,
  createIdentifierReviewService,
} from "../../packages/resolver/dist/index.js";
import { createApiApp } from "../../apps/api/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";
import { createPgBossQueue } from "../../packages/queue/dist/index.js";

test(
  "P3-13 review API permissions, public projections and atomic human decisions",
  { timeout: 90000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    let database;
    const apps = [];
    t.after(async () => {
      for (const api of apps) await api.close();
      await database?.close();
      await fixture.cleanup();
    });
    await migrateToLatest(fixture.db);
    const config = loadConfig({
      DATABASE_URL: fixture.connectionString,
      API_LOCAL_UNAUTHENTICATED: "true",
    });
    database = createDatabaseClient(config.database, { applicationName: "bros-test" });
    const db = database.db,
      runs = createResolveRunService(database);
    const logger = createRedactedLogger({
      write() {
        return true;
      },
    });
    const api = createApiApp(config, logger);
    apps.push(api);
    await api.start();
    const uuid = async () => (await fixture.client.query("select uuidv7() as id")).rows[0].id;
    const platform = await db
      .selectFrom("app.platform")
      .select("id")
      .where("code", "=", "MUSINSA")
      .executeTakeFirstOrThrow();
    const brand = await db
      .insertInto("app.brand")
      .values({ brand_key: "review-fixture", name_en: "Review Fixture" })
      .returningAll()
      .executeTakeFirstOrThrow();
    await db
      .insertInto("app.brand_alias")
      .values({ brand_id: brand.id, alias_name: "Review Fixture", alias_norm: "review fixture" })
      .execute();
    let counter = 0;
    async function fixtureRun(values = ["AB-123"], conflicts = []) {
      const product = await db
        .insertInto("app.product_master")
        .values({
          brand_id: brand.id,
          product_name: `Review ${++counter}`,
          product_name_norm: `review ${counter}`,
          created_method: "FIXTURE",
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const source = await db
        .insertInto("app.source_product")
        .values({
          product_id: product.id,
          platform_id: platform.id,
          external_product_id: `review-${counter}`,
          raw_product_name: product.product_name,
          raw_brand_name: "Review Fixture",
          raw_json: JSON.stringify({ privateMarker: "private-source-raw-marker" }),
          collected_at: "2026-09-15T00:00:00Z",
          last_seen_at: "2026-09-15T00:00:00Z",
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      const run = await runs.create({
        sourceProductPublicId: source.public_id,
        resolverVersion: "review-test/v1",
      });
      await runs.start(run.publicId);
      await runs.succeed(
        run.publicId,
        values.map((value, index) => ({
          identifierType: "MODEL_NO",
          candidateValue: value,
          candidateNorm: value.replaceAll("-", ""),
          rankNo: index + 1,
          confidenceScore: "75.00",
          evidence: [
            {
              schemaVersion: 1,
              type: "SOURCE_FIELD",
              source: "SOURCE_EXTRACTOR",
              strength: "WEAK",
              weight: 45,
              privateMarker: "private-evidence-marker",
              provenance: {
                locator: "/raw/model",
                matchedText: value,
                sourceUrl:
                  "https://evidence.example/item?tracking=private-query-marker#private-fragment-marker",
              },
            },
          ],
          conflicts,
        })),
      );
      const saved = await runs.get(run.publicId);
      return { run: saved, product, source, candidate: saved.candidates[0] };
    }
    const headers = {
      "content-type": "application/json",
      "x-bros-operation": "identifier-review",
      origin: "http://localhost:80",
    };
    function post(path, payload, extra = {}) {
      return api.app.inject({
        method: "POST",
        url: `/api/v1/identifier/${path}`,
        payload,
        headers: { ...headers, ...extra },
      });
    }
    const get = (path) => api.app.inject(`/api/v1/identifier/${path}`);
    await t.test(
      "candidate/run list cursors and detail expose only review fields, including empty runs",
      async () => {
        const first = await fixtureRun(["AA-001", "AA-002"]);
        await fixtureRun([]);
        const list = await get("reviews?limit=1");
        assert.equal(list.statusCode, 200);
        assert.equal(list.json().items.length, 1);
        assert.ok(list.json().nextCursor);
        const page2 = await get(`reviews?limit=1&cursor=${list.json().nextCursor}`);
        assert.notEqual(page2.json().items[0].publicId, list.json().items[0].publicId);
        assert.equal((await get("reviews?limit=101")).statusCode, 400);
        assert.equal((await get("reviews?cursor=broken")).statusCode, 400);
        assert.equal((await get("reviews?query=%25")).json().items.length, 0);
        assert.equal(
          (await get(`reviews?runPublicId=${first.run.publicId}`)).json().items.length,
          2,
        );
        const detail = await get(`candidates/${first.candidate.publicId}`);
        assert.equal(detail.statusCode, 200);
        assert.equal(detail.json().evidence[0].sourceUrl, "https://evidence.example/item");
        assert.doesNotMatch(
          detail.body,
          /private-|input_json|providerId|queue_json|resolve_run_id/,
        );
        assert.equal((await get("runs")).json().items[0].candidateCount, 0);
        assert.equal((await get(`runs/${first.run.publicId}`)).json().productVersion, 1);
        assert.equal((await get(`candidates/${await uuid()}`)).statusCode, 404);
      },
    );
    await t.test(
      "mutations require operation header/same origin and ignore client actor spoofing",
      async () => {
        const value = await fixtureRun(["AC-111"]),
          path = `candidates/${value.candidate.publicId}/accept`;
        assert.equal(
          (
            await api.app.inject({
              method: "POST",
              url: `/api/v1/identifier/${path}`,
              payload: { expectedVersion: 1 },
            })
          ).statusCode,
          403,
        );
        assert.equal(
          (await post(path, { expectedVersion: 1 }, { origin: "https://foreign.example" }))
            .statusCode,
          403,
        );
        assert.equal(
          (await post(path, { expectedVersion: 1 }, { "sec-fetch-site": "cross-site" })).statusCode,
          403,
        );
        assert.equal((await post(path, { expectedVersion: 1, actor: "forged" })).statusCode, 400);
        assert.equal(
          (await post(path, { expectedVersion: 1 }, { "x-bros-actor": "forged" })).statusCode,
          200,
        );
        const saved = await runs.get(value.run.publicId);
        assert.equal(saved.candidates[0].decidedBy, "local-identifier-reviewer");
        assert.equal((await post(path, { expectedVersion: 1 })).statusCode, 200);
        assert.equal(
          (
            await post(`candidates/${value.candidate.publicId}/reject`, {
              expectedVersion: 2,
              reason: "too late",
            })
          ).statusCode,
          409,
        );
      },
    );
    await t.test(
      "simultaneous accept/reject has one decision; rejection replays with immutable evidence",
      async () => {
        const value = await fixtureRun(["RA-111"]);
        const responses = await Promise.all([
          post(`candidates/${value.candidate.publicId}/accept`, { expectedVersion: 1 }),
          post(`candidates/${value.candidate.publicId}/reject`, {
            expectedVersion: 1,
            reason: "Wrong model",
          }),
        ]);
        assert.deepEqual(responses.map((r) => r.statusCode).sort(), [200, 409]);
        const rejected = await fixtureRun(["RE-111"]);
        const path = `candidates/${rejected.candidate.publicId}/reject`,
          body = { expectedVersion: 1, reason: "Wrong catalog" };
        assert.equal((await post(path, body)).statusCode, 200);
        assert.equal((await post(path, body)).statusCode, 200);
        assert.equal((await post(path, { ...body, reason: "different" })).statusCode, 409);
        const saved = await runs.get(rejected.run.publicId);
        assert.equal(saved.candidates[0].evidence.length, 2);
        assert.deepEqual(saved.candidates[0].evidence[0], rejected.candidate.evidence[0]);
        assert.equal(
          (await post(`candidates/${rejected.candidate.publicId}/accept`, { expectedVersion: 2 }))
            .statusCode,
          409,
        );
      },
    );
    await t.test(
      "manual normalization, replay, MASTER version, invalid input and cross-MASTER conflict",
      async () => {
        const value = await fixtureRun([]),
          path = `runs/${value.run.publicId}/manual`;
        const body = {
          requestPublicId: await uuid(),
          expectedVersion: 1,
          identifierType: "MODEL_NO",
          candidateValue: "MN-001",
          reason: "Product label verified",
        };
        const results = await Promise.all([post(path, body), post(path, body)]);
        assert.ok(
          results.every((r) => r.statusCode === 200),
          results.map((r) => r.body).join("\n"),
        );
        assert.deepEqual(results[0].json(), results[1].json());
        const detail = (await get(`candidates/${results[0].json().candidatePublicId}`)).json();
        assert.equal(detail.candidateNorm, "MN001");
        assert.equal(detail.decisionStatus, "ACCEPTED");
        assert.equal(detail.audit.length, 2);
        assert.equal(detail.audit[0].decision, "SUBMITTED");
        assert.notEqual(detail.runPublicId, value.run.publicId);
        assert.equal((await runs.get(value.run.publicId)).candidates.length, 0);
        assert.equal((await post(path, { ...body, candidateValue: "MN-002" })).statusCode, 409);
        assert.equal(
          (await post(path, { ...body, requestPublicId: await uuid(), candidateValue: "MN-003" }))
            .statusCode,
          409,
        );
        assert.equal(
          (
            await post(path, {
              ...body,
              requestPublicId: await uuid(),
              identifierType: "GTIN",
              candidateValue: "invalid",
            })
          ).statusCode,
          400,
        );
        const other = await fixtureRun([]);
        assert.equal(
          (
            await post(`runs/${other.run.publicId}/manual`, {
              ...body,
              requestPublicId: await uuid(),
            })
          ).statusCode,
          409,
        );
        assert.equal((await runs.get(other.run.publicId)).candidates.length, 0);
        const originalSource = await db
          .selectFrom("app.source_product")
          .selectAll()
          .where("id", "=", value.source.id)
          .executeTakeFirstOrThrow();
        await db
          .updateTable("app.source_product")
          .set({ raw_product_name: "Reimport changed" })
          .where("id", "=", value.source.id)
          .execute();
        assert.equal((await post(path, body)).statusCode, 200);
        assert.equal(
          (
            await post(path, {
              ...body,
              expectedVersion: 2,
              requestPublicId: await uuid(),
              candidateValue: "NEW-111",
            })
          ).statusCode,
          409,
        );
        assert.equal(originalSource.raw_product_name, value.product.product_name);
      },
    );
    await t.test(
      "manual insert/approval failure rolls back new run, candidate and identifier",
      async () => {
        const value = await fixtureRun([]),
          requestPublicId = await uuid();
        const body = {
          requestPublicId,
          expectedVersion: 1,
          identifierType: "MODEL_NO",
          candidateValue: "RB-111",
          reason: "checked",
        };
        await fixture.client.query(
          "create function app.fail_review_master() returns trigger language plpgsql as $$ begin raise exception 'private-db-review-marker'; end $$",
        );
        await fixture.client.query(
          "create trigger fail_review_master before update on app.product_master for each row execute function app.fail_review_master()",
        );
        try {
          const result = await post(`runs/${value.run.publicId}/manual`, body);
          assert.equal(result.statusCode, 503);
          assert.doesNotMatch(result.body, /private-db-review-marker/);
        } finally {
          await fixture.client.query("drop trigger fail_review_master on app.product_master");
          await fixture.client.query("drop function app.fail_review_master()");
        }
        assert.equal(
          (
            await db
              .selectFrom("app.identifier_resolve_run")
              .select("id")
              .where("admission_key", "=", `manual:${requestPublicId}`)
              .execute()
          ).length,
          0,
        );
        assert.equal((await post(`runs/${value.run.publicId}/manual`, body)).statusCode, 200);
      },
    );
    await t.test(
      "re-resolve enqueues one new run with actor audit, preserves original, and exposes current replay status",
      async () => {
        const value = await fixtureRun([]),
          requestPublicId = await uuid(),
          path = `runs/${value.run.publicId}/re-resolve`;
        const one = await post(path, { requestPublicId });
        assert.equal(one.statusCode, 202, one.body);
        const two = await post(path, { requestPublicId });
        assert.equal(two.statusCode, 202, two.body);
        assert.equal(one.json().publicId, two.json().publicId);
        const saved = await runs.get(one.json().publicId);
        assert.equal(saved.execution.reviewAudit.actor, "local-identifier-reviewer");
        await runs.cancel(saved.publicId);
        assert.equal((await post(path, { requestPublicId })).json().status, "CANCELLED");
        assert.equal((await runs.get(value.run.publicId)).status, "SUCCEEDED");
        const queue = createPgBossQueue(config.database);
        await queue.start();
        const failing = createApiApp(config, logger, {
          queue: {
            ...queue,
            async publish(...args) {
              await queue.publish(...args);
              throw new Error("private-queue-marker");
            },
          },
        });
        apps.push(failing);
        await failing.start();
        const failedId = await uuid();
        assert.equal(
          (
            await failing.app.inject({
              method: "POST",
              url: `/api/v1/identifier/${path}`,
              headers,
              payload: { requestPublicId: failedId },
            })
          ).statusCode,
          503,
        );
        assert.equal(
          (
            await db
              .selectFrom("app.identifier_resolve_run")
              .select("id")
              .where("admission_key", "=", `${failedId}:${value.source.public_id}`)
              .execute()
          ).length,
          0,
        );
      },
    );
    await t.test(
      "default API is closed; trusted authorization boundary rejects unauthenticated and fixes actor",
      async () => {
        const closed = createApiApp(loadConfig({ DATABASE_URL: fixture.connectionString }), logger);
        apps.push(closed);
        assert.equal((await closed.app.inject("/api/v1/identifier/reviews")).statusCode, 503);
        const guarded = createApiApp(
          loadConfig({ DATABASE_URL: fixture.connectionString }),
          logger,
          {
            identifierReviewAuthorize: async (request) =>
              request.headers.authorization === "Bearer fixture-admin-proof"
                ? { actor: "verified-admin" }
                : null,
          },
        );
        apps.push(guarded);
        await guarded.start();
        assert.equal(
          (
            await guarded.app.inject({
              url: "/api/v1/identifier/reviews",
              headers: { "x-bros-actor": "forged" },
            })
          ).statusCode,
          401,
        );
        const value = await fixtureRun(["AUTH-111"]);
        const response = await guarded.app.inject({
          method: "POST",
          url: `/api/v1/identifier/candidates/${value.candidate.publicId}/reject`,
          headers: {
            ...headers,
            authorization: "Bearer fixture-admin-proof",
            "x-bros-actor": "forged",
          },
          payload: { expectedVersion: 1, reason: "Verified review" },
        });
        assert.equal(response.statusCode, 200, response.body);
        assert.equal(
          (await runs.get(value.run.publicId)).candidates[0].decidedBy,
          "verified-admin",
        );
        await assert.rejects(
          createIdentifierReviewService(database).reject(
            value.candidate.publicId,
            2,
            "secret=unsafe",
            "actor",
          ),
          { code: "INVALID_REVIEW_INPUT" },
        );
      },
    );
  },
);
