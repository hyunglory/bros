import assert from "node:assert/strict";
import test from "node:test";
import { extractEmbeddedIdentifiers, normalizeIdentifierValue } from "../dist/index.js";

test("extracts explicit and nested allowlisted raw identifiers with all provenance", () => {
  const result = extractEmbeddedIdentifiers({
    identifiers: [{ type: "STYLE_CODE", value: " DD1391-100 " }],
    raw: {
      detail: {
        barcode: ["012345678905", "012345678905"],
        gtin: "8801234567890",
        style_code: "dd1391-100",
        unknownText: "ABCD-1234",
      },
      모델번호: " DD1391-100 ",
    },
  });

  assert.deepEqual(result, {
    candidates: [
      {
        normalizedValue: "DD1391-100",
        provenance: [
          { kind: "SOURCE_FIELD", path: "/identifiers/0" },
          { kind: "RAW_JSON", path: "/detail/style_code" },
        ],
        type: "STYLE_CODE",
        value: "DD1391-100",
      },
      {
        normalizedValue: "012345678905",
        provenance: [
          { kind: "RAW_JSON", path: "/detail/barcode/0" },
          { kind: "RAW_JSON", path: "/detail/barcode/1" },
        ],
        type: "BARCODE",
        value: "012345678905",
      },
      {
        normalizedValue: "8801234567890",
        provenance: [{ kind: "RAW_JSON", path: "/detail/gtin" }],
        type: "GTIN",
        value: "8801234567890",
      },
      {
        normalizedValue: "DD1391-100",
        provenance: [{ kind: "RAW_JSON", path: "/모델번호" }],
        type: "MODEL_NO",
        value: "DD1391-100",
      },
    ],
    truncated: false,
  });
});

test("does not infer candidates from arbitrary strings or numeric raw values", () => {
  const result = extractEmbeddedIdentifiers({
    raw: {
      productName: "DD1391-100",
      product_no: 123456,
      nested: { freeText: "8801234567890" },
    },
  });
  assert.deepEqual(result, { candidates: [], truncated: false });
  assert.equal(normalizeIdentifierValue("  dd1391\u00a0-100  "), "DD1391 -100");
  assert.equal(normalizeIdentifierValue("  "), undefined);
  assert.equal(normalizeIdentifierValue("x".repeat(513)), undefined);
});

test("uses deterministic raw traversal and marks bounded extraction as truncated", () => {
  const first = extractEmbeddedIdentifiers({ raw: { z: { gtin: "2" }, a: { gtin: "1" } } });
  const second = extractEmbeddedIdentifiers({ raw: { a: { gtin: "1" }, z: { gtin: "2" } } });
  assert.deepEqual(first, second);

  let raw = "value";
  for (let index = 0; index < 17; index += 1) raw = { nested: raw };
  assert.equal(extractEmbeddedIdentifiers({ raw }).truncated, true);
});
