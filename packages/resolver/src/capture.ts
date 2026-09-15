import {
  isResolverPipelineCapture,
  isStoredResolverCapture,
  validateSourceRawJson,
  type ResolverPipelineCapture,
  type StoredResolverCapture,
} from "@bros/contracts";
import { maskSensitiveText } from "@bros/core";
import type { DatabaseClient } from "@bros/db";
import { evaluationDigest } from "./evaluation.js";
import { createCandidateNormalizer } from "./candidate-normalizer.js";
import { createCandidateScorer } from "./candidate-scorer.js";
import { createHardConflictDetector } from "./hard-conflict-detector.js";
import { createDecisionEngine } from "./decision-engine.js";
import type { EvidenceCollection } from "./evidence-collector.js";

export class ResolverCaptureError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ResolverCaptureError";
  }
}
const fail = (code = "INVALID_RESOLVER_CAPTURE"): never => {
  throw new ResolverCaptureError(code);
};
function safeText(value: unknown): boolean {
  if (typeof value === "string") return maskSensitiveText(value) === value;
  if (Array.isArray(value)) return value.every(safeText);
  return value !== null && typeof value === "object" ? Object.values(value).every(safeText) : true;
}
export function validatePipelineCapture(value: unknown): ResolverPipelineCapture {
  if (!isResolverPipelineCapture(value) || !validateSourceRawJson(value).ok || !safeText(value))
    return fail();
  if (
    !Number.isFinite(Date.parse(value.startedAt)) ||
    !Number.isFinite(Date.parse(value.finishedAt))
  )
    return fail();
  return structuredClone(value);
}
/** Called at the worker boundary, before the transaction. Never reconstruct collection from decisions. */
export function bindResolverCapture(
  value: unknown,
  context: {
    runPublicId: string;
    sourceProductPublicId: string;
    attempt: number;
    input: unknown;
    resolverVersion: string;
    decision: unknown;
  },
): StoredResolverCapture {
  const payload = validatePipelineCapture(value);
  if (
    payload.inputDigest !== evaluationDigest(context.input) ||
    payload.capture.resolverVersion !== context.resolverVersion ||
    payload.decisionDigest !== evaluationDigest(context.decision)
  )
    return fail();
  // Verify that the exact saved pre-normalization input produced the returned decision.
  try {
    const replay = createDecisionEngine().decide(
      createHardConflictDetector().detect(
        createCandidateScorer().score(
          createCandidateNormalizer().normalize(payload.capture.collection as EvidenceCollection),
        ),
        payload.capture.conflictContext,
      ),
    );
    if (evaluationDigest(replay) !== payload.decisionDigest) return fail();
  } catch {
    return fail();
  }
  payload.capture.reference = `resolve-run:${context.runPublicId}:attempt:${context.attempt}`;
  const stored = {
    schemaVersion: 1,
    runPublicId: context.runPublicId,
    sourceProductPublicId: context.sourceProductPublicId,
    attempt: context.attempt,
    payloadDigest: evaluationDigest(payload),
    payload,
  };
  if (!isStoredResolverCapture(stored)) return fail();
  return stored;
}

/** Privileged read-only export. Public review DTOs must not include this envelope. */
export function createResolverCaptureExporter(database: DatabaseClient) {
  return {
    async export(publicId: string) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(publicId))
        return fail("INVALID_CAPTURE_RUN_ID");
      const run = await database.db
        .selectFrom("app.identifier_resolve_run")
        .select([
          "public_id",
          "status",
          "input_json",
          "result_json",
          "resolver_version",
          "queue_json",
        ])
        .where("public_id", "=", publicId.toLowerCase())
        .executeTakeFirst();
      if (!run) return fail("CAPTURE_RUN_NOT_FOUND");
      if (run.status !== "SUCCEEDED") return fail("CAPTURE_RUN_NOT_SUCCEEDED");
      const { executionCapture, automaticPromotionEnabled, ...decision } = run.result_json;
      if (executionCapture === undefined) return fail("CAPTURE_UNAVAILABLE");
      if (!isStoredResolverCapture(executionCapture) || automaticPromotionEnabled !== false)
        return fail();
      const saved = executionCapture;
      if (
        saved.runPublicId !== run.public_id ||
        saved.sourceProductPublicId !== run.input_json.sourceProductPublicId ||
        saved.attempt !== run.queue_json.attempt ||
        saved.payloadDigest !== evaluationDigest(saved.payload)
      )
        return fail();
      // Export validates stored bindings/digests, without running today's algorithm against an old capture.
      const payload = validatePipelineCapture(saved.payload);
      if (
        payload.inputDigest !== evaluationDigest(run.input_json) ||
        payload.capture.resolverVersion !== run.resolver_version ||
        payload.decisionDigest !== evaluationDigest(decision) ||
        payload.capture.reference !== `resolve-run:${run.public_id}:attempt:${saved.attempt}`
      )
        return fail();
      return {
        schemaVersion: 1 as const,
        captureDigest: evaluationDigest(saved),
        execution: structuredClone(saved),
      };
    },
  };
}
