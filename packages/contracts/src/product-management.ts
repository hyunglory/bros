import { Type } from "@sinclair/typebox";
import type { Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

import { PublicIdSchema } from "./http.js";

export const ProductMasterStatusSchema = Type.Union([
  Type.Literal("ACTIVE"),
  Type.Literal("INACTIVE"),
  Type.Literal("REVIEW_REQUIRED"),
]);

export const ProductIdentifierStatusSchema = Type.Union([
  Type.Literal("UNKNOWN"),
  Type.Literal("SEARCHING"),
  Type.Literal("CANDIDATE"),
  Type.Literal("REVIEW_REQUIRED"),
  Type.Literal("VERIFIED"),
  Type.Literal("NOT_FOUND"),
  Type.Literal("NOT_APPLICABLE"),
]);

const NullableTextSchema = Type.Union([Type.String(), Type.Null()]);
export const ProductBrandSummarySchema = Type.Object(
  {
    publicId: PublicIdSchema,
    key: Type.String({ minLength: 1, maxLength: 100 }),
    nameKo: NullableTextSchema,
    nameEn: NullableTextSchema,
  },
  { additionalProperties: false },
);

export const ProductRelationCountsSchema = Type.Object(
  {
    sources: Type.Integer({ minimum: 0 }),
    skus: Type.Integer({ minimum: 0 }),
    identifiers: Type.Integer({ minimum: 0 }),
    sourceImages: Type.Integer({ minimum: 0 }),
  },
  { additionalProperties: false },
);

export const ProductMasterSummarySchema = Type.Object(
  {
    publicId: PublicIdSchema,
    brand: Type.Union([ProductBrandSummarySchema, Type.Null()]),
    productName: Type.String({ minLength: 1 }),
    categoryKey: Type.String({ minLength: 1, maxLength: 64 }),
    productType: Type.String({ minLength: 1, maxLength: 64 }),
    status: ProductMasterStatusSchema,
    identifierStatus: ProductIdentifierStatusSchema,
    createdMethod: Type.String({ minLength: 1, maxLength: 64 }),
    version: Type.Integer({ minimum: 1 }),
    counts: ProductRelationCountsSchema,
    createdAt: Type.String({ minLength: 20, maxLength: 40 }),
    updatedAt: Type.String({ minLength: 20, maxLength: 40 }),
  },
  { additionalProperties: false },
);

export const ProductMasterListQuerySchema = Type.Object(
  {
    cursor: Type.Optional(Type.String({ minLength: 1, maxLength: 2_048 })),
    limit: Type.Optional(Type.Integer({ default: 50, minimum: 1, maximum: 100 })),
    status: Type.Optional(ProductMasterStatusSchema),
    identifierStatus: Type.Optional(ProductIdentifierStatusSchema),
    brand: Type.Optional(Type.String({ minLength: 1, maxLength: 100, pattern: ".*\\S.*" })),
    source: Type.Optional(Type.String({ minLength: 1, maxLength: 100, pattern: ".*\\S.*" })),
    query: Type.Optional(Type.String({ minLength: 1, maxLength: 100, pattern: ".*\\S.*" })),
  },
  { additionalProperties: false },
);

export const ProductMasterListResponseSchema = Type.Object(
  {
    items: Type.Array(ProductMasterSummarySchema, { maxItems: 100 }),
    nextCursor: Type.Union([Type.String({ minLength: 1, maxLength: 2_048 }), Type.Null()]),
  },
  { additionalProperties: false },
);

export const ProductSkuSummarySchema = Type.Object(
  {
    publicId: PublicIdSchema,
    skuName: Type.String({ minLength: 1 }),
    optionKey: Type.String({ minLength: 1 }),
    status: ProductMasterStatusSchema,
    sortOrder: Type.Integer({ minimum: 0 }),
    createdAt: Type.String({ minLength: 20, maxLength: 40 }),
    updatedAt: Type.String({ minLength: 20, maxLength: 40 }),
  },
  { additionalProperties: false },
);

export const ProductIdentifierSummarySchema = Type.Object(
  {
    publicId: PublicIdSchema,
    skuPublicId: Type.Union([PublicIdSchema, Type.Null()]),
    type: Type.Union([
      Type.Literal("MODEL_NO"),
      Type.Literal("STYLE_CODE"),
      Type.Literal("PRODUCT_NO"),
      Type.Literal("MPN"),
      Type.Literal("GTIN"),
      Type.Literal("EAN"),
      Type.Literal("UPC"),
      Type.Literal("BARCODE"),
      Type.Literal("BRAND_CODE"),
    ]),
    value: Type.String({ minLength: 1 }),
    isPrimary: Type.Boolean(),
    isVerified: Type.Boolean(),
    confidence: Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()]),
    evidenceType: Type.String({ minLength: 1, maxLength: 64 }),
    sourceUrl: NullableTextSchema,
    createdAt: Type.String({ minLength: 20, maxLength: 40 }),
    updatedAt: Type.String({ minLength: 20, maxLength: 40 }),
  },
  { additionalProperties: false },
);

export const SourceSkuSummarySchema = Type.Object(
  {
    publicId: PublicIdSchema,
    canonicalSkuPublicId: Type.Union([PublicIdSchema, Type.Null()]),
    externalSkuId: NullableTextSchema,
    rawOptionName: Type.String({ minLength: 1 }),
    optionKey: Type.String({ minLength: 1 }),
    currentPrice: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    stockStatus: Type.Union([
      Type.Literal("UNKNOWN"),
      Type.Literal("IN_STOCK"),
      Type.Literal("OUT_OF_STOCK"),
    ]),
  },
  { additionalProperties: false },
);

export const SourceProductSummarySchema = Type.Object(
  {
    publicId: PublicIdSchema,
    platform: Type.Object(
      {
        publicId: PublicIdSchema,
        code: Type.String({ minLength: 1, maxLength: 100 }),
        name: Type.String({ minLength: 1 }),
      },
      { additionalProperties: false },
    ),
    externalProductId: Type.String({ minLength: 1 }),
    productUrl: NullableTextSchema,
    rawProductName: Type.String({ minLength: 1 }),
    rawBrandName: NullableTextSchema,
    currentPrice: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    normalPrice: Type.Union([Type.String({ minLength: 1 }), Type.Null()]),
    currencyCode: Type.Union([Type.String({ minLength: 3, maxLength: 3 }), Type.Null()]),
    stockStatus: Type.Union([
      Type.Literal("UNKNOWN"),
      Type.Literal("IN_STOCK"),
      Type.Literal("OUT_OF_STOCK"),
    ]),
    matchStatus: Type.Union([
      Type.Literal("UNMATCHED"),
      Type.Literal("MATCHED"),
      Type.Literal("REVIEW_REQUIRED"),
    ]),
    matchConfidence: Type.Union([Type.Number({ minimum: 0, maximum: 100 }), Type.Null()]),
    skus: Type.Array(SourceSkuSummarySchema),
    collectedAt: Type.String({ minLength: 20, maxLength: 40 }),
    lastSeenAt: Type.String({ minLength: 20, maxLength: 40 }),
    updatedAt: Type.String({ minLength: 20, maxLength: 40 }),
  },
  { additionalProperties: false },
);

export const ProductImageSummarySchema = Type.Object(
  {
    publicId: PublicIdSchema,
    sourceProductPublicId: Type.Union([PublicIdSchema, Type.Null()]),
    skuPublicId: Type.Union([PublicIdSchema, Type.Null()]),
    type: Type.Union([Type.Literal("SOURCE_MAIN"), Type.Literal("SOURCE_DETAIL")]),
    sourceUrl: NullableTextSchema,
    processStatus: Type.Union([
      Type.Literal("REGISTERED"),
      Type.Literal("FETCHING"),
      Type.Literal("STORED"),
      Type.Literal("FAILED"),
    ]),
    stored: Type.Boolean(),
    mimeType: NullableTextSchema,
    width: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    height: Type.Union([Type.Integer({ minimum: 1 }), Type.Null()]),
    sourceRevision: Type.Integer({ minimum: 1 }),
    createdAt: Type.String({ minLength: 20, maxLength: 40 }),
    updatedAt: Type.String({ minLength: 20, maxLength: 40 }),
  },
  { additionalProperties: false },
);

export const ProductMasterDetailResponseSchema = Type.Object(
  {
    master: ProductMasterSummarySchema,
    skus: Type.Array(ProductSkuSummarySchema),
    identifiers: Type.Array(ProductIdentifierSummarySchema),
    sources: Type.Array(SourceProductSummarySchema),
    sourceImages: Type.Array(ProductImageSummarySchema),
  },
  { additionalProperties: false },
);

export const ProductMasterUpdateRequestSchema = Type.Object(
  {
    expectedVersion: Type.Integer({ minimum: 1 }),
    changeReason: Type.String({ minLength: 1, maxLength: 500, pattern: ".*\\S.*" }),
    productName: Type.Optional(Type.String({ minLength: 1, maxLength: 500, pattern: ".*\\S.*" })),
    categoryKey: Type.Optional(Type.String({ minLength: 1, maxLength: 64, pattern: ".*\\S.*" })),
    productType: Type.Optional(Type.String({ minLength: 1, maxLength: 64, pattern: ".*\\S.*" })),
    status: Type.Optional(ProductMasterStatusSchema),
  },
  { additionalProperties: false, minProperties: 3 },
);

export type ProductMasterStatus = Static<typeof ProductMasterStatusSchema>;
export type ProductIdentifierStatus = Static<typeof ProductIdentifierStatusSchema>;
export type ProductMasterSummary = Static<typeof ProductMasterSummarySchema>;
export type ProductMasterListQuery = Static<typeof ProductMasterListQuerySchema>;
export type ProductMasterListResponse = Static<typeof ProductMasterListResponseSchema>;
export type ProductMasterDetailResponse = Static<typeof ProductMasterDetailResponseSchema>;
export type ProductMasterUpdateRequest = Static<typeof ProductMasterUpdateRequestSchema>;

export function isProductMasterListResponse(value: unknown): value is ProductMasterListResponse {
  return Value.Check(ProductMasterListResponseSchema, value);
}

export function isProductMasterDetailResponse(
  value: unknown,
): value is ProductMasterDetailResponse {
  return Value.Check(ProductMasterDetailResponseSchema, value);
}

export function isProductMasterSummary(value: unknown): value is ProductMasterSummary {
  return Value.Check(ProductMasterSummarySchema, value);
}
