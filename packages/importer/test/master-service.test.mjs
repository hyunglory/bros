import assert from "node:assert/strict";
import test from "node:test";
import { createMasterService, masterIdentityLockKeys } from "../dist/index.js";

test("identity lock protocol shares GTIN labels, preserves typed models and ignores brand codes", () => {
  const gtin = masterIdentityLockKeys([{ type: "GTIN", normalizedValue: "012345678905" }]);
  assert.deepEqual(
    masterIdentityLockKeys([
      { type: "UPC", normalizedValue: "012345678905" },
      { type: "EAN", normalizedValue: "012345678905" },
      { type: "BRAND_CODE", normalizedValue: "brand" },
    ]),
    gtin,
  );
  assert.notDeepEqual(
    masterIdentityLockKeys([{ type: "MPN", normalizedValue: "A" }]),
    masterIdentityLockKeys([{ type: "MODEL_NO", normalizedValue: "A" }]),
  );
  const ids = [
    { type: "MODEL_NO", normalizedValue: "B" },
    { type: "MODEL_NO", normalizedValue: "A" },
  ];
  assert.deepEqual(masterIdentityLockKeys(ids), masterIdentityLockKeys([...ids].reverse()));
});

test("invalid lock budgets and public IDs fail before DB access", async () => {
  for (const options of [
    { lockTimeoutMs: 0 },
    { lockTimeoutMs: NaN },
    { maxAttempts: 0 },
    { maxAttempts: 6 },
  ]) {
    assert.throws(() => createMasterService({ db: null }, options), {
      code: "INVALID_MASTER_SERVICE_OPTIONS",
    });
  }
  await assert.rejects(createMasterService({ db: null }).process("internal-id"), {
    code: "INVALID_IMPORT_ITEM_ID",
  });
});
