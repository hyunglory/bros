import assert from "node:assert/strict";
import test from "node:test";
import { createPgBossQueue } from "../dist/index.js";
import { loadConfig } from "@bros/core";

const database = loadConfig({ DATABASE_URL: "postgresql://unused@127.0.0.1:1/unused" }).database;
test("queue configuration rejects unsafe timing and retry bounds without reflecting values", () => {
  for (const options of [
    { retryLimit: -1 },
    { retryLimit: 11 },
    { retryDelay: 0 },
    { retryDelayMax: 1 },
    { expireInSeconds: 0 },
    { pollingIntervalSeconds: 0.1 },
    { stopTimeoutMs: 0 },
    { superviseIntervalSeconds: 0 },
    { retryLimit: "private-marker" },
  ]) {
    assert.throws(
      () => createPgBossQueue(database, options),
      (error) => {
        assert.doesNotMatch(error.message, /private-marker/);
        return true;
      },
    );
  }
});
test("stopping an unused adapter is idempotent and permanently closes its acceptance gate", async () => {
  const queue = createPgBossQueue(database);
  await Promise.all([queue.stop(), queue.stop()]);
  await assert.rejects(queue.start(), /new queue adapter/);
  await assert.rejects(queue.publish("system.test", { publicId: "unused" }), /not running/);
});
