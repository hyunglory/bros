import {
  publicIdPattern,
  validateCreateResolveRun,
  validateIdentifierResolveInput,
  validateResolveCandidates,
  validateSourceImportContext,
  validateSourceProductInput,
  type IdentifierResolveInput,
  type ResolveRunStatus,
} from "@bros/contracts";
import type { DatabaseClient, DbTransaction, JsonValue } from "@bros/db";
import { sql } from "kysely";

export type ResolveRunErrorCode =
  | "INVALID_RESOLVE_INPUT"
  | "SOURCE_PRODUCT_NOT_FOUND"
  | "RESOLVE_RUN_NOT_FOUND"
  | "RESOLVE_RUN_STATE_CONFLICT"
  | "PERSISTED_RESOLVE_INPUT_INVALID";

export class ResolveRunError extends Error {
  constructor(readonly code: ResolveRunErrorCode) {
    super(code);
    this.name = "ResolveRunError";
  }
}

const failureMessages = {
  INVALID_SOURCE_DATA: "Source data could not be processed",
  EXTERNAL_SEARCH_FAILED: "External candidate search failed",
  RATE_LIMIT: "Candidate provider rate limit reached",
  TIMEOUT: "Identifier resolution timed out",
  RESOLVER_FAILED: "Identifier resolution failed",
} as const;
export type ResolveFailureCode = keyof typeof failureMessages;

function requirePublicId(value: string): void {
  if (typeof value !== "string" || !new RegExp(publicIdPattern).test(value)) {
    throw new ResolveRunError("INVALID_RESOLVE_INPUT");
  }
}

function object(value: JsonValue): Record<string, JsonValue> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

async function snapshot(transaction: DbTransaction, sourcePublicId: string) {
  const source = await transaction
    .selectFrom("app.source_product as source")
    .innerJoin("app.platform as platform", "platform.id", "source.platform_id")
    .leftJoin("app.product_master as product", "product.id", "source.product_id")
    .select([
      "source.id",
      "source.public_id",
      "source.product_id",
      "source.raw_json",
      "source.external_product_id",
      "source.raw_product_name",
      "source.raw_brand_name",
      "source.product_url",
      "source.collected_at",
      "platform.code as platform_code",
      "product.public_id as product_public_id",
    ])
    .where("source.public_id", "=", sourcePublicId)
    .forShare("source")
    .executeTakeFirst();
  if (!source) throw new ResolveRunError("SOURCE_PRODUCT_NOT_FOUND");

  // Source.raw_json alone does not retain explicit identifiers/options supplied
  // by an adapter. Recover the matching import envelope without using a newer
  // or skipped older import. Keyset pages avoid loading unbounded history.
  let imported: IdentifierResolveInput["import"] = null;
  let beforeId: string | undefined;
  for (;;) {
    let query = transaction
      .selectFrom("app.import_item")
      .select(["id", "public_id", "raw_json"])
      .where("source_product_id", "=", source.id)
      .where("action_type", "in", ["CREATED", "UPDATED", "MATCHED", "REVIEW_REQUIRED"])
      .where(
        sql<boolean>`raw_json -> 'mappedInput' -> 'raw' = ${JSON.stringify(source.raw_json)}::jsonb`,
      )
      .orderBy("id", "desc")
      .limit(100);
    if (beforeId !== undefined) query = query.where("id", "<", beforeId);
    const items = await query.execute();
    for (const item of items) {
      const envelope = object(item.raw_json);
      const context = validateSourceImportContext(envelope?.context);
      if (!context.ok || Date.parse(context.value.collectedAt) !== source.collected_at.getTime())
        continue;
      const mapped = validateSourceProductInput(envelope?.mappedInput);
      if (
        !mapped.ok ||
        mapped.value.platformCode !== source.platform_code ||
        mapped.value.externalProductId !== source.external_product_id ||
        mapped.value.productName !== source.raw_product_name ||
        (mapped.value.brandName ?? null) !== source.raw_brand_name ||
        (mapped.value.productUrl ?? null) !== source.product_url
      )
        continue;
      imported = { itemPublicId: item.public_id, input: mapped.value };
      break;
    }
    if (imported !== null || items.length < 100) break;
    beforeId = items.at(-1)?.id;
  }

  const input = validateIdentifierResolveInput({
    schemaVersion: 1,
    sourceProductPublicId: source.public_id,
    productPublicId: source.product_public_id,
    platformCode: source.platform_code,
    externalProductId: source.external_product_id,
    productName: source.raw_product_name,
    brandName: source.raw_brand_name,
    productUrl: source.product_url,
    collectedAt: source.collected_at.toISOString(),
    raw: source.raw_json,
    import: imported,
  });
  if (!input.ok) throw new ResolveRunError("INVALID_RESOLVE_INPUT");
  return { source, input: input.value };
}

async function lockedRun(
  transaction: DbTransaction,
  publicId: string,
  allowed: ResolveRunStatus[],
  allowManaged = false,
) {
  const run = await transaction
    .selectFrom("app.identifier_resolve_run")
    .selectAll()
    .where("public_id", "=", publicId)
    .forUpdate()
    .executeTakeFirst();
  if (!run) throw new ResolveRunError("RESOLVE_RUN_NOT_FOUND");
  if (!allowManaged && Object.keys(run.queue_json).length > 0)
    throw new ResolveRunError("RESOLVE_RUN_STATE_CONFLICT");
  if (!allowed.includes(run.status)) throw new ResolveRunError("RESOLVE_RUN_STATE_CONFLICT");
  return run;
}

function readSnapshot(value: unknown): IdentifierResolveInput {
  const parsed = validateIdentifierResolveInput(value);
  if (!parsed.ok) throw new ResolveRunError("PERSISTED_RESOLVE_INPUT_INVALID");
  return parsed.value;
}

/** Used by admission so the immutable snapshot and queue receipt commit together. */
export async function createResolveRunInTransaction(
  transaction: DbTransaction,
  value: unknown,
  admissionKey: string | null = null,
) {
  const request = validateCreateResolveRun(value);
  if (!request.ok) throw new ResolveRunError("INVALID_RESOLVE_INPUT");
  const { source, input } = await snapshot(transaction, request.value.sourceProductPublicId);
  const run = await transaction
    .insertInto("app.identifier_resolve_run")
    .values({
      source_product_id: source.id,
      product_id: source.product_id,
      resolver_version: request.value.resolverVersion,
      input_json: JSON.stringify(input),
      admission_key: admissionKey,
      status: "QUEUED",
    })
    .returning("public_id")
    .executeTakeFirstOrThrow();
  return { publicId: run.public_id, status: "QUEUED" as const };
}

export function createResolveRunService(database: DatabaseClient) {
  return {
    async create(value: unknown) {
      const request = validateCreateResolveRun(value);
      if (!request.ok) throw new ResolveRunError("INVALID_RESOLVE_INPUT");
      return database.db
        .transaction()
        .setIsolationLevel("repeatable read")
        .execute(async (transaction) => {
          return createResolveRunInTransaction(transaction, request.value);
        });
    },

    async start(publicId: string) {
      requirePublicId(publicId);
      return database.transaction(async (transaction) => {
        const run = await lockedRun(transaction, publicId, ["QUEUED"]);
        const input = readSnapshot(run.input_json);
        await transaction
          .updateTable("app.identifier_resolve_run")
          .set({ status: "RUNNING", started_at: sql<Date>`clock_timestamp()` })
          .where("id", "=", run.id)
          .execute();
        return {
          publicId: run.public_id,
          status: "RUNNING" as const,
          resolverVersion: run.resolver_version,
          input,
        };
      });
    },

    async succeed(publicId: string, value: unknown) {
      requirePublicId(publicId);
      const parsed = validateResolveCandidates(value);
      if (!parsed.ok) throw new ResolveRunError("INVALID_RESOLVE_INPUT");
      // Detach before awaiting a lock: callers cannot mutate already validated data.
      const candidates = structuredClone(parsed.value);
      return database.transaction(async (transaction) => {
        const run = await lockedRun(transaction, publicId, ["RUNNING"]);
        if (candidates.length > 0) {
          await transaction
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
        }
        await transaction
          .updateTable("app.identifier_resolve_run")
          .set({ status: "SUCCEEDED", finished_at: sql<Date>`clock_timestamp()` })
          .where("id", "=", run.id)
          .execute();
        return {
          publicId: run.public_id,
          status: "SUCCEEDED" as const,
          outcome: candidates.length === 0 ? ("NOT_FOUND" as const) : ("CANDIDATES" as const),
        };
      });
    },

    async fail(publicId: string, code: ResolveFailureCode) {
      requirePublicId(publicId);
      if (typeof code !== "string" || !Object.hasOwn(failureMessages, code)) {
        throw new ResolveRunError("INVALID_RESOLVE_INPUT");
      }
      return database.transaction(async (transaction) => {
        const run = await lockedRun(transaction, publicId, ["RUNNING"]);
        await transaction
          .updateTable("app.identifier_resolve_run")
          .set({
            status: "FAILED",
            error_code: code,
            error_message: failureMessages[code],
            finished_at: sql<Date>`clock_timestamp()`,
          })
          .where("id", "=", run.id)
          .execute();
        return { publicId: run.public_id, status: "FAILED" as const };
      });
    },

    async cancel(publicId: string) {
      requirePublicId(publicId);
      return database.transaction(async (transaction) => {
        const run = await lockedRun(transaction, publicId, ["QUEUED", "RUNNING"], true);
        await transaction
          .updateTable("app.identifier_resolve_run")
          .set({ status: "CANCELLED", finished_at: sql<Date>`clock_timestamp()` })
          .where("id", "=", run.id)
          .execute();
        return { publicId: run.public_id, status: "CANCELLED" as const };
      });
    },

    async get(publicId: string) {
      requirePublicId(publicId);
      return database.db
        .transaction()
        .setIsolationLevel("repeatable read")
        .execute(async (transaction) => {
          const run = await transaction
            .selectFrom("app.identifier_resolve_run")
            .selectAll()
            .where("public_id", "=", publicId)
            .executeTakeFirst();
          if (!run) throw new ResolveRunError("RESOLVE_RUN_NOT_FOUND");
          const candidates = await transaction
            .selectFrom("app.identifier_candidate")
            .selectAll()
            .where("resolve_run_id", "=", run.id)
            .orderBy("rank_no")
            .orderBy("id")
            .execute();
          return {
            publicId: run.public_id,
            resolverVersion: run.resolver_version,
            status: run.status,
            input: readSnapshot(run.input_json),
            createdAt: run.created_at.toISOString(),
            startedAt: run.started_at?.toISOString() ?? null,
            finishedAt: run.finished_at?.toISOString() ?? null,
            errorCode: run.error_code,
            errorMessage: run.error_message,
            execution: run.queue_json,
            result: run.result_json,
            outcome:
              run.status === "SUCCEEDED"
                ? typeof run.result_json.outcome === "string"
                  ? run.result_json.outcome
                  : candidates.length === 0
                    ? "NOT_FOUND"
                    : "CANDIDATES"
                : null,
            candidates: candidates.map((candidate) => ({
              publicId: candidate.public_id,
              identifierType: candidate.identifier_type,
              candidateValue: candidate.candidate_value,
              candidateNorm: candidate.candidate_norm,
              confidenceScore: candidate.confidence_score,
              rankNo: candidate.rank_no,
              evidence: candidate.evidence_json,
              conflicts: candidate.conflict_json,
              decisionStatus: candidate.decision_status,
              versionNo: candidate.version_no,
              decidedAt: candidate.decided_at?.toISOString() ?? null,
              decidedBy: candidate.decided_by,
            })),
          };
        });
    },
  };
}
