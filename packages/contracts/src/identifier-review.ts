import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { PublicIdSchema, PaginationQuerySchema, AsyncAcceptedSchema } from "./http.js";
import { SourceIdentifierTypeSchema } from "./source-product.js";
import { ResolveRunStatusSchema } from "./identifier-resolve.js";
const strict = { additionalProperties: false };
const nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
const text = (maxLength: number) => Type.String({ minLength: 1, maxLength, pattern: ".*\\S.*" });
export const IdentifierDecisionStatusSchema = Type.Union(
  (["CANDIDATE", "REVIEW_REQUIRED", "AUTO_ACCEPTED", "ACCEPTED", "REJECTED"] as const).map(
    (value) => Type.Literal(value),
  ),
);
export const IdentifierReviewQuerySchema = Type.Object(
  {
    ...PaginationQuerySchema.properties,
    decision: Type.Optional(IdentifierDecisionStatusSchema),
    query: Type.Optional(text(100)),
    runPublicId: Type.Optional(PublicIdSchema),
  },
  strict,
);
export const IdentifierReviewSummarySchema = Type.Object(
  {
    publicId: PublicIdSchema,
    runPublicId: PublicIdSchema,
    sourceProductPublicId: PublicIdSchema,
    productPublicId: nullable(PublicIdSchema),
    productName: Type.String(),
    brandName: nullable(Type.String()),
    identifierType: SourceIdentifierTypeSchema,
    candidateValue: Type.String(),
    candidateNorm: Type.String(),
    confidenceScore: nullable(Type.String()),
    rankNo: Type.Integer(),
    decisionStatus: IdentifierDecisionStatusSchema,
    versionNo: Type.Integer({ minimum: 1 }),
    createdAt: Type.String(),
    decidedAt: nullable(Type.String()),
  },
  strict,
);
export const IdentifierRunSummarySchema = Type.Object(
  {
    publicId: PublicIdSchema,
    sourceProductPublicId: PublicIdSchema,
    productPublicId: nullable(PublicIdSchema),
    productName: Type.String(),
    brandName: nullable(Type.String()),
    productVersion: nullable(Type.Integer({ minimum: 1 })),
    status: ResolveRunStatusSchema,
    outcome: nullable(Type.String()),
    errorCode: nullable(Type.String()),
    createdAt: Type.String(),
    finishedAt: nullable(Type.String()),
    candidateCount: Type.Integer({ minimum: 0 }),
  },
  strict,
);
export const IdentifierRunListSchema = Type.Object(
  {
    items: Type.Array(IdentifierRunSummarySchema, { maxItems: 100 }),
    nextCursor: nullable(Type.String()),
  },
  strict,
);
export const IdentifierReviewListSchema = Type.Object(
  {
    items: Type.Array(IdentifierReviewSummarySchema, { maxItems: 100 }),
    nextCursor: nullable(Type.String()),
  },
  strict,
);
export const ReviewEvidenceSummarySchema = Type.Object(
  {
    type: Type.String(),
    source: nullable(Type.String()),
    strength: nullable(Type.String()),
    weight: nullable(Type.Integer()),
    locator: nullable(Type.String()),
    matchedText: nullable(Type.String()),
    sourceUrl: nullable(Type.String()),
  },
  strict,
);
export const ReviewAuditSummarySchema = Type.Object(
  {
    decision: Type.String(),
    actor: Type.String(),
    decidedAt: Type.String(),
    reason: nullable(Type.String()),
  },
  strict,
);
export const IdentifierReviewDetailSchema = Type.Object(
  {
    ...IdentifierReviewSummarySchema.properties,
    run: IdentifierRunSummarySchema,
    evidence: Type.Array(ReviewEvidenceSummarySchema, { maxItems: 1000 }),
    conflicts: Type.Array(Type.String(), { maxItems: 1000 }),
    audit: Type.Array(ReviewAuditSummarySchema, { maxItems: 1000 }),
  },
  strict,
);
export const AcceptIdentifierRequestSchema = Type.Object(
  { expectedVersion: Type.Integer({ minimum: 1, maximum: 2147483646 }) },
  strict,
);
export const RejectIdentifierRequestSchema = Type.Object(
  { ...AcceptIdentifierRequestSchema.properties, reason: text(500) },
  strict,
);
export const ManualIdentifierRequestSchema = Type.Object(
  {
    ...RejectIdentifierRequestSchema.properties,
    requestPublicId: PublicIdSchema,
    identifierType: SourceIdentifierTypeSchema,
    candidateValue: text(512),
  },
  strict,
);
export const ReresolveIdentifierRequestSchema = Type.Object(
  { requestPublicId: PublicIdSchema },
  strict,
);
export const IdentifierReviewDecisionSchema = Type.Object(
  {
    candidatePublicId: PublicIdSchema,
    decisionStatus: Type.Union([Type.Literal("ACCEPTED"), Type.Literal("REJECTED")]),
    versionNo: Type.Integer({ minimum: 2 }),
  },
  strict,
);
export const IdentifierRunDetailSchema = Type.Object(
  {
    ...IdentifierRunSummarySchema.properties,
    providerFailures: Type.Array(
      Type.Object({ code: Type.String(), providerId: Type.String() }, strict),
      { maxItems: 100 },
    ),
    truncated: Type.Boolean(),
  },
  strict,
);
export type IdentifierReviewQuery = Static<typeof IdentifierReviewQuerySchema>;
export type IdentifierReviewSummary = Static<typeof IdentifierReviewSummarySchema>;
export type IdentifierReviewDetail = Static<typeof IdentifierReviewDetailSchema>;
export type IdentifierReviewList = Static<typeof IdentifierReviewListSchema>;
export type IdentifierRunSummary = Static<typeof IdentifierRunSummarySchema>;
export type IdentifierRunList = Static<typeof IdentifierRunListSchema>;
export type IdentifierRunDetail = Static<typeof IdentifierRunDetailSchema>;
export type IdentifierReviewDecision = Static<typeof IdentifierReviewDecisionSchema>;
export type ManualIdentifierRequest = Static<typeof ManualIdentifierRequestSchema>;
export const IdentifierReresolveResponseSchema = Type.Object(
  { ...AsyncAcceptedSchema.properties, status: ResolveRunStatusSchema },
  strict,
);
export type IdentifierReresolveResponse = Static<typeof IdentifierReresolveResponseSchema>;
export const isIdentifierReresolveResponse = (
  value: unknown,
): value is IdentifierReresolveResponse => Value.Check(IdentifierReresolveResponseSchema, value);
export const isManualIdentifierRequest = (value: unknown): value is ManualIdentifierRequest =>
  Value.Check(ManualIdentifierRequestSchema, value);
export const isIdentifierReviewList = (value: unknown): value is IdentifierReviewList =>
  Value.Check(IdentifierReviewListSchema, value);
export const isIdentifierReviewDetail = (value: unknown): value is IdentifierReviewDetail =>
  Value.Check(IdentifierReviewDetailSchema, value);
export const isIdentifierRunList = (value: unknown): value is IdentifierRunList =>
  Value.Check(IdentifierRunListSchema, value);
export const isIdentifierRunDetail = (value: unknown): value is IdentifierRunDetail =>
  Value.Check(IdentifierRunDetailSchema, value);
export const isIdentifierReviewDecision = (value: unknown): value is IdentifierReviewDecision =>
  Value.Check(IdentifierReviewDecisionSchema, value);
