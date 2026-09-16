import { createRedactedLogger } from "@bros/core";
import type { AppConfig } from "@bros/core";
import { createPgBossQueue } from "@bros/queue";
import type { QueuePort, QueueName, QueueJob } from "@bros/queue";
import { createWorkerDataAccess } from "./database.js";
import { createSystemTestHandler } from "./system-test.js";
import type { SystemTestAction } from "./system-test.js";
import { createProductImportHandler } from "./product-import.js";
import {
  createIdentifierResolveHandler,
  reconcileResolveRuns,
  type ResolverPipeline,
} from "@bros/resolver";
import { configuredResolverPipeline } from "./identifier-resolve.js";

export interface WorkerOptions {
  queue?: QueuePort;
  systemTestAction?: SystemTestAction;
  resolverPipeline?: ResolverPipeline;
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
  ]);
  let state: "idle" | "starting" | "ready" | "stopping" | "stopped" | "failed" = "idle";
  let starting: Promise<void> | undefined;
  let stopping: Promise<void> | undefined;
  let reconciliationTimer: ReturnType<typeof setInterval> | undefined;
  let reconciling: Promise<void> | undefined;
  let reconciliationCursor: string | undefined;
  const reconcile = () => {
    if (reconciling) return reconciling;
    reconciling = reconcileResolveRuns(data.database, queue, reconciliationCursor)
      .then((result) => {
        reconciliationCursor = result.nextId;
      })
      .catch(() => {
        logger.warn(
          { code: "RESOLVE_RECONCILIATION_FAILED" },
          "Resolver queue reconciliation failed",
        );
      })
      .finally(() => {
        reconciling = undefined;
      });
    return reconciling;
  };
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
          const pipeline =
            options.resolverPipeline ?? configuredResolverPipeline(data.database, config.resolver);
          registry.set(
            "identifier.resolve",
            createIdentifierResolveHandler(data.database, pipeline, config.resolver),
          );
          await data.database.db
            .selectFrom("app.identifier_resolve_run")
            .select(["queue_json", "result_json", "admission_key"])
            .limit(0)
            .execute();
          // Query baseline objects before starting a consumer.
          await data.database.db
            .selectFrom("app.automation_run")
            .select("public_id")
            .limit(0)
            .execute();
          await queue.start();
          await reconcile();
          for (const [name, handler] of registry)
            await queue.work(
              name,
              handler,
              name === "product.import"
                ? { concurrency: 1 }
                : name === "identifier.resolve"
                  ? { concurrency: config.resolver.concurrency }
                  : undefined,
            );
          if (state === "starting") {
            state = "ready";
            reconciliationTimer = setInterval(() => {
              void reconcile();
            }, 10000);
            reconciliationTimer.unref();
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
        if (reconciliationTimer) clearInterval(reconciliationTimer);
        await reconciling;
        // Never close DB beneath a handler when queue draining fails. Owner must terminate.
        await queue.stop();
        await data.database.close();
        state = "stopped";
      })();
      return stopping;
    },
  };
}
