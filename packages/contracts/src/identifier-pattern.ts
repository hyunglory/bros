import { Type, type Static } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

const brandKeyPattern = "^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$";
const patternIdPattern = "^[A-Z][A-Z0-9_]{0,63}$";

export const IdentifierPatternSourceSchema = Type.Union([
  Type.Literal("RAW"),
  Type.Literal("URL"),
  Type.Literal("TITLE"),
  Type.Literal("OPTION"),
]);
export type IdentifierPatternSource = Static<typeof IdentifierPatternSourceSchema>;

export const IdentifierPatternDefinitionSchema = Type.Object(
  {
    id: Type.String({ maxLength: 64, pattern: patternIdPattern }),
    brandKey: Type.String({ maxLength: 64, pattern: brandKeyPattern }),
    identifierType: Type.Union([
      Type.Literal("MODEL_NO"),
      Type.Literal("STYLE_CODE"),
      Type.Literal("PRODUCT_NO"),
      Type.Literal("MPN"),
      Type.Literal("GTIN"),
      Type.Literal("EAN"),
      Type.Literal("UPC"),
      Type.Literal("BARCODE"),
      Type.Literal("BRAND_CODE"),
    ]),
    source: IdentifierPatternSourceSchema,
    regex: Type.String({ minLength: 1, maxLength: 512 }),
  },
  { additionalProperties: false },
);
export type IdentifierPatternDefinition = Static<typeof IdentifierPatternDefinitionSchema>;

export const IdentifierPatternRegistrySchema = Type.Object(
  {
    version: Type.String({ minLength: 1, maxLength: 128, pattern: "^\\S(?:[\\s\\S]*\\S)?$" }),
    patterns: Type.Array(IdentifierPatternDefinitionSchema, { maxItems: 1_000 }),
  },
  { additionalProperties: false },
);
export type IdentifierPatternRegistryDefinition = Static<typeof IdentifierPatternRegistrySchema>;

export type IdentifierPatternRegistryValidation =
  | { ok: true; value: IdentifierPatternRegistryDefinition }
  | { code: "INVALID_PATTERN_REGISTRY"; ok: false };

export function validateIdentifierPatternRegistry(
  value: unknown,
): IdentifierPatternRegistryValidation {
  try {
    if (Value.Check(IdentifierPatternRegistrySchema, value)) {
      return { ok: true, value: value as IdentifierPatternRegistryDefinition };
    }
  } catch {
    // Configuration details must not escape from the public validation boundary.
  }
  return { code: "INVALID_PATTERN_REGISTRY", ok: false };
}
