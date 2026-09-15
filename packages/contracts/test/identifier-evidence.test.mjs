import assert from "node:assert/strict";
import test from "node:test";
import { validateIdentifierEvidence } from "../dist/index.js";

const valid = {
  schemaVersion: 1,
  identifierType: "MODEL_NO",
  type: "TITLE_MATCH",
  source: "SOURCE_EXTRACTOR",
  strength: "WEAK",
  weight: 30,
  provenance: {
    capturedAt: "2026-09-15T00:00:00Z",
    locator: "/productName",
    matchStart: 8,
    matchEnd: 15,
    matchedText: "FX-1001",
    patternId: "TITLE_V1",
    registryVersion: "fixture-v1",
    surface: "TITLE",
  },
};

test("P3-06 accepts bounded structured candidate evidence", () => {
  const result = validateIdentifierEvidence(valid);
  assert.equal(result.ok, true);
  assert.deepEqual(result.value, valid);
});

test("P3-06 rejects invalid provenance, unsafe URLs and secret-bearing metadata without echoing it", () => {
  for (const value of [
    { ...valid, schemaVersion: 2 },
    { ...valid, strength: "STRONG" },
    { ...valid, weight: 101 },
    { ...valid, provenance: { ...valid.provenance, matchEnd: 8 } },
    { ...valid, provenance: { ...valid.provenance, capturedAt: "not-a-date" } },
    {
      ...valid,
      provenance: { ...valid.provenance, sourceUrl: "https://user:pass@example.test/item" },
    },
    {
      ...valid,
      provenance: { ...valid.provenance, sourceUrl: "https://example.test/?token=private-value" },
    },
    { ...valid, provenance: { ...valid.provenance, matchedText: "token=private-value" } },
    { ...valid, provenance: { ...valid.provenance, extra: "not-allowed" } },
    { ...valid, unknown: "not-allowed" },
  ]) {
    const result = validateIdentifierEvidence(value);
    assert.deepEqual(result, { ok: false, code: "INVALID_IDENTIFIER_EVIDENCE" });
    assert.doesNotMatch(JSON.stringify(result), /private-value/);
  }
});
