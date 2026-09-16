import assert from "node:assert/strict";
import test from "node:test";
import { normalizeBrandAliasName } from "../dist/index.js";

test("normalizes only Unicode, surrounding/repeated whitespace, and case", () => {
  assert.equal(normalizeBrandAliasName("  NIKE\u00a0Korea  "), "nike korea");
  assert.equal(normalizeBrandAliasName("나이키"), "나이키");
  assert.equal(normalizeBrandAliasName("  \t\n "), undefined);
  assert.equal(normalizeBrandAliasName(undefined), undefined);
});

test("does not erase punctuation from an alias", () => {
  assert.equal(normalizeBrandAliasName("A-C"), "a-c");
  assert.notEqual(normalizeBrandAliasName("A-C"), normalizeBrandAliasName("AC"));
});
