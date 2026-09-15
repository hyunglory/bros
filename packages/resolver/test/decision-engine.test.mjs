import assert from "node:assert/strict";
import test from "node:test";
import {
  createCandidateNormalizer,
  createCandidateScorer,
  createDecisionEngine,
  createHardConflictDetector,
  DecisionEngineError,
} from "../dist/index.js";

function evidence(identifierType, type = "SOURCE_FIELD") {
  return {
    schemaVersion: 1,
    identifierType,
    type,
    source: type === "VERIFIED_INTERNAL_IDENTIFIER" ? "INTERNAL_CATALOG" : "SOURCE_EXTRACTOR",
    strength: type === "VERIFIED_INTERNAL_IDENTIFIER" ? "VERIFIED" : "WEAK",
    weight: type === "VERIFIED_INTERNAL_IDENTIFIER" ? 100 : 45,
    provenance: {
      capturedAt: "2026-09-15T00:00:00Z",
      locator: `/fixture/${identifierType}`,
      surface: "RAW",
      ...(type === "VERIFIED_INTERNAL_IDENTIFIER"
        ? { productPublicId: "01890f47-0c4d-7abc-8def-1234567890ab" }
        : {}),
    },
  };
}

function detected({
  strong = false,
  truncated = false,
  providerFailures = [],
  rejectedCandidates = [],
} = {}) {
  const type = strong ? "VERIFIED_INTERNAL_IDENTIFIER" : "SOURCE_FIELD";
  const normalized = createCandidateNormalizer().normalize({
    candidates: [
      {
        identifierType: "MODEL_NO",
        candidateValue: "AB-123",
        evidence: [evidence("MODEL_NO", type)],
      },
    ],
    internalCatalogReferences: [],
    providerFailures,
    rejectedCandidates,
    truncated,
  });
  return createHardConflictDetector().detect(createCandidateScorer().score(normalized));
}

function withScore(result, score, patch = {}) {
  return {
    ...result,
    candidates: result.candidates.map((candidate) => ({
      ...candidate,
      confidenceScore: `${score}.00`,
      ...patch,
    })),
  };
}

test("P3-10 applies every documented score boundary and requires strong evidence at 95", () => {
  const engine = createDecisionEngine();
  const weak = detected();
  const strong = detected({ strong: true });
  const cases = [
    [59, weak, "NOT_FOUND", "INSUFFICIENT_SCORE", false],
    [60, weak, "CANDIDATE", "SCORE_60_TO_79", false],
    [79, weak, "CANDIDATE", "SCORE_60_TO_79", false],
    [80, weak, "REVIEW_REQUIRED", "SCORE_80_TO_94", false],
    [94, weak, "REVIEW_REQUIRED", "SCORE_80_TO_94", false],
    [95, weak, "REVIEW_REQUIRED", "STRONG_EVIDENCE_REQUIRED", false],
    [95, strong, "AUTO_ACCEPTED", "AUTO_ACCEPT_ELIGIBLE", true],
    [100, strong, "AUTO_ACCEPTED", "AUTO_ACCEPT_ELIGIBLE", true],
  ];
  for (const [score, input, decision, reason, eligible] of cases) {
    const candidate = engine.decide(withScore(input, score)).candidates[0];
    assert.deepEqual(
      [candidate.recommendedDecision, candidate.decisionReason, candidate.autoAcceptEligible],
      [decision, reason, eligible],
    );
  }
});

test("P3-10 hard conflict and truncation override otherwise auto-eligible scores", () => {
  const engine = createDecisionEngine();
  const strong = detected({ strong: true });
  const conflicted = withScore(strong, 100, {
    conflicts: [{ code: "CONFLICT_MODEL" }],
    hasHardConflict: true,
  });
  const conflict = engine.decide(conflicted).candidates[0];
  assert.deepEqual(
    [conflict.recommendedDecision, conflict.decisionReason],
    ["REVIEW_REQUIRED", "HARD_CONFLICT"],
  );
  const truncated = engine.decide(withScore(detected({ strong: true, truncated: true }), 100))
    .candidates[0];
  assert.deepEqual(
    [truncated.recommendedDecision, truncated.decisionReason],
    ["REVIEW_REQUIRED", "TRUNCATED_INPUT"],
  );
});

test("P3-10 distinguishes normal not found from incomplete empty resolver results", () => {
  const engine = createDecisionEngine();
  const base = detected();
  const empty = { ...base, candidates: [] };
  assert.equal(engine.decide(empty).outcome, "NOT_FOUND");
  assert.equal(engine.decide({ ...empty, truncated: true }).outcome, "REVIEW_REQUIRED");
  assert.equal(
    engine.decide({ ...empty, providerFailures: [{ providerId: "fixture", code: "TIMEOUT" }] })
      .outcome,
    "REVIEW_REQUIRED",
  );
  assert.equal(
    engine.decide({
      ...empty,
      rejectedCandidates: [
        {
          candidateValue: "ABC",
          identifierType: "GTIN",
          code: "INVALID_IDENTIFIER_FORMAT",
          evidence: [],
        },
      ],
    }).outcome,
    "REVIEW_REQUIRED",
  );
});

test("P3-10 is deterministic and retains conflict/scorer state without persisting a decision", () => {
  const input = detected({ strong: true });
  const engine = createDecisionEngine();
  const first = engine.decide(withScore(input, 100));
  const second = engine.decide(
    withScore({ ...input, candidates: [...input.candidates].reverse() }, 100),
  );
  assert.deepEqual(second, first);
  assert.equal(first.engineVersion, "decision-engine/v1");
  assert.equal("decisionStatus" in first.candidates[0], false);
  assert.equal(Object.isFrozen(first.candidates[0]), true);
});

test("P3-10 rejects malformed detector candidates before any partial recommendation", () => {
  const input = detected({ strong: true });
  const cases = [
    { ...input, detectorVersion: "other" },
    withScore(input, 100, { hasHardConflict: false, conflicts: [{ code: "CONFLICT_GTIN" }] }),
    withScore(input, 100, { confidenceScore: "99.50" }),
    { ...input, candidates: [{ ...input.candidates[0], rankNo: 0 }] },
  ];
  for (const value of cases) {
    assert.throws(
      () => createDecisionEngine().decide(value),
      (error) => error instanceof DecisionEngineError && error.code === "INVALID_DECISION_INPUT",
    );
  }
});
