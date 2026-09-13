import { createRedactedLogger } from "@bros/core";
import type { AppConfig } from "@bros/core";
import { createWorker } from "./runtime.js";
import type { WorkerOptions } from "./runtime.js";

export async function startWorker(config: AppConfig, options: WorkerOptions = {}) {
  const logger = options.logger ?? createRedactedLogger();
  const runtime = createWorker(config, { ...options, logger });
  let stopping: Promise<void> | undefined;
  const shutdown = () =>
    (stopping ??= (async () => {
      const deadline = setTimeout(() => {
        logger.fatal({ code: "WORKER_SHUTDOWN_TIMEOUT" }, "Worker shutdown deadline exceeded");
        process.exit(1);
      }, config.worker.shutdownTimeoutMs);
      try {
        await runtime.stop();
        logger.info({ code: "WORKER_STOPPED" }, "Worker stopped");
      } catch {
        logger.error({ code: "WORKER_SHUTDOWN_FAILED" }, "Worker shutdown failed");
        process.exit(1);
      } finally {
        clearTimeout(deadline);
        process.off("SIGTERM", signal);
        process.off("SIGINT", signal);
      }
    })());
  const signal = () => {
    void shutdown();
  };
  process.on("SIGTERM", signal);
  process.on("SIGINT", signal);
  try {
    await runtime.start();
  } catch {
    await shutdown();
    throw new Error("Worker startup failed");
  }
  return { ...runtime, shutdown };
}
