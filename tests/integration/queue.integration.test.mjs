import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { fork } from "node:child_process";
import { once } from "node:events";
import { URL } from "node:url";
import {
  createPgBossQueue,
  queueTransaction,
  queueNames,
} from "../../packages/queue/dist/index.js";
import { loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { migrateToLatest } from "../../packages/db/dist/migration-runtime.js";
import { createDatabaseFixture } from "./database-fixture.mjs";

const payload = { publicId: "01990000-0000-7000-8000-000000000001" };
async function until(read, accept, timeout = 15000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const result = await read();
    if (accept(result)) return result;
    await delay(100);
  }
  throw new Error("Queue test condition timed out");
}

test(
  "pg-boss QueuePort persists, transacts, consumes, retries and restarts",
  { timeout: 60000 },
  async (t) => {
    const fixture = await createDatabaseFixture();
    const config = loadConfig({ DATABASE_URL: fixture.connectionString }).database;
    const db = createDatabaseClient(config, { applicationName: "bros-test" });
    const adapters = [];
    const children = [];
    const make = (options = {}) => {
      const queue = createPgBossQueue(config, {
        retryDelay: 1,
        pollingIntervalSeconds: 0.5,
        ...options,
      });
      adapters.push(queue);
      return queue;
    };
    t.after(async () => {
      for (const child of children) {
        if (child.exitCode === null && child.signalCode === null) {
          const exited = once(child, "exit");
          child.kill("SIGKILL");
          await exited;
        }
      }
      await Promise.all(adapters.map((queue) => queue.stop()));
      await db.close();
      await fixture.cleanup();
    });
    const launch = (mode) => {
      const child = fork(new URL("./queue-process-fixture.mjs", import.meta.url), [mode], {
        env: { ...process.env, APP_ENV: "test", DATABASE_URL: fixture.connectionString },
        silent: true,
      });
      children.push(child);
      child.stdout.resume();
      child.stderr.resume();
      return child;
    };
    await migrateToLatest(fixture.db);
    let producer = make();
    await assert.rejects(producer.publish("system.test", payload), /not running/);
    await Promise.all([producer.start(), producer.start()]);
    const row = async (id) =>
      (await fixture.client.query("SELECT * FROM bros_queue.job WHERE id=$1", [id])).rows[0];
    const completed = (id) =>
      until(
        () => row(id),
        (job) => job?.state === "completed",
      );

    await t.test(
      "queue names, bounded payload, provider receipt and no side-effect browser retries",
      async () => {
        const names = (
          await fixture.client.query("SELECT name FROM bros_queue.queue ORDER BY name")
        ).rows.map((value) => value.name);
        // pg-boss Timekeeper creates this provider-owned queue when scheduling starts.
        const applicationNames = names.filter((name) => name !== "__pgboss__send-it");
        assert.deepEqual(applicationNames.sort(), [...queueNames].sort());
        await assert.rejects(producer.publish("unknown", payload), /Unknown queue/);
        await assert.rejects(
          producer.publish("system.test", { ...payload, secret: "must-not-store" }),
          /payload/,
        );
        await assert.rejects(producer.publish("system.test", { publicId: "123" }), /payload/);
        await assert.rejects(producer.publish("system.test", undefined), /payload/);
        const receipt = await producer.publish("browser.run", payload);
        assert.equal(receipt.provider, "pg-boss");
        assert.equal(typeof receipt.providerId, "string");
        assert.equal((await row(receipt.providerId)).retry_limit, 0);
      },
    );

    await t.test(
      "business writes and enqueue are invisible before commit and roll back together",
      async () => {
        let rolledBack;
        await assert.rejects(
          db.transaction(async (tx) => {
            await tx
              .insertInto("app.brand")
              .values({ brand_key: "queue-rollback", name_en: "Rollback" })
              .execute();
            rolledBack = await producer.publish("system.test", payload, queueTransaction(tx));
            assert.equal(await row(rolledBack.providerId), undefined);
            throw new Error("rollback-marker");
          }),
          /rollback-marker/,
        );
        assert.equal(await row(rolledBack.providerId), undefined);
        assert.equal(
          (await fixture.client.query("SELECT id FROM app.brand WHERE brand_key='queue-rollback'"))
            .rowCount,
          0,
        );
        let committed;
        await db.transaction(async (tx) => {
          await tx
            .insertInto("app.brand")
            .values({ brand_key: "queue-commit", name_en: "Commit" })
            .execute();
          committed = await producer.publish("system.test", payload, queueTransaction(tx));
          assert.equal(await row(committed.providerId), undefined);
        });
        assert.equal((await row(committed.providerId)).state, "created");
        assert.equal(
          (await fixture.client.query("SELECT id FROM app.brand WHERE brand_key='queue-commit'"))
            .rowCount,
          1,
        );
        assert.throws(() => queueTransaction(db.db), /transaction/);
      },
    );

    await t.test(
      "queued jobs survive producer stop and two consumers claim each provider ID once",
      async () => {
        const receipts = await Promise.all(
          Array.from({ length: 4 }, () => producer.publish("system.test", payload)),
        );
        await Promise.all([producer.stop(), producer.stop()]);
        await assert.rejects(producer.publish("system.test", payload), /not running/);
        await assert.rejects(producer.start(), /new queue adapter/);
        producer = make();
        const second = make();
        await Promise.all([producer.start(), second.start()]);
        const seen = [];
        const handler = async (job) => {
          seen.push(job.providerId);
          assert.deepEqual(job.data, payload);
        };
        await Promise.all([
          producer.work("system.test", handler),
          second.work("system.test", handler),
        ]);
        await assert.rejects(producer.work("system.test", handler), /already registered/);
        await Promise.all(receipts.map((receipt) => completed(receipt.providerId)));
        for (const receipt of receipts)
          assert.equal(seen.filter((id) => id === receipt.providerId).length, 1);
        await second.stop();
      },
    );

    await t.test(
      "failed handlers retry with backoff, bounded attempts and sanitized stored output",
      async () => {
        const attempts = [];
        await producer.work("product.import", async (job) => {
          attempts.push(job.attempt);
          if (job.attempt < 2) throw new Error("private-sql-secret-marker");
        });
        const receipt = await producer.publish("product.import", payload);
        const success = await completed(receipt.providerId);
        assert.deepEqual(attempts, [1, 2]);
        assert.equal(success.retry_backoff, true);
        assert.equal(success.retry_delay, 1);
        assert.equal(success.retry_limit, 2);
        await producer.work("identifier.resolve", async () => {
          throw new Error("private-sql-secret-marker");
        });
        const failure = await producer.publish("identifier.resolve", payload);
        const failed = await until(
          () => row(failure.providerId),
          (job) => job?.state === "failed",
        );
        assert.equal(failed.retry_count, 2);
        assert.doesNotMatch(JSON.stringify(failed.output), /private-sql-secret-marker/);
        assert.match(JSON.stringify(failed.output), /Queue handler failed/);
      },
    );

    await t.test("graceful stop waits for an active handler and preserves completion", async () => {
      let release;
      const barrier = new Promise((resolve) => {
        release = resolve;
      });
      t.after(() => release());
      await producer.work("thumbnail.generate", async () => {
        await barrier;
      });
      const receipt = await producer.publish("thumbnail.generate", payload);
      await until(
        () => row(receipt.providerId),
        (job) => job?.state === "active",
      );
      let stopped = false;
      const stopping = producer.stop().then(() => {
        stopped = true;
      });
      await delay(50);
      assert.equal(stopped, false);
      release();
      await stopping;
      assert.equal((await row(receipt.providerId)).state, "completed");
    });

    await t.test(
      "process death before enqueue and after enqueue before commit rolls back business and queue writes",
      async () => {
        for (const mode of ["before", "after"]) {
          const child = launch(mode);
          const [message] = await once(child, "message");
          assert.equal(message.event, "uncommitted");
          const exited = once(child, "exit");
          child.kill("SIGKILL");
          await exited;
          const brands = await until(
            () =>
              fixture.client.query("SELECT id FROM app.brand WHERE brand_key=$1", [
                `crash-${mode}`,
              ]),
            (result) => result.rowCount === 0,
          );
          assert.equal(brands.rowCount, 0);
          if (message.providerId) assert.equal(await row(message.providerId), undefined);
        }
      },
    );

    await t.test("an active job is redelivered after a consumer crash and expiration", async () => {
      const recovery = make({ expireInSeconds: 1, superviseIntervalSeconds: 1 });
      await recovery.start();
      const child = launch("active");
      await once(child, "message");
      const claimed = once(child, "message");
      const receipt = await recovery.publish("system.test", payload);
      const [message] = await claimed;
      assert.equal(message.providerId, receipt.providerId);
      const exited = once(child, "exit");
      child.kill("SIGKILL");
      await exited;
      const attempts = [];
      await recovery.work("system.test", async (job) => {
        attempts.push(job.attempt);
      });
      await completed(receipt.providerId);
      assert.deepEqual(attempts, [2]);
      await recovery.stop();
    });
  },
);
