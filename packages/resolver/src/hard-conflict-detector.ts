import {
  type IdentifierEvidence,
  type SourceIdentifierType,
  validateIdentifierEvidence,
} from "@bros/contracts";
import type {
  CandidateScoringResult,
  ScoreContribution,
  ScoredIdentifierCandidate,
} from "./candidate-scorer.js";

const detectorVersion = "hard-conflict-detector/v1";
const supportedScorerVersion = "identifier-scorer/v1";
const maxCandidates = 1_000;
const maxEvidencePerCandidate = 100;

const gtinTypes = new Set<SourceIdentifierType>(["GTIN", "EAN", "UPC"]);
const modelTypes = new Set<SourceIdentifierType>(["MODEL_NO", "MPN", "STYLE_CODE"]);

export type HardConflictCode =
  | "CONFLICT_BRAND"
  | "CONFLICT_GTIN"
  | "CONFLICT_MODEL"
  | "CONFLICT_VARIANT"
  | "CONFLICT_VOLUME"
  | "CONFLICT_COLOR";

export type ConflictDetectorErrorCode = "INVALID_CONFLICT_INPUT";

export class ConflictDetectorError extends Error {
  constructor(readonly code: ConflictDetectorErrorCode) {
    super(code);
    this.name = "ConflictDetectorError";
  }
}

/** Values must already be canonical facts from a trusted adapter or catalog. */
export interface CanonicalProductFacts {
  brandKey?: string;
  color?: string;
  variantKey?: string;
  volume?: string;
}

export interface CandidateConflictFacts {
  candidateNorm: string;
  facts: CanonicalProductFacts;
  identifierType: SourceIdentifierType;
}

export interface HardConflictContext {
  candidateFacts?: readonly CandidateConflictFacts[];
  sourceFacts?: CanonicalProductFacts;
}

export interface DetectedConflict {
  code: HardConflictCode;
}

export interface ConflictCheckedCandidate extends ScoredIdentifierCandidate {
  conflicts: readonly DetectedConflict[];
  hasHardConflict: boolean;
}

export interface HardConflictDetectionResult {
  candidates: readonly ConflictCheckedCandidate[];
  detectorVersion: typeof detectorVersion;
  internalCatalogReferences: CandidateScoringResult["internalCatalogReferences"];
  normalizerVersion: CandidateScoringResult["normalizerVersion"];
  providerFailures: CandidateScoringResult["providerFailures"];
  rejectedCandidates: CandidateScoringResult["rejectedCandidates"];
  scorerVersion: typeof supportedScorerVersion;
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
    throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
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
    throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
  }
  return value as SourceIdentifierType;
}

function candidateKey(
  candidate: Pick<ScoredIdentifierCandidate, "candidateNorm" | "identifierType">,
): string {
  return JSON.stringify([candidate.identifierType, candidate.candidateNorm]);
}

function readFacts(value: unknown): CanonicalProductFacts {
  if (value === undefined) return freeze({});
  if (!isRecord(value)) throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
  const allowed = new Set(["brandKey", "color", "variantKey", "volume"]);
  if (Object.keys(value).some((key) => !allowed.has(key))) {
    throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
  }
  const result: CanonicalProductFacts = {};
  for (const key of allowed) {
    const item = value[key];
    if (item !== undefined) result[key as keyof CanonicalProductFacts] = requiredText(item, 128);
  }
  return freeze(result);
}

function readCandidateFacts(value: unknown, candidates: readonly ScoredIdentifierCandidate[]) {
  if (value === undefined) return new Map<string, CanonicalProductFacts>();
  if (!Array.isArray(value) || value.length > candidates.length) {
    throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
  }
  const known = new Set(candidates.map(candidateKey));
  const facts = new Map<string, CanonicalProductFacts>();
  for (const item of value) {
    if (!isRecord(item)) throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
    const key = JSON.stringify([
      identifierType(item.identifierType),
      requiredText(item.candidateNorm),
    ]);
    if (!known.has(key) || facts.has(key))
      throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
    facts.set(key, readFacts(item.facts));
  }
  return facts;
}

function readEvidence(value: unknown, type: SourceIdentifierType): readonly IdentifierEvidence[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > maxEvidencePerCandidate) {
    throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
  }
  const evidence = value.map((item) => {
    const parsed = validateIdentifierEvidence(item);
    if (!parsed.ok || parsed.value.identifierType !== type) {
      throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
    }
    return freeze({ ...parsed.value, provenance: freeze({ ...parsed.value.provenance }) });
  });
  return freeze(
    evidence.sort((left, right) => compareCodeUnits(JSON.stringify(left), JSON.stringify(right))),
  );
}

function readBreakdown(value: unknown): readonly ScoreContribution[] {
  if (!Array.isArray(value) || value.length > 6) {
    throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
  }
  return freeze(
    value.map((item) => {
      if (
        !isRecord(item) ||
        typeof item.evidenceType !== "string" ||
        !Number.isInteger(item.evidenceCount as number) ||
        (item.evidenceCount as number) < 1 ||
        !Number.isInteger(item.weight as number) ||
        (item.weight as number) < 0 ||
        (item.weight as number) > 100
      ) {
        throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
      }
      const evidenceCount = item.evidenceCount as number;
      const weight = item.weight as number;
      return freeze({
        evidenceCount,
        evidenceType: item.evidenceType as ScoreContribution["evidenceType"],
        weight,
      });
    }),
  );
}

function readCandidates(value: unknown): readonly ScoredIdentifierCandidate[] {
  if (!Array.isArray(value) || value.length > maxCandidates) {
    throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
  }
  const keys = new Set<string>();
  const ranks = new Set<number>();
  const candidates = value.map((item) => {
    if (!isRecord(item)) throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
    const type = identifierType(item.identifierType);
    if (
      typeof item.confidenceScore !== "string" ||
      !/^(?:100|[0-9]{1,2})\.00$/u.test(item.confidenceScore) ||
      typeof item.hasStrongEvidence !== "boolean" ||
      !Number.isInteger(item.rankNo as number) ||
      (item.rankNo as number) < 1
    ) {
      throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
    }
    if (!Array.isArray(item.sourceCandidateValues) || item.sourceCandidateValues.length === 0) {
      throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
    }
    const rankNo = item.rankNo as number;
    const sourceCandidateValues = freeze(
      [...new Set(item.sourceCandidateValues.map((source) => requiredText(source)))].sort(
        compareCodeUnits,
      ),
    );
    const candidateValue = requiredText(item.candidateValue);
    if (candidateValue !== sourceCandidateValues[0]) {
      throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
    }
    const candidate = freeze({
      candidateNorm: requiredText(item.candidateNorm),
      candidateValue,
      confidenceScore: item.confidenceScore,
      evidence: readEvidence(item.evidence, type),
      hasStrongEvidence: item.hasStrongEvidence,
      identifierType: type,
      rankNo,
      scoreBreakdown: readBreakdown(item.scoreBreakdown),
      sourceCandidateValues,
    });
    const key = candidateKey(candidate);
    if (keys.has(key) || ranks.has(candidate.rankNo)) {
      throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
    }
    keys.add(key);
    ranks.add(candidate.rankNo);
    return candidate;
  });
  return freeze(candidates.sort((left, right) => left.rankNo - right.rankNo));
}

function verifiedProductIds(candidate: ScoredIdentifierCandidate): readonly string[] {
  return freeze(
    [
      ...new Set(
        candidate.evidence
          .filter((evidence) => evidence.type === "VERIFIED_INTERNAL_IDENTIFIER")
          .flatMap((evidence) =>
            evidence.provenance.productPublicId === undefined
              ? []
              : [evidence.provenance.productPublicId],
          ),
      ),
    ].sort(compareCodeUnits),
  );
}

function hasCompetingVerifiedTarget(
  candidate: ScoredIdentifierCandidate,
  candidates: readonly ScoredIdentifierCandidate[],
  family: Set<SourceIdentifierType>,
): boolean {
  if (!family.has(candidate.identifierType) || verifiedProductIds(candidate).length === 0)
    return false;
  const targets = new Set<string>();
  for (const item of candidates) {
    if (!family.has(item.identifierType)) continue;
    for (const id of verifiedProductIds(item)) targets.add(id);
  }
  return targets.size > 1;
}

function factConflict(
  sourceFacts: CanonicalProductFacts,
  candidateFacts: CanonicalProductFacts,
  sourceKey: keyof CanonicalProductFacts,
): boolean {
  const source = sourceFacts[sourceKey];
  const candidate = candidateFacts[sourceKey];
  return source !== undefined && candidate !== undefined && source !== candidate;
}

export function createHardConflictDetector() {
  return freeze({
    detect(
      value: CandidateScoringResult,
      context: HardConflictContext = {},
    ): HardConflictDetectionResult {
      if (
        !isRecord(value) ||
        value.scorerVersion !== supportedScorerVersion ||
        typeof value.truncated !== "boolean"
      ) {
        throw new ConflictDetectorError("INVALID_CONFLICT_INPUT");
      }
      const candidates = readCandidates(value.candidates);
      const sourceFacts = readFacts(context.sourceFacts);
      const factsByCandidate = readCandidateFacts(context.candidateFacts, candidates);
      const output = candidates.map((candidate) => {
        const facts = factsByCandidate.get(candidateKey(candidate)) ?? freeze({});
        const codes = new Set<HardConflictCode>();
        if (hasCompetingVerifiedTarget(candidate, candidates, gtinTypes))
          codes.add("CONFLICT_GTIN");
        if (hasCompetingVerifiedTarget(candidate, candidates, modelTypes))
          codes.add("CONFLICT_MODEL");
        if (factConflict(sourceFacts, facts, "brandKey")) codes.add("CONFLICT_BRAND");
        if (factConflict(sourceFacts, facts, "variantKey")) codes.add("CONFLICT_VARIANT");
        if (factConflict(sourceFacts, facts, "volume")) codes.add("CONFLICT_VOLUME");
        if (factConflict(sourceFacts, facts, "color")) codes.add("CONFLICT_COLOR");
        const conflicts = freeze([...codes].sort(compareCodeUnits).map((code) => freeze({ code })));
        return freeze({ ...candidate, conflicts, hasHardConflict: conflicts.length > 0 });
      });
      return freeze({
        candidates: freeze(output),
        detectorVersion,
        internalCatalogReferences: value.internalCatalogReferences,
        normalizerVersion: value.normalizerVersion,
        providerFailures: value.providerFailures,
        rejectedCandidates: value.rejectedCandidates,
        scorerVersion: supportedScorerVersion,
        truncated: value.truncated,
      });
    },
  });
}
