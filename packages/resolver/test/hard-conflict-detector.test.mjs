import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictDetectorError,
  createCandidateNormalizer,
  createCandidateScorer,
  createHardConflictDetector,
} from "../dist/index.js";

const weights = { SOURCE_FIELD: 45, VERIFIED_INTERNAL_IDENTIFIER: 100 };

function evidence(identifierType, type, productPublicId) {
  return {
    schemaVersion: 1,
    identifierType,
    type,
    source: type === "VERIFIED_INTERNAL_IDENTIFIER" ? "INTERNAL_CATALOG" : "SOURCE_EXTRACTOR",
    strength: type === "VERIFIED_INTERNAL_IDENTIFIER" ? "VERIFIED" : "WEAK",
    weight: weights[type],
    provenance: {
      capturedAt: "2026-09-15T00:00:00Z",
      locator: `/fixture/${identifierType}/${type}`,
      surface: "RAW",
      ...(productPublicId === undefined ? {} : { productPublicId }),
    },
  };
}

function scored(candidates) {
  return createCandidateScorer().score(
    createCandidateNormalizer().normalize({
      candidates,
      internalCatalogReferences: [],
      providerFailures: [],
      truncated: false,
    }),
  );
}

function allFacts(candidate) {
  return {
    sourceFacts: { brandKey: "brand-a", variantKey: "v1", volume: "500ml", color: "black" },
    candidateFacts: [
      {
        identifierType: candidate.identifierType,
        candidateNorm: candidate.candidateNorm,
        facts: { brandKey: "brand-b", variantKey: "v2", volume: "750ml", color: "white" },
      },
    ],
  };
}

test("P3-09 detects each explicit product fact conflict without parsing source text", () => {
  const result = scored([
    {
      identifierType: "MODEL_NO",
      candidateValue: "AB-123",
      evidence: [evidence("MODEL_NO", "SOURCE_FIELD")],
    },
  ]);
  const detected = createHardConflictDetector().detect(result, allFacts(result.candidates[0]));
  assert.deepEqual(
    detected.candidates[0].conflicts.map((item) => item.code),
    ["CONFLICT_BRAND", "CONFLICT_COLOR", "CONFLICT_VARIANT", "CONFLICT_VOLUME"],
  );
  assert.equal(detected.candidates[0].hasHardConflict, true);
  assert.equal(detected.detectorVersion, "hard-conflict-detector/v1");
});

test("P3-09 detects GTIN and typed-model conflicts only for competing verified catalog targets", () => {
  const result = scored([
    {
      identifierType: "GTIN",
      candidateValue: "8801234567890",
      evidence: [
        evidence("GTIN", "VERIFIED_INTERNAL_IDENTIFIER", "01890f47-0c4d-7abc-8def-1234567890ab"),
      ],
    },
    {
      identifierType: "EAN",
      candidateValue: "1234567890123",
      evidence: [
        evidence("EAN", "VERIFIED_INTERNAL_IDENTIFIER", "01890f47-0c4d-7abc-8def-1234567890ac"),
      ],
    },
    {
      identifierType: "MODEL_NO",
      candidateValue: "AB-123",
      evidence: [
        evidence(
          "MODEL_NO",
          "VERIFIED_INTERNAL_IDENTIFIER",
          "01890f47-0c4d-7abc-8def-1234567890ad",
        ),
      ],
    },
    {
      identifierType: "STYLE_CODE",
      candidateValue: "CD-456",
      evidence: [
        evidence(
          "STYLE_CODE",
          "VERIFIED_INTERNAL_IDENTIFIER",
          "01890f47-0c4d-7abc-8def-1234567890ae",
        ),
      ],
    },
  ]);
  const detected = createHardConflictDetector().detect(result);
  const byType = new Map(
    detected.candidates.map((candidate) => [candidate.identifierType, candidate]),
  );
  assert.deepEqual(byType.get("GTIN").conflicts, [{ code: "CONFLICT_GTIN" }]);
  assert.deepEqual(byType.get("EAN").conflicts, [{ code: "CONFLICT_GTIN" }]);
  assert.deepEqual(byType.get("MODEL_NO").conflicts, [{ code: "CONFLICT_MODEL" }]);
  assert.deepEqual(byType.get("STYLE_CODE").conflicts, [{ code: "CONFLICT_MODEL" }]);
});

test("P3-09 does not treat multiple values without a competing verified target as conflict", () => {
  const result = scored([
    {
      identifierType: "GTIN",
      candidateValue: "8801234567890",
      evidence: [evidence("GTIN", "SOURCE_FIELD")],
    },
    {
      identifierType: "EAN",
      candidateValue: "1234567890123",
      evidence: [evidence("EAN", "SOURCE_FIELD")],
    },
  ]);
  const detected = createHardConflictDetector().detect(result, {
    sourceFacts: { color: "black" },
    candidateFacts: [
      { identifierType: "GTIN", candidateNorm: "8801234567890", facts: { color: "black" } },
    ],
  });
  assert.deepEqual(
    detected.candidates.map((candidate) => candidate.conflicts),
    [[], []],
  );
  assert.equal(
    detected.candidates.every((candidate) => candidate.hasHardConflict === false),
    true,
  );
});

test("P3-09 retains scorer state deterministically and does not make a decision", () => {
  const result = scored([
    {
      identifierType: "MODEL_NO",
      candidateValue: "B-100",
      evidence: [evidence("MODEL_NO", "SOURCE_FIELD")],
    },
    {
      identifierType: "MODEL_NO",
      candidateValue: "A-100",
      evidence: [evidence("MODEL_NO", "SOURCE_FIELD")],
    },
  ]);
  const detector = createHardConflictDetector();
  const first = detector.detect(result);
  const second = detector.detect({ ...result, candidates: [...result.candidates].reverse() });
  assert.deepEqual(second, first);
  assert.deepEqual(
    first.candidates.map((candidate) => candidate.rankNo),
    [1, 2],
  );
  assert.equal("decisionStatus" in first.candidates[0], false);
  assert.equal(Object.isFrozen(first.candidates[0].conflicts), true);
});

test("P3-09 rejects malformed scorer/context data before returning partial conflicts", () => {
  const result = scored([
    {
      identifierType: "MODEL_NO",
      candidateValue: "AB-123",
      evidence: [evidence("MODEL_NO", "SOURCE_FIELD")],
    },
  ]);
  const candidate = result.candidates[0];
  const cases = [
    { value: { ...result, scorerVersion: "other" }, context: {} },
    { value: { ...result, candidates: [{ ...candidate, rankNo: 0 }] }, context: {} },
    { value: result, context: { sourceFacts: { color: "black", unknown: "x" } } },
    {
      value: result,
      context: {
        candidateFacts: [
          { identifierType: "OTHER", candidateNorm: candidate.candidateNorm, facts: {} },
        ],
      },
    },
  ];
  for (const { value, context } of cases) {
    assert.throws(
      () => createHardConflictDetector().detect(value, context),
      (error) => error instanceof ConflictDetectorError && error.code === "INVALID_CONFLICT_INPUT",
    );
  }
});
