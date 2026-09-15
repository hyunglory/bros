import { type InternalCatalogQuery, validateInternalCatalogQuery } from "@bros/contracts";
import { compatibleStoredIdentifierNorm, type DatabaseClient } from "@bros/db";

const maximumMatches = 50;

export type InternalCatalogProviderErrorCode = "INVALID_CATALOG_QUERY";

export class InternalCatalogProviderError extends Error {
  constructor(readonly code: InternalCatalogProviderErrorCode) {
    super(code);
    this.name = "InternalCatalogProviderError";
  }
}

export interface InternalCatalogMatch {
  brandKey: string;
  matchedIdentifier?: { norm: string; type: string; value: string };
  matchedSkuPublicIds: readonly string[];
  productName: string;
  productPublicId: string;
}

export interface InternalCatalogSearchResult {
  matches: readonly InternalCatalogMatch[];
  outcome: "EXACT" | "AMBIGUOUS" | "MISS";
  query: InternalCatalogQuery;
  truncated: boolean;
}

interface CatalogRow {
  brand_key: string;
  identifier_norm: string | null;
  identifier_type: string | null;
  identifier_value: string | null;
  product_name: string;
  product_public_id: string;
  sku_public_id: string | null;
}

function validateQuery(value: unknown): InternalCatalogQuery {
  const result = validateInternalCatalogQuery(value);
  if (!result.ok) throw new InternalCatalogProviderError("INVALID_CATALOG_QUERY");
  return structuredClone(result.value);
}

function toResult(query: InternalCatalogQuery, rows: CatalogRow[]): InternalCatalogSearchResult {
  const grouped = new Map<string, InternalCatalogMatch>();
  for (const row of rows.slice(0, maximumMatches)) {
    const existing = grouped.get(row.product_public_id);
    const skuIds =
      existing === undefined ? new Set<string>() : new Set(existing.matchedSkuPublicIds);
    if (row.sku_public_id !== null) skuIds.add(row.sku_public_id);
    grouped.set(
      row.product_public_id,
      Object.freeze({
        brandKey: row.brand_key,
        ...(row.identifier_type === null ||
        row.identifier_value === null ||
        row.identifier_norm === null
          ? {}
          : {
              matchedIdentifier: Object.freeze({
                norm: row.identifier_norm,
                type: row.identifier_type,
                value: row.identifier_value,
              }),
            }),
        matchedSkuPublicIds: Object.freeze([...skuIds].sort()),
        productName: row.product_name,
        productPublicId: row.product_public_id,
      }),
    );
  }
  const matches = Object.freeze(
    [...grouped.values()].sort((left, right) =>
      left.productPublicId.localeCompare(right.productPublicId),
    ),
  );
  return Object.freeze({
    matches,
    outcome: matches.length === 0 ? "MISS" : matches.length === 1 ? "EXACT" : "AMBIGUOUS",
    query,
    truncated: rows.length > maximumMatches,
  });
}

export function createInternalCatalogProvider(database: DatabaseClient) {
  return Object.freeze({
    async search(value: unknown): Promise<InternalCatalogSearchResult> {
      const query = validateQuery(value);
      const db = database.db;
      let rows: CatalogRow[];
      if (query.kind === "IDENTIFIER") {
        rows = await db
          .selectFrom("app.product_identifier as identifier")
          .innerJoin("app.product_master as product", "product.id", "identifier.product_id")
          .innerJoin("app.brand as brand", "brand.id", "product.brand_id")
          .leftJoin("app.product_sku as sku", "sku.id", "identifier.sku_id")
          .select([
            "brand.brand_key",
            "identifier.identifier_norm",
            "identifier.identifier_type",
            "identifier.identifier_value",
            "product.product_name",
            "product.public_id as product_public_id",
            "sku.public_id as sku_public_id",
          ])
          .where("identifier.identifier_type", "=", query.identifierType)
          .where(compatibleStoredIdentifierNorm("identifier"), "=", query.identifierNorm)
          .where("identifier.is_verified", "=", true)
          .where("product.identifier_status", "=", "VERIFIED")
          .where("product.status", "=", "ACTIVE")
          .where("brand.is_active", "=", true)
          .orderBy("product.public_id")
          .orderBy("sku.public_id")
          .limit(maximumMatches + 1)
          .execute();
      } else if (query.optionKey === undefined) {
        rows = await db
          .selectFrom("app.product_master as product")
          .innerJoin("app.brand as brand", "brand.id", "product.brand_id")
          .select([
            "brand.brand_key",
            "product.product_name",
            "product.public_id as product_public_id",
          ])
          .where("brand.brand_key", "=", query.brandKey)
          .where("brand.is_active", "=", true)
          .where("product.product_name_norm", "=", query.productNameNorm)
          .where("product.identifier_status", "=", "VERIFIED")
          .where("product.status", "=", "ACTIVE")
          .orderBy("product.public_id")
          .limit(maximumMatches + 1)
          .execute()
          .then((items) =>
            items.map((item) => ({
              ...item,
              identifier_norm: null,
              identifier_type: null,
              identifier_value: null,
              sku_public_id: null,
            })),
          );
      } else {
        rows = await db
          .selectFrom("app.product_master as product")
          .innerJoin("app.brand as brand", "brand.id", "product.brand_id")
          .innerJoin("app.product_sku as sku", "sku.product_id", "product.id")
          .select([
            "brand.brand_key",
            "product.product_name",
            "product.public_id as product_public_id",
            "sku.public_id as sku_public_id",
          ])
          .where("brand.brand_key", "=", query.brandKey)
          .where("brand.is_active", "=", true)
          .where("product.product_name_norm", "=", query.productNameNorm)
          .where("product.identifier_status", "=", "VERIFIED")
          .where("product.status", "=", "ACTIVE")
          .where("sku.option_key", "=", query.optionKey)
          .where("sku.status", "=", "ACTIVE")
          .orderBy("product.public_id")
          .orderBy("sku.public_id")
          .limit(maximumMatches + 1)
          .execute()
          .then((items) =>
            items.map((item) => ({
              ...item,
              identifier_norm: null,
              identifier_type: null,
              identifier_value: null,
            })),
          );
      }
      return toResult(query, rows);
    },
  });
}
