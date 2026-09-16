import type { DatabaseClient, JsonValue } from "@bros/db";
import { maskSensitiveText } from "@bros/core";
import {
  publicIdPattern,
  type IdentifierReviewQuery,
  type IdentifierReviewSummary,
  type IdentifierRunSummary,
} from "@bros/contracts";
import { IdentifierReviewError } from "@bros/resolver";
import { sql } from "kysely";
const object = (v: JsonValue | undefined): Record<string, JsonValue> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? v : {};
const safe = (v: unknown, max = 2048): string | null =>
  typeof v === "string" ? maskSensitiveText(v).slice(0, max) : null;
function publicUrl(value: JsonValue | undefined) {
  if (typeof value !== "string") return null;
  try {
    const url = new URL(value);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return null;
    url.search = "";
    url.hash = "";
    return safe(url.toString(), 4096);
  } catch {
    return null;
  }
}
function cursor(value?: string) {
  if (!value) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as {
      at: string;
      id: string;
    };
    if (
      Object.keys(parsed).length !== 2 ||
      typeof parsed.at !== "string" ||
      !Number.isFinite(Date.parse(parsed.at)) ||
      !new RegExp(publicIdPattern).test(parsed.id)
    )
      throw new Error();
    return parsed;
  } catch {
    throw new IdentifierReviewError("INVALID_CURSOR");
  }
}
const search = (value?: string) =>
  value
    ? `%${value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_")}%`
    : undefined;
export function createIdentifierReviewManagement(database: DatabaseClient) {
  const candidates = () =>
    database.db
      .selectFrom("app.identifier_candidate as c")
      .innerJoin("app.identifier_resolve_run as r", "r.id", "c.resolve_run_id")
      .innerJoin("app.source_product as s", "s.id", "r.source_product_id")
      .leftJoin("app.product_master as p", "p.id", "r.product_id")
      .selectAll("c")
      .select([
        "r.public_id as run_public_id",
        "s.public_id as source_public_id",
        "p.public_id as product_public_id",
        "r.input_json",
        sql<string>`c.created_at::text`.as("cursor_at"),
      ]);
  type CandidateRow = Awaited<ReturnType<ReturnType<typeof candidates>["executeTakeFirstOrThrow"]>>;
  const summary = (row: CandidateRow): IdentifierReviewSummary => ({
    publicId: row.public_id,
    runPublicId: row.run_public_id,
    sourceProductPublicId: row.source_public_id,
    productPublicId: row.product_public_id,
    productName: safe(row.input_json.productName) ?? "상품명 없음",
    brandName: safe(row.input_json.brandName),
    identifierType: row.identifier_type,
    candidateValue: safe(row.candidate_value) ?? "",
    candidateNorm: safe(row.candidate_norm) ?? "",
    confidenceScore: row.confidence_score,
    rankNo: row.rank_no,
    decisionStatus: row.decision_status,
    versionNo: row.version_no,
    createdAt: row.created_at.toISOString(),
    decidedAt: row.decided_at?.toISOString() ?? null,
  });
  const runs = () =>
    database.db
      .selectFrom("app.identifier_resolve_run as r")
      .innerJoin("app.source_product as s", "s.id", "r.source_product_id")
      .leftJoin("app.product_master as p", "p.id", "r.product_id")
      .selectAll("r")
      .select([
        "s.public_id as source_public_id",
        "p.public_id as product_public_id",
        "p.version_no as product_version",
        sql<number>`(select count(*)::int from app.identifier_candidate c where c.resolve_run_id = r.id)`.as(
          "candidate_count",
        ),
        sql<string>`r.created_at::text`.as("cursor_at"),
      ]);
  type RunRow = Awaited<ReturnType<ReturnType<typeof runs>["executeTakeFirstOrThrow"]>>;
  const runSummary = (row: RunRow): IdentifierRunSummary => ({
    publicId: row.public_id,
    sourceProductPublicId: row.source_public_id,
    productPublicId: row.product_public_id,
    productName: safe(row.input_json.productName) ?? "상품명 없음",
    brandName: safe(row.input_json.brandName),
    productVersion: row.product_version,
    status: row.status,
    outcome:
      row.status === "SUCCEEDED"
        ? (safe(row.result_json.outcome, 64) ?? (row.candidate_count ? "CANDIDATES" : "NOT_FOUND"))
        : null,
    errorCode: safe(row.error_code, 64),
    createdAt: row.created_at.toISOString(),
    finishedAt: row.finished_at?.toISOString() ?? null,
    candidateCount: row.candidate_count,
  });
  const nextCursor = (rows: { public_id: string; cursor_at: string }[], limit: number) => {
    const last = rows.slice(0, limit).at(-1);
    return rows.length > limit && last
      ? Buffer.from(JSON.stringify({ at: last.cursor_at, id: last.public_id })).toString(
          "base64url",
        )
      : null;
  };
  async function run(publicId: string) {
    const row = await runs().where("r.public_id", "=", publicId).executeTakeFirst();
    if (!row) throw new IdentifierReviewError("RESOLVE_RUN_NOT_FOUND");
    const failures = Array.isArray(row.result_json.providerFailures)
      ? row.result_json.providerFailures
      : [];
    return {
      ...runSummary(row),
      providerFailures: failures.slice(0, 100).map((entry) => ({
        code: safe(object(entry).code, 64) ?? "UNKNOWN",
        providerId: safe(object(entry).providerId, 128) ?? "UNKNOWN",
      })),
      truncated: row.result_json.truncated === true,
    };
  }
  return {
    run,
    async list(query: IdentifierReviewQuery) {
      const limit = query.limit ?? 50,
        after = cursor(query.cursor),
        term = search(query.query);
      let builder = candidates();
      if (query.decision) builder = builder.where("c.decision_status", "=", query.decision);
      if (query.runPublicId) builder = builder.where("r.public_id", "=", query.runPublicId);
      if (term)
        builder = builder.where(
          sql<boolean>`(c.candidate_value ilike ${term} escape '\\' or r.input_json->>'productName' ilike ${term} escape '\\')`,
        );
      if (after)
        builder = builder.where(
          sql<boolean>`(c.created_at, c.public_id) < (${after.at}::timestamptz, ${after.id}::uuid)`,
        );
      const rows = await builder
        .orderBy("c.created_at", "desc")
        .orderBy("c.public_id", "desc")
        .limit(limit + 1)
        .execute();
      return { items: rows.slice(0, limit).map(summary), nextCursor: nextCursor(rows, limit) };
    },
    async listRuns(query: IdentifierReviewQuery) {
      const limit = query.limit ?? 50,
        after = cursor(query.cursor),
        term = search(query.query);
      let builder = runs();
      if (term)
        builder = builder.where(
          sql<boolean>`r.input_json->>'productName' ilike ${term} escape '\\'`,
        );
      if (after)
        builder = builder.where(
          sql<boolean>`(r.created_at, r.public_id) < (${after.at}::timestamptz, ${after.id}::uuid)`,
        );
      const rows = await builder
        .orderBy("r.created_at", "desc")
        .orderBy("r.public_id", "desc")
        .limit(limit + 1)
        .execute();
      return { items: rows.slice(0, limit).map(runSummary), nextCursor: nextCursor(rows, limit) };
    },
    async detail(publicId: string) {
      const row = await candidates().where("c.public_id", "=", publicId).executeTakeFirst();
      if (!row) throw new IdentifierReviewError("CANDIDATE_NOT_FOUND");
      const runRow = await runs()
        .where("r.public_id", "=", row.run_public_id)
        .executeTakeFirstOrThrow();
      const runInfo = runSummary(runRow);
      return {
        ...summary(row),
        run: runInfo,
        evidence: row.evidence_json
          .filter((entry) => object(entry).type !== "MANUAL_REVIEW")
          .slice(0, 1000)
          .map((entry) => {
            const e = object(entry),
              p = object(e.provenance);
            return {
              type: safe(e.type, 64) ?? "UNKNOWN",
              source: safe(e.source, 64),
              strength: safe(e.strength, 64),
              weight: typeof e.weight === "number" && Number.isInteger(e.weight) ? e.weight : null,
              locator: safe(p.locator, 4096),
              matchedText: safe(p.matchedText),
              sourceUrl: publicUrl(p.sourceUrl),
            };
          }),
        conflicts: row.conflict_json
          .slice(0, 1000)
          .map((entry) => safe(object(entry).code ?? object(entry).type, 64) ?? "CONFLICT"),
        audit: row.evidence_json
          .filter((entry) => object(entry).type === "MANUAL_REVIEW")
          .slice(0, 1000)
          .map((entry) => {
            const e = object(entry);
            return {
              decision: safe(e.decision, 64) ?? "UNKNOWN",
              actor: safe(e.actor, 128) ?? "UNKNOWN",
              decidedAt: safe(e.decidedAt, 128) ?? "",
              reason: safe(e.reason, 500),
            };
          }),
      };
    },
  };
}
