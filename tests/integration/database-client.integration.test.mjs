import assert from "node:assert/strict";
import test from "node:test";
import { createApiDataAccess } from "../../apps/api/dist/index.js";
import { createWorkerDataAccess } from "../../apps/worker/dist/index.js";
import { loadConfig } from "../../packages/core/dist/index.js";
import {
  createDatabaseClient,
  createPlatformRepository,
  withTransaction,
} from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

test(
  "API and Worker share typed repositories and transaction lifecycle",
  { timeout: 60_000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    let api;
    let worker;
    t.after(async () => {
      await api?.database.close();
      await worker?.database.close();
      await fixture.cleanup();
    });
    await migrateToLatest(fixture.db);
    const config = loadConfig({
      DATABASE_URL: fixture.connectionString,
      DB_POOL_MAX: "1",
      DB_CONNECTION_TIMEOUT_MS: "200",
      DB_STATEMENT_TIMEOUT_MS: "200",
    }).database;
    api = createApiDataAccess(config);
    worker = createWorkerDataAccess(config);

    await t.test(
      "both application entry points read real data with public-only projections",
      async () => {
        const [apiRows, workerRows] = await Promise.all([
          api.platforms.list(),
          worker.platforms.list(),
        ]);
        assert.deepEqual(apiRows, workerRows);
        assert.equal(apiRows.length, 4);
        assert.equal(
          apiRows.some((row) => "id" in row || "public_id" in row),
          false,
        );
        const row = await api.database.db
          .selectFrom("app.platform")
          .selectAll()
          .executeTakeFirstOrThrow();
        assert.equal(typeof row.id, "string");
        assert.ok(row.created_at instanceof Date);
        assert.deepEqual(row.config_json, {});
      },
    );

    const platform = (await api.platforms.list())[0];
    await t.test("commit persists repository changes for a separate Worker pool", async () => {
      await api.database.transaction(async (tx) => {
        const repository = createPlatformRepository(tx);
        await repository.setActive(platform.publicId, false);
        assert.equal((await repository.findByPublicId(platform.publicId)).isActive, false);
        assert.equal((await worker.platforms.findByPublicId(platform.publicId)).isActive, true);
      });
      assert.equal((await worker.platforms.findByPublicId(platform.publicId)).isActive, false);
    });

    await t.test("callback failure rolls back all writes and does not retry", async () => {
      let attempts = 0;
      await assert.rejects(
        api.database.transaction(async (tx) => {
          attempts++;
          await createPlatformRepository(tx).setActive(platform.publicId, true);
          await tx
            .insertInto("app.brand")
            .values({ brand_key: "rollback-only", name_en: "Rollback" })
            .execute();
          throw new Error("rollback-marker");
        }),
        /rollback-marker/,
      );
      assert.equal(attempts, 1);
      assert.equal((await worker.platforms.findByPublicId(platform.publicId)).isActive, false);
      assert.equal(
        (
          await worker.database.db
            .selectFrom("app.brand")
            .select("id")
            .where("brand_key", "=", "rollback-only")
            .execute()
        ).length,
        0,
      );
    });

    await t.test("DB constraint errors roll back and release the single connection", async () => {
      await assert.rejects(
        api.database.transaction(async (tx) => {
          await createPlatformRepository(tx).setActive(platform.publicId, true);
          await tx.insertInto("app.brand").values({ brand_key: "invalid-name" }).execute();
        }),
        (error) => error.code === "23514",
      );
      assert.equal((await api.platforms.findByPublicId(platform.publicId)).isActive, false);
      assert.equal(api.database.poolStats().total, 1);
      assert.equal(api.database.poolStats().idle, 1);
    });

    await t.test(
      "nested transactions are rejected instead of using an independent commit",
      async () => {
        await api.database.transaction(async (tx) => {
          assert.throws(() => withTransaction(tx, async () => undefined), /Nested transactions/);
        });
      },
    );

    await t.test(
      "pool saturation times out and recovers after the held transaction exits",
      async () => {
        await api.database.transaction(async () => {
          await assert.rejects(api.platforms.list(), /timeout|connect/i);
          assert.equal(api.database.poolStats().total, 1);
        });
        assert.equal((await api.platforms.list()).length, 4);
      },
    );

    await t.test(
      "statement timeout cancels a blocked query without poisoning the pool",
      async () => {
        await fixture.client.query(
          "CREATE FUNCTION app.test_pause() RETURNS boolean LANGUAGE sql AS 'SELECT true FROM pg_sleep(2)'",
        );
        // Trigger a server-side wait on the real runtime connection.
        const blocked = api.database.db
          .selectFrom("app.platform")
          .select("id")
          .where(({ fn }) => fn("app.test_pause", []), "=", true)
          .execute();
        await assert.rejects(blocked, (error) => error.code === "57014");
        assert.equal((await api.platforms.list()).length, 4);
      },
    );

    await t.test("close is idempotent, drains pools, and rejects subsequent queries", async () => {
      await Promise.all([api.database.close(), api.database.close(), worker.database.close()]);
      assert.equal(api.database.poolStats().total, 0);
      assert.equal(worker.database.poolStats().total, 0);
      await assert.rejects(api.platforms.list());
      const temporary = createDatabaseClient(config, { applicationName: "bros-test" });
      assert.equal(temporary.poolStats().total, 0);
      await temporary.close();
    });
  },
);
