import type { DatabaseClient, JsonObject } from "@bros/db";
import { queueTransaction, queueDefaults } from "@bros/queue";
import type { QueuePort, QueueJob } from "@bros/queue";
import { createRedactedLogger } from "@bros/core";

export type SystemTestAction = (signal: AbortSignal) => Promise<JsonObject>;

export async function enqueueSystemTest(
  database: DatabaseClient,
  queue: QueuePort,
  requestKey: string,
) {
  if (!/^system\.test:[0-9a-f-]{36}$/i.test(requestKey))
    throw new Error("Invalid system.test request key");
  return database.transaction(async (tx) => {
    // job_code is not unique in the accepted baseline. Serialize this reserved smoke definition.
    await tx
      .selectNoFrom((eb) =>
        eb.fn("pg_advisory_xact_lock", [eb.val(0x42524f53), eb.val(110)]).as("lock"),
      )
      .execute();
    const definitions = await tx
      .selectFrom("app.automation_job")
      .select("id")
      .where("job_code", "=", "system.test")
      .limit(2)
      .execute();
    if (definitions.length > 1) throw new Error("Ambiguous system.test definition");
    if (definitions.length === 0)
      await tx
        .insertInto("app.automation_job")
        .values({
          job_code: "system.test",
          job_name: "System test",
          job_type: "INTERNAL",
          handler_key: "system.test",
          enabled: false,
          allow_manual_run: true,
          allow_parallel: true,
          cooldown_seconds: 0,
          timeout_seconds: queueDefaults.expireInSeconds,
          max_retries: queueDefaults.retryLimit,
        })
        .execute();
    const definition = await tx
      .selectFrom("app.automation_job")
      .selectAll()
      .where("job_code", "=", "system.test")
      .forUpdate()
      .executeTakeFirstOrThrow();
    if (
      definition.job_type !== "INTERNAL" ||
      definition.handler_key !== "system.test" ||
      !definition.allow_manual_run ||
      !definition.allow_parallel ||
      definition.cooldown_seconds !== 0
    )
      throw new Error("system.test definition is incompatible");
    const existing = await tx
      .selectFrom("app.automation_run")
      .select(["public_id", "queue_provider", "queue_job_id", "automation_job_id"])
      .where("request_key", "=", requestKey)
      .executeTakeFirst();
    if (existing) {
      if (
        existing.automation_job_id !== definition.id ||
        !existing.queue_job_id ||
        existing.queue_provider !== "pg-boss"
      )
        throw new Error("system.test request conflict");
      return {
        publicId: existing.public_id,
        provider: existing.queue_provider,
        providerId: existing.queue_job_id,
      };
    }
    const run = await tx
      .insertInto("app.automation_run")
      .values({
        automation_job_id: definition.id,
        request_key: requestKey,
        trigger_type: "MANUAL",
        queued_at: new Date(),
      })
      .returning("public_id")
      .executeTakeFirstOrThrow();
    const receipt = await queue.publish(
      "system.test",
      { publicId: run.public_id },
      queueTransaction(tx),
    );
    await tx
      .updateTable("app.automation_run")
      .set({ queue_provider: receipt.provider, queue_job_id: receipt.providerId })
      .where("public_id", "=", run.public_id)
      .execute();
    return { publicId: run.public_id, ...receipt };
  });
}

export function createSystemTestHandler(
  database: DatabaseClient,
  action: SystemTestAction,
  logger: ReturnType<typeof createRedactedLogger> = createRedactedLogger(),
) {
  return async (job: QueueJob): Promise<void> => {
    const claimed = await database.transaction(async (tx) => {
      const run = await tx
        .selectFrom("app.automation_run as run")
        .innerJoin("app.automation_job as definition", "definition.id", "run.automation_job_id")
        .select([
          "run.id",
          "run.status",
          "run.attempt_no",
          "run.queue_job_id",
          "run.queue_provider",
          "definition.handler_key",
          "definition.job_type",
        ])
        .where("run.public_id", "=", job.data.publicId)
        .forUpdate("run")
        .executeTakeFirstOrThrow();
      if (
        run.handler_key !== "system.test" ||
        run.job_type !== "INTERNAL" ||
        run.queue_job_id !== job.providerId ||
        run.queue_provider !== job.provider
      )
        throw new Error("Invalid system.test delivery");
      if (run.status === "SUCCESS") return false;
      if (
        !["QUEUED", "RUNNING", "RETRY_WAIT"].includes(run.status) ||
        run.attempt_no >= job.attempt
      )
        throw new Error("Stale system.test delivery");
      job.signal.throwIfAborted();
      await tx
        .updateTable("app.automation_run")
        .set({
          status: "RUNNING",
          attempt_no: job.attempt,
          started_at: new Date(),
          finished_at: null,
          error_code: null,
          error_message: null,
          current_step: "system.test",
        })
        .where("id", "=", run.id)
        .execute();
      return true;
    });
    if (!claimed) return;
    const currentAttempt = () =>
      database.db
        .updateTable("app.automation_run")
        .where("public_id", "=", job.data.publicId)
        .where("queue_job_id", "=", job.providerId)
        .where("attempt_no", "=", job.attempt)
        .where("status", "=", "RUNNING");
    try {
      job.signal.throwIfAborted();
      const result = await action(job.signal);
      job.signal.throwIfAborted();
      const update = await currentAttempt()
        .set({
          status: "SUCCESS",
          finished_at: new Date(),
          result_json: JSON.stringify(result),
          current_step: "completed",
        })
        .executeTakeFirst();
      if (update.numUpdatedRows !== 1n) throw new Error("system.test ownership changed");
      logger.info(
        {
          code: "SYSTEM_TEST_SUCCESS",
          publicId: job.data.publicId,
          providerId: job.providerId,
          attempt: job.attempt,
        },
        "System test completed",
      );
    } catch {
      const terminal = job.attempt > job.retryLimit;
      await currentAttempt()
        .set({
          status: terminal ? "FAILED" : "RETRY_WAIT",
          finished_at: terminal ? new Date() : null,
          error_code: "SYSTEM_TEST_FAILED",
          error_message: "System test failed",
          current_step: "failed",
        })
        .execute();
      logger.error(
        { code: "SYSTEM_TEST_FAILED", publicId: job.data.publicId, attempt: job.attempt },
        "System test failed",
      );
      throw new Error("System test failed");
    }
  };
}
