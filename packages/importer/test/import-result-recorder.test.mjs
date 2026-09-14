import assert from "node:assert/strict";
import test from "node:test";
import { classifyImportPipeline, createImportResultRecorder } from "../dist/index.js";

const itemPublicId = "01890f47-0c4d-7abc-8def-1234567890ab";

function envelope({
  image = { action: "SKIPPED", reason: "NO_SOURCE_IMAGES" },
  master = { action: "CREATED", reason: "MASTER_CREATED" },
  sku = { action: "SKIPPED", reason: "NO_SOURCE_OPTIONS" },
} = {}) {
  return {
    validation: { outcome: "ACCEPTED", stage: "P2-04" },
    masterCreation: { stage: "P2-09/v1", result: master },
    skuMapping: { stage: "P2-10/v1", result: sku },
    imageRegistration: { stage: "P2-11/v1", result: image },
  };
}

test("pipeline classification keeps master success when optional inputs are absent", () => {
  assert.deepEqual(classifyImportPipeline(envelope(), itemPublicId), {
    action: "CREATED",
    itemPublicId,
    reason: "PIPELINE_SUCCEEDED",
    status: "SUCCEEDED",
  });
});

test("review outranks skip and a material downstream skip remains skipped", () => {
  assert.deepEqual(
    classifyImportPipeline(
      envelope({
        master: { action: "REVIEW_REQUIRED", reason: "NO_IDENTIFIER_MATCH" },
        sku: { action: "SKIPPED", reason: "MASTER_NOT_LINKED" },
      }),
      itemPublicId,
    ),
    {
      action: "REVIEW_REQUIRED",
      itemPublicId,
      reason: "NO_IDENTIFIER_MATCH",
      status: "REVIEW_REQUIRED",
    },
  );
  assert.equal(
    classifyImportPipeline(
      envelope({ image: { action: "SKIPPED", reason: "SOURCE_SNAPSHOT_CHANGED" } }),
      itemPublicId,
    ).status,
    "SKIPPED",
  );
});

test("rejected validation is terminal without downstream stage records", () => {
  assert.deepEqual(
    classifyImportPipeline({ validation: { outcome: "REJECTED", stage: "P2-04" } }, itemPublicId),
    {
      action: "FAILED",
      itemPublicId,
      reason: "INPUT_VALIDATION_FAILED",
      status: "FAILED",
    },
  );
});

test("missing or malformed stage evidence is rejected", () => {
  const missing = envelope();
  delete missing.imageRegistration;
  assert.throws(() => classifyImportPipeline(missing, itemPublicId), {
    code: "PIPELINE_STAGE_INCOMPLETE",
  });
  assert.throws(
    () => classifyImportPipeline(envelope({ sku: { action: "MAPPED", reason: 42 } }), itemPublicId),
    { code: "PERSISTED_STAGE_RESULT_INVALID" },
  );
});

test("invalid options, IDs, failure stages, and error codes fail before DB access", async () => {
  for (const options of [{ lockTimeoutMs: 0 }, { maxAttempts: 0 }, { maxAttempts: 6 }]) {
    assert.throws(() => createImportResultRecorder({ db: null }, options), {
      code: "INVALID_RESULT_RECORDER_OPTIONS",
    });
  }
  const recorder = createImportResultRecorder({ db: null });
  await assert.rejects(recorder.record("internal-id"), { code: "INVALID_IMPORT_ITEM_ID" });
  assert.throws(() => recorder.recordFailure(null), { code: "INVALID_PIPELINE_FAILURE" });
  assert.throws(
    () =>
      recorder.recordFailure({
        errorCode: "lower-case",
        itemPublicId,
        stage: "P2-10",
      }),
    { code: "INVALID_PIPELINE_ERROR_CODE" },
  );
  assert.throws(
    () =>
      recorder.recordFailure({
        errorCode: "SKU_STAGE_FAILED",
        itemPublicId,
        stage: "P2-99",
      }),
    { code: "INVALID_PIPELINE_FAILURE_STAGE" },
  );
});
