import { setTimeout as delay } from "node:timers/promises";
import type { DatabaseClient, DbTransaction, JsonObject, JsonValue } from "@bros/db";
import { sql } from "kysely";

const stage = "P2-12/v1";
const masterStage = "P2-09/v1";
const skuStage = "P2-10/v1";
const imageStage = "P2-11/v1";
const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const errorCodePattern = /^[A-Z][A-Z0-9_]{0,63}$/u;
const failureStages = ["P2-09", "P2-10", "P2-11"] as const;
const itemActions = ["CREATED", "MATCHED", "REVIEW_REQUIRED", "SKIPPED", "FAILED"] as const;
const itemStatuses = ["SUCCEEDED", "REVIEW_REQUIRED", "SKIPPED", "FAILED"] as const;

type ImportBatchStatus =
  "QUEUED" | "RUNNING" | "SUCCEEDED" | "PARTIAL_FAILED" | "FAILED" | "CANCELLED";

export interface ImportResultRecorderOptions {
  lockTimeoutMs?: number;
  maxAttempts?: number;
}

export interface ImportPipelineItemResult {
  action: "CREATED" | "MATCHED" | "REVIEW_REQUIRED" | "SKIPPED" | "FAILED";
  itemPublicId: string;
  reason: string;
  status: "SUCCEEDED" | "REVIEW_REQUIRED" | "SKIPPED" | "FAILED";
}

export interface ImportBatchTrackingResult {
  batchPublicId: string;
  completed: boolean;
  completedAt: string | null;
  failedCount: number;
  recordedCount: number;
  reviewCount: number;
  skippedCount: number;
  status: "SUCCEEDED" | "PARTIAL_FAILED" | "FAILED";
  successCount: number;
  totalCount: number;
}

export interface ImportItemTrackingResult {
  batch: ImportBatchTrackingResult;
  item: ImportPipelineItemResult;
}

export interface ImportStageFailure {
  errorCode: string;
  itemPublicId: string;
  stage: "P2-09" | "P2-10" | "P2-11";
}

export class ImportResultRecorderError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ImportResultRecorderError";
  }
}

function record(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readAction(
  envelope: JsonObject,
  field: "masterCreation" | "skuMapping" | "imageRegistration",
  expectedStage: string,
  allowed: readonly string[],
): { action: string; reason: string } {
  const stageRecord = envelope[field];
  if (!record(stageRecord) || stageRecord.stage !== expectedStage || !record(stageRecord.result)) {
    throw new ImportResultRecorderError("PIPELINE_STAGE_INCOMPLETE");
  }
  const action = stageRecord.result.action;
  const reason = stageRecord.result.reason;
  if (typeof action !== "string" || !allowed.includes(action) || typeof reason !== "string") {
    throw new ImportResultRecorderError("PERSISTED_STAGE_RESULT_INVALID");
  }
  return { action, reason };
}

export function classifyImportPipeline(
  envelope: JsonObject,
  itemPublicId = "00000000-0000-7000-8000-000000000000",
): ImportPipelineItemResult {
  if (record(envelope.validation) && envelope.validation.outcome === "REJECTED") {
    return {
      action: "FAILED",
      itemPublicId,
      reason: "INPUT_VALIDATION_FAILED",
      status: "FAILED",
    };
  }
  const master = readAction(envelope, "masterCreation", masterStage, [
    "CREATED",
    "MATCHED",
    "REVIEW_REQUIRED",
    "SKIPPED",
  ]);
  const sku = readAction(envelope, "skuMapping", skuStage, [
    "MAPPED",
    "REVIEW_REQUIRED",
    "SKIPPED",
  ]);
  const image = readAction(envelope, "imageRegistration", imageStage, [
    "REGISTERED",
    "REVIEW_REQUIRED",
    "SKIPPED",
  ]);
  const review = [master, sku, image].find((value) => value.action === "REVIEW_REQUIRED");
  if (review) {
    return {
      action: "REVIEW_REQUIRED",
      itemPublicId,
      reason: review.reason,
      status: "REVIEW_REQUIRED",
    };
  }
  const skip = [
    master.action === "SKIPPED" ? master : null,
    sku.action === "SKIPPED" && sku.reason !== "NO_SOURCE_OPTIONS" ? sku : null,
    image.action === "SKIPPED" && image.reason !== "NO_SOURCE_IMAGES" ? image : null,
  ].find((value) => value !== null);
  if (skip) {
    return {
      action: "SKIPPED",
      itemPublicId,
      reason: skip.reason,
      status: "SKIPPED",
    };
  }
  if (master.action !== "CREATED" && master.action !== "MATCHED") {
    throw new ImportResultRecorderError("PERSISTED_STAGE_RESULT_INVALID");
  }
  return {
    action: master.action,
    itemPublicId,
    reason: "PIPELINE_SUCCEEDED",
    status: "SUCCEEDED",
  };
}

function readPersistedItemResult(
  envelope: JsonObject,
  expectedItemPublicId?: string,
): ImportPipelineItemResult | null {
  if (!record(envelope.pipelineTracking) || envelope.pipelineTracking.stage !== stage) return null;
  if (!record(envelope.pipelineTracking.result)) {
    throw new ImportResultRecorderError("PERSISTED_STAGE_RESULT_INVALID");
  }
  const result = envelope.pipelineTracking.result;
  if (
    typeof result.action !== "string" ||
    !itemActions.includes(result.action as (typeof itemActions)[number]) ||
    typeof result.itemPublicId !== "string" ||
    !publicIdPattern.test(result.itemPublicId) ||
    (expectedItemPublicId !== undefined && result.itemPublicId !== expectedItemPublicId) ||
    typeof result.reason !== "string" ||
    typeof result.status !== "string" ||
    !itemStatuses.includes(result.status as (typeof itemStatuses)[number])
  ) {
    throw new ImportResultRecorderError("PERSISTED_STAGE_RESULT_INVALID");
  }
  const actionMatchesStatus =
    ((result.action === "CREATED" || result.action === "MATCHED") &&
      result.status === "SUCCEEDED") ||
    (result.action === "REVIEW_REQUIRED" && result.status === "REVIEW_REQUIRED") ||
    (result.action === "SKIPPED" && result.status === "SKIPPED") ||
    (result.action === "FAILED" && result.status === "FAILED");
  if (!actionMatchesStatus) {
    throw new ImportResultRecorderError("PERSISTED_STAGE_RESULT_INVALID");
  }
  return result as unknown as ImportPipelineItemResult;
}

async function aggregateBatch(
  tx: DbTransaction,
  batch: {
    config_json: JsonObject;
    id: string;
    public_id: string;
    status: ImportBatchStatus;
    total_count: number;
  },
): Promise<ImportBatchTrackingResult> {
  const counts = await tx
    .selectFrom("app.import_item")
    .select([
      sql<number>`count(*) filter (where status = 'SUCCEEDED')::int`.as("successCount"),
      sql<number>`count(*) filter (where status = 'FAILED')::int`.as("failedCount"),
      sql<number>`count(*) filter (where status = 'SKIPPED')::int`.as("skippedCount"),
      sql<number>`count(*) filter (where status = 'REVIEW_REQUIRED')::int`.as("reviewCount"),
      sql<number>`count(*) filter (where raw_json->'pipelineTracking'->>'stage' = ${stage})::int`.as(
        "recordedCount",
      ),
    ])
    .where("import_batch_id", "=", batch.id)
    .executeTakeFirstOrThrow();
  const completed = counts.recordedCount === batch.total_count;
  const status =
    counts.failedCount === batch.total_count
      ? "FAILED"
      : counts.failedCount > 0
        ? "PARTIAL_FAILED"
        : "SUCCEEDED";
  const existingTracking = record(batch.config_json.pipelineTracking)
    ? batch.config_json.pipelineTracking
    : null;
  const completedAt =
    completed &&
    existingTracking?.completed === true &&
    typeof existingTracking.completedAt === "string"
      ? existingTracking.completedAt
      : completed
        ? new Date().toISOString()
        : null;
  const result: ImportBatchTrackingResult = {
    batchPublicId: batch.public_id,
    completed,
    completedAt,
    ...counts,
    status,
    totalCount: batch.total_count,
  };
  await tx
    .updateTable("app.import_batch")
    .set({
      config_json: JSON.stringify({
        ...batch.config_json,
        pipelineTracking: { ...result, stage },
      }),
      failed_count: counts.failedCount,
      review_count: counts.reviewCount,
      skipped_count: counts.skippedCount,
      // CHECK constraints require status to agree with counts even before pipeline completion.
      status,
      success_count: counts.successCount,
    })
    .where("id", "=", batch.id)
    .execute();
  return result;
}

async function processItem(
  tx: DbTransaction,
  itemPublicId: string,
  lockTimeoutMs: number,
  failure: Omit<ImportStageFailure, "itemPublicId"> | null,
): Promise<ImportItemTrackingResult> {
  await sql`select set_config('lock_timeout', ${`${lockTimeoutMs}ms`}, true)`.execute(tx);
  const locator = await tx
    .selectFrom("app.import_item")
    .select("import_batch_id")
    .where("public_id", "=", itemPublicId)
    .executeTakeFirst();
  if (!locator) throw new ImportResultRecorderError("IMPORT_ITEM_NOT_FOUND");
  const batch = await tx
    .selectFrom("app.import_batch")
    .select(["config_json", "id", "public_id", "status", "total_count"])
    .where("id", "=", locator.import_batch_id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  if (
    batch.status !== "SUCCEEDED" &&
    batch.status !== "PARTIAL_FAILED" &&
    batch.status !== "FAILED"
  ) {
    throw new ImportResultRecorderError("SOURCE_BATCH_NOT_TERMINAL");
  }
  const item = await tx
    .selectFrom("app.import_item")
    .selectAll()
    .where("public_id", "=", itemPublicId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  if (!record(item.raw_json)) throw new ImportResultRecorderError("PERSISTED_INPUT_INVALID");
  const envelope = item.raw_json;
  const persisted = readPersistedItemResult(envelope, itemPublicId);
  if (persisted) {
    return { batch: await aggregateBatch(tx, batch), item: persisted };
  }
  let itemResult: ImportPipelineItemResult =
    failure === null
      ? item.status === "FAILED" && item.source_product_id === null
        ? {
            action: "FAILED",
            itemPublicId,
            reason: item.error_code ?? "SOURCE_UPSERT_FAILED",
            status: "FAILED",
          }
        : classifyImportPipeline(envelope, itemPublicId)
      : {
          action: "FAILED",
          itemPublicId,
          reason: failure.errorCode,
          status: "FAILED",
        };
  if (failure === null && itemResult.status === "FAILED" && item.error_code !== null) {
    itemResult = { ...itemResult, reason: item.error_code };
  }
  const completedAt = new Date().toISOString();
  await tx
    .updateTable("app.import_item")
    .set({
      action_type: itemResult.action,
      error_code: itemResult.status === "FAILED" ? itemResult.reason : null,
      error_message:
        itemResult.status === "FAILED"
          ? (item.error_message ?? "Import pipeline stage failed")
          : null,
      processed_at: new Date(),
      raw_json: JSON.stringify({
        ...envelope,
        pipelineTracking: {
          completedAt,
          failureStage: failure?.stage ?? null,
          result: itemResult,
          stage,
        },
      }),
      status: itemResult.status,
    })
    .where("id", "=", item.id)
    .execute();
  return { batch: await aggregateBatch(tx, batch), item: itemResult };
}

export function createImportResultRecorder(
  database: Pick<DatabaseClient, "db">,
  options: ImportResultRecorderOptions = {},
) {
  const lockTimeoutMs = options.lockTimeoutMs ?? 1_000;
  const maxAttempts = options.maxAttempts ?? 3;
  if (
    !Number.isInteger(lockTimeoutMs) ||
    lockTimeoutMs < 1 ||
    lockTimeoutMs > 10_000 ||
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > 5
  ) {
    throw new ImportResultRecorderError("INVALID_RESULT_RECORDER_OPTIONS");
  }
  async function execute(
    itemPublicId: string,
    failure: Omit<ImportStageFailure, "itemPublicId"> | null,
  ) {
    if (!publicIdPattern.test(itemPublicId)) {
      throw new ImportResultRecorderError("INVALID_IMPORT_ITEM_ID");
    }
    for (let attempt = 1; ; attempt++) {
      try {
        return await database.db
          .transaction()
          .setIsolationLevel("read committed")
          .execute((tx) => processItem(tx, itemPublicId, lockTimeoutMs, failure));
      } catch (error) {
        if (error instanceof ImportResultRecorderError) throw error;
        const code =
          typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
        if (code === "55P03" || code === "40P01" || code === "40001") {
          if (attempt === maxAttempts) {
            throw new ImportResultRecorderError("RESULT_LOCK_RETRY_EXHAUSTED");
          }
          await delay(25 * attempt);
          continue;
        }
        throw new ImportResultRecorderError("RESULT_PERSISTENCE_FAILED");
      }
    }
  }
  return {
    record: (itemPublicId: string): Promise<ImportItemTrackingResult> =>
      execute(itemPublicId, null),
    recordFailure: (failure: ImportStageFailure): Promise<ImportItemTrackingResult> => {
      if (
        failure === null ||
        typeof failure !== "object" ||
        typeof failure.errorCode !== "string" ||
        typeof failure.itemPublicId !== "string" ||
        typeof failure.stage !== "string"
      ) {
        throw new ImportResultRecorderError("INVALID_PIPELINE_FAILURE");
      }
      if (!errorCodePattern.test(failure.errorCode)) {
        throw new ImportResultRecorderError("INVALID_PIPELINE_ERROR_CODE");
      }
      if (!failureStages.includes(failure.stage)) {
        throw new ImportResultRecorderError("INVALID_PIPELINE_FAILURE_STAGE");
      }
      return execute(failure.itemPublicId, { errorCode: failure.errorCode, stage: failure.stage });
    },
  };
}
