import { startApi } from "../../apps/api/dist/index.js";
import { loadConfigFromProcess } from "../../packages/core/dist/index.js";

const config = loadConfigFromProcess();
config.api.port = 0;
const runtime = await startApi(config);
let release;
process.on("message", (message) => {
  if (message === "signal") process.emit("SIGTERM");
  if (message === "release") release?.();
  if (message === "hold") {
    void runtime.data.database
      .transaction(async () => {
        const barrier = new Promise((resolve) => {
          release = resolve;
        });
        process.send({ event: "held" });
        await barrier;
      })
      .catch(() => {
        process.exitCode = 1;
      });
  }
});
process.send({ event: "ready", port: runtime.app.server.address().port });
// Test-only IPC must not keep a gracefully stopped production runtime alive.
process.channel.unref();
