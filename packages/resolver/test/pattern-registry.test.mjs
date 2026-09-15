import assert from "node:assert/strict";
import test from "node:test";
import { createIdentifierPatternRegistry, PatternRegistryError } from "../dist/index.js";

const registryDefinition = {
  version: "pattern-fixture-v1",
  patterns: [
    {
      id: "FIXTURE_MODEL_TITLE_V1",
      brandKey: "fixture-brand",
      identifierType: "MODEL_NO",
      source: "TITLE",
      regex: "\\b(?<identifier>FX-[A-Z]{2}-[0-9]{4})\\b",
    },
    {
      id: "FIXTURE_STYLE_RAW_V1",
      brandKey: "fixture-brand",
      identifierType: "STYLE_CODE",
      source: "RAW",
      regex: "style[=: ]+(?<identifier>[A-Z]{2}[0-9]{3})",
    },
    {
      id: "OTHER_URL_V1",
      brandKey: "other-brand",
      identifierType: "PRODUCT_NO",
      source: "URL",
      regex: "/products/(?<identifier>[A-Z0-9]{6})",
    },
  ],
};

function expectError(callback, code) {
  assert.throws(callback, (error) => error instanceof PatternRegistryError && error.code === code);
}

test("P3-02 matches only the configured brand/source and maps the configured identifier type", () => {
  const registry = createIdentifierPatternRegistry(registryDefinition);
  const [model] = registry.match("fixture-brand", "TITLE", "New FX-AB-1234 sneaker");
  assert.deepEqual(model, {
    brandKey: "fixture-brand",
    candidateValue: "FX-AB-1234",
    identifierType: "MODEL_NO",
    matchStart: 4,
    matchEnd: 14,
    patternId: "FIXTURE_MODEL_TITLE_V1",
    registryVersion: "pattern-fixture-v1",
    source: "TITLE",
  });
  const [style] = registry.match("fixture-brand", "RAW", "style=AB123");
  assert.equal(style.identifierType, "STYLE_CODE");
  assert.equal(style.candidateValue, "AB123");
  assert.equal(Object.isFrozen(style), true);
  assert.deepEqual(registry.match("other-brand", "URL", "https://x.test/products/ABC123"), [
    {
      brandKey: "other-brand",
      candidateValue: "ABC123",
      identifierType: "PRODUCT_NO",
      matchStart: 14,
      matchEnd: 30,
      patternId: "OTHER_URL_V1",
      registryVersion: "pattern-fixture-v1",
      source: "URL",
    },
  ]);
});

test("P3-02 negative fixtures do not cross brand, source, boundary, or case policy", () => {
  const registry = createIdentifierPatternRegistry(registryDefinition);
  for (const [brand, source, value] of [
    ["unknown-brand", "TITLE", "FX-AB-1234"],
    ["fixture-brand", "RAW", "FX-AB-1234"],
    ["fixture-brand", "TITLE", "prefixFX-AB-1234"],
    ["fixture-brand", "TITLE", "fx-ab-1234"],
    [null, "TITLE", "FX-AB-1234"],
    ["fixture-brand", "TITLE", "FX-AB-123"],
  ]) {
    assert.deepEqual(registry.match(brand, source, value), []);
  }
  assert.deepEqual(registry.match("fixture-brand", "TITLE", "a".repeat(16_385)), []);
  assert.equal(Object.isFrozen(registry.match("fixture-brand", "TITLE", "none")), true);
});

test("P3-02 requires an explicit version, valid type mapping, named candidate capture, and unique IDs", () => {
  expectError(
    () => createIdentifierPatternRegistry({ ...registryDefinition, version: " " }),
    "INVALID_PATTERN_REGISTRY",
  );
  expectError(
    () =>
      createIdentifierPatternRegistry({
        ...registryDefinition,
        patterns: [{ ...registryDefinition.patterns[0], identifierType: "UNKNOWN" }],
      }),
    "INVALID_PATTERN_REGISTRY",
  );
  expectError(
    () =>
      createIdentifierPatternRegistry({
        ...registryDefinition,
        patterns: [registryDefinition.patterns[0], registryDefinition.patterns[0]],
      }),
    "DUPLICATE_PATTERN_ID",
  );
  for (const regex of [
    "FX-[A-Z]+",
    "(?<value>FX-[A-Z]+)",
    "(?<identifier>FX-[A-Z]+)(?<other>[0-9]+)",
  ]) {
    expectError(
      () =>
        createIdentifierPatternRegistry({
          ...registryDefinition,
          patterns: [{ ...registryDefinition.patterns[0], regex }],
        }),
      "UNSAFE_PATTERN_REGEX",
    );
  }
});

test("P3-02 rejects regex features that make matching non-deterministic or risk pathological runtime", () => {
  for (const regex of [
    "(?<identifier>(A+)+)",
    "(?<identifier>(A|AA)+)",
    "(?<identifier>A+)\\1",
    "(?<identifier>A+)(?=B)",
    "(?<=A)(?<identifier>B+)",
    "(?<identifier>[A-Z]{2,8}",
  ]) {
    expectError(
      () =>
        createIdentifierPatternRegistry({
          ...registryDefinition,
          patterns: [{ ...registryDefinition.patterns[0], regex }],
        }),
      "UNSAFE_PATTERN_REGEX",
    );
  }
});

test("P3-02 registry is an immutable versioned snapshot", () => {
  const mutable = JSON.parse(JSON.stringify(registryDefinition));
  const v1 = createIdentifierPatternRegistry(mutable);
  mutable.version = "pattern-fixture-v2";
  mutable.patterns[0].regex = "(?<identifier>CHANGED)";
  assert.equal(v1.version, "pattern-fixture-v1");
  assert.equal(
    v1.match("fixture-brand", "TITLE", "FX-AB-1234")[0].registryVersion,
    "pattern-fixture-v1",
  );
  assert.deepEqual(v1.match("fixture-brand", "TITLE", "CHANGED"), []);
  const v2 = createIdentifierPatternRegistry({
    ...registryDefinition,
    version: "pattern-fixture-v2",
  });
  assert.equal(v2.version, "pattern-fixture-v2");
  assert.equal(v1.version, "pattern-fixture-v1");
  assert.equal("decisionStatus" in v2.match("fixture-brand", "TITLE", "FX-AB-1234")[0], false);
});
