import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { SourceIdentifierTypeSchema, validateSourceRawJson } from "./source-product.js";

const nonBlank = (maxLength: number) =>
  Type.String({ maxLength, pattern: "^\\S(?:[\\s\\S]*\\S)?$" });
const strict = { additionalProperties: false };

export const IdentifierEvidenceTypeSchema = Type.Union([
  Type.Literal("SOURCE_FIELD"),
  Type.Literal("TITLE_MATCH"),
  Type.Literal("URL_MATCH"),
  Type.Literal("OPTION_MATCH"),
  Type.Literal("VERIFIED_INTERNAL_IDENTIFIER"),
  Type.Literal("EXTERNAL_CATALOG"),
]);
export type IdentifierEvidenceType = Static<typeof IdentifierEvidenceTypeSchema>;

export const IdentifierEvidenceSourceSchema = Type.Union([
  Type.Literal("SOURCE_EXTRACTOR"),
  Type.Literal("INTERNAL_CATALOG"),
  Type.Literal("EXTERNAL_PROVIDER"),
]);
export type IdentifierEvidenceSource = Static<typeof IdentifierEvidenceSourceSchema>;

export const IdentifierEvidenceStrengthSchema = Type.Union([
  Type.Literal("WEAK"),
  Type.Literal("VERIFIED"),
]);
export type IdentifierEvidenceStrength = Static<typeof IdentifierEvidenceStrengthSchema>;

export const IdentifierEvidenceProvenanceSchema = Type.Object(
  {
    capturedAt: nonBlank(128),
    locator: nonBlank(4096),
    matchEnd: Type.Optional(Type.Integer({ minimum: 0, maximum: 16_384 })),
    matchStart: Type.Optional(Type.Integer({ minimum: 0, maximum: 16_384 })),
    matchedText: Type.Optional(nonBlank(2048)),
    matchedSkuPublicIds: Type.Optional(Type.Array(nonBlank(128), { maxItems: 50 })),
    patternId: Type.Optional(nonBlank(64)),
    productPublicId: Type.Optional(nonBlank(128)),
    providerId: Type.Optional(nonBlank(128)),
    registryVersion: Type.Optional(nonBlank(128)),
    resultRank: Type.Optional(Type.Integer({ minimum: 1, maximum: 20 })),
    sourceUrl: Type.Optional(Type.String({ maxLength: 4096, pattern: "^https?://[^\\s]+$" })),
    surface: Type.Optional(nonBlank(64)),
  },
  strict,
);
export type IdentifierEvidenceProvenance = Static<typeof IdentifierEvidenceProvenanceSchema>;

export const IdentifierEvidenceSchema = Type.Object(
  {
    identifierType: SourceIdentifierTypeSchema,
    schemaVersion: Type.Literal(1),
    source: IdentifierEvidenceSourceSchema,
    strength: IdentifierEvidenceStrengthSchema,
    type: IdentifierEvidenceTypeSchema,
    weight: Type.Integer({ minimum: 0, maximum: 100 }),
    provenance: IdentifierEvidenceProvenanceSchema,
  },
  strict,
);
export type IdentifierEvidence = Static<typeof IdentifierEvidenceSchema>;

export type IdentifierEvidenceValidation =
  { ok: true; value: IdentifierEvidence } | { ok: false; code: "INVALID_IDENTIFIER_EVIDENCE" };

function safeJson(value: unknown): boolean {
  const pending: { depth: number; value: unknown }[] = [{ depth: 0, value }];
  let nodes = 0;
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined) break;
    if (++nodes > 500 || item.depth > 8) return false;
    if (
      typeof item.value === "string" &&
      /\b(?:bearer|basic)\s+[^\s,;]+|\b(?:password|secret|token|access[_-]?token|api[_-]?key|cookie)\s*[:=]\s*[^\s,;]+/iu.test(
        item.value,
      )
    )
      return false;
    if (typeof item.value === "object" && item.value !== null) {
      if (Object.getOwnPropertySymbols(item.value).length > 0) return false;
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(item.value))) {
        if (descriptor.get || descriptor.set) return false;
        pending.push({ depth: item.depth + 1, value: descriptor.value as unknown });
      }
    }
  }
  try {
    return validateSourceRawJson(value).ok && JSON.stringify(value).length <= 32_768;
  } catch {
    return false;
  }
}

export function validateIdentifierEvidence(value: unknown): IdentifierEvidenceValidation {
  try {
    if (!safeJson(value) || !Value.Check(IdentifierEvidenceSchema, value)) {
      return { ok: false, code: "INVALID_IDENTIFIER_EVIDENCE" };
    }
    const evidence = value as IdentifierEvidence;
    if (
      !Number.isFinite(Date.parse(evidence.provenance.capturedAt)) ||
      (evidence.provenance.matchStart !== undefined &&
        evidence.provenance.matchEnd !== undefined &&
        evidence.provenance.matchStart >= evidence.provenance.matchEnd)
    ) {
      return { ok: false, code: "INVALID_IDENTIFIER_EVIDENCE" };
    }
    return { ok: true, value: evidence };
  } catch {
    return { ok: false, code: "INVALID_IDENTIFIER_EVIDENCE" };
  }
}
