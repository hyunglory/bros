import assert from "node:assert/strict";
import test from "node:test";
import { validateResolveCandidates } from "../../contracts/dist/index.js";
import {
  createCandidateNormalizer,
  createCandidateScorer,
  createDecisionEngine,
  createEvidenceCollector,
  createHardConflictDetector,
  createIdentifierExtractor,
  createIdentifierPatternRegistry,
  EvidenceCollectorError,
} from "../dist/index.js";

const input = {
  schemaVersion: 1,
  sourceProductPublicId: "01890f47-0c4d-7abc-8def-1234567890ab",
  productPublicId: null,
  platformCode: "FIXTURE",
  externalProductId: "fixture-1",
  productName: "Fixture FX-1001",
  brandName: "Fixture Brand",
  productUrl: "https://source.test/items/FX-1001",
  collectedAt: "2026-09-15T00:00:00Z",
  raw: { model: "FX-1001", other: "DD1391-100" },
  import: null,
};
const registry = createIdentifierPatternRegistry({
  version: "collector-fixture-v1",
  patterns: [
    {
      id: "TITLE_FX",
      brandKey: "fixture-brand",
      identifierType: "MODEL_NO",
      source: "TITLE",
      regex: "(?<identifier>FX-[0-9]{4})",
    },
    {
      id: "RAW_FX",
      brandKey: "fixture-brand",
      identifierType: "MODEL_NO",
      source: "RAW",
      regex: "(?<identifier>FX-[0-9]{4})",
    },
    {
      id: "RAW_NIKE",
      brandKey: "fixture-brand",
      identifierType: "STYLE_CODE",
      source: "RAW",
      regex: "(?<identifier>DD[0-9]{4}-[0-9]{3})",
    },
  ],
});
const extracted = createIdentifierExtractor(registry).extract({ brandKey: "fixture-brand", input });
const externalCandidate = {
  identifierType: "MODEL_NO",
  candidateValue: "FX-1001",
  evidence: {
    type: "SEARCH_RESULT",
    strength: "WEAK",
    providerId: "fixture-search-v1",
    sourceUrl: "https://catalog.test/FX-1001",
    retrievedAt: "2026-09-15T00:01:00Z",
    resultRank: 1,
    surface: "TITLE",
    locator: "/web/results/0/title",
    matchedText: "FX-1001",
    matchStart: 8,
    matchEnd: 15,
    patternId: "TITLE_FX",
    registryVersion: "collector-fixture-v1",
  },
};
const internalIdentifier = {
  query: { kind: "IDENTIFIER", identifierType: "MODEL_NO", identifierNorm: "FX-1001" },
  outcome: "EXACT",
  truncated: false,
  matches: [
    {
      brandKey: "fixture-brand",
      productName: "Fixture FX-1001",
      productPublicId: "01890f47-0c4d-7abc-8def-1234567890ac",
      matchedSkuPublicIds: ["01890f47-0c4d-7abc-8def-1234567890ad"],
      matchedIdentifier: { type: "MODEL_NO", value: "FX-1001", norm: "FX-1001" },
    },
  ],
};
const internalName = {
  query: {
    kind: "BRAND_NAME_VARIANT",
    brandKey: "fixture-brand",
    productNameNorm: "fixture fx 1001",
  },
  outcome: "AMBIGUOUS",
  truncated: false,
  matches: [
    {
      brandKey: "fixture-brand",
      productName: "A",
      productPublicId: "01890f47-0c4d-7abc-8def-1234567890ae",
      matchedSkuPublicIds: [],
    },
    {
      brandKey: "fixture-brand",
      productName: "B",
      productPublicId: "01890f47-0c4d-7abc-8def-1234567890af",
      matchedSkuPublicIds: [],
    },
  ],
};

function collect(overrides = {}) {
  return createEvidenceCollector().collect({
    input,
    extracted,
    internalCatalogResults: [internalIdentifier, internalName],
    externalResults: [
      {
        outcome: "CANDIDATES",
        providerId: "fixture-search-v1",
        candidates: [externalCandidate],
        truncated: false,
      },
    ],
    ...overrides,
  });
}

test("P3-06 merges exact raw candidates while retaining source, weight and provenance", () => {
  const result = collect();
  assert.equal(result.truncated, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.candidates), true);
  assert.deepEqual(
    result.candidates.map((item) => [
      item.identifierType,
      item.candidateValue,
      item.evidence.length,
    ]),
    [
      ["MODEL_NO", "FX-1001", 4],
      ["STYLE_CODE", "DD1391-100", 1],
    ],
  );
  const fx = result.candidates[0];
  assert.deepEqual(
    fx.evidence.map((item) => [item.type, item.source, item.strength, item.weight]),
    [
      ["EXTERNAL_CATALOG", "EXTERNAL_PROVIDER", "WEAK", 15],
      ["SOURCE_FIELD", "SOURCE_EXTRACTOR", "WEAK", 45],
      ["TITLE_MATCH", "SOURCE_EXTRACTOR", "WEAK", 30],
      ["VERIFIED_INTERNAL_IDENTIFIER", "INTERNAL_CATALOG", "VERIFIED", 100],
    ],
  );
  const verified = fx.evidence.find((item) => item.type === "VERIFIED_INTERNAL_IDENTIFIER");
  assert.deepEqual(verified.provenance, {
    capturedAt: "2026-09-15T00:00:00Z",
    locator: "/internalCatalog/IDENTIFIER/matches/0",
    productPublicId: "01890f47-0c4d-7abc-8def-1234567890ac",
    matchedSkuPublicIds: ["01890f47-0c4d-7abc-8def-1234567890ad"],
    surface: "IDENTIFIER",
  });
  assert.equal("candidateNorm" in fx, false);
  assert.equal("confidenceScore" in fx, false);
  assert.equal("rankNo" in fx, false);
  assert.equal(Object.isFrozen(fx.evidence[0].provenance), true);
});

test("P3-06 keeps catalog name ambiguity as a reference and provider errors out of candidates", () => {
  const result = collect({
    externalResults: [{ outcome: "ERROR", providerId: "fixture-search-v1", code: "TIMEOUT" }],
  });
  assert.deepEqual(result.providerFailures, [{ providerId: "fixture-search-v1", code: "TIMEOUT" }]);
  assert.deepEqual(result.internalCatalogReferences, [
    {
      matchedProductPublicIds: ["01890f47-0c4d-7abc-8def-1234567890ac"],
      outcome: "EXACT",
      queryKind: "IDENTIFIER",
      truncated: false,
    },
    {
      matchedProductPublicIds: [
        "01890f47-0c4d-7abc-8def-1234567890ae",
        "01890f47-0c4d-7abc-8def-1234567890af",
      ],
      outcome: "AMBIGUOUS",
      queryKind: "BRAND_NAME_VARIANT",
      truncated: false,
    },
  ]);
  assert.equal(
    result.candidates[0].evidence.some((item) => item.source === "EXTERNAL_PROVIDER"),
    false,
  );
});

test("P3-06 is deterministic and does not normalize formatting variants", () => {
  const first = collect();
  const second = collect({
    extracted: { candidates: [...extracted.candidates].reverse(), truncated: false },
    internalCatalogResults: [internalName, internalIdentifier],
    externalResults: [
      {
        outcome: "CANDIDATES",
        providerId: "fixture-search-v1",
        candidates: [externalCandidate],
        truncated: false,
      },
    ],
  });
  assert.deepEqual(second, first);
  assert.equal(
    second.candidates.some((item) => item.candidateValue === "DD1391100"),
    false,
  );
  const variant = collect({
    extracted: {
      candidates: [
        ...extracted.candidates,
        { ...extracted.candidates[2], candidateValue: "DD1391100" },
      ],
      truncated: false,
    },
  });
  assert.deepEqual(
    variant.candidates
      .filter((item) => item.identifierType === "STYLE_CODE")
      .map((item) => item.candidateValue),
    ["DD1391-100", "DD1391100"],
  );
});

test("P3-06 rejects unsafe/malformed evidence inputs before returning partial output", () => {
  const cases = [
    { input: { ...input, raw: { password: "private-value" } } },
    {
      extracted: {
        candidates: [
          {
            ...extracted.candidates[0],
            evidence: { ...extracted.candidates[0].evidence, matchedText: "token=private-value" },
          },
        ],
        truncated: false,
      },
    },
    {
      externalResults: [
        {
          outcome: "CANDIDATES",
          providerId: "fixture-search-v1",
          candidates: [
            {
              ...externalCandidate,
              evidence: {
                ...externalCandidate.evidence,
                sourceUrl: "https://catalog.test/?token=private-value",
              },
            },
          ],
          truncated: false,
        },
      ],
    },
    {
      internalCatalogResults: [
        {
          ...internalIdentifier,
          matches: [
            {
              ...internalIdentifier.matches[0],
              matchedIdentifier: {
                ...internalIdentifier.matches[0].matchedIdentifier,
                norm: "different",
              },
            },
          ],
        },
      ],
    },
    {
      externalResults: [
        { outcome: "ERROR", providerId: "fixture-search-v1", code: "raw provider diagnostics" },
      ],
    },
  ];
  for (const overrides of cases) {
    assert.throws(
      () => collect(overrides),
      (error) =>
        error instanceof EvidenceCollectorError &&
        /INVALID_EVIDENCE_(INPUT|OUTPUT)/.test(error.code),
    );
  }
});

test("P3-06 preserves upstream truncation and bounds one candidate's evidence", () => {
  const many = Array.from({ length: 101 }, (_, index) => ({
    ...externalCandidate,
    evidence: {
      ...externalCandidate.evidence,
      locator: `/web/results/${index}/title`,
      resultRank: 1,
    },
  }));
  const result = collect({
    extracted: { candidates: [], truncated: true },
    internalCatalogResults: [],
    externalResults: [
      {
        outcome: "CANDIDATES",
        providerId: "fixture-search-v1",
        candidates: many,
        truncated: false,
      },
    ],
  });
  assert.equal(result.truncated, true);
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].evidence.length, 100);
});

test("P3-06 output is valid immutable evidence payload for the existing candidate store boundary", () => {
  const result = collect();
  const candidate = result.candidates[0];
  const payload = [
    {
      identifierType: candidate.identifierType,
      candidateValue: candidate.candidateValue,
      candidateNorm: candidate.candidateValue,
      confidenceScore: null,
      rankNo: 1,
      evidence: candidate.evidence,
      conflicts: [],
    },
  ];
  const validated = validateResolveCandidates(payload);
  assert.equal(validated.ok, true);
  assert.deepEqual(validated.value[0].evidence, candidate.evidence);
  assert.equal(Object.isFrozen(candidate.evidence), true);
});

test("P3-06 collection hands every provenance to P3-07 while formatting variants merge", () => {
  const collected = collect({
    extracted: {
      candidates: [
        ...extracted.candidates,
        {
          ...extracted.candidates[2],
          candidateValue: "DD1391100",
          evidence: { ...extracted.candidates[2].evidence, locator: "/raw/format-variant" },
        },
      ],
      truncated: false,
    },
  });
  const normalized = createCandidateNormalizer().normalize(collected);
  const style = normalized.candidates.find((item) => item.identifierType === "STYLE_CODE");
  assert.deepEqual(style.sourceCandidateValues, ["DD1391-100", "DD1391100"]);
  assert.equal(style.candidateNorm, "DD1391100");
  assert.deepEqual(
    style.evidence.map((item) => item.provenance.locator),
    ["/raw/format-variant", "/raw/other"],
  );
  assert.deepEqual(
    normalized.internalCatalogReferences.map((item) => item.queryKind).sort(),
    collected.internalCatalogReferences.map((item) => item.queryKind).sort(),
  );
  assert.deepEqual(normalized.providerFailures, collected.providerFailures);
});

test("P3-06 through P3-10 retains collected provenance and returns a policy recommendation", () => {
  const normalized = createCandidateNormalizer().normalize(collect());
  const scored = createCandidateScorer().score(normalized);
  const detected = createHardConflictDetector().detect(scored);
  const decided = createDecisionEngine().decide(detected);
  const model = detected.candidates.find((candidate) => candidate.identifierType === "MODEL_NO");
  assert.equal(model.confidenceScore, "100.00");
  assert.equal(model.hasStrongEvidence, true);
  assert.deepEqual(model.conflicts, []);
  assert.deepEqual(
    [decided.candidates[0].recommendedDecision, decided.candidates[0].autoAcceptEligible],
    ["AUTO_ACCEPTED", true],
  );
  assert.deepEqual(
    model.evidence.map((item) => item.provenance.locator),
    normalized.candidates
      .find((candidate) => candidate.identifierType === "MODEL_NO")
      .evidence.map((item) => item.provenance.locator),
  );
});
