import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import { SourceIdentifierTypeSchema } from "./source-product.js";

const nonBlank = (maxLength: number) =>
  Type.String({ maxLength, pattern: "^\\S(?:[\\s\\S]*\\S)?$" });

export const InternalCatalogIdentifierQuerySchema = Type.Object(
  {
    identifierNorm: nonBlank(512),
    identifierType: SourceIdentifierTypeSchema,
    kind: Type.Literal("IDENTIFIER"),
  },
  { additionalProperties: false },
);
export type InternalCatalogIdentifierQuery = Static<typeof InternalCatalogIdentifierQuerySchema>;

export const InternalCatalogBrandNameVariantQuerySchema = Type.Object(
  {
    brandKey: nonBlank(100),
    kind: Type.Literal("BRAND_NAME_VARIANT"),
    optionKey: Type.Optional(nonBlank(2048)),
    productNameNorm: nonBlank(2048),
  },
  { additionalProperties: false },
);
export type InternalCatalogBrandNameVariantQuery = Static<
  typeof InternalCatalogBrandNameVariantQuerySchema
>;

export const InternalCatalogQuerySchema = Type.Union([
  InternalCatalogIdentifierQuerySchema,
  InternalCatalogBrandNameVariantQuerySchema,
]);
export type InternalCatalogQuery = Static<typeof InternalCatalogQuerySchema>;

export type InternalCatalogQueryValidation =
  { ok: true; value: InternalCatalogQuery } | { code: "INVALID_CATALOG_QUERY"; ok: false };

export function validateInternalCatalogQuery(value: unknown): InternalCatalogQueryValidation {
  try {
    if (Value.Check(InternalCatalogQuerySchema, value)) {
      return { ok: true, value: value as InternalCatalogQuery };
    }
  } catch {
    // The provider must not expose arbitrary caller payloads in validation errors.
  }
  return { code: "INVALID_CATALOG_QUERY", ok: false };
}
