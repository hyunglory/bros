import type { DatabaseClient, DbTransaction, JsonObject, JsonValue } from "@bros/db";
import { queueTransaction } from "@bros/queue";
import type { QueuePort } from "@bros/queue";
import { sql } from "kysely";

import { normalizeBrandAliasName } from "./brand-normalizer.js";
import { productImportQueueVersion } from "./product-import-admission.js";

const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function reviewVersion(envelope: JsonObject): number {
  const review = envelope.brandReview;
  if (!object(review)) return 0;
  return typeof review.version === "number" &&
    Number.isInteger(review.version) &&
    review.version >= 1
    ? review.version
    : 0;
}

function isUnresolvedBrandEnvelope(envelope: JsonObject): boolean {
  const creation = envelope.masterCreation;
  if (!object(creation) || !object(creation.input) || !object(creation.input.brand)) return false;
  return creation.input.brand.status === "UNRESOLVED";
}

function reprocessEnvelope(envelope: JsonObject): JsonObject {
  const copy = { ...envelope };
  delete copy.sourceUpsert;
  delete copy.masterCreation;
  delete copy.skuMapping;
  delete copy.imageRegistration;
  delete copy.pipelineTracking;
  delete copy.brandReview;
  return copy;
}

export type BrandReviewDecision = "APPROVED" | "REJECTED";
export type BrandAliasScope = "GLOBAL" | "PLATFORM";

export interface ApproveBrandReviewInput {
  brandPublicId: string;
  changeReason: string;
  expectedVersion: number;
  scope: BrandAliasScope;
}

export interface RejectBrandReviewInput {
  changeReason: string;
  expectedVersion: number;
}

export interface BrandReviewDecisionResult {
  aliasCreated: boolean;
  decision: BrandReviewDecision;
  publicId: string;
  reprocessBatchPublicId: string | null;
  version: number;
}

export class BrandReviewError extends Error {
  constructor(
    readonly code: string,
    readonly details?: { actualVersion: number; expectedVersion: number },
  ) {
    super(code);
    this.name = "BrandReviewError";
  }
}

interface LockedReview {
  envelope: JsonObject;
  externalProductId: string;
  itemId: string;
  itemPublicId: string;
  platformId: string;
  platformIsActive: boolean;
  platformPublicId: string;
  rawBrandName: string;
  sourcePublicId: string;
}

async function lockReview(
  tx: DbTransaction,
  itemPublicId: string,
  expectedVersion: number,
): Promise<LockedReview> {
  if (!publicIdPattern.test(itemPublicId)) throw new BrandReviewError("INVALID_BRAND_REVIEW_ID");
  const item = await tx
    .selectFrom("app.import_item")
    .select(["id", "public_id", "source_product_id", "status", "external_product_id", "raw_json"])
    .where("public_id", "=", itemPublicId)
    .forUpdate()
    .executeTakeFirst();
  if (!item) throw new BrandReviewError("BRAND_REVIEW_NOT_FOUND");
  if (item.status !== "REVIEW_REQUIRED" || !object(item.raw_json))
    throw new BrandReviewError("BRAND_REVIEW_NOT_PENDING");
  const envelope = item.raw_json;
  if (!isUnresolvedBrandEnvelope(envelope) || item.source_product_id === null)
    throw new BrandReviewError("BRAND_REVIEW_NOT_PENDING");
  const actualVersion = reviewVersion(envelope);
  if (actualVersion !== expectedVersion)
    throw new BrandReviewError("BRAND_REVIEW_VERSION_CONFLICT", {
      actualVersion,
      expectedVersion,
    });
  if (object(envelope.brandReview) && envelope.brandReview.decision)
    throw new BrandReviewError("BRAND_REVIEW_ALREADY_DECIDED");
  const source = await tx
    .selectFrom("app.source_product as s")
    .innerJoin("app.platform as p", "p.id", "s.platform_id")
    .select([
      "s.public_id as sourcePublicId",
      "s.raw_brand_name as rawBrandName",
      "p.id as platformId",
      "p.is_active as platformIsActive",
      "p.public_id as platformPublicId",
    ])
    .where("s.id", "=", item.source_product_id)
    .executeTakeFirst();
  if (!source?.rawBrandName || !item.external_product_id)
    throw new BrandReviewError("BRAND_REVIEW_SOURCE_INVALID");
  return {
    envelope,
    externalProductId: item.external_product_id,
    itemId: item.id,
    itemPublicId: item.public_id,
    platformId: source.platformId,
    platformIsActive: source.platformIsActive,
    platformPublicId: source.platformPublicId,
    rawBrandName: source.rawBrandName,
    sourcePublicId: source.sourcePublicId,
  };
}

function validateDecisionInput(input: { changeReason: string; expectedVersion: number }): void {
  const reason = input.changeReason.normalize("NFKC").trim();
  if (
    !Number.isInteger(input.expectedVersion) ||
    input.expectedVersion < 0 ||
    reason.length < 1 ||
    reason.length > 500
  )
    throw new BrandReviewError("INVALID_BRAND_REVIEW_INPUT");
}

function decisionRecord(input: {
  aliasNorm: string;
  brand?: { brandKey: string; nameEn: string | null; nameKo: string | null; publicId: string };
  changeReason: string;
  decision: BrandReviewDecision;
  reprocessBatchPublicId?: string;
  reprocessItemPublicId?: string;
  scope?: BrandAliasScope;
  version: number;
}) {
  return {
    actorSource: "LOCAL_ADMIN",
    aliasNorm: input.aliasNorm,
    ...(input.brand ? { brand: input.brand } : {}),
    decision: input.decision,
    decidedAt: new Date().toISOString(),
    reason: input.changeReason.normalize("NFKC").trim(),
    ...(input.reprocessBatchPublicId
      ? { reprocessBatchPublicId: input.reprocessBatchPublicId }
      : {}),
    ...(input.reprocessItemPublicId ? { reprocessItemPublicId: input.reprocessItemPublicId } : {}),
    ...(input.scope ? { scope: input.scope } : {}),
    version: input.version,
  };
}

export function createBrandReviewService(
  database: DatabaseClient,
  options: { maxQueuedBatches?: number; queue?: QueuePort } = {},
) {
  const maxQueuedBatches = options.maxQueuedBatches ?? 32;
  if (!Number.isInteger(maxQueuedBatches) || maxQueuedBatches < 1 || maxQueuedBatches > 1000)
    throw new BrandReviewError("INVALID_BRAND_REVIEW_OPTIONS");

  return {
    approve: async (
      itemPublicId: string,
      input: ApproveBrandReviewInput,
    ): Promise<BrandReviewDecisionResult> => {
      const queue = options.queue;
      if (!queue) throw new BrandReviewError("BRAND_REVIEW_QUEUE_UNAVAILABLE");
      validateDecisionInput(input);
      if (input.scope !== "GLOBAL" && input.scope !== "PLATFORM")
        throw new BrandReviewError("INVALID_BRAND_REVIEW_INPUT");
      if (!publicIdPattern.test(input.brandPublicId))
        throw new BrandReviewError("INVALID_BRAND_ID");
      return database
        .transaction(async (tx) => {
          const review = await lockReview(tx, itemPublicId, input.expectedVersion);
          if (!review.platformIsActive)
            throw new BrandReviewError("BRAND_REVIEW_PLATFORM_INACTIVE");
          const aliasNorm = normalizeBrandAliasName(review.rawBrandName);
          if (!aliasNorm) throw new BrandReviewError("BRAND_REVIEW_SOURCE_INVALID");
          const aliasPlatformId = input.scope === "PLATFORM" ? review.platformId : null;
          await sql`select pg_advisory_xact_lock(
            hashtextextended(${`bros/brand-alias/v1/${aliasPlatformId ?? "GLOBAL"}/${aliasNorm}`}, 0)
          )`.execute(tx);
          const brand = await tx
            .selectFrom("app.brand")
            .select([
              "id",
              "public_id as publicId",
              "brand_key as brandKey",
              "name_ko as nameKo",
              "name_en as nameEn",
              "is_active as isActive",
            ])
            .where("public_id", "=", input.brandPublicId)
            .forShare()
            .executeTakeFirst();
          if (!brand) throw new BrandReviewError("BRAND_NOT_FOUND");
          if (!brand.isActive) throw new BrandReviewError("BRAND_INACTIVE");
          const existingAlias = await tx
            .selectFrom("app.brand_alias")
            .select(["id", "brand_id"])
            .where("alias_norm", "=", aliasNorm)
            .where("platform_id", aliasPlatformId === null ? "is" : "=", aliasPlatformId)
            .executeTakeFirst();
          if (existingAlias && existingAlias.brand_id !== brand.id)
            throw new BrandReviewError("BRAND_ALIAS_CONFLICT");
          let aliasCreated = false;
          if (!existingAlias) {
            await tx
              .insertInto("app.brand_alias")
              .values({
                alias_name: review.rawBrandName.normalize("NFKC").trim(),
                alias_norm: aliasNorm,
                brand_id: brand.id,
                platform_id: aliasPlatformId,
              })
              .execute();
            aliasCreated = true;
          }

          const active = await tx
            .selectFrom("app.import_batch")
            .select(sql<number>`count(*)::int`.as("count"))
            .where(
              sql<boolean>`config_json->'importQueue'->>'status' in ('QUEUED','RUNNING','RETRY_WAIT')`,
            )
            .executeTakeFirstOrThrow();
          if (active.count >= maxQueuedBatches)
            throw new BrandReviewError("BRAND_REVIEW_BACKPRESSURE");
          const now = new Date();
          const batch = await tx
            .insertInto("app.import_batch")
            .values({
              platform_id: review.platformId,
              import_type: "BRAND_REVIEW_REPROCESS",
              status: "RUNNING",
              total_count: 1,
              source_name: `brand-review/${review.itemPublicId}`,
              started_at: now,
              config_json: JSON.stringify({
                brandReview: {
                  sourceItemPublicId: review.itemPublicId,
                  sourceProductPublicId: review.sourcePublicId,
                },
              }),
            })
            .returning(["id", "public_id as publicId", "config_json as config"])
            .executeTakeFirstOrThrow();
          const item = await tx
            .insertInto("app.import_item")
            .values({
              import_batch_id: batch.id,
              external_product_id: review.externalProductId,
              input_row_no: 1,
              raw_json: JSON.stringify(reprocessEnvelope(review.envelope)),
              status: "PENDING",
            })
            .returning("public_id as publicId")
            .executeTakeFirstOrThrow();
          const receipt = await queue.publish(
            "product.import",
            { publicId: batch.publicId },
            queueTransaction(tx),
          );
          await tx
            .updateTable("app.import_batch")
            .set({
              config_json: JSON.stringify({
                ...batch.config,
                importQueue: {
                  version: productImportQueueVersion,
                  ...receipt,
                  status: "QUEUED",
                  attempt: 0,
                  queuedAt: now.toISOString(),
                  completedAt: null,
                  progress: null,
                },
              }),
            })
            .where("id", "=", batch.id)
            .execute();
          const version = input.expectedVersion + 1;
          await tx
            .updateTable("app.import_item")
            .set({
              raw_json: JSON.stringify({
                ...review.envelope,
                brandReview: decisionRecord({
                  aliasNorm,
                  brand: {
                    publicId: brand.publicId,
                    brandKey: brand.brandKey,
                    nameKo: brand.nameKo,
                    nameEn: brand.nameEn,
                  },
                  changeReason: input.changeReason,
                  decision: "APPROVED",
                  reprocessBatchPublicId: batch.publicId,
                  reprocessItemPublicId: item.publicId,
                  scope: input.scope,
                  version,
                }),
              }),
            })
            .where("id", "=", review.itemId)
            .execute();
          return {
            aliasCreated,
            decision: "APPROVED" as const,
            publicId: review.itemPublicId,
            reprocessBatchPublicId: batch.publicId,
            version,
          };
        })
        .catch((error: unknown) => {
          if (error instanceof BrandReviewError) throw error;
          throw new BrandReviewError("BRAND_REVIEW_PERSISTENCE_FAILED");
        });
    },

    reject: async (
      itemPublicId: string,
      input: RejectBrandReviewInput,
    ): Promise<BrandReviewDecisionResult> => {
      validateDecisionInput(input);
      return database
        .transaction(async (tx) => {
          const review = await lockReview(tx, itemPublicId, input.expectedVersion);
          const aliasNorm = normalizeBrandAliasName(review.rawBrandName);
          if (!aliasNorm) throw new BrandReviewError("BRAND_REVIEW_SOURCE_INVALID");
          await sql`select pg_advisory_xact_lock(
            hashtextextended(${`bros/brand-alias/v1/${review.platformId}/${aliasNorm}`}, 0)
          )`.execute(tx);
          const version = input.expectedVersion + 1;
          await tx
            .updateTable("app.import_item")
            .set({
              raw_json: JSON.stringify({
                ...review.envelope,
                brandReview: decisionRecord({
                  aliasNorm,
                  changeReason: input.changeReason,
                  decision: "REJECTED",
                  version,
                }),
              }),
            })
            .where("id", "=", review.itemId)
            .execute();
          return {
            aliasCreated: false,
            decision: "REJECTED" as const,
            publicId: review.itemPublicId,
            reprocessBatchPublicId: null,
            version,
          };
        })
        .catch((error: unknown) => {
          if (error instanceof BrandReviewError) throw error;
          throw new BrandReviewError("BRAND_REVIEW_PERSISTENCE_FAILED");
        });
    },
  };
}
