import { randomUUID } from "node:crypto";
import {
  createBrowserArtifactService,
  demoBrowserFlowHandlerKey,
  mapBrowserError,
  runDurableDemoBrowserHarness,
} from "@bros/browser";
import type {
  BrowserArtifactService,
  BrowserErrorCode,
  DurableDemoFlowResult,
} from "@bros/browser";
import type { DatabaseClient, JsonObject } from "@bros/db";
import { queueTransaction } from "@bros/queue";
import type { QueueJob, QueuePort } from "@bros/queue";
import type { ObjectStorage } from "@bros/storage";
import { createRedactedLogger } from "@bros/core";

const manualRequestKeyPattern = /^browser\.manual:[0-9a-f-]{36}$/i;

export interface BrowserRunExecutor {
  readonly handlerKey: string;
  execute(request: {
    readonly input: JsonObject;
    readonly runPublicId: string;
    readonly signal: AbortSignal;
  }): Promise<BrowserRunExecutionResult>;
}

export interface BrowserRunExecutionResult {
  readonly currentStep: string;
  readonly currentUrl: string;
  readonly errorCode?: BrowserErrorCode;
  readonly result: JsonObject;
  readonly screenshotKey: string;
  readonly status: "FAILED" | "SUCCESS" | "TIMEOUT";
  readonly traceKey: string;
}

function isDemoInput(input: JsonObject): input is JsonObject & { mode: "failure" | "success" } {
  return Object.keys(input).length === 1 && (input.mode === "failure" || input.mode === "success");
}

function toExecutionResult(result: DurableDemoFlowResult): BrowserRunExecutionResult {
  return {
    currentStep: result.currentStep,
    currentUrl: result.currentUrl,
    ...(result.status === "SUCCESS" ? {} : { errorCode: result.errorCode }),
    result: {
      artifact: {
        resultKey: result.resultKey,
        screenshotKey: result.screenshotKey,
        traceKey: result.traceKey,
      },
      demo: { outcome: result.artifact.outcome, result: result.artifact.result },
    },
    screenshotKey: result.screenshotKey,
    status: result.status,
    traceKey: result.traceKey,
  };
}

export function createDemoBrowserRunExecutor(options: {
  readonly artifactService: BrowserArtifactService;
}): BrowserRunExecutor {
  return {
    handlerKey: demoBrowserFlowHandlerKey,
    async execute(request) {
      if (!isDemoInput(request.input)) throw new Error("Invalid demo browser run input");
      request.signal.throwIfAborted();
      return toExecutionResult(
        await runDurableDemoBrowserHarness({
          artifactService: options.artifactService,
          mode: request.input.mode,
          runPublicId: request.runPublicId,
        }),
      );
    },
  };
}

export function createDefaultBrowserRunExecutors(
  storage: ObjectStorage,
): readonly BrowserRunExecutor[] {
  return [
    createDemoBrowserRunExecutor({ artifactService: createBrowserArtifactService({ storage }) }),
  ];
}

export async function enqueueBrowserRun(
  database: DatabaseClient,
  queue: QueuePort,
  request: {
    readonly input: JsonObject;
    readonly jobPublicId: string;
    readonly requestKey?: string;
  },
) {
  const requestKey = request.requestKey ?? `browser.manual:${randomUUID()}`;
  if (!manualRequestKeyPattern.test(requestKey))
    throw new Error("Invalid browser manual request key");
  return database.transaction(async (tx) => {
    const definition = await tx
      .selectFrom("app.automation_job")
      .select(["id", "allow_manual_run", "enabled", "handler_key", "job_type"])
      .where("public_id", "=", request.jobPublicId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (definition.job_type !== "BROWSER" || !definition.enabled || !definition.allow_manual_run) {
      throw new Error("Browser job cannot be manually run");
    }
    const existing = await tx
      .selectFrom("app.automation_run")
      .select(["automation_job_id", "public_id", "queue_job_id", "queue_provider"])
      .where("request_key", "=", requestKey)
      .executeTakeFirst();
    if (existing) {
      if (
        existing.automation_job_id !== definition.id ||
        existing.queue_provider !== "pg-boss" ||
        existing.queue_job_id === null
      ) {
        throw new Error("Browser run request conflict");
      }
      return {
        provider: existing.queue_provider,
        providerId: existing.queue_job_id,
        publicId: existing.public_id,
      };
    }
    const run = await tx
      .insertInto("app.automation_run")
      .values({
        automation_job_id: definition.id,
        input_json: JSON.stringify(request.input),
        queued_at: new Date(),
        request_key: requestKey,
        trigger_type: "MANUAL",
      })
      .returning("public_id")
      .executeTakeFirstOrThrow();
    const receipt = await queue.publish(
      "browser.run",
      { publicId: run.public_id },
      queueTransaction(tx),
    );
    await tx
      .updateTable("app.automation_run")
      .set({ queue_provider: receipt.provider, queue_job_id: receipt.providerId })
      .where("public_id", "=", run.public_id)
      .execute();
    return { ...receipt, publicId: run.public_id };
  });
}

async function claimScheduledRun(database: DatabaseClient, job: QueueJob) {
  const requestKey = `browser.schedule:${job.provider}:${job.providerId}`;
  return database.transaction(async (tx) => {
    const definition = await tx
      .selectFrom("app.automation_job")
      .selectAll()
      .where("public_id", "=", job.data.publicId)
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (
      definition.job_type !== "BROWSER" ||
      !definition.enabled ||
      definition.cron_expression === null
    ) {
      throw new Error("Invalid scheduled browser job");
    }
    const existing = await tx
      .selectFrom("app.automation_run")
      .selectAll()
      .where("request_key", "=", requestKey)
      .forUpdate()
      .executeTakeFirst();
    if (existing) {
      if (existing.automation_job_id !== definition.id)
        throw new Error("Scheduled browser run conflict");
      return existing.public_id;
    }
    return tx
      .insertInto("app.automation_run")
      .values({
        automation_job_id: definition.id,
        input_json: JSON.stringify(definition.config_json),
        queue_job_id: job.providerId,
        queue_provider: job.provider,
        queued_at: new Date(),
        request_key: requestKey,
        trigger_type: "SCHEDULED",
      })
      .returning("public_id")
      .executeTakeFirstOrThrow()
      .then((run) => run.public_id);
  });
}

export function createBrowserRunHandler(
  database: DatabaseClient,
  executors: readonly BrowserRunExecutor[],
  logger: ReturnType<typeof createRedactedLogger> = createRedactedLogger(),
) {
  const executorByHandler = new Map(executors.map((executor) => [executor.handlerKey, executor]));
  if (executorByHandler.size !== executors.length)
    throw new Error("Duplicate browser run executor");

  return async (job: QueueJob): Promise<void> => {
    const delivered = await database.db
      .selectFrom("app.automation_run")
      .select("public_id")
      .where("public_id", "=", job.data.publicId)
      .executeTakeFirst();
    const deliveredPublicId = delivered?.public_id ?? (await claimScheduledRun(database, job));
    const claimed = await database.transaction(async (tx) => {
      const current = await tx
        .selectFrom("app.automation_run as run")
        .innerJoin("app.automation_job as definition", "definition.id", "run.automation_job_id")
        .select([
          "run.id",
          "run.input_json",
          "run.public_id",
          "run.queue_job_id",
          "run.queue_provider",
          "run.status",
          "definition.handler_key",
          "definition.job_type",
        ])
        .where("run.public_id", "=", deliveredPublicId)
        .forUpdate("run")
        .executeTakeFirstOrThrow();
      if (
        current.job_type !== "BROWSER" ||
        current.queue_job_id !== job.providerId ||
        current.queue_provider !== job.provider
      ) {
        throw new Error("Invalid browser.run delivery");
      }
      const executor = executorByHandler.get(current.handler_key);
      if (!executor) throw new Error("Unregistered browser flow handler");
      if (["SUCCESS", "FAILED", "TIMEOUT", "CANCELLED"].includes(current.status)) return undefined;
      if (!["QUEUED", "RUNNING", "RETRY_WAIT"].includes(current.status)) {
        throw new Error("Stale browser.run delivery");
      }
      job.signal.throwIfAborted();
      await tx
        .updateTable("app.automation_run")
        .set({
          attempt_no: job.attempt,
          current_step: "starting",
          error_code: null,
          error_message: null,
          finished_at: null,
          started_at: new Date(),
          status: "RUNNING",
        })
        .where("id", "=", current.id)
        .execute();
      return { executor, input: current.input_json, publicId: current.public_id };
    });
    if (!claimed) return;

    const updateCurrent = () =>
      database.db
        .updateTable("app.automation_run")
        .where("public_id", "=", claimed.publicId)
        .where("queue_job_id", "=", job.providerId)
        .where("queue_provider", "=", job.provider)
        .where("attempt_no", "=", job.attempt)
        .where("status", "=", "RUNNING");
    try {
      const result = await claimed.executor.execute({
        input: claimed.input,
        runPublicId: claimed.publicId,
        signal: job.signal,
      });
      job.signal.throwIfAborted();
      const update = await updateCurrent()
        .set({
          current_step: result.currentStep,
          current_url: result.currentUrl,
          error_code: result.errorCode ?? null,
          error_message: result.status === "SUCCESS" ? null : "Browser flow failed",
          finished_at: new Date(),
          result_json: JSON.stringify(result.result),
          screenshot_key: result.screenshotKey,
          status: result.status,
          trace_key: result.traceKey,
        })
        .executeTakeFirst();
      if (update.numUpdatedRows !== 1n) throw new Error("browser.run ownership changed");
      logger.info(
        { code: "BROWSER_RUN_COMPLETED", publicId: claimed.publicId, status: result.status },
        "Browser run completed",
      );
    } catch (error) {
      const errorCode = mapBrowserError(error);
      await updateCurrent()
        .set({
          current_step: "failed",
          error_code: errorCode,
          error_message: "Browser flow failed",
          finished_at: new Date(),
          status: errorCode === "NAVIGATION_TIMEOUT" ? "TIMEOUT" : "FAILED",
        })
        .execute();
      logger.error({ code: errorCode, publicId: claimed.publicId }, "Browser run failed");
    }
  };
}
