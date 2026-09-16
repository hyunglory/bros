import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import { PublicIdSchema } from "./http.js";

export const BrandReviewDecisionSchema = Type.Union([
  Type.Literal("PENDING"),
  Type.Literal("APPROVED"),
  Type.Literal("REJECTED"),
]);
export const BrandAliasScopeSchema = Type.Union([Type.Literal("PLATFORM"), Type.Literal("GLOBAL")]);
export const BrandSummarySchema = Type.Object(
  {
    publicId: PublicIdSchema,
    key: Type.String({ minLength: 1, maxLength: 100 }),
    nameKo: Type.Union([Type.String(), Type.Null()]),
    nameEn: Type.Union([Type.String(), Type.Null()]),
  },
  { additionalProperties: false },
);
export const BrandReviewSummarySchema = Type.Object(
  {
    publicId: PublicIdSchema,
    sourceProductPublicId: PublicIdSchema,
    platform: Type.Object(
      {
        publicId: PublicIdSchema,
        code: Type.String({ minLength: 1, maxLength: 100 }),
        name: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
    externalProductId: Type.String({ minLength: 1 }),
    productName: Type.String({ minLength: 1 }),
    rawBrandName: Type.String({ minLength: 1 }),
    normalizedName: Type.String({ minLength: 1 }),
    unresolvedReason: Type.Union([
      Type.Literal("INACTIVE_PLATFORM"),
      Type.Literal("MISSING_BRAND_NAME"),
      Type.Literal("UNKNOWN_ALIAS"),
      Type.Literal("UNKNOWN_PLATFORM"),
    ]),
    matchReason: Type.Union([Type.String({ minLength: 1, maxLength: 100 }), Type.Null()]),
    decision: BrandReviewDecisionSchema,
    selectedBrand: Type.Union([BrandSummarySchema, Type.Null()]),
    aliasScope: Type.Union([BrandAliasScopeSchema, Type.Null()]),
    decisionReason: Type.Union([Type.String({ minLength: 1, maxLength: 500 }), Type.Null()]),
    decidedAt: Type.Union([Type.String({ minLength: 20, maxLength: 40 }), Type.Null()]),
    reprocessBatchPublicId: Type.Union([PublicIdSchema, Type.Null()]),
    version: Type.Integer({ minimum: 0 }),
    createdAt: Type.String({ minLength: 20, maxLength: 40 }),
  },
  { additionalProperties: false },
);
export const BrandReviewListQuerySchema = Type.Object(
  {
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 2_048 })),
    limit: Type.Optional(Type.Integer({ default: 50, minimum: 1, maximum: 100 })),
    decision: Type.Optional(BrandReviewDecisionSchema),
    platform: Type.Optional(Type.String({ minLength: 1, maxLength: 100, pattern: ".*\\S.*" })),
    query: Type.Optional(Type.String({ minLength: 1, maxLength: 100, pattern: ".*\\S.*" })),
  },
  { additionalProperties: false },
);
export const BrandReviewListResponseSchema = Type.Object(
  {
    items: Type.Array(BrandReviewSummarySchema, { maxItems: 100 }),
    nextCursor: Type.Union([Type.String({ minLength: 1, maxLength: 2_048 }), Type.Null()]),
  },
  { additionalProperties: false },
);
export const BrandSearchQuerySchema = Type.Object(
  {
    query: Type.Optional(Type.String({ minLength: 1, maxLength: 100, pattern: ".*\\S.*" })),
    limit: Type.Optional(Type.Integer({ default: 20, minimum: 1, maximum: 100 })),
  },
  { additionalProperties: false },
);
export const BrandSearchResponseSchema = Type.Object(
  { items: Type.Array(BrandSummarySchema, { maxItems: 100 }) },
  { additionalProperties: false },
);
export const ApproveBrandReviewRequestSchema = Type.Object(
  {
    expectedVersion: Type.Integer({ minimum: 0 }),
    brandPublicId: PublicIdSchema,
    scope: BrandAliasScopeSchema,
    changeReason: Type.String({ minLength: 1, maxLength: 500, pattern: ".*\\S.*" }),
  },
  { additionalProperties: false },
);
export const RejectBrandReviewRequestSchema = Type.Object(
  {
    expectedVersion: Type.Integer({ minimum: 0 }),
    changeReason: Type.String({ minLength: 1, maxLength: 500, pattern: ".*\\S.*" }),
  },
  { additionalProperties: false },
);
export const BrandReviewDecisionResponseSchema = Type.Object(
  {
    publicId: PublicIdSchema,
    decision: Type.Union([Type.Literal("APPROVED"), Type.Literal("REJECTED")]),
    version: Type.Integer({ minimum: 1 }),
    aliasCreated: Type.Boolean(),
    reprocessBatchPublicId: Type.Union([PublicIdSchema, Type.Null()]),
  },
  { additionalProperties: false },
);

export type BrandReviewDecision = Static<typeof BrandReviewDecisionSchema>;
export type BrandAliasScope = Static<typeof BrandAliasScopeSchema>;
export type BrandSummary = Static<typeof BrandSummarySchema>;
export type BrandReviewSummary = Static<typeof BrandReviewSummarySchema>;
export type BrandReviewListQuery = Static<typeof BrandReviewListQuerySchema>;
export type BrandReviewListResponse = Static<typeof BrandReviewListResponseSchema>;
export type BrandSearchQuery = Static<typeof BrandSearchQuerySchema>;
export type BrandSearchResponse = Static<typeof BrandSearchResponseSchema>;
export type ApproveBrandReviewRequest = Static<typeof ApproveBrandReviewRequestSchema>;
export type RejectBrandReviewRequest = Static<typeof RejectBrandReviewRequestSchema>;
export type BrandReviewDecisionResponse = Static<typeof BrandReviewDecisionResponseSchema>;

export function isBrandReviewListResponse(value: unknown): value is BrandReviewListResponse {
  return Value.Check(BrandReviewListResponseSchema, value);
}
export function isBrandSearchResponse(value: unknown): value is BrandSearchResponse {
  return Value.Check(BrandSearchResponseSchema, value);
}
export function isBrandReviewDecisionResponse(
  value: unknown,
): value is BrandReviewDecisionResponse {
  return Value.Check(BrandReviewDecisionResponseSchema, value);
}
