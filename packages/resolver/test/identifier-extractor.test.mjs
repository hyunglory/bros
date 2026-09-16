import assert from "node:assert/strict";
import test from "node:test";
import {
  createIdentifierExtractor,
  createIdentifierPatternRegistry,
  IdentifierExtractorError,
} from "../dist/index.js";

const registry = createIdentifierPatternRegistry({
  version: "extract-fixture-v1",
  patterns: [
    {
      id: "TITLE_V1",
      brandKey: "fixture-brand",
      identifierType: "MODEL_NO",
      source: "TITLE",
      regex: "(?<identifier>FX-T-[0-9]{4})",
    },
    {
      id: "RAW_V1",
      brandKey: "fixture-brand",
      identifierType: "STYLE_CODE",
      source: "RAW",
      regex: "code=(?<identifier>FX-R-[0-9]{3})",
    },
    {
      id: "URL_PATH_V1",
      brandKey: "fixture-brand",
      identifierType: "PRODUCT_NO",
      source: "URL",
      regex: "/products/(?<identifier>FXU[0-9]{4})",
    },
    {
      id: "URL_QUERY_V1",
      brandKey: "fixture-brand",
      identifierType: "MPN",
      source: "URL",
      regex: "^(?<identifier>FXQ[0-9]{4})$",
    },
    {
      id: "OPTION_V1",
      brandKey: "fixture-brand",
      identifierType: "BARCODE",
      source: "OPTION",
      regex: "(?<identifier>FX-O-[0-9]{2})",
    },
  ],
});

const sourcePublicId = "01890f47-0c4d-7abc-8def-1234567890ab";
const mappedInput = {
  platformCode: "MUSINSA",
  externalProductId: "extract-fixture",
  productName: "Fixture FX-T-1000 title",
  productUrl: "https://example.test/products/FXU1001?sku=FXQ1002&ignored=nope",
  options: [{ rawOptionName: "Color FX-O-03", sourceOrder: 0, raw: {} }],
  raw: {
    details: { code: "code=FX-R-004" },
    links: ["https://raw.test/products/FXU1003?sku=FXQ1004"],
  },
};
const input = {
  schemaVersion: 1,
  sourceProductPublicId: sourcePublicId,
  productPublicId: null,
  platformCode: "MUSINSA",
  externalProductId: "extract-fixture",
  productName: mappedInput.productName,
  brandName: null,
  productUrl: mappedInput.productUrl,
  collectedAt: "2026-09-15T00:00:00Z",
  raw: mappedInput.raw,
  import: { itemPublicId: sourcePublicId, input: mappedInput },
};

function expectError(callback, code) {
  assert.throws(
    callback,
    (error) => error instanceof IdentifierExtractorError && error.code === code,
  );
}

test("P3-03 extracts raw, URL path/query, title and option candidates with bounded provenance", () => {
  const result = createIdentifierExtractor(registry).extract({ brandKey: "fixture-brand", input });
  assert.equal(result.truncated, false);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.candidates), true);
  assert.deepEqual(
    result.candidates.map((candidate) => [
      candidate.identifierType,
      candidate.candidateValue,
      candidate.evidence.source,
      candidate.evidence.locator,
      candidate.evidence.matchedText,
      candidate.evidence.patternId,
      candidate.evidence.registryVersion,
    ]),
    [
      [
        "MODEL_NO",
        "FX-T-1000",
        "TITLE",
        "/productName",
        "FX-T-1000",
        "TITLE_V1",
        "extract-fixture-v1",
      ],
      [
        "PRODUCT_NO",
        "FXU1001",
        "URL",
        "/productUrl/$url/path",
        "/products/FXU1001",
        "URL_PATH_V1",
        "extract-fixture-v1",
      ],
      [
        "MPN",
        "FXQ1002",
        "URL",
        "/productUrl/$url/query/0/sku",
        "FXQ1002",
        "URL_QUERY_V1",
        "extract-fixture-v1",
      ],
      [
        "STYLE_CODE",
        "FX-R-004",
        "RAW",
        "/raw/details/code",
        "code=FX-R-004",
        "RAW_V1",
        "extract-fixture-v1",
      ],
      [
        "PRODUCT_NO",
        "FXU1003",
        "URL",
        "/raw/links/0/$url/path",
        "/products/FXU1003",
        "URL_PATH_V1",
        "extract-fixture-v1",
      ],
      [
        "MPN",
        "FXQ1004",
        "URL",
        "/raw/links/0/$url/query/0/sku",
        "FXQ1004",
        "URL_QUERY_V1",
        "extract-fixture-v1",
      ],
      [
        "BARCODE",
        "FX-O-03",
        "OPTION",
        "/import/input/options/0/rawOptionName",
        "FX-O-03",
        "OPTION_V1",
        "extract-fixture-v1",
      ],
    ],
  );
  const title = result.candidates[0];
  assert.equal(title.evidence.matchStart, 8);
  assert.equal(title.evidence.matchEnd, 17);
  assert.equal(Object.isFrozen(title), true);
  assert.equal(Object.isFrozen(title.evidence), true);
  assert.equal("decisionStatus" in title, false);
  assert.equal("candidateNorm" in title, false);
});

test("P3-03 never guesses a brand and keeps raw ordering deterministic", () => {
  const extractor = createIdentifierExtractor(registry);
  assert.deepEqual(extractor.extract({ brandKey: null, input }), {
    candidates: [],
    truncated: false,
  });
  assert.deepEqual(extractor.extract({ brandKey: "unknown-brand", input }), {
    candidates: [],
    truncated: false,
  });
  const ordered = { ...input, raw: { z: "code=FX-R-999", a: "code=FX-R-001" } };
  assert.deepEqual(
    extractor
      .extract({ brandKey: "fixture-brand", input: ordered })
      .candidates.filter((candidate) => candidate.evidence.source === "RAW")
      .map((candidate) => candidate.candidateValue),
    ["FX-R-001", "FX-R-999"],
  );
});

test("P3-03 rejects malformed or secret-bearing inputs before traversing or returning evidence", () => {
  const extractor = createIdentifierExtractor(registry);
  expectError(
    () =>
      extractor.extract({
        brandKey: "fixture-brand",
        input: { ...input, raw: { password: "private-value" } },
      }),
    "INVALID_RESOLVE_INPUT",
  );
  expectError(
    () =>
      extractor.extract({
        brandKey: "fixture-brand",
        input: { ...input, productUrl: "https://example.test/?token=private-value" },
      }),
    "INVALID_RESOLVE_INPUT",
  );
  expectError(() => extractor.extract({ brandKey: 1, input }), "INVALID_EXTRACTION_REQUEST");
  expectError(() => createIdentifierExtractor(null), "INVALID_EXTRACTION_REQUEST");
  const brokenRegistry = {
    match() {
      return [
        {
          source: "RAW",
          matchStart: 0,
          matchEnd: 100,
          candidateValue: "X",
          identifierType: "MODEL_NO",
          patternId: "X",
          registryVersion: "X",
        },
      ];
    },
  };
  expectError(
    () => createIdentifierExtractor(brokenRegistry).extract({ brandKey: "fixture-brand", input }),
    "INVALID_EXTRACTION_REQUEST",
  );
});

test("P3-03 reports bounds rather than silently scanning unbounded raw fields or candidates", () => {
  const extractor = createIdentifierExtractor(registry);
  const many = {
    ...input,
    raw: Array.from({ length: 201 }, (_, index) => `code=FX-R-${String(index).padStart(3, "0")}`),
  };
  const capped = extractor.extract({ brandKey: "fixture-brand", input: many });
  assert.equal(
    capped.candidates.filter((candidate) => candidate.evidence.source === "RAW").length,
    197,
  );
  assert.equal(capped.candidates.length, 200);
  assert.equal(capped.truncated, true);
  let deep = "code=FX-R-123";
  for (let index = 0; index < 17; index++) deep = { nested: deep };
  const deepResult = extractor.extract({
    brandKey: "fixture-brand",
    input: { ...input, raw: deep },
  });
  assert.equal(deepResult.truncated, true);
  assert.equal(
    deepResult.candidates.some((candidate) => candidate.candidateValue === "FX-R-123"),
    false,
  );
});
