import { createRedactedLogger } from "@bros/core";
import type { DatabaseClient, DbTransaction, JsonObject, JsonValue } from "@bros/db";
import {
  createImportChunkProcessor,
  ProductImportError,
  productImportQueueVersion,
  validateImportChunkOptions,
} from "@bros/importer";
import type { ImportChunkOptions, ImportChunkProgress } from "@bros/importer";
import type { QueueJob } from "@bros/queue";

const version = productImportQueueVersion;
function object(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
async function lockedBatch(tx: DbTransaction, job: QueueJob) {
  const batch = await tx
    .selectFrom("app.import_batch")
    .select(["id", "config_json"])
    .where("public_id", "=", job.data.publicId)
    .forUpdate()
    .executeTakeFirst();
  if (!batch) throw new ProductImportError("IMPORT_BATCH_NOT_FOUND");
  const state = batch.config_json.importQueue;
  if (
    !object(state) ||
    state.version !== version ||
    state.provider !== job.provider ||
    state.providerId !== job.providerId
  )
    throw new ProductImportError("IMPORT_DELIVERY_MISMATCH");
  return { batch, state };
}

export { enqueueProductImport, ProductImportError } from "@bros/importer";

export function createProductImportHandler(
  database: DatabaseClient,
  options: Partial<ImportChunkOptions> = {},
  logger: ReturnType<typeof createRedactedLogger> = createRedactedLogger(),
) {
  const config = { chunkSize: 100, concurrency: 2, ...options };
  validateImportChunkOptions(config);
  const processor = createImportChunkProcessor(database, config);
  return async (job: QueueJob) => {
    const claimed = await database.transaction(async (tx) => {
      const { batch, state } = await lockedBatch(tx, job);
      if (state.status === "SUCCESS") return false;
      if (
        typeof state.attempt !== "number" ||
        state.attempt >= job.attempt ||
        !["QUEUED", "RUNNING", "RETRY_WAIT"].includes(String(state.status))
      )
        throw new ProductImportError("IMPORT_STALE_DELIVERY");
      job.signal.throwIfAborted();
      await tx
        .updateTable("app.import_batch")
        .set({
          config_json: JSON.stringify({
            ...batch.config_json,
            importQueue: {
              ...state,
              status: "RUNNING",
              attempt: job.attempt,
              startedAt: new Date().toISOString(),
              completedAt: null,
              errorCode: null,
              ...config,
            },
          }),
        })
        .where("id", "=", batch.id)
        .execute();
      return true;
    });
    if (!claimed) return;
    const update = async (changes: JsonObject) =>
      database.transaction(async (tx) => {
        const { batch, state } = await lockedBatch(tx, job);
        if (state.attempt !== job.attempt || state.status !== "RUNNING")
          throw new ProductImportError("IMPORT_OWNERSHIP_CHANGED");
        await tx
          .updateTable("app.import_batch")
          .set({
            config_json: JSON.stringify({
              ...batch.config_json,
              importQueue: { ...state, ...changes },
            }),
          })
          .where("id", "=", batch.id)
          .execute();
      });
    const checkpoint = async (progress: ImportChunkProgress) => {
      await update({ progress: { ...progress }, checkpointAt: new Date().toISOString() });
      logger.info(
        {
          code: "IMPORT_CHUNK_COMPLETED",
          publicId: job.data.publicId,
          attempt: job.attempt,
          ...progress,
        },
        "Import chunk completed",
      );
    };
    try {
      await processor.process(job.data.publicId, {
        signal: job.signal,
        finalAttempt: job.attempt > job.retryLimit,
        checkpoint,
        delivery: { provider: job.provider, providerId: job.providerId, attempt: job.attempt },
      });
      job.signal.throwIfAborted();
      await update({ status: "SUCCESS", completedAt: new Date().toISOString() });
      logger.info(
        { code: "IMPORT_PROCESSING_COMPLETED", publicId: job.data.publicId, attempt: job.attempt },
        "Import processing completed",
      );
    } catch {
      const terminal = job.attempt > job.retryLimit;
      // An older delivery may finish after a newer receipt/attempt. Never overwrite its state.
      await update({
        status: terminal ? "FAILED" : "RETRY_WAIT",
        errorCode: "IMPORT_PROCESSING_FAILED",
        completedAt: terminal ? new Date().toISOString() : null,
      }).catch(() => undefined);
      logger.error(
        { code: "IMPORT_PROCESSING_FAILED", publicId: job.data.publicId, attempt: job.attempt },
        "Import processing failed",
      );
      throw new ProductImportError("IMPORT_PROCESSING_FAILED");
    }
  };
}
