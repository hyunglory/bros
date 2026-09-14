import type { SourceIdentifierType, SourceOptionInput } from "@bros/contracts";
import type { DatabaseClient, JsonObject } from "@bros/db";
import { sql } from "kysely";

import type { BrandNormalizationResult } from "./brand-normalizer.js";
import type {
  EmbeddedIdentifierExtraction,
  ExtractedIdentifierCandidate,
  IdentifierProvenance,
} from "./embedded-identifier-extractor.js";

const NAME_CANDIDATE_LIMIT = 20;
const NAME_CANDIDATE_MINIMUM_SIMILARITY = 0.3;
const RESULT_CANDIDATE_LIMIT = 20;
const GTIN_TYPES = new Set<SourceIdentifierType>(["GTIN", "EAN", "UPC"]);
const MODEL_TYPES = new Set<SourceIdentifierType>(["MODEL_NO", "MPN", "STYLE_CODE"]);

export type MasterMatchOutcome = "MATCH_EXISTING" | "NEW_MASTER_CANDIDATE" | "REVIEW_REQUIRED";

export type MasterMatchReason =
  | "AMBIGUOUS_STRONG_MATCH"
  | "HARD_CONFLICT"
  | "INSUFFICIENT_EVIDENCE"
  | "IDENTIFIER_EXTRACTION_TRUNCATED"
  | "NAME_OR_UNVERIFIED_EVIDENCE_ONLY"
  | "NO_CANDIDATE"
  | "STRONG_IDENTIFIER_MATCH";

export type MasterMatchConflict =
  "CONFLICT_BRAND" | "CONFLICT_GTIN" | "CONFLICT_MODEL" | "CONFLICT_VARIANT" | "INACTIVE_MASTER";

export type MasterMatchEvidenceType =
  | "BRAND_MATCH"
  | "IDENTIFIER_EXACT"
  | "OPTION_OVERLAP"
  | "TITLE_SIMILARITY"
  | "VERIFIED_GTIN_EXACT"
  | "VERIFIED_MODEL_EXACT";

export interface MasterIdentifierSnapshot {
  isVerified: boolean;
  normalizedValue: string;
  publicId: string;
  type: SourceIdentifierType;
}

export interface MasterCandidateSnapshot {
  brandPublicId: string | null;
  identifiers: MasterIdentifierSnapshot[];
  masterPublicId: string;
  optionKeys: string[];
  productName: string;
  productNameNorm: string;
  status: "ACTIVE" | "INACTIVE" | "REVIEW_REQUIRED";
  titleSimilarity: number;
}

export interface ProductMatchInput {
  brand: BrandNormalizationResult;
  identifiers: EmbeddedIdentifierExtraction;
  optionNames?: Pick<SourceOptionInput, "rawOptionName">[];
  productName: string;
}

export interface MasterMatchEvidence {
  masterIdentifierPublicId?: string;
  normalizedValue?: string;
  sourceProvenance?: IdentifierProvenance[];
  type: MasterMatchEvidenceType;
  value: number | string;
}

export interface EvaluatedMasterCandidate {
  conflicts: MasterMatchConflict[];
  evidence: MasterMatchEvidence[];
  masterPublicId: string;
  productName: string;
  strong: boolean;
  titleSimilarity: number;
}

export interface MasterMatchResult {
  candidates: EvaluatedMasterCandidate[];
  outcome: MasterMatchOutcome;
  reason: MasterMatchReason;
  selectedMasterPublicId?: string;
}

function normalizeComparableText(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en-US");
}

function identifierFamily(type: SourceIdentifierType): "GTIN" | "MODEL" | SourceIdentifierType {
  if (GTIN_TYPES.has(type)) return "GTIN";
  if (MODEL_TYPES.has(type)) return "MODEL";
  return type;
}

function identifiersInFamily(
  identifiers: readonly { normalizedValue: string; type: SourceIdentifierType }[],
  family: "GTIN" | "MODEL",
): Set<string> {
  return new Set(
    identifiers
      .filter((identifier) => identifierFamily(identifier.type) === family)
      .map((identifier) => identifier.normalizedValue),
  );
}

function hasTypedModelConflict(
  sourceIdentifiers: readonly { normalizedValue: string; type: SourceIdentifierType }[],
  masterIdentifiers: readonly { normalizedValue: string; type: SourceIdentifierType }[],
): boolean {
  return [...MODEL_TYPES].some((type) => {
    const sourceValues = new Set(
      sourceIdentifiers
        .filter((identifier) => identifier.type === type)
        .map((identifier) => identifier.normalizedValue),
    );
    const masterValues = new Set(
      masterIdentifiers
        .filter((identifier) => identifier.type === type)
        .map((identifier) => identifier.normalizedValue),
    );
    return hasDisjointPopulatedSets(sourceValues, masterValues);
  });
}

function hasDisjointPopulatedSets(left: Set<string>, right: Set<string>): boolean {
  if (left.size === 0 || right.size === 0) return false;
  return ![...left].some((value) => right.has(value));
}

function matchingMasterIdentifiers(
  source: ExtractedIdentifierCandidate,
  masterIdentifiers: readonly MasterIdentifierSnapshot[],
): MasterIdentifierSnapshot[] {
  if (source.type === "BRAND_CODE") return [];
  const family = identifierFamily(source.type);
  return masterIdentifiers.filter(
    (identifier) =>
      identifier.normalizedValue === source.normalizedValue &&
      (family === "GTIN"
        ? identifierFamily(identifier.type) === "GTIN"
        : identifier.type === source.type),
  );
}

function evaluateCandidate(
  input: ProductMatchInput,
  candidate: MasterCandidateSnapshot,
): EvaluatedMasterCandidate {
  const evidence: MasterMatchEvidence[] = [];
  const conflicts = new Set<MasterMatchConflict>();
  const resolvedBrandPublicId =
    input.brand.status === "RESOLVED" ? input.brand.brand.publicId : undefined;

  if (candidate.status === "INACTIVE") conflicts.add("INACTIVE_MASTER");
  if (resolvedBrandPublicId !== undefined) {
    if (candidate.brandPublicId === resolvedBrandPublicId) {
      evidence.push({ type: "BRAND_MATCH", value: resolvedBrandPublicId });
    } else if (candidate.brandPublicId !== null) {
      conflicts.add("CONFLICT_BRAND");
    }
  }

  for (const sourceIdentifier of input.identifiers.candidates) {
    for (const masterIdentifier of matchingMasterIdentifiers(
      sourceIdentifier,
      candidate.identifiers,
    )) {
      const family = identifierFamily(sourceIdentifier.type);
      const verifiedEvidence =
        masterIdentifier.isVerified && family === "GTIN"
          ? "VERIFIED_GTIN_EXACT"
          : masterIdentifier.isVerified && family === "MODEL"
            ? "VERIFIED_MODEL_EXACT"
            : "IDENTIFIER_EXACT";
      evidence.push({
        masterIdentifierPublicId: masterIdentifier.publicId,
        normalizedValue: sourceIdentifier.normalizedValue,
        sourceProvenance: sourceIdentifier.provenance,
        type: verifiedEvidence,
        value: sourceIdentifier.type,
      });
    }
  }

  const sourceGtin = identifiersInFamily(input.identifiers.candidates, "GTIN");
  const masterGtin = identifiersInFamily(candidate.identifiers, "GTIN");
  if (hasDisjointPopulatedSets(sourceGtin, masterGtin)) conflicts.add("CONFLICT_GTIN");

  if (hasTypedModelConflict(input.identifiers.candidates, candidate.identifiers)) {
    conflicts.add("CONFLICT_MODEL");
  }

  const sourceOptions = new Set(
    (input.optionNames ?? []).map((option) => normalizeComparableText(option.rawOptionName)),
  );
  const masterOptions = new Set(candidate.optionKeys.map(normalizeComparableText));
  if (sourceOptions.size > 0 && masterOptions.size > 0) {
    if (hasDisjointPopulatedSets(sourceOptions, masterOptions)) {
      conflicts.add("CONFLICT_VARIANT");
    } else {
      evidence.push({
        type: "OPTION_OVERLAP",
        value: [...sourceOptions].filter((value) => masterOptions.has(value)).length,
      });
    }
  }

  if (candidate.titleSimilarity > 0) {
    evidence.push({ type: "TITLE_SIMILARITY", value: candidate.titleSimilarity });
  }

  const hasVerifiedExact = evidence.some(
    (item) => item.type === "VERIFIED_GTIN_EXACT" || item.type === "VERIFIED_MODEL_EXACT",
  );
  const hasBrandIdentifierExact =
    evidence.some((item) => item.type === "BRAND_MATCH") &&
    evidence.some((item) => item.type === "IDENTIFIER_EXACT");

  return {
    conflicts: [...conflicts].sort(),
    evidence,
    masterPublicId: candidate.masterPublicId,
    productName: candidate.productName,
    strong: hasVerifiedExact || hasBrandIdentifierExact,
    titleSimilarity: candidate.titleSimilarity,
  };
}

function compareCandidates(
  left: EvaluatedMasterCandidate,
  right: EvaluatedMasterCandidate,
): number {
  if (left.strong !== right.strong) return left.strong ? -1 : 1;
  if (left.conflicts.length !== right.conflicts.length)
    return left.conflicts.length - right.conflicts.length;
  if (left.titleSimilarity !== right.titleSimilarity)
    return right.titleSimilarity - left.titleSimilarity;
  return left.masterPublicId.localeCompare(right.masterPublicId, "en-US");
}

/**
 * Evaluates already-discovered MASTER snapshots. The result is a recommendation;
 * this function never mutates or links a source product.
 */
export function matchMasterCandidates(
  input: ProductMatchInput,
  snapshots: readonly MasterCandidateSnapshot[],
): MasterMatchResult {
  const candidates = snapshots
    .map((candidate) => evaluateCandidate(input, candidate))
    .filter((candidate) => candidate.evidence.length > 0 || candidate.conflicts.length > 0)
    .sort(compareCandidates)
    .slice(0, RESULT_CANDIDATE_LIMIT);

  if (input.identifiers.truncated) {
    return { candidates, outcome: "REVIEW_REQUIRED", reason: "IDENTIFIER_EXTRACTION_TRUNCATED" };
  }

  const strongCandidates = candidates.filter((candidate) => candidate.strong);
  if (strongCandidates.length > 1) {
    return { candidates, outcome: "REVIEW_REQUIRED", reason: "AMBIGUOUS_STRONG_MATCH" };
  }
  const strongCandidate = strongCandidates[0];
  if (strongCandidate !== undefined) {
    if (strongCandidate.conflicts.length > 0) {
      return { candidates, outcome: "REVIEW_REQUIRED", reason: "HARD_CONFLICT" };
    }
    return {
      candidates,
      outcome: "MATCH_EXISTING",
      reason: "STRONG_IDENTIFIER_MATCH",
      selectedMasterPublicId: strongCandidate.masterPublicId,
    };
  }

  if (candidates.some((candidate) => candidate.conflicts.length > 0)) {
    return { candidates, outcome: "REVIEW_REQUIRED", reason: "HARD_CONFLICT" };
  }
  if (candidates.length > 0) {
    return { candidates, outcome: "REVIEW_REQUIRED", reason: "NAME_OR_UNVERIFIED_EVIDENCE_ONLY" };
  }
  const hasNewIdentityEvidence =
    input.brand.status === "RESOLVED" &&
    input.identifiers.candidates.some((identifier) => identifier.type !== "BRAND_CODE");
  return hasNewIdentityEvidence
    ? { candidates, outcome: "NEW_MASTER_CANDIDATE", reason: "NO_CANDIDATE" }
    : { candidates, outcome: "REVIEW_REQUIRED", reason: "INSUFFICIENT_EVIDENCE" };
}

interface ProductRow {
  brandPublicId: string | null;
  id: string;
  masterPublicId: string;
  productName: string;
  productNameNorm: string;
  status: "ACTIVE" | "INACTIVE" | "REVIEW_REQUIRED";
  titleSimilarity: number;
  metadata: JsonObject;
}

export function createProductMatcher(database: Pick<DatabaseClient, "db">) {
  return {
    match: async (input: ProductMatchInput): Promise<MasterMatchResult> => {
      const usableIdentifiers = input.identifiers.candidates.filter(
        (identifier) => identifier.type !== "BRAND_CODE",
      );
      const identifierNorms = [
        ...new Set(usableIdentifiers.map((identifier) => identifier.normalizedValue)),
      ];
      const productIds = new Set<string>();

      if (identifierNorms.length > 0) {
        const rows = await database.db
          .selectFrom("app.product_identifier")
          .select("product_id as productId")
          .where("identifier_norm", "in", identifierNorms)
          .execute();
        rows.forEach((row) => productIds.add(row.productId));
      }

      const normalizedName = normalizeComparableText(input.productName);
      const titleSimilarity = sql<number>`similarity(app.product_master.product_name_norm, ${normalizedName})`;
      const productRows = new Map<string, ProductRow>();

      if (input.brand.status === "RESOLVED") {
        const rows = await database.db
          .selectFrom("app.product_master")
          .leftJoin("app.brand", "app.brand.id", "app.product_master.brand_id")
          .select([
            "app.product_master.id as id",
            "app.product_master.public_id as masterPublicId",
            "app.product_master.product_name as productName",
            "app.product_master.product_name_norm as productNameNorm",
            "app.product_master.status as status",
            "app.product_master.metadata_json as metadata",
            "app.brand.public_id as brandPublicId",
            titleSimilarity.as("titleSimilarity"),
          ])
          .where("app.brand.public_id", "=", input.brand.brand.publicId)
          // Retrieval threshold only. Title similarity never produces MATCH_EXISTING.
          .where(titleSimilarity, ">=", NAME_CANDIDATE_MINIMUM_SIMILARITY)
          .orderBy(titleSimilarity, "desc")
          .orderBy("app.product_master.public_id", "asc")
          .limit(NAME_CANDIDATE_LIMIT)
          .execute();
        rows.forEach((row) =>
          productRows.set(row.id, { ...row, titleSimilarity: Number(row.titleSimilarity) }),
        );
      }

      if (productIds.size > 0) {
        const rows = await database.db
          .selectFrom("app.product_master")
          .leftJoin("app.brand", "app.brand.id", "app.product_master.brand_id")
          .select([
            "app.product_master.id as id",
            "app.product_master.public_id as masterPublicId",
            "app.product_master.product_name as productName",
            "app.product_master.product_name_norm as productNameNorm",
            "app.product_master.status as status",
            "app.product_master.metadata_json as metadata",
            "app.brand.public_id as brandPublicId",
            titleSimilarity.as("titleSimilarity"),
          ])
          .where("app.product_master.id", "in", [...productIds])
          .execute();
        rows.forEach((row) =>
          productRows.set(row.id, { ...row, titleSimilarity: Number(row.titleSimilarity) }),
        );
      }

      if (productRows.size === 0) return matchMasterCandidates(input, []);
      const ids = [...productRows.keys()];
      const [identifierRows, skuRows] = await Promise.all([
        database.db
          .selectFrom("app.product_identifier")
          .select([
            "product_id as productId",
            "public_id as publicId",
            "identifier_type as type",
            "identifier_norm as normalizedValue",
            "is_verified as isVerified",
          ])
          .where("product_id", "in", ids)
          .execute(),
        database.db
          .selectFrom("app.product_sku")
          .select(["product_id as productId", "option_key as optionKey"])
          .where("product_id", "in", ids)
          .execute(),
      ]);

      const snapshots = [...productRows.values()].map((product): MasterCandidateSnapshot => ({
        brandPublicId: product.brandPublicId,
        identifiers: identifierRows
          .filter((identifier) => identifier.productId === product.id)
          .map((identifier) => ({
            isVerified: identifier.isVerified,
            normalizedValue: identifier.normalizedValue,
            publicId: identifier.publicId,
            type: identifier.type,
          })),
        masterPublicId: product.masterPublicId,
        // P2-09 saves source option names before P2-10 has created any SKUs.
        optionKeys:
          Array.isArray(product.metadata.importMatchOptionNames) &&
          product.metadata.importMatchOptionNames.length > 0
            ? product.metadata.importMatchOptionNames.filter(
                (name): name is string => typeof name === "string",
              )
            : skuRows.filter((sku) => sku.productId === product.id).map((sku) => sku.optionKey),
        productName: product.productName,
        productNameNorm: product.productNameNorm,
        status: product.status,
        titleSimilarity: product.titleSimilarity,
      }));
      return matchMasterCandidates(input, snapshots);
    },
  };
}
