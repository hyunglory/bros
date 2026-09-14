import { Type } from "@sinclair/typebox";
import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const trimmedTextPattern = "^\\S(?:[\\s\\S]*\\S)?$";
const externalIdPattern = "^\\S+$";
const decimalPattern = "^(?:0|[1-9][0-9]{0,15})(?:\\.[0-9]{1,4})?$";
const httpUrlPattern = "^https?://[^\\s]+$";
const isoDateTimePattern =
  "^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])T(?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{1,9})?(?:Z|[+-](?:0[0-9]|1[0-4]):[0-5][0-9])$";
const calendarDatePattern = "^[0-9]{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12][0-9]|3[01])$";

export const DecimalStringSchema = Type.String({
  description: "Non-negative decimal compatible with PostgreSQL numeric(20,4)",
  pattern: decimalPattern,
});
export type DecimalString = Static<typeof DecimalStringSchema>;

export const StockStatusSchema = Type.Union([
  Type.Literal("UNKNOWN"),
  Type.Literal("IN_STOCK"),
  Type.Literal("OUT_OF_STOCK"),
]);
export type StockStatus = Static<typeof StockStatusSchema>;

export const SourceIdentifierTypeSchema = Type.Union([
  Type.Literal("MODEL_NO"),
  Type.Literal("STYLE_CODE"),
  Type.Literal("PRODUCT_NO"),
  Type.Literal("MPN"),
  Type.Literal("GTIN"),
  Type.Literal("EAN"),
  Type.Literal("UPC"),
  Type.Literal("BARCODE"),
  Type.Literal("BRAND_CODE"),
]);
export type SourceIdentifierType = Static<typeof SourceIdentifierTypeSchema>;

export const SourceIdentifierInputSchema = Type.Object(
  {
    type: SourceIdentifierTypeSchema,
    value: Type.String({ maxLength: 512, pattern: trimmedTextPattern }),
  },
  { additionalProperties: false },
);
export type SourceIdentifierInput = Static<typeof SourceIdentifierInputSchema>;

export type SourceRawJson =
  string | number | boolean | null | SourceRawJson[] | { [key: string]: SourceRawJson };
const RawJsonSchema = Type.Unknown({
  description: "JSON-compatible source payload without credentials or secret-bearing fields",
});

const HttpUrlSchema = Type.String({ maxLength: 4_096, pattern: httpUrlPattern });

export const SourceOptionInputSchema = Type.Object(
  {
    rawOptionName: Type.String({ maxLength: 1_024, pattern: trimmedTextPattern }),
    sourceOrder: Type.Integer({ minimum: 0 }),
    externalSkuId: Type.Optional(Type.String({ maxLength: 512, pattern: externalIdPattern })),
    currentPrice: Type.Optional(DecimalStringSchema),
    stockStatus: Type.Optional(StockStatusSchema),
    imageUrl: Type.Optional(HttpUrlSchema),
    raw: RawJsonSchema,
  },
  { additionalProperties: false },
);
export type SourceOptionInput = Static<typeof SourceOptionInputSchema>;

export const SourceImageInputSchema = Type.Object(
  {
    imageType: Type.Union([Type.Literal("MAIN"), Type.Literal("DETAIL")]),
    sourceUrl: HttpUrlSchema,
    sourceOrder: Type.Integer({ minimum: 0 }),
    raw: RawJsonSchema,
  },
  { additionalProperties: false },
);
export type SourceImageInput = Static<typeof SourceImageInputSchema>;

export const SourceImportContextSchema = Type.Object(
  {
    collectedAt: Type.String({ pattern: isoDateTimePattern }),
    sourceAsOfDate: Type.Optional(Type.String({ pattern: calendarDatePattern })),
  },
  { additionalProperties: false },
);
export type SourceImportContext = Static<typeof SourceImportContextSchema>;

export const SourceProductInputSchema = Type.Object(
  {
    platformCode: Type.String({
      maxLength: 50,
      pattern: "^[A-Z][A-Z0-9_]*$",
    }),
    externalProductId: Type.String({ maxLength: 512, pattern: externalIdPattern }),
    productName: Type.String({ maxLength: 2_048, pattern: trimmedTextPattern }),
    brandName: Type.Optional(Type.String({ maxLength: 512, pattern: trimmedTextPattern })),
    productUrl: Type.Optional(HttpUrlSchema),
    normalPrice: Type.Optional(DecimalStringSchema),
    currentPrice: Type.Optional(DecimalStringSchema),
    currencyCode: Type.Optional(Type.String({ pattern: "^[A-Z]{3}$" })),
    stockStatus: Type.Optional(StockStatusSchema),
    identifiers: Type.Optional(Type.Array(SourceIdentifierInputSchema)),
    options: Type.Optional(Type.Array(SourceOptionInputSchema)),
    images: Type.Optional(Type.Array(SourceImageInputSchema)),
    raw: RawJsonSchema,
  },
  { additionalProperties: false },
);
export type SourceProductInput = Static<typeof SourceProductInputSchema>;

export type SourceInputValidationIssueCode =
  | "DUPLICATE_EXTERNAL_SKU_ID"
  | "DUPLICATE_IDENTIFIER"
  | "DUPLICATE_IMAGE_POSITION"
  | "DUPLICATE_OPTION_SOURCE_ORDER"
  | "INVALID_RAW_JSON"
  | "INVALID_SOURCE_DATE"
  | "INVALID_STRUCTURE"
  | "INVALID_TIMESTAMP"
  | "INVALID_URL"
  | "MULTIPLE_MAIN_IMAGES"
  | "PRICE_REQUIRES_CURRENCY"
  | "SENSITIVE_FIELD"
  | "SENSITIVE_URL_QUERY"
  | "URL_CREDENTIALS_NOT_ALLOWED";

export interface SourceInputValidationIssue {
  code: SourceInputValidationIssueCode;
  path: string;
}

export type SourceInputValidationResult<T> =
  { ok: true; value: T } | { issues: SourceInputValidationIssue[]; ok: false };

const maximumValidationIssues = 20;
const sensitiveKeys = new Set([
  "apikey",
  "authorization",
  "cookie",
  "credentials",
  "password",
  "passwd",
  "refreshtoken",
  "secret",
  "token",
  "accesstoken",
]);
const sensitiveQueryKeys = new Set([
  "access_token",
  "api_key",
  "awsaccesskeyid",
  "credential",
  "googleaccessid",
  "key",
  "security_token",
  "signature",
  "token",
  "x-amz-credential",
  "x-amz-security-token",
  "x-amz-signature",
  "x-goog-signature",
]);

function appendIssue(
  issues: SourceInputValidationIssue[],
  code: SourceInputValidationIssueCode,
  path: string,
): void {
  if (issues.length < maximumValidationIssues) {
    issues.push({ code, path });
  }
}

function structuralIssues(schema: TSchema, value: unknown): SourceInputValidationIssue[] {
  return [...Value.Errors(schema, value)].slice(0, maximumValidationIssues).map((error) => ({
    code: "INVALID_STRUCTURE" as const,
    path: error.path || "$",
  }));
}

function escapeJsonPointer(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function normalizedKey(value: string): string {
  return value.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function inspectRawJson(
  value: unknown,
  path: string,
  issues: SourceInputValidationIssue[],
  ancestors = new Set<object>(),
): void {
  if (issues.length >= maximumValidationIssues || value === null) {
    return;
  }

  if (typeof value === "string") {
    if (/^https?:\/\//iu.test(value)) {
      inspectUrl(value, path, issues);
    }
    return;
  }
  if (typeof value === "boolean") {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      appendIssue(issues, "INVALID_RAW_JSON", path);
    }
    return;
  }
  if (typeof value !== "object") {
    appendIssue(issues, "INVALID_RAW_JSON", path);
    return;
  }
  if (ancestors.has(value)) {
    appendIssue(issues, "INVALID_RAW_JSON", path);
    return;
  }

  if (!Array.isArray(value)) {
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      appendIssue(issues, "INVALID_RAW_JSON", path);
      return;
    }
  }

  ancestors.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => inspectRawJson(item, `${path}/${index}`, issues, ancestors));
  } else {
    for (const [key, item] of Object.entries(value)) {
      const itemPath = `${path}/${escapeJsonPointer(key)}`;
      const keyName = normalizedKey(key);
      if (
        sensitiveKeys.has(keyName) ||
        keyName.endsWith("password") ||
        keyName.endsWith("secret") ||
        keyName.endsWith("token")
      ) {
        appendIssue(issues, "SENSITIVE_FIELD", itemPath);
      }
      inspectRawJson(item, itemPath, issues, ancestors);
    }
  }
  ancestors.delete(value);
}

function inspectUrl(value: string, path: string, issues: SourceInputValidationIssue[]): void {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    appendIssue(issues, "INVALID_URL", path);
    return;
  }
  if (url.username || url.password) {
    appendIssue(issues, "URL_CREDENTIALS_NOT_ALLOWED", path);
  }
  for (const key of url.searchParams.keys()) {
    if (sensitiveQueryKeys.has(key.toLowerCase())) {
      appendIssue(issues, "SENSITIVE_URL_QUERY", path);
      break;
    }
  }
}

function inspectDuplicates<T>(
  values: readonly T[],
  keyOf: (value: T) => string | undefined,
  pathOf: (value: T, index: number) => string,
  code: SourceInputValidationIssueCode,
  issues: SourceInputValidationIssue[],
): void {
  const seen = new Set<string>();
  values.forEach((value, index) => {
    const key = keyOf(value);
    if (key === undefined) {
      return;
    }
    if (seen.has(key)) {
      appendIssue(issues, code, pathOf(value, index));
    } else {
      seen.add(key);
    }
  });
}

function isCalendarDate(value: string): boolean {
  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function validateSourceImportContext(
  value: unknown,
): SourceInputValidationResult<SourceImportContext> {
  const issues = structuralIssues(SourceImportContextSchema, value);
  if (issues.length > 0) {
    return { issues, ok: false };
  }

  const context = value as SourceImportContext;
  const impossibleMaximumOffset = /[+-]14:(?!00$)[0-5][0-9]$/.test(context.collectedAt);
  if (!Number.isFinite(Date.parse(context.collectedAt)) || impossibleMaximumOffset) {
    appendIssue(issues, "INVALID_TIMESTAMP", "/collectedAt");
  } else if (!isCalendarDate(context.collectedAt.slice(0, 10))) {
    appendIssue(issues, "INVALID_TIMESTAMP", "/collectedAt");
  }
  if (context.sourceAsOfDate !== undefined && !isCalendarDate(context.sourceAsOfDate)) {
    appendIssue(issues, "INVALID_SOURCE_DATE", "/sourceAsOfDate");
  }

  return issues.length === 0 ? { ok: true, value: context } : { issues, ok: false };
}

// Rejected adapter rows have no SourceProductInput, but their raw payload must
// still cross the same secret and JSON-safety boundary before persistence.
export function validateSourceRawJson(value: unknown): SourceInputValidationResult<SourceRawJson> {
  const issues: SourceInputValidationIssue[] = [];
  inspectRawJson(value, "/raw", issues);
  return issues.length === 0 ? { ok: true, value: value as SourceRawJson } : { issues, ok: false };
}

export function validateSourceProductInput(
  value: unknown,
): SourceInputValidationResult<SourceProductInput> {
  const issues = structuralIssues(SourceProductInputSchema, value);
  if (issues.length > 0) {
    return { issues, ok: false };
  }

  const input = value as SourceProductInput;
  const options = input.options ?? [];
  const images = input.images ?? [];
  const identifiers = input.identifiers ?? [];

  const hasPrice =
    input.normalPrice !== undefined ||
    input.currentPrice !== undefined ||
    options.some((option) => option.currentPrice !== undefined);
  if (hasPrice && input.currencyCode === undefined) {
    appendIssue(issues, "PRICE_REQUIRES_CURRENCY", "/currencyCode");
  }

  inspectDuplicates(
    options,
    (option) => String(option.sourceOrder),
    (_option, index) => `/options/${index}/sourceOrder`,
    "DUPLICATE_OPTION_SOURCE_ORDER",
    issues,
  );
  inspectDuplicates(
    options,
    (option) => option.externalSkuId,
    (_option, index) => `/options/${index}/externalSkuId`,
    "DUPLICATE_EXTERNAL_SKU_ID",
    issues,
  );
  inspectDuplicates(
    images,
    (image) => `${image.imageType}:${image.sourceOrder}`,
    (_image, index) => `/images/${index}/sourceOrder`,
    "DUPLICATE_IMAGE_POSITION",
    issues,
  );
  inspectDuplicates(
    identifiers,
    (identifier) => `${identifier.type}:${identifier.value.trim().toUpperCase()}`,
    (_identifier, index) => `/identifiers/${index}`,
    "DUPLICATE_IDENTIFIER",
    issues,
  );

  if (images.filter((image) => image.imageType === "MAIN").length > 1) {
    appendIssue(issues, "MULTIPLE_MAIN_IMAGES", "/images");
  }

  if (input.productUrl !== undefined) {
    inspectUrl(input.productUrl, "/productUrl", issues);
  }
  options.forEach((option, index) => {
    if (option.imageUrl !== undefined) {
      inspectUrl(option.imageUrl, `/options/${index}/imageUrl`, issues);
    }
    inspectRawJson(option.raw, `/options/${index}/raw`, issues);
  });
  images.forEach((image, index) => {
    inspectUrl(image.sourceUrl, `/images/${index}/sourceUrl`, issues);
    inspectRawJson(image.raw, `/images/${index}/raw`, issues);
  });
  inspectRawJson(input.raw, "/raw", issues);

  return issues.length === 0 ? { ok: true, value: input } : { issues, ok: false };
}
