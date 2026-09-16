import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { URL } from "node:url";
import {
  bindResolverCapture,
  validatePipelineCapture,
  createResolverCaptureExporter,
  evaluationDigest,
  createCandidateNormalizer,
  createCandidateScorer,
  createHardConflictDetector,
  createDecisionEngine,
} from "../dist/index.js";

const golden = JSON.parse(
  await readFile(new URL("./fixtures/golden-v1.json", import.meta.url), "utf8"),
);
const runId = "01890f47-0c4d-7abc-8def-1234567890ab";
const sourceId = "01890f47-0c4d-7abc-8def-1234567890ac";
function fixture() {
  const capture = globalThis.structuredClone(golden.cases[0].capture);
  const decision = createDecisionEngine().decide(
    createHardConflictDetector().detect(
      createCandidateScorer().score(createCandidateNormalizer().normalize(capture.collection)),
      capture.conflictContext,
    ),
  );
  const input = { sourceProductPublicId: sourceId, raw: { model: "AB-123" } };
  const payload = {
    schemaVersion: 1,
    sourceKind: "SYNTHETIC",
    startedAt: "2026-09-15T00:00:00.000Z",
    finishedAt: "2026-09-15T00:00:00.010Z",
    inputDigest: evaluationDigest(input),
    decisionDigest: evaluationDigest(decision),
    providerAttempted: true,
    costScope: "COMPLETED_ATTEMPT_ONLY",
    capture,
  };
  const context = {
    runPublicId: runId,
    sourceProductPublicId: sourceId,
    attempt: 2,
    input,
    resolverVersion: capture.resolverVersion,
    decision,
  };
  return { payload, context };
}
test("capture binds raw replay to input/version/decision and snapshots before caller mutation", () => {
  const { payload, context } = fixture();
  const saved = bindResolverCapture(payload, context);
  assert.equal(saved.payload.capture.reference, `resolve-run:${runId}:attempt:2`);
  assert.equal(saved.payloadDigest, evaluationDigest(saved.payload));
  assert.deepEqual(saved.payload.capture.collection, payload.capture.collection);
  payload.capture.collection.candidates.length = 0;
  assert.notDeepEqual(saved.payload.capture.collection, payload.capture.collection);
  assert.equal(saved.payload.sourceKind, "SYNTHETIC");
});
test("capture refuses mismatch, replay tampering, secret text, extra truth, invalid cost", () => {
  for (const mutate of [
    (p) => {
      p.inputDigest = "0".repeat(64);
    },
    (p) => {
      p.decisionDigest = "0".repeat(64);
    },
    (p) => {
      p.capture.resolverVersion = "other/v1";
    },
    (p) => {
      p.capture.collection.candidates = [];
    },
    (p) => {
      p.capture.reference = "token=private-capture-marker";
    },
    (p) => {
      p.truth = { value: "invented" };
    },
    (p) => {
      p.capture.costUsd = -1;
    },
    (p) => {
      p.capture.costUsd = Number.NaN;
    },
  ]) {
    const { payload, context } = fixture();
    mutate(payload);
    assert.throws(() => bindResolverCapture(payload, context), {
      code: "INVALID_RESOLVER_CAPTURE",
    });
  }
});
test("capture preserves unknown costs and unclassified provenance", () => {
  const { payload } = fixture();
  payload.capture.costUsd = null;
  payload.sourceKind = "UNCLASSIFIED";
  assert.equal(validatePipelineCapture(payload).capture.costUsd, null);
  assert.equal(validatePipelineCapture(payload).sourceKind, "UNCLASSIFIED");
});
test("export validates immutable stored bindings without today's replay and rejects missing/modified captures", async () => {
  const { payload, context } = fixture();
  const saved = bindResolverCapture(payload, context);
  let row = {
    public_id: runId,
    status: "SUCCEEDED",
    input_json: context.input,
    resolver_version: context.resolverVersion,
    queue_json: { attempt: 2 },
    result_json: { ...context.decision, automaticPromotionEnabled: false, executionCapture: saved },
  };
  const query = {
    select() {
      return this;
    },
    where() {
      return this;
    },
    async executeTakeFirst() {
      return row;
    },
  };
  const exporter = createResolverCaptureExporter({
    db: {
      selectFrom() {
        return query;
      },
    },
  });
  const first = await exporter.export(runId);
  assert.deepEqual(first, await exporter.export(runId.toUpperCase()));
  assert.equal(first.captureDigest, evaluationDigest(saved));
  assert.equal("input_json" in first, false);
  const original = globalThis.structuredClone(row);
  for (const mutate of [
    (r) => {
      r.queue_json.attempt = 3;
    },
    (r) => {
      r.input_json.raw.model = "different";
    },
    (r) => {
      r.result_json.executionCapture.payload.capture.costUsd = 99;
    },
    (r) => {
      r.result_json.executionCapture.runPublicId = sourceId;
    },
    (r) => {
      r.result_json.outcome = "tampered";
    },
  ]) {
    row = globalThis.structuredClone(original);
    mutate(row);
    await assert.rejects(exporter.export(runId), { code: "INVALID_RESOLVER_CAPTURE" });
  }
  row = globalThis.structuredClone(original);
  delete row.result_json.executionCapture;
  await assert.rejects(exporter.export(runId), { code: "CAPTURE_UNAVAILABLE" });
  row.status = "RUNNING";
  await assert.rejects(exporter.export(runId), { code: "CAPTURE_RUN_NOT_SUCCEEDED" });
  row = undefined;
  await assert.rejects(exporter.export(runId), { code: "CAPTURE_RUN_NOT_FOUND" });
  await assert.rejects(exporter.export("not-uuid"), { code: "INVALID_CAPTURE_RUN_ID" });
});
