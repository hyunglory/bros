import assert from "node:assert/strict";
import test from "node:test";
import {
  createSkuMapper,
  normalizeSkuOptionName,
  skuOptionLockKey,
  toOptionKey,
} from "../dist/index.js";

test("SKU option key is conservative and deterministic", () => {
  assert.equal(normalizeSkuOptionName("  BLACK\u00a0 /  270  "), "black / 270");
  assert.equal(toOptionKey("Black / 270"), toOptionKey(" black\u00a0/ 270 "));
  assert.notEqual(toOptionKey("A-C"), toOptionKey("AC"));
  assert.notEqual(toOptionKey("270 / Black"), toOptionKey("Black / 270"));
  assert.equal(
    skuOptionLockKey("01890f47-0c4d-7abc-8def-1234567890ab", "v1:black / 270"),
    skuOptionLockKey("01890f47-0c4d-7abc-8def-1234567890ab", "v1:black / 270"),
  );
});

test("invalid mapper budgets and public IDs fail before DB access", async () => {
  for (const options of [{ lockTimeoutMs: 0 }, { maxAttempts: 0 }, { maxAttempts: 6 }]) {
    assert.throws(() => createSkuMapper({ db: null }, options), {
      code: "INVALID_SKU_MAPPER_OPTIONS",
    });
  }
  await assert.rejects(createSkuMapper({ db: null }).process("internal-id"), {
    code: "INVALID_IMPORT_ITEM_ID",
  });
});
