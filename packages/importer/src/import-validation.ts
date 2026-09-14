import {
  type SourceImportContext,
  type SourceInputValidationIssue,
  type SourceProductInput,
  type SourceRawJson,
  validateSourceImportContext,
  validateSourceProductInput,
  validateSourceRawJson,
} from "@bros/contracts";
import type { DatabaseClient, DbTransaction, JsonObject } from "@bros/db";

import type { XlsxImportIssue, XlsxImportRow } from "./xlsx-import-adapter.js";

const validationStage = "P2-04";

export type ImportValidationIssue =
  Pick<SourceInputValidationIssue, "code" | "path"> | XlsxImportIssue;

export interface ImportValidationRequest {
  context: SourceImportContext;
  platformCode: string;
  rows: readonly XlsxImportRow[];
  sourceName: string;
}

export interface ImportValidationResult {
  acceptedCount: number;
  batchPublicId: string;
  rejectedCount: number;
  totalCount: number;
}

export type ImportValidationErrorCode =
  | "DUPLICATE_SOURCE_ROW"
  | "INVALID_IMPORT_CONTEXT"
  | "INVALID_PLATFORM_CODE"
  | "INVALID_SOURCE_NAME"
  | "SOURCE_PLATFORM_NOT_FOUND";

export class ImportValidationError extends Error {
  readonly code: ImportValidationErrorCode;

  constructor(code: ImportValidationErrorCode, message: string) {
    super(message);
    this.name = "ImportValidationError";
    this.code = code;
  }
}

interface ValidationEnvelope {
  context: SourceImportContext;
  mappedInput?: SourceProductInput;
  raw: SourceRawJson | null;
  schemaVersion: 1;
  sourceLocator: string;
  sourceRowNumber: number;
  validation: {
    issues: ImportValidationIssue[];
    outcome: "ACCEPTED" | "REJECTED";
    stage: typeof validationStage;
  };
}

interface ValidatedRow {
  externalProductId: string | null;
  issues: ImportValidationIssue[];
  outcome: "ACCEPTED" | "REJECTED";
  payload: ValidationEnvelope;
  sourceRowNumber: number;
}

function issue(code: string, path: string): ImportValidationIssue {
  return { code, path } as ImportValidationIssue;
}

function isNonBlank(value: string): boolean {
  return value.trim().length > 0;
}

function asJson(value: JsonObject): string {
  return JSON.stringify(value);
}

function validateRow(
  row: XlsxImportRow,
  context: SourceImportContext,
  platformCode: string,
): ValidatedRow {
  const adapterIssues = [...row.issues];
  const rawCandidate = row.outcome === "MAPPED" ? row.input.raw : row.raw;
  const rawValidation = validateSourceRawJson(rawCandidate);
  const issues: ImportValidationIssue[] = [...adapterIssues];

  if (!rawValidation.ok) {
    issues.push(...rawValidation.issues);
  }

  let input: SourceProductInput | undefined;
  if (row.outcome === "MAPPED") {
    const inputValidation = validateSourceProductInput(row.input);
    if (!inputValidation.ok) {
      issues.push(...inputValidation.issues);
    } else if (inputValidation.value.platformCode !== platformCode) {
      issues.push(issue("PLATFORM_CODE_MISMATCH", "/platformCode"));
    } else {
      input = inputValidation.value;
    }
  }

  const accepted =
    row.outcome === "MAPPED" && input !== undefined && rawValidation.ok && issues.length === 0;
  const payload: ValidationEnvelope = {
    context,
    raw: rawValidation.ok ? rawValidation.value : null,
    schemaVersion: 1,
    sourceLocator: row.sourceLocator,
    sourceRowNumber: row.sourceRowNumber,
    validation: {
      issues,
      outcome: accepted ? "ACCEPTED" : "REJECTED",
      stage: validationStage,
    },
  };
  if (accepted && input !== undefined) {
    payload.mappedInput = input;
  }

  return {
    externalProductId: accepted && input !== undefined ? input.externalProductId : null,
    issues,
    outcome: accepted ? "ACCEPTED" : "REJECTED",
    payload,
    sourceRowNumber: row.sourceRowNumber,
  };
}

function validateRequest(request: ImportValidationRequest): void {
  if (!isNonBlank(request.platformCode)) {
    throw new ImportValidationError("INVALID_PLATFORM_CODE", "Platform code is required");
  }
  if (!isNonBlank(request.sourceName)) {
    throw new ImportValidationError("INVALID_SOURCE_NAME", "Source name is required");
  }
  if (!validateSourceImportContext(request.context).ok) {
    throw new ImportValidationError("INVALID_IMPORT_CONTEXT", "Import context is invalid");
  }

  const sourceRows = new Set<number>();
  for (const row of request.rows) {
    if (!Number.isInteger(row.sourceRowNumber) || row.sourceRowNumber < 1) {
      throw new ImportValidationError("DUPLICATE_SOURCE_ROW", "Source row number is invalid");
    }
    if (sourceRows.has(row.sourceRowNumber)) {
      throw new ImportValidationError("DUPLICATE_SOURCE_ROW", "Source row number is duplicated");
    }
    sourceRows.add(row.sourceRowNumber);
  }
}

async function persist(
  transaction: DbTransaction,
  request: ImportValidationRequest,
): Promise<ImportValidationResult> {
  const platform = await transaction
    .selectFrom("app.platform")
    .select(["id"])
    .where("code", "=", request.platformCode)
    .where("platform_role", "=", "SOURCE")
    .where("is_active", "=", true)
    .executeTakeFirst();
  if (platform === undefined) {
    throw new ImportValidationError(
      "SOURCE_PLATFORM_NOT_FOUND",
      "Active source platform is not configured",
    );
  }

  const rows = request.rows.map((row) => validateRow(row, request.context, request.platformCode));
  const acceptedCount = rows.filter((row) => row.outcome === "ACCEPTED").length;
  const rejectedCount = rows.length - acceptedCount;
  const batch = await transaction
    .insertInto("app.import_batch")
    .values({
      config_json: asJson({ context: request.context, schemaVersion: 1, validationStage }),
      failed_count: rejectedCount,
      platform_id: platform.id,
      source_name: request.sourceName.trim(),
      started_at: new Date(),
      success_count: acceptedCount,
      total_count: rows.length,
      import_type: "SOURCE_XLSX",
      status: "RUNNING",
    })
    .returning(["id", "public_id"])
    .executeTakeFirstOrThrow();

  for (const row of rows) {
    const firstIssue = row.issues[0];
    await transaction
      .insertInto("app.import_item")
      .values({
        action_type: row.outcome === "REJECTED" ? "FAILED" : null,
        error_code:
          row.outcome === "REJECTED" ? (firstIssue?.code ?? "INPUT_VALIDATION_FAILED") : null,
        error_message: row.outcome === "REJECTED" ? "Source input validation failed" : null,
        external_product_id: row.externalProductId,
        import_batch_id: batch.id,
        input_row_no: row.sourceRowNumber,
        raw_json: JSON.stringify(row.payload),
        status: row.outcome === "REJECTED" ? "FAILED" : "PENDING",
      })
      .execute();
  }

  return { acceptedCount, batchPublicId: batch.public_id, rejectedCount, totalCount: rows.length };
}

export function createImportValidationService(database: Pick<DatabaseClient, "transaction">) {
  return {
    persist: async (request: ImportValidationRequest): Promise<ImportValidationResult> => {
      validateRequest(request);
      return database.transaction((transaction) => persist(transaction, request));
    },
  };
}
