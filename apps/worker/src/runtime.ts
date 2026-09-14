import { createRedactedLogger, createSecretProvider } from "@bros/core";
import type { AppConfig } from "@bros/core";
import { createPgBossQueue } from "@bros/queue";
import { createSchedulerService } from "@bros/queue";
import type { QueuePort, QueueName, QueueJob } from "@bros/queue";
import { createObjectStorage } from "@bros/storage";
import { createBrowserRunHandler, createDefaultBrowserRunExecutors } from "./browser-run.js";
import type { BrowserRunExecutor } from "./browser-run.js";
import {
  createArtifactRetentionHandler,
  reconcileArtifactCleanupSchedule,
} from "./artifact-retention.js";
import { createWorkerDataAccess } from "./database.js";
import { createSystemTestHandler } from "./system-test.js";
import type { SystemTestAction } from "./system-test.js";
import { createProductImportHandler } from "./product-import.js";

export interface WorkerOptions {
  queue?: QueuePort;
  browserExecutors?: readonly BrowserRunExecutor[];
  systemTestAction?: SystemTestAction;
  logger?: ReturnType<typeof createRedactedLogger>;
}

export function createWorker(config: AppConfig, options: WorkerOptions = {}) {
  if (config.database.poolMax < 2)
    throw new Error("Import Worker requires at least two DB connections");
  const data = createWorkerDataAccess(config.database);
  const queue =
    options.queue ??
    createPgBossQueue(config.database, { localConcurrency: config.worker.concurrency });
  const logger = options.logger ?? createRedactedLogger();
  const storage = createObjectStorage(config.storage, {
    secretProvider: createSecretProvider(),
  });
  const browserExecutors = options.browserExecutors ?? createDefaultBrowserRunExecutors(storage);
  const scheduler = createSchedulerService({
    flowRegistry: {
      registeredHandlerKeys: () => browserExecutors.map((executor) => executor.handlerKey).sort(),
    },
    queue,
    repository: {
      listBrowserJobs: async () =>
        data.database.db
          .selectFrom("app.automation_job")
          .select(["public_id", "handler_key", "cron_expression", "timezone", "enabled"])
          .where("job_type", "=", "BROWSER")
          .execute()
          .then((jobs) =>
            jobs.map((job) => ({
              cronExpression: job.cron_expression,
              enabled: job.enabled,
              handlerKey: job.handler_key,
              publicId: job.public_id,
              timezone: job.timezone,
            })),
          ),
    },
  });
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
    ["product.import", createProductImportHandler(data.database, config.importer, logger)],
    ["browser.run", createBrowserRunHandler(data.database, browserExecutors, logger)],
    ["artifact.cleanup", createArtifactRetentionHandler(data.database, storage, logger)],
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
          await scheduler.reconcile();
          await reconcileArtifactCleanupSchedule(queue);
          for (const [name, handler] of registry)
            await queue.work(
              name,
              handler,
              name === "product.import" ? { concurrency: 1 } : undefined,
            );
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
