import {
  type IdentifierPatternSource,
  type IdentifierResolveInput,
  type SourceIdentifierType,
  validateIdentifierResolveInput,
} from "@bros/contracts";
import type { IdentifierPatternMatch } from "./pattern-registry.js";

export interface IdentifierPatternRegistry {
  match(
    brandKey: string | null,
    source: IdentifierPatternSource,
    value: string,
  ): readonly IdentifierPatternMatch[];
}

export interface ExtractedIdentifierCandidate {
  candidateValue: string;
  evidence: {
    locator: string;
    matchEnd: number;
    matchStart: number;
    matchedText: string;
    patternId: string;
    registryVersion: string;
    source: IdentifierPatternSource;
  };
  identifierType: SourceIdentifierType;
}

export interface IdentifierExtractionResult {
  candidates: readonly ExtractedIdentifierCandidate[];
  truncated: boolean;
}

export type IdentifierExtractorErrorCode = "INVALID_RESOLVE_INPUT" | "INVALID_EXTRACTION_REQUEST";

export class IdentifierExtractorError extends Error {
  constructor(readonly code: IdentifierExtractorErrorCode) {
    super(code);
    this.name = "IdentifierExtractorError";
  }
}

const maxRawDepth = 16;
const maxRawNodes = 5_000;
const maxSurfaces = 1_000;
const maxCandidates = 200;
const maxSurfaceLength = 16_384;

function pointerSegment(value: string): string {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}

function boundedText(value: string): string | undefined {
  return value.length <= maxSurfaceLength ? value : undefined;
}

export function createIdentifierExtractor(registry: IdentifierPatternRegistry) {
  if (registry === null || typeof registry !== "object" || typeof registry.match !== "function") {
    throw new IdentifierExtractorError("INVALID_EXTRACTION_REQUEST");
  }

  return Object.freeze({
    extract({
      brandKey,
      input,
    }: {
      brandKey: string | null;
      input: unknown;
    }): IdentifierExtractionResult {
      if (brandKey !== null && typeof brandKey !== "string") {
        throw new IdentifierExtractorError("INVALID_EXTRACTION_REQUEST");
      }
      const validated = validateIdentifierResolveInput(input);
      if (!validated.ok) throw new IdentifierExtractorError("INVALID_RESOLVE_INPUT");
      const candidates: ExtractedIdentifierCandidate[] = [];
      let surfaceCount = 0;
      let truncated = false;

      const append = (source: IdentifierPatternSource, locator: string, value: string): void => {
        if (truncated) return;
        const text = boundedText(value);
        if (text === undefined) {
          truncated = true;
          return;
        }
        if (++surfaceCount > maxSurfaces) {
          truncated = true;
          return;
        }
        for (const match of registry.match(brandKey, source, text)) {
          if (
            match.source !== source ||
            match.matchStart < 0 ||
            match.matchEnd < match.matchStart ||
            match.matchEnd > text.length
          ) {
            throw new IdentifierExtractorError("INVALID_EXTRACTION_REQUEST");
          }
          const matchedText = text.slice(match.matchStart, match.matchEnd);
          if (matchedText.length === 0 || match.candidateValue.trim().length === 0) {
            throw new IdentifierExtractorError("INVALID_EXTRACTION_REQUEST");
          }
          candidates.push(
            Object.freeze({
              candidateValue: match.candidateValue,
              evidence: Object.freeze({
                locator,
                matchEnd: match.matchEnd,
                matchStart: match.matchStart,
                matchedText,
                patternId: match.patternId,
                registryVersion: match.registryVersion,
                source,
              }),
              identifierType: match.identifierType,
            }),
          );
          if (candidates.length >= maxCandidates) {
            truncated = true;
            return;
          }
        }
      };

      const appendUrl = (locator: string, value: string): void => {
        let url: URL;
        try {
          url = new URL(value);
        } catch {
          throw new IdentifierExtractorError("INVALID_RESOLVE_INPUT");
        }
        append("URL", `${locator}/$url/path`, url.pathname);
        let queryIndex = 0;
        for (const [key, queryValue] of url.searchParams) {
          append("URL", `${locator}/$url/query/${queryIndex}/${pointerSegment(key)}`, queryValue);
          queryIndex++;
        }
      };

      const appendRaw = (raw: IdentifierResolveInput["raw"]): void => {
        const pending: { depth: number; locator: string; value: unknown }[] = [
          { depth: 0, locator: "/raw", value: raw },
        ];
        let visited = 0;
        while (pending.length > 0) {
          const current = pending.pop();
          if (current === undefined) break;
          if (++visited > maxRawNodes || current.depth > maxRawDepth) {
            truncated = true;
            break;
          }
          if (typeof current.value === "string") {
            if (isHttpUrl(current.value)) appendUrl(current.locator, current.value);
            else append("RAW", current.locator, current.value);
            continue;
          }
          if (Array.isArray(current.value)) {
            for (let index = current.value.length - 1; index >= 0; index--) {
              pending.push({
                depth: current.depth + 1,
                locator: `${current.locator}/${index}`,
                value: current.value[index],
              });
            }
          } else if (isRecord(current.value)) {
            const keys = Object.keys(current.value).sort();
            for (let index = keys.length - 1; index >= 0; index--) {
              const key = keys[index];
              if (key === undefined) continue;
              pending.push({
                depth: current.depth + 1,
                locator: `${current.locator}/${pointerSegment(key)}`,
                value: current.value[key],
              });
            }
          }
        }
      };

      append("TITLE", "/productName", validated.value.productName);
      if (validated.value.productUrl !== null) appendUrl("/productUrl", validated.value.productUrl);
      appendRaw(validated.value.raw);
      for (const [index, option] of (validated.value.import?.input.options ?? []).entries()) {
        append("OPTION", `/import/input/options/${index}/rawOptionName`, option.rawOptionName);
      }
      return Object.freeze({ candidates: Object.freeze(candidates), truncated });
    },
  });
}
