import assert from "node:assert/strict";
import test from "node:test";
import { setImmediate } from "node:timers";
import { ReadableStream } from "node:stream/web";
const { Response } = globalThis;
import {
  createBraveSearchProvider,
  createExternalCandidateProvider,
  createFixtureProviderBudget,
  createIdentifierPatternRegistry,
} from "../dist/index.js";

const registry = createIdentifierPatternRegistry({
  version: "search-fixture-v1",
  patterns: ["TITLE", "URL"].map((source) => ({
    id: `${source}_FIXTURE`,
    brandKey: "fixture-brand",
    source,
    identifierType: "MODEL_NO",
    regex: "(?<identifier>FX-[0-9]{4})",
  })),
});
const request = {
  brandKey: "fixture-brand",
  input: {
    schemaVersion: 1,
    sourceProductPublicId: "01890f47-0c4d-7abc-8def-1234567890ab",
    productPublicId: null,
    platformCode: "FIXTURE",
    externalProductId: "never-outbound-id",
    productName: "Fixture shoes",
    brandName: "Fixture Brand",
    productUrl: "https://source.test/never-outbound-url",
    collectedAt: "2026-09-15T00:00:00Z",
    raw: { internal: "never-outbound-raw" },
    import: null,
  },
};
const policy = {
  timeoutMs: 1000,
  minIntervalMs: 1000,
  failureThreshold: 2,
  circuitOpenMs: 10_000,
  rateLimitCooldownMs: 2000,
  requestCostMicrousd: 5000,
  maxRequestCostMicrousd: 5000,
  dailyBudgetMicrousd: 100_000,
};
const apiKey = "synthetic-brave-fixture-key";
const body = () => ({
  type: "search",
  web: {
    results: [
      {
        title: "Shoes FX-1001",
        description: "Model FX-1002",
        url: "https://catalog.test/FX-1003?sku=FX-1004#ignored",
      },
    ],
  },
});
const response = (value = body(), init) => Response.json(value, init);
function setup(overrides = {}) {
  let current = Date.parse("2026-09-15T00:00:00Z");
  const calls = [];
  const options = {
    registry,
    mode: "fixture",
    policy,
    secretProvider: {
      async get() {
        return apiKey;
      },
    },
    now: () => current,
    transport: async (...args) => {
      calls.push(args);
      return response();
    },
    ...overrides,
  };
  return {
    provider: createBraveSearchProvider(options),
    calls,
    advance: (ms) => {
      current += ms;
    },
  };
}

test("Brave uses the fixed API, minimal query and weak traceable registry candidates", async () => {
  const { provider, calls } = setup();
  const result = await provider.search(request);
  assert.equal(result.outcome, "CANDIDATES");
  assert.equal(result.truncated, false);
  assert.deepEqual(
    result.candidates.map((c) => c.candidateValue),
    ["FX-1001", "FX-1002", "FX-1003", "FX-1004"],
  );
  const [url, init] = calls[0];
  assert.equal(url.origin + url.pathname, "https://api.search.brave.com/res/v1/web/search");
  assert.equal(url.searchParams.get("q"), "Fixture Brand Fixture shoes");
  assert.equal(url.searchParams.get("spellcheck"), "false");
  assert.equal(url.searchParams.get("operators"), "false");
  assert.equal(init.redirect, "error");
  assert.equal(init.headers["X-Subscription-Token"], apiKey);
  assert.doesNotMatch(url.href, /never-outbound/);
  for (const candidate of result.candidates) {
    assert.equal(candidate.evidence.strength, "WEAK");
    assert.equal(candidate.evidence.type, "SEARCH_RESULT");
    assert.equal(candidate.evidence.registryVersion, "search-fixture-v1");
    assert.equal(candidate.evidence.sourceUrl, "https://catalog.test/FX-1003?sku=FX-1004");
    assert.equal(candidate.evidence.resultRank, 1);
    assert.equal(candidate.evidence.retrievedAt, "2026-09-15T00:00:00.000Z");
    assert.equal(candidate.evidence.matchedText, candidate.candidateValue);
    assert.equal("candidateNorm" in candidate, false);
    assert.equal("confidenceScore" in candidate, false);
  }
  assert.doesNotMatch(JSON.stringify(result), /synthetic-brave-fixture-key/);
});

test("disabled and incomplete live configuration cannot resolve secrets or call transport", async () => {
  let calls = 0;
  const forbidden = async () => {
    calls++;
    throw Error("must not run");
  };
  for (const options of [
    {},
    { mode: "live" },
    { mode: "fixture" },
    {
      mode: "live",
      policy,
      termsApproved: true,
      storageRightsApproved: true,
      budget: createFixtureProviderBudget(),
    },
    {
      mode: "live",
      policy,
      termsApproved: true,
      storageRightsApproved: true,
      budget: { scope: "SHARED_DURABLE", reserve: forbidden },
      transport: forbidden,
    },
  ]) {
    const result = await createBraveSearchProvider({
      registry,
      secretProvider: { get: forbidden },
      ...options,
    }).search(request);
    assert.equal(result.outcome, "ERROR");
    assert.match(result.code, /^PROVIDER_(DISABLED|NOT_CONFIGURED)$/);
  }
  assert.equal(calls, 0);
});

test("invalid/missing cost, daily budget, timeout and rate settings fail closed", async () => {
  for (const [key, value] of [
    ["timeoutMs", 0],
    ["minIntervalMs", undefined],
    ["dailyBudgetMicrousd", NaN],
    ["requestCostMicrousd", 0],
    ["maxRequestCostMicrousd", 1],
    ["failureThreshold", 0],
    ["circuitOpenMs", Infinity],
    ["rateLimitCooldownMs", -1],
  ]) {
    const { provider, calls } = setup({ policy: { ...policy, [key]: value } });
    assert.equal((await provider.search(request)).code, "PROVIDER_NOT_CONFIGURED");
    assert.equal(calls.length, 0);
  }
});

test("invalid input, unknown brand, query size and secret-like query never reach HTTP", async () => {
  for (const value of [
    null,
    { ...request, input: {} },
    { ...request, brandKey: null },
    { ...request, brandKey: "Bad Brand" },
    { ...request, input: { ...request.input, productName: "x".repeat(601) } },
    { ...request, input: { ...request.input, productName: Array(76).fill("x").join(" ") } },
    { ...request, input: { ...request.input, productName: "token=not-for-provider" } },
  ]) {
    const { provider, calls } = setup();
    assert.equal((await provider.search(value)).outcome, "ERROR");
    assert.equal(calls.length, 0);
  }
});

test("missing/throwing secrets and denied/throwing budgets return fixed errors", async () => {
  for (const [overrides, code] of [
    [
      {
        secretProvider: {
          async get() {
            return undefined;
          },
        },
      },
      "PROVIDER_NOT_CONFIGURED",
    ],
    [
      {
        secretProvider: {
          async get() {
            throw Error(apiKey);
          },
        },
      },
      "EXTERNAL_SEARCH_FAILED",
    ],
    [
      {
        budget: {
          async reserve() {
            return false;
          },
        },
      },
      "BUDGET_EXCEEDED",
    ],
    [
      {
        budget: {
          async reserve() {
            throw Error(apiKey);
          },
        },
      },
      "EXTERNAL_SEARCH_FAILED",
    ],
  ]) {
    const { provider, calls } = setup(overrides);
    const result = await provider.search(request);
    assert.equal(result.code, code);
    assert.equal(calls.length, 0);
    assert.doesNotMatch(JSON.stringify(result), /synthetic-brave-fixture-key/);
  }
});

test("empty results and no pattern matches are normal NOT_FOUND", async () => {
  for (const payload of [
    { type: "search" },
    { type: "search", web: null },
    { type: "search", web: { results: [] } },
    {
      type: "search",
      web: { results: [{ title: "No identifiers", url: "https://example.test/" }] },
    },
  ]) {
    const { provider } = setup({ transport: async () => response(payload) });
    const result = await provider.search(request);
    assert.equal(result.outcome, "NOT_FOUND");
    assert.deepEqual(result.candidates, []);
  }
});

test("malformed/unsafe responses never become NOT_FOUND or partially accepted candidates", async () => {
  for (const payload of [
    {},
    [],
    { type: "other" },
    { type: "search", web: {} },
    { type: "search", web: { results: [null] } },
    ...[
      { title: 4 },
      { title: "" },
      { description: {} },
      { url: "file:///private" },
      { url: "https://user:password@catalog.test/FX-1001" },
      { url: "https://catalog.test/FX-1001?api_key=private" },
      { url: "https://catalog.test/FX-1001?%74oken=private" },
      { url: "https://catalog.test/FX-1001?auth=Bearer%20private" },
      { title: `FX-1001 ${apiKey}` },
      { description: "FX-1001 token=private" },
    ].map((changes) => ({
      type: "search",
      web: { results: [...body().web.results, { ...body().web.results[0], ...changes }] },
    })),
  ]) {
    const { provider } = setup({ transport: async () => response(payload) });
    const result = await provider.search(request);
    assert.equal(result.code, "INVALID_SOURCE_DATA");
    assert.equal("candidates" in result, false);
  }
});

test("bounded response body, content type and JSON syntax", async () => {
  for (const makeResponse of [
    () => new Response("bad json", { headers: { "content-type": "application/json" } }),
    () => new Response("<html>error</html>"),
    () => response(body(), { headers: { "content-length": "900000" } }),
    () => response({ type: "search", ignored: "x".repeat(524_288) }),
  ]) {
    assert.equal(
      (await setup({ transport: async () => makeResponse() }).provider.search(request)).code,
      "INVALID_SOURCE_DATA",
    );
  }
});

test("HTTP authentication/server/redirect errors and transport exceptions stay inside provider", async () => {
  for (const status of [301, 401, 403, 500, 503]) {
    const { provider } = setup({ transport: async () => new Response(apiKey, { status }) });
    assert.deepEqual(await provider.search(request), {
      outcome: "ERROR",
      providerId: "brave-web-search-v1",
      code: "EXTERNAL_SEARCH_FAILED",
    });
  }
  const { provider } = setup({
    transport: async () => {
      throw Error(apiKey);
    },
  });
  assert.equal((await provider.search(request)).code, "EXTERNAL_SEARCH_FAILED");
});

test("request spacing is enforced before a second paid request", async () => {
  const { provider, calls, advance } = setup();
  await provider.search(request);
  assert.equal((await provider.search(request)).code, "RATE_LIMIT");
  advance(1000);
  assert.equal((await provider.search(request)).outcome, "CANDIDATES");
  assert.equal(calls.length, 2);
});

test("429 respects Retry-After and exhausted Brave quota windows", async () => {
  for (const headers of [
    { "retry-after": "5" },
    { "retry-after": "Tue, 15 Sep 2026 00:00:05 GMT" },
    { "x-ratelimit-remaining": "1, 0", "x-ratelimit-reset": "1, 5" },
    { "x-ratelimit-reset": "1, 5" },
  ]) {
    let calls = 0;
    const { provider, advance } = setup({
      transport: async () =>
        ++calls === 1 ? new Response("", { status: 429, headers }) : response(),
    });
    assert.equal((await provider.search(request)).code, "RATE_LIMIT");
    advance(4999);
    assert.equal((await provider.search(request)).code, "RATE_LIMIT");
    assert.equal(calls, 1);
    advance(1);
    assert.equal((await provider.search(request)).outcome, "CANDIDATES");
    assert.equal(calls, 2);
  }
});

test("circuit opens on repeated failures and closes on one successful recovery probe", async () => {
  let healthy = false;
  let calls = 0;
  const { provider, advance } = setup({
    transport: async () => {
      calls++;
      return healthy ? response() : new Response("", { status: 503 });
    },
  });
  assert.equal((await provider.search(request)).code, "EXTERNAL_SEARCH_FAILED");
  advance(1000);
  assert.equal((await provider.search(request)).code, "EXTERNAL_SEARCH_FAILED");
  advance(9999);
  assert.equal((await provider.search(request)).code, "CIRCUIT_OPEN");
  assert.equal(calls, 2);
  advance(1);
  // Failed probe reopens for a full cooldown.
  assert.equal((await provider.search(request)).code, "EXTERNAL_SEARCH_FAILED");
  advance(1000);
  assert.equal((await provider.search(request)).code, "CIRCUIT_OPEN");
  healthy = true;
  advance(9000);
  assert.equal((await provider.search(request)).outcome, "CANDIDATES");
  advance(1000);
  assert.equal((await provider.search(request)).outcome, "CANDIDATES");
});

test("single in-flight request prevents concurrent probes/cost; caller mutation is isolated", async () => {
  let release;
  let query;
  const { provider } = setup({
    secretProvider: {
      get: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    },
    transport: async (url) => {
      query = url.searchParams.get("q");
      return response();
    },
  });
  const mutable = JSON.parse(JSON.stringify(request));
  const pending = provider.search(mutable);
  mutable.input.productName = "changed";
  assert.equal((await provider.search(request)).code, "RATE_LIMIT");
  release(apiKey);
  assert.equal((await pending).outcome, "CANDIDATES");
  assert.equal(query, "Fixture Brand Fixture shoes");
});

test("timeout covers secret, budget, fetch and body, including transports ignoring abort", async () => {
  const never = () =>
    new Promise(() => {
      /* Deliberately unresolved dependency. */
    });
  for (const overrides of [
    { secretProvider: { get: never } },
    { budget: { reserve: never } },
    { transport: never },
    {
      transport: async () =>
        new Response(
          new ReadableStream({
            start() {
              /* Deliberately stalled body. */
            },
          }),
          {
            headers: { "content-type": "application/json" },
          },
        ),
    },
  ]) {
    const { provider } = setup({ ...overrides, policy: { ...policy, timeoutMs: 25 } });
    assert.equal((await provider.search(request)).code, "TIMEOUT");
  }
});

test("late secret completion after timeout cannot initiate a paid call", async () => {
  let release;
  const { provider, calls } = setup({
    policy: { ...policy, timeoutMs: 25 },
    secretProvider: {
      get: () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    },
  });
  assert.equal((await provider.search(request)).code, "TIMEOUT");
  release(apiKey);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 0);
});

test("shared fixture budget atomically bounds multiple instances and resets on UTC day", async () => {
  const budget = createFixtureProviderBudget();
  const first = setup({ budget, policy: { ...policy, dailyBudgetMicrousd: 5000 } });
  const second = setup({ budget, policy: { ...policy, dailyBudgetMicrousd: 5000 } });
  const results = await Promise.all([
    first.provider.search(request),
    second.provider.search(request),
  ]);
  assert.deepEqual(results.map((r) => r.outcome).sort(), ["CANDIDATES", "ERROR"]);
  assert.equal(results.find((r) => r.outcome === "ERROR").code, "BUDGET_EXCEEDED");
  assert.equal(first.calls.length + second.calls.length, 1);
  second.advance(86_400_000);
  assert.equal((await second.provider.search(request)).outcome, "CANDIDATES");
});

test("failed paid requests retain conservative budget reservations", async () => {
  const { provider, advance } = setup({
    policy: { ...policy, dailyBudgetMicrousd: 5000 },
    transport: async () => {
      throw Error("network uncertain");
    },
  });
  assert.equal((await provider.search(request)).code, "EXTERNAL_SEARCH_FAILED");
  advance(1000);
  assert.equal((await provider.search(request)).code, "BUDGET_EXCEEDED");
});

test("result and candidate caps explicitly mark truncation", async () => {
  const many = { type: "search", web: { results: Array(21).fill(body().web.results[0]) } };
  const { provider } = setup({ transport: async () => response(many) });
  const result = await provider.search(request);
  assert.equal(result.candidates.length, 80);
  assert.equal(result.truncated, true);
  const denseRegistry = createIdentifierPatternRegistry({
    version: "dense-v1",
    patterns: Array.from({ length: 60 }, (_, i) => ({
      id: `FIXTURE_${i}`,
      brandKey: "fixture-brand",
      source: "TITLE",
      identifierType: "MODEL_NO",
      regex: "(?<identifier>FX-[0-9]{4})",
    })),
  });
  const dense = await setup({
    registry: denseRegistry,
    transport: async () => response(many),
  }).provider.search(request);
  assert.equal(dense.candidates.length, 200);
  assert.equal(dense.truncated, true);
});

test("common port contains arbitrary adapter exceptions and remains reusable", async () => {
  let fail = true;
  let current = 1000;
  const provider = createExternalCandidateProvider(
    {
      providerId: "fixture",
      async search() {
        if (fail) throw new Error("private provider diagnostics");
        return { candidates: [], truncated: false };
      },
    },
    policy,
    () => current,
  );
  assert.equal((await provider.search(request)).code, "EXTERNAL_SEARCH_FAILED");
  fail = false;
  current += 1000;
  assert.equal((await provider.search(request)).outcome, "NOT_FOUND");
});

test("invalid queries do not open the circuit, malformed budget approval never authorizes HTTP", async () => {
  const { provider, advance } = setup();
  const invalidRequest = { ...request, input: { ...request.input, productName: "x".repeat(601) } };
  for (let index = 0; index < 3; index++) {
    assert.equal((await provider.search(invalidRequest)).code, "INVALID_SOURCE_DATA");
    advance(1000);
  }
  assert.equal((await provider.search(request)).outcome, "CANDIDATES");
  const denied = setup({
    budget: {
      async reserve() {
        return "not-approved";
      },
    },
  });
  assert.equal((await denied.provider.search(request)).code, "BUDGET_EXCEEDED");
  assert.equal(denied.calls.length, 0);
});
