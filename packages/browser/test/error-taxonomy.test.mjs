import assert from "node:assert/strict";
import test from "node:test";

import {
  BrowserFlowError,
  BrowserRetryPolicyError,
  browserErrorCodes,
  createBrowserErrorMapper,
  createBrowserRetryPolicy,
} from "../dist/index.js";

test("maps typed browser failures and known provider-safe signals without exposing details", () => {
  const mapper = createBrowserErrorMapper();
  for (const code of [
    "AUTH_FAILED",
    "CAPTCHA_DETECTED",
    "TWO_FACTOR_REQUIRED",
    "ELEMENT_NOT_FOUND",
    "SUCCESS_CONDITION_NOT_MET",
  ]) {
    assert.equal(mapper.map(new BrowserFlowError(code)), code);
  }
  assert.equal(mapper.map({ name: "TimeoutError" }), "NAVIGATION_TIMEOUT");
  assert.equal(mapper.map({ code: "ECONNRESET" }), "NETWORK_ERROR");
  assert.equal(mapper.map({ name: "TargetClosedError" }), "BROWSER_CRASHED");
  assert.equal(mapper.map(new Error("secret-provider-detail")), "FLOW_LOGIC_ERROR");
  assert.equal(mapper.map({ message: "untrusted provider detail" }), "UNKNOWN_ERROR");
});

test("permits only explicitly transient failures and respects the configured retry limit", () => {
  const policy = createBrowserRetryPolicy();
  const retryable = new Set([
    "NETWORK_ERROR",
    "NAVIGATION_TIMEOUT",
    "BROWSER_CRASHED",
    "ELEMENT_NOT_FOUND",
  ]);
  for (const code of browserErrorCodes) {
    assert.equal(
      policy.decide(code, { attempt: 1, retryLimit: 1 }).automaticRetry,
      retryable.has(code),
    );
    if (!retryable.has(code)) continue;
    assert.equal(policy.decide(code, { attempt: 1, retryLimit: 0 }).automaticRetry, false);
  }
  assert.deepEqual(policy.decide("NAVIGATION_TIMEOUT", { attempt: 1, retryLimit: 0 }), {
    automaticRetry: false,
    errorCode: "NAVIGATION_TIMEOUT",
    terminalStatus: "TIMEOUT",
  });
});

test("never automatically retries authentication or security challenge failures", () => {
  const policy = createBrowserRetryPolicy();
  for (const code of [
    "AUTH_FAILED",
    "CAPTCHA_DETECTED",
    "TWO_FACTOR_REQUIRED",
    "LOGIN_REQUIRED",
    "SESSION_EXPIRED",
    "PERMISSION_DENIED",
    "FLOW_LOGIC_ERROR",
  ]) {
    assert.equal(policy.decide(code, { attempt: 1, retryLimit: 10 }).automaticRetry, false);
  }
  assert.throws(
    () => policy.decide("NETWORK_ERROR", { attempt: 0, retryLimit: 0 }),
    (error) => error instanceof BrowserRetryPolicyError,
  );
});
