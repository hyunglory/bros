import type { AppConfig } from "@bros/core";
import { createRedactedLogger } from "@bros/core";
import { createApiApp } from "./app.js";

// Process ownership belongs here; importing the application never listens or registers signals.
export async function startApi(config: AppConfig) {
  const logger = createRedactedLogger();
  const runtime = createApiApp(config, logger);
  let stopping: Promise<void> | undefined;
  const shutdown = () =>
    (stopping ??= (async () => {
      const deadline = setTimeout(() => {
        logger.fatal({ code: "API_SHUTDOWN_TIMEOUT" }, "API shutdown deadline exceeded");
        process.exit(1);
      }, config.api.shutdownTimeoutMs);
      try {
        await runtime.close();
        logger.info({ code: "API_STOPPED" }, "API stopped");
      } catch {
        logger.error({ code: "API_SHUTDOWN_FAILED" }, "API shutdown failed");
        process.exit(1);
      } finally {
        clearTimeout(deadline);
        process.off("SIGTERM", onSignal);
        process.off("SIGINT", onSignal);
      }
    })());
  const onSignal = () => {
    void shutdown();
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
  try {
    await runtime.start();
    await runtime.app.listen({ host: config.api.host, port: config.api.port });
  } catch {
    await shutdown();
    throw new Error("API startup failed");
  }
  return { ...runtime, shutdown };
}
