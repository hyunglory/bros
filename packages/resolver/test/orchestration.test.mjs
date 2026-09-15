import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createThrottledProvider, createExternalCandidateProvider } from "../dist/index.js";

const input = {
  schemaVersion: 1,
  sourceProductPublicId: "01890f47-0c4d-7abc-8def-1234567890ab",
  productPublicId: null,
  platformCode: "FIXTURE",
  externalProductId: "1",
  productName: "fixture",
  brandName: "fixture",
  productUrl: null,
  collectedAt: "2026-09-15T00:00:00Z",
  raw: {},
  import: null,
};
const request = { brandKey: "fixture", input };

test("P3-12 cancelled throttle wait does not call provider or block subsequent runs", async () => {
  let calls = 0;
  const provider = createThrottledProvider(
    {
      providerId: "fixture",
      async search() {
        calls++;
        return { providerId: "fixture", outcome: "NOT_FOUND", candidates: [], truncated: false };
      },
    },
    40,
  );
  const first = new globalThis.AbortController();
  await provider.search(request, first.signal);
  const cancelled = new globalThis.AbortController();
  const pending = provider.search(request, cancelled.signal);
  cancelled.abort();
  await assert.rejects(pending, { name: "AbortError" });
  await provider.search(request, first.signal);
  assert.equal(calls, 2);
});

test("P3-12 external provider cancellation aborts secret/budget/transport work", async () => {
  let received;
  const provider = createExternalCandidateProvider(
    {
      providerId: "fixture",
      async search(_request, signal) {
        received = signal;
        await delay(30);
        signal.throwIfAborted();
        return { candidates: [], truncated: false };
      },
    },
    {
      timeoutMs: 1000,
      minIntervalMs: 1,
      failureThreshold: 3,
      circuitOpenMs: 100,
      rateLimitCooldownMs: 100,
      requestCostMicrousd: 1,
      maxRequestCostMicrousd: 1,
      dailyBudgetMicrousd: 2,
    },
  );
  const controller = new globalThis.AbortController();
  const running = provider.search(request, controller.signal);
  controller.abort();
  assert.equal((await running).code, "TIMEOUT");
  assert.equal(received.aborted, true);
  await delay(40);
});
