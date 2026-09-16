import assert from "node:assert/strict";
import test from "node:test";
import {
  validateCreateResolveRun,
  validateIdentifierResolveInput,
  validateResolveCandidates,
} from "../dist/index.js";

const publicId = "01890f47-0c4d-7abc-8def-1234567890ab";
const input = {
  schemaVersion: 1,
  sourceProductPublicId: publicId,
  productPublicId: null,
  platformCode: "MUSINSA",
  externalProductId: "source-1",
  productName: "Fixture",
  brandName: null,
  productUrl: "https://example.com/item",
  collectedAt: "2026-09-15T00:00:00Z",
  raw: { modelNo: "AB-123" },
  import: null,
};
const candidate = {
  identifierType: "MODEL_NO",
  candidateValue: "AB-123",
  candidateNorm: "AB123",
  confidenceScore: "95.25",
  rankNo: 1,
  evidence: [{ type: "SOURCE_FIELD", path: "/modelNo", value: "AB-123" }],
  conflicts: [],
};

test("P3-01 accepts a versioned source snapshot and unlinked source", () => {
  assert.equal(
    validateCreateResolveRun({ sourceProductPublicId: publicId, resolverVersion: "resolver-v1" })
      .ok,
    true,
  );
  assert.equal(validateIdentifierResolveInput(input).ok, true);
  for (const patch of [
    { schemaVersion: 2 },
    { sourceProductPublicId: "123" },
    { productName: " " },
    { collectedAt: "2026-02-30T00:00:00Z" },
    { extra: true },
  ]) {
    assert.equal(validateIdentifierResolveInput({ ...input, ...patch }).ok, false);
  }
  assert.equal(
    validateCreateResolveRun({ sourceProductPublicId: publicId, resolverVersion: " " }).ok,
    false,
  );
});

test("P3-01 validates import identity and preserves explicit identifiers", () => {
  const mapped = {
    platformCode: "MUSINSA",
    externalProductId: "source-1",
    productName: "Fixture",
    productUrl: input.productUrl,
    identifiers: [{ type: "MODEL_NO", value: "EXPLICIT-1" }],
    raw: input.raw,
  };
  const value = { ...input, import: { itemPublicId: publicId, input: mapped } };
  assert.deepEqual(validateIdentifierResolveInput(value), { ok: true, value });
  assert.equal(
    validateIdentifierResolveInput({ ...value, externalProductId: "different" }).ok,
    false,
  );
  assert.equal(validateIdentifierResolveInput({ ...value, brandName: "different" }).ok, false);
});

test("P3-01 rejects unsafe raw, evidence, signed URLs, and malformed JSON without echoing data", () => {
  const cyclic = {};
  cyclic.self = cyclic;
  let deep = {};
  for (let i = 0; i < 40; i++) deep = { nested: deep };
  const accessor = {
    get value() {
      throw new Error("must not execute");
    },
  };
  for (const raw of [
    { password: "private-value" },
    { url: "https://example.com/?token=private-value" },
    { value: NaN },
    { value: undefined },
    new Date(),
    cyclic,
    deep,
    accessor,
  ]) {
    const result = validateIdentifierResolveInput({ ...input, raw });
    assert.deepEqual(result, { ok: false, code: "INVALID_RESOLVE_INPUT" });
  }
  assert.equal(
    validateIdentifierResolveInput({ ...input, productUrl: "https://user:pass@example.com" }).ok,
    false,
  );
  assert.equal(
    validateResolveCandidates([{ ...candidate, evidence: [{ apiKey: "private-value" }] }]).ok,
    false,
  );
});

test("P3-01 candidate bounds, unique identities and explicit empty result", () => {
  assert.deepEqual(validateResolveCandidates([]), { ok: true, value: [] });
  assert.equal(validateResolveCandidates([candidate]).ok, true);
  for (const patch of [
    { rankNo: 0 },
    { confidenceScore: "100.01" },
    { confidenceScore: "-1" },
    { confidenceScore: "9.123" },
    { candidateNorm: " " },
    { identifierType: "OTHER" },
    { decisionStatus: "AUTO_ACCEPTED" },
    { decisionStatus: "ACCEPTED" },
  ]) {
    assert.equal(validateResolveCandidates([{ ...candidate, ...patch }]).ok, false);
  }
  assert.equal(
    validateResolveCandidates([candidate, { ...candidate, candidateValue: "other" }]).ok,
    false,
  );
  assert.equal(
    validateResolveCandidates([candidate, { ...candidate, identifierType: "MPN" }]).ok,
    true,
  );
  assert.equal(validateResolveCandidates([{ ...candidate, confidenceScore: null }]).ok, true);
  assert.equal(validateResolveCandidates([{ ...candidate, confidenceScore: "100.00" }]).ok, true);
});
