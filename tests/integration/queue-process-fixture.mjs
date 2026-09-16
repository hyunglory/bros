import { createPgBossQueue, queueTransaction } from "../../packages/queue/dist/index.js";
import { loadConfigFromProcess } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";

const config = loadConfigFromProcess().database;
const queue = createPgBossQueue(config, {
  pollingIntervalSeconds: 0.5,
  superviseIntervalSeconds: 1,
});
await queue.start();
const mode = process.argv[2];
const payload = { publicId: "01990000-0000-7000-8000-000000000002" };
if (mode === "active") {
  await queue.work("system.test", async (job) => {
    process.send({ event: "active", providerId: job.providerId });
    await new Promise(() => undefined);
  });
  process.send({ event: "ready" });
} else {
  const db = createDatabaseClient(config, { applicationName: "bros-test" });
  await db.transaction(async (tx) => {
    await tx
      .insertInto("app.brand")
      .values({ brand_key: `crash-${mode}`, name_en: "Crash fixture" })
      .execute();
    const receipt =
      mode === "before"
        ? undefined
        : await queue.publish("system.test", payload, queueTransaction(tx));
    process.send({ event: "uncommitted", providerId: receipt?.providerId });
    await new Promise(() => undefined);
  });
}
