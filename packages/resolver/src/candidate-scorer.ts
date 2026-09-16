import {
  type IdentifierEvidence,
  type IdentifierEvidenceType,
  type SourceIdentifierType,
  validateIdentifierEvidence,
} from "@bros/contracts";
import type {
  CandidateNormalizationResult,
  NormalizedIdentifierCandidate,
  RejectedIdentifierCandidate,
} from "./candidate-normalizer.js";
import type { InternalCatalogReference, ProviderFailureReference } from "./evidence-collector.js";

const scorerVersion = "identifier-scorer/v1";
const supportedNormalizerVersion = "identifier-normalizer/v1";
const maxCandidates = 1_000;
const maxEvidencePerCandidate = 100;

const evidenceWeights: Readonly<Record<IdentifierEvidenceType, number>> = Object.freeze({
  SOURCE_FIELD: 45,
  TITLE_MATCH: 30,
  URL_MATCH: 25,
  OPTION_MATCH: 35,
  VERIFIED_INTERNAL_IDENTIFIER: 100,
  EXTERNAL_CATALOG: 15,
});

export type CandidateScorerErrorCode = "INVALID_SCORING_INPUT";

export class CandidateScorerError extends Error {
  constructor(readonly code: CandidateScorerErrorCode) {
    super(code);
    this.name = "CandidateScorerError";
  }
}

export interface ScoreContribution {
  evidenceCount: number;
  evidenceType: IdentifierEvidenceType;
  weight: number;
}

export interface ScoredIdentifierCandidate extends NormalizedIdentifierCandidate {
  confidenceScore: string;
  hasStrongEvidence: boolean;
  rankNo: number;
  scoreBreakdown: readonly ScoreContribution[];
}

export interface CandidateScoringResult {
  candidates: readonly ScoredIdentifierCandidate[];
  internalCatalogReferences: readonly InternalCatalogReference[];
  normalizerVersion: typeof supportedNormalizerVersion;
  providerFailures: readonly ProviderFailureReference[];
  rejectedCandidates: readonly RejectedIdentifierCandidate[];
  scorerVersion: typeof scorerVersion;
  truncated: boolean;
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requiredText(value: unknown, maximum = 512): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.length > maximum
  ) {
    throw new CandidateScorerError("INVALID_SCORING_INPUT");
  }
  return value;
}

function identifierType(value: unknown): SourceIdentifierType {
  const supported = new Set([
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
  if (typeof value !== "string" || !supported.has(value)) {
    throw new CandidateScorerError("INVALID_SCORING_INPUT");
  }
  return value as SourceIdentifierType;
}

function evidenceKey(evidence: IdentifierEvidence): string {
  return JSON.stringify(evidence);
}

function candidateKey(
  candidate: Pick<NormalizedIdentifierCandidate, "identifierType" | "candidateNorm">,
): string {
  return JSON.stringify([candidate.identifierType, candidate.candidateNorm]);
}

function expectedEvidenceShape(evidence: IdentifierEvidence): boolean {
  if (evidence.weight !== evidenceWeights[evidence.type]) return false;
  if (evidence.type === "VERIFIED_INTERNAL_IDENTIFIER") {
    return evidence.source === "INTERNAL_CATALOG" && evidence.strength === "VERIFIED";
  }
  if (evidence.type === "EXTERNAL_CATALOG") {
    return evidence.source === "EXTERNAL_PROVIDER" && evidence.strength === "WEAK";
  }
  return evidence.source === "SOURCE_EXTRACTOR" && evidence.strength === "WEAK";
}

function readEvidence(value: unknown, type: SourceIdentifierType): readonly IdentifierEvidence[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxEvidencePerCandidate) {
    throw new CandidateScorerError("INVALID_SCORING_INPUT");
  }
  const unique = new Map<string, IdentifierEvidence>();
  for (const item of value) {
    const parsed = validateIdentifierEvidence(item);
    if (
      !parsed.ok ||
      parsed.value.identifierType !== type ||
      !expectedEvidenceShape(parsed.value)
    ) {
      throw new CandidateScorerError("INVALID_SCORING_INPUT");
    }
    unique.set(evidenceKey(parsed.value), parsed.value);
  }
  return freeze(
    [...unique.values()]
      .sort((left, right) => compareCodeUnits(evidenceKey(left), evidenceKey(right)))
      .map((item) => freeze({ ...item, provenance: freeze({ ...item.provenance }) })),
  );
}

function readCandidate(value: unknown): NormalizedIdentifierCandidate {
  if (!isRecord(value)) throw new CandidateScorerError("INVALID_SCORING_INPUT");
  const type = identifierType(value.identifierType);
  const candidateNorm = requiredText(value.candidateNorm);
  const candidateValue = requiredText(value.candidateValue);
  if (!Array.isArray(value.sourceCandidateValues) || value.sourceCandidateValues.length === 0) {
    throw new CandidateScorerError("INVALID_SCORING_INPUT");
  }
  const sourceCandidateValues = freeze(
    [...new Set(value.sourceCandidateValues.map((item) => requiredText(item)))].sort(
      compareCodeUnits,
    ),
  );
  if (candidateValue !== sourceCandidateValues[0]) {
    throw new CandidateScorerError("INVALID_SCORING_INPUT");
  }
  return freeze({
    candidateNorm,
    candidateValue,
    evidence: readEvidence(value.evidence, type),
    identifierType: type,
    sourceCandidateValues,
  });
}

function readRejected(value: unknown): readonly RejectedIdentifierCandidate[] {
  if (!Array.isArray(value) || value.length > maxCandidates) {
    throw new CandidateScorerError("INVALID_SCORING_INPUT");
  }
  return freeze(
    value
      .map((item) => {
        if (!isRecord(item) || item.code !== "INVALID_IDENTIFIER_FORMAT") {
          throw new CandidateScorerError("INVALID_SCORING_INPUT");
        }
        const type = identifierType(item.identifierType);
        return freeze({
          candidateValue: requiredText(item.candidateValue),
          code: "INVALID_IDENTIFIER_FORMAT" as const,
          evidence: readEvidence(item.evidence, type),
          identifierType: type,
        });
      })
      .sort((left, right) =>
        compareCodeUnits(
          JSON.stringify([left.identifierType, left.candidateValue]),
          JSON.stringify([right.identifierType, right.candidateValue]),
        ),
      ),
  );
}

function readReferences(value: unknown): readonly InternalCatalogReference[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new CandidateScorerError("INVALID_SCORING_INPUT");
  }
  return freeze(
    value
      .map((item) => {
        if (
          !isRecord(item) ||
          (item.queryKind !== "IDENTIFIER" && item.queryKind !== "BRAND_NAME_VARIANT") ||
          (item.outcome !== "EXACT" && item.outcome !== "AMBIGUOUS" && item.outcome !== "MISS") ||
          typeof item.truncated !== "boolean" ||
          !Array.isArray(item.matchedProductPublicIds) ||
          item.matchedProductPublicIds.length > 50
        ) {
          throw new CandidateScorerError("INVALID_SCORING_INPUT");
        }
        return freeze({
          matchedProductPublicIds: freeze(
            item.matchedProductPublicIds.map((id) => requiredText(id, 128)).sort(compareCodeUnits),
          ),
          outcome: item.outcome as InternalCatalogReference["outcome"],
          queryKind: item.queryKind as InternalCatalogReference["queryKind"],
          truncated: item.truncated,
        });
      })
      .sort((left, right) => compareCodeUnits(JSON.stringify(left), JSON.stringify(right))),
  );
}

function readFailures(value: unknown): readonly ProviderFailureReference[] {
  const supported = new Set([
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
  if (!Array.isArray(value) || value.length > 100) {
    throw new CandidateScorerError("INVALID_SCORING_INPUT");
  }
  return freeze(
    value
      .map((item) => {
        if (!isRecord(item) || typeof item.code !== "string" || !supported.has(item.code)) {
          throw new CandidateScorerError("INVALID_SCORING_INPUT");
        }
        return freeze({
          code: item.code as ProviderFailureReference["code"],
          providerId: requiredText(item.providerId, 128),
        });
      })
      .sort((left, right) => compareCodeUnits(JSON.stringify(left), JSON.stringify(right))),
  );
}

function scoreCandidate(candidate: NormalizedIdentifierCandidate) {
  const grouped = new Map<IdentifierEvidenceType, number>();
  for (const evidence of candidate.evidence) {
    grouped.set(evidence.type, (grouped.get(evidence.type) ?? 0) + 1);
  }
  const scoreBreakdown = freeze(
    [...grouped.entries()]
      .sort(([left], [right]) => compareCodeUnits(left, right))
      .map(([evidenceType, evidenceCount]) =>
        freeze({ evidenceCount, evidenceType, weight: evidenceWeights[evidenceType] }),
      ),
  );
  const score = Math.min(
    100,
    scoreBreakdown.reduce((total, contribution) => total + contribution.weight, 0),
  );
  return {
    candidate,
    confidenceScore: `${score}.00`,
    hasStrongEvidence: candidate.evidence.some(
      (evidence) =>
        evidence.type === "VERIFIED_INTERNAL_IDENTIFIER" && evidence.strength === "VERIFIED",
    ),
    score,
    scoreBreakdown,
  };
}

export function createCandidateScorer() {
  return freeze({
    score(value: CandidateNormalizationResult): CandidateScoringResult {
      if (
        !isRecord(value) ||
        value.normalizerVersion !== supportedNormalizerVersion ||
        !Array.isArray(value.candidates) ||
        value.candidates.length > maxCandidates ||
        typeof value.truncated !== "boolean"
      ) {
        throw new CandidateScorerError("INVALID_SCORING_INPUT");
      }
      const candidates = value.candidates.map(readCandidate);
      const keys = new Set<string>();
      for (const candidate of candidates) {
        const key = candidateKey(candidate);
        if (keys.has(key)) throw new CandidateScorerError("INVALID_SCORING_INPUT");
        keys.add(key);
      }
      const ranked = candidates
        .map(scoreCandidate)
        .sort(
          (left, right) =>
            right.score - left.score ||
            compareCodeUnits(candidateKey(left.candidate), candidateKey(right.candidate)),
        )
        .map((item, index) =>
          freeze({
            ...item.candidate,
            confidenceScore: item.confidenceScore,
            hasStrongEvidence: item.hasStrongEvidence,
            rankNo: index + 1,
            scoreBreakdown: item.scoreBreakdown,
          }),
        );
      return freeze({
        candidates: freeze(ranked),
        internalCatalogReferences: readReferences(value.internalCatalogReferences),
        normalizerVersion: supportedNormalizerVersion,
        providerFailures: readFailures(value.providerFailures),
        rejectedCandidates: readRejected(value.rejectedCandidates),
        scorerVersion,
        truncated: value.truncated,
      });
    },
  });
}
