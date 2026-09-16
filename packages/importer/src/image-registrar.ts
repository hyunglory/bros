import { isDeepStrictEqual } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import {
  validateSourceImportContext,
  validateSourceProductInput,
  type SourceProductInput,
} from "@bros/contracts";
import type { DatabaseClient, DbTransaction, JsonObject, JsonValue } from "@bros/db";
import { sql } from "kysely";

import { toOptionKey } from "./sku-mapper.js";

const stage = "P2-11/v1";
const masterStage = "P2-09/v1";

export interface ImageRegistrarOptions {
  lockTimeoutMs?: number;
  maxAttempts?: number;
}

export interface SourceImageOccurrence {
  imageType: "SOURCE_MAIN" | "SOURCE_DETAIL";
  occurrenceKey: string;
  optionKey: string | null;
  raw: JsonValue;
  sourceOrder: number;
  sourceUrl: string;
  scope: "PRODUCT" | "OPTION";
}

export interface ImageRegistrationResult {
  action: "REGISTERED" | "REVIEW_REQUIRED" | "SKIPPED";
  createdCount: number;
  imagePublicIds: string[];
  itemPublicId: string;
  masterPublicId: string | null;
  reason: string;
  reusedCount: number;
  sourcePublicId: string | null;
}

export class ImageRegistrarError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ImageRegistrarError";
  }
}

function record(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function sourceImageOccurrences(input: SourceProductInput): SourceImageOccurrence[] {
  const productImages = (input.images ?? []).map((image) => ({
    imageType: image.imageType === "MAIN" ? ("SOURCE_MAIN" as const) : ("SOURCE_DETAIL" as const),
    occurrenceKey: `product:${image.imageType}:${image.sourceOrder}`,
    optionKey: null,
    raw: image.raw as JsonValue,
    sourceOrder: image.sourceOrder,
    sourceUrl: image.sourceUrl,
    scope: "PRODUCT" as const,
  }));
  const optionImages = (input.options ?? []).flatMap((option) =>
    option.imageUrl === undefined
      ? []
      : [
          {
            imageType: "SOURCE_DETAIL" as const,
            occurrenceKey: `option:${toOptionKey(option.rawOptionName)}:${option.sourceOrder}`,
            optionKey: toOptionKey(option.rawOptionName),
            raw: option.raw as JsonValue,
            sourceOrder: option.sourceOrder,
            sourceUrl: option.imageUrl,
            scope: "OPTION" as const,
          },
        ],
  );
  return [...productImages, ...optionImages].sort((a, b) =>
    a.occurrenceKey.localeCompare(b.occurrenceKey, "en-US"),
  );
}

function imageSnapshot(input: SourceProductInput) {
  return sourceImageOccurrences(input).map((image) => ({
    imageType: image.imageType,
    occurrenceKey: image.occurrenceKey,
    sourceUrl: image.sourceUrl,
  }));
}

function createResult(
  itemPublicId: string,
  sourcePublicId: string | null,
  masterPublicId: string | null,
  action: ImageRegistrationResult["action"],
  reason: string,
  imagePublicIds: string[] = [],
  createdCount = 0,
): ImageRegistrationResult {
  return {
    action,
    createdCount,
    imagePublicIds,
    itemPublicId,
    masterPublicId,
    reason,
    reusedCount: imagePublicIds.length - createdCount,
    sourcePublicId,
  };
}

async function saveResult(
  tx: DbTransaction,
  itemId: string,
  envelope: JsonObject,
  registration: ImageRegistrationResult,
) {
  await tx
    .updateTable("app.import_item")
    .set({
      processed_at: new Date(),
      raw_json: JSON.stringify({
        ...envelope,
        imageRegistration: {
          completedAt: new Date().toISOString(),
          result: registration,
          stage,
        },
      }),
    })
    .where("id", "=", itemId)
    .execute();
}

async function processItem(tx: DbTransaction, itemPublicId: string, lockTimeoutMs: number) {
  await sql`select set_config('lock_timeout', ${`${lockTimeoutMs}ms`}, true)`.execute(tx);
  const item = await tx
    .selectFrom("app.import_item")
    .selectAll()
    .where("public_id", "=", itemPublicId)
    .forUpdate()
    .executeTakeFirst();
  if (!item) throw new ImageRegistrarError("IMPORT_ITEM_NOT_FOUND");
  if (!record(item.raw_json)) throw new ImageRegistrarError("PERSISTED_INPUT_INVALID");
  const envelope = item.raw_json;
  if (record(envelope.pipelineTracking)) throw new ImageRegistrarError("IMPORT_ITEM_FINALIZED");
  if (record(envelope.imageRegistration) && envelope.imageRegistration.stage === stage) {
    return envelope.imageRegistration.result as unknown as ImageRegistrationResult;
  }
  if (!record(envelope.masterCreation) || envelope.masterCreation.stage !== masterStage) {
    throw new ImageRegistrarError("MASTER_STAGE_NOT_COMPLETE");
  }
  if (item.source_product_id === null) throw new ImageRegistrarError("IMPORT_ITEM_NOT_READY");
  const inputResult = validateSourceProductInput(envelope.mappedInput);
  const contextResult = validateSourceImportContext(envelope.context);
  if (!inputResult.ok || !contextResult.ok) {
    throw new ImageRegistrarError("PERSISTED_INPUT_INVALID");
  }
  const input = inputResult.value;
  const source = await tx
    .selectFrom("app.source_product")
    .selectAll()
    .where("id", "=", item.source_product_id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const fresh =
    source.collected_at.getTime() === Date.parse(contextResult.value.collectedAt) &&
    source.external_product_id === input.externalProductId &&
    source.raw_product_name === input.productName &&
    source.raw_brand_name === (input.brandName ?? null) &&
    isDeepStrictEqual(source.raw_json, input.raw);
  if (!fresh) {
    const skipped = createResult(
      itemPublicId,
      source.public_id,
      null,
      "SKIPPED",
      "SOURCE_SNAPSHOT_CHANGED",
    );
    await saveResult(tx, item.id, envelope, skipped);
    return skipped;
  }

  const siblings = await tx
    .selectFrom("app.import_item")
    .select("raw_json")
    .where("source_product_id", "=", source.id)
    .where("id", "!=", item.id)
    .execute();
  const ambiguousSnapshot = siblings.some((sibling) => {
    if (!record(sibling.raw_json)) return false;
    const otherContext = validateSourceImportContext(sibling.raw_json.context);
    const otherInput = validateSourceProductInput(sibling.raw_json.mappedInput);
    return (
      otherContext.ok &&
      otherInput.ok &&
      Date.parse(otherContext.value.collectedAt) === source.collected_at.getTime() &&
      !isDeepStrictEqual(imageSnapshot(otherInput.value), imageSnapshot(input))
    );
  });
  const master =
    source.product_id === null
      ? null
      : await tx
          .selectFrom("app.product_master")
          .select(["id", "public_id"])
          .where("id", "=", source.product_id)
          .forShare()
          .executeTakeFirstOrThrow();
  if (ambiguousSnapshot) {
    const review = createResult(
      itemPublicId,
      source.public_id,
      master?.public_id ?? null,
      "REVIEW_REQUIRED",
      "SOURCE_IMAGE_SNAPSHOT_AMBIGUOUS",
    );
    await saveResult(tx, item.id, envelope, review);
    return review;
  }
  const occurrences = sourceImageOccurrences(input);
  if (occurrences.length === 0) {
    const skipped = createResult(
      itemPublicId,
      source.public_id,
      master?.public_id ?? null,
      "SKIPPED",
      "NO_SOURCE_IMAGES",
    );
    await saveResult(tx, item.id, envelope, skipped);
    return skipped;
  }

  const sourceSkus = await tx
    .selectFrom("app.source_sku")
    .leftJoin("app.product_sku", "app.product_sku.id", "app.source_sku.sku_id")
    .select([
      "app.source_sku.option_key as optionKey",
      "app.source_sku.sku_id as skuId",
      "app.product_sku.product_id as skuProductId",
    ])
    .where("app.source_sku.source_product_id", "=", source.id)
    .execute();
  const skuByOptionKey = new Map(sourceSkus.map((sku) => [sku.optionKey, sku]));
  if (
    sourceSkus.some(
      (sku) =>
        sku.skuId !== null &&
        (master === null || sku.skuProductId === null || sku.skuProductId !== master.id),
    )
  ) {
    const review = createResult(
      itemPublicId,
      source.public_id,
      master?.public_id ?? null,
      "REVIEW_REQUIRED",
      "SOURCE_SKU_OWNERSHIP_CONFLICT",
    );
    await saveResult(tx, item.id, envelope, review);
    return review;
  }

  const existingImages = await tx
    .selectFrom("app.product_image")
    .selectAll()
    .where("source_product_id", "=", source.id)
    .where("image_type", "in", ["SOURCE_MAIN", "SOURCE_DETAIL"])
    .forUpdate()
    .execute();
  const exactMatches = new Map<string, (typeof existingImages)[number]>();
  for (const occurrence of occurrences) {
    const matches = existingImages.filter(
      (image) =>
        image.image_type === occurrence.imageType &&
        image.source_url === occurrence.sourceUrl &&
        image.metadata_json.occurrenceKey === occurrence.occurrenceKey,
    );
    if (matches.length > 1) {
      const review = createResult(
        itemPublicId,
        source.public_id,
        master?.public_id ?? null,
        "REVIEW_REQUIRED",
        "AMBIGUOUS_EXISTING_IMAGE",
      );
      await saveResult(tx, item.id, envelope, review);
      return review;
    }
    if (matches[0]) exactMatches.set(occurrence.occurrenceKey, matches[0]);
  }
  for (const occurrence of occurrences) {
    const existing = exactMatches.get(occurrence.occurrenceKey);
    if (!existing) continue;
    const desiredSku =
      occurrence.optionKey === null
        ? null
        : (skuByOptionKey.get(occurrence.optionKey)?.skuId ?? null);
    if (
      (existing.product_id !== null && master !== null && existing.product_id !== master.id) ||
      (existing.sku_id !== null && desiredSku !== null && existing.sku_id !== desiredSku)
    ) {
      const review = createResult(
        itemPublicId,
        source.public_id,
        master?.public_id ?? null,
        "REVIEW_REQUIRED",
        "IMAGE_OWNERSHIP_CONFLICT",
      );
      await saveResult(tx, item.id, envelope, review);
      return review;
    }
  }

  const workingImages = [...existingImages];
  const imagePublicIds: string[] = [];
  let createdCount = 0;
  for (const occurrence of occurrences) {
    const desiredSku =
      occurrence.optionKey === null
        ? null
        : (skuByOptionKey.get(occurrence.optionKey)?.skuId ?? null);
    const existing = exactMatches.get(occurrence.occurrenceKey);
    if (existing) {
      if (
        (existing.product_id === null && master !== null) ||
        (existing.sku_id === null && desiredSku !== null)
      ) {
        await tx
          .updateTable("app.product_image")
          .set({
            ...(existing.product_id === null && master !== null ? { product_id: master.id } : {}),
            ...(existing.sku_id === null && desiredSku !== null ? { sku_id: desiredSku } : {}),
            updated_at: new Date(),
          })
          .where("id", "=", existing.id)
          .execute();
      }
      imagePublicIds.push(existing.public_id);
      continue;
    }
    const slotRevision = Math.max(
      0,
      ...workingImages
        .filter((image) => image.metadata_json.occurrenceKey === occurrence.occurrenceKey)
        .map((image) => image.source_revision),
    );
    const urlRevision = Math.max(
      0,
      ...workingImages
        .filter(
          (image) =>
            image.image_type === occurrence.imageType && image.source_url === occurrence.sourceUrl,
        )
        .map((image) => image.source_revision),
    );
    const sourceRevision = Math.max(slotRevision, urlRevision) + 1;
    const metadata = {
      collectedAt: contextResult.value.collectedAt,
      firstSeenItemPublicId: itemPublicId,
      occurrenceKey: occurrence.occurrenceKey,
      optionKey: occurrence.optionKey,
      raw: occurrence.raw,
      schemaVersion: 1,
      scope: occurrence.scope,
      sourceOrder: occurrence.sourceOrder,
      stage,
    };
    const created = await tx
      .insertInto("app.product_image")
      .values({
        image_type: occurrence.imageType,
        metadata_json: JSON.stringify(metadata),
        process_status: "REGISTERED",
        product_id: master?.id ?? null,
        sku_id: desiredSku,
        source_product_id: source.id,
        source_revision: sourceRevision,
        source_url: occurrence.sourceUrl,
      })
      .returning(["id", "public_id"])
      .executeTakeFirstOrThrow();
    workingImages.push({
      ...created,
      content_hash: null,
      created_at: new Date(),
      file_size: null,
      height: null,
      image_type: occurrence.imageType,
      metadata_json: metadata,
      mime_type: null,
      object_key: null,
      process_status: "REGISTERED",
      product_id: master?.id ?? null,
      recipe_hash: null,
      sku_id: desiredSku,
      source_image_id: null,
      source_product_id: source.id,
      source_revision: sourceRevision,
      source_url: occurrence.sourceUrl,
      storage_bucket: null,
      storage_provider: null,
      updated_at: new Date(),
      width: null,
    });
    imagePublicIds.push(created.public_id);
    createdCount++;
  }
  const registered = createResult(
    itemPublicId,
    source.public_id,
    master?.public_id ?? null,
    "REGISTERED",
    "REGISTERED",
    imagePublicIds,
    createdCount,
  );
  await saveResult(tx, item.id, envelope, registered);
  return registered;
}

export function createImageRegistrar(
  database: Pick<DatabaseClient, "db">,
  options: ImageRegistrarOptions = {},
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
    throw new ImageRegistrarError("INVALID_IMAGE_REGISTRAR_OPTIONS");
  }
  return {
    process: async (itemPublicId: string): Promise<ImageRegistrationResult> => {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          itemPublicId,
        )
      ) {
        throw new ImageRegistrarError("INVALID_IMPORT_ITEM_ID");
      }
      for (let attempt = 1; ; attempt++) {
        try {
          return await database.db
            .transaction()
            .setIsolationLevel("read committed")
            .execute((tx) => processItem(tx, itemPublicId, lockTimeoutMs));
        } catch (error) {
          if (error instanceof ImageRegistrarError) throw error;
          const code =
            typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
          if (code === "55P03" || code === "40P01" || code === "40001") {
            if (attempt === maxAttempts) {
              throw new ImageRegistrarError("IMAGE_LOCK_RETRY_EXHAUSTED");
            }
            await delay(25 * attempt);
            continue;
          }
          throw new ImageRegistrarError("IMAGE_PERSISTENCE_FAILED");
        }
      }
    },
  };
}
