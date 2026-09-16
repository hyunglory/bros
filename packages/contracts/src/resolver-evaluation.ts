import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { IdentifierEvidenceSchema } from "./identifier-evidence.js";
import { SourceIdentifierTypeSchema } from "./source-product.js";

const strict = { additionalProperties: false };
const key = Type.String({
  minLength: 1,
  maxLength: 128,
  pattern: "^[A-Za-z0-9][A-Za-z0-9_.:/-]*$",
});
const text = Type.String({ minLength: 1, maxLength: 512, pattern: ".*\\S.*" });
const keys = Type.Array(key, { uniqueItems: true, maxItems: 1000 });
const facts = Type.Object(
  {
    brandKey: Type.Optional(text),
    color: Type.Optional(text),
    variantKey: Type.Optional(text),
    volume: Type.Optional(text),
  },
  strict,
);
export const ResolverEvaluationDatasetSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    datasetVersion: key,
    sourceKind: Type.Union([Type.Literal("REAL"), Type.Literal("SYNTHETIC")]),
    sourceDescription: text,
    scope: Type.Object(
      {
        brands: Type.Array(key, { minItems: 1, maxItems: 100, uniqueItems: true }),
        categories: Type.Array(key, { minItems: 1, maxItems: 100, uniqueItems: true }),
      },
      strict,
    ),
    cases: Type.Array(
      Type.Object(
        {
          caseId: key,
          masterKey: key,
          brand: key,
          category: key,
          split: Type.Union([Type.Literal("TUNING"), Type.Literal("HOLDOUT")]),
          skuKeys: keys,
          imageHashes: Type.Array(Type.String({ pattern: "^[a-f0-9]{64}$" }), {
            uniqueItems: true,
            maxItems: 1000,
          }),
          tags: Type.Array(
            Type.Union(
              [
                "NORMAL",
                "NO_IDENTIFIER",
                "SIMILAR_MODEL",
                "GTIN_CONFLICT",
                "COLOR_CONFLICT",
                "VOLUME_CONFLICT",
                "AI_ONLY",
              ].map((v) => Type.Literal(v)),
            ),
            { minItems: 1, uniqueItems: true },
          ),
          // Curator labels are never passed to the scorer or decision engine.
          truth: Type.Object(
            {
              autoAcceptForbidden: Type.Boolean(),
              identifiers: Type.Array(
                Type.Object({ identifierType: SourceIdentifierTypeSchema, value: text }, strict),
                { maxItems: 100 },
              ),
              verifiedBy: key,
              verifiedAt: Type.String({ pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$" }),
              evidenceReference: text,
            },
            strict,
          ),
          capture: Type.Object(
            {
              reference: text,
              resolverVersion: key,
              registryVersion: key,
              providerVersion: key,
              costUsd: Type.Union([Type.Number({ minimum: 0, maximum: 10000 }), Type.Null()]),
              evidenceOrigin: Type.Union([
                Type.Literal("NON_AI"),
                Type.Literal("AI_ONLY"),
                Type.Literal("MIXED"),
              ]),
              // Captured Collector output, before normalization/scoring/decision.
              collection: Type.Object(
                {
                  candidates: Type.Array(
                    Type.Object(
                      {
                        identifierType: SourceIdentifierTypeSchema,
                        candidateValue: text,
                        evidence: Type.Array(IdentifierEvidenceSchema, {
                          minItems: 1,
                          maxItems: 100,
                        }),
                      },
                      strict,
                    ),
                    { maxItems: 1000 },
                  ),
                  internalCatalogReferences: Type.Array(
                    Type.Object(
                      {
                        matchedProductPublicIds: Type.Array(Type.String()),
                        outcome: Type.Union([
                          Type.Literal("EXACT"),
                          Type.Literal("AMBIGUOUS"),
                          Type.Literal("MISS"),
                        ]),
                        queryKind: Type.Union([
                          Type.Literal("IDENTIFIER"),
                          Type.Literal("BRAND_NAME_VARIANT"),
                        ]),
                        truncated: Type.Boolean(),
                      },
                      strict,
                    ),
                    { maxItems: 100 },
                  ),
                  providerFailures: Type.Array(
                    Type.Object({ code: text, providerId: key }, strict),
                    { maxItems: 100 },
                  ),
                  truncated: Type.Boolean(),
                },
                strict,
              ),
              conflictContext: Type.Object(
                {
                  sourceFacts: Type.Optional(facts),
                  candidateFacts: Type.Optional(
                    Type.Array(
                      Type.Object(
                        { identifierType: SourceIdentifierTypeSchema, candidateNorm: text, facts },
                        strict,
                      ),
                      { maxItems: 1000 },
                    ),
                  ),
                },
                strict,
              ),
            },
            strict,
          ),
        },
        strict,
      ),
      { maxItems: 10000 },
    ),
  },
  strict,
);
export type ResolverEvaluationDataset = Static<typeof ResolverEvaluationDatasetSchema>;
export const ResolverEvaluationCaptureSchema =
  ResolverEvaluationDatasetSchema.properties.cases.items.properties.capture;
export type ResolverEvaluationCapture = Static<typeof ResolverEvaluationCaptureSchema>;
export function isResolverEvaluationDataset(value: unknown): value is ResolverEvaluationDataset {
  return Value.Check(ResolverEvaluationDatasetSchema, value);
}
