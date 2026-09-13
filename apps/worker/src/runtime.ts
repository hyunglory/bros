import { createRedactedLogger } from "@bros/core";
import type { AppConfig } from "@bros/core";
import { createPgBossQueue } from "@bros/queue";
import type { QueuePort, QueueName, QueueJob } from "@bros/queue";
import { createWorkerDataAccess } from "./database.js";
import { createSystemTestHandler } from "./system-test.js";
import type { SystemTestAction } from "./system-test.js";

export interface WorkerOptions {
  queue?: QueuePort;
  systemTestAction?: SystemTestAction;
  logger?: ReturnType<typeof createRedactedLogger>;
}

export function createWorker(config: AppConfig, options: WorkerOptions = {}) {
  const data = createWorkerDataAccess(config.database);
  const queue =
    options.queue ??
    createPgBossQueue(config.database, { localConcurrency: config.worker.concurrency });
  const logger = options.logger ?? createRedactedLogger();
  const action: SystemTestAction =
    options.systemTestAction ??
    (async () => {
      const result = await data.database.db
        .selectFrom("app.platform")
        .select((eb) => eb.fn.count<string>("id").as("count"))
        .executeTakeFirstOrThrow();
      return { platformCount: result.count };
    });
  const registry = new Map<QueueName, (job: QueueJob) => Promise<void>>([
    ["system.test", createSystemTestHandler(data.database, action, logger)],
  ]);
  let state: "idle" | "starting" | "ready" | "stopping" | "stopped" | "failed" = "idle";
  let starting: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;
  return {
    data,
    queue,
    async isReady() {
      if (state !== "ready") return false;
      try {
        await data.database.db.selectNoFrom((eb) => eb.val(1).as("alive")).execute();
        return state === "ready";
      } catch {
        return false;
      }
    },
    start() {
      if ((state === "starting" || state === "ready") && starting) return starting;
      if (state !== "idle") return Promise.reject(new Error("Worker cannot restart"));
      state = "starting";
      starting = (async () => {
        try {
          // Query baseline objects before starting a consumer.
          await data.database.db
            .selectFrom("app.automation_run")
            .select("public_id")
            .limit(0)
            .execute();
          await queue.start();
          for (const [name, handler] of registry) await queue.work(name, handler);
          if (state === "starting") {
            state = "ready";
            logger.info({ code: "WORKER_READY" }, "Worker ready");
          }
        } catch {
          state = "failed";
          try {
            await queue.stop();
          } finally {
            await data.database.close();
          }
          throw new Error("Worker startup failed");
        }
      })();
      return starting;
    },
    stop() {
      if (stopping) return stopping;
      state = "stopping";
      stopping = (async () => {
        await starting?.catch(() => undefined);
        // Never close DB beneath a handler when queue draining fails. Owner must terminate.
        await queue.stop();
        await data.database.close();
        state = "stopped";
      })();
      return stopping;
    },
  };
}
