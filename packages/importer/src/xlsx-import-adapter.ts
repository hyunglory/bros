import { Buffer } from "node:buffer";

import * as XLSX from "@e965/xlsx";

import {
  type SourceImportContext,
  type SourceInputValidationIssue,
  type SourceProductInput,
  validateSourceImportContext,
  validateSourceProductInput,
} from "@bros/contracts";

export const firstSourceSheetName = "상품 목록";
export const firstSourceHeaderRow = 5;
export const maximumXlsxBytes = 25 * 1024 * 1024;
export const maximumXlsxDataRows = 100_000;

const requiredHeaders = [
  "원본사이트",
  "원본상품코드",
  "상품명",
  "브랜드",
  "카테고리코드",
  "재고수",
  "상태",
  "옵션수",
  "옵션명 목록",
  "옵션 이미지 URL 목록",
  "대표이미지 URL",
  "원문상품 URL(추정)",
  "내부 상품코드",
  "원가(내보내기값)",
  "판매가(내보내기값)",
] as const;

const platformCodes = {
  "MUSINSA.com": "MUSINSA",
  "OliveYoung.co.kr": "OLIVEYOUNG",
} as const;

const platformHosts = {
  MUSINSA: ["musinsa.com"],
  OLIVEYOUNG: ["oliveyoung.co.kr"],
} as const;

export type XlsxImportErrorCode =
  | "INVALID_IMPORT_CONTEXT"
  | "INVALID_SOURCE_HEADER"
  | "INVALID_WORKBOOK"
  | "SOURCE_SHEET_NOT_FOUND"
  | "WORKBOOK_TOO_LARGE"
  | "WORKBOOK_TOO_MANY_ROWS";

export class XlsxImportError extends Error {
  readonly code: XlsxImportErrorCode;

  constructor(code: XlsxImportErrorCode, message: string) {
    super(message);
    this.name = "XlsxImportError";
    this.code = code;
  }
}

export type XlsxImportIssueCode =
  | "INVALID_OPTION_COUNT"
  | "INVALID_EXPORT_PRICE"
  | "INVALID_PRODUCT_URL"
  | "INVALID_STOCK_COUNT"
  | "MISSING_EXTERNAL_PRODUCT_ID"
  | "MISSING_PRODUCT_NAME"
  | "OPTION_IMAGE_COUNT_MISMATCH"
  | "OPTION_NAME_COUNT_MISMATCH"
  | "UNSUPPORTED_CELL_VALUE"
  | "UNSUPPORTED_PLATFORM"
  | SourceInputValidationIssue["code"];

export interface XlsxImportIssue {
  code: XlsxImportIssueCode;
  path: string;
}

export interface XlsxImportRequest {
  workbook: Uint8Array;
  collectedAt?: string;
  sourceAsOfDate?: string;
  sourceFileName?: string;
}

export interface XlsxImportAdapterOptions {
  headerRow?: number;
  maxDataRows?: number;
  sheetName?: string;
}

export interface XlsxImportAcceptedRow {
  input: SourceProductInput;
  issues: [];
  outcome: "MAPPED";
  sourceLocator: string;
  sourceRowNumber: number;
}

export interface XlsxImportRejectedRow {
  input?: undefined;
  issues: XlsxImportIssue[];
  outcome: "REJECTED";
  sourceLocator: string;
  sourceRowNumber: number;
}

export type XlsxImportRow = XlsxImportAcceptedRow | XlsxImportRejectedRow;

export interface XlsxImportResult {
  context: SourceImportContext;
  rows: XlsxImportRow[];
  summary: {
    mapped: number;
    rejected: number;
    total: number;
  };
}

type JsonValue = boolean | null | number | string | JsonValue[] | { [key: string]: JsonValue };

interface RowRawData {
  cells: Record<string, JsonValue>;
  headers: string[];
  rowNumber: number;
  sheetName: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeCellValue(value: unknown): JsonValue | undefined {
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value.toISOString();
  }
  if (Array.isArray(value)) {
    const values: JsonValue[] = [];
    for (const item of value) {
      const normalized = normalizeCellValue(item);
      if (normalized === undefined) {
        return undefined;
      }
      values.push(normalized);
    }
    return values;
  }
  if (!isPlainRecord(value) || "formula" in value) {
    return undefined;
  }

  const record: Record<string, JsonValue> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalized = normalizeCellValue(item);
    if (normalized === undefined) {
      return undefined;
    }
    record[key] = normalized;
  }
  return record;
}

function text(value: JsonValue | undefined): string | undefined {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length === 0 ? undefined : trimmed;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return undefined;
}

function issue(code: XlsxImportIssueCode, path: string): XlsxImportIssue {
  return { code, path };
}

function validationIssues(issues: SourceInputValidationIssue[]): XlsxImportIssue[] {
  return issues.map(({ code, path }) => ({ code, path }));
}

function inferSourceAsOfDate(sourceFileName: string | undefined): string | undefined {
  if (sourceFileName === undefined) {
    return undefined;
  }
  const match = /(?:^|_)(\d{4})(\d{2})(\d{2})(?:\.[^.]+)?$/u.exec(sourceFileName);
  if (match === null) {
    return undefined;
  }
  const [, year, month, day] = match;
  return `${year}-${month}-${day}`;
}

function createContext(request: XlsxImportRequest): SourceImportContext {
  const candidate = {
    collectedAt: request.collectedAt ?? new Date().toISOString(),
    ...(request.sourceAsOfDate === undefined &&
    inferSourceAsOfDate(request.sourceFileName) === undefined
      ? {}
      : { sourceAsOfDate: request.sourceAsOfDate ?? inferSourceAsOfDate(request.sourceFileName) }),
  };
  const result = validateSourceImportContext(candidate);
  if (!result.ok) {
    throw new XlsxImportError("INVALID_IMPORT_CONTEXT", "Import context is invalid");
  }
  return result.value;
}

function isSupportedHost(platformCode: keyof typeof platformHosts, value: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return false;
  }
  return platformHosts[platformCode].some(
    (allowedHost) => parsed.hostname === allowedHost || parsed.hostname.endsWith(`.${allowedHost}`),
  );
}

function parseNonNegativeInteger(value: JsonValue | undefined): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
    return value;
  }
  const source = text(value);
  if (source === undefined || !/^(?:0|[1-9][0-9]*)$/u.test(source)) {
    return undefined;
  }
  const parsed = Number(source);
  return Number.isSafeInteger(parsed) ? parsed : undefined;
}

function parseExportPrice(value: JsonValue | undefined): { price?: string; valid: boolean } {
  const source = text(value);
  if (source === undefined) {
    return { valid: true };
  }
  const withoutGrouping = source.replaceAll(",", "");
  if (!/^(?:0|[1-9][0-9]*)(?:\.[0-9]{1,4})?$/u.test(withoutGrouping)) {
    return { valid: false };
  }
  const [integer, fraction] = withoutGrouping.split(".");
  if (integer === undefined) {
    return { valid: false };
  }
  const canonicalInteger = integer.replace(/^0+(?=\d)/u, "");
  const canonical = fraction === undefined ? canonicalInteger : `${canonicalInteger}.${fraction}`;
  return Number(canonical) === 0 ? { valid: true } : { price: canonical, valid: true };
}

function splitOptionList(value: JsonValue | undefined): string[] {
  const source = text(value);
  if (source === undefined) {
    return [];
  }
  return source
    .split("|")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function sourceLocator(sheetName: string, rowNumber: number, columnCount: number): string {
  return `${sheetName}!A${rowNumber}:${XLSX.utils.encode_col(columnCount - 1)}${rowNumber}`;
}

function firstValue(raw: RowRawData, header: string): JsonValue | undefined {
  return raw.cells[header];
}

function hasAnyValue(raw: RowRawData): boolean {
  return Object.values(raw.cells).some((value) => value !== null && value !== "");
}

function createRawData(
  worksheet: XLSX.WorkSheet,
  headers: string[],
  rowNumber: number,
  sheetName: string,
): { issues: XlsxImportIssue[]; raw: RowRawData } {
  const cells: Record<string, JsonValue> = {};
  const issues: XlsxImportIssue[] = [];
  headers.forEach((header, index) => {
    const cell = worksheet[XLSX.utils.encode_cell({ c: index, r: rowNumber - 1 })];
    const value = cell?.f === undefined ? normalizeCellValue(cell?.v ?? null) : undefined;
    if (value === undefined) {
      issues.push(issue("UNSUPPORTED_CELL_VALUE", `/cells/${index}`));
      cells[header] = null;
      return;
    }
    cells[header] = value;
  });
  return {
    issues,
    raw: { cells, headers, rowNumber, sheetName },
  };
}

function mapRow(raw: RowRawData, initialIssues: XlsxImportIssue[]): XlsxImportRow {
  const issues = [...initialIssues];
  const locator = sourceLocator(raw.sheetName, raw.rowNumber, raw.headers.length);
  const platformSource = text(firstValue(raw, "원본사이트"));
  const platformCode =
    platformSource === undefined
      ? undefined
      : platformCodes[platformSource as keyof typeof platformCodes];
  if (platformCode === undefined) {
    issues.push(issue("UNSUPPORTED_PLATFORM", "/원본사이트"));
  }

  const externalProductId = text(firstValue(raw, "원본상품코드"));
  if (externalProductId === undefined) {
    issues.push(issue("MISSING_EXTERNAL_PRODUCT_ID", "/원본상품코드"));
  }

  const productName = text(firstValue(raw, "상품명"));
  if (productName === undefined) {
    issues.push(issue("MISSING_PRODUCT_NAME", "/상품명"));
  }

  const optionCountValue = firstValue(raw, "옵션수");
  const optionCount = parseNonNegativeInteger(optionCountValue);
  if (optionCount === undefined) {
    issues.push(issue("INVALID_OPTION_COUNT", "/옵션수"));
  }

  const stockCountValue = firstValue(raw, "재고수");
  const stockCount = parseNonNegativeInteger(stockCountValue);
  if (stockCount === undefined && text(stockCountValue) !== undefined) {
    issues.push(issue("INVALID_STOCK_COUNT", "/재고수"));
  }

  const optionNames = splitOptionList(firstValue(raw, "옵션명 목록"));
  const optionImageUrls = splitOptionList(firstValue(raw, "옵션 이미지 URL 목록"));
  if (optionCount !== undefined && optionNames.length !== optionCount) {
    issues.push(issue("OPTION_NAME_COUNT_MISMATCH", "/옵션명 목록"));
  }
  if (optionImageUrls.length > 0 && optionImageUrls.length !== optionNames.length) {
    issues.push(issue("OPTION_IMAGE_COUNT_MISMATCH", "/옵션 이미지 URL 목록"));
  }

  const productUrl = text(firstValue(raw, "원문상품 URL(추정)"));
  if (
    productUrl !== undefined &&
    platformCode !== undefined &&
    !isSupportedHost(platformCode, productUrl)
  ) {
    issues.push(issue("INVALID_PRODUCT_URL", "/원문상품 URL(추정)"));
  }

  const normalPrice = parseExportPrice(firstValue(raw, "원가(내보내기값)"));
  const currentPrice = parseExportPrice(firstValue(raw, "판매가(내보내기값)"));
  if (!normalPrice.valid) {
    issues.push(issue("INVALID_EXPORT_PRICE", "/원가(내보내기값)"));
  }
  if (!currentPrice.valid) {
    issues.push(issue("INVALID_EXPORT_PRICE", "/판매가(내보내기값)"));
  }

  if (
    issues.length > 0 ||
    platformCode === undefined ||
    externalProductId === undefined ||
    productName === undefined ||
    optionCount === undefined
  ) {
    return {
      issues,
      outcome: "REJECTED",
      sourceLocator: locator,
      sourceRowNumber: raw.rowNumber,
    };
  }

  const mainImageUrl = text(firstValue(raw, "대표이미지 URL"));

  const brandName = text(firstValue(raw, "브랜드"));
  const input: SourceProductInput = {
    platformCode,
    externalProductId,
    productName,
    ...(brandName === undefined ? {} : { brandName }),
    ...(productUrl === undefined ? {} : { productUrl }),
    ...(normalPrice.price === undefined ? {} : { normalPrice: normalPrice.price }),
    ...(currentPrice.price === undefined ? {} : { currentPrice: currentPrice.price }),
    ...(stockCount === undefined
      ? {}
      : { stockStatus: stockCount === 0 ? ("OUT_OF_STOCK" as const) : ("IN_STOCK" as const) }),
    ...(optionNames.length === 0
      ? {}
      : {
          options: optionNames.map((rawOptionName, index) => ({
            rawOptionName,
            sourceOrder: index,
            ...(optionImageUrls[index] === undefined ? {} : { imageUrl: optionImageUrls[index] }),
            raw: {
              optionImageUrlList: firstValue(raw, "옵션 이미지 URL 목록"),
              optionNameList: firstValue(raw, "옵션명 목록"),
              sourceOptionIndex: index,
            },
          })),
        }),
    ...(mainImageUrl === undefined
      ? {}
      : {
          images: [
            {
              imageType: "MAIN" as const,
              raw: { sourceColumn: "대표이미지 URL" },
              sourceOrder: 0,
              sourceUrl: mainImageUrl,
            },
          ],
        }),
    raw: {
      cells: raw.cells,
      headers: raw.headers,
      rowNumber: raw.rowNumber,
      sheetName: raw.sheetName,
    },
  };

  const validation = validateSourceProductInput(input);
  if (!validation.ok) {
    return {
      issues: validationIssues(validation.issues),
      outcome: "REJECTED",
      sourceLocator: locator,
      sourceRowNumber: raw.rowNumber,
    };
  }
  return {
    input: validation.value,
    issues: [],
    outcome: "MAPPED",
    sourceLocator: locator,
    sourceRowNumber: raw.rowNumber,
  };
}

export class XlsxImportAdapter {
  readonly headerRow: number;
  readonly maxDataRows: number;
  readonly sheetName: string;

  constructor(options: XlsxImportAdapterOptions = {}) {
    this.headerRow = options.headerRow ?? firstSourceHeaderRow;
    this.maxDataRows = options.maxDataRows ?? maximumXlsxDataRows;
    this.sheetName = options.sheetName ?? firstSourceSheetName;
  }

  async parse(request: XlsxImportRequest): Promise<XlsxImportResult> {
    if (request.workbook.byteLength === 0 || request.workbook.byteLength > maximumXlsxBytes) {
      throw new XlsxImportError(
        "WORKBOOK_TOO_LARGE",
        "Workbook size is outside the accepted limit",
      );
    }
    const context = createContext(request);
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(Buffer.from(request.workbook), {
        cellFormula: true,
        cellText: false,
        type: "buffer",
      });
    } catch {
      throw new XlsxImportError("INVALID_WORKBOOK", "Workbook cannot be read");
    }

    const worksheet = workbook.Sheets[this.sheetName];
    if (worksheet === undefined) {
      throw new XlsxImportError("SOURCE_SHEET_NOT_FOUND", "Expected source sheet is missing");
    }
    const reference = worksheet["!ref"];
    if (reference === undefined) {
      throw new XlsxImportError("INVALID_SOURCE_HEADER", "Workbook does not contain source cells");
    }
    const range = XLSX.utils.decode_range(reference);
    if (range.s.r > this.headerRow - 1 || range.e.r < this.headerRow - 1) {
      throw new XlsxImportError(
        "INVALID_SOURCE_HEADER",
        "Workbook does not contain the configured header row",
      );
    }
    const headers = Array.from({ length: range.e.c + 1 }, (_unused, index) => {
      const cell = worksheet[XLSX.utils.encode_cell({ c: index, r: this.headerRow - 1 })];
      const value = cell?.f === undefined ? normalizeCellValue(cell?.v ?? null) : undefined;
      return text(value);
    });
    if (
      headers.some((header) => header === undefined) ||
      new Set(headers).size !== headers.length ||
      requiredHeaders.some((header) => !headers.includes(header))
    ) {
      throw new XlsxImportError(
        "INVALID_SOURCE_HEADER",
        "Workbook headers do not match the configured source",
      );
    }
    const sourceHeaders = headers as string[];
    const dataRowCount = range.e.r - (this.headerRow - 1);
    if (dataRowCount > this.maxDataRows) {
      throw new XlsxImportError(
        "WORKBOOK_TOO_MANY_ROWS",
        "Workbook exceeds the configured row limit",
      );
    }

    const rows: XlsxImportRow[] = [];
    for (let rowNumber = this.headerRow + 1; rowNumber <= range.e.r + 1; rowNumber += 1) {
      const { issues, raw } = createRawData(worksheet, sourceHeaders, rowNumber, this.sheetName);
      if (!hasAnyValue(raw)) {
        continue;
      }
      rows.push(mapRow(raw, issues));
    }
    const mapped = rows.filter((row) => row.outcome === "MAPPED").length;
    return {
      context,
      rows,
      summary: { mapped, rejected: rows.length - mapped, total: rows.length },
    };
  }
}

export function createXlsxImportAdapter(options?: XlsxImportAdapterOptions): XlsxImportAdapter {
  return new XlsxImportAdapter(options);
}
