import type { SourceIdentifierType, SourceProductInput } from "@bros/contracts";

const MAX_CANDIDATES = 128;
const MAX_DEPTH = 16;
const MAX_NODES = 10_000;

const rawKeyTypes: Readonly<Record<string, SourceIdentifierType>> = {
  barcode: "BARCODE",
  barcodes: "BARCODE",
  brandcode: "BRAND_CODE",
  ean: "EAN",
  gtin: "GTIN",
  modelno: "MODEL_NO",
  modelnumber: "MODEL_NO",
  mpn: "MPN",
  productno: "PRODUCT_NO",
  productnumber: "PRODUCT_NO",
  stylecode: "STYLE_CODE",
  upc: "UPC",
  모델번호: "MODEL_NO",
  바코드: "BARCODE",
  브랜드코드: "BRAND_CODE",
  상품번호: "PRODUCT_NO",
  스타일코드: "STYLE_CODE",
  품번: "MODEL_NO",
};

export interface IdentifierProvenance {
  kind: "RAW_JSON" | "SOURCE_FIELD";
  path: string;
}

export interface ExtractedIdentifierCandidate {
  normalizedValue: string;
  provenance: IdentifierProvenance[];
  type: SourceIdentifierType;
  value: string;
}

export interface EmbeddedIdentifierExtraction {
  candidates: ExtractedIdentifierCandidate[];
  truncated: boolean;
}

export interface EmbeddedIdentifierInput {
  identifiers?: SourceProductInput["identifiers"];
  raw?: unknown;
}

function escapeJsonPointerSegment(segment: string): string {
  return segment.replace(/~/gu, "~0").replace(/\//gu, "~1");
}

function normalizeKey(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\s_-]/gu, "")
    .toLocaleLowerCase("en-US");
}

export function normalizeIdentifierValue(value: string): string | undefined {
  const normalized = value
    .normalize("NFKC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleUpperCase("en-US");
  return normalized.length === 0 || normalized.length > 512 ? undefined : normalized;
}

function candidateKey(type: SourceIdentifierType, normalizedValue: string): string {
  return `${type}\u0000${normalizedValue}`;
}

function rawKeyType(value: string): SourceIdentifierType | undefined {
  return rawKeyTypes[normalizeKey(value)];
}

function addCandidate(
  candidates: Map<string, ExtractedIdentifierCandidate>,
  type: SourceIdentifierType,
  value: string,
  provenance: IdentifierProvenance,
): boolean {
  const normalizedValue = normalizeIdentifierValue(value);
  if (normalizedValue === undefined) return false;
  const key = candidateKey(type, normalizedValue);
  const existing = candidates.get(key);
  if (existing !== undefined) {
    existing.provenance.push(provenance);
    return false;
  }
  if (candidates.size >= MAX_CANDIDATES) return true;
  candidates.set(key, { normalizedValue, provenance: [provenance], type, value: value.trim() });
  return false;
}

/**
 * Extracts only values stored in explicit identifier fields or allowlisted raw
 * keys. It intentionally does not infer identifiers from product names or
 * arbitrary strings; classification and matching belong to later stages.
 */
export function extractEmbeddedIdentifiers(
  input: EmbeddedIdentifierInput,
): EmbeddedIdentifierExtraction {
  const candidates = new Map<string, ExtractedIdentifierCandidate>();
  let truncated = false;

  for (const [index, identifier] of (input.identifiers ?? []).entries()) {
    truncated ||= addCandidate(candidates, identifier.type, identifier.value, {
      kind: "SOURCE_FIELD",
      path: `/identifiers/${index}`,
    });
  }

  let visited = 0;
  const visit = (value: unknown, path: string, depth: number): void => {
    if (truncated) return;
    visited += 1;
    if (visited > MAX_NODES || depth > MAX_DEPTH) {
      truncated = true;
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}/${index}`, depth + 1));
      return;
    }
    if (typeof value !== "object" || value === null) return;

    const record = value as Record<string, unknown>;
    for (const key of Object.keys(record).sort((left, right) =>
      left.localeCompare(right, "en-US"),
    )) {
      const child = record[key];
      const childPath = `${path}/${escapeJsonPointerSegment(key)}`;
      const type = rawKeyType(key);
      if (type !== undefined && typeof child === "string") {
        truncated ||= addCandidate(candidates, type, child, { kind: "RAW_JSON", path: childPath });
      }
      if (type !== undefined && Array.isArray(child)) {
        child.forEach((item, index) => {
          if (typeof item === "string") {
            truncated ||= addCandidate(candidates, type, item, {
              kind: "RAW_JSON",
              path: `${childPath}/${index}`,
            });
          }
        });
      }
      if (child !== undefined) visit(child, childPath, depth + 1);
    }
  };

  if (input.raw !== undefined) visit(input.raw, "", 0);
  return { candidates: [...candidates.values()], truncated };
}
