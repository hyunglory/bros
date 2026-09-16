import { createHash } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { IdentifierResolveInput, IdentifierPatternRegistryDefinition } from "@bros/contracts";
import type { DatabaseClient } from "@bros/db";
import { createBrandNormalizer, normalizeComparableText } from "@bros/importer";
import { createIdentifierPatternRegistry } from "./pattern-registry.js";
import { createIdentifierExtractor } from "./identifier-extractor.js";
import {
  createInternalCatalogProvider,
  type InternalCatalogSearchResult,
} from "./internal-catalog-provider.js";
import { createBraveSearchProvider } from "./brave-search-provider.js";
import type {
  ExternalCandidateProvider,
  ExternalCandidateRequest,
  ExternalCandidateResult,
} from "./external-candidate-provider.js";
import { createEvidenceCollector } from "./evidence-collector.js";
import { createCandidateNormalizer } from "./candidate-normalizer.js";
import { createCandidateScorer } from "./candidate-scorer.js";
import {
  createHardConflictDetector,
  type CandidateConflictFacts,
} from "./hard-conflict-detector.js";
import { createDecisionEngine, type DecisionEngineResult } from "./decision-engine.js";
import type { ResolverPipelineCapture } from "@bros/contracts";
import { evaluationDigest } from "./evaluation.js";
import { validatePipelineCapture } from "./capture.js";

export const emptyResolverPatterns: IdentifierPatternRegistryDefinition = Object.freeze({
  version: "unconfigured/v1",
  patterns: [],
});
export interface ResolverPipeline {
  readonly version: string;
  readonly captureRequired?: boolean;
  resolve(
    input: IdentifierResolveInput,
    signal: AbortSignal,
  ): Promise<DecisionEngineResult & { executionCapture?: ResolverPipelineCapture }>;
}

/** Reused for every run in one Worker. Provider's own timeout/cooldown/budget still apply. */
export function createThrottledProvider(
  provider: ExternalCandidateProvider,
  minIntervalMs: number,
) {
  if (!Number.isInteger(minIntervalMs) || minIntervalMs < 1 || minIntervalMs > 60000)
    throw new Error("INVALID_PROVIDER_INTERVAL");
  let tail: Promise<unknown> = Promise.resolve();
  let nextAt = 0;
  return {
    search(
      request: ExternalCandidateRequest,
      signal: AbortSignal,
    ): Promise<ExternalCandidateResult> {
      const snapshot = structuredClone(request);
      const pending = tail.then(async () => {
        signal.throwIfAborted();
        const wait = nextAt - Date.now();
        if (wait > 0) await delay(wait, undefined, { signal });
        signal.throwIfAborted();
        // Spacing after completion is conservative and also avoids overlapping calls.
        try {
          return await provider.search(snapshot, signal);
        } finally {
          nextAt = Date.now() + minIntervalMs;
        }
      });
      tail = pending.catch(() => undefined);
      return pending;
    },
  };
}

export function createResolverPipeline(
  database: DatabaseClient,
  options: {
    patterns?: IdentifierPatternRegistryDefinition;
    provider?: ExternalCandidateProvider;
    providerMinIntervalMs?: number;
    captureSourceKind?: ResolverPipelineCapture["sourceKind"];
  } = {},
): ResolverPipeline {
  const definition = structuredClone(options.patterns ?? emptyResolverPatterns);
  const registry = createIdentifierPatternRegistry(definition);
  const external = options.provider ?? createBraveSearchProvider({ registry });
  const provider = createThrottledProvider(external, options.providerMinIntervalMs ?? 1000);
  const sourceKind = options.captureSourceKind ?? "UNCLASSIFIED";
  const version = `resolver-orchestration/v2:${createHash("sha256")
    .update(JSON.stringify({ definition, providerId: external.providerId, sourceKind }))
    .digest("hex")}`;
  const extractor = createIdentifierExtractor(registry);
  const brandNormalizer = createBrandNormalizer(database);
  const catalog = createInternalCatalogProvider(database);
  const collector = createEvidenceCollector();
  const normalizer = createCandidateNormalizer();
  const scorer = createCandidateScorer();
  const detector = createHardConflictDetector();
  const engine = createDecisionEngine();
  return {
    version,
    captureRequired: true,
    async resolve(inputValue, signal) {
      const input = structuredClone(inputValue);
      const startedAt = new Date().toISOString();
      signal.throwIfAborted();
      const brand = await brandNormalizer.normalize({
        platformCode: input.platformCode,
        rawBrandName: input.brandName,
      });
      const brandKey = brand.status === "RESOLVED" ? brand.brand.brandKey : null;
      const extracted = extractor.extract({ brandKey, input });
      const initial = normalizer.normalize(collector.collect({ input, extracted }));
      const internal: InternalCatalogSearchResult[] = [];
      // Cap independent catalog probes; propagate truncation to the decision engine.
      for (const candidate of initial.candidates.slice(0, 100)) {
        signal.throwIfAborted();
        internal.push(
          await catalog.search({
            kind: "IDENTIFIER",
            identifierType: candidate.identifierType,
            identifierNorm: candidate.candidateNorm,
          }),
        );
      }
      if (brandKey !== null) {
        internal.push(
          await catalog.search({
            kind: "BRAND_NAME_VARIANT",
            brandKey,
            productNameNorm: normalizeComparableText(input.productName),
          }),
        );
      }
      const facts: CandidateConflictFacts[] = [];
      for (const result of internal) {
        if (result.query.kind !== "IDENTIFIER" || result.matches.length === 0) continue;
        const match =
          result.matches.find((item) => brandKey !== null && item.brandKey !== brandKey) ??
          result.matches[0];
        if (match)
          facts.push({
            candidateNorm: result.query.identifierNorm,
            identifierType: result.query.identifierType,
            facts: { brandKey: match.brandKey },
          });
      }
      const decide = (externalResults: ExternalCandidateResult[]) => {
        const collected = collector.collect({
          input,
          extracted,
          internalCatalogResults: internal,
          externalResults,
        });
        const collection = {
          ...collected,
          truncated: collected.truncated || initial.candidates.length > 100,
        };
        const conflictContext = {
          ...(brandKey === null ? {} : { sourceFacts: { brandKey } }),
          candidateFacts: facts,
        };
        const decision = engine.decide(
          detector.detect(scorer.score(normalizer.normalize(collection)), conflictContext),
        );
        return { decision, collection, conflictContext };
      };
      const captured = (
        resolved: ReturnType<typeof decide>,
        externalResults: ExternalCandidateResult[],
      ) => {
        const executionCapture = validatePipelineCapture({
          schemaVersion: 1,
          sourceKind,
          startedAt,
          finishedAt: new Date().toISOString(),
          inputDigest: evaluationDigest(input),
          decisionDigest: evaluationDigest(resolved.decision),
          providerAttempted: externalResults.length > 0,
          costScope: "COMPLETED_ATTEMPT_ONLY",
          capture: {
            reference: `source-product:${input.sourceProductPublicId}`,
            resolverVersion: version,
            registryVersion: definition.version,
            providerVersion: external.providerId,
            // A configured request price/budget reservation is not a measured charge.
            costUsd: externalResults.length === 0 ? 0 : (externalResults[0]?.costUsd ?? null),
            evidenceOrigin: "NON_AI",
            collection: resolved.collection,
            conflictContext: resolved.conflictContext,
          },
        });
        return { ...resolved.decision, executionCapture };
      };
      const local = decide([]);
      // Strong, unambiguous local recommendations avoid paid fallback; promotion remains OFF.
      if (
        local.decision.candidates.length > 0 &&
        local.decision.candidates.every((candidate) => candidate.autoAcceptEligible) &&
        !local.decision.truncated
      )
        return captured(local, []);
      const result = await provider.search({ brandKey, input }, signal);
      signal.throwIfAborted();
      return captured(decide([result]), [result]);
    },
  };
}
