import { publicIdPattern, validateCreateResolveRun, validateSourceRawJson } from "@bros/contracts";
import type { DatabaseClient } from "@bros/db";
import { queueTransaction, type QueuePort } from "@bros/queue";
import { sql } from "kysely";
import { isDeepStrictEqual } from "node:util";
import { createResolveRunInTransaction, ResolveRunError } from "./run-service.js";

export const resolverQueueVersion = "P3-12/v1";
export class ResolverOrchestrationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ResolverOrchestrationError";
  }
}
export interface ResolveBatchRequest {
  requestPublicId: string;
  sourceProductPublicIds: readonly string[];
  resolverVersion: string;
}
export interface ResolveAdmissionResult {
  sourceProductPublicId: string;
  disposition: "ACCEPTED" | "REPLAYED" | "ERROR";
  publicId?: string;
  code?: string;
}

/** One durable job per source. A failed item never rolls back earlier admissions.
 * Re-submit the same request UUID to recover after a partial enqueue or process exit.
 */
export async function enqueueResolveBatch(
  database: DatabaseClient,
  queue: QueuePort,
  value: ResolveBatchRequest,
  options: {
    chunkSize?: number;
    maxQueuedRuns?: number;
    reviewAudit?: { actor: string; originRunPublicId: string };
  } = {},
) {
  const chunkSize = options.chunkSize ?? 100;
  const maxQueuedRuns = options.maxQueuedRuns ?? 1000;
  const uuid = new RegExp(publicIdPattern);
  const reviewAudit = options.reviewAudit ? structuredClone(options.reviewAudit) : null;
  if (
    reviewAudit &&
    (typeof reviewAudit.actor !== "string" ||
      !reviewAudit.actor.trim() ||
      reviewAudit.actor.length > 128 ||
      !uuid.test(reviewAudit.originRunPublicId) ||
      !validateSourceRawJson(reviewAudit).ok)
  )
    throw new ResolverOrchestrationError("INVALID_RESOLVE_BATCH");
  if (
    !value ||
    !uuid.test(value.requestPublicId) ||
    !Array.isArray(value.sourceProductPublicIds) ||
    value.sourceProductPublicIds.length === 0 ||
    value.sourceProductPublicIds.length > 10000 ||
    !value.sourceProductPublicIds.every((id) => typeof id === "string" && uuid.test(id)) ||
    !validateCreateResolveRun({
      sourceProductPublicId: value.sourceProductPublicIds[0],
      resolverVersion: value.resolverVersion,
    }).ok ||
    !Number.isInteger(chunkSize) ||
    chunkSize < 1 ||
    chunkSize > 1000 ||
    !Number.isInteger(maxQueuedRuns) ||
    maxQueuedRuns < 1 ||
    maxQueuedRuns > 10000
  )
    throw new ResolverOrchestrationError("INVALID_RESOLVE_BATCH");
  const request = structuredClone(value);
  const ids = [...new Set(request.sourceProductPublicIds.map((id) => id.toLowerCase()))];
  const results: ResolveAdmissionResult[] = [];
  for (let offset = 0; offset < ids.length; offset += chunkSize) {
    for (const sourceProductPublicId of ids.slice(offset, offset + chunkSize)) {
      try {
        const item = await database.transaction(async (tx) => {
          // Serializes admission/backpressure only, never the actual resolver work.
          await sql`select pg_advisory_xact_lock(1112686419, 312)`.execute(tx);
          const admissionKey = `${request.requestPublicId.toLowerCase()}:${sourceProductPublicId}`;
          const prior = await tx
            .selectFrom("app.identifier_resolve_run")
            .select(["public_id", "resolver_version", "queue_json"])
            .where("admission_key", "=", admissionKey)
            .executeTakeFirst();
          if (prior) {
            if (!isDeepStrictEqual(prior.queue_json.reviewAudit ?? null, reviewAudit))
              throw new ResolverOrchestrationError("RESOLVE_ADMISSION_CONFLICT");
            if (prior.resolver_version !== request.resolverVersion)
              throw new ResolverOrchestrationError("RESOLVE_ADMISSION_CONFLICT");
            return {
              sourceProductPublicId,
              disposition: "REPLAYED" as const,
              publicId: prior.public_id,
            };
          }
          const active = await tx
            .selectFrom("app.identifier_resolve_run")
            .select(sql<number>`count(*)::int`.as("count"))
            .where("admission_key", "is not", null)
            .where("status", "in", ["QUEUED", "RUNNING"])
            .executeTakeFirstOrThrow();
          if (active.count >= maxQueuedRuns)
            throw new ResolverOrchestrationError("RESOLVE_BACKPRESSURE");
          const run = await createResolveRunInTransaction(
            tx,
            { sourceProductPublicId, resolverVersion: request.resolverVersion },
            admissionKey,
          );
          const receipt = await queue.publish(
            "identifier.resolve",
            { publicId: run.publicId },
            queueTransaction(tx),
          );
          await tx
            .updateTable("app.identifier_resolve_run")
            .set({
              queue_json: JSON.stringify({
                version: resolverQueueVersion,
                ...receipt,
                attempt: 0,
                reviewAudit,
                status: "QUEUED",
              }),
            })
            .where("public_id", "=", run.publicId)
            .execute();
          return {
            sourceProductPublicId,
            disposition: "ACCEPTED" as const,
            publicId: run.publicId,
          };
        });
        results.push(item);
      } catch (error) {
        results.push({
          sourceProductPublicId,
          disposition: "ERROR",
          code:
            error instanceof ResolverOrchestrationError || error instanceof ResolveRunError
              ? error.code
              : "RESOLVE_ENQUEUE_FAILED",
        });
      }
    }
  }
  return { requestPublicId: request.requestPublicId, results };
}
