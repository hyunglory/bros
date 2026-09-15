import { sql, type RawBuilder } from "kysely";

// Matches the code/GTIN comparison key in @bros/contracts. Use the stored norm
// for issuer-defined BARCODE/BRAND_CODE formats; their separators stay exact.
export function compatibleStoredIdentifierNorm(
  alias: "app.product_identifier" | "identifier",
): RawBuilder<string> {
  const type = sql.ref(`${alias}.identifier_type`);
  const norm = sql.ref(`${alias}.identifier_norm`);
  const stripped = sql<string>`upper(regexp_replace(normalize(${norm}, NFKC), '[[:space:]_‐‑‒–—−-]', '', 'g'))`;
  return sql<string>`case when ${type} in ('MODEL_NO','STYLE_CODE','PRODUCT_NO','MPN') then ${stripped}
    when ${type} = 'GTIN' and ${stripped} ~ '^[0-9]+$' and length(${stripped}) in (8,12,13,14) then ${stripped}
    when ${type} = 'EAN' and ${stripped} ~ '^[0-9]+$' and length(${stripped}) in (8,13) then ${stripped}
    when ${type} = 'UPC' and ${stripped} ~ '^[0-9]+$' and length(${stripped}) = 12 then ${stripped}
    else ${norm} end`;
}
