import assert from "node:assert/strict";
import test from "node:test";
import { fork } from "node:child_process";
import { once } from "node:events";
import { URL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest, createMigrator } from "../../packages/db/dist/migration-runtime.js";
import {
  createPostgresProviderQuota,
  createBraveSearchProvider,
  createIdentifierPatternRegistry,
  ExternalProviderFailure,
} from "../../packages/resolver/dist/index.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

const policy = {
  providerKey: "brave",
  providerId: "brave-web-search-v1",
  accountKey: "fixture-account",
  ownerId: "worker-a",
  dailyBudgetMicrousd: 30,
  requestCostMicrousd: 10,
  minIntervalMs: 25,
  rateLimitCooldownMs: 60,
};
const request = (p = policy, signal = new globalThis.AbortController().signal) => ({
  ...p,
  costMicrousd: p.requestCostMicrousd,
  signal,
});
const source = {
  schemaVersion: 1,
  sourceProductPublicId: "01890f47-0c4d-7abc-8def-1234567890ab",
  productPublicId: null,
  platformCode: "FIXTURE",
  externalProductId: "1",
  productName: "Fixture",
  brandName: "Fixture",
  productUrl: null,
  collectedAt: "2026-09-15T00:00:00Z",
  raw: {},
  import: null,
};
async function waitAvailable(quota) {
  const state = await quota.inspect();
  if (state) await delay(Math.max(0, state.nextAllowedAt.getTime() - Date.now()) + 10);
}
test(
  "BLK-005 PostgreSQL quota bounds all workers and retains uncertain reservations",
  { timeout: 60000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    const config = loadConfig({ DATABASE_URL: fixture.connectionString, DB_POOL_MAX: "8" });
    const database = createDatabaseClient(config.database, { applicationName: "bros-test" });
    const secondDatabase = createDatabaseClient(config.database, { applicationName: "bros-test" });
    t.after(async () => {
      await database.close();
      await secondDatabase.close();
      await fixture.cleanup();
    });
    await migrateToLatest(fixture.db);
    const make = (overrides = {}, db = database) =>
      createPostgresProviderQuota(db, { ...policy, ...overrides });

    await t.test(
      "concurrent workers reserve once, enforce completion spacing and exhaust exact shared budget",
      async () => {
        const a = make(),
          b = make({ ownerId: "worker-b" }, secondDatabase);
        let end, started;
        const entered = new Promise((resolve) => {
          started = resolve;
        });
        const first = a.execute(request(), async () => {
          started();
          await new Promise((resolve) => {
            end = resolve;
          });
          return 1;
        });
        await entered;
        const blocked = await Promise.allSettled(
          Array.from({ length: 12 }, () =>
            b.execute(request(), () => assert.fail("must not call")),
          ),
        );
        assert.ok(blocked.every((r) => r.status === "rejected" && r.reason.code === "RATE_LIMIT"));
        assert.equal((await a.inspect()).reservedMicrousd, "10");
        end();
        assert.equal(await first, 1);
        await assert.rejects(
          b.execute(request(), () => assert.fail()),
          { code: "RATE_LIMIT" },
        );
        await waitAvailable(b);
        await b.execute(request(), async () => 2);
        await waitAvailable(a);
        await a.execute(request(), async () => 3);
        await waitAvailable(b);
        await assert.rejects(
          b.execute(request(), () => assert.fail()),
          { code: "BUDGET_EXCEEDED" },
        );
        assert.equal((await b.inspect()).reservedMicrousd, "30");
        const upgradedPolicy = { ...policy, providerId: "brave-web-search-v2" };
        await assert.rejects(
          make(upgradedPolicy, secondDatabase).execute(request(upgradedPolicy), () =>
            assert.fail(),
          ),
          { code: "BUDGET_EXCEEDED" },
        );
        const mismatched = make({ dailyBudgetMicrousd: 300 });
        await assert.rejects(
          mismatched.execute(request({ ...policy, dailyBudgetMicrousd: 300 }), () => assert.fail()),
          { code: "QUOTA_POLICY_MISMATCH" },
        );
      },
    );
    await t.test(
      "DB UTC day ignores worker hints and previous day usage; account budgets are isolated",
      async () => {
        const overrides = { accountKey: "utc-account" },
          q = make(overrides),
          p = { ...policy, ...overrides };
        await q.execute({ ...request(p), utcDay: "1999-01-01" }, async () => true);
        const day = (
          await fixture.client.query(
            "select to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD') as day",
          )
        ).rows[0].day;
        assert.equal((await q.inspect()).utcDay, day);
        await fixture.client.query(
          "insert into bros_provider.daily_budget select id, (clock_timestamp() at time zone 'UTC')::date - 1, 30 from bros_provider.account where account_key='utc-account'",
        );
        await waitAvailable(q);
        await q.execute(request(p), async () => true);
        assert.equal((await q.inspect()).reservedMicrousd, "20");
        assert.equal((await make().inspect()).reservedMicrousd, "30");
      },
    );
    await t.test(
      "failed reservation transaction rolls back counters and abort during row lock never dispatches",
      async () => {
        const p = { ...policy, accountKey: "rollback" },
          q = make(p);
        await fixture.client.query(
          "create function bros_provider.fail_insert() returns trigger language plpgsql as $$ begin raise exception 'private-quota-db-marker'; end $$",
        );
        await fixture.client.query(
          "create trigger fail_insert before insert on bros_provider.reservation for each row execute function bros_provider.fail_insert()",
        );
        try {
          await assert.rejects(
            q.execute(request(p), () => assert.fail()),
            { code: "QUOTA_STORAGE_FAILED" },
          );
        } finally {
          await fixture.client.query("drop trigger fail_insert on bros_provider.reservation");
          await fixture.client.query("drop function bros_provider.fail_insert()");
        }
        assert.equal(await q.inspect(), null);
        await q.execute(request(p), async () => true);
        await waitAvailable(q);
        const holder = await fixture.client.connect();
        try {
          await holder.query("begin");
          await holder.query(
            "select id from bros_provider.account where account_key='rollback' for update",
          );
          const abort = new globalThis.AbortController();
          const pending = q.execute(request(p, abort.signal), () => assert.fail());
          const rejected = assert.rejects(pending, { code: "TIMEOUT" });
          await delay(30);
          abort.abort();
          await holder.query("commit");
          await rejected;
          assert.equal((await q.inspect()).reservedMicrousd, "10");
        } finally {
          await holder.query("rollback");
          holder.release();
        }
      },
    );
    await t.test(
      "failed completion commit retains active lease and debit until explicit recovery",
      async () => {
        const p = { ...policy, accountKey: "completion-failure" },
          q = make(p);
        await fixture.client.query(
          "create function bros_provider.fail_release() returns trigger language plpgsql as $$ begin if OLD.active_reservation_id is not null and NEW.active_reservation_id is null then raise exception 'private-release-marker'; end if; return NEW; end $$",
        );
        await fixture.client.query(
          "create trigger fail_release before update on bros_provider.account for each row execute function bros_provider.fail_release()",
        );
        let called = false;
        try {
          await assert.rejects(
            q.execute(request(p), async () => {
              called = true;
              return true;
            }),
            { code: "QUOTA_STORAGE_FAILED" },
          );
          assert.equal(called, true);
          const state = await q.inspect();
          assert.equal(state.reservedMicrousd, "10");
          assert.ok(state.activeReservationId);
          assert.equal(
            (
              await fixture.client.query(
                "select status from bros_provider.reservation where id=$1",
                [state.activeReservationId],
              )
            ).rows[0].status,
            "ACTIVE",
          );
          await assert.rejects(
            make(p, secondDatabase).execute(request(p), () => assert.fail()),
            { code: "RATE_LIMIT" },
          );
        } finally {
          await fixture.client.query("drop trigger fail_release on bros_provider.account");
          await fixture.client.query("drop function bros_provider.fail_release()");
        }
        await q.recoverAbandoned({
          reservationId: (await q.inspect()).activeReservationId,
          actor: "fixture-operator",
          reason: "Callback completed; failed release transaction has rolled back",
        });
        assert.equal((await q.inspect()).reservedMicrousd, "10");
        assert.equal((await q.inspect()).activeReservationId, null);
      },
    );
    await t.test(
      "429 cooldown is durable across instances; failed paid attempts are never refunded",
      async () => {
        const p = { ...policy, accountKey: "cooldown" },
          a = make(p),
          b = make(p, secondDatabase);
        await assert.rejects(
          a.execute(request(p), async () => {
            throw new ExternalProviderFailure("RATE_LIMIT", 150);
          }),
          { code: "RATE_LIMIT" },
        );
        assert.equal((await a.inspect()).reservedMicrousd, "10");
        await assert.rejects(
          b.execute(request(p), () => assert.fail()),
          { code: "RATE_LIMIT" },
        );
        await waitAvailable(b);
        await b.execute(request(p), async () => true);
        assert.equal((await b.inspect()).reservedMicrousd, "20");
      },
    );
    await t.test(
      "actual process death preserves active lease and debit; fenced operator recovery survives restart",
      async () => {
        const p = { ...policy, accountKey: "crash", ownerId: "crash-process" };
        const child = fork(new URL("./provider-quota-process-fixture.mjs", import.meta.url), [], {
          env: { ...process.env, TEST_DATABASE_URL: fixture.connectionString },
          stdio: ["ignore", "ignore", "ignore", "ipc"],
        });
        const exit = once(child, "exit");
        try {
          const message = once(child, "message");
          child.send(p);
          const [reply] = await message;
          assert.equal(reply.status, "ACTIVE");
          await assert.rejects(
            make({ ...p, ownerId: "other-process" }, secondDatabase).execute(request(p), () =>
              assert.fail(),
            ),
            { code: "RATE_LIMIT" },
          );
          child.kill("SIGKILL");
          await exit;
          const restarted = make({ ...p, ownerId: "restarted" }, secondDatabase);
          assert.equal((await restarted.inspect()).reservedMicrousd, "10");
          await assert.rejects(
            restarted.execute(request(p), () => assert.fail()),
            { code: "RATE_LIMIT" },
          );
          await restarted.recoverAbandoned({
            reservationId: reply.reservation.activeReservationId,
            actor: "fixture-operator",
            reason: "Owning child process exited after SIGKILL",
          });
          await assert.rejects(
            restarted.recoverAbandoned({
              reservationId: reply.reservation.activeReservationId,
              actor: "fixture-operator",
              reason: "stale recovery",
            }),
            { code: "QUOTA_LEASE_CONFLICT" },
          );
          assert.equal((await restarted.inspect()).reservedMicrousd, "10");
          await waitAvailable(restarted);
          await restarted.execute(request(p), async () => true);
          const audit = (
            await fixture.client.query(
              "select status, recovery_actor from bros_provider.reservation where id=$1",
              [reply.reservation.activeReservationId],
            )
          ).rows[0];
          assert.deepEqual(audit, { status: "RECOVERED", recovery_actor: "fixture-operator" });
          assert.equal((await restarted.inspect()).reservedMicrousd, "20");
        } finally {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGKILL");
            await exit;
          }
        }
      },
    );
    await t.test(
      "Brave fixture uses shared admission before transport, no double debit and no late call after timeout",
      async () => {
        const p = { ...policy, accountKey: "brave", minIntervalMs: 20 },
          q = make(p);
        const providerPolicy = {
          ...p,
          maxRequestCostMicrousd: 10,
          timeoutMs: 80,
          failureThreshold: 5,
          circuitOpenMs: 200,
        };
        let calls = 0,
          release;
        const factory = () =>
          createBraveSearchProvider({
            mode: "fixture",
            registry: createIdentifierPatternRegistry({ version: "fixture/v1", patterns: [] }),
            quota: q,
            policy: providerPolicy,
            secretProvider: {
              async get() {
                return "fixture-key";
              },
            },
            budget: {
              scope: "FIXTURE_MEMORY",
              async reserve() {
                assert.fail("quota must own debit");
              },
            },
            transport: async () => {
              calls++;
              await new Promise((resolve) => {
                release = resolve;
              });
              return new globalThis.Response(JSON.stringify({ web: { results: [] } }), {
                status: 200,
              });
            },
          });
        const first = factory(),
          second = factory();
        const result = await first.search({ brandKey: "fixture", input: source });
        assert.equal(result.code, "TIMEOUT");
        assert.equal(calls, 1);
        assert.equal(
          (await second.search({ brandKey: "fixture", input: source })).code,
          "RATE_LIMIT",
        );
        assert.equal(calls, 1);
        assert.equal((await q.inspect()).reservedMicrousd, "10");
        release();
        for (let i = 0; i < 50 && (await q.inspect()).activeReservationId; i++) await delay(10);
        assert.equal((await q.inspect()).activeReservationId, null);
      },
    );
    await t.test("late 429 after provider timeout still persists account cooldown", async () => {
      const p = { ...policy, accountKey: "late-429" },
        q = make(p);
      let reply;
      const provider = createBraveSearchProvider({
        mode: "fixture",
        registry: createIdentifierPatternRegistry({ version: "fixture/v1", patterns: [] }),
        quota: q,
        policy: {
          ...p,
          maxRequestCostMicrousd: 10,
          timeoutMs: 80,
          failureThreshold: 5,
          circuitOpenMs: 200,
        },
        secretProvider: {
          async get() {
            return "fixture-key";
          },
        },
        transport: async () => {
          await new Promise((resolve) => {
            reply = resolve;
          });
          return new globalThis.Response("", { status: 429, headers: { "retry-after": "1" } });
        },
      });
      assert.equal((await provider.search({ brandKey: "fixture", input: source })).code, "TIMEOUT");
      reply();
      for (let i = 0; i < 50 && (await q.inspect()).activeReservationId; i++) await delay(10);
      const state = await q.inspect();
      assert.equal(state.activeReservationId, null);
      assert.ok(state.nextAllowedAt.getTime() - Date.now() > 500);
      await assert.rejects(
        make(p, secondDatabase).execute(request(p), () => assert.fail()),
        { code: "RATE_LIMIT" },
      );
      assert.equal((await q.inspect()).reservedMicrousd, "10");
    });
    await t.test("quota migration down/up is reproducible in the disposable fixture", async () => {
      const down = await createMigrator(fixture.db).migrateDown();
      assert.equal(down.error, undefined);
      assert.equal(
        (
          await fixture.client.query(
            "select count(*) from information_schema.schemata where schema_name='bros_provider'",
          )
        ).rows[0].count,
        "0",
      );
      await migrateToLatest(fixture.db);
      assert.equal(
        (await fixture.client.query("select count(*) from bros_provider.reservation")).rows[0]
          .count,
        "0",
      );
    });
  },
);
