import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  createBrowserArtifactService,
  runDemoBrowserHarness,
  runDurableDemoBrowserHarness,
} from "../../packages/browser/dist/index.js";
import { createLocalObjectStorage } from "../../packages/storage/dist/index.js";

async function objectBytes(storage, key) {
  const reader = (await storage.getObject(key)).getReader();
  const chunks = [];
  let size = 0;
  try {
    for (;;) {
      const next = await reader.read();
      if (next.done) break;
      chunks.push(next.value);
      size += next.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

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
    errorCode: "FLOW_LOGIC_ERROR",
    status: "FAILED",
  });
});

test("durable demo browser flow stores start/final evidence, trace, and redacted result", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "bros-demo-artifact-"));
  const storage = createLocalObjectStorage({ root });
  t.after(() => rm(root, { force: true, recursive: true }));
  const result = await runDurableDemoBrowserHarness({
    artifactService: createBrowserArtifactService({ storage }),
    mode: "success",
    runPublicId: "018f0cb2-ef9d-7b29-a13d-9a4f00000003",
  });

  assert.equal(result.status, "SUCCESS");
  assert.match(result.screenshotKey, /final\.png$/);
  assert.match(result.traceKey, /trace\.zip$/);
  assert.match(result.resultKey, /result\.json$/);
  const finalImage = await objectBytes(storage, result.screenshotKey);
  const trace = await objectBytes(storage, result.traceKey);
  assert.deepEqual(finalImage.slice(0, 8), Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]));
  assert.deepEqual(trace.slice(0, 2), Uint8Array.from([80, 75]));
});
