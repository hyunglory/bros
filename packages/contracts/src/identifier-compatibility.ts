import type { SourceIdentifierType } from "./source-product.js";

// A comparison key only. P2 stored norms and P3 candidate norms retain their
// original versioned meaning; this key links representations of the same code.
const separators = /[\s_\-\u2010\u2011\u2012\u2013\u2014\u2212]/gu;
const codeTypes = new Set(["MODEL_NO", "STYLE_CODE", "PRODUCT_NO", "MPN"]);
const gtinTypes = new Set(["GTIN", "EAN", "UPC"]);

export function compatibleIdentifierNorm(
  type: SourceIdentifierType,
  value: string,
): string | undefined {
  const base = value.normalize("NFKC").trim().toLocaleUpperCase("en-US");
  if (base.length === 0 || base.length > 512) return undefined;
  if (codeTypes.has(type)) {
    const key = base.replace(separators, "");
    return key.length > 0 && key.length <= 512 ? key : undefined;
  }
  if (gtinTypes.has(type)) {
    const key = base.replace(separators, "");
    if (!/^\d+$/u.test(key)) return undefined;
    const lengths = type === "GTIN" ? [8, 12, 13, 14] : type === "EAN" ? [8, 13] : [12];
    return lengths.includes(key.length) ? key : undefined;
  }
  // BRAND_CODE/BARCODE preserve their issuer-defined separators. P2 and P3
  // may assign different meaning to spaces here; do not infer equivalence.
  return base;
}
