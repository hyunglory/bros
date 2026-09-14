import { loadConfigFromProcess } from "../../packages/core/dist/index.js";
import { createPgBossQueue } from "../../packages/queue/dist/index.js";
import { startWorker } from "../../apps/worker/dist/index.js";

const config = loadConfigFromProcess();
const queue = createPgBossQueue(config.database, {
  pollingIntervalSeconds: 0.5,
  superviseIntervalSeconds: 1,
});
const worker = await startWorker(config, { queue });
process.on("message", (message) => {
  if (message === "signal") process.emit("SIGTERM");
});
process.send({ event: "ready", ready: await worker.isReady() });
process.channel.unref();
