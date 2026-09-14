import { createRedactedLogger } from "@bros/core";
import type { DatabaseClient, DbTransaction, JsonObject, JsonValue } from "@bros/db";
import { createImportChunkProcessor, validateImportChunkOptions } from "@bros/importer";
import type { ImportChunkOptions, ImportChunkProgress } from "@bros/importer";
import { queueTransaction } from "@bros/queue";
import type { QueueJob, QueuePort } from "@bros/queue";
import { sql } from "kysely";

const version = "P2-13/v1";
const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
function object(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export class ProductImportError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ProductImportError";
  }
}

export interface ProductImportAdmissionOptions {
  maxQueuedBatches?: number;
  // Explicit operator recovery also covers a process killed on the final provider attempt.
  // Successful items are immutable; the previous receipt is fenced out.
  resume?: boolean;
}

export async function enqueueProductImport(
  database: DatabaseClient,
  queue: QueuePort,
  batchPublicId: string,
  options: ProductImportAdmissionOptions = {},
) {
  const limit = options.maxQueuedBatches ?? 32;
  if (!publicIdPattern.test(batchPublicId)) throw new ProductImportError("INVALID_IMPORT_BATCH_ID");
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new ProductImportError("INVALID_IMPORT_ADMISSION_LIMIT");
  return database
    .transaction(async (tx) => {
      // Serialize admission counts across producer processes, without locking active handlers.
      await sql`select pg_advisory_xact_lock(1112686419, 213)`.execute(tx);
      const batch = await tx
        .selectFrom("app.import_batch")
        .selectAll()
        .where("public_id", "=", batchPublicId)
        .forUpdate()
        .executeTakeFirst();
      if (!batch) throw new ProductImportError("IMPORT_BATCH_NOT_FOUND");
      if (batch.total_count === 0) throw new ProductImportError("EMPTY_IMPORT_BATCH");
      if (batch.status === "CANCELLED") throw new ProductImportError("IMPORT_BATCH_CANCELLED");
      const prior = batch.config_json.importQueue;
      if (object(prior)) {
        if (
          prior.version !== version ||
          typeof prior.provider !== "string" ||
          typeof prior.providerId !== "string"
        )
          throw new ProductImportError("IMPORT_QUEUE_STATE_INVALID");
        if (prior.status === "SUCCESS" || !options.resume)
          return {
            publicId: batchPublicId,
            provider: prior.provider,
            providerId: prior.providerId,
          };
      }
      const active = await tx
        .selectFrom("app.import_batch")
        .select(sql<number>`count(*)::int`.as("count"))
        .where("id", "!=", batch.id)
        .where(
          sql<boolean>`config_json->'importQueue'->>'status' in ('QUEUED','RUNNING','RETRY_WAIT')`,
        )
        .executeTakeFirstOrThrow();
      if (active.count >= limit) throw new ProductImportError("IMPORT_BACKPRESSURE");
      const receipt = await queue.publish(
        "product.import",
        { publicId: batchPublicId },
        queueTransaction(tx),
      );
      await tx
        .updateTable("app.import_batch")
        .set({
          config_json: JSON.stringify({
            ...batch.config_json,
            importQueue: {
              version,
              ...receipt,
              status: "QUEUED",
              attempt: 0,
              queuedAt: new Date().toISOString(),
              completedAt: null,
              progress: null,
            },
          }),
        })
        .where("id", "=", batch.id)
        .execute();
      return { publicId: batchPublicId, ...receipt };
    })
    .catch((error: unknown) => {
      if (error instanceof ProductImportError) throw error;
      throw new ProductImportError("IMPORT_ENQUEUE_FAILED");
    });
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
