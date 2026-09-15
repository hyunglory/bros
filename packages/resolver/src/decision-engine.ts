import type { SourceIdentifierType } from "@bros/contracts";
import type {
  ConflictCheckedCandidate,
  HardConflictDetectionResult,
} from "./hard-conflict-detector.js";

const engineVersion = "decision-engine/v1";
const supportedDetectorVersion = "hard-conflict-detector/v1";
const maxCandidates = 1_000;

export type CandidateRecommendedDecision =
  "AUTO_ACCEPTED" | "CANDIDATE" | "NOT_FOUND" | "REVIEW_REQUIRED";

export type ResolveDecisionOutcome = "CANDIDATES" | "NOT_FOUND" | "REVIEW_REQUIRED";

export type DecisionReason =
  | "AUTO_ACCEPT_ELIGIBLE"
  | "HARD_CONFLICT"
  | "INSUFFICIENT_SCORE"
  | "NO_CANDIDATE"
  | "PROVIDER_FAILURE"
  | "REJECTED_IDENTIFIER"
  | "SCORE_60_TO_79"
  | "SCORE_80_TO_94"
  | "STRONG_EVIDENCE_REQUIRED"
  | "TRUNCATED_INPUT";

export type DecisionEngineErrorCode = "INVALID_DECISION_INPUT";

export class DecisionEngineError extends Error {
  constructor(readonly code: DecisionEngineErrorCode) {
    super(code);
    this.name = "DecisionEngineError";
  }
}

export interface DecidedCandidate extends ConflictCheckedCandidate {
  autoAcceptEligible: boolean;
  decisionReason: DecisionReason;
  recommendedDecision: CandidateRecommendedDecision;
}

export interface DecisionEngineResult {
  candidates: readonly DecidedCandidate[];
  detectorVersion: typeof supportedDetectorVersion;
  engineVersion: typeof engineVersion;
  internalCatalogReferences: HardConflictDetectionResult["internalCatalogReferences"];
  normalizerVersion: HardConflictDetectionResult["normalizerVersion"];
  outcome: ResolveDecisionOutcome;
  providerFailures: HardConflictDetectionResult["providerFailures"];
  rejectedCandidates: HardConflictDetectionResult["rejectedCandidates"];
  scorerVersion: HardConflictDetectionResult["scorerVersion"];
  truncated: boolean;
}

function freeze<T>(value: T): T {
  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    throw new DecisionEngineError("INVALID_DECISION_INPUT");
  }
  return value as SourceIdentifierType;
}

function requiredText(value: unknown, maximum = 512): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.length > maximum
  ) {
    throw new DecisionEngineError("INVALID_DECISION_INPUT");
  }
  return value;
}

function readScore(value: unknown): number {
  if (typeof value !== "string" || !/^(?:100|[0-9]{1,2})\.00$/u.test(value)) {
    throw new DecisionEngineError("INVALID_DECISION_INPUT");
  }
  return Number(value);
}

function readCandidates(value: unknown): readonly ConflictCheckedCandidate[] {
  if (!Array.isArray(value) || value.length > maxCandidates) {
    throw new DecisionEngineError("INVALID_DECISION_INPUT");
  }
  const identities = new Set<string>();
  const ranks = new Set<number>();
  const allowedConflicts = new Set([
    "CONFLICT_BRAND",
    "CONFLICT_GTIN",
    "CONFLICT_MODEL",
    "CONFLICT_VARIANT",
    "CONFLICT_VOLUME",
    "CONFLICT_COLOR",
  ]);
  return freeze(
    value
      .map((item) => {
        if (
          !isRecord(item) ||
          typeof item.hasStrongEvidence !== "boolean" ||
          typeof item.hasHardConflict !== "boolean" ||
          !Number.isInteger(item.rankNo) ||
          (item.rankNo as number) < 1 ||
          !Array.isArray(item.conflicts)
        ) {
          throw new DecisionEngineError("INVALID_DECISION_INPUT");
        }
        const identifierTypeValue = identifierType(item.identifierType);
        const candidateNorm = requiredText(item.candidateNorm);
        const candidateValue = requiredText(item.candidateValue);
        const confidenceScore = requiredText(item.confidenceScore, 6);
        readScore(confidenceScore);
        const conflicts = item.conflicts.map((conflict) => {
          if (
            !isRecord(conflict) ||
            typeof conflict.code !== "string" ||
            !allowedConflicts.has(conflict.code)
          ) {
            throw new DecisionEngineError("INVALID_DECISION_INPUT");
          }
          return freeze({
            code: conflict.code as ConflictCheckedCandidate["conflicts"][number]["code"],
          });
        });
        if (item.hasHardConflict !== conflicts.length > 0) {
          throw new DecisionEngineError("INVALID_DECISION_INPUT");
        }
        const identity = JSON.stringify([identifierTypeValue, candidateNorm]);
        const rankNo = item.rankNo as number;
        if (identities.has(identity) || ranks.has(rankNo)) {
          throw new DecisionEngineError("INVALID_DECISION_INPUT");
        }
        identities.add(identity);
        ranks.add(rankNo);
        // The detector already validates and freezes provenance; decision only
        // reads the policy fields and retains the established candidate object.
        return freeze({
          ...(item as unknown as ConflictCheckedCandidate),
          candidateNorm,
          candidateValue,
          confidenceScore,
          conflicts: freeze(conflicts),
          identifierType: identifierTypeValue,
          rankNo,
        });
      })
      .sort((left, right) => left.rankNo - right.rankNo),
  );
}

function decideCandidate(
  candidate: ConflictCheckedCandidate,
  truncated: boolean,
): Pick<DecidedCandidate, "autoAcceptEligible" | "decisionReason" | "recommendedDecision"> {
  const score = readScore(candidate.confidenceScore);
  if (candidate.hasHardConflict) {
    return {
      autoAcceptEligible: false,
      decisionReason: "HARD_CONFLICT",
      recommendedDecision: "REVIEW_REQUIRED",
    };
  }
  if (truncated) {
    return {
      autoAcceptEligible: false,
      decisionReason: "TRUNCATED_INPUT",
      recommendedDecision: "REVIEW_REQUIRED",
    };
  }
  if (score >= 95 && candidate.hasStrongEvidence) {
    return {
      autoAcceptEligible: true,
      decisionReason: "AUTO_ACCEPT_ELIGIBLE",
      recommendedDecision: "AUTO_ACCEPTED",
    };
  }
  if (score >= 95) {
    return {
      autoAcceptEligible: false,
      decisionReason: "STRONG_EVIDENCE_REQUIRED",
      recommendedDecision: "REVIEW_REQUIRED",
    };
  }
  if (score >= 80) {
    return {
      autoAcceptEligible: false,
      decisionReason: "SCORE_80_TO_94",
      recommendedDecision: "REVIEW_REQUIRED",
    };
  }
  if (score >= 60) {
    return {
      autoAcceptEligible: false,
      decisionReason: "SCORE_60_TO_79",
      recommendedDecision: "CANDIDATE",
    };
  }
  return {
    autoAcceptEligible: false,
    decisionReason: "INSUFFICIENT_SCORE",
    recommendedDecision: "NOT_FOUND",
  };
}

export function createDecisionEngine() {
  return freeze({
    decide(value: HardConflictDetectionResult): DecisionEngineResult {
      if (
        !isRecord(value) ||
        value.detectorVersion !== supportedDetectorVersion ||
        typeof value.truncated !== "boolean" ||
        !Array.isArray(value.providerFailures) ||
        !Array.isArray(value.rejectedCandidates)
      ) {
        throw new DecisionEngineError("INVALID_DECISION_INPUT");
      }
      const candidates = readCandidates(value.candidates);
      const decided = freeze(
        candidates.map((candidate) =>
          freeze({ ...candidate, ...decideCandidate(candidate, value.truncated) }),
        ),
      );
      const outcome: ResolveDecisionOutcome = decided.some(
        (candidate) => candidate.recommendedDecision !== "NOT_FOUND",
      )
        ? "CANDIDATES"
        : value.truncated
          ? "REVIEW_REQUIRED"
          : value.providerFailures.length > 0
            ? "REVIEW_REQUIRED"
            : value.rejectedCandidates.length > 0
              ? "REVIEW_REQUIRED"
              : "NOT_FOUND";
      return freeze({
        candidates: decided,
        detectorVersion: supportedDetectorVersion,
        engineVersion,
        internalCatalogReferences: value.internalCatalogReferences,
        normalizerVersion: value.normalizerVersion,
        outcome,
        providerFailures: value.providerFailures,
        rejectedCandidates: value.rejectedCandidates,
        scorerVersion: value.scorerVersion,
        truncated: value.truncated,
      });
    },
  });
}
