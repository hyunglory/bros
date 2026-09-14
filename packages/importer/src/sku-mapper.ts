import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import {
  validateSourceImportContext,
  validateSourceProductInput,
  type SourceOptionInput,
} from "@bros/contracts";
import type { DatabaseClient, DbTransaction, JsonObject, JsonValue } from "@bros/db";
import { sql } from "kysely";

const stage = "P2-10/v1";
const lockNamespace = "bros/sku-option/v1";

export interface SkuMapperOptions {
  lockTimeoutMs?: number;
  maxAttempts?: number;
}

export interface SkuMappingResult {
  itemPublicId: string;
  sourcePublicId: string | null;
  masterPublicId: string | null;
  action: "MAPPED" | "REVIEW_REQUIRED" | "SKIPPED";
  reason: string;
  mappedCount: number;
  skuPublicIds: string[];
}

export class SkuMapperError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "SkuMapperError";
  }
}

function record(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/**
 * Deliberately conservative: equivalence is only Unicode compatibility,
 * whitespace, and case. Punctuation and token order remain meaningful until a
 * separately approved variant policy exists.
 */
export function normalizeSkuOptionName(rawOptionName: string): string {
  return rawOptionName.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

export function toOptionKey(rawOptionName: string): string {
  return `v1:${normalizeSkuOptionName(rawOptionName)}`;
}

export function skuOptionLockKey(masterPublicId: string, optionKey: string): string {
  return createHash("sha256")
    .update(JSON.stringify([lockNamespace, masterPublicId, optionKey]))
    .digest()
    .readBigInt64BE()
    .toString();
}

function result(
  itemPublicId: string,
  sourcePublicId: string | null,
  masterPublicId: string | null,
  action: SkuMappingResult["action"],
  reason: string,
  skuPublicIds: string[] = [],
): SkuMappingResult {
  return {
    itemPublicId,
    sourcePublicId,
    masterPublicId,
    action,
    reason,
    mappedCount: skuPublicIds.length,
    skuPublicIds,
  };
}

async function persistResult(
  tx: DbTransaction,
  itemId: string,
  envelope: JsonObject,
  mapping: SkuMappingResult,
): Promise<void> {
  await tx
    .updateTable("app.import_item")
    .set({
      raw_json: JSON.stringify({
        ...envelope,
        skuMapping: { stage, result: mapping, completedAt: new Date().toISOString() },
      }),
      processed_at: new Date(),
    })
    .where("id", "=", itemId)
    .execute();
}

function duplicateOptionKey(options: readonly SourceOptionInput[]): string | null {
  const seen = new Set<string>();
  for (const option of options) {
    const key = toOptionKey(option.rawOptionName);
    if (seen.has(key)) return key;
    seen.add(key);
  }
  return null;
}

async function processItem(tx: DbTransaction, itemPublicId: string, lockTimeoutMs: number) {
  await sql`select set_config('lock_timeout', ${`${lockTimeoutMs}ms`}, true)`.execute(tx);
  const item = await tx
    .selectFrom("app.import_item")
    .selectAll()
    .where("public_id", "=", itemPublicId)
    .forUpdate()
    .executeTakeFirst();
  if (!item) throw new SkuMapperError("IMPORT_ITEM_NOT_FOUND");
  if (!record(item.raw_json)) throw new SkuMapperError("PERSISTED_INPUT_INVALID");
  const envelope = item.raw_json;
  if (record(envelope.skuMapping) && envelope.skuMapping.stage === stage) {
    return envelope.skuMapping.result as unknown as SkuMappingResult;
  }
  if (item.source_product_id === null) throw new SkuMapperError("IMPORT_ITEM_NOT_READY");
  const inputResult = validateSourceProductInput(envelope.mappedInput);
  const contextResult = validateSourceImportContext(envelope.context);
  if (!inputResult.ok || !contextResult.ok) throw new SkuMapperError("PERSISTED_INPUT_INVALID");
  const input = inputResult.value;
  const source = await tx
    .selectFrom("app.source_product")
    .selectAll()
    .where("id", "=", item.source_product_id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const fresh =
    source.collected_at.getTime() === Date.parse(contextResult.value.collectedAt) &&
    source.raw_product_name === input.productName &&
    source.raw_brand_name === (input.brandName ?? null) &&
    source.external_product_id === input.externalProductId &&
    isDeepStrictEqual(source.raw_json, input.raw);
  if (!fresh) {
    const skipped = result(
      itemPublicId,
      source.public_id,
      null,
      "SKIPPED",
      "SOURCE_SNAPSHOT_CHANGED",
    );
    await persistResult(tx, item.id, envelope, skipped);
    return skipped;
  }
  if (source.product_id === null) {
    const skipped = result(itemPublicId, source.public_id, null, "SKIPPED", "MASTER_NOT_LINKED");
    await persistResult(tx, item.id, envelope, skipped);
    return skipped;
  }
  const master = await tx
    .selectFrom("app.product_master")
    .select(["id", "public_id"])
    .where("id", "=", source.product_id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const options = input.options ?? [];
  if (options.length === 0) {
    const skipped = result(
      itemPublicId,
      source.public_id,
      master.public_id,
      "SKIPPED",
      "NO_SOURCE_OPTIONS",
    );
    await persistResult(tx, item.id, envelope, skipped);
    return skipped;
  }
  if (duplicateOptionKey(options) !== null) {
    const review = result(
      itemPublicId,
      source.public_id,
      master.public_id,
      "REVIEW_REQUIRED",
      "DUPLICATE_NORMALIZED_OPTION",
    );
    await persistResult(tx, item.id, envelope, review);
    return review;
  }

  const existingSourceSkus = await tx
    .selectFrom("app.source_sku")
    .selectAll()
    .where("source_product_id", "=", source.id)
    .forUpdate()
    .execute();
  const byOptionKey = new Map(existingSourceSkus.map((row) => [row.option_key, row]));
  const byExternalId = new Map<string, (typeof existingSourceSkus)[number]>();
  for (const existing of existingSourceSkus) {
    if (existing.external_sku_id !== null) byExternalId.set(existing.external_sku_id, existing);
  }
  for (const option of options) {
    if (option.externalSkuId === undefined) continue;
    const conflicting = byExternalId.get(option.externalSkuId);
    if (conflicting && conflicting.option_key !== toOptionKey(option.rawOptionName)) {
      const review = result(
        itemPublicId,
        source.public_id,
        master.public_id,
        "REVIEW_REQUIRED",
        "SOURCE_EXTERNAL_SKU_CONFLICT",
      );
      await persistResult(tx, item.id, envelope, review);
      return review;
    }
  }
  const existingLinkedSkuIds = [
    ...new Set(
      options
        .map((option) => byOptionKey.get(toOptionKey(option.rawOptionName))?.sku_id ?? null)
        .filter((skuId): skuId is string => skuId !== null),
    ),
  ];
  if (existingLinkedSkuIds.length > 0) {
    const linkedSkus = await tx
      .selectFrom("app.product_sku")
      .select(["id", "product_id"])
      .where("id", "in", existingLinkedSkuIds)
      .execute();
    if (linkedSkus.some((sku) => sku.product_id !== master.id)) {
      const review = result(
        itemPublicId,
        source.public_id,
        master.public_id,
        "REVIEW_REQUIRED",
        "SOURCE_SKU_LINK_CONFLICT",
      );
      await persistResult(tx, item.id, envelope, review);
      return review;
    }
  }

  const lockKeys = [
    ...new Set(
      options.map((option) =>
        skuOptionLockKey(master.public_id, toOptionKey(option.rawOptionName)),
      ),
    ),
  ].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
  for (const key of lockKeys) await sql`select pg_advisory_xact_lock(${key}::bigint)`.execute(tx);

  const skuPublicIds: string[] = [];
  for (const option of [...options].sort((a, b) => a.sourceOrder - b.sourceOrder)) {
    const optionKey = toOptionKey(option.rawOptionName);
    let sku = await tx
      .selectFrom("app.product_sku")
      .select(["id", "public_id"])
      .where("product_id", "=", master.id)
      .where("option_key", "=", optionKey)
      .forUpdate()
      .executeTakeFirst();
    if (!sku) {
      sku = await tx
        .insertInto("app.product_sku")
        .values({
          product_id: master.id,
          sku_name: option.rawOptionName,
          option_key: optionKey,
          option_json: JSON.stringify({
            schemaVersion: 1,
            normalizedOptionName: normalizeSkuOptionName(option.rawOptionName),
            rawOptionName: option.rawOptionName,
          }),
          sort_order: option.sourceOrder,
          status: "REVIEW_REQUIRED",
        })
        .returning(["id", "public_id"])
        .executeTakeFirstOrThrow();
    }
    const existing = byOptionKey.get(optionKey);
    const values = {
      external_sku_id: option.externalSkuId ?? null,
      sku_id: sku.id,
      raw_option_name: option.rawOptionName,
      option_key: optionKey,
      option_json: JSON.stringify({
        schemaVersion: 1,
        normalizedOptionName: normalizeSkuOptionName(option.rawOptionName),
        rawOptionName: option.rawOptionName,
        sourceOrder: option.sourceOrder,
      }),
      current_price: option.currentPrice ?? null,
      stock_status: option.stockStatus ?? "UNKNOWN",
      raw_json: JSON.stringify({ schemaVersion: 1, stage, itemPublicId, option }),
    };
    if (existing) {
      await tx.updateTable("app.source_sku").set(values).where("id", "=", existing.id).execute();
    } else {
      await tx
        .insertInto("app.source_sku")
        .values({ source_product_id: source.id, ...values })
        .execute();
    }
    skuPublicIds.push(sku.public_id);
  }
  const mapped = result(
    itemPublicId,
    source.public_id,
    master.public_id,
    "MAPPED",
    "MAPPED",
    skuPublicIds,
  );
  await persistResult(tx, item.id, envelope, mapped);
  return mapped;
}

export function createSkuMapper(
  database: Pick<DatabaseClient, "db">,
  options: SkuMapperOptions = {},
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
    throw new SkuMapperError("INVALID_SKU_MAPPER_OPTIONS");
  }
  return {
    process: async (itemPublicId: string): Promise<SkuMappingResult> => {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          itemPublicId,
        )
      ) {
        throw new SkuMapperError("INVALID_IMPORT_ITEM_ID");
      }
      for (let attempt = 1; ; attempt++) {
        try {
          return await database.db
            .transaction()
            .setIsolationLevel("read committed")
            .execute((tx) => processItem(tx, itemPublicId, lockTimeoutMs));
        } catch (error) {
          if (error instanceof SkuMapperError) throw error;
          const code =
            typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
          if (code === "55P03" || code === "40P01" || code === "40001") {
            if (attempt === maxAttempts) throw new SkuMapperError("SKU_LOCK_RETRY_EXHAUSTED");
            await delay(25 * attempt);
            continue;
          }
          throw new SkuMapperError("SKU_PERSISTENCE_FAILED");
        }
      }
    },
  };
}
