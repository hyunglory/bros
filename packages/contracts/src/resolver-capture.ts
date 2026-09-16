import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { PublicIdSchema } from "./http.js";
import { ResolverEvaluationCaptureSchema } from "./resolver-evaluation.js";

const strict = { additionalProperties: false };
const digest = Type.String({ pattern: "^[a-f0-9]{64}$" });
const timestamp = Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}\\.\\d{3}Z$" });
export const ResolverPipelineCaptureSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    sourceKind: Type.Union([
      Type.Literal("REAL"),
      Type.Literal("SYNTHETIC"),
      Type.Literal("UNCLASSIFIED"),
    ]),
    startedAt: timestamp,
    finishedAt: timestamp,
    inputDigest: digest,
    decisionDigest: digest,
    providerAttempted: Type.Boolean(),
    costScope: Type.Literal("COMPLETED_ATTEMPT_ONLY"),
    capture: ResolverEvaluationCaptureSchema,
  },
  strict,
);
export type ResolverPipelineCapture = Static<typeof ResolverPipelineCaptureSchema>;
export function isResolverPipelineCapture(value: unknown): value is ResolverPipelineCapture {
  return Value.Check(ResolverPipelineCaptureSchema, value);
}
export const StoredResolverCaptureSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    runPublicId: PublicIdSchema,
    sourceProductPublicId: PublicIdSchema,
    attempt: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    payloadDigest: digest,
    payload: ResolverPipelineCaptureSchema,
  },
  strict,
);
export type StoredResolverCapture = Static<typeof StoredResolverCaptureSchema>;
export function isStoredResolverCapture(value: unknown): value is StoredResolverCapture {
  return Value.Check(StoredResolverCaptureSchema, value);
}
