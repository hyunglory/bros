import assert from "node:assert/strict";
import test from "node:test";

import { runDemoBrowserHarness } from "../../packages/browser/dist/index.js";

test("deterministic demo browser flow reproduces job-to-status success", async () => {
  const result = await runDemoBrowserHarness({
    mode: "success",
    runPublicId: "018f0cb2-ef9d-7b29-a13d-9a4f00000001",
  });

  assert.deepEqual(result, {
    artifact: {
      handlerKey: "demo.browser",
      outcome: "SUCCEEDED",
      result: "COMPLETED",
      runPublicId: "018f0cb2-ef9d-7b29-a13d-9a4f00000001",
      steps: ["prepare", "authenticate", "execute", "verify", "cleanup"],
      url: "about:blank",
    },
    status: "SUCCESS",
  });
});

test("deterministic demo browser flow captures a safe artifact and failed status", async () => {
  const result = await runDemoBrowserHarness({
    mode: "failure",
    runPublicId: "018f0cb2-ef9d-7b29-a13d-9a4f00000002",
  });

  assert.deepEqual(result, {
    artifact: {
      handlerKey: "demo.browser",
      outcome: "FAILED",
      result: "REJECTED",
      runPublicId: "018f0cb2-ef9d-7b29-a13d-9a4f00000002",
      steps: ["prepare", "authenticate", "execute", "verify", "cleanup"],
      url: "about:blank",
    },
    errorCode: "FLOW_EXECUTION_FAILED",
    status: "FAILED",
  });
});
