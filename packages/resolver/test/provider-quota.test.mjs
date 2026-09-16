import assert from "node:assert/strict";
import test from "node:test";
import {
  createPostgresProviderQuota,
  createBraveSearchProvider,
  createIdentifierPatternRegistry,
} from "../dist/index.js";

const policy = {
  providerKey: "brave",
  providerId: "brave-web-search-v1",
  accountKey: "fixture-account",
  ownerId: "worker-1",
  dailyBudgetMicrousd: 100,
  requestCostMicrousd: 10,
  minIntervalMs: 20,
  rateLimitCooldownMs: 50,
};
test("shared quota rejects invalid policy and request mismatch before accessing DB", async () => {
  for (const patch of [
    { accountKey: "token=private" },
    { ownerId: "" },
    { requestCostMicrousd: 101 },
    { dailyBudgetMicrousd: Number.MAX_SAFE_INTEGER + 1 },
    { minIntervalMs: 0 },
    { rateLimitCooldownMs: Number.NaN },
  ]) {
    assert.throws(() => createPostgresProviderQuota(null, { ...policy, ...patch }), {
      code: "INVALID_QUOTA_POLICY",
    });
  }
  const quota = createPostgresProviderQuota(null, policy);
  await assert.rejects(
    quota.execute({ providerId: "other" }, () => assert.fail()),
    { code: "PROVIDER_NOT_CONFIGURED" },
  );
  await assert.rejects(
    quota.recoverAbandoned({ reservationId: "invalid", actor: "test", reason: "test" }),
    { code: "INVALID_QUOTA_RECOVERY" },
  );
});
test("live provider requires shared rate admission, not only a durable budget marker", async () => {
  let calls = 0;
  const provider = createBraveSearchProvider({
    registry: createIdentifierPatternRegistry({ version: "fixture/v1", patterns: [] }),
    mode: "live",
    termsApproved: true,
    storageRightsApproved: true,
    policy: {
      ...policy,
      maxRequestCostMicrousd: 10,
      timeoutMs: 100,
      failureThreshold: 2,
      circuitOpenMs: 100,
    },
    secretProvider: {
      async get() {
        calls++;
        return "fixture-key";
      },
    },
    budget: {
      scope: "SHARED_DURABLE",
      async reserve() {
        calls++;
        return true;
      },
    },
  });
  assert.equal((await provider.search({})).code, "PROVIDER_NOT_CONFIGURED");
  assert.equal(calls, 0);
});
