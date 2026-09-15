import {
  type IdentifierResolveInput,
  type SourceIdentifierType,
  validateIdentifierResolveInput,
} from "@bros/contracts";

export interface ExternalCandidateRequest {
  brandKey: string | null;
  input: IdentifierResolveInput;
}

export interface ExternalIdentifierCandidate {
  identifierType: SourceIdentifierType;
  candidateValue: string;
  evidence: {
    type: "SEARCH_RESULT";
    strength: "WEAK";
    providerId: string;
    sourceUrl: string;
    retrievedAt: string;
    resultRank: number;
    surface: "TITLE" | "DESCRIPTION" | "URL_PATH" | "URL_QUERY";
    locator: string;
    matchedText: string;
    matchStart: number;
    matchEnd: number;
    patternId: string;
    registryVersion: string;
  };
}

export type ExternalProviderErrorCode =
  | "PROVIDER_DISABLED"
  | "PROVIDER_NOT_CONFIGURED"
  | "INVALID_SOURCE_DATA"
  | "BRAND_UNKNOWN"
  | "BUDGET_EXCEEDED"
  | "RATE_LIMIT"
  | "CIRCUIT_OPEN"
  | "TIMEOUT"
  | "EXTERNAL_SEARCH_FAILED";

export type ExternalCandidateResult =
  | {
      outcome: "CANDIDATES" | "NOT_FOUND";
      providerId: string;
      candidates: readonly ExternalIdentifierCandidate[];
      truncated: boolean;
      /** Recorded cost for this call only; missing/null means unknown, not the policy price. */
      costUsd?: number | null;
    }
  | {
      outcome: "ERROR";
      providerId: string;
      code: ExternalProviderErrorCode;
      costUsd?: number | null;
    };

export interface ExternalCandidateProvider {
  readonly providerId: string;
  search(request: ExternalCandidateRequest, signal?: AbortSignal): Promise<ExternalCandidateResult>;
}

export interface ExternalProviderPolicy {
  timeoutMs: number;
  minIntervalMs: number;
  failureThreshold: number;
  circuitOpenMs: number;
  rateLimitCooldownMs: number;
  requestCostMicrousd: number;
  maxRequestCostMicrousd: number;
  dailyBudgetMicrousd: number;
}

export interface ProviderBudgetReservation {
  providerId: string;
  utcDay: string;
  costMicrousd: number;
  dailyBudgetMicrousd: number;
  signal: AbortSignal;
}

// Implementations must reserve atomically across all workers and restarts, keyed
// by provider account + UTC day, and never refund an uncertain/timed-out call.
export interface ProviderBudget {
  readonly scope: "SHARED_DURABLE" | "FIXTURE_MEMORY";
  reserve(request: ProviderBudgetReservation): Promise<boolean>;
}

/** Account-wide admission around the entire transport/body lifetime. Never auto-expire an active call. */
export interface ProviderRequestQuota {
  readonly scope: "SHARED_DURABLE";
  execute<T>(
    request: {
      providerId: string;
      costMicrousd: number;
      dailyBudgetMicrousd: number;
      minIntervalMs: number;
      rateLimitCooldownMs: number;
      signal: AbortSignal;
    },
    perform: () => Promise<T>,
  ): Promise<T>;
}

export function createFixtureProviderBudget(): ProviderBudget {
  const spent = new Map<string, number>();
  return {
    scope: "FIXTURE_MEMORY",
    async reserve(request) {
      if (request.signal.aborted) return false;
      const key = `${request.providerId}:${request.utcDay}`;
      const amount = spent.get(key) ?? 0;
      if (request.costMicrousd > request.dailyBudgetMicrousd - amount) return false;
      spent.set(key, amount + request.costMicrousd);
      return true;
    },
  };
}

export class ExternalProviderFailure extends Error {
  constructor(
    readonly code: ExternalProviderErrorCode,
    readonly retryAfterMs = 0,
    readonly countsAsFailure = true,
  ) {
    super(code);
    this.name = "ExternalProviderFailure";
  }
}

export interface ExternalCandidateSource {
  readonly providerId: string;
  search(
    request: ExternalCandidateRequest,
    signal: AbortSignal,
  ): Promise<{
    candidates: readonly ExternalIdentifierCandidate[];
    truncated: boolean;
    costUsd?: number | null;
  }>;
}

export function isExternalProviderPolicy(value: unknown): value is ExternalProviderPolicy {
  if (typeof value !== "object" || value === null) return false;
  const policy = value as ExternalProviderPolicy;
  const bounded = (v: number, max: number) => Number.isSafeInteger(v) && v > 0 && v <= max;
  return (
    bounded(policy.timeoutMs, 60_000) &&
    bounded(policy.minIntervalMs, 86_400_000) &&
    bounded(policy.failureThreshold, 100) &&
    bounded(policy.circuitOpenMs, 86_400_000) &&
    bounded(policy.rateLimitCooldownMs, 86_400_000) &&
    bounded(policy.requestCostMicrousd, Number.MAX_SAFE_INTEGER) &&
    bounded(policy.maxRequestCostMicrousd, Number.MAX_SAFE_INTEGER) &&
    bounded(policy.dailyBudgetMicrousd, Number.MAX_SAFE_INTEGER) &&
    policy.requestCostMicrousd <= policy.maxRequestCostMicrousd &&
    policy.requestCostMicrousd <= policy.dailyBudgetMicrousd
  );
}

/** Reuse one provider instance per worker. The budget port handles account-wide limits. */
export function createExternalCandidateProvider(
  source: ExternalCandidateSource,
  policyValue: ExternalProviderPolicy,
  now: () => number = Date.now,
): ExternalCandidateProvider {
  if (!isExternalProviderPolicy(policyValue)) {
    throw new ExternalProviderFailure("PROVIDER_NOT_CONFIGURED");
  }
  const policy = { ...policyValue };
  const providerId = source.providerId;
  let busy = false;
  let nextRequestAt = 0;
  let openUntil = 0;
  let failures = 0;
  const error = (code: ExternalProviderErrorCode): ExternalCandidateResult => ({
    outcome: "ERROR",
    providerId,
    code,
  });

  return {
    providerId,
    async search(request, parentSignal) {
      let controller: AbortController | undefined;
      let timer: ReturnType<typeof setTimeout> | undefined;
      let acquired = false;
      let onAbort: (() => void) | undefined;
      try {
        parentSignal?.throwIfAborted();
        if (!request || !validateIdentifierResolveInput(request.input).ok) {
          return error("INVALID_SOURCE_DATA");
        }
        if (
          typeof request.brandKey !== "string" ||
          !/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/u.test(request.brandKey)
        ) {
          return error("BRAND_UNKNOWN");
        }
        const timestamp = now();
        if (timestamp < openUntil) return error("CIRCUIT_OPEN");
        if (busy || timestamp < nextRequestAt) return error("RATE_LIMIT");
        busy = true;
        acquired = true;
        nextRequestAt = timestamp + policy.minIntervalMs;
        controller = new AbortController();
        const signal = controller.signal;
        // Copy before yielding: caller mutation cannot change the outbound query.
        const snapshot = structuredClone(request);
        const deadline = new Promise<never>((_resolve, reject) => {
          onAbort = () => {
            controller?.abort();
            reject(new ExternalProviderFailure("TIMEOUT"));
          };
          parentSignal?.addEventListener("abort", onAbort, { once: true });
          if (parentSignal?.aborted) onAbort();
          timer = setTimeout(() => {
            reject(new ExternalProviderFailure("TIMEOUT"));
            controller?.abort();
          }, policy.timeoutMs);
        });
        const result = await Promise.race([source.search(snapshot, signal), deadline]);
        failures = 0;
        openUntil = 0;
        return {
          outcome: result.candidates.length > 0 ? "CANDIDATES" : "NOT_FOUND",
          providerId,
          candidates: result.candidates,
          truncated: result.truncated,
          ...(result.costUsd === undefined ? {} : { costUsd: result.costUsd }),
        };
      } catch (cause) {
        const code =
          cause instanceof ExternalProviderFailure ? cause.code : "EXTERNAL_SEARCH_FAILED";
        if (acquired) {
          if (code === "RATE_LIMIT") {
            const delay = cause instanceof ExternalProviderFailure ? cause.retryAfterMs : 0;
            nextRequestAt = now() + Math.max(policy.rateLimitCooldownMs, delay);
          }
          if (
            (!(cause instanceof ExternalProviderFailure) || cause.countsAsFailure) &&
            ["TIMEOUT", "RATE_LIMIT", "INVALID_SOURCE_DATA", "EXTERNAL_SEARCH_FAILED"].includes(
              code,
            )
          ) {
            if (++failures >= policy.failureThreshold) openUntil = now() + policy.circuitOpenMs;
          }
        }
        return error(code);
      } finally {
        if (onAbort) parentSignal?.removeEventListener("abort", onAbort);
        if (timer !== undefined) clearTimeout(timer);
        controller?.abort();
        if (acquired) busy = false;
      }
    },
  };
}
