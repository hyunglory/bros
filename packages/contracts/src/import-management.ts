import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { PublicIdSchema } from "./http.js";

const nullableTimestamp = Type.Union([Type.String({ minLength: 20, maxLength: 40 }), Type.Null()]);
export const ImportBatchStatusSchema = Type.Union([
  Type.Literal("QUEUED"),
  Type.Literal("RUNNING"),
  Type.Literal("SUCCEEDED"),
  Type.Literal("PARTIAL_FAILED"),
  Type.Literal("FAILED"),
  Type.Literal("CANCELLED"),
]);
export const ImportItemStatusSchema = Type.Union([
  Type.Literal("PENDING"),
  Type.Literal("RUNNING"),
  Type.Literal("SUCCEEDED"),
  Type.Literal("REVIEW_REQUIRED"),
  Type.Literal("SKIPPED"),
  Type.Literal("FAILED"),
]);
export const ImportProcessingStatusSchema = Type.Union([
  Type.Literal("NOT_QUEUED"),
  Type.Literal("QUEUED"),
  Type.Literal("RUNNING"),
  Type.Literal("RETRY_WAIT"),
  Type.Literal("SUCCESS"),
  Type.Literal("FAILED"),
  Type.Literal("UNKNOWN"),
]);
const ImportCountsSchema = Type.Object(
  {
    total: Type.Integer({ minimum: 0 }),
    success: Type.Integer({ minimum: 0 }),
    failed: Type.Integer({ minimum: 0 }),
    skipped: Type.Integer({ minimum: 0 }),
    review: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);
const ImportProgressSchema = Type.Union([
  Type.Object(
    {
      phase: Type.Union([Type.Literal("source"), Type.Literal("pipeline")]),
      chunks: Type.Integer({ minimum: 0 }),
      visitedCount: Type.Integer({ minimum: 0 }),
    },
    { additionalProperties: false },
  ),
  Type.Null(),
]);
export const ImportBatchSummarySchema = Type.Object(
  {
    publicId: PublicIdSchema,
    platformCode: Type.String({ minLength: 1, maxLength: 64 }),
    sourceName: Type.String({ minLength: 1, maxLength: 512 }),
    importType: Type.String({ minLength: 1, maxLength: 64 }),
    status: ImportBatchStatusSchema,
    processingStatus: ImportProcessingStatusSchema,
    counts: ImportCountsSchema,
    progress: ImportProgressSchema,
    pipelineCompleted: Type.Boolean(),
    startedAt: nullableTimestamp,
    finishedAt: nullableTimestamp,
    createdAt: Type.String({ minLength: 20, maxLength: 40 }),
  },
  { additionalProperties: false },
);
export const ImportBatchListQuerySchema = Type.Object(
  {
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 2_048 })),
    limit: Type.Optional(Type.Integer({ default: 50, minimum: 1, maximum: 100 })),
    status: Type.Optional(ImportBatchStatusSchema),
  },
  { additionalProperties: false },
);
export const ImportBatchListResponseSchema = Type.Object(
  {
    items: Type.Array(ImportBatchSummarySchema, { maxItems: 100 }),
    nextCursor: Type.Union([Type.String({ minLength: 1, maxLength: 2_048 }), Type.Null()]),
  },
  { additionalProperties: false },
);
const ImportActionSchema = Type.Union([
  Type.Literal("CREATED"),
  Type.Literal("UPDATED"),
  Type.Literal("MATCHED"),
  Type.Literal("REVIEW_REQUIRED"),
  Type.Literal("SKIPPED"),
  Type.Literal("FAILED"),
  Type.Null(),
]);
export const ImportItemSummarySchema = Type.Object(
  {
    publicId: PublicIdSchema,
    rowNumber: Type.Integer({ minimum: 1 }),
    externalProductId: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    sourceProductPublicId: Type.Union([PublicIdSchema, Type.Null()]),
    status: ImportItemStatusSchema,
    action: ImportActionSchema,
    errorCode: Type.Union([Type.String({ minLength: 1, maxLength: 64 }), Type.Null()]),
    errorMessage: Type.Union([Type.String({ minLength: 1, maxLength: 512 }), Type.Null()]),
    processedAt: nullableTimestamp,
    createdAt: Type.String({ minLength: 20, maxLength: 40 }),
  },
  { additionalProperties: false },
);
export const ImportBatchDetailQuerySchema = Type.Object(
  {
    itemCursor: Type.Optional(Type.String({ minLength: 1, maxLength: 2_048 })),
    itemLimit: Type.Optional(Type.Integer({ default: 50, minimum: 1, maximum: 100 })),
    itemStatus: Type.Optional(ImportItemStatusSchema),
  },
  { additionalProperties: false },
);
export const ImportBatchDetailResponseSchema = Type.Object(
  {
    batch: ImportBatchSummarySchema,
    items: Type.Array(ImportItemSummarySchema, { maxItems: 100 }),
    nextItemCursor: Type.Union([Type.String({ minLength: 1, maxLength: 2_048 }), Type.Null()]),
  },
  { additionalProperties: false },
);
export const ImportRetryRequestSchema = Type.Object(
  { mode: Type.Union([Type.Literal("replay"), Type.Literal("resume")]) },
  { additionalProperties: false },
);
export const ImportRetryAcceptedSchema = Type.Object(
  {
    publicId: PublicIdSchema,
    status: Type.Literal("QUEUED"),
    statusUrl: Type.String({ pattern: "^/api/v1/", maxLength: 2_048 }),
  },
  { additionalProperties: false },
);
export const ImportRetryReplaySchema = Type.Object(
  {
    publicId: PublicIdSchema,
    processingStatus: ImportProcessingStatusSchema,
    statusUrl: Type.String({ pattern: "^/api/v1/", maxLength: 2_048 }),
  },
  { additionalProperties: false },
);

export type ImportBatchStatus = Static<typeof ImportBatchStatusSchema>;
export type ImportItemStatus = Static<typeof ImportItemStatusSchema>;
export type ImportBatchSummary = Static<typeof ImportBatchSummarySchema>;
export type ImportBatchListQuery = Static<typeof ImportBatchListQuerySchema>;
export type ImportBatchListResponse = Static<typeof ImportBatchListResponseSchema>;
export type ImportBatchDetailQuery = Static<typeof ImportBatchDetailQuerySchema>;
export type ImportBatchDetailResponse = Static<typeof ImportBatchDetailResponseSchema>;
export type ImportRetryRequest = Static<typeof ImportRetryRequestSchema>;
export type ImportRetryAccepted = Static<typeof ImportRetryAcceptedSchema>;
export type ImportRetryReplay = Static<typeof ImportRetryReplaySchema>;

export function isImportBatchListResponse(value: unknown): value is ImportBatchListResponse {
  return Value.Check(ImportBatchListResponseSchema, value);
}
export function isImportBatchDetailResponse(value: unknown): value is ImportBatchDetailResponse {
  return Value.Check(ImportBatchDetailResponseSchema, value);
}
export function isImportRetryResponse(
  value: unknown,
): value is ImportRetryAccepted | ImportRetryReplay {
  return (
    Value.Check(ImportRetryAcceptedSchema, value) || Value.Check(ImportRetryReplaySchema, value)
  );
}
