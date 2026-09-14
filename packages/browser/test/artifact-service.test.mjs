import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import test from "node:test";

import { BrowserArtifactServiceError, createBrowserArtifactService } from "../dist/index.js";

const runPublicId = "018f0cb2-ef9d-7b29-a13d-9a4f00000001";
const createdAt = new Date("2026-09-14T01:02:03.000Z");

function createStorage(overrides = {}) {
  const objects = new Map();
  const signed = [];
  return {
    objects,
    signed,
    storage: {
      bucket: "private",
      provider: "LOCAL",
      async deleteObject(key) {
        objects.delete(key);
      },
      async getObject(key) {
        return objects.get(key);
      },
      async getSignedUrl(key, expiresInSeconds) {
        signed.push({ expiresInSeconds, key });
        return `signed:${key}:${expiresInSeconds}`;
      },
      async putObject({ body, key }) {
        const bytes = body instanceof Uint8Array ? body : new Uint8Array();
        objects.set(key, bytes);
        return { bucket: "private", objectKey: key, provider: "LOCAL", size: bytes.byteLength };
      },
      ...overrides,
    },
  };
}

test("stores standard screenshots, trace, and retention metadata under one run prefix", async () => {
  const fixture = createStorage();
  const service = createBrowserArtifactService({ storage: fixture.storage });
  const run = service.createRun({ createdAt, runPublicId });
  const page = { screenshot: async () => new Uint8Array([1, 2, 3]) };

  const artifacts = [
    await run.captureScreenshot("start", page),
    await run.captureScreenshot("failure", page),
    await run.captureScreenshot("final", page),
    await run.writeTrace(new Uint8Array([4, 5])),
    await run.writeResult({
      currentStep: "verify",
      currentUrl: "about:blank",
      errorCode: null,
      status: "SUCCESS",
    }),
  ];

  assert.deepEqual(
    artifacts.map((artifact) => artifact.objectKey),
    ["start.png", "failure.png", "final.png", "trace.zip", "result.json"].map(
      (name) => `automation/2026/09/14/${runPublicId}/${name}`,
    ),
  );
  assert.equal(
    artifacts.every((artifact) => artifact.retainUntil === "2026-09-28T01:02:03.000Z"),
    true,
  );
});

test("masks secret fields, credentials, authorization, and signed query values in result.json", async () => {
  const fixture = createStorage();
  const service = createBrowserArtifactService({ storage: fixture.storage });
  await service.createRun({ createdAt, runPublicId }).writeResult({
    currentStep: "password=hunter2",
    currentUrl: "https://user:db-pass@example.test/a?x-amz-signature=signed-value",
    errorCode: "AUTH_FAILED",
    result: {
      authorization: "Bearer access-value",
      nested: {
        clientSecret: "client-secret-value",
        cookie: "session-value",
        note: "token=plain-value",
        session_token: "session-token-value",
      },
    },
    status: "FAILED",
  });

  const key = `automation/2026/09/14/${runPublicId}/result.json`;
  const serialized = Buffer.from(fixture.objects.get(key)).toString();
  for (const secret of [
    "hunter2",
    "db-pass",
    "signed-value",
    "access-value",
    "client-secret-value",
    "session-value",
    "session-token-value",
    "plain-value",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(secret));
  }
  assert.match(serialized, /\[REDACTED\]/);
});

test("rejects incomplete or contradictory result metadata before upload", async () => {
  const fixture = createStorage();
  const run = createBrowserArtifactService({ storage: fixture.storage }).createRun({
    createdAt,
    runPublicId,
  });

  for (const result of [
    { currentStep: null, currentUrl: "about:blank", errorCode: "AUTH_FAILED", status: "FAILED" },
    { currentStep: "verify", currentUrl: "", errorCode: "AUTH_FAILED", status: "FAILED" },
    { currentStep: "verify", currentUrl: "about:blank", errorCode: null, status: "FAILED" },
    {
      currentStep: "verify",
      currentUrl: "about:blank",
      errorCode: "AUTH_FAILED",
      status: "SUCCESS",
    },
    {
      currentStep: "verify",
      currentUrl: "about:blank",
      errorCode: "AUTH_FAILED",
      result: [],
      status: "FAILED",
    },
  ]) {
    await assert.rejects(run.writeResult(result), {
      code: "INVALID_ARTIFACT_REQUEST",
    });
  }
  assert.equal(fixture.objects.size, 0);
});

test("fails closed before signing when preview authorization is absent or denied", async () => {
  const fixture = createStorage();
  const objectKey = `automation/2026/09/14/${runPublicId}/failure.png`;
  const absent = createBrowserArtifactService({ storage: fixture.storage });
  await assert.rejects(
    absent.getAuthorizedPreviewUrl({ actor: { id: "admin" }, objectKey }),
    (error) =>
      error instanceof BrowserArtifactServiceError && error.code === "ARTIFACT_ACCESS_DENIED",
  );
  const denied = createBrowserArtifactService({
    authorization: { authorize: async () => false },
    storage: fixture.storage,
  });
  await assert.rejects(
    denied.getAuthorizedPreviewUrl({ actor: { id: "admin" }, objectKey }),
    (error) =>
      error instanceof BrowserArtifactServiceError && error.code === "ARTIFACT_ACCESS_DENIED",
  );
  assert.deepEqual(fixture.signed, []);
});

test("issues only authorized five-minute-or-shorter signed previews", async () => {
  const fixture = createStorage();
  const objectKey = `automation/2026/09/14/${runPublicId}/failure.png`;
  const service = createBrowserArtifactService({
    authorization: { authorize: async () => true },
    storage: fixture.storage,
  });

  assert.equal(
    await service.getAuthorizedPreviewUrl({ actor: { id: "admin" }, objectKey }),
    `signed:${objectKey}:300`,
  );
  await assert.rejects(
    service.getAuthorizedPreviewUrl({ actor: { id: "admin" }, expiresInSeconds: 301, objectKey }),
    (error) =>
      error instanceof BrowserArtifactServiceError && error.code === "INVALID_ARTIFACT_REQUEST",
  );
  assert.deepEqual(fixture.signed, [{ expiresInSeconds: 300, key: objectKey }]);
});

test("converts capture, upload, and signed preview failures to safe service codes", async () => {
  const upload = createStorage({
    getSignedUrl: async () => Promise.reject(new Error("signed-private")),
    putObject: async () => Promise.reject(new Error("private-root")),
  });
  const service = createBrowserArtifactService({
    authorization: { authorize: async () => true },
    storage: upload.storage,
  });
  const run = service.createRun({ createdAt, runPublicId });
  await assert.rejects(
    run.captureScreenshot("failure", { screenshot: async () => new Uint8Array([1]) }),
    (error) =>
      error instanceof BrowserArtifactServiceError && error.code === "ARTIFACT_UPLOAD_FAILED",
  );
  await assert.rejects(
    run.captureScreenshot("failure", { screenshot: async () => Promise.reject(new Error("dom")) }),
    (error) =>
      error instanceof BrowserArtifactServiceError && error.code === "ARTIFACT_CAPTURE_FAILED",
  );
  await assert.rejects(
    service.getAuthorizedPreviewUrl({
      actor: { id: "admin" },
      objectKey: `automation/2026/09/14/${runPublicId}/failure.png`,
    }),
    (error) => {
      assert.equal(error instanceof BrowserArtifactServiceError, true);
      assert.equal(error.code, "ARTIFACT_PREVIEW_FAILED");
      assert.doesNotMatch(error.message, /private-root|dom|signed-private/);
      return true;
    },
  );
});
