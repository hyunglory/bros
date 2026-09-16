import { createHash } from "node:crypto";
import { performance } from "node:perf_hooks";
import { maskSensitiveText } from "@bros/core";
import {
  isResolverEvaluationDataset,
  validateSourceRawJson,
  type ResolverEvaluationDataset,
  type SourceIdentifierType,
} from "@bros/contracts";
import {
  createCandidateNormalizer,
  normalizeIdentifierCandidateValue,
} from "./candidate-normalizer.js";
import { createCandidateScorer } from "./candidate-scorer.js";
import { createHardConflictDetector } from "./hard-conflict-detector.js";
import { createDecisionEngine } from "./decision-engine.js";
import type { EvidenceCollection } from "./evidence-collector.js";

export class ResolverEvaluationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ResolverEvaluationError";
  }
}
const fail = (code: string): never => {
  throw new ResolverEvaluationError(code);
};
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object")
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
export const evaluationDigest = (value: unknown) =>
  createHash("sha256").update(canonical(value)).digest("hex");
const identity = (type: SourceIdentifierType, value: string) => {
  const norm = normalizeIdentifierCandidateValue(type, value);
  if (!norm) return fail("INVALID_TRUTH_IDENTIFIER");
  return JSON.stringify([["GTIN", "EAN", "UPC"].includes(type) ? "GTIN" : type, norm]);
};
const requiredTags = [
  "NO_IDENTIFIER",
  "SIMILAR_MODEL",
  "GTIN_CONFLICT",
  "COLOR_CONFLICT",
  "VOLUME_CONFLICT",
  "AI_ONLY",
];

export function validateEvaluationDataset(value: unknown): ResolverEvaluationDataset {
  if (!isResolverEvaluationDataset(value)) return fail("INVALID_EVALUATION_DATASET");
  // Check each record separately: the raw guard has a bounded object traversal budget.
  const data = structuredClone(value);
  const safeText = (input: unknown): boolean =>
    typeof input === "string"
      ? maskSensitiveText(input) === input
      : Array.isArray(input)
        ? input.every(safeText)
        : input !== null && typeof input === "object"
          ? Object.values(input).every(safeText)
          : true;
  if (
    !safeText({
      datasetVersion: data.datasetVersion,
      sourceDescription: data.sourceDescription,
      scope: data.scope,
    })
  )
    return fail("UNSAFE_EVALUATION_RECORD");
  const cases = new Set<string>(),
    masterSplits = new Map<string, string>(),
    assets = new Map<string, string>();
  for (const item of data.cases) {
    if (
      !validateSourceRawJson(item).ok ||
      !safeText(item) ||
      !Number.isFinite(Date.parse(item.truth.verifiedAt))
    )
      return fail("UNSAFE_EVALUATION_RECORD");
    if (cases.has(item.caseId)) return fail("DUPLICATE_EVALUATION_CASE");
    cases.add(item.caseId);
    if (!data.scope.brands.includes(item.brand) || !data.scope.categories.includes(item.category))
      return fail("CASE_OUTSIDE_SCOPE");
    if (masterSplits.has(item.masterKey) && masterSplits.get(item.masterKey) !== item.split)
      return fail("MASTER_SPLIT_LEAKAGE");
    masterSplits.set(item.masterKey, item.split);
    for (const asset of [
      ...item.skuKeys.map((v) => `sku:${v}`),
      ...item.imageHashes.map((v) => `image:${v}`),
    ]) {
      if (assets.has(asset) && assets.get(asset) !== item.split) return fail("ASSET_SPLIT_LEAKAGE");
      assets.set(asset, item.split);
    }
    const labels = item.truth.identifiers.map((v) => identity(v.identifierType, v.value));
    if (new Set(labels).size !== labels.length) return fail("DUPLICATE_TRUTH_IDENTIFIER");
    if (item.tags.includes("NO_IDENTIFIER") !== (labels.length === 0))
      return fail("TRUTH_TAG_MISMATCH");
    if (item.tags.includes("AI_ONLY") !== (item.capture.evidenceOrigin === "AI_ONLY"))
      return fail("AI_ORIGIN_TAG_MISMATCH");
    if (
      item.tags.some((tag) =>
        ["NO_IDENTIFIER", "GTIN_CONFLICT", "COLOR_CONFLICT", "VOLUME_CONFLICT", "AI_ONLY"].includes(
          tag,
        ),
      ) &&
      !item.truth.autoAcceptForbidden
    )
      return fail("MISSING_NEGATIVE_AUTO_LABEL");
  }
  return data;
}

/** Freeze this digest before opening holdout results. Any scope/capture/label edit changes it. */
export function resolverHoldoutDigest(value: unknown): string {
  const data = validateEvaluationDataset(value);
  return evaluationDigest({
    schemaVersion: data.schemaVersion,
    datasetVersion: data.datasetVersion,
    sourceKind: data.sourceKind,
    sourceDescription: data.sourceDescription,
    scope: data.scope,
    cases: data.cases
      .filter((v) => v.split === "HOLDOUT")
      .sort((a, b) => (a.caseId < b.caseId ? -1 : 1)),
  });
}

export interface EvaluationOptions {
  expectedHoldoutDigest: string;
  algorithmDigest: string;
}
export function evaluateResolverDataset(value: unknown, options: EvaluationOptions) {
  const data = validateEvaluationDataset(value);
  if (!/^[a-f0-9]{64}$/.test(options.algorithmDigest)) return fail("INVALID_ALGORITHM_DIGEST");
  const holdoutDigest = resolverHoldoutDigest(data);
  if (options.expectedHoldoutDigest !== holdoutDigest) return fail("HOLDOUT_DIGEST_MISMATCH");
  const normalizer = createCandidateNormalizer(),
    scorer = createCandidateScorer(),
    detector = createHardConflictDetector(),
    engine = createDecisionEngine();
  const rows = data.cases.map((item) => {
    const started = performance.now();
    // Only captured inputs enter production policy code. No supplied score/decision is accepted.
    const result = engine.decide(
      detector.detect(
        scorer.score(normalizer.normalize(item.capture.collection as EvidenceCollection)),
        item.capture.conflictContext,
      ),
    );
    const elapsedMs = performance.now() - started;
    const truth = new Set(item.truth.identifiers.map((v) => identity(v.identifierType, v.value)));
    const candidates = result.candidates.map((c) => ({
      identifierType: c.identifierType,
      candidateNorm: c.candidateNorm,
      confidenceScore: c.confidenceScore,
      recommendedDecision: c.recommendedDecision,
      autoAcceptEligible: c.autoAcceptEligible,
      correct: truth.has(identity(c.identifierType, c.candidateNorm)),
      conflicts: c.conflicts.map((v) => v.code),
      strongEvidence: c.hasStrongEvidence,
      unsafeAuto:
        c.autoAcceptEligible &&
        (c.hasHardConflict ||
          !c.hasStrongEvidence ||
          item.capture.evidenceOrigin === "AI_ONLY" ||
          item.truth.autoAcceptForbidden),
    }));
    return {
      caseId: item.caseId,
      masterKey: item.masterKey,
      brand: item.brand,
      category: item.category,
      split: item.split,
      tags: item.tags,
      truthCount: truth.size,
      truth: {
        identifiers: [...truth].sort(),
        verifiedBy: item.truth.verifiedBy,
        verifiedAt: item.truth.verifiedAt,
        evidenceReference: item.truth.evidenceReference,
      },
      captureReference: item.capture.reference,
      autoAcceptForbidden: item.truth.autoAcceptForbidden,
      candidates,
      outcome: result.outcome,
      elapsedMs,
      costUsd: item.capture.costUsd,
      providerFailureCount: result.providerFailures.length,
      truncated: result.truncated,
      versions: {
        normalizer: result.normalizerVersion,
        scorer: result.scorerVersion,
        detector: result.detectorVersion,
        engine: result.engineVersion,
      },
    };
  });
  type Row = (typeof rows)[number];
  function metrics(items: Row[]) {
    const all = items.flatMap((v) => v.candidates),
      auto = all.filter((v) => v.autoAcceptEligible),
      correctAuto = auto.filter((v) => v.correct);
    const correctCandidateCases = items.filter(
      (v) => !v.autoAcceptForbidden && v.candidates.some((c) => c.correct),
    );
    const falseReviewCases = correctCandidateCases.filter(
      (v) => !v.candidates.some((c) => c.correct && c.autoAcceptEligible),
    );
    const known = items.filter((v) => v.truthCount > 0);
    const autoCases = items.filter((v) => v.candidates.some((c) => c.autoAcceptEligible));
    const costs = items.filter((v) => v.costUsd !== null);
    const totalCost = costs.reduce((n, v) => n + (v.costUsd ?? 0), 0);
    const times = items.map((v) => v.elapsedMs).sort((a, b) => a - b);
    const ratio = (n: number, d: number) => (d === 0 ? null : n / d);
    return {
      caseCount: items.length,
      masterCount: new Set(items.map((v) => v.masterKey)).size,
      candidateCount: all.length,
      autoCandidateCount: auto.length,
      autoMasterCount: new Set(autoCases.map((v) => v.masterKey)).size,
      wrongAutoCount: auto.length - correctAuto.length,
      unsafeAutoCount: auto.filter((v) => v.unsafeAuto).length,
      precision: ratio(correctAuto.length, auto.length),
      coverage: ratio(autoCases.length, items.length),
      knownIdentifierCaseCount: known.length,
      missingCorrectCandidateCount: known.filter((v) => !v.candidates.some((c) => c.correct))
        .length,
      falseReviewCount: falseReviewCases.length,
      falseReviewDenominator: correctCandidateCases.length,
      falseReviewRate: ratio(falseReviewCases.length, correctCandidateCases.length),
      providerFailureCases: items.filter((v) => v.providerFailureCount > 0).length,
      truncatedCases: items.filter((v) => v.truncated).length,
      elapsedMs: times.reduce((a, b) => a + b, 0),
      p95ReplayMs: times.length ? times[Math.ceil(times.length * 0.95) - 1] : null,
      costKnownCount: costs.length,
      recordedCostUsd: costs.length ? totalCost : null,
      meanRecordedCostUsd: costs.length ? totalCost / costs.length : null,
      scoreBins: [0, 60, 80, 95].map((min, index) => {
        const max = [59, 79, 94, 100][index] ?? 100;
        const subset = all.filter(
          (c) => Number(c.confidenceScore) >= min && Number(c.confidenceScore) <= max,
        );
        return { min, max, count: subset.length, correct: subset.filter((c) => c.correct).length };
      }),
    };
  }
  const holdoutRows = rows.filter((v) => v.split === "HOLDOUT"),
    holdout = metrics(holdoutRows);
  const byBrand = data.scope.brands.map((key) => ({
    key,
    ...metrics(holdoutRows.filter((v) => v.brand === key)),
  }));
  const byCategory = data.scope.categories.map((key) => ({
    key,
    ...metrics(holdoutRows.filter((v) => v.category === key)),
  }));
  const gates = {
    realLabels: data.sourceKind === "REAL",
    distinctProducts: new Set(rows.map((v) => v.masterKey)).size >= 200,
    tuningSplit: rows.some((v) => v.split === "TUNING"),
    holdoutAutoCandidates: holdout.autoCandidateCount >= 100,
    holdoutAutoProducts: holdout.autoMasterCount >= 100,
    brandCoverage: byBrand.every((v) => v.masterCount >= 20),
    categoryCoverage: byCategory.every((v) => v.masterCount >= 20),
    challengeCoverage: requiredTags.every((tag) => holdoutRows.some((v) => v.tags.includes(tag))),
    zeroWrongAuto: holdout.wrongAutoCount === 0,
    zeroUnsafeAuto: holdout.unsafeAutoCount === 0,
  };
  const status =
    data.sourceKind === "SYNTHETIC"
      ? "SYNTHETIC_ONLY"
      : !gates.zeroWrongAuto || !gates.zeroUnsafeAuto
        ? "FAIL"
        : Object.values(gates).every(Boolean)
          ? "PASS"
          : "INSUFFICIENT_DATA";
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    evaluationMode: "COLLECTED_EVIDENCE_REPLAY",
    datasetVersion: data.datasetVersion,
    sourceKind: data.sourceKind,
    sourceDescription: data.sourceDescription,
    datasetDigest: evaluationDigest(data),
    holdoutDigest,
    algorithmDigest: options.algorithmDigest,
    scope: data.scope,
    captureVersions: [
      ...new Set(
        data.cases.map((v) =>
          JSON.stringify([
            v.capture.resolverVersion,
            v.capture.registryVersion,
            v.capture.providerVersion,
          ]),
        ),
      ),
    ].sort(),
    calibrationStatus: status,
    gates,
    automaticPromotionEnabled: false,
    activationDecision: "REQUIRES_OPERATION_OWNER_AND_END_TO_END_VALIDATION",
    thresholds: {
      autoAcceptMinimum: 95,
      candidateMinimum: 80,
      reviewMinimum: 60,
      strongEvidenceRequired: true,
      hardConflictOverride: false,
    },
    tuning: metrics(rows.filter((v) => v.split === "TUNING")),
    holdout,
    byBrand,
    byCategory,
    errors: holdoutRows.flatMap((v) =>
      v.candidates
        .filter((c) => c.autoAcceptEligible && (!c.correct || c.unsafeAuto))
        .map((c) => ({ caseId: v.caseId, ...c })),
    ),
    rows,
  };
}
