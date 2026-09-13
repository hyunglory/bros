import { startWorker } from "../../apps/worker/dist/index.js";
import { createPgBossQueue } from "../../packages/queue/dist/index.js";
import { loadConfigFromProcess } from "../../packages/core/dist/index.js";

const config = loadConfigFromProcess();
const mode = process.argv[2];
let calls = 0;
let release;
const queue = createPgBossQueue(config.database, {
  pollingIntervalSeconds: 0.5,
  superviseIntervalSeconds: 1,
});
const action = async () => {
  calls++;
  if ((mode === "retry" && calls === 1) || mode === "fail")
    throw new Error("worker-private-marker");
  if (mode === "hold") {
    process.send({ event: "held" });
    await new Promise((resolve) => {
      release = resolve;
    });
  }
  return { checked: true };
};
const worker = await startWorker(config, {
  queue,
  ...(mode === "normal" ? {} : { systemTestAction: action }),
});
process.on("message", (message) => {
  if (message === "signal") process.emit("SIGTERM");
  if (message === "release") release?.();
});
process.send({ event: "ready", ready: await worker.isReady() });
process.channel.unref();
