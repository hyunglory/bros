import { loadConfigFromProcess } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { createPgBossQueue } from "../../packages/queue/dist/index.js";
import { createResolverPipeline } from "../../packages/resolver/dist/index.js";
import { startWorker } from "../../apps/worker/dist/index.js";
const config = loadConfigFromProcess();
const database = createDatabaseClient(config.database, { applicationName: "bros-test" });
const pipeline = createResolverPipeline(database);
const worker = await startWorker(config, {
  queue: createPgBossQueue(config.database, {
    expireInSeconds: 2,
    retryDelay: 1,
    pollingIntervalSeconds: 0.5,
    superviseIntervalSeconds: 1,
  }),
  resolverPipeline:
    process.argv[2] === "hold"
      ? {
          ...pipeline,
          resolve() {
            return new Promise(() => {
              /* Wait for process death. */
            });
          },
        }
      : pipeline,
});
process.on("message", async (message) => {
  if (message === "stop") {
    await worker.stop();
    await database.close();
    process.disconnect();
  }
});
