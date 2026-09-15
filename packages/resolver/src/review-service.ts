import {
  isManualIdentifierRequest,
  publicIdPattern,
  validateSourceRawJson,
  validateIdentifierResolveInput,
  type ManualIdentifierRequest,
} from "@bros/contracts";
import { maskSensitiveText } from "@bros/core";
import type { DatabaseClient, JsonObject } from "@bros/db";
import { createBrandNormalizer } from "@bros/importer";
import { sql } from "kysely";
import {
  IdentifierPromotionError,
  promoteManualInTransaction,
} from "./identifier-promotion-service.js";
import {
  normalizeIdentifierCandidateValue,
  createCandidateNormalizer,
} from "./candidate-normalizer.js";
import { createInternalCatalogProvider } from "./internal-catalog-provider.js";
import { createEvidenceCollector } from "./evidence-collector.js";
import { createCandidateScorer } from "./candidate-scorer.js";
import { createHardConflictDetector } from "./hard-conflict-detector.js";

export class IdentifierReviewError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "IdentifierReviewError";
  }
}
function checkedText(value: string, max: number) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.length > max ||
    maskSensitiveText(value) !== value ||
    !validateSourceRawJson({ value }).ok
  )
    throw new IdentifierReviewError("INVALID_REVIEW_INPUT");
  return value.trim();
}
function checkId(value: string) {
  if (!new RegExp(publicIdPattern).test(value))
    throw new IdentifierReviewError("INVALID_REVIEW_INPUT");
}

export function createIdentifierReviewService(database: DatabaseClient) {
  return {
    async reject(
      publicId: string,
      expectedVersion: number,
      reasonValue: string,
      actorValue: string,
    ) {
      checkId(publicId);
      const reason = checkedText(reasonValue, 500),
        actor = checkedText(actorValue, 128);
      if (
        !Number.isInteger(expectedVersion) ||
        expectedVersion < 1 ||
        expectedVersion >= 2147483647
      )
        throw new IdentifierReviewError("INVALID_REVIEW_INPUT");
      return database.transaction(async (tx) => {
        const candidate = await tx
          .selectFrom("app.identifier_candidate")
          .selectAll()
          .where("public_id", "=", publicId)
          .forUpdate()
          .executeTakeFirst();
        if (!candidate) throw new IdentifierReviewError("CANDIDATE_NOT_FOUND");
        const replay = candidate.evidence_json.some(
          (entry) =>
            entry !== null &&
            typeof entry === "object" &&
            !Array.isArray(entry) &&
            entry.type === "MANUAL_REVIEW" &&
            entry.decision === "REJECTED" &&
            entry.actor === actor &&
            entry.reason === reason &&
            entry.inputVersionNo === expectedVersion,
        );
        if (
          candidate.decision_status === "REJECTED" &&
          candidate.version_no === expectedVersion + 1 &&
          replay
        )
          return {
            candidatePublicId: candidate.public_id,
            decisionStatus: "REJECTED" as const,
            versionNo: candidate.version_no,
          };
        if (candidate.version_no !== expectedVersion)
          throw new IdentifierReviewError("VERSION_CONFLICT");
        if (!["CANDIDATE", "REVIEW_REQUIRED"].includes(candidate.decision_status))
          throw new IdentifierReviewError("CANDIDATE_STATE_CONFLICT");
        if (candidate.evidence_json.length >= 1000)
          throw new IdentifierReviewError("PERSISTED_CANDIDATE_INVALID");
        const decidedAt = new Date();
        const audit = {
          type: "MANUAL_REVIEW",
          schemaVersion: 1,
          decision: "REJECTED",
          previousDecision: candidate.decision_status,
          candidatePublicId: candidate.public_id,
          actor,
          reason,
          decidedAt: decidedAt.toISOString(),
          inputVersionNo: expectedVersion,
          versionNo: expectedVersion + 1,
        };
        await tx
          .updateTable("app.identifier_candidate")
          .set({
            decision_status: "REJECTED",
            version_no: expectedVersion + 1,
            decided_at: decidedAt,
            decided_by: actor,
            evidence_json: JSON.stringify([...candidate.evidence_json, audit]),
          })
          .where("id", "=", candidate.id)
          .execute();
        return {
          candidatePublicId: candidate.public_id,
          decisionStatus: "REJECTED" as const,
          versionNo: expectedVersion + 1,
        };
      });
    },
    async manual(runPublicId: string, value: ManualIdentifierRequest, actorValue: string) {
      checkId(runPublicId);
      if (!isManualIdentifierRequest(value) || !validateSourceRawJson(value).ok)
        throw new IdentifierReviewError("INVALID_REVIEW_INPUT");
      const request = structuredClone(value);
      const actor = checkedText(actorValue, 128);
      request.reason = checkedText(request.reason, 500);
      request.candidateValue = checkedText(request.candidateValue, 512);
      const norm = normalizeIdentifierCandidateValue(
        request.identifierType,
        request.candidateValue,
      );
      if (!norm) throw new IdentifierReviewError("INVALID_IDENTIFIER_VALUE");
      return database.transaction(async (tx) => {
        const key = `manual:${request.requestPublicId.toLowerCase()}`;
        await sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`.execute(tx);
        const prior = await tx
          .selectFrom("app.identifier_resolve_run")
          .select(["result_json"])
          .where("admission_key", "=", key)
          .executeTakeFirst();
        if (prior) {
          const audit = prior.result_json;
          if (
            audit.originRunPublicId !== runPublicId.toLowerCase() ||
            audit.actor !== actor ||
            audit.candidateValue !== request.candidateValue ||
            audit.identifierType !== request.identifierType ||
            audit.expectedVersion !== request.expectedVersion ||
            audit.reason !== request.reason ||
            typeof audit.candidatePublicId !== "string"
          )
            throw new IdentifierReviewError("REVIEW_REQUEST_CONFLICT");
          return {
            candidatePublicId: audit.candidatePublicId,
            decisionStatus: "ACCEPTED" as const,
            versionNo: 2,
          };
        }
        const origin = await tx
          .selectFrom("app.identifier_resolve_run")
          .selectAll()
          .where("public_id", "=", runPublicId)
          .executeTakeFirst();
        if (!origin) throw new IdentifierReviewError("RESOLVE_RUN_NOT_FOUND");
        if (origin.status !== "SUCCEEDED")
          throw new IdentifierReviewError("RESOLVE_RUN_STATE_CONFLICT");
        await tx
          .selectFrom("app.source_product")
          .select("id")
          .where("id", "=", origin.source_product_id)
          .forUpdate()
          .executeTakeFirstOrThrow();
        const snapshot = validateIdentifierResolveInput(origin.input_json);
        if (!snapshot.ok || !origin.product_id)
          throw new IdentifierReviewError("PRODUCT_NOT_FOUND");
        const product = await tx
          .selectFrom("app.product_master as product")
          .innerJoin("app.brand as brand", "brand.id", "product.brand_id")
          .select(["product.id", "brand.brand_key", "product.status", "brand.is_active"])
          .where("product.id", "=", origin.product_id)
          .executeTakeFirst();
        if (!product || product.status === "INACTIVE" || !product.is_active)
          throw new IdentifierReviewError("PRODUCT_NOT_FOUND");
        const brand = await createBrandNormalizer({ db: tx }).normalize({
          platformCode: snapshot.value.platformCode,
          rawBrandName: snapshot.value.brandName,
        });
        if (brand.status === "RESOLVED" && brand.brand.brandKey !== product.brand_key)
          throw new IdentifierPromotionError("IDENTIFIER_CONFLICT");
        const catalog = await createInternalCatalogProvider({ ...database, db: tx }).search({
          kind: "IDENTIFIER",
          identifierType: request.identifierType,
          identifierNorm: norm,
        });
        // Only the newly entered value participates; original recommendations remain immutable.
        const collection = createEvidenceCollector().collect({
          input: { ...snapshot.value, import: null },
          internalCatalogResults: [catalog],
        });
        const scored = createCandidateScorer().score(
          createCandidateNormalizer().normalize(collection),
        );
        const conflict = createHardConflictDetector().detect(scored, {
          sourceFacts: { brandKey: product.brand_key },
          candidateFacts: scored.candidates.map((candidate) => ({
            identifierType: candidate.identifierType,
            candidateNorm: candidate.candidateNorm,
            facts: {
              brandKey:
                catalog.matches.find((match) => match.brandKey !== product.brand_key)?.brandKey ??
                product.brand_key,
            },
          })),
        });
        if (
          conflict.truncated ||
          conflict.candidates.some((candidate) => candidate.hasHardConflict)
        )
          throw new IdentifierPromotionError("IDENTIFIER_CONFLICT");
        const now = new Date();
        const run = await tx
          .insertInto("app.identifier_resolve_run")
          .values({
            source_product_id: origin.source_product_id,
            product_id: origin.product_id,
            resolver_version: "manual-review/v1",
            admission_key: key,
            status: "SUCCEEDED",
            input_json: JSON.stringify(origin.input_json),
            started_at: now,
            finished_at: now,
          })
          .returning(["id", "public_id"])
          .executeTakeFirstOrThrow();
        const audit: JsonObject = {
          type: "MANUAL_REVIEW",
          schemaVersion: 1,
          decision: "SUBMITTED",
          actor,
          reason: request.reason,
          decidedAt: now.toISOString(),
          originRunPublicId: origin.public_id,
        };
        const candidate = await tx
          .insertInto("app.identifier_candidate")
          .values({
            resolve_run_id: run.id,
            identifier_type: request.identifierType,
            candidate_value: request.candidateValue,
            candidate_norm: norm,
            confidence_score: null,
            rank_no: 1,
            decision_status: "CANDIDATE",
            evidence_json: JSON.stringify([audit]),
            conflict_json: "[]",
          })
          .returning("public_id")
          .executeTakeFirstOrThrow();
        const result = await promoteManualInTransaction(
          tx,
          { actor, candidatePublicId: candidate.public_id, expectedVersionNo: 1 },
          { expectedProductVersion: request.expectedVersion },
        );
        await tx
          .updateTable("app.identifier_resolve_run")
          .set({
            result_json: JSON.stringify({
              operation: "MANUAL_INPUT",
              outcome: "CANDIDATES",
              automaticPromotionEnabled: false,
              originRunPublicId: origin.public_id,
              actor,
              reason: request.reason,
              expectedVersion: request.expectedVersion,
              identifierType: request.identifierType,
              candidateValue: request.candidateValue,
              candidatePublicId: candidate.public_id,
            }),
          })
          .where("id", "=", run.id)
          .execute();
        return result;
      });
    },
  };
}
