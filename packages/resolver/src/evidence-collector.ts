import {
  compatibleIdentifierNorm,
  type IdentifierEvidence,
  type IdentifierEvidenceType,
  type IdentifierResolveInput,
  type SourceIdentifierType,
  validateIdentifierEvidence,
  validateIdentifierResolveInput,
} from "@bros/contracts";
import type {
  ExternalCandidateResult,
  ExternalProviderErrorCode,
} from "./external-candidate-provider.js";
import type { IdentifierExtractionResult } from "./identifier-extractor.js";
import type { InternalCatalogSearchResult } from "./internal-catalog-provider.js";

const maxCandidates = 1_000;
const maxEvidencePerCandidate = 100;
const maxReferences = 100;
const maxProviderFailures = 100;

export type EvidenceCollectorErrorCode = "INVALID_EVIDENCE_INPUT" | "INVALID_EVIDENCE_OUTPUT";

export class EvidenceCollectorError extends Error {
  constructor(readonly code: EvidenceCollectorErrorCode) {
    super(code);
    this.name = "EvidenceCollectorError";
  }
}

export interface CollectedIdentifierCandidate {
  candidateValue: string;
  evidence: readonly IdentifierEvidence[];
  identifierType: SourceIdentifierType;
}

export interface InternalCatalogReference {
  matchedProductPublicIds: readonly string[];
  outcome: "AMBIGUOUS" | "EXACT" | "MISS";
  queryKind: "BRAND_NAME_VARIANT" | "IDENTIFIER";
  truncated: boolean;
}

export interface ProviderFailureReference {
  code: ExternalProviderErrorCode;
  providerId: string;
}

export interface EvidenceCollection {
  candidates: readonly CollectedIdentifierCandidate[];
  internalCatalogReferences: readonly InternalCatalogReference[];
  providerFailures: readonly ProviderFailureReference[];
  truncated: boolean;
}

export interface EvidenceCollectorRequest {
  externalResults?: readonly ExternalCandidateResult[];
  extracted?: IdentifierExtractionResult;
  input: unknown;
  internalCatalogResults?: readonly InternalCatalogSearchResult[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredText(value: unknown, maximum: number): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.trim() !== value ||
    value.length > maximum
  ) {
    throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
  }
  return value;
}

function identifierType(value: unknown): SourceIdentifierType {
  const supported = new Set([
    "MODEL_NO",
    "STYLE_CODE",
    "PRODUCT_NO",
    "MPN",
    "GTIN",
    "EAN",
    "UPC",
    "BARCODE",
    "BRAND_CODE",
  ]);
  if (typeof value !== "string" || !supported.has(value)) {
    throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
  }
  return value as SourceIdentifierType;
}

function frozen<T>(value: T): T {
  return Object.freeze(value);
}

function evidenceKey(value: IdentifierEvidence): string {
  return JSON.stringify(value);
}

function candidateKey(type: SourceIdentifierType, value: string): string {
  return JSON.stringify([type, value]);
}

function sourceEvidenceType(source: unknown): IdentifierEvidenceType {
  if (source === "RAW") return "SOURCE_FIELD";
  if (source === "TITLE") return "TITLE_MATCH";
  if (source === "URL") return "URL_MATCH";
  if (source === "OPTION") return "OPTION_MATCH";
  throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
}

function sourceWeight(source: unknown): number {
  if (source === "RAW") return 45;
  if (source === "OPTION") return 35;
  if (source === "TITLE") return 30;
  if (source === "URL") return 25;
  throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
}

function sortedEvidence(values: Iterable<IdentifierEvidence>): readonly IdentifierEvidence[] {
  return frozen(
    [...values]
      .sort((left, right) => evidenceKey(left).localeCompare(evidenceKey(right)))
      .map((value) => frozen({ ...value, provenance: frozen({ ...value.provenance }) })),
  );
}

function validatedEvidence(value: unknown): IdentifierEvidence {
  const result = validateIdentifierEvidence(value);
  if (!result.ok) throw new EvidenceCollectorError("INVALID_EVIDENCE_OUTPUT");
  return result.value;
}

export function createEvidenceCollector() {
  return frozen({
    collect(request: EvidenceCollectorRequest): EvidenceCollection {
      if (!isRecord(request)) throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
      const parsedInput = validateIdentifierResolveInput(request.input);
      if (!parsedInput.ok) throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
      const input: IdentifierResolveInput = structuredClone(parsedInput.value);
      const grouped = new Map<
        string,
        { type: SourceIdentifierType; value: string; evidence: Map<string, IdentifierEvidence> }
      >();
      const references = new Map<string, InternalCatalogReference>();
      const failures = new Map<string, ProviderFailureReference>();
      let truncated = false;

      const add = (type: SourceIdentifierType, value: string, rawEvidence: unknown): void => {
        if (value.length > 512 || value.trim() !== value || value.length === 0) {
          throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
        }
        const evidence = validatedEvidence(rawEvidence);
        if (evidence.identifierType !== type)
          throw new EvidenceCollectorError("INVALID_EVIDENCE_OUTPUT");
        const key = candidateKey(type, value);
        const existing = grouped.get(key);
        if (existing === undefined) {
          if (grouped.size >= maxCandidates) {
            truncated = true;
            return;
          }
          grouped.set(key, { type, value, evidence: new Map([[evidenceKey(evidence), evidence]]) });
          return;
        }
        if (
          existing.evidence.size >= maxEvidencePerCandidate &&
          !existing.evidence.has(evidenceKey(evidence))
        ) {
          truncated = true;
          return;
        }
        existing.evidence.set(evidenceKey(evidence), evidence);
      };

      for (const [index, identifier] of (input.import?.input.identifiers ?? []).entries()) {
        add(identifier.type, identifier.value.trim(), {
          schemaVersion: 1,
          identifierType: identifier.type,
          type: "SOURCE_FIELD",
          source: "SOURCE_EXTRACTOR",
          strength: "WEAK",
          weight: 45,
          provenance: {
            capturedAt: input.collectedAt,
            locator: `/import/input/identifiers/${index}/value`,
          },
        });
      }

      if (request.extracted !== undefined) {
        const result = request.extracted;
        if (
          !isRecord(result) ||
          !Array.isArray(result.candidates) ||
          typeof result.truncated !== "boolean"
        ) {
          throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
        }
        truncated ||= result.truncated;
        for (const candidate of result.candidates) {
          if (!isRecord(candidate) || !isRecord(candidate.evidence)) {
            throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
          }
          const type = identifierType(candidate.identifierType);
          const value = requiredText(candidate.candidateValue, 512);
          const source = candidate.evidence.source;
          const matchStart = candidate.evidence.matchStart;
          const matchEnd = candidate.evidence.matchEnd;
          if (
            typeof matchStart !== "number" ||
            typeof matchEnd !== "number" ||
            !Number.isInteger(matchStart) ||
            !Number.isInteger(matchEnd) ||
            matchStart < 0 ||
            matchEnd <= matchStart ||
            typeof candidate.evidence.matchedText !== "string" ||
            candidate.evidence.matchedText.length > 2048
          )
            throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
          add(type, value, {
            schemaVersion: 1,
            identifierType: type,
            type: sourceEvidenceType(source),
            source: "SOURCE_EXTRACTOR",
            strength: "WEAK",
            weight: sourceWeight(source),
            provenance: {
              capturedAt: input.collectedAt,
              locator: requiredText(candidate.evidence.locator, 4096),
              matchStart,
              matchEnd,
              matchedText: candidate.evidence.matchedText,
              patternId: requiredText(candidate.evidence.patternId, 64),
              registryVersion: requiredText(candidate.evidence.registryVersion, 128),
              surface: source,
            },
          });
        }
      }

      for (const result of request.internalCatalogResults ?? []) {
        if (
          !isRecord(result) ||
          !isRecord(result.query) ||
          !Array.isArray(result.matches) ||
          typeof result.truncated !== "boolean"
        ) {
          throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
        }
        const kind = result.query.kind;
        if (kind !== "IDENTIFIER" && kind !== "BRAND_NAME_VARIANT") {
          throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
        }
        if (
          result.outcome !== "EXACT" &&
          result.outcome !== "AMBIGUOUS" &&
          result.outcome !== "MISS"
        ) {
          throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
        }
        truncated ||= result.truncated;
        const productIds: string[] = [];
        for (const [index, match] of result.matches.entries()) {
          if (!isRecord(match)) throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
          const productPublicId = requiredText(match.productPublicId, 128);
          productIds.push(productPublicId);
          if (kind !== "IDENTIFIER" || !isRecord(match.matchedIdentifier)) continue;
          const matchedType = identifierType(match.matchedIdentifier.type);
          const value = requiredText(match.matchedIdentifier.value, 512);
          const norm = requiredText(match.matchedIdentifier.norm, 512);
          const queryType = identifierType(result.query.identifierType);
          const queryNorm = requiredText(result.query.identifierNorm, 512);
          if (
            matchedType !== queryType ||
            (norm !== queryNorm && compatibleIdentifierNorm(matchedType, norm) !== queryNorm)
          )
            throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
          const skuIds = Array.isArray(match.matchedSkuPublicIds)
            ? match.matchedSkuPublicIds.map((item) => requiredText(item, 128)).sort()
            : (() => {
                throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
              })();
          add(matchedType, value, {
            schemaVersion: 1,
            identifierType: matchedType,
            type: "VERIFIED_INTERNAL_IDENTIFIER",
            source: "INTERNAL_CATALOG",
            strength: "VERIFIED",
            weight: 100,
            provenance: {
              capturedAt: input.collectedAt,
              locator: `/internalCatalog/${kind}/matches/${index}`,
              productPublicId,
              matchedSkuPublicIds: skuIds,
              surface: "IDENTIFIER",
            },
          });
        }
        const reference: InternalCatalogReference = frozen({
          matchedProductPublicIds: frozen([...new Set(productIds)].sort()),
          outcome: result.outcome,
          queryKind: kind,
          truncated: result.truncated,
        });
        if (references.size >= maxReferences && !references.has(JSON.stringify(reference)))
          truncated = true;
        else references.set(JSON.stringify(reference), reference);
      }

      for (const result of request.externalResults ?? []) {
        if (!isRecord(result) || typeof result.providerId !== "string") {
          throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
        }
        const providerId = requiredText(result.providerId, 128);
        if (result.outcome === "ERROR") {
          const allowed = new Set<ExternalProviderErrorCode>([
            "PROVIDER_DISABLED",
            "PROVIDER_NOT_CONFIGURED",
            "INVALID_SOURCE_DATA",
            "BRAND_UNKNOWN",
            "BUDGET_EXCEEDED",
            "RATE_LIMIT",
            "CIRCUIT_OPEN",
            "TIMEOUT",
            "EXTERNAL_SEARCH_FAILED",
          ]);
          if (
            typeof result.code !== "string" ||
            !allowed.has(result.code as ExternalProviderErrorCode)
          ) {
            throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
          }
          const failure = frozen({ providerId, code: result.code as ExternalProviderErrorCode });
          if (failures.size >= maxProviderFailures && !failures.has(JSON.stringify(failure)))
            truncated = true;
          else failures.set(JSON.stringify(failure), failure);
          continue;
        }
        if (
          (result.outcome !== "CANDIDATES" && result.outcome !== "NOT_FOUND") ||
          !Array.isArray(result.candidates) ||
          typeof result.truncated !== "boolean"
        ) {
          throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
        }
        truncated ||= result.truncated;
        for (const candidate of result.candidates) {
          if (!isRecord(candidate) || !isRecord(candidate.evidence))
            throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
          const type = identifierType(candidate.identifierType);
          const value = requiredText(candidate.candidateValue, 512);
          const evidence = candidate.evidence;
          if (
            evidence.providerId !== providerId ||
            evidence.type !== "SEARCH_RESULT" ||
            evidence.strength !== "WEAK"
          ) {
            throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
          }
          const start = evidence.matchStart;
          const end = evidence.matchEnd;
          if (
            typeof start !== "number" ||
            typeof end !== "number" ||
            !Number.isInteger(start) ||
            !Number.isInteger(end) ||
            start < 0 ||
            end <= start
          ) {
            throw new EvidenceCollectorError("INVALID_EVIDENCE_INPUT");
          }
          add(type, value, {
            schemaVersion: 1,
            identifierType: type,
            type: "EXTERNAL_CATALOG",
            source: "EXTERNAL_PROVIDER",
            strength: "WEAK",
            weight: 15,
            provenance: {
              capturedAt: requiredText(evidence.retrievedAt, 128),
              locator: requiredText(evidence.locator, 4096),
              matchStart: start,
              matchEnd: end,
              matchedText: requiredText(evidence.matchedText, 2048),
              patternId: requiredText(evidence.patternId, 64),
              providerId,
              registryVersion: requiredText(evidence.registryVersion, 128),
              resultRank: evidence.resultRank,
              sourceUrl: requiredText(evidence.sourceUrl, 4096),
              surface: requiredText(evidence.surface, 64),
            },
          });
        }
      }

      return frozen({
        candidates: frozen(
          [...grouped.values()]
            .sort((left, right) =>
              candidateKey(left.type, left.value).localeCompare(
                candidateKey(right.type, right.value),
              ),
            )
            .map((candidate) =>
              frozen({
                candidateValue: candidate.value,
                evidence: sortedEvidence(candidate.evidence.values()),
                identifierType: candidate.type,
              }),
            ),
        ),
        internalCatalogReferences: frozen(
          [...references.values()].sort((left, right) =>
            JSON.stringify(left).localeCompare(JSON.stringify(right)),
          ),
        ),
        providerFailures: frozen(
          [...failures.values()].sort((left, right) =>
            JSON.stringify(left).localeCompare(JSON.stringify(right)),
          ),
        ),
        truncated,
      });
    },
  });
}
