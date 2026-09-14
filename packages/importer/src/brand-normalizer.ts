import type { DatabaseClient } from "@bros/db";

export type BrandNormalizationStatus = "RESOLVED" | "UNRESOLVED";

export interface BrandNormalizationInput {
  platformCode: string;
  rawBrandName: string | null | undefined;
}

export interface ResolvedBrand {
  brandKey: string;
  nameEn: string | null;
  nameKo: string | null;
  publicId: string;
}

export type BrandNormalizationResult =
  | {
      aliasName: string;
      aliasScope: "GLOBAL" | "PLATFORM";
      brand: ResolvedBrand;
      normalizedName: string;
      status: "RESOLVED";
    }
  | {
      normalizedName: string | undefined;
      reason: "INACTIVE_PLATFORM" | "MISSING_BRAND_NAME" | "UNKNOWN_ALIAS" | "UNKNOWN_PLATFORM";
      status: "UNRESOLVED";
    };

interface AliasRow {
  aliasName: string;
  brandKey: string;
  nameEn: string | null;
  nameKo: string | null;
  publicId: string;
}

/**
 * Produces the only form used for exact alias lookup. Deliberately retains
 * punctuation: punctuation removal or fuzzy matching would turn an unapproved
 * spelling into a brand assignment.
 */
export function normalizeBrandAliasName(value: string | null | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("en-US");
  return normalized.length === 0 ? undefined : normalized;
}

function resultFromAlias(
  alias: AliasRow,
  aliasScope: "GLOBAL" | "PLATFORM",
  normalizedName: string,
): BrandNormalizationResult {
  return {
    aliasName: alias.aliasName,
    aliasScope,
    brand: {
      brandKey: alias.brandKey,
      nameEn: alias.nameEn,
      nameKo: alias.nameKo,
      publicId: alias.publicId,
    },
    normalizedName,
    status: "RESOLVED",
  };
}

export function createBrandNormalizer(database: Pick<DatabaseClient, "db">) {
  const selectAlias = (aliasNorm: string) =>
    database.db
      .selectFrom("app.brand_alias")
      .innerJoin("app.brand", "app.brand.id", "app.brand_alias.brand_id")
      .select([
        "app.brand_alias.alias_name as aliasName",
        "app.brand.brand_key as brandKey",
        "app.brand.name_en as nameEn",
        "app.brand.name_ko as nameKo",
        "app.brand.public_id as publicId",
      ])
      .where("app.brand_alias.alias_norm", "=", aliasNorm)
      .where("app.brand.is_active", "=", true);

  return {
    normalize: async (input: BrandNormalizationInput): Promise<BrandNormalizationResult> => {
      const normalizedName = normalizeBrandAliasName(input.rawBrandName);
      if (normalizedName === undefined) {
        return { normalizedName, reason: "MISSING_BRAND_NAME", status: "UNRESOLVED" };
      }

      const platform = await database.db
        .selectFrom("app.platform")
        .select(["id", "is_active as isActive"])
        .where("code", "=", input.platformCode)
        .executeTakeFirst();
      if (platform === undefined) {
        return { normalizedName, reason: "UNKNOWN_PLATFORM", status: "UNRESOLVED" };
      }
      if (!platform.isActive) {
        return { normalizedName, reason: "INACTIVE_PLATFORM", status: "UNRESOLVED" };
      }

      const platformAlias = await selectAlias(normalizedName)
        .where("app.brand_alias.platform_id", "=", platform.id)
        .executeTakeFirst();
      if (platformAlias !== undefined)
        return resultFromAlias(platformAlias, "PLATFORM", normalizedName);

      const globalAlias = await selectAlias(normalizedName)
        .where("app.brand_alias.platform_id", "is", null)
        .executeTakeFirst();
      if (globalAlias !== undefined) return resultFromAlias(globalAlias, "GLOBAL", normalizedName);

      return { normalizedName, reason: "UNKNOWN_ALIAS", status: "UNRESOLVED" };
    },
  };
}
