import assert from "node:assert/strict";
import test from "node:test";
import { validateResolveCandidates } from "../../contracts/dist/index.js";
import {
  CandidateScorerError,
  createCandidateNormalizer,
  createCandidateScorer,
} from "../dist/index.js";

const weights = {
  SOURCE_FIELD: 45,
  TITLE_MATCH: 30,
  URL_MATCH: 25,
  OPTION_MATCH: 35,
  VERIFIED_INTERNAL_IDENTIFIER: 100,
  EXTERNAL_CATALOG: 15,
};

function evidence(identifierType, type, patch = {}) {
  const source =
    type === "VERIFIED_INTERNAL_IDENTIFIER"
      ? "INTERNAL_CATALOG"
      : type === "EXTERNAL_CATALOG"
        ? "EXTERNAL_PROVIDER"
        : "SOURCE_EXTRACTOR";
  return {
    schemaVersion: 1,
    identifierType,
    type,
    source,
    strength: type === "VERIFIED_INTERNAL_IDENTIFIER" ? "VERIFIED" : "WEAK",
    weight: weights[type],
    provenance: {
      capturedAt: "2026-09-15T00:00:00Z",
      locator: `/fixture/${type}`,
      surface: "RAW",
    },
    ...patch,
  };
}

function normalized(candidates, overrides = {}) {
  return createCandidateNormalizer().normalize({
    candidates: candidates.map(({ identifierType, candidateValue, evidence: items }) => ({
      identifierType,
      candidateValue,
      evidence: items,
    })),
    internalCatalogReferences: [],
    providerFailures: [],
    truncated: false,
    ...overrides,
  });
}

test("P3-08 golden score fixtures use versioned type weights and cap at 100", () => {
  const result = createCandidateScorer().score(
    normalized([
      {
        identifierType: "MODEL_NO",
        candidateValue: "RAW-45",
        evidence: [evidence("MODEL_NO", "SOURCE_FIELD")],
      },
      {
        identifierType: "MODEL_NO",
        candidateValue: "MIX-75",
        evidence: [evidence("MODEL_NO", "SOURCE_FIELD"), evidence("MODEL_NO", "TITLE_MATCH")],
      },
      {
        identifierType: "MODEL_NO",
        candidateValue: "EXTERNAL-15",
        evidence: [evidence("MODEL_NO", "EXTERNAL_CATALOG")],
      },
      {
        identifierType: "GTIN",
        candidateValue: "8801234567890",
        evidence: [evidence("GTIN", "VERIFIED_INTERNAL_IDENTIFIER")],
      },
      {
        identifierType: "MODEL_NO",
        candidateValue: "CAP-100",
        evidence: [
          evidence("MODEL_NO", "SOURCE_FIELD"),
          evidence("MODEL_NO", "TITLE_MATCH"),
          evidence("MODEL_NO", "OPTION_MATCH"),
        ],
      },
    ]),
  );
  assert.equal(result.scorerVersion, "identifier-scorer/v1");
  assert.deepEqual(
    result.candidates.map((candidate) => [
      candidate.candidateValue,
      candidate.confidenceScore,
      candidate.hasStrongEvidence,
    ]),
    [
      ["8801234567890", "100.00", true],
      ["CAP-100", "100.00", false],
      ["MIX-75", "75.00", false],
      ["RAW-45", "45.00", false],
      ["EXTERNAL-15", "15.00", false],
    ],
  );
  assert.deepEqual(result.candidates[1].scoreBreakdown, [
    { evidenceCount: 1, evidenceType: "OPTION_MATCH", weight: 35 },
    { evidenceCount: 1, evidenceType: "SOURCE_FIELD", weight: 45 },
    { evidenceCount: 1, evidenceType: "TITLE_MATCH", weight: 30 },
  ]);
});

test("P3-08 repeated provenance of one evidence type does not increase the score", () => {
  const result = createCandidateScorer().score(
    normalized([
      {
        identifierType: "STYLE_CODE",
        candidateValue: "DD1391-100",
        evidence: [
          evidence("STYLE_CODE", "SOURCE_FIELD", {
            provenance: { capturedAt: "2026-09-15T00:00:00Z", locator: "/raw/one", surface: "RAW" },
          }),
          evidence("STYLE_CODE", "SOURCE_FIELD", {
            provenance: { capturedAt: "2026-09-15T00:00:00Z", locator: "/raw/two", surface: "RAW" },
          }),
        ],
      },
    ]),
  );
  assert.equal(result.candidates[0].confidenceScore, "45.00");
  assert.deepEqual(result.candidates[0].scoreBreakdown, [
    { evidenceCount: 2, evidenceType: "SOURCE_FIELD", weight: 45 },
  ]);
});

test("P3-08 rank and score output are deterministic and retain P3-07 context", () => {
  const first = normalized(
    [
      {
        identifierType: "MODEL_NO",
        candidateValue: "B-100",
        evidence: [evidence("MODEL_NO", "TITLE_MATCH")],
      },
      {
        identifierType: "MODEL_NO",
        candidateValue: "A-100",
        evidence: [evidence("MODEL_NO", "TITLE_MATCH")],
      },
    ],
    {
      truncated: true,
      internalCatalogReferences: [
        { queryKind: "IDENTIFIER", outcome: "MISS", truncated: false, matchedProductPublicIds: [] },
      ],
      providerFailures: [{ providerId: "fixture", code: "TIMEOUT" }],
    },
  );
  const second = { ...first, candidates: [...first.candidates].reverse() };
  const scorer = createCandidateScorer();
  assert.deepEqual(scorer.score(second), scorer.score(first));
  const result = scorer.score(first);
  assert.deepEqual(
    result.candidates.map((candidate) => [candidate.candidateValue, candidate.rankNo]),
    [
      ["A-100", 1],
      ["B-100", 2],
    ],
  );
  assert.equal(result.truncated, true);
  assert.deepEqual(result.providerFailures, [{ providerId: "fixture", code: "TIMEOUT" }]);
});

test("P3-08 preserves rejected candidates and produces an existing candidate-store payload without decision", () => {
  const result = createCandidateScorer().score(
    normalized([
      {
        identifierType: "MODEL_NO",
        candidateValue: "AB-123",
        evidence: [evidence("MODEL_NO", "SOURCE_FIELD")],
      },
      {
        identifierType: "GTIN",
        candidateValue: "BAD-123",
        evidence: [evidence("GTIN", "SOURCE_FIELD")],
      },
    ]),
  );
  assert.equal(result.rejectedCandidates.length, 1);
  const stored = validateResolveCandidates(
    result.candidates.map((candidate) => ({
      identifierType: candidate.identifierType,
      candidateValue: candidate.candidateValue,
      candidateNorm: candidate.candidateNorm,
      confidenceScore: candidate.confidenceScore,
      rankNo: candidate.rankNo,
      evidence: candidate.evidence,
      conflicts: [],
    })),
  );
  assert.equal(stored.ok, true);
  assert.equal("decisionStatus" in result.candidates[0], false);
});

test("P3-08 rejects forged weights, weak verified claims and malformed normalized input", () => {
  const valid = normalized([
    {
      identifierType: "MODEL_NO",
      candidateValue: "AB-123",
      evidence: [evidence("MODEL_NO", "SOURCE_FIELD")],
    },
  ]);
  const cases = [
    { ...valid, normalizerVersion: "other" },
    {
      ...valid,
      candidates: [
        { ...valid.candidates[0], evidence: [{ ...valid.candidates[0].evidence[0], weight: 100 }] },
      ],
    },
    {
      ...valid,
      candidates: [
        {
          ...valid.candidates[0],
          evidence: [
            {
              ...valid.candidates[0].evidence[0],
              type: "VERIFIED_INTERNAL_IDENTIFIER",
              strength: "WEAK",
            },
          ],
        },
      ],
    },
    {
      ...valid,
      candidates: [{ ...valid.candidates[0], candidateValue: "not-the-canonical-value" }],
    },
  ];
  for (const value of cases) {
    assert.throws(
      () => createCandidateScorer().score(value),
      (error) => error instanceof CandidateScorerError && error.code === "INVALID_SCORING_INPUT",
    );
  }
});
