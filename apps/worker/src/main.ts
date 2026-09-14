import { createRedactedLogger, loadConfigFromProcess } from "@bros/core";
import { startWorker } from "./bootstrap.js";
try {
  process.umask(0o077);
  await startWorker(loadConfigFromProcess("worker"));
} catch {
  createRedactedLogger().error(
    { code: "WORKER_STARTUP_FAILED" },
    "Worker startup failed; check configuration and baseline",
  );
  process.exitCode = 1;
}
