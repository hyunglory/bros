import { sql, type Kysely } from "kysely";

// Additive, non-unique index for the version-bridging read key. Existing stored
// identifier_norm values and unique constraints remain unchanged.
export async function up(db: Kysely<unknown>): Promise<void> {
  await sql`create index product_identifier_compat_lookup_idx on app.product_identifier
    (identifier_type, (case when identifier_type in ('MODEL_NO','STYLE_CODE','PRODUCT_NO','MPN')
      then upper(regexp_replace(normalize(identifier_norm, NFKC), '[[:space:]_‐‑‒–—−-]', '', 'g'))
      when identifier_type = 'GTIN' and upper(regexp_replace(normalize(identifier_norm, NFKC), '[[:space:]_‐‑‒–—−-]', '', 'g')) ~ '^[0-9]+$'
        and length(upper(regexp_replace(normalize(identifier_norm, NFKC), '[[:space:]_‐‑‒–—−-]', '', 'g'))) in (8,12,13,14)
      then upper(regexp_replace(normalize(identifier_norm, NFKC), '[[:space:]_‐‑‒–—−-]', '', 'g'))
      when identifier_type = 'EAN' and upper(regexp_replace(normalize(identifier_norm, NFKC), '[[:space:]_‐‑‒–—−-]', '', 'g')) ~ '^[0-9]+$'
        and length(upper(regexp_replace(normalize(identifier_norm, NFKC), '[[:space:]_‐‑‒–—−-]', '', 'g'))) in (8,13)
      then upper(regexp_replace(normalize(identifier_norm, NFKC), '[[:space:]_‐‑‒–—−-]', '', 'g'))
      when identifier_type = 'UPC' and upper(regexp_replace(normalize(identifier_norm, NFKC), '[[:space:]_‐‑‒–—−-]', '', 'g')) ~ '^[0-9]+$'
        and length(upper(regexp_replace(normalize(identifier_norm, NFKC), '[[:space:]_‐‑‒–—−-]', '', 'g'))) = 12
      then upper(regexp_replace(normalize(identifier_norm, NFKC), '[[:space:]_‐‑‒–—−-]', '', 'g'))
      else identifier_norm end))`.execute(db);
}

export async function down(db: Kysely<unknown>): Promise<void> {
  await sql`drop index app.product_identifier_compat_lookup_idx`.execute(db);
}
