import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseClient, JsonObject } from "@bros/db";
import {
  ErrorEnvelopeSchema,
  ProductMasterDetailResponseSchema,
  ProductMasterListQuerySchema,
  ProductMasterListResponseSchema,
  ProductMasterSummarySchema,
  ProductMasterUpdateRequestSchema,
  PublicIdParamsSchema,
  createErrorEnvelope,
} from "@bros/contracts";
import type {
  ProductIdentifierStatus,
  ProductMasterListQuery,
  ProductMasterStatus,
  ProductMasterUpdateRequest,
  PublicIdParams,
} from "@bros/contracts";
import { sql } from "kysely";

const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

interface Cursor {
  createdAt: string;
  publicId: string;
}

interface MasterRow {
  id: string;
  publicId: string;
  brandPublicId: string | null;
  brandKey: string | null;
  brandNameKo: string | null;
  brandNameEn: string | null;
  productName: string;
  categoryKey: string;
  productType: string;
  status: ProductMasterStatus;
  identifierStatus: ProductIdentifierStatus;
  createdMethod: string;
  metadata: JsonObject;
  version: number;
  sourceCount: number;
  skuCount: number;
  identifierCount: number;
  sourceImageCount: number;
  createdAt: Date | string;
  createdAtCursor: string;
  updatedAt: Date | string;
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
    throw new ProductManagementError("INVALID_CURSOR", 400, "Cursor is invalid");
  }
}

function timestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function decimal(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function literalLike(value: string): string {
  return `%${value.trim().replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`;
}

function normalizeProductName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function masterSelection(database: DatabaseClient) {
  return database.db
    .selectFrom("app.product_master as m")
    .leftJoin("app.brand as b", "b.id", "m.brand_id")
    .select([
      "m.id",
      "m.public_id as publicId",
      "b.public_id as brandPublicId",
      "b.brand_key as brandKey",
      "b.name_ko as brandNameKo",
      "b.name_en as brandNameEn",
      "m.product_name as productName",
      "m.category_key as categoryKey",
      "m.product_type as productType",
      "m.status",
      "m.identifier_status as identifierStatus",
      "m.created_method as createdMethod",
      "m.metadata_json as metadata",
      "m.version_no as version",
      "m.created_at as createdAt",
      sql<string>`m.created_at::text`.as("createdAtCursor"),
      "m.updated_at as updatedAt",
      sql<number>`(SELECT count(*)::integer FROM app.source_product sp WHERE sp.product_id = m.id)`.as(
        "sourceCount",
      ),
      sql<number>`(SELECT count(*)::integer FROM app.product_sku sk WHERE sk.product_id = m.id)`.as(
        "skuCount",
      ),
      sql<number>`(SELECT count(*)::integer FROM app.product_identifier pi WHERE pi.product_id = m.id)`.as(
        "identifierCount",
      ),
      sql<number>`(SELECT count(*)::integer FROM app.product_image im WHERE im.product_id = m.id AND im.image_type IN ('SOURCE_MAIN', 'SOURCE_DETAIL'))`.as(
        "sourceImageCount",
      ),
    ]);
}

function masterSummary(row: MasterRow) {
  return {
    publicId: row.publicId,
    brand:
      row.brandPublicId && row.brandKey
        ? {
            publicId: row.brandPublicId,
            key: row.brandKey,
            nameKo: row.brandNameKo,
            nameEn: row.brandNameEn,
          }
        : null,
    productName: row.productName,
    categoryKey: row.categoryKey,
    productType: row.productType,
    status: row.status,
    identifierStatus: row.identifierStatus,
    createdMethod: row.createdMethod,
    version: row.version,
    counts: {
      sources: row.sourceCount,
      skus: row.skuCount,
      identifiers: row.identifierCount,
      sourceImages: row.sourceImageCount,
    },
    createdAt: timestamp(row.createdAt),
    updatedAt: timestamp(row.updatedAt),
  };
}

export class ProductManagementError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: 400 | 404 | 409,
    readonly safeMessage: string,
    readonly details?: { expectedVersion: number; actualVersion: number },
  ) {
    super(code);
  }
}

export function createProductManagementService(database: DatabaseClient) {
  return {
    async list(query: ProductMasterListQuery) {
      const limit = query.limit ?? 50;
      const cursor = decodeCursor(query.cursor);
      const cursorDate = sql<Date>`${cursor?.createdAt ?? "1970-01-01T00:00:00Z"}::timestamptz`;
      const cursorPublicId = cursor?.publicId ?? "00000000-0000-7000-8000-000000000000";
      const productQuery = query.query ? literalLike(normalizeProductName(query.query)) : undefined;
      const brandQuery = query.brand ? literalLike(query.brand) : undefined;
      const sourceQuery = query.source ? literalLike(query.source) : undefined;
      const rows = await masterSelection(database)
        .$if(query.status !== undefined, (qb) =>
          qb.where("m.status", "=", query.status as ProductMasterStatus),
        )
        .$if(query.identifierStatus !== undefined, (qb) =>
          qb.where("m.identifier_status", "=", query.identifierStatus as ProductIdentifierStatus),
        )
        .$if(brandQuery !== undefined, (qb) =>
          qb.where(sql<boolean>`(
            b.brand_key ILIKE ${brandQuery} ESCAPE '\\'
            OR b.name_ko ILIKE ${brandQuery} ESCAPE '\\'
            OR b.name_en ILIKE ${brandQuery} ESCAPE '\\'
          )`),
        )
        .$if(sourceQuery !== undefined, (qb) =>
          qb.where(sql<boolean>`EXISTS (
            SELECT 1 FROM app.source_product sp
            JOIN app.platform p ON p.id = sp.platform_id
            WHERE sp.product_id = m.id
              AND (p.code ILIKE ${sourceQuery} ESCAPE '\\' OR p.name ILIKE ${sourceQuery} ESCAPE '\\')
          )`),
        )
        .$if(productQuery !== undefined, (qb) =>
          qb.where(sql<boolean>`(
            m.product_name_norm ILIKE ${productQuery} ESCAPE '\\'
            OR EXISTS (
              SELECT 1 FROM app.product_identifier pi
              WHERE pi.product_id = m.id AND pi.identifier_value ILIKE ${productQuery} ESCAPE '\\'
            )
          )`),
        )
        .$if(cursor !== undefined, (qb) =>
          qb.where((eb) =>
            eb.or([
              eb("m.created_at", "<", cursorDate),
              eb.and([eb("m.created_at", "=", cursorDate), eb("m.public_id", "<", cursorPublicId)]),
            ]),
          ),
        )
        .orderBy("m.created_at", "desc")
        .orderBy("m.public_id", "desc")
        .limit(limit + 1)
        .execute();
      const visible = rows.slice(0, limit) as MasterRow[];
      const last = visible.at(-1);
      return {
        items: visible.map(masterSummary),
        nextCursor:
          rows.length > limit && last
            ? encodeCursor({ createdAt: last.createdAtCursor, publicId: last.publicId })
            : null,
      };
    },

    async detail(publicId: string) {
      const master = (await masterSelection(database)
        .where("m.public_id", "=", publicId)
        .executeTakeFirst()) as MasterRow | undefined;
      if (!master)
        throw new ProductManagementError(
          "PRODUCT_MASTER_NOT_FOUND",
          404,
          "Product master not found",
        );

      const [skus, identifiers, sources, sourceSkus, images] = await Promise.all([
        database.db
          .selectFrom("app.product_sku")
          .select([
            "public_id as publicId",
            "sku_name as skuName",
            "option_key as optionKey",
            "status",
            "sort_order as sortOrder",
            "created_at as createdAt",
            "updated_at as updatedAt",
          ])
          .where("product_id", "=", master.id)
          .orderBy("sort_order", "asc")
          .orderBy("public_id", "asc")
          .execute(),
        database.db
          .selectFrom("app.product_identifier as i")
          .leftJoin("app.product_sku as sk", "sk.id", "i.sku_id")
          .select([
            "i.public_id as publicId",
            "sk.public_id as skuPublicId",
            "i.identifier_type as type",
            "i.identifier_value as value",
            "i.is_primary as isPrimary",
            "i.is_verified as isVerified",
            "i.confidence_score as confidence",
            "i.evidence_type as evidenceType",
            "i.source_url as sourceUrl",
            "i.created_at as createdAt",
            "i.updated_at as updatedAt",
          ])
          .where("i.product_id", "=", master.id)
          .orderBy("i.is_primary", "desc")
          .orderBy("i.created_at", "asc")
          .execute(),
        database.db
          .selectFrom("app.source_product as sp")
          .innerJoin("app.platform as p", "p.id", "sp.platform_id")
          .select([
            "sp.id",
            "sp.public_id as publicId",
            "p.public_id as platformPublicId",
            "p.code as platformCode",
            "p.name as platformName",
            "sp.external_product_id as externalProductId",
            "sp.product_url as productUrl",
            "sp.raw_product_name as rawProductName",
            "sp.raw_brand_name as rawBrandName",
            "sp.current_price as currentPrice",
            "sp.normal_price as normalPrice",
            "sp.currency_code as currencyCode",
            "sp.stock_status as stockStatus",
            "sp.match_status as matchStatus",
            "sp.match_confidence as matchConfidence",
            "sp.collected_at as collectedAt",
            "sp.last_seen_at as lastSeenAt",
            "sp.updated_at as updatedAt",
          ])
          .where("sp.product_id", "=", master.id)
          .orderBy("sp.updated_at", "desc")
          .orderBy("sp.public_id", "asc")
          .execute(),
        database.db
          .selectFrom("app.source_sku as ss")
          .innerJoin("app.source_product as sp", "sp.id", "ss.source_product_id")
          .leftJoin("app.product_sku as sk", "sk.id", "ss.sku_id")
          .select([
            "ss.source_product_id as sourceProductId",
            "ss.public_id as publicId",
            "sk.public_id as canonicalSkuPublicId",
            "ss.external_sku_id as externalSkuId",
            "ss.raw_option_name as rawOptionName",
            "ss.option_key as optionKey",
            "ss.current_price as currentPrice",
            "ss.stock_status as stockStatus",
          ])
          .where("sp.product_id", "=", master.id)
          .orderBy("ss.created_at", "asc")
          .orderBy("ss.public_id", "asc")
          .execute(),
        database.db
          .selectFrom("app.product_image as im")
          .leftJoin("app.source_product as sp", "sp.id", "im.source_product_id")
          .leftJoin("app.product_sku as sk", "sk.id", "im.sku_id")
          .select([
            "im.public_id as publicId",
            "sp.public_id as sourceProductPublicId",
            "sk.public_id as skuPublicId",
            "im.image_type as type",
            "im.source_url as sourceUrl",
            "im.process_status as processStatus",
            "im.storage_provider as storageProvider",
            "im.mime_type as mimeType",
            "im.width",
            "im.height",
            "im.source_revision as sourceRevision",
            "im.created_at as createdAt",
            "im.updated_at as updatedAt",
          ])
          .where("im.product_id", "=", master.id)
          .where("im.image_type", "in", ["SOURCE_MAIN", "SOURCE_DETAIL"])
          .orderBy("im.created_at", "asc")
          .orderBy("im.public_id", "asc")
          .execute(),
      ]);
      const skusBySource = new Map<string, typeof sourceSkus>();
      for (const sku of sourceSkus) {
        const list = skusBySource.get(sku.sourceProductId) ?? [];
        list.push(sku);
        skusBySource.set(sku.sourceProductId, list);
      }
      return {
        master: masterSummary(master),
        skus: skus.map((sku) => ({
          ...sku,
          createdAt: timestamp(sku.createdAt),
          updatedAt: timestamp(sku.updatedAt),
        })),
        identifiers: identifiers.map((identifier) => ({
          ...identifier,
          confidence: decimal(identifier.confidence),
          createdAt: timestamp(identifier.createdAt),
          updatedAt: timestamp(identifier.updatedAt),
        })),
        sources: sources.map((source) => ({
          publicId: source.publicId,
          platform: {
            publicId: source.platformPublicId,
            code: source.platformCode,
            name: source.platformName,
          },
          externalProductId: source.externalProductId,
          productUrl: source.productUrl,
          rawProductName: source.rawProductName,
          rawBrandName: source.rawBrandName,
          currentPrice: source.currentPrice,
          normalPrice: source.normalPrice,
          currencyCode: source.currencyCode,
          stockStatus: source.stockStatus,
          matchStatus: source.matchStatus,
          matchConfidence: decimal(source.matchConfidence),
          skus: (skusBySource.get(source.id) ?? []).map((sku) => ({
            publicId: sku.publicId,
            canonicalSkuPublicId: sku.canonicalSkuPublicId,
            externalSkuId: sku.externalSkuId,
            rawOptionName: sku.rawOptionName,
            optionKey: sku.optionKey,
            currentPrice: sku.currentPrice,
            stockStatus: sku.stockStatus,
          })),
          collectedAt: timestamp(source.collectedAt),
          lastSeenAt: timestamp(source.lastSeenAt),
          updatedAt: timestamp(source.updatedAt),
        })),
        sourceImages: images.map((image) => ({
          publicId: image.publicId,
          sourceProductPublicId: image.sourceProductPublicId,
          skuPublicId: image.skuPublicId,
          type: image.type as "SOURCE_MAIN" | "SOURCE_DETAIL",
          sourceUrl: image.sourceUrl,
          processStatus: image.processStatus,
          stored: image.storageProvider !== null,
          mimeType: image.mimeType,
          width: image.width,
          height: image.height,
          sourceRevision: image.sourceRevision,
          createdAt: timestamp(image.createdAt),
          updatedAt: timestamp(image.updatedAt),
        })),
      };
    },

    async update(publicId: string, input: ProductMasterUpdateRequest) {
      await database.transaction(async (tx) => {
        const current = await tx
          .selectFrom("app.product_master")
          .select([
            "id",
            "version_no as version",
            "metadata_json as metadata",
            "product_name as productName",
            "category_key as categoryKey",
            "product_type as productType",
            "status",
          ])
          .where("public_id", "=", publicId)
          .executeTakeFirst();
        if (!current)
          throw new ProductManagementError(
            "PRODUCT_MASTER_NOT_FOUND",
            404,
            "Product master not found",
          );
        if (current.version !== input.expectedVersion)
          throw new ProductManagementError(
            "PRODUCT_VERSION_CONFLICT",
            409,
            "Product master was changed by another request",
            { expectedVersion: input.expectedVersion, actualVersion: current.version },
          );

        const productName = input.productName?.normalize("NFKC").trim();
        const categoryKey = input.categoryKey?.normalize("NFKC").trim();
        const productType = input.productType?.normalize("NFKC").trim();
        const changeReason = input.changeReason.normalize("NFKC").trim();
        const priorChanges = current.metadata.managementChanges;
        const managementChanges = Array.isArray(priorChanges) ? priorChanges : [];
        const changes: JsonObject = {};
        if (productName !== undefined && productName !== current.productName)
          changes.productName = { from: current.productName, to: productName };
        if (categoryKey !== undefined && categoryKey !== current.categoryKey)
          changes.categoryKey = { from: current.categoryKey, to: categoryKey };
        if (productType !== undefined && productType !== current.productType)
          changes.productType = { from: current.productType, to: productType };
        if (input.status !== undefined && input.status !== current.status)
          changes.status = { from: current.status, to: input.status };
        if (Object.keys(changes).length === 0) return;
        const metadata = {
          ...current.metadata,
          managementChanges: [
            ...managementChanges,
            {
              actorSource: "LOCAL_ADMIN",
              at: new Date().toISOString(),
              changes,
              reason: changeReason,
            },
          ],
        };
        const updated = await tx
          .updateTable("app.product_master")
          .set({
            ...(productName === undefined
              ? {}
              : {
                  product_name: productName,
                  product_name_norm: normalizeProductName(productName),
                }),
            ...(categoryKey === undefined ? {} : { category_key: categoryKey }),
            ...(productType === undefined ? {} : { product_type: productType }),
            ...(input.status === undefined ? {} : { status: input.status }),
            metadata_json: JSON.stringify(metadata),
            version_no: sql`version_no + 1`,
            updated_at: new Date(),
          })
          .where("public_id", "=", publicId)
          .where("version_no", "=", input.expectedVersion)
          .returning("version_no as version")
          .executeTakeFirst();
        if (!updated) {
          const latest = await tx
            .selectFrom("app.product_master")
            .select("version_no as version")
            .where("public_id", "=", publicId)
            .executeTakeFirst();
          throw new ProductManagementError(
            "PRODUCT_VERSION_CONFLICT",
            409,
            "Product master was changed by another request",
            {
              expectedVersion: input.expectedVersion,
              actualVersion: latest?.version ?? current.version,
            },
          );
        }
      });
      const selected = (await masterSelection(database)
        .where("m.public_id", "=", publicId)
        .executeTakeFirstOrThrow()) as MasterRow;
      return masterSummary(selected);
    },
  };
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  if (error instanceof ProductManagementError)
    return reply.code(error.statusCode).send(
      createErrorEnvelope({
        code: error.code,
        message: error.safeMessage,
        requestId: request.id,
        ...(error.details ? { details: error.details } : {}),
      }),
    );
  request.log.error({ code: "PRODUCT_MANAGEMENT_FAILED" }, "Product management request failed");
  return reply.code(503).send(
    createErrorEnvelope({
      code: "PRODUCT_SERVICE_UNAVAILABLE",
      message: "Product service is unavailable",
      requestId: request.id,
    }),
  );
}

export function registerProductManagementRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  options: { enabled: boolean },
) {
  const service = createProductManagementService(database);
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/v1/products")) return;
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
    "/api/v1/products",
    {
      schema: {
        querystring: ProductMasterListQuerySchema,
        response: {
          200: ProductMasterListResponseSchema,
          400: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        return await service.list(request.query as ProductMasterListQuery);
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
  app.get(
    "/api/v1/products/:publicId",
    {
      schema: {
        params: PublicIdParamsSchema,
        response: {
          200: ProductMasterDetailResponseSchema,
          400: ErrorEnvelopeSchema,
          404: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        return await service.detail((request.params as PublicIdParams).publicId);
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
  app.patch(
    "/api/v1/products/:publicId",
    {
      schema: {
        params: PublicIdParamsSchema,
        body: ProductMasterUpdateRequestSchema,
        response: {
          200: ProductMasterSummarySchema,
          400: ErrorEnvelopeSchema,
          403: ErrorEnvelopeSchema,
          404: ErrorEnvelopeSchema,
          409: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      if (request.headers["content-type"]?.split(";", 1)[0]?.trim() !== "application/json")
        return reply.code(400).send(
          createErrorEnvelope({
            code: "INVALID_CONTENT_TYPE",
            message: "Content-Type must be application/json",
            requestId: request.id,
          }),
        );
      if (request.headers["x-bros-operation"] !== "product-update")
        return reply.code(403).send(
          createErrorEnvelope({
            code: "OPERATION_HEADER_REQUIRED",
            message: "Operation header is required",
            requestId: request.id,
          }),
        );
      try {
        return await service.update(
          (request.params as PublicIdParams).publicId,
          request.body as ProductMasterUpdateRequest,
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
}
