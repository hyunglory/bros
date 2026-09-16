import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseClient, JsonObject, JsonValue } from "@bros/db";
import {
  ApproveBrandReviewRequestSchema,
  BrandReviewDecisionResponseSchema,
  BrandReviewListQuerySchema,
  BrandReviewListResponseSchema,
  BrandSearchQuerySchema,
  BrandSearchResponseSchema,
  ErrorEnvelopeSchema,
  PublicIdParamsSchema,
  RejectBrandReviewRequestSchema,
  createErrorEnvelope,
} from "@bros/contracts";
import type {
  ApproveBrandReviewRequest,
  BrandReviewDecision,
  BrandReviewListQuery,
  BrandSearchQuery,
  RejectBrandReviewRequest,
  PublicIdParams,
} from "@bros/contracts";
import {
  BrandReviewError,
  createBrandReviewService,
  normalizeBrandAliasName,
} from "@bros/importer";
import type { QueuePort } from "@bros/queue";
import { sql } from "kysely";

const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const unresolvedReasons = [
  "INACTIVE_PLATFORM",
  "MISSING_BRAND_NAME",
  "UNKNOWN_ALIAS",
  "UNKNOWN_PLATFORM",
] as const;

interface Cursor {
  createdAt: string;
  publicId: string;
}

function object(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function encodeCursor(value: Cursor): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeCursor(value: string | undefined): Cursor | undefined {
  if (value === undefined) return undefined;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      !parsed ||
      typeof parsed !== "object" ||
      Array.isArray(parsed) ||
      Object.keys(parsed).length !== 2 ||
      !("createdAt" in parsed) ||
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      !("publicId" in parsed) ||
      typeof parsed.publicId !== "string" ||
      !publicIdPattern.test(parsed.publicId)
    )
      throw new Error();
    return { createdAt: parsed.createdAt, publicId: parsed.publicId };
  } catch {
    throw new BrandReviewManagementError("INVALID_CURSOR", 400, "Cursor is invalid");
  }
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function literalLike(value: string): string {
  return `%${value.trim().replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function text(value: JsonValue | undefined): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function decision(value: JsonObject) {
  const review = object(value.brandReview) ? value.brandReview : undefined;
  const currentDecision =
    review?.decision === "APPROVED" || review?.decision === "REJECTED"
      ? review.decision
      : "PENDING";
  const brand = object(review?.brand) ? review.brand : undefined;
  const brandPublicId = text(brand?.publicId);
  const brandKey = text(brand?.brandKey);
  const selectedBrand =
    brandPublicId && publicIdPattern.test(brandPublicId) && brandKey
      ? {
          publicId: brandPublicId,
          key: brandKey,
          nameKo: text(brand?.nameKo) ?? null,
          nameEn: text(brand?.nameEn) ?? null,
        }
      : null;
  return {
    decision: currentDecision,
    selectedBrand,
    aliasScope: review?.scope === "PLATFORM" || review?.scope === "GLOBAL" ? review.scope : null,
    decisionReason: text(review?.reason)?.slice(0, 500) ?? null,
    decidedAt: text(review?.decidedAt) ?? null,
    reprocessBatchPublicId:
      typeof review?.reprocessBatchPublicId === "string" &&
      publicIdPattern.test(review.reprocessBatchPublicId)
        ? review.reprocessBatchPublicId
        : null,
    version:
      typeof review?.version === "number" && Number.isInteger(review.version) && review.version >= 1
        ? review.version
        : 0,
  };
}

function unresolved(value: JsonObject) {
  const creation = object(value.masterCreation) ? value.masterCreation : undefined;
  const input = object(creation?.input) ? creation.input : undefined;
  const brand = object(input?.brand) ? input.brand : undefined;
  const result = object(creation?.result) ? creation.result : undefined;
  const reason = unresolvedReasons.includes(brand?.reason as (typeof unresolvedReasons)[number])
    ? (brand?.reason as (typeof unresolvedReasons)[number])
    : "UNKNOWN_ALIAS";
  return { reason, matchReason: text(result?.reason)?.slice(0, 100) ?? null };
}

export class BrandReviewManagementError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: 400 | 404,
    readonly safeMessage: string,
  ) {
    super(code);
  }
}

export function createBrandReviewManagementService(database: DatabaseClient) {
  return {
    async list(query: BrandReviewListQuery) {
      const limit = query.limit ?? 50;
      const cursor = decodeCursor(query.cursor);
      const cursorDate = sql<Date>`${cursor?.createdAt ?? "1970-01-01T00:00:00Z"}::timestamptz`;
      const cursorPublicId = cursor?.publicId ?? "00000000-0000-7000-8000-000000000000";
      const platformQuery = query.platform ? literalLike(query.platform) : undefined;
      const searchQuery = query.query ? literalLike(query.query) : undefined;
      const rows = await database.db
        .selectFrom("app.import_item as i")
        .innerJoin("app.source_product as s", "s.id", "i.source_product_id")
        .innerJoin("app.platform as p", "p.id", "s.platform_id")
        .select([
          "i.public_id as publicId",
          "i.raw_json as envelope",
          "i.external_product_id as externalProductId",
          "i.created_at as createdAt",
          sql<string>`i.created_at::text`.as("createdAtCursor"),
          "s.public_id as sourceProductPublicId",
          "s.raw_product_name as productName",
          "s.raw_brand_name as rawBrandName",
          "p.public_id as platformPublicId",
          "p.code as platformCode",
          "p.name as platformName",
        ])
        .where("i.status", "=", "REVIEW_REQUIRED")
        .where(sql<boolean>`i.raw_json #>> '{masterCreation,input,brand,status}' = 'UNRESOLVED'`)
        .where("i.external_product_id", "is not", null)
        .where("s.raw_brand_name", "is not", null)
        .where(sql<boolean>`s.raw_brand_name ~ '[^[:space:]]'`)
        .$if(query.decision !== undefined, (qb) =>
          qb.where(
            sql<string>`coalesce(i.raw_json->'brandReview'->>'decision', 'PENDING')`,
            "=",
            query.decision as BrandReviewDecision,
          ),
        )
        .$if(platformQuery !== undefined, (qb) =>
          qb.where(
            sql<boolean>`(p.code ILIKE ${platformQuery} ESCAPE '\\' OR p.name ILIKE ${platformQuery} ESCAPE '\\')`,
          ),
        )
        .$if(searchQuery !== undefined, (qb) =>
          qb.where(
            sql<boolean>`(
              s.raw_brand_name ILIKE ${searchQuery} ESCAPE '\\'
              OR s.raw_product_name ILIKE ${searchQuery} ESCAPE '\\'
              OR s.external_product_id ILIKE ${searchQuery} ESCAPE '\\'
            )`,
          ),
        )
        .$if(cursor !== undefined, (qb) =>
          qb.where((eb) =>
            eb.or([
              eb("i.created_at", "<", cursorDate),
              eb.and([eb("i.created_at", "=", cursorDate), eb("i.public_id", "<", cursorPublicId)]),
            ]),
          ),
        )
        .orderBy("i.created_at", "desc")
        .orderBy("i.public_id", "desc")
        .limit(limit + 1)
        .execute();
      const visible = rows.slice(0, limit);
      const items = visible.map((row) => {
        const envelope = object(row.envelope) ? row.envelope : {};
        const brandState = unresolved(envelope);
        return {
          publicId: row.publicId,
          sourceProductPublicId: row.sourceProductPublicId,
          platform: {
            publicId: row.platformPublicId,
            code: row.platformCode,
            name: row.platformName,
          },
          externalProductId: row.externalProductId as string,
          productName: row.productName,
          rawBrandName: row.rawBrandName as string,
          normalizedName: normalizeBrandAliasName(row.rawBrandName) as string,
          unresolvedReason: brandState.reason,
          matchReason: brandState.matchReason,
          ...decision(envelope),
          createdAt: timestamp(row.createdAt),
        };
      });
      const last = visible.at(-1);
      return {
        items,
        nextCursor:
          rows.length > limit && last
            ? encodeCursor({ createdAt: last.createdAtCursor, publicId: last.publicId })
            : null,
      };
    },

    async brands(query: BrandSearchQuery) {
      const limit = query.limit ?? 20;
      const search = query.query ? literalLike(query.query) : undefined;
      const rows = await database.db
        .selectFrom("app.brand")
        .select([
          "public_id as publicId",
          "brand_key as key",
          "name_ko as nameKo",
          "name_en as nameEn",
        ])
        .where("is_active", "=", true)
        .$if(search !== undefined, (qb) =>
          qb.where(
            sql<boolean>`(
              brand_key ILIKE ${search} ESCAPE '\\'
              OR name_ko ILIKE ${search} ESCAPE '\\'
              OR name_en ILIKE ${search} ESCAPE '\\'
            )`,
          ),
        )
        .orderBy("brand_key", "asc")
        .limit(limit)
        .execute();
      return { items: rows };
    },
  };
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof BrandReviewManagementError)
    return reply.code(error.statusCode).send(
      createErrorEnvelope({
        code: error.code,
        message: error.safeMessage,
        requestId: request.id,
      }),
    );
  if (error instanceof BrandReviewError) {
    const mapping: Record<string, [400 | 404 | 409 | 429 | 503, string]> = {
      INVALID_BRAND_REVIEW_ID: [400, "Brand review identifier is invalid"],
      INVALID_BRAND_REVIEW_INPUT: [400, "Brand review input is invalid"],
      INVALID_BRAND_ID: [400, "Brand identifier is invalid"],
      BRAND_REVIEW_NOT_FOUND: [404, "Brand review was not found"],
      BRAND_NOT_FOUND: [404, "Brand was not found"],
      BRAND_REVIEW_NOT_PENDING: [409, "Brand review is not pending"],
      BRAND_REVIEW_ALREADY_DECIDED: [409, "Brand review was already decided"],
      BRAND_REVIEW_VERSION_CONFLICT: [409, "Brand review was changed by another request"],
      BRAND_REVIEW_SOURCE_INVALID: [409, "Brand review source is no longer valid"],
      BRAND_REVIEW_PLATFORM_INACTIVE: [409, "Brand review platform is inactive"],
      BRAND_INACTIVE: [409, "Inactive brand cannot be selected"],
      BRAND_ALIAS_CONFLICT: [409, "Alias is already assigned to another brand"],
      BRAND_REVIEW_BACKPRESSURE: [429, "Import queue capacity is exhausted"],
      BRAND_REVIEW_QUEUE_UNAVAILABLE: [503, "Brand review queue is unavailable"],
      BRAND_REVIEW_PERSISTENCE_FAILED: [503, "Brand review service is unavailable"],
    };
    const [status, message] = mapping[error.code] ?? [503, "Brand review service is unavailable"];
    return reply.code(status).send(
      createErrorEnvelope({
        code: error.code,
        message,
        requestId: request.id,
        ...(error.details ? { details: error.details } : {}),
        ...(status === 429 ? { details: { retryAfterSeconds: 5 } } : {}),
      }),
    );
  }
  request.log.error({ code: "BRAND_REVIEW_FAILED" }, "Brand review request failed");
  return reply.code(503).send(
    createErrorEnvelope({
      code: "BRAND_REVIEW_SERVICE_UNAVAILABLE",
      message: "Brand review service is unavailable",
      requestId: request.id,
    }),
  );
}

function requireJsonOperation(
  request: FastifyRequest,
  reply: FastifyReply,
  operation: "brand-review-approve" | "brand-review-reject",
) {
  if (request.headers["content-type"]?.split(";", 1)[0]?.trim() !== "application/json")
    return reply.code(400).send(
      createErrorEnvelope({
        code: "INVALID_CONTENT_TYPE",
        message: "Content-Type must be application/json",
        requestId: request.id,
      }),
    );
  if (request.headers["x-bros-operation"] !== operation)
    return reply.code(403).send(
      createErrorEnvelope({
        code: "OPERATION_HEADER_REQUIRED",
        message: "Operation header is required",
        requestId: request.id,
      }),
    );
}

export function registerBrandReviewRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  options: { enabled: boolean; maxQueuedBatches: number; queue?: QueuePort },
) {
  const management = createBrandReviewManagementService(database);
  const decisions = createBrandReviewService(database, {
    maxQueuedBatches: options.maxQueuedBatches,
    ...(options.queue ? { queue: options.queue } : {}),
  });
  app.addHook("onRequest", async (request, reply) => {
    if (
      !request.url.startsWith("/api/v1/brand-reviews") &&
      !request.url.startsWith("/api/v1/brands")
    )
      return;
    if (!options.enabled)
      return reply.code(503).send(
        createErrorEnvelope({
          code: "BUSINESS_API_DISABLED",
          message: "Business API access is not configured",
          requestId: request.id,
        }),
      );
  });
  app.get(
    "/api/v1/brand-reviews",
    {
      schema: {
        querystring: BrandReviewListQuerySchema,
        response: {
          200: BrandReviewListResponseSchema,
          400: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        return await management.list(request.query as BrandReviewListQuery);
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
  app.get(
    "/api/v1/brands",
    {
      schema: {
        querystring: BrandSearchQuerySchema,
        response: {
          200: BrandSearchResponseSchema,
          400: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        return await management.brands(request.query as BrandSearchQuery);
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
  app.post(
    "/api/v1/brand-reviews/:publicId/approve",
    {
      schema: {
        params: PublicIdParamsSchema,
        body: ApproveBrandReviewRequestSchema,
        response: {
          200: BrandReviewDecisionResponseSchema,
          400: ErrorEnvelopeSchema,
          403: ErrorEnvelopeSchema,
          404: ErrorEnvelopeSchema,
          409: ErrorEnvelopeSchema,
          429: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const rejected = requireJsonOperation(request, reply, "brand-review-approve");
      if (rejected) return rejected;
      try {
        return await decisions.approve(
          (request.params as PublicIdParams).publicId,
          request.body as ApproveBrandReviewRequest,
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
  app.post(
    "/api/v1/brand-reviews/:publicId/reject",
    {
      schema: {
        params: PublicIdParamsSchema,
        body: RejectBrandReviewRequestSchema,
        response: {
          200: BrandReviewDecisionResponseSchema,
          400: ErrorEnvelopeSchema,
          403: ErrorEnvelopeSchema,
          404: ErrorEnvelopeSchema,
          409: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      const rejected = requireJsonOperation(request, reply, "brand-review-reject");
      if (rejected) return rejected;
      try {
        return await decisions.reject(
          (request.params as PublicIdParams).publicId,
          request.body as RejectBrandReviewRequest,
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
}
