import { Type, type Static, type TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { PublicIdSchema } from "./http.js";
import {
  SourceIdentifierTypeSchema,
  SourceProductInputSchema,
  validateSourceImportContext,
  validateSourceProductInput,
  validateSourceRawJson,
} from "./source-product.js";

const text = (maxLength: number) => Type.String({ pattern: "^\\S(?:[\\s\\S]*\\S)?$", maxLength });
const nullable = <T extends TSchema>(schema: T) => Type.Union([schema, Type.Null()]);
const strict = { additionalProperties: false };

export const CreateResolveRunSchema = Type.Object(
  { sourceProductPublicId: PublicIdSchema, resolverVersion: text(128) },
  strict,
);
export type CreateResolveRun = Static<typeof CreateResolveRunSchema>;

export const ResolveRunStatusSchema = Type.Union([
  Type.Literal("QUEUED"),
  Type.Literal("RUNNING"),
  Type.Literal("SUCCEEDED"),
  Type.Literal("FAILED"),
  Type.Literal("CANCELLED"),
]);
export type ResolveRunStatus = Static<typeof ResolveRunStatusSchema>;

// Internal replay payload. Never expose raw/import payloads through a public API.
export const IdentifierResolveInputSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    sourceProductPublicId: PublicIdSchema,
    productPublicId: nullable(PublicIdSchema),
    platformCode: text(50),
    externalProductId: text(512),
    productName: text(2048),
    brandName: nullable(text(512)),
    productUrl: nullable(Type.String({ pattern: "^https?://[^\\s]+$", maxLength: 4096 })),
    collectedAt: Type.String(),
    raw: Type.Unknown(),
    import: nullable(
      Type.Object(
        {
          itemPublicId: PublicIdSchema,
          input: SourceProductInputSchema,
        },
        strict,
      ),
    ),
  },
  strict,
);
export type IdentifierResolveInput = Static<typeof IdentifierResolveInputSchema>;

export const ResolveCandidateInputSchema = Type.Object(
  {
    identifierType: SourceIdentifierTypeSchema,
    candidateValue: text(512),
    candidateNorm: text(512),
    confidenceScore: nullable(
      Type.String({ pattern: "^(?:100(?:\\.0{1,2})?|(?:0|[1-9][0-9]?)(?:\\.[0-9]{1,2})?)$" }),
    ),
    rankNo: Type.Integer({ minimum: 1, maximum: 2147483647 }),
    evidence: Type.Array(Type.Unknown(), { maxItems: 1000 }),
    conflicts: Type.Array(Type.Unknown(), { maxItems: 1000 }),
  },
  strict,
);
export type ResolveCandidateInput = Static<typeof ResolveCandidateInputSchema>;
const CandidatesSchema = Type.Array(ResolveCandidateInputSchema, { maxItems: 1000 });

export type ResolveValidation<T> =
  { ok: true; value: T } | { ok: false; code: "INVALID_RESOLVE_INPUT" };

// Bound JSON traversal before the shared recursive secret/URL checks. Return only
// a fixed code: validation diagnostics must not echo raw, URLs, or provider data.
function safeJson(value: unknown): boolean {
  const pending = [{ value, depth: 0 }];
  let count = 0;
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined) break;
    if (++count > 100_000 || item.depth > 32) return false;
    if (typeof item.value === "object" && item.value !== null) {
      if (Object.getOwnPropertySymbols(item.value).length > 0) return false;
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(item.value))) {
        if (descriptor.get || descriptor.set) return false;
        pending.push({ value: descriptor.value as unknown, depth: item.depth + 1 });
      }
    }
  }
  return validateSourceRawJson(value).ok && JSON.stringify(value).length <= 8_000_000;
}

function validate<T>(schema: TSchema, value: unknown): ResolveValidation<T> {
  try {
    if (safeJson(value) && Value.Check(schema, value)) return { ok: true, value: value as T };
  } catch {
    /* Malformed payloads never escape as raw validation exceptions. */
  }
  return { ok: false, code: "INVALID_RESOLVE_INPUT" };
}

export function validateCreateResolveRun(value: unknown): ResolveValidation<CreateResolveRun> {
  return validate(CreateResolveRunSchema, value);
}

export function validateIdentifierResolveInput(
  value: unknown,
): ResolveValidation<IdentifierResolveInput> {
  const result = validate<IdentifierResolveInput>(IdentifierResolveInputSchema, value);
  if (!result.ok) return result;
  const input = result.value;
  if (!validateSourceImportContext({ collectedAt: input.collectedAt }).ok) {
    return { ok: false, code: "INVALID_RESOLVE_INPUT" };
  }
  if (input.import !== null) {
    const mapped = input.import.input;
    if (
      !validateSourceProductInput(mapped).ok ||
      mapped.platformCode !== input.platformCode ||
      mapped.externalProductId !== input.externalProductId ||
      mapped.productName !== input.productName ||
      (mapped.brandName ?? null) !== input.brandName ||
      (mapped.productUrl ?? null) !== input.productUrl
    ) {
      return { ok: false, code: "INVALID_RESOLVE_INPUT" };
    }
  }
  return result;
}

export function validateResolveCandidates(
  value: unknown,
): ResolveValidation<ResolveCandidateInput[]> {
  const result = validate<ResolveCandidateInput[]>(CandidatesSchema, value);
  if (!result.ok) return result;
  const keys = new Set<string>();
  for (const candidate of result.value) {
    const key = JSON.stringify([candidate.identifierType, candidate.candidateNorm]);
    if (keys.has(key)) return { ok: false, code: "INVALID_RESOLVE_INPUT" };
    keys.add(key);
  }
  return result;
}
