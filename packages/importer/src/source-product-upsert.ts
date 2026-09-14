import {
  type SourceImportContext,
  type SourceProductInput,
  validateSourceImportContext,
  validateSourceProductInput,
} from "@bros/contracts";
import type { DatabaseClient, DbTransaction, JsonValue } from "@bros/db";

export type SourceProductUpsertErrorCode =
  "IMPORT_BATCH_NOT_FOUND" | "IMPORT_BATCH_NOT_RUNNING" | "IMPORT_BATCH_PLATFORM_INVALID";

export class SourceProductUpsertError extends Error {
  readonly code: SourceProductUpsertErrorCode;

  constructor(code: SourceProductUpsertErrorCode, message: string) {
    super(message);
    this.name = "SourceProductUpsertError";
    this.code = code;
  }
}

export interface SourceProductUpsertResult {
  batchPublicId: string;
  createdCount: number;
  failedCount: number;
  matchedCount: number;
  status: "SUCCEEDED" | "PARTIAL_FAILED" | "FAILED";
  updatedCount: number;
}

interface BatchRow {
  id: string;
  platformCode: string;
  platformId: string;
  status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "PARTIAL_FAILED" | "FAILED" | "CANCELLED";
}

interface PendingItem {
  externalProductId: string | null;
  id: string;
  rawJson: JsonValue;
}

function isRecord(value: JsonValue): value is Record<string, JsonValue> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readMappedInput(value: JsonValue): SourceProductInput | undefined {
  if (!isRecord(value) || !("mappedInput" in value)) {
    return undefined;
  }
  const mappedInput = value.mappedInput;
  if (mappedInput === undefined) {
    return undefined;
  }
  const result = validateSourceProductInput(mappedInput);
  return result.ok ? result.value : undefined;
}

function readContext(value: JsonValue): SourceImportContext | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const contextValue = value.context;
  if (contextValue === undefined || !isRecord(contextValue)) {
    return undefined;
  }
  const context = contextValue;
  if (typeof context.collectedAt !== "string") {
    return undefined;
  }
  const candidate =
    context.sourceAsOfDate === undefined
      ? { collectedAt: context.collectedAt }
      : { collectedAt: context.collectedAt, sourceAsOfDate: context.sourceAsOfDate };
  const result = validateSourceImportContext(candidate);
  return result.ok ? result.value : undefined;
}

function sourceValues(input: SourceProductInput, context: SourceImportContext, platformId: string) {
  return {
    collected_at: context.collectedAt,
    currency_code: input.currencyCode ?? null,
    current_price: input.currentPrice ?? null,
    external_product_id: input.externalProductId,
    last_seen_at: context.collectedAt,
    normal_price: input.normalPrice ?? null,
    platform_id: platformId,
    product_url: input.productUrl ?? null,
    raw_brand_name: input.brandName ?? null,
    raw_json: JSON.stringify(input.raw),
    raw_product_name: input.productName,
    stock_status: input.stockStatus ?? "UNKNOWN",
    updated_at: new Date(),
  };
}

async function upsertSourceProduct(
  transaction: DbTransaction,
  batch: BatchRow,
  item: PendingItem,
): Promise<"CREATED" | "UPDATED" | "MATCHED" | "FAILED"> {
  const input = readMappedInput(item.rawJson);
  const context = readContext(item.rawJson);
  if (
    input === undefined ||
    context === undefined ||
    input.platformCode !== batch.platformCode ||
    input.externalProductId !== item.externalProductId
  ) {
    await transaction
      .updateTable("app.import_item")
      .set({
        action_type: "FAILED",
        error_code: "PERSISTED_INPUT_INVALID",
        error_message: "Persisted mapped input is invalid",
        processed_at: new Date(),
        status: "FAILED",
      })
      .where("id", "=", item.id)
      .execute();
    return "FAILED";
  }

  const values = sourceValues(input, context, batch.platformId);
  const created = await transaction
    .insertInto("app.source_product")
    .values(values)
    .onConflict((conflict) => conflict.columns(["platform_id", "external_product_id"]).doNothing())
    .returning("id")
    .executeTakeFirst();
  if (created !== undefined) {
    await transaction
      .updateTable("app.import_item")
      .set({
        action_type: "CREATED",
        processed_at: new Date(),
        source_product_id: created.id,
        status: "SUCCEEDED",
      })
      .where("id", "=", item.id)
      .execute();
    return "CREATED";
  }

  const updated = await transaction
    .updateTable("app.source_product")
    .set(values)
    .where("platform_id", "=", batch.platformId)
    .where("external_product_id", "=", input.externalProductId)
    .where("collected_at", "<=", new Date(context.collectedAt))
    .returning("id")
    .executeTakeFirst();
  const sourceProduct =
    updated ??
    (await transaction
      .selectFrom("app.source_product")
      .select("id")
      .where("platform_id", "=", batch.platformId)
      .where("external_product_id", "=", input.externalProductId)
      .executeTakeFirstOrThrow());

  await transaction
    .updateTable("app.import_item")
    .set({
      action_type: updated === undefined ? "MATCHED" : "UPDATED",
      processed_at: new Date(),
      source_product_id: sourceProduct.id,
      status: "SUCCEEDED",
    })
    .where("id", "=", item.id)
    .execute();
  return updated === undefined ? "MATCHED" : "UPDATED";
}

async function completeBatch(
  transaction: DbTransaction,
  batch: BatchRow,
): Promise<Pick<SourceProductUpsertResult, "failedCount" | "status">> {
  const items = await transaction
    .selectFrom("app.import_item")
    .select("status")
    .where("import_batch_id", "=", batch.id)
    .execute();
  const counts = items.reduce(
    (value, item) => {
      if (item.status === "SUCCEEDED") value.success++;
      if (item.status === "FAILED") value.failed++;
      if (item.status === "SKIPPED") value.skipped++;
      if (item.status === "REVIEW_REQUIRED") value.review++;
      return value;
    },
    { failed: 0, review: 0, skipped: 0, success: 0 },
  );
  const status =
    counts.failed === items.length ? "FAILED" : counts.failed > 0 ? "PARTIAL_FAILED" : "SUCCEEDED";
  await transaction
    .updateTable("app.import_batch")
    .set({
      failed_count: counts.failed,
      finished_at: new Date(),
      review_count: counts.review,
      skipped_count: counts.skipped,
      status,
      success_count: counts.success,
    })
    .where("id", "=", batch.id)
    .execute();
  return { failedCount: counts.failed, status };
}

async function process(
  transaction: DbTransaction,
  batchPublicId: string,
): Promise<SourceProductUpsertResult> {
  const batch = await transaction
    .selectFrom("app.import_batch")
    .innerJoin("app.platform", "app.platform.id", "app.import_batch.platform_id")
    .select([
      "app.import_batch.id",
      "app.import_batch.platform_id as platformId",
      "app.import_batch.status",
      "app.platform.code as platformCode",
    ])
    .where("app.import_batch.public_id", "=", batchPublicId)
    .forUpdate()
    .executeTakeFirst();
  if (batch === undefined) {
    throw new SourceProductUpsertError("IMPORT_BATCH_NOT_FOUND", "Import batch was not found");
  }
  if (batch.status !== "RUNNING") {
    throw new SourceProductUpsertError("IMPORT_BATCH_NOT_RUNNING", "Import batch is not running");
  }
  if (batch.platformCode.length === 0) {
    throw new SourceProductUpsertError(
      "IMPORT_BATCH_PLATFORM_INVALID",
      "Import batch source platform is invalid",
    );
  }

  const items = await transaction
    .selectFrom("app.import_item")
    .select(["id", "external_product_id as externalProductId", "raw_json as rawJson"])
    .where("import_batch_id", "=", batch.id)
    .where("status", "=", "PENDING")
    .orderBy("input_row_no")
    .execute();
  const counts = { created: 0, matched: 0, updated: 0 };
  for (const item of items) {
    const action = await upsertSourceProduct(transaction, batch, item);
    if (action === "CREATED") counts.created++;
    if (action === "MATCHED") counts.matched++;
    if (action === "UPDATED") counts.updated++;
  }
  const completion = await completeBatch(transaction, batch);
  return {
    batchPublicId,
    createdCount: counts.created,
    failedCount: completion.failedCount,
    matchedCount: counts.matched,
    status: completion.status,
    updatedCount: counts.updated,
  };
}

export function createSourceProductUpsertService(database: Pick<DatabaseClient, "transaction">) {
  return {
    process: (batchPublicId: string): Promise<SourceProductUpsertResult> =>
      database.transaction((transaction) => process(transaction, batchPublicId)),
  };
}
