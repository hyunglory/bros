import {
  type IdentifierEvidence,
  type SourceIdentifierType,
  validateIdentifierEvidence,
} from "@bros/contracts";
import type {
  EvidenceCollection,
  InternalCatalogReference,
  ProviderFailureReference,
} from "./evidence-collector.js";

const normalizerVersion = "identifier-normalizer/v1";
const maxCandidates = 1_000;
const maxEvidencePerCandidate = 100;
const separatorPattern = /[\s_\-\u2010\u2011\u2012\u2013\u2014\u2212]/gu;
const sensitiveTextPattern =
  /\b(?:bearer|basic)\s+[^\s,;]+|\b(?:password|secret|token|access[_-]?token|api[_-]?key|cookie)\s*[:=]\s*[^\s,;]+/iu;

export type CandidateNormalizerErrorCode = "INVALID_NORMALIZATION_INPUT";

export class CandidateNormalizerError extends Error {
  constructor(readonly code: CandidateNormalizerErrorCode) {
    super(code);
    this.name = "CandidateNormalizerError";
  }
}

export interface NormalizedIdentifierCandidate {
  candidateNorm: string;
  candidateValue: string;
  evidence: readonly IdentifierEvidence[];
  identifierType: SourceIdentifierType;
  sourceCandidateValues: readonly string[];
}

export interface RejectedIdentifierCandidate {
  candidateValue: string;
  code: "INVALID_IDENTIFIER_FORMAT";
  evidence: readonly IdentifierEvidence[];
  identifierType: SourceIdentifierType;
}

export interface CandidateNormalizationResult {
  candidates: readonly NormalizedIdentifierCandidate[];
  internalCatalogReferences: readonly InternalCatalogReference[];
  normalizerVersion: typeof normalizerVersion;
  providerFailures: readonly ProviderFailureReference[];
  rejectedCandidates: readonly RejectedIdentifierCandidate[];
  truncated: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function candidateKey(type: SourceIdentifierType, norm: string): string {
  return JSON.stringify([type, norm]);
}

function evidenceKey(evidence: IdentifierEvidence): string {
  return JSON.stringify(evidence);
}

function requiredCandidateText(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.length > 512 ||
    sensitiveTextPattern.test(value)
  )
    throw new CandidateNormalizerError("INVALID_NORMALIZATION_INPUT");
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 && ![9, 10, 13].includes(code)) {
      throw new CandidateNormalizerError("INVALID_NORMALIZATION_INPUT");
    }
  }
  return value;
}

function identifierType(value: unknown): SourceIdentifierType {
  const allowed = new Set([
    "MODEL_NO",
    "STYLE_CODE",
    "PRODUCT_NO",
    "MPN",
    "GTIN",
    "EAN",
    "UPC",
    "BARCODE",
    "BRAND_CODE",
  ]);
  if (typeof value !== "string" || !allowed.has(value)) {
    throw new CandidateNormalizerError("INVALID_NORMALIZATION_INPUT");
  }
  return value as SourceIdentifierType;
}

function sortedEvidence(values: Iterable<IdentifierEvidence>): readonly IdentifierEvidence[] {
  return freeze(
    [...values]
      .sort((left, right) => compareCodeUnits(evidenceKey(left), evidenceKey(right)))
      .map((evidence) => freeze({ ...evidence, provenance: freeze({ ...evidence.provenance }) })),
  );
}

function safeEvidence(value: unknown, type: SourceIdentifierType): IdentifierEvidence {
  const result = validateIdentifierEvidence(value);
  if (!result.ok || result.value.identifierType !== type) {
    throw new CandidateNormalizerError("INVALID_NORMALIZATION_INPUT");
  }
  return result.value;
}

function copyReferences(value: unknown): readonly InternalCatalogReference[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new CandidateNormalizerError("INVALID_NORMALIZATION_INPUT");
  }
  const references = value.map((item) => {
    if (
      !isRecord(item) ||
      (item.queryKind !== "IDENTIFIER" && item.queryKind !== "BRAND_NAME_VARIANT") ||
      (item.outcome !== "EXACT" && item.outcome !== "AMBIGUOUS" && item.outcome !== "MISS") ||
      typeof item.truncated !== "boolean" ||
      !Array.isArray(item.matchedProductPublicIds) ||
      item.matchedProductPublicIds.length > 50
    )
      throw new CandidateNormalizerError("INVALID_NORMALIZATION_INPUT");
    const queryKind = item.queryKind as InternalCatalogReference["queryKind"];
    const outcome = item.outcome as InternalCatalogReference["outcome"];
    return freeze({
      queryKind,
      outcome,
      truncated: item.truncated,
      matchedProductPublicIds: freeze(
        item.matchedProductPublicIds.map((id) => requiredCandidateText(id)).sort(compareCodeUnits),
      ),
    });
  });
  return freeze(
    [...references].sort((left, right) =>
      compareCodeUnits(JSON.stringify(left), JSON.stringify(right)),
    ),
  );
}

function copyFailures(value: unknown): readonly ProviderFailureReference[] {
  const allowed = new Set([
    "PROVIDER_DISABLED",
    "PROVIDER_NOT_CONFIGURED",
    "INVALID_SOURCE_DATA",
    "BRAND_UNKNOWN",
    "BUDGET_EXCEEDED",
    "RATE_LIMIT",
    "CIRCUIT_OPEN",
    "TIMEOUT",
    "EXTERNAL_SEARCH_FAILED",
  ]);
  if (!Array.isArray(value) || value.length > 100)
    throw new CandidateNormalizerError("INVALID_NORMALIZATION_INPUT");
  const failures = value.map((item) => {
    if (!isRecord(item) || typeof item.code !== "string" || !allowed.has(item.code)) {
      throw new CandidateNormalizerError("INVALID_NORMALIZATION_INPUT");
    }
    return freeze({
      providerId: requiredCandidateText(item.providerId),
      code: item.code as ProviderFailureReference["code"],
    });
  });
  return freeze(
    [...failures].sort((left, right) =>
      compareCodeUnits(JSON.stringify(left), JSON.stringify(right)),
    ),
  );
}

/** Returns undefined when the candidate cannot safely represent its declared type. */
export function normalizeIdentifierCandidateValue(
  typeValue: SourceIdentifierType,
  candidateValue: string,
): string | undefined {
  const base = candidateValue.normalize("NFKC").trim().toLocaleUpperCase("en-US");
  if (base.length === 0 || base.length > 512) return undefined;
  if (["MODEL_NO", "STYLE_CODE", "PRODUCT_NO", "MPN"].includes(typeValue)) {
    const normalized = base.replace(separatorPattern, "");
    return normalized.length === 0 || normalized.length > 512 ? undefined : normalized;
  }
  if (["GTIN", "EAN", "UPC"].includes(typeValue)) {
    const normalized = base.replace(separatorPattern, "");
    if (!/^\d+$/u.test(normalized)) return undefined;
    const expectedLengths =
      typeValue === "GTIN" ? [8, 12, 13, 14] : typeValue === "EAN" ? [8, 13] : [12];
    return expectedLengths.includes(normalized.length) ? normalized : undefined;
  }
  // BARCODE may be an issuer-specific non-numeric code. BRAND_CODE preserves
  // separators because the brand owns that format; neither receives heuristic edits.
  return base;
}

export function createCandidateNormalizer() {
  return freeze({
    normalize(value: EvidenceCollection): CandidateNormalizationResult {
      if (
        !isRecord(value) ||
        !Array.isArray(value.candidates) ||
        typeof value.truncated !== "boolean"
      ) {
        throw new CandidateNormalizerError("INVALID_NORMALIZATION_INPUT");
      }
      const references = copyReferences(value.internalCatalogReferences);
      const failures = copyFailures(value.providerFailures);
      const groups = new Map<
        string,
        {
          type: SourceIdentifierType;
          norm: string;
          values: Set<string>;
          evidence: Map<string, IdentifierEvidence>;
        }
      >();
      const rejected = new Map<
        string,
        { type: SourceIdentifierType; value: string; evidence: Map<string, IdentifierEvidence> }
      >();
      let truncated = value.truncated;

      if (value.candidates.length > maxCandidates)
        throw new CandidateNormalizerError("INVALID_NORMALIZATION_INPUT");
      for (const candidate of value.candidates) {
        if (
          !isRecord(candidate) ||
          !Array.isArray(candidate.evidence) ||
          candidate.evidence.length === 0
        ) {
          throw new CandidateNormalizerError("INVALID_NORMALIZATION_INPUT");
        }
        const type = identifierType(candidate.identifierType);
        const rawValue = requiredCandidateText(candidate.candidateValue);
        if (candidate.evidence.length > maxEvidencePerCandidate) {
          throw new CandidateNormalizerError("INVALID_NORMALIZATION_INPUT");
        }
        const evidence = candidate.evidence.map((item) => safeEvidence(item, type));
        const norm = normalizeIdentifierCandidateValue(type, rawValue);
        if (norm === undefined) {
          const rejectedKey = candidateKey(type, rawValue);
          const existing = rejected.get(rejectedKey);
          if (existing === undefined) {
            rejected.set(rejectedKey, {
              type,
              value: rawValue,
              evidence: new Map(evidence.map((item) => [evidenceKey(item), item])),
            });
          } else {
            for (const item of evidence) {
              if (
                existing.evidence.size >= maxEvidencePerCandidate &&
                !existing.evidence.has(evidenceKey(item))
              ) {
                truncated = true;
                continue;
              }
              existing.evidence.set(evidenceKey(item), item);
            }
          }
          continue;
        }
        const key = candidateKey(type, norm);
        const existing = groups.get(key);
        if (existing === undefined) {
          if (groups.size >= maxCandidates) {
            truncated = true;
            continue;
          }
          groups.set(key, {
            type,
            norm,
            values: new Set([rawValue]),
            evidence: new Map(evidence.map((item) => [evidenceKey(item), item])),
          });
          continue;
        }
        existing.values.add(rawValue);
        for (const item of evidence) {
          if (
            existing.evidence.size >= maxEvidencePerCandidate &&
            !existing.evidence.has(evidenceKey(item))
          ) {
            truncated = true;
            continue;
          }
          existing.evidence.set(evidenceKey(item), item);
        }
      }

      return freeze({
        normalizerVersion,
        candidates: freeze(
          [...groups.values()]
            .sort((left, right) =>
              compareCodeUnits(
                candidateKey(left.type, left.norm),
                candidateKey(right.type, right.norm),
              ),
            )
            .map((group) => {
              const sourceCandidateValues = freeze([...group.values].sort(compareCodeUnits));
              return freeze({
                candidateNorm: group.norm,
                candidateValue: sourceCandidateValues[0] ?? group.norm,
                evidence: sortedEvidence(group.evidence.values()),
                identifierType: group.type,
                sourceCandidateValues,
              });
            }),
        ),
        internalCatalogReferences: references,
        providerFailures: failures,
        rejectedCandidates: freeze(
          [...rejected.values()]
            .sort((left, right) =>
              compareCodeUnits(
                candidateKey(left.type, left.value),
                candidateKey(right.type, right.value),
              ),
            )
            .map((candidate) =>
              freeze({
                candidateValue: candidate.value,
                code: "INVALID_IDENTIFIER_FORMAT" as const,
                evidence: sortedEvidence(candidate.evidence.values()),
                identifierType: candidate.type,
              }),
            ),
        ),
        truncated,
      });
    },
  });
}
