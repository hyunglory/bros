import assert from "node:assert/strict";
import test from "node:test";
import { validateResolveCandidates } from "../../contracts/dist/index.js";
import {
  CandidateNormalizerError,
  createCandidateNormalizer,
  normalizeIdentifierCandidateValue,
} from "../dist/index.js";

function evidence(identifierType, locator = "/fixture", patch = {}) {
  return {
    schemaVersion: 1,
    identifierType,
    type: "SOURCE_FIELD",
    source: "SOURCE_EXTRACTOR",
    strength: "WEAK",
    weight: 45,
    provenance: {
      capturedAt: "2026-09-15T00:00:00Z",
      locator,
      matchStart: 0,
      matchEnd: 2,
      matchedText: "DD",
      patternId: "FIXTURE_V1",
      registryVersion: "fixture-v1",
      surface: "RAW",
    },
    ...patch,
  };
}

function collection(candidates, overrides = {}) {
  return {
    candidates,
    internalCatalogReferences: [],
    providerFailures: [],
    truncated: false,
    ...overrides,
  };
}

function candidate(identifierType, candidateValue, locator, patch = {}) {
  return {
    identifierType,
    candidateValue,
    evidence: [evidence(identifierType, locator)],
    ...patch,
  };
}

test("P3-07 type-specific normalization matrix is explicit and conservative", () => {
  const matrix = [
    ["MODEL_NO", " dd1391-100 ", "DD1391100"],
    ["STYLE_CODE", "ＤＤ１３９１＿１００", "DD1391100"],
    ["PRODUCT_NO", "ab‐123", "AB123"],
    ["MPN", "AB 123", "AB123"],
    ["MODEL_NO", "AB/123", "AB/123"],
    ["BRAND_CODE", "ab-123", "AB-123"],
    ["BARCODE", "ab-123", "AB-123"],
    ["GTIN", "880-1234 567890", "8801234567890"],
    ["EAN", "1234 5678", "12345678"],
    ["UPC", "0-12345-67890-5", "012345678905"],
  ];
  for (const [type, value, expected] of matrix) {
    assert.equal(normalizeIdentifierCandidateValue(type, value), expected);
  }
  for (const [type, value] of [
    ["GTIN", "880123"],
    ["GTIN", "ABC1234567890"],
    ["EAN", "123456789012"],
    ["UPC", "1234567890123"],
  ]) {
    assert.equal(normalizeIdentifierCandidateValue(type, value), undefined);
  }
});

test("P3-07 merges same type and norm, preserves every provenance and selects a stable display value", () => {
  const normalizer = createCandidateNormalizer();
  const first = normalizer.normalize(
    collection([
      candidate("STYLE_CODE", "DD1391100", "/raw/second"),
      candidate("STYLE_CODE", "DD1391-100", "/raw/first"),
      candidate("STYLE_CODE", "dd1391_100", "/raw/third"),
      candidate("MODEL_NO", "DD1391-100", "/title"),
    ]),
  );
  const second = normalizer.normalize(
    collection([
      candidate("MODEL_NO", "DD1391-100", "/title"),
      candidate("STYLE_CODE", "dd1391_100", "/raw/third"),
      candidate("STYLE_CODE", "DD1391-100", "/raw/first"),
      candidate("STYLE_CODE", "DD1391100", "/raw/second"),
    ]),
  );
  assert.deepEqual(second, first);
  assert.equal(first.normalizerVersion, "identifier-normalizer/v1");
  assert.deepEqual(
    first.candidates.map((item) => [item.identifierType, item.candidateNorm, item.candidateValue]),
    [
      ["MODEL_NO", "DD1391100", "DD1391-100"],
      ["STYLE_CODE", "DD1391100", "DD1391-100"],
    ],
  );
  const style = first.candidates[1];
  assert.deepEqual(style.sourceCandidateValues, ["DD1391-100", "DD1391100", "dd1391_100"]);
  assert.deepEqual(
    style.evidence.map((item) => item.provenance.locator),
    ["/raw/first", "/raw/second", "/raw/third"],
  );
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(style.evidence), true);
});

test("P3-07 keeps invalid typed values with their evidence and does not create a candidate", () => {
  const result = createCandidateNormalizer().normalize(
    collection([
      candidate("GTIN", "ABC-123", "/raw/invalid"),
      candidate("EAN", "123456789012", "/raw/ean"),
      candidate("MODEL_NO", "AB/123", "/raw/model"),
    ]),
  );
  assert.deepEqual(
    result.candidates.map((item) => item.candidateValue),
    ["AB/123"],
  );
  assert.deepEqual(
    result.rejectedCandidates.map((item) => [
      item.identifierType,
      item.candidateValue,
      item.code,
      item.evidence[0].provenance.locator,
    ]),
    [
      ["EAN", "123456789012", "INVALID_IDENTIFIER_FORMAT", "/raw/ean"],
      ["GTIN", "ABC-123", "INVALID_IDENTIFIER_FORMAT", "/raw/invalid"],
    ],
  );
});

test("P3-07 carries catalog/provider context and upstream truncation without using it as candidate evidence", () => {
  const result = createCandidateNormalizer().normalize(
    collection([candidate("MODEL_NO", "AB-123", "/raw")], {
      truncated: true,
      internalCatalogReferences: [
        {
          queryKind: "BRAND_NAME_VARIANT",
          outcome: "AMBIGUOUS",
          truncated: true,
          matchedProductPublicIds: ["01890f47-0c4d-7abc-8def-1234567890ac"],
        },
      ],
      providerFailures: [{ providerId: "fixture-provider", code: "TIMEOUT" }],
    }),
  );
  assert.equal(result.truncated, true);
  assert.deepEqual(result.internalCatalogReferences, [
    {
      queryKind: "BRAND_NAME_VARIANT",
      outcome: "AMBIGUOUS",
      truncated: true,
      matchedProductPublicIds: ["01890f47-0c4d-7abc-8def-1234567890ac"],
    },
  ]);
  assert.deepEqual(result.providerFailures, [{ providerId: "fixture-provider", code: "TIMEOUT" }]);
  assert.equal(result.candidates[0].evidence.length, 1);
});

test("P3-07 output can enter the existing candidate store boundary without score or decision", () => {
  const normalized = createCandidateNormalizer().normalize(
    collection([candidate("MODEL_NO", "AB-123", "/raw"), candidate("MODEL_NO", "AB123", "/title")]),
  ).candidates[0];
  const parsed = validateResolveCandidates([
    {
      identifierType: normalized.identifierType,
      candidateValue: normalized.candidateValue,
      candidateNorm: normalized.candidateNorm,
      confidenceScore: null,
      rankNo: 1,
      evidence: normalized.evidence,
      conflicts: [],
    },
  ]);
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.value[0].evidence, normalized.evidence);
});

test("P3-07 rejects malformed, unsafe or non-P3-06 collection data before returning output", () => {
  const cases = [
    null,
    collection([{ identifierType: "MODEL_NO", candidateValue: "AB-123", evidence: [] }]),
    collection([candidate("MODEL_NO", "token=private-value", "/raw")]),
    collection([candidate("MODEL_NO", "AB-123", "/raw", { evidence: [evidence("GTIN")] })]),
    collection([candidate("MODEL_NO", "AB-123", "/raw")], {
      providerFailures: [{ providerId: "x", code: "unknown" }],
    }),
    collection([candidate("MODEL_NO", "AB-123", "/raw")], {
      internalCatalogReferences: [
        { queryKind: "OTHER", outcome: "MISS", truncated: false, matchedProductPublicIds: [] },
      ],
    }),
  ];
  for (const value of cases) {
    assert.throws(
      () => createCandidateNormalizer().normalize(value),
      (error) =>
        error instanceof CandidateNormalizerError && error.code === "INVALID_NORMALIZATION_INPUT",
    );
  }
});

test("P3-07 bounds evidence after merge and marks the result truncated", () => {
  const candidates = Array.from({ length: 101 }, (_, index) =>
    candidate("STYLE_CODE", "DD1391-100", `/raw/${index}`),
  );
  const result = createCandidateNormalizer().normalize(collection(candidates));
  assert.equal(result.candidates.length, 1);
  assert.equal(result.candidates[0].evidence.length, 100);
  assert.equal(result.truncated, true);
});
