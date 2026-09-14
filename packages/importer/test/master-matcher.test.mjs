import assert from "node:assert/strict";
import test from "node:test";
import { matchMasterCandidates } from "../dist/index.js";

const brand = {
  aliasName: "Nike",
  aliasScope: "GLOBAL",
  brand: { brandKey: "NIKE", nameEn: "Nike", nameKo: "나이키", publicId: "brand-nike" },
  normalizedName: "nike",
  status: "RESOLVED",
};

function source(overrides = {}) {
  return {
    brand,
    identifiers: {
      candidates: [
        {
          normalizedValue: "8801234567890",
          provenance: [{ kind: "SOURCE_FIELD", path: "/identifiers/0" }],
          type: "GTIN",
          value: "8801234567890",
        },
      ],
      truncated: false,
    },
    productName: "Nike Air Max 90 White",
    ...overrides,
  };
}

function master(overrides = {}) {
  return {
    brandPublicId: "brand-nike",
    identifiers: [
      {
        isVerified: true,
        normalizedValue: "8801234567890",
        publicId: "identifier-1",
        type: "EAN",
      },
    ],
    masterPublicId: "master-1",
    optionKeys: ["white / 270"],
    productName: "Nike Air Max 90 White",
    productNameNorm: "nike air max 90 white",
    status: "ACTIVE",
    titleSimilarity: 1,
    ...overrides,
  };
}

test("recommends one existing MASTER for a unique verified GTIN-family exact match", () => {
  const result = matchMasterCandidates(source(), [master()]);
  assert.equal(result.outcome, "MATCH_EXISTING");
  assert.equal(result.reason, "STRONG_IDENTIFIER_MATCH");
  assert.equal(result.selectedMasterPublicId, "master-1");
  assert.deepEqual(
    result.candidates[0].evidence.find((item) => item.type === "VERIFIED_GTIN_EXACT"),
    {
      masterIdentifierPublicId: "identifier-1",
      normalizedValue: "8801234567890",
      sourceProvenance: [{ kind: "SOURCE_FIELD", path: "/identifiers/0" }],
      type: "VERIFIED_GTIN_EXACT",
      value: "GTIN",
    },
  );
});

test("routes multiple strong matches to review without selecting a MASTER", () => {
  const result = matchMasterCandidates(source(), [
    master(),
    master({
      masterPublicId: "master-2",
      identifiers: [{ ...master().identifiers[0], publicId: "identifier-2" }],
    }),
  ]);
  assert.equal(result.outcome, "REVIEW_REQUIRED");
  assert.equal(result.reason, "AMBIGUOUS_STRONG_MATCH");
  assert.equal(result.selectedMasterPublicId, undefined);
});

test("blocks an exact model match when the candidate has a conflicting GTIN", () => {
  const result = matchMasterCandidates(
    source({
      identifiers: {
        candidates: [
          {
            normalizedValue: "DD1391-100",
            provenance: [{ kind: "RAW_JSON", path: "/modelNo" }],
            type: "MODEL_NO",
            value: "DD1391-100",
          },
          {
            normalizedValue: "1111111111111",
            provenance: [{ kind: "RAW_JSON", path: "/gtin" }],
            type: "GTIN",
            value: "1111111111111",
          },
        ],
        truncated: false,
      },
    }),
    [
      master({
        identifiers: [
          {
            isVerified: true,
            normalizedValue: "DD1391-100",
            publicId: "model-1",
            type: "MODEL_NO",
          },
          { isVerified: true, normalizedValue: "2222222222222", publicId: "gtin-2", type: "GTIN" },
        ],
      }),
    ],
  );
  assert.equal(result.outcome, "REVIEW_REQUIRED");
  assert.equal(result.reason, "HARD_CONFLICT");
  assert.deepEqual(result.candidates[0].conflicts, ["CONFLICT_GTIN"]);
});

test("blocks an exact GTIN match when the same typed model number conflicts", () => {
  const input = source();
  input.identifiers.candidates.push({
    normalizedValue: "SOURCE-MODEL",
    provenance: [{ kind: "RAW_JSON", path: "/modelNo" }],
    type: "MODEL_NO",
    value: "SOURCE-MODEL",
  });
  const result = matchMasterCandidates(input, [
    master({
      identifiers: [
        ...master().identifiers,
        {
          isVerified: true,
          normalizedValue: "MASTER-MODEL",
          publicId: "model-2",
          type: "MODEL_NO",
        },
      ],
    }),
  ]);
  assert.equal(result.outcome, "REVIEW_REQUIRED");
  assert.equal(result.reason, "HARD_CONFLICT");
  assert.deepEqual(result.candidates[0].conflicts, ["CONFLICT_MODEL"]);
});

test("never confirms title similarity and detects a different option variant", () => {
  const result = matchMasterCandidates(
    source({
      identifiers: { candidates: [], truncated: false },
      optionNames: [{ rawOptionName: "Black / 275" }],
    }),
    [master({ identifiers: [], titleSimilarity: 0.92 })],
  );
  assert.equal(result.outcome, "REVIEW_REQUIRED");
  assert.equal(result.reason, "HARD_CONFLICT");
  assert.deepEqual(result.candidates[0].conflicts, ["CONFLICT_VARIANT"]);
  assert.equal(result.selectedMasterPublicId, undefined);
});

test("routes truncated extraction to review even with one strong match", () => {
  const input = source();
  input.identifiers.truncated = true;
  const result = matchMasterCandidates(input, [master()]);
  assert.equal(result.outcome, "REVIEW_REQUIRED");
  assert.equal(result.reason, "IDENTIFIER_EXTRACTION_TRUNCATED");
});

test("returns a new-MASTER candidate with resolved brand and source identity evidence", () => {
  const result = matchMasterCandidates(source(), []);
  assert.deepEqual(result, {
    candidates: [],
    outcome: "NEW_MASTER_CANDIDATE",
    reason: "NO_CANDIDATE",
  });
});

test("routes an evidence-free source to review instead of creating a MASTER", () => {
  const result = matchMasterCandidates(
    source({ identifiers: { candidates: [], truncated: false } }),
    [],
  );
  assert.deepEqual(result, {
    candidates: [],
    outcome: "REVIEW_REQUIRED",
    reason: "INSUFFICIENT_EVIDENCE",
  });
});
