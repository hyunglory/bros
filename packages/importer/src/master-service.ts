import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { setTimeout as delay } from "node:timers/promises";
import { validateSourceProductInput, validateSourceImportContext } from "@bros/contracts";
import type { DatabaseClient, DbTransaction, JsonObject, JsonValue } from "@bros/db";
import { sql } from "kysely";

import { createBrandNormalizer } from "./brand-normalizer.js";
import { extractEmbeddedIdentifiers } from "./embedded-identifier-extractor.js";
import { createProductMatcher, type MasterMatchResult } from "./master-matcher.js";

const stage = "P2-09/v1";
const lockNamespace = "bros/master-identity/v1";
const gtinTypes = new Set(["GTIN", "EAN", "UPC"]);

function ambiguousIdentity(identifiers: readonly { type: string; normalizedValue: string }[]) {
  const families = new Map<string, Set<string>>();
  for (const id of identifiers) {
    if (id.type === "BRAND_CODE") continue;
    const family = gtinTypes.has(id.type) ? "GTIN" : id.type;
    const values = families.get(family) ?? new Set<string>();
    values.add(id.normalizedValue);
    families.set(family, values);
  }
  return [...families.values()].some((values) => values.size > 1);
}

export interface MasterServiceOptions {
  lockTimeoutMs?: number;
  maxAttempts?: number;
}

export interface MasterCreationResult {
  itemPublicId: string;
  sourcePublicId: string;
  masterPublicId: string | null;
  action: "CREATED" | "MATCHED" | "REVIEW_REQUIRED" | "SKIPPED";
  reason: string;
}

export class MasterServiceError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "MasterServiceError";
  }
}

function record(value: JsonValue | undefined): value is JsonObject {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

// All writers must use these namespaced, type-aware keys. Brand is deliberately
// omitted: a shared identifier with conflicting brands must serialize too.
export function masterIdentityLockKeys(
  identifiers: readonly { type: string; normalizedValue: string }[],
): string[] {
  return [
    ...new Set(
      identifiers
        .filter((id) => id.type !== "BRAND_CODE")
        .map((id) => {
          const family = gtinTypes.has(id.type) ? "GTIN" : id.type;
          return createHash("sha256")
            .update(JSON.stringify([lockNamespace, family, id.normalizedValue]))
            .digest()
            .readBigInt64BE()
            .toString();
        }),
    ),
  ].sort((a, b) => (BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0));
}

async function processItem(tx: DbTransaction, itemPublicId: string, lockTimeoutMs: number) {
  await sql`select set_config('lock_timeout', ${`${lockTimeoutMs}ms`}, true)`.execute(tx);
  const locator = await tx
    .selectFrom("app.import_item")
    .select("import_batch_id")
    .where("public_id", "=", itemPublicId)
    .executeTakeFirst();
  if (!locator) throw new MasterServiceError("IMPORT_ITEM_NOT_FOUND");
  // Keep the same batch -> item -> source order for every caller. The batch lock
  // also makes terminal aggregate updates safe across different items.
  const batch = await tx
    .selectFrom("app.import_batch")
    .selectAll()
    .where("id", "=", locator.import_batch_id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  if (batch.status !== "SUCCEEDED" && batch.status !== "PARTIAL_FAILED") {
    throw new MasterServiceError("SOURCE_STAGE_NOT_COMPLETE");
  }
  const item = await tx
    .selectFrom("app.import_item")
    .selectAll()
    .where("public_id", "=", itemPublicId)
    .forUpdate()
    .executeTakeFirstOrThrow();
  if (!record(item.raw_json)) throw new MasterServiceError("PERSISTED_INPUT_INVALID");
  const envelope = item.raw_json;
  if (record(envelope.masterCreation) && envelope.masterCreation.stage === stage) {
    // Only this service adds this reserved field to the validated envelope.
    return envelope.masterCreation.result as unknown as MasterCreationResult;
  }
  if (item.status !== "SUCCEEDED" || item.source_product_id === null) {
    throw new MasterServiceError("IMPORT_ITEM_NOT_READY");
  }
  const inputResult = validateSourceProductInput(envelope.mappedInput);
  const contextResult = validateSourceImportContext(envelope.context);
  if (!inputResult.ok || !contextResult.ok) throw new MasterServiceError("PERSISTED_INPUT_INVALID");
  const input = inputResult.value;
  const source = await tx
    .selectFrom("app.source_product")
    .selectAll()
    .where("id", "=", item.source_product_id)
    .forUpdate()
    .executeTakeFirstOrThrow();
  const platform = await tx
    .selectFrom("app.platform")
    .select(["code", "is_active"])
    .where("id", "=", source.platform_id)
    .executeTakeFirstOrThrow();
  if (
    source.platform_id !== batch.platform_id ||
    input.platformCode !== platform.code ||
    input.externalProductId !== source.external_product_id ||
    item.external_product_id !== source.external_product_id
  ) {
    throw new MasterServiceError("PERSISTED_IDENTITY_MISMATCH");
  }
  const result: MasterCreationResult = {
    itemPublicId,
    sourcePublicId: source.public_id,
    masterPublicId: null,
    action: "REVIEW_REQUIRED",
    reason: "INSUFFICIENT_EVIDENCE",
  };
  let match: MasterMatchResult | null = null;
  let auditInput: unknown = null;
  let masterId: string | null = null;
  // Timestamp equality alone is insufficient: two exports can share a timestamp.
  const fresh =
    source.collected_at.getTime() === Date.parse(contextResult.value.collectedAt) &&
    source.raw_product_name === input.productName &&
    source.raw_brand_name === (input.brandName ?? null) &&
    isDeepStrictEqual(source.raw_json, input.raw);
  // Explicit identifiers/options are in the item envelope, not source.raw_json.
  // Equal-time exports disagreeing on those fields cannot be ordered safely.
  const siblings = await tx
    .selectFrom("app.import_item")
    .select("raw_json")
    .where("source_product_id", "=", source.id)
    .where("id", "!=", item.id)
    .execute();
  const ambiguousSnapshot = siblings.some((sibling) => {
    if (!record(sibling.raw_json)) return false;
    const otherContext = validateSourceImportContext(sibling.raw_json.context);
    const otherInput = validateSourceProductInput(sibling.raw_json.mappedInput);
    return (
      otherContext.ok &&
      otherInput.ok &&
      Date.parse(otherContext.value.collectedAt) === source.collected_at.getTime() &&
      (!isDeepStrictEqual(otherInput.value.identifiers ?? [], input.identifiers ?? []) ||
        !isDeepStrictEqual(otherInput.value.options ?? [], input.options ?? []))
    );
  });
  if (!fresh) {
    result.action = "SKIPPED";
    result.reason = "SOURCE_SNAPSHOT_CHANGED";
  } else if (!platform.is_active) {
    result.reason = "INACTIVE_PLATFORM";
  } else if (ambiguousSnapshot) {
    result.reason = "SOURCE_IDENTITY_AMBIGUOUS";
  } else {
    const brand = await createBrandNormalizer({ db: tx }).normalize({
      platformCode: input.platformCode,
      rawBrandName: input.brandName,
    });
    const identifiers = extractEmbeddedIdentifiers(input);
    const matchInput = {
      brand,
      identifiers,
      productName: input.productName,
      optionNames: input.options ?? [],
    };
    auditInput = matchInput;
    for (const key of masterIdentityLockKeys(identifiers.candidates)) {
      await sql`select pg_advisory_xact_lock(${key}::bigint)`.execute(tx);
    }
    // Explicit READ COMMITTED below guarantees a new snapshot after the wait.
    match = await createProductMatcher({ db: tx }).match(matchInput);
    result.reason = match.reason;
    if (ambiguousIdentity(identifiers.candidates)) {
      result.reason = "AMBIGUOUS_SOURCE_IDENTITY";
    } else if (match.outcome === "MATCH_EXISTING" && match.selectedMasterPublicId) {
      const selected = await tx
        .selectFrom("app.product_master")
        .select(["id", "public_id"])
        .where("public_id", "=", match.selectedMasterPublicId)
        .forUpdate()
        .executeTakeFirstOrThrow();
      // Re-evaluate after row-lock waits (e.g. status changes by another writer).
      match = await createProductMatcher({ db: tx }).match(matchInput);
      result.reason = match.reason;
      if (
        match.outcome === "MATCH_EXISTING" &&
        match.selectedMasterPublicId === selected.public_id
      ) {
        if (source.product_id !== null && source.product_id !== selected.id) {
          result.reason = "EXISTING_LINK_CONFLICT";
        } else {
          masterId = selected.id;
          result.masterPublicId = selected.public_id;
          result.action = "MATCHED";
        }
      }
    } else if (match.outcome === "NEW_MASTER_CANDIDATE" && brand.status === "RESOLVED") {
      // Multiple values in one identity family can be SKU identities. Do not
      // promote them to a single product-level identity before SKU mapping.
      const usable = identifiers.candidates.filter((id) => id.type !== "BRAND_CODE");
      if (source.product_id !== null) {
        result.reason = "EXISTING_LINK_CONFLICT";
      } else {
        const brandRow = await tx
          .selectFrom("app.brand")
          .select(["id", "is_active"])
          .where("public_id", "=", brand.brand.publicId)
          .forShare()
          .executeTakeFirstOrThrow();
        if (!brandRow.is_active) {
          result.reason = "INACTIVE_BRAND";
        } else {
          const created = await tx
            .insertInto("app.product_master")
            .values({
              brand_id: brandRow.id,
              product_name: input.productName,
              product_name_norm: input.productName
                .normalize("NFKC")
                .trim()
                .replace(/\s+/gu, " ")
                .toLocaleLowerCase("en-US"),
              created_method: "IMPORT_STRONG_IDENTIFIER",
              status: "REVIEW_REQUIRED",
              identifier_status: "CANDIDATE",
              metadata_json: JSON.stringify({
                importMatchOptionNames: (input.options ?? []).map((o) => o.rawOptionName),
                createdFromItem: itemPublicId,
                stage,
              }),
            })
            .returning(["id", "public_id"])
            .executeTakeFirstOrThrow();
          masterId = created.id;
          result.masterPublicId = created.public_id;
          result.action = "CREATED";
          for (const identifier of usable) {
            await tx
              .insertInto("app.product_identifier")
              .values({
                product_id: masterId,
                identifier_type: identifier.type,
                identifier_value: identifier.value,
                identifier_norm: identifier.normalizedValue,
                is_verified: false,
                evidence_type: "SOURCE_EMBEDDED",
                evidence_json: JSON.stringify({
                  stage,
                  itemPublicId,
                  sourcePublicId: source.public_id,
                  provenance: identifier.provenance,
                }),
              })
              .execute();
          }
        }
      }
    }
  }
  if (result.action !== "SKIPPED") {
    await tx
      .updateTable("app.source_product")
      .set({
        ...(masterId !== null ? { product_id: masterId } : {}),
        match_status: masterId !== null ? "MATCHED" : "REVIEW_REQUIRED",
        match_confidence: null,
        updated_at: new Date(),
      })
      .where("id", "=", source.id)
      .execute();
  }
  await tx
    .updateTable("app.import_item")
    .set({
      action_type: result.action,
      status:
        result.action === "REVIEW_REQUIRED"
          ? "REVIEW_REQUIRED"
          : result.action === "SKIPPED"
            ? "SKIPPED"
            : "SUCCEEDED",
      raw_json: JSON.stringify({
        ...envelope,
        masterCreation: {
          stage,
          result,
          input: auditInput,
          match,
          completedAt: new Date().toISOString(),
          sourceAction: item.action_type,
        },
      }),
      processed_at: new Date(),
    })
    .where("id", "=", item.id)
    .execute();
  const counts = await tx
    .selectFrom("app.import_item")
    .select([
      sql<number>`count(*) filter (where status = 'SUCCEEDED')::integer`.as("success_count"),
      sql<number>`count(*) filter (where status = 'REVIEW_REQUIRED')::integer`.as("review_count"),
      sql<number>`count(*) filter (where status = 'SKIPPED')::integer`.as("skipped_count"),
      sql<number>`count(*) filter (where status = 'FAILED')::integer`.as("failed_count"),
    ])
    .where("import_batch_id", "=", batch.id)
    .executeTakeFirstOrThrow();
  await tx.updateTable("app.import_batch").set(counts).where("id", "=", batch.id).execute();
  return result;
}

export function createMasterService(
  database: Pick<DatabaseClient, "db">,
  options: MasterServiceOptions = {},
) {
  const lockTimeoutMs = options.lockTimeoutMs ?? 1_000;
  const maxAttempts = options.maxAttempts ?? 3;
  if (
    !Number.isInteger(lockTimeoutMs) ||
    lockTimeoutMs < 1 ||
    lockTimeoutMs > 10_000 ||
    !Number.isInteger(maxAttempts) ||
    maxAttempts < 1 ||
    maxAttempts > 5
  ) {
    throw new MasterServiceError("INVALID_MASTER_SERVICE_OPTIONS");
  }
  return {
    process: async (itemPublicId: string): Promise<MasterCreationResult> => {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          itemPublicId,
        )
      ) {
        throw new MasterServiceError("INVALID_IMPORT_ITEM_ID");
      }
      for (let attempt = 1; ; attempt++) {
        try {
          return await database.db
            .transaction()
            .setIsolationLevel("read committed")
            .execute((tx) => processItem(tx, itemPublicId, lockTimeoutMs));
        } catch (error) {
          if (error instanceof MasterServiceError) throw error;
          const code =
            typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
          if (code === "55P03" || code === "40P01" || code === "40001") {
            if (attempt === maxAttempts)
              throw new MasterServiceError("MASTER_LOCK_RETRY_EXHAUSTED");
            await delay(25 * attempt);
            continue;
          }
          // Connection loss at commit has unknown outcome; let the caller replay
          // the same item instead of blindly rerunning an uncertain commit.
          throw new MasterServiceError("MASTER_PERSISTENCE_FAILED");
        }
      }
    },
  };
}
