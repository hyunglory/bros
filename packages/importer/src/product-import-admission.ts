import type { DatabaseClient, JsonObject, JsonValue } from "@bros/db";
import { queueTransaction } from "@bros/queue";
import type { QueuePort } from "@bros/queue";
import { sql } from "kysely";

export const productImportQueueVersion = "P2-13/v1";
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
  resume?: boolean;
}

export interface ProductImportAdmissionResult {
  disposition: "ACCEPTED" | "REPLAYED";
  processingStatus: string;
  provider: string;
  providerId: string;
  publicId: string;
}

export async function admitProductImport(
  database: DatabaseClient,
  queue: QueuePort,
  batchPublicId: string,
  options: ProductImportAdmissionOptions = {},
): Promise<ProductImportAdmissionResult> {
  const limit = options.maxQueuedBatches ?? 32;
  if (!publicIdPattern.test(batchPublicId)) throw new ProductImportError("INVALID_IMPORT_BATCH_ID");
  if (!Number.isInteger(limit) || limit < 1 || limit > 1000)
    throw new ProductImportError("INVALID_IMPORT_ADMISSION_LIMIT");
  return database
    .transaction(async (tx) => {
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
          prior.version !== productImportQueueVersion ||
          typeof prior.provider !== "string" ||
          typeof prior.providerId !== "string"
        )
          throw new ProductImportError("IMPORT_QUEUE_STATE_INVALID");
        if (prior.status === "SUCCESS" || !options.resume)
          return {
            disposition: "REPLAYED" as const,
            processingStatus:
              typeof prior.status === "string" &&
              ["QUEUED", "RUNNING", "RETRY_WAIT", "SUCCESS", "FAILED"].includes(prior.status)
                ? prior.status
                : "UNKNOWN",
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
              version: productImportQueueVersion,
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
      return {
        disposition: "ACCEPTED" as const,
        processingStatus: "QUEUED",
        publicId: batchPublicId,
        ...receipt,
      };
    })
    .catch((error: unknown) => {
      if (error instanceof ProductImportError) throw error;
      throw new ProductImportError("IMPORT_ENQUEUE_FAILED");
    });
}

export async function enqueueProductImport(
  database: DatabaseClient,
  queue: QueuePort,
  batchPublicId: string,
  options: ProductImportAdmissionOptions = {},
) {
  const result = await admitProductImport(database, queue, batchPublicId, options);
  return { publicId: result.publicId, provider: result.provider, providerId: result.providerId };
}
