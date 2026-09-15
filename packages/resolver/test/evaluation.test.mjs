import assert from "node:assert/strict";
import test from "node:test";
import { readFile, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { URL } from "node:url";
const structuredClone = (value) => JSON.parse(JSON.stringify(value));
import {
  evaluateResolverDataset,
  resolverHoldoutDigest,
  validateEvaluationDataset,
  ResolverEvaluationError,
} from "../dist/index.js";
const golden = JSON.parse(
  await readFile(new URL("./fixtures/golden-v1.json", import.meta.url), "utf8"),
);
const options = (data) => ({
  expectedHoldoutDigest: resolverHoldoutDigest(data),
  algorithmDigest: "a".repeat(64),
});
const evaluate = (data) => evaluateResolverDataset(data, options(data));

test("P3-14 golden Evidence replay preserves decision/conflict policy and reports denominators", () => {
  const result = evaluate(golden);
  assert.equal(result.calibrationStatus, "SYNTHETIC_ONLY");
  assert.equal(result.automaticPromotionEnabled, false);
  assert.deepEqual(
    result.rows.map((r) => [r.caseId, r.candidates.map((c) => c.recommendedDecision)]),
    [
      ["strong", ["AUTO_ACCEPTED"]],
      ["weak", ["NOT_FOUND"]],
      ["none", []],
      ["similar", ["REVIEW_REQUIRED", "REVIEW_REQUIRED"]],
      ["gtin", ["REVIEW_REQUIRED", "REVIEW_REQUIRED"]],
      ["color", ["REVIEW_REQUIRED"]],
      ["volume", ["REVIEW_REQUIRED"]],
      ["ai", ["NOT_FOUND"]],
      ["truncated", ["REVIEW_REQUIRED"]],
      ["failure", []],
      ["tuning", ["AUTO_ACCEPTED"]],
    ],
  );
  assert.deepEqual(result.rows.find((r) => r.caseId === "color").candidates[0].conflicts, [
    "CONFLICT_COLOR",
  ]);
  assert.deepEqual(result.rows.find((r) => r.caseId === "volume").candidates[0].conflicts, [
    "CONFLICT_VOLUME",
  ]);
  assert.equal(result.rows.find((r) => r.caseId === "failure").outcome, "REVIEW_REQUIRED");
  assert.equal(result.holdout.caseCount, 10);
  assert.equal(result.holdout.autoCandidateCount, 1);
  assert.equal(result.holdout.precision, 1);
  assert.equal(result.holdout.coverage, 0.1);
  assert.equal(result.holdout.falseReviewCount, 3);
  assert.equal(result.holdout.falseReviewDenominator, 4);
  assert.equal(result.holdout.costKnownCount, 9);
  assert.equal(result.holdout.recordedCostUsd, 0);
  assert.ok(result.holdout.elapsedMs >= 0);
  assert.equal(result.gates.challengeCoverage, true);
});
test("P3-14 labels never enter policy; wrong auto and AI-only auto fail closed", () => {
  const data = structuredClone(golden);
  data.sourceKind = "REAL";
  data.cases[0].truth.identifiers[0].value = "WRONG-999";
  let result = evaluate(data);
  assert.equal(result.calibrationStatus, "FAIL");
  assert.equal(result.holdout.wrongAutoCount, 1);
  assert.equal(result.rows[0].candidates[0].confidenceScore, "100.00");
  data.cases[0].truth.identifiers[0].value = "AB-123";
  data.cases[0].capture.evidenceOrigin = "AI_ONLY";
  data.cases[0].tags = ["AI_ONLY"];
  data.cases[0].truth.autoAcceptForbidden = true;
  result = evaluate(data);
  assert.equal(result.calibrationStatus, "FAIL");
  assert.equal(result.holdout.unsafeAutoCount, 1);
  // A curator's independent negative label catches missing conflict facts/detection too.
  data.cases[0].capture.evidenceOrigin = "NON_AI";
  data.cases[0].tags = ["NORMAL"];
  result = evaluate(data);
  assert.deepEqual(result.rows[0].candidates[0].conflicts, []);
  assert.equal(result.calibrationStatus, "FAIL");
  assert.equal(result.holdout.unsafeAutoCount, 1);
});
test("P3-14 MASTER, SKU and image leakage, duplicate IDs and spoofed scores are rejected", () => {
  for (const mutate of [
    (d) => {
      d.cases.at(-1).masterKey = d.cases[0].masterKey;
    },
    (d) => {
      d.cases.at(-1).skuKeys = d.cases[0].skuKeys;
    },
    (d) => {
      d.cases.at(-1).imageHashes = ["b".repeat(64)];
      d.cases[0].imageHashes = ["b".repeat(64)];
    },
    (d) => {
      d.cases[1].caseId = d.cases[0].caseId;
    },
    (d) => {
      d.cases[0].capture.collection.candidates[0].confidenceScore = "100.00";
    },
    (d) => {
      d.cases[0].truth.evidenceReference = "token=private-eval-marker";
    },
  ]) {
    const data = structuredClone(golden);
    mutate(data);
    assert.throws(() => evaluate(data), ResolverEvaluationError);
  }
});
test("P3-14 holdout seal is order stable and detects label/capture/scope edits", () => {
  const original = options(golden),
    data = structuredClone(golden);
  data.cases.reverse();
  assert.equal(resolverHoldoutDigest(data), original.expectedHoldoutDigest);
  data.cases.find((r) => r.caseId === "strong").truth.identifiers[0].value = "NEW-123";
  assert.throws(() => evaluateResolverDataset(data, original), /HOLDOUT_DIGEST_MISMATCH/);
  const tuning = structuredClone(golden);
  tuning.cases.at(-1).truth.identifiers[0].value = "TUNED-999";
  assert.equal(resolverHoldoutDigest(tuning), original.expectedHoldoutDigest);
});
test("P3-14 no predictions gives null precision, insufficient real data never passes", () => {
  const data = structuredClone(golden);
  data.sourceKind = "REAL";
  data.cases = [data.cases[2]];
  const result = evaluate(data);
  assert.equal(result.calibrationStatus, "INSUFFICIENT_DATA");
  assert.equal(result.holdout.precision, null);
  assert.equal(result.holdout.falseReviewRate, null);
});
test("P3-14 manufactured gate-boundary data checks 200 products/100 holdout autos without enabling promotion", () => {
  // This is an algorithm test of REAL gating, not a report of actual verified products.
  const data = structuredClone(golden);
  data.sourceKind = "REAL";
  for (let i = 0; i < 190; i++) {
    const item = structuredClone(golden.cases[0]);
    item.caseId = `generated-${i}`;
    item.masterKey = `generated-master-${i}`;
    item.skuKeys = [];
    item.split = i < 100 ? "HOLDOUT" : "TUNING";
    data.cases.push(item);
  }
  let result = evaluate(data);
  assert.equal(result.calibrationStatus, "PASS");
  assert.equal(result.automaticPromotionEnabled, false);
  data.scope.categories.push("missing-category");
  result = evaluate(data);
  assert.equal(result.calibrationStatus, "INSUFFICIENT_DATA");
  assert.equal(result.gates.categoryCoverage, false);
});
test("P3-14 repeated rows cannot inflate unique product minimum and invalid truth is rejected", () => {
  const data = structuredClone(golden);
  data.sourceKind = "REAL";
  for (let i = 0; i < 200; i++) {
    const item = structuredClone(golden.cases[0]);
    item.caseId = `copy-${i}`;
    data.cases.push(item);
  }
  assert.equal(evaluate(data).gates.distinctProducts, false);
  assert.equal(evaluate(data).gates.holdoutAutoProducts, false);
  data.cases[0].truth.identifiers = [{ identifierType: "GTIN", value: "bad" }];
  assert.throws(() => validateEvaluationDataset(data), /INVALID_TRUTH_IDENTIFIER/);
});
test("P3-14 CLI seals once, produces real reports, rejects changed build/holdout and never logs raw input", async () => {
  const directory = await mkdtemp(join(tmpdir(), "bros-p314-"));
  try {
    const dataset = join(directory, "dataset.json"),
      lock = join(directory, "lock.json"),
      output = join(directory, "report");
    await writeFile(dataset, JSON.stringify(golden));
    const run = (...args) =>
      spawnSync(process.execPath, [resolve("scripts/evaluate-resolver.mjs"), ...args], {
        encoding: "utf8",
        timeout: 30000,
      });
    assert.equal(run("seal", dataset, lock).status, 0);
    assert.equal(run("seal", dataset, lock).status, 1);
    assert.equal(run("evaluate", dataset, lock, output).status, 2);
    assert.equal(
      JSON.parse(await readFile(join(output, "report.json"), "utf8")).calibrationStatus,
      "SYNTHETIC_ONLY",
    );
    assert.match(await readFile(join(output, "report.md"), "utf8"), /Automatic promotion: OFF/);
    const badLock = JSON.parse(await readFile(lock, "utf8"));
    badLock.algorithmDigest = "0".repeat(64);
    await writeFile(lock, JSON.stringify(badLock));
    assert.equal(run("evaluate", dataset, lock, join(directory, "bad")).status, 1);
    await writeFile(dataset, "private-eval-secret-invalid-json");
    const failure = run("evaluate", dataset, lock, join(directory, "invalid"));
    assert.equal(failure.status, 1);
    assert.doesNotMatch(failure.stdout + failure.stderr, /private-eval-secret/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
