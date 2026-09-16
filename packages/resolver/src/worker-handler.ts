import { validateIdentifierResolveInput, validateResolveCandidates } from "@bros/contracts";
import type { DatabaseClient, DbTransaction } from "@bros/db";
import type { QueueJob } from "@bros/queue";
import { sql } from "kysely";
import { resolverQueueVersion, ResolverOrchestrationError } from "./batch-admission.js";
import type { ResolverPipeline } from "./pipeline.js";
import { bindResolverCapture, ResolverCaptureError } from "./capture.js";

const retryable = new Set(["RATE_LIMIT", "CIRCUIT_OPEN", "TIMEOUT", "EXTERNAL_SEARCH_FAILED"]);
const error = (code: string) => new ResolverOrchestrationError(code);

async function ownedRun(tx: DbTransaction, job: QueueJob) {
  const run = await tx
    .selectFrom("app.identifier_resolve_run")
    .selectAll()
    .where("public_id", "=", job.data.publicId)
    .forUpdate()
    .executeTakeFirst();
  if (
    !run ||
    run.queue_json.version !== resolverQueueVersion ||
    run.queue_json.provider !== job.provider ||
    run.queue_json.providerId !== job.providerId
  )
    throw error("RESOLVE_DELIVERY_MISMATCH");
  return run;
}

/** The queue attempt fences every write. No transaction is held during provider calls. */
export function createIdentifierResolveHandler(
  database: DatabaseClient,
  pipeline: ResolverPipeline,
  options: { runTimeoutMs?: number } = {},
) {
  const timeoutMs = options.runTimeoutMs ?? 120000;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 600000)
    throw error("INVALID_RESOLVE_TIMEOUT");
  return async (job: QueueJob): Promise<void> => {
    if (
      !Number.isInteger(job.attempt) ||
      job.attempt < 1 ||
      !Number.isInteger(job.retryLimit) ||
      job.retryLimit < 0
    )
      throw error("INVALID_RESOLVE_DELIVERY");
    job.signal.throwIfAborted();
    const claim = await database.transaction(async (tx) => {
      const run = await ownedRun(tx, job);
      if (["SUCCEEDED", "FAILED", "CANCELLED"].includes(run.status)) return undefined;
      if (typeof run.queue_json.attempt !== "number" || !Number.isInteger(run.queue_json.attempt))
        throw error("RESOLVE_QUEUE_STATE_INVALID");
      if (run.queue_json.attempt >= job.attempt) return undefined;
      await tx
        .updateTable("app.identifier_resolve_run")
        .set({
          status: "RUNNING",
          started_at: sql<Date>`coalesce(started_at, clock_timestamp())`,
          error_code: null,
          error_message: null,
          queue_json: JSON.stringify({
            ...run.queue_json,
            status: "RUNNING",
            attempt: job.attempt,
          }),
        })
        .where("id", "=", run.id)
        .execute();
      return run;
    });
    if (!claim) return;
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    job.signal.addEventListener("abort", onAbort, { once: true });
    if (job.signal.aborted) onAbort();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let abortListener: (() => void) | undefined;
    try {
      if (claim.resolver_version !== pipeline.version) throw error("RESOLVER_VERSION_MISMATCH");
      const input = validateIdentifierResolveInput(claim.input_json);
      if (!input.ok) throw error("INVALID_SOURCE_DATA");
      const deadline = new Promise<never>((_resolve, reject) => {
        abortListener = () => reject(error("TIMEOUT"));
        controller.signal.addEventListener("abort", abortListener, { once: true });
        timer = setTimeout(() => controller.abort(), timeoutMs);
        if (controller.signal.aborted) abortListener();
      });
      const { executionCapture, ...result } = structuredClone(
        await Promise.race([
          pipeline.resolve(structuredClone(input.value), controller.signal),
          deadline,
        ]),
      );
      controller.signal.throwIfAborted();
      const transient = result.providerFailures.find((failure) => retryable.has(failure.code));
      if (transient && job.attempt <= job.retryLimit) throw error(transient.code);
      const candidates = result.candidates.map((candidate) => ({
        identifierType: candidate.identifierType,
        candidateValue: candidate.candidateValue,
        candidateNorm: candidate.candidateNorm,
        confidenceScore: candidate.confidenceScore,
        rankNo: candidate.rankNo,
        evidence: candidate.evidence,
        conflicts: candidate.conflicts,
      }));
      if (!validateResolveCandidates(candidates).ok) throw error("INVALID_RESOLVE_RESULT");
      if (pipeline.captureRequired && executionCapture === undefined)
        throw error("INVALID_RESOLVER_CAPTURE");
      const capture =
        executionCapture === undefined
          ? undefined
          : bindResolverCapture(executionCapture, {
              runPublicId: claim.public_id,
              sourceProductPublicId: input.value.sourceProductPublicId,
              attempt: job.attempt,
              input: claim.input_json,
              resolverVersion: pipeline.version,
              decision: result,
            });
      await database.transaction(async (tx) => {
        const run = await ownedRun(tx, job);
        if (run.status !== "RUNNING" || run.queue_json.attempt !== job.attempt) return;
        controller.signal.throwIfAborted();
        if (candidates.length > 0)
          await tx
            .insertInto("app.identifier_candidate")
            .values(
              candidates.map((candidate) => ({
                resolve_run_id: run.id,
                identifier_type: candidate.identifierType,
                candidate_value: candidate.candidateValue,
                candidate_norm: candidate.candidateNorm,
                confidence_score: candidate.confidenceScore,
                rank_no: candidate.rankNo,
                evidence_json: JSON.stringify(candidate.evidence),
                conflict_json: JSON.stringify(candidate.conflicts),
                decision_status: "CANDIDATE" as const,
              })),
            )
            .execute();
        await tx
          .updateTable("app.identifier_resolve_run")
          .set({
            status: "SUCCEEDED",
            finished_at: sql<Date>`clock_timestamp()`,
            result_json: JSON.stringify({
              ...result,
              automaticPromotionEnabled: false,
              ...(capture === undefined ? {} : { executionCapture: capture }),
            }),
            queue_json: JSON.stringify({ ...run.queue_json, status: "SUCCESS" }),
          })
          .where("id", "=", run.id)
          .execute();
      });
    } catch (cause) {
      const code =
        cause instanceof ResolverOrchestrationError || cause instanceof ResolverCaptureError
          ? cause.code
          : controller.signal.aborted
            ? "TIMEOUT"
            : "RESOLVER_FAILED";
      const final =
        job.attempt > job.retryLimit ||
        [
          "RESOLVER_VERSION_MISMATCH",
          "INVALID_SOURCE_DATA",
          "INVALID_RESOLVE_RESULT",
          "INVALID_RESOLVER_CAPTURE",
        ].includes(code);
      await database
        .transaction(async (tx) => {
          const run = await ownedRun(tx, job);
          if (run.status !== "RUNNING" || run.queue_json.attempt !== job.attempt) return;
          await tx
            .updateTable("app.identifier_resolve_run")
            .set({
              status: final ? "FAILED" : "QUEUED",
              error_code: code,
              error_message: "Identifier resolution did not complete",
              finished_at: final ? sql<Date>`clock_timestamp()` : null,
              queue_json: JSON.stringify({
                ...run.queue_json,
                status: final ? "FAILED" : "RETRY_WAIT",
              }),
            })
            .where("id", "=", run.id)
            .execute();
        })
        .catch(() => {
          /* A DB outage is retried by the durable queue; never expose the driver error. */
        });
      throw error(code);
    } finally {
      if (timer) clearTimeout(timer);
      job.signal.removeEventListener("abort", onAbort);
      if (abortListener) controller.signal.removeEventListener("abort", abortListener);
      controller.abort();
    }
  };
}
