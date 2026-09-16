import { compatibleIdentityLockKeys } from "@bros/contracts/server";
import { isDeepStrictEqual } from "node:util";
import {
  publicIdPattern,
  validateIdentifierResolveInput,
  validateResolveCandidates,
} from "@bros/contracts";
import {
  compatibleStoredIdentifierNorm,
  type DatabaseClient,
  type DbTransaction,
  type JsonObject,
} from "@bros/db";
import { sql } from "kysely";
import { normalizeIdentifierCandidateValue } from "./candidate-normalizer.js";

export type IdentifierPromotionErrorCode =
  | "AUTO_PROMOTION_DISABLED"
  | "CANDIDATE_NOT_FOUND"
  | "CANDIDATE_STATE_CONFLICT"
  | "IDENTIFIER_CONFLICT"
  | "INVALID_PROMOTION_INPUT"
  | "PERSISTED_CANDIDATE_INVALID"
  | "SOURCE_STATE_CONFLICT"
  | "PRODUCT_NOT_FOUND"
  | "VERSION_CONFLICT";

export class IdentifierPromotionError extends Error {
  constructor(readonly code: IdentifierPromotionErrorCode) {
    super(code);
    this.name = "IdentifierPromotionError";
  }
}

interface ApprovalRequest {
  actor: string;
  candidatePublicId: string;
  expectedVersionNo: number;
}

function parseRequest(value: unknown): ApprovalRequest {
  try {
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    if (![Object.prototype, null].includes(Object.getPrototypeOf(value))) throw new Error();
    const keys = Reflect.ownKeys(value);
    if (
      keys.length !== 3 ||
      keys.some((key) => !["actor", "candidatePublicId", "expectedVersionNo"].includes(String(key)))
    )
      throw new Error();
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Object.values(descriptors).some((item) => item.get || item.set)) throw new Error();
    const actor: unknown = descriptors.actor?.value;
    const candidatePublicId: unknown = descriptors.candidatePublicId?.value;
    const expectedVersionNo: unknown = descriptors.expectedVersionNo?.value;
    if (
      typeof actor !== "string" ||
      actor.trim() !== actor ||
      actor.length === 0 ||
      actor.length > 128 ||
      [...actor].some(
        (character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
      ) ||
      /\b(?:bearer|basic)\s+|\b(?:password|secret|token|access[_-]?token|api[_-]?key|cookie)\s*[:=]/iu.test(
        actor,
      ) ||
      typeof candidatePublicId !== "string" ||
      !new RegExp(publicIdPattern).test(candidatePublicId) ||
      typeof expectedVersionNo !== "number" ||
      !Number.isInteger(expectedVersionNo) ||
      expectedVersionNo < 1 ||
      expectedVersionNo >= 2147483647
    )
      throw new Error();
    // Copy primitives before the first await; do not retain the caller's object.
    return { actor, candidatePublicId: candidatePublicId.toLowerCase(), expectedVersionNo };
  } catch {
    throw new IdentifierPromotionError("INVALID_PROMOTION_INPUT");
  }
}

const gtinTypes = ["GTIN", "EAN", "UPC"] as const;

export async function promoteManualInTransaction(
  tx: DbTransaction,
  value: unknown,
  options: { expectedProductVersion?: number } = {},
) {
  const request = parseRequest(value);
  const locator = await tx
    .selectFrom("app.identifier_candidate as candidate")
    .innerJoin("app.identifier_resolve_run as run", "run.id", "candidate.resolve_run_id")
    .select([
      "run.id as run_id",
      "run.source_product_id",
      "run.product_id",
      "candidate.identifier_type",
      "candidate.candidate_norm",
    ])
    .where("candidate.public_id", "=", request.candidatePublicId)
    .executeTakeFirst();
  if (!locator) throw new IdentifierPromotionError("CANDIDATE_NOT_FOUND");

  // Same order and identity protocol as P2 MASTER creation: source, identity, MASTER.
  const source = await tx
    .selectFrom("app.source_product")
    .selectAll()
    .where("id", "=", locator.source_product_id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const family = gtinTypes.some((type) => type === locator.identifier_type)
    ? "GTIN"
    : locator.identifier_type;
  for (const key of compatibleIdentityLockKeys([
    { type: locator.identifier_type, normalizedValue: locator.candidate_norm },
  ])) {
    await sql`select pg_advisory_xact_lock(${key}::bigint)`.execute(tx);
  }
  const product =
    locator.product_id === null
      ? undefined
      : await tx
          .selectFrom("app.product_master")
          .selectAll()
          .where("id", "=", locator.product_id)
          .forUpdate()
          .executeTakeFirst();
  const run = await tx
    .selectFrom("app.identifier_resolve_run")
    .selectAll()
    .where("id", "=", locator.run_id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const candidate = await tx
    .selectFrom("app.identifier_candidate")
    .selectAll()
    .where("public_id", "=", request.candidatePublicId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  if (
    run.product_id !== locator.product_id ||
    run.source_product_id !== source.id ||
    candidate.resolve_run_id !== run.id ||
    candidate.identifier_type !== locator.identifier_type ||
    candidate.candidate_norm !== locator.candidate_norm
  ) {
    throw new IdentifierPromotionError("SOURCE_STATE_CONFLICT");
  }
  const result = {
    candidatePublicId: candidate.public_id,
    decisionStatus: "ACCEPTED" as const,
    versionNo: request.expectedVersionNo + 1,
  };
  // Durable replay survives a process restart and later source reimports.
  if (
    candidate.decision_status === "ACCEPTED" &&
    candidate.version_no === result.versionNo &&
    candidate.decided_by === request.actor &&
    candidate.evidence_json.some(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        !Array.isArray(entry) &&
        entry.type === "MANUAL_REVIEW" &&
        entry.schemaVersion === 1 &&
        entry.candidatePublicId === candidate.public_id &&
        entry.actor === request.actor &&
        entry.inputVersionNo === request.expectedVersionNo &&
        entry.versionNo === candidate.version_no,
    )
  )
    return result;
  if (candidate.version_no !== request.expectedVersionNo)
    throw new IdentifierPromotionError("VERSION_CONFLICT");
  if (!["CANDIDATE", "REVIEW_REQUIRED"].includes(candidate.decision_status))
    throw new IdentifierPromotionError("CANDIDATE_STATE_CONFLICT");
  if (!product) throw new IdentifierPromotionError("PRODUCT_NOT_FOUND");
  if (
    options.expectedProductVersion !== undefined &&
    product.version_no !== options.expectedProductVersion
  )
    throw new IdentifierPromotionError("VERSION_CONFLICT");
  const snapshot = validateIdentifierResolveInput(run.input_json);
  if (
    !snapshot.ok ||
    run.status !== "SUCCEEDED" ||
    source.product_id !== product.id ||
    snapshot.value.productPublicId !== product.public_id ||
    snapshot.value.sourceProductPublicId !== source.public_id ||
    snapshot.value.externalProductId !== source.external_product_id ||
    snapshot.value.productName !== source.raw_product_name ||
    snapshot.value.brandName !== source.raw_brand_name ||
    snapshot.value.productUrl !== source.product_url ||
    Date.parse(snapshot.value.collectedAt) !== source.collected_at.getTime() ||
    !isDeepStrictEqual(snapshot.value.raw, source.raw_json)
  ) {
    throw new IdentifierPromotionError("SOURCE_STATE_CONFLICT");
  }
  const payload = {
    identifierType: candidate.identifier_type,
    candidateValue: candidate.candidate_value,
    candidateNorm: candidate.candidate_norm,
    confidenceScore: candidate.confidence_score,
    rankNo: candidate.rank_no,
    evidence: candidate.evidence_json,
    conflicts: candidate.conflict_json,
  };
  if (
    !validateResolveCandidates([payload]).ok ||
    candidate.evidence_json.length >= 1000 ||
    normalizeIdentifierCandidateValue(candidate.identifier_type, candidate.candidate_value) !==
      candidate.candidate_norm
  ) {
    throw new IdentifierPromotionError("PERSISTED_CANDIDATE_INVALID");
  }
  if (candidate.conflict_json.length > 0) throw new IdentifierPromotionError("IDENTIFIER_CONFLICT");
  const types = family === "GTIN" ? [...gtinTypes] : [candidate.identifier_type];
  const competing = await tx
    .selectFrom("app.product_identifier")
    .select("product_id")
    .where("identifier_type", "in", types)
    .where(compatibleStoredIdentifierNorm("app.product_identifier"), "=", candidate.candidate_norm)
    .where("product_id", "!=", product.id)
    .limit(1)
    .executeTakeFirst();
  if (competing) throw new IdentifierPromotionError("IDENTIFIER_CONFLICT");
  const existingRows = await tx
    .selectFrom("app.product_identifier")
    .selectAll()
    .where("product_id", "=", product.id)
    .where("sku_id", "is", null)
    .where("identifier_type", "=", candidate.identifier_type)
    .where(compatibleStoredIdentifierNorm("app.product_identifier"), "=", candidate.candidate_norm)
    .forUpdate()
    .limit(2)
    .execute();
  if (existingRows.length > 1) throw new IdentifierPromotionError("IDENTIFIER_CONFLICT");
  const existing = existingRows[0];
  const clock = await sql<{
    decidedAt: Date;
  }>`select clock_timestamp() as "decidedAt"`.execute(tx);
  const timestamp = clock.rows[0];
  if (!timestamp) throw new Error("PROMOTION_CLOCK_UNAVAILABLE");
  const { decidedAt } = timestamp;
  const audit: JsonObject = {
    type: "MANUAL_REVIEW",
    schemaVersion: 1,
    actor: request.actor,
    decidedAt: decidedAt.toISOString(),
    inputVersionNo: request.expectedVersionNo,
    versionNo: result.versionNo,
    decision: "ACCEPTED",
    candidatePublicId: candidate.public_id,
    runPublicId: run.public_id,
    productPublicId: product.public_id,
  };
  const identifierAudit = {
    ...audit,
    evidence: candidate.evidence_json,
    conflicts: candidate.conflict_json,
    previous: existing
      ? {
          evidence: existing.evidence_json,
          evidenceType: existing.evidence_type,
          confidenceScore: existing.confidence_score,
          sourceUrl: existing.source_url,
          identifierValue: existing.identifier_value,
          isVerified: existing.is_verified,
        }
      : null,
  };
  // Validate the complete persisted envelope, including preserved legacy evidence.
  if (!validateResolveCandidates([{ ...payload, evidence: [identifierAudit] }]).ok)
    throw new IdentifierPromotionError("PERSISTED_CANDIDATE_INVALID");
  await tx
    .updateTable("app.product_identifier")
    .set({ is_primary: false, updated_at: decidedAt })
    .where("product_id", "=", product.id)
    .where("sku_id", "is", null)
    .where("identifier_type", "=", candidate.identifier_type)
    .where("is_primary", "=", true)
    .execute();
  const promoted = {
    identifier_value: candidate.candidate_value,
    is_primary: true,
    is_verified: true,
    confidence_score: candidate.confidence_score,
    evidence_type: "MANUAL_REVIEW",
    evidence_json: JSON.stringify(identifierAudit),
    updated_at: decidedAt,
  };
  const identifier = existing
    ? await tx
        .updateTable("app.product_identifier")
        .set(promoted)
        .where("id", "=", existing.id)
        .returning("public_id")
        .executeTakeFirstOrThrow()
    : await tx
        .insertInto("app.product_identifier")
        .values({
          ...promoted,
          product_id: product.id,
          sku_id: null,
          identifier_type: candidate.identifier_type,
          identifier_norm: candidate.candidate_norm,
        })
        .returning("public_id")
        .executeTakeFirstOrThrow();
  audit.identifierPublicId = identifier.public_id;
  const updated = await tx
    .updateTable("app.identifier_candidate")
    .set({
      decision_status: "ACCEPTED",
      decided_at: decidedAt,
      decided_by: request.actor,
      version_no: sql<number>`version_no + 1`,
      evidence_json: JSON.stringify([...candidate.evidence_json, audit]),
    })
    .where("id", "=", candidate.id)
    .where("version_no", "=", request.expectedVersionNo)
    .where("decision_status", "in", ["CANDIDATE", "REVIEW_REQUIRED"])
    .executeTakeFirst();
  if (Number(updated.numUpdatedRows) !== 1) throw new IdentifierPromotionError("VERSION_CONFLICT");
  await tx
    .updateTable("app.product_master")
    .set({
      identifier_status: "VERIFIED",
      version_no: sql<number>`version_no + 1`,
      updated_at: decidedAt,
    })
    .where("id", "=", product.id)
    .execute();
  return result;
}

export function createIdentifierPromotionService(database: DatabaseClient) {
  return {
    async promoteManual(value: unknown) {
      const request = parseRequest(value);
      return database.transaction((tx) => promoteManualInTransaction(tx, request));
    },
    async promoteAuto(): Promise<never> {
      throw new IdentifierPromotionError("AUTO_PROMOTION_DISABLED");
    },
  };
}
