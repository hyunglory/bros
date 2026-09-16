import type { DatabaseClient } from "@bros/db";
import type { QueuePort } from "@bros/queue";
import { sql } from "kysely";
import { resolverQueueVersion } from "./batch-admission.js";

/** Reconcile terminal queue receipts, including a process exit on the last attempt.
 * Never infer success or replay uncertain paid calls from a missing delivery.
 */
export async function reconcileResolveRuns(
  database: DatabaseClient,
  queue: QueuePort,
  afterId?: string,
) {
  if (!queue.inspect) return { checked: 0, failed: 0, nextId: undefined };
  let query = database.db
    .selectFrom("app.identifier_resolve_run")
    .select(["id", "queue_json"])
    .where("admission_key", "is not", null)
    .where("status", "in", ["QUEUED", "RUNNING"])
    .orderBy("id")
    .limit(100);
  if (afterId) query = query.where("id", ">", afterId);
  const runs = await query.execute();
  let failed = 0;
  for (const run of runs) {
    const state = run.queue_json;
    if (
      state.version !== resolverQueueVersion ||
      typeof state.provider !== "string" ||
      typeof state.providerId !== "string"
    )
      continue;
    const status = await queue.inspect("identifier.resolve", {
      provider: state.provider,
      providerId: state.providerId,
    });
    if (status === "PENDING") continue;
    const updated = await database.db
      .updateTable("app.identifier_resolve_run")
      .set({
        status: "FAILED",
        error_code:
          status === "FAILED" ? "RESOLVE_RETRIES_EXHAUSTED" : "RESOLVE_QUEUE_INCONSISTENT",
        error_message: "Queue delivery ended without a committed resolver result",
        finished_at: sql<Date>`clock_timestamp()`,
        queue_json: sql`queue_json || '{"status":"FAILED"}'::jsonb`,
      })
      .where("id", "=", run.id)
      .where("status", "in", ["QUEUED", "RUNNING"])
      .where(sql<boolean>`queue_json->>'providerId' = ${state.providerId}`)
      .executeTakeFirst();
    failed += Number(updated.numUpdatedRows);
  }
  return {
    checked: runs.length,
    failed,
    nextId: runs.length === 100 ? runs.at(-1)?.id : undefined,
  };
}
