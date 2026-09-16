import type { DatabaseClient } from "@bros/db";
import { sql } from "kysely";
import { createSourceProductUpsertService } from "./source-product-upsert.js";
import { createMasterService } from "./master-service.js";
import { createSkuMapper } from "./sku-mapper.js";
import { createImageRegistrar } from "./image-registrar.js";
import { createImportResultRecorder } from "./import-result-recorder.js";

export interface ImportChunkOptions {
  chunkSize: number;
  concurrency: number;
}
export const importChunkDefaults: Readonly<ImportChunkOptions> = Object.freeze({
  chunkSize: 100,
  concurrency: 2,
});
export interface ImportChunkProgress {
  phase: "source" | "pipeline";
  chunks: number;
  visitedCount: number;
}
export interface ImportProcessingContext {
  signal: AbortSignal;
  finalAttempt: boolean;
  delivery?: { provider: string; providerId: string; attempt: number };
  checkpoint?: (progress: ImportChunkProgress) => Promise<void>;
}
export class ImportChunkError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "ImportChunkError";
  }
}

export function validateImportChunkOptions(options: ImportChunkOptions): void {
  if (
    !Number.isInteger(options.chunkSize) ||
    options.chunkSize < 1 ||
    options.chunkSize > 1000 ||
    !Number.isInteger(options.concurrency) ||
    options.concurrency < 1 ||
    options.concurrency > 16
  ) {
    throw new ImportChunkError("INVALID_IMPORT_CHUNK_OPTIONS");
  }
}

export function createImportChunkProcessor(
  database: DatabaseClient,
  overrides: Partial<ImportChunkOptions> = {},
) {
  const options = { ...importChunkDefaults, ...overrides };
  validateImportChunkOptions(options);
  const source = createSourceProductUpsertService(database);
  const master = createMasterService(database);
  const sku = createSkuMapper(database);
  const image = createImageRegistrar(database);
  const recorder = createImportResultRecorder(database);
  return {
    async process(batchPublicId: string, context: ImportProcessingContext): Promise<void> {
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
          batchPublicId,
        )
      ) {
        throw new ImportChunkError("INVALID_IMPORT_BATCH_ID");
      }
      // A dedicated transaction owns only the advisory lock, never business row writes.
      // It prevents two processes/expired deliveries from running the same batch together.
      // Each stage still commits independently. Pool capacity must leave room for stage work.
      await database.transaction(async (lease) => {
        const lock = await sql<{ acquired: boolean }>`select pg_try_advisory_xact_lock(
          hashtextextended(${`bros/import/v1/${batchPublicId}`}, 0)) as acquired`.execute(lease);
        if (!lock.rows[0]?.acquired) throw new ImportChunkError("IMPORT_BATCH_BUSY");
        const guard = async () => {
          context.signal.throwIfAborted();
          await sql`select 1`.execute(lease);
          if (context.delivery) {
            const owner = await lease
              .selectFrom("app.import_batch")
              .select(
                sql<boolean>`config_json->'importQueue'->>'provider' = ${context.delivery.provider}
                and config_json->'importQueue'->>'providerId' = ${context.delivery.providerId}
                and config_json->'importQueue'->>'attempt' = ${String(context.delivery.attempt)}
                and config_json->'importQueue'->>'status' = 'RUNNING'`.as("valid"),
              )
              .where("public_id", "=", batchPublicId)
              .executeTakeFirst();
            if (!owner?.valid) throw new ImportChunkError("IMPORT_OWNERSHIP_CHANGED");
          }
          context.signal.throwIfAborted();
        };
        await guard();
        const batch = await database.db
          .selectFrom("app.import_batch")
          .select(["id", "total_count"])
          .where("public_id", "=", batchPublicId)
          .executeTakeFirstOrThrow();
        if (batch.total_count === 0) throw new ImportChunkError("EMPTY_IMPORT_BATCH");
        const phases = ["source", "pipeline"] as const;
        for (const phase of phases) {
          let cursor = 0;
          let chunks = 0;
          let visitedCount = 0;
          let retryNeeded = false;
          for (;;) {
            await guard();
            const rows = await database.db
              .selectFrom("app.import_item")
              .select(["public_id", "input_row_no"])
              .where("import_batch_id", "=", batch.id)
              .where("input_row_no", ">", cursor)
              .orderBy("input_row_no")
              .limit(options.chunkSize)
              .execute();
            if (rows.length === 0) break;
            let next = 0;
            const results = await Promise.allSettled(
              Array.from({ length: Math.min(options.concurrency, rows.length) }, async () => {
                while (next < rows.length) {
                  await guard();
                  const row = rows[next++];
                  if (!row) break;
                  if (phase === "source") {
                    try {
                      await source.processItem(row.public_id);
                    } catch {
                      await guard();
                      if (context.finalAttempt) await source.failItem(row.public_id);
                      else retryNeeded = true;
                    }
                  } else {
                    const item = await database.db
                      .selectFrom("app.import_item")
                      .select(["status", "source_product_id", "raw_json"])
                      .where("public_id", "=", row.public_id)
                      .executeTakeFirstOrThrow();
                    const raw = item.raw_json;
                    if (
                      raw &&
                      typeof raw === "object" &&
                      !Array.isArray(raw) &&
                      raw.pipelineTracking
                    )
                      continue;
                    if (item.status === "FAILED" && item.source_product_id === null) {
                      await recorder.record(row.public_id);
                      continue;
                    }
                    let failed = false;
                    for (const [stage, service] of [
                      ["P2-09", master],
                      ["P2-10", sku],
                      ["P2-11", image],
                    ] as const) {
                      await guard();
                      try {
                        await service.process(row.public_id);
                      } catch {
                        await guard();
                        if (context.finalAttempt) {
                          await recorder.recordFailure({
                            itemPublicId: row.public_id,
                            stage,
                            errorCode:
                              stage === "P2-09"
                                ? "MASTER_STAGE_FAILED"
                                : stage === "P2-10"
                                  ? "SKU_STAGE_FAILED"
                                  : "IMAGE_STAGE_FAILED",
                          });
                        } else retryNeeded = true;
                        failed = true;
                        break;
                      }
                    }
                    if (!failed) {
                      await guard();
                      await recorder.record(row.public_id);
                    }
                  }
                }
              }),
            );
            // Drain all in-flight stages before propagating failure or releasing the lease.
            if (results.some((result) => result.status === "rejected")) {
              throw new ImportChunkError("IMPORT_CHUNK_INTERRUPTED");
            }
            const last = rows.at(-1);
            if (!last) throw new ImportChunkError("IMPORT_CHUNK_EMPTY");
            cursor = last.input_row_no;
            chunks++;
            visitedCount += rows.length;
            await guard();
            await context.checkpoint?.({ phase, chunks, visitedCount });
          }
          if (retryNeeded) throw new ImportChunkError("IMPORT_ITEMS_RETRY_REQUIRED");
          if (phase === "source") {
            await guard();
            await source.finish(batchPublicId);
          }
        }
      });
    },
  };
}
