import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { DatabaseClient, JsonObject, JsonValue } from "@bros/db";
import {
  ErrorEnvelopeSchema,
  ImportBatchDetailQuerySchema,
  ImportBatchDetailResponseSchema,
  ImportBatchListQuerySchema,
  ImportBatchListResponseSchema,
  ImportRetryAcceptedSchema,
  ImportRetryReplaySchema,
  ImportRetryRequestSchema,
  PublicIdParamsSchema,
  createErrorEnvelope,
} from "@bros/contracts";
import type {
  ImportBatchDetailQuery,
  ImportBatchListQuery,
  ImportBatchStatus,
  ImportRetryRequest,
  PublicIdParams,
} from "@bros/contracts";
import { ProductImportError, admitProductImport } from "@bros/importer";
import type { QueuePort } from "@bros/queue";
import { sql } from "kysely";

const publicIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
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
      !("publicId" in parsed) ||
      typeof parsed.createdAt !== "string" ||
      !Number.isFinite(Date.parse(parsed.createdAt)) ||
      typeof parsed.publicId !== "string" ||
      !publicIdPattern.test(parsed.publicId)
    )
      throw new Error();
    return { createdAt: parsed.createdAt, publicId: parsed.publicId };
  } catch {
    throw new ImportManagementError("INVALID_CURSOR", 400, "Cursor is invalid");
  }
}

function timestamp(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}
function requiredTimestamp(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function queueView(config: JsonObject) {
  const queue = config.importQueue;
  if (!object(queue)) return { processingStatus: "NOT_QUEUED" as const, progress: null };
  const allowed = ["QUEUED", "RUNNING", "RETRY_WAIT", "SUCCESS", "FAILED"];
  const processingStatus =
    typeof queue.status === "string" && allowed.includes(queue.status)
      ? (queue.status as "QUEUED" | "RUNNING" | "RETRY_WAIT" | "SUCCESS" | "FAILED")
      : ("UNKNOWN" as const);
  const progress = queue.progress;
  if (
    object(progress) &&
    (progress.phase === "source" || progress.phase === "pipeline") &&
    typeof progress.chunks === "number" &&
    Number.isInteger(progress.chunks) &&
    progress.chunks >= 0 &&
    typeof progress.visitedCount === "number" &&
    Number.isInteger(progress.visitedCount) &&
    progress.visitedCount >= 0
  ) {
    return {
      processingStatus,
      progress: {
        phase: progress.phase,
        chunks: progress.chunks,
        visitedCount: progress.visitedCount,
      },
    };
  }
  return { processingStatus, progress: null };
}

function batchSummary(row: {
  publicId: string;
  platformCode: string;
  sourceName: string;
  importType: string;
  status: ImportBatchStatus;
  totalCount: number;
  successCount: number;
  failedCount: number;
  skippedCount: number;
  reviewCount: number;
  config: JsonObject;
  startedAt: Date | string | null;
  finishedAt: Date | string | null;
  createdAt: Date | string;
}) {
  const queue = queueView(row.config);
  const pipeline = row.config.pipelineTracking;
  return {
    publicId: row.publicId,
    platformCode: row.platformCode,
    sourceName: row.sourceName,
    importType: row.importType,
    status: row.status,
    processingStatus: queue.processingStatus,
    counts: {
      total: row.totalCount,
      success: row.successCount,
      failed: row.failedCount,
      skipped: row.skippedCount,
      review: row.reviewCount,
    },
    progress: queue.progress,
    pipelineCompleted: object(pipeline) && pipeline.completed === true,
    startedAt: timestamp(row.startedAt),
    finishedAt: timestamp(row.finishedAt),
    createdAt: requiredTimestamp(row.createdAt),
  };
}

function batchSelection(database: DatabaseClient) {
  return database.db
    .selectFrom("app.import_batch as b")
    .innerJoin("app.platform as p", "p.id", "b.platform_id")
    .select([
      "b.public_id as publicId",
      "p.code as platformCode",
      "b.source_name as sourceName",
      "b.import_type as importType",
      "b.status",
      "b.total_count as totalCount",
      "b.success_count as successCount",
      "b.failed_count as failedCount",
      "b.skipped_count as skippedCount",
      "b.review_count as reviewCount",
      "b.config_json as config",
      "b.started_at as startedAt",
      "b.finished_at as finishedAt",
      "b.created_at as createdAt",
      sql<string>`b.created_at::text`.as("createdAtCursor"),
    ]);
}

export class ImportManagementError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: 400 | 404,
    readonly safeMessage: string,
  ) {
    super(code);
  }
}

export function createImportManagementService(database: DatabaseClient) {
  return {
    async list(query: ImportBatchListQuery) {
      const limit = query.limit ?? 50;
      const cursor = decodeCursor(query.cursor);
      const status = query.status;
      const cursorDate = sql<Date>`${cursor?.createdAt ?? "1970-01-01T00:00:00Z"}::timestamptz`;
      const cursorPublicId = cursor?.publicId ?? "00000000-0000-7000-8000-000000000000";
      const selection = batchSelection(database)
        .$if(status !== undefined, (qb) => qb.where("b.status", "=", status as ImportBatchStatus))
        .$if(cursor !== undefined, (qb) =>
          qb.where((eb) =>
            eb.or([
              eb("b.created_at", "<", cursorDate),
              eb.and([eb("b.created_at", "=", cursorDate), eb("b.public_id", "<", cursorPublicId)]),
            ]),
          ),
        )
        .orderBy("b.created_at", "desc")
        .orderBy("b.public_id", "desc")
        .limit(limit + 1);
      const rows = await selection.execute();
      const visible = rows.slice(0, limit);
      const last = visible.at(-1);
      return {
        items: visible.map(batchSummary),
        nextCursor:
          rows.length > limit && last
            ? encodeCursor({
                createdAt: last.createdAtCursor,
                publicId: last.publicId,
              })
            : null,
      };
    },

    async detail(publicId: string, query: ImportBatchDetailQuery) {
      const batch = await batchSelection(database)
        .where("b.public_id", "=", publicId)
        .executeTakeFirst();
      if (!batch)
        throw new ImportManagementError("IMPORT_BATCH_NOT_FOUND", 404, "Import batch not found");
      const limit = query.itemLimit ?? 50;
      const cursor = decodeCursor(query.itemCursor);
      const itemStatus = query.itemStatus;
      const cursorDate = sql<Date>`${cursor?.createdAt ?? "1970-01-01T00:00:00Z"}::timestamptz`;
      const cursorPublicId = cursor?.publicId ?? "00000000-0000-7000-8000-000000000000";
      const rows = await database.db
        .selectFrom("app.import_item as i")
        .innerJoin("app.import_batch as b", "b.id", "i.import_batch_id")
        .leftJoin("app.source_product as s", "s.id", "i.source_product_id")
        .select([
          "i.public_id as publicId",
          "i.input_row_no as rowNumber",
          "i.external_product_id as externalProductId",
          "s.public_id as sourceProductPublicId",
          "i.status",
          "i.action_type as action",
          "i.error_code as errorCode",
          "i.error_message as errorMessage",
          "i.processed_at as processedAt",
          "i.created_at as createdAt",
          sql<string>`i.created_at::text`.as("createdAtCursor"),
        ])
        .where("b.public_id", "=", publicId)
        .$if(itemStatus !== undefined, (qb) =>
          qb.where("i.status", "=", itemStatus as NonNullable<typeof itemStatus>),
        )
        .$if(cursor !== undefined, (qb) =>
          qb.where((eb) =>
            eb.or([
              eb("i.created_at", ">", cursorDate),
              eb.and([eb("i.created_at", "=", cursorDate), eb("i.public_id", ">", cursorPublicId)]),
            ]),
          ),
        )
        .orderBy("i.created_at", "asc")
        .orderBy("i.public_id", "asc")
        .limit(limit + 1)
        .execute();
      const visible = rows.slice(0, limit);
      const last = visible.at(-1);
      return {
        batch: batchSummary(batch),
        items: visible.map((item) => ({
          publicId: item.publicId,
          rowNumber: item.rowNumber,
          externalProductId: item.externalProductId,
          sourceProductPublicId: item.sourceProductPublicId,
          status: item.status,
          action: item.action,
          errorCode: item.errorCode,
          errorMessage: item.errorMessage?.slice(0, 512) ?? null,
          processedAt: timestamp(item.processedAt),
          createdAt: requiredTimestamp(item.createdAt),
        })),
        nextItemCursor:
          rows.length > limit && last
            ? encodeCursor({
                createdAt: last.createdAtCursor,
                publicId: last.publicId,
              })
            : null,
      };
    },
  };
}

function sendError(request: FastifyRequest, reply: FastifyReply, error: unknown) {
  type ImportErrorStatus = 400 | 404 | 409 | 429 | 503;
  let status: ImportErrorStatus = 503;
  let code = "IMPORT_SERVICE_UNAVAILABLE";
  let message = "Import service is unavailable";
  if (error instanceof ImportManagementError) {
    status = error.statusCode;
    code = error.code;
    message = error.safeMessage;
  } else if (error instanceof ProductImportError) {
    const mapped: Record<string, [ImportErrorStatus, string]> = {
      INVALID_IMPORT_BATCH_ID: [400, "Import batch identifier is invalid"],
      IMPORT_BATCH_NOT_FOUND: [404, "Import batch not found"],
      IMPORT_BACKPRESSURE: [429, "Import queue capacity is exhausted"],
      EMPTY_IMPORT_BATCH: [409, "Empty import batch cannot be processed"],
      IMPORT_BATCH_CANCELLED: [409, "Cancelled import batch cannot be processed"],
      IMPORT_QUEUE_STATE_INVALID: [409, "Import queue state is invalid"],
    };
    [status, message] = mapped[error.code] ?? [503, message];
    code = error.code;
  }
  return reply.code(status).send(
    createErrorEnvelope({
      code,
      message,
      requestId: request.id,
      ...(status === 429 ? { details: { retryAfterSeconds: 5 } } : {}),
    }),
  );
}

export function registerImportManagementRoutes(
  app: FastifyInstance,
  database: DatabaseClient,
  options: { enabled: boolean; queue?: QueuePort; maxQueuedBatches: number },
) {
  const service = createImportManagementService(database);
  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/v1/import-batches")) return;
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
    "/api/v1/import-batches",
    {
      schema: {
        querystring: ImportBatchListQuerySchema,
        response: {
          200: ImportBatchListResponseSchema,
          400: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        return await service.list(request.query as ImportBatchListQuery);
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
  app.get(
    "/api/v1/import-batches/:publicId",
    {
      schema: {
        params: PublicIdParamsSchema,
        querystring: ImportBatchDetailQuerySchema,
        response: {
          200: ImportBatchDetailResponseSchema,
          400: ErrorEnvelopeSchema,
          404: ErrorEnvelopeSchema,
          503: ErrorEnvelopeSchema,
        },
      },
    },
    async (request, reply) => {
      try {
        return await service.detail(
          (request.params as PublicIdParams).publicId,
          request.query as ImportBatchDetailQuery,
        );
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
  app.post(
    "/api/v1/import-batches/:publicId/retry",
    {
      schema: {
        params: PublicIdParamsSchema,
        body: ImportRetryRequestSchema,
        response: {
          200: ImportRetryReplaySchema,
          202: ImportRetryAcceptedSchema,
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
      if (request.headers["content-type"]?.split(";", 1)[0]?.trim() !== "application/json")
        return reply.code(400).send(
          createErrorEnvelope({
            code: "INVALID_CONTENT_TYPE",
            message: "Content-Type must be application/json",
            requestId: request.id,
          }),
        );
      if (request.headers["x-bros-operation"] !== "import-retry")
        return reply.code(403).send(
          createErrorEnvelope({
            code: "OPERATION_HEADER_REQUIRED",
            message: "Operation header is required",
            requestId: request.id,
          }),
        );
      try {
        if (!options.queue) throw new ProductImportError("IMPORT_ENQUEUE_FAILED");
        const result = await admitProductImport(
          database,
          options.queue,
          (request.params as PublicIdParams).publicId,
          {
            maxQueuedBatches: options.maxQueuedBatches,
            resume: (request.body as ImportRetryRequest).mode === "resume",
          },
        );
        const statusUrl = `/api/v1/import-batches/${result.publicId}`;
        if (result.disposition === "REPLAYED")
          return reply.code(200).send({
            publicId: result.publicId,
            processingStatus: result.processingStatus,
            statusUrl,
          });
        return reply.code(202).send({ publicId: result.publicId, status: "QUEUED", statusUrl });
      } catch (error) {
        return sendError(request, reply, error);
      }
    },
  );
}
