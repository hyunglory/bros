import { validateSourceRawJson } from "@bros/contracts";
import { maskSensitiveText, type SecretProvider } from "@bros/core";
import type { IdentifierPatternRegistry } from "./identifier-extractor.js";
import {
  createExternalCandidateProvider,
  createFixtureProviderBudget,
  ExternalProviderFailure,
  isExternalProviderPolicy,
  type ExternalCandidateProvider,
  type ExternalIdentifierCandidate,
  type ExternalProviderPolicy,
  type ProviderBudget,
  type ProviderRequestQuota,
} from "./external-candidate-provider.js";

const providerId = "brave-web-search-v1";
const endpoint = "https://api.search.brave.com/res/v1/web/search";
const maxBodyBytes = 524_288;

export interface BraveSearchProviderOptions {
  registry: IdentifierPatternRegistry;
  mode?: "disabled" | "fixture" | "live";
  policy?: ExternalProviderPolicy;
  secretProvider?: SecretProvider;
  budget?: ProviderBudget;
  quota?: ProviderRequestQuota;
  termsApproved?: boolean;
  storageRightsApproved?: boolean;
  // Injection is fixture-only. Live always calls the fixed HTTPS API endpoint.
  transport?: typeof fetch;
  now?: () => number;
}

function invalid(): never {
  throw new ExternalProviderFailure("INVALID_SOURCE_DATA");
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeText(value: unknown, maxLength: number, apiKey?: string): string {
  if (
    typeof value !== "string" ||
    value.length > maxLength ||
    maskSensitiveText(value) !== value ||
    (apiKey !== undefined && value.includes(apiKey))
  )
    return invalid();
  for (const character of value) {
    const code = character.charCodeAt(0);
    if (code < 32 && ![9, 10, 13].includes(code)) return invalid();
  }
  return value;
}

function safeUrl(value: unknown, apiKey: string): URL {
  const text = safeText(value, 4096, apiKey);
  try {
    const url = new URL(text);
    if (
      !["https:", "http:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      !validateSourceRawJson({ url: text }).ok
    )
      return invalid();
    safeText(decodeURIComponent(text), 4096, apiKey);
    // Fragments can contain private client state and are not search evidence.
    url.hash = "";
    return url;
  } catch {
    return invalid();
  }
}

function validateQuery(query: string, apiKey?: string): void {
  try {
    safeText(query, 600, apiKey);
    if (!query || query.split(" ").length > 75) invalid();
  } catch {
    // An invalid catalog query is not a provider outage.
    throw new ExternalProviderFailure("INVALID_SOURCE_DATA", 0, false);
  }
}

async function readJson(response: Response, signal: AbortSignal): Promise<unknown> {
  if (!/^application\/json(?:\s*;|$)/iu.test(response.headers.get("content-type") ?? "")) {
    return invalid();
  }
  if (Number(response.headers.get("content-length")) > maxBodyBytes) return invalid();
  const reader = response.body?.getReader();
  if (!reader) return invalid();
  const chunks: Uint8Array[] = [];
  let length = 0;
  const abort = () => {
    void reader.cancel().catch(() => {
      /* Cancellation must not escape the provider. */
    });
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      signal.throwIfAborted();
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > maxBodyBytes) return invalid();
      chunks.push(value);
    }
    try {
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    } catch {
      return invalid();
    }
  } finally {
    signal.removeEventListener("abort", abort);
    void reader.cancel().catch(() => {
      /* Cancellation must not escape the provider. */
    });
  }
}

function retryDelay(response: Response, now: number): number {
  const retry = response.headers.get("retry-after");
  const values: number[] = [];
  if (retry !== null) {
    values.push(/^\d+$/u.test(retry) ? Number(retry) * 1000 : Date.parse(retry) - now);
  }
  const resets = response.headers.get("x-ratelimit-reset")?.split(",") ?? [];
  const remaining = response.headers.get("x-ratelimit-remaining")?.split(",") ?? [];
  for (const [index, reset] of resets.entries()) {
    if (
      (remaining.length === resets.length && remaining[index]?.trim() === "0") ||
      remaining.length === 0
    ) {
      if (/^\d+$/u.test(reset.trim())) values.push(Number(reset.trim()) * 1000);
    }
  }
  return Math.max(
    0,
    ...values
      .filter((value) => Number.isFinite(value) && value > 0)
      .map((value) => Math.min(value, 2_147_483_647)),
  );
}

function extract(
  payload: unknown,
  registry: IdentifierPatternRegistry,
  brandKey: string | null,
  retrievedAt: string,
  apiKey: string,
): { candidates: ExternalIdentifierCandidate[]; truncated: boolean } {
  if (!record(payload) || payload.type !== "search") return invalid();
  const web = payload.web;
  if (web === undefined || web === null) return { candidates: [], truncated: false };
  if (!record(web) || !Array.isArray(web.results)) return invalid();
  const candidates: ExternalIdentifierCandidate[] = [];
  let truncated = web.results.length > 20;
  for (const [index, row] of web.results.slice(0, 20).entries()) {
    if (!record(row)) return invalid();
    const title = safeText(row.title, 4096, apiKey);
    if (!title.trim()) return invalid();
    const description = row.description == null ? "" : safeText(row.description, 16_384, apiKey);
    const url = safeUrl(row.url, apiKey);
    const surfaces: {
      surface: ExternalIdentifierCandidate["evidence"]["surface"];
      locator: string;
      text: string;
    }[] = [
      { surface: "TITLE", locator: `/web/results/${index}/title`, text: title },
      { surface: "DESCRIPTION", locator: `/web/results/${index}/description`, text: description },
      {
        surface: "URL_PATH",
        locator: `/web/results/${index}/url/pathname`,
        text: decodeURIComponent(url.pathname),
      },
    ];
    let queryIndex = 0;
    for (const value of url.searchParams.values()) {
      surfaces.push({
        surface: "URL_QUERY",
        locator: `/web/results/${index}/url/query/${queryIndex++}`,
        text: value,
      });
    }
    for (const surface of surfaces) {
      safeText(surface.text, 16_384, apiKey);
      const source = surface.surface.startsWith("URL_") ? "URL" : "TITLE";
      for (const match of registry.match(brandKey, source, surface.text)) {
        if (match.candidateValue.length > 512 || candidates.length >= 200) {
          truncated = true;
          continue;
        }
        candidates.push({
          identifierType: match.identifierType,
          candidateValue: match.candidateValue,
          evidence: {
            type: "SEARCH_RESULT",
            strength: "WEAK",
            providerId,
            sourceUrl: url.href,
            retrievedAt,
            resultRank: index + 1,
            surface: surface.surface,
            locator: surface.locator,
            matchedText: surface.text.slice(match.matchStart, match.matchEnd),
            matchStart: match.matchStart,
            matchEnd: match.matchEnd,
            patternId: match.patternId,
            registryVersion: match.registryVersion,
          },
        });
      }
    }
  }
  return { candidates, truncated };
}

export function createBraveSearchProvider(
  options: BraveSearchProviderOptions,
): ExternalCandidateProvider {
  const {
    mode = "disabled",
    registry,
    secretProvider,
    termsApproved,
    storageRightsApproved,
  } = options;
  const unavailable = (
    code: "PROVIDER_DISABLED" | "PROVIDER_NOT_CONFIGURED",
  ): ExternalCandidateProvider => ({
    providerId,
    async search() {
      return { outcome: "ERROR", providerId, code };
    },
  });
  if (mode === "disabled") return unavailable("PROVIDER_DISABLED");
  if (
    !["fixture", "live"].includes(mode) ||
    !isExternalProviderPolicy(options.policy) ||
    !secretProvider ||
    (mode === "fixture" && !options.transport) ||
    (mode === "live" &&
      (termsApproved !== true ||
        storageRightsApproved !== true ||
        options.quota?.scope !== "SHARED_DURABLE" ||
        typeof options.quota.execute !== "function" ||
        options.transport !== undefined ||
        options.now !== undefined))
  )
    return unavailable("PROVIDER_NOT_CONFIGURED");
  const policy = { ...options.policy };
  const budget = options.budget ?? createFixtureProviderBudget();
  const quota = options.quota;
  const transport = mode === "fixture" ? options.transport : fetch;
  const now = options.now ?? Date.now;
  return createExternalCandidateProvider(
    {
      providerId,
      async search(request, signal) {
        // Only these catalog fields cross the external boundary. No raw/import/IDs/URL.
        const query = [request.input.brandName, request.input.productName]
          .filter(Boolean)
          .join(" ")
          .replace(/\s+/gu, " ")
          .trim();
        validateQuery(query);
        const apiKey = await secretProvider.get("provider.brave.apiKey");
        signal.throwIfAborted();
        if (!apiKey || !/^[\x21-\x7e]+$/u.test(apiKey) || apiKey.length > 4096) {
          throw new ExternalProviderFailure("PROVIDER_NOT_CONFIGURED");
        }
        validateQuery(query, apiKey);
        const perform = async () => {
          signal.throwIfAborted();
          const url = new URL(endpoint);
          url.search = new URLSearchParams({
            q: query,
            count: "20",
            result_filter: "web",
            spellcheck: "false",
            text_decorations: "false",
            operators: "false",
          }).toString();
          if (!transport) throw new ExternalProviderFailure("PROVIDER_NOT_CONFIGURED");
          const response = await transport(url, {
            method: "GET",
            headers: { accept: "application/json", "X-Subscription-Token": apiKey },
            redirect: "error",
            signal,
          });
          // A late 429 must still reach shared quota even after the caller's deadline.
          if (response.status !== 200) {
            void response.body?.cancel().catch(() => {
              /* No response error text is exposed. */
            });
            if (response.status === 429)
              throw new ExternalProviderFailure("RATE_LIMIT", retryDelay(response, now()));
            throw new ExternalProviderFailure("EXTERNAL_SEARCH_FAILED");
          }
          signal.throwIfAborted();
          const payload = await readJson(response, signal);
          signal.throwIfAborted();
          return extract(
            payload,
            registry,
            request.brandKey,
            new Date(now()).toISOString(),
            apiKey,
          );
        };
        if (quota)
          return quota.execute(
            {
              providerId,
              costMicrousd: policy.requestCostMicrousd,
              dailyBudgetMicrousd: policy.dailyBudgetMicrousd,
              minIntervalMs: policy.minIntervalMs,
              rateLimitCooldownMs: policy.rateLimitCooldownMs,
              signal,
            },
            perform,
          );
        if (
          (await budget.reserve({
            providerId,
            utcDay: new Date(now()).toISOString().slice(0, 10),
            costMicrousd: policy.requestCostMicrousd,
            dailyBudgetMicrousd: policy.dailyBudgetMicrousd,
            signal,
          })) !== true
        ) {
          throw new ExternalProviderFailure("BUDGET_EXCEEDED");
        }
        return perform();
      },
    },
    policy,
    now,
  );
}
