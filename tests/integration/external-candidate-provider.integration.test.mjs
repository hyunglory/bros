import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { URL } from "node:url";
import {
  createBraveSearchProvider,
  createIdentifierPatternRegistry,
} from "../../packages/resolver/dist/index.js";

test("SearchEvidence isolates real HTTP failures and can recover in the same process", async (t) => {
  let behavior = "success";
  let requests = 0;
  let lastQuery;
  const server = createServer((req, res) => {
    requests++;
    lastQuery = new URL(req.url, "http://fixture.test").searchParams.get("q");
    assert.equal(req.headers["x-subscription-token"], "synthetic-http-fixture-key");
    if (behavior === "timeout") return;
    if (behavior === "429") {
      res.writeHead(429, { "Retry-After": "2" });
      res.end("private diagnostics must not escape");
      return;
    }
    if (behavior === "redirect") {
      res.writeHead(302, { Location: "/must-not-follow" });
      res.end();
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    if (behavior === "body-timeout") {
      res.flushHeaders();
      res.write('{"type":');
      return;
    }
    if (behavior === "malformed") {
      res.end("invalid JSON private diagnostics");
      return;
    }
    res.end(
      JSON.stringify({
        type: "search",
        web: { results: [{ title: "Fixture FX-1234", url: "https://product.test/FX-1234" }] },
      }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const registry = createIdentifierPatternRegistry({
    version: "http-fixture-v1",
    patterns: [
      {
        id: "TITLE_FIXTURE",
        source: "TITLE",
        brandKey: "fixture-brand",
        identifierType: "MODEL_NO",
        regex: "(?<identifier>FX-[0-9]{4})",
      },
    ],
  });
  let now = Date.parse("2026-09-15T00:00:00Z");
  const provider = createBraveSearchProvider({
    registry,
    mode: "fixture",
    now: () => now,
    secretProvider: {
      async get() {
        return "synthetic-http-fixture-key";
      },
    },
    policy: {
      timeoutMs: 250,
      minIntervalMs: 1000,
      failureThreshold: 2,
      circuitOpenMs: 5000,
      rateLimitCooldownMs: 1000,
      requestCostMicrousd: 1,
      maxRequestCostMicrousd: 1,
      dailyBudgetMicrousd: 100,
    },
    transport: (url, init) => fetch(`${base}${url.pathname}${url.search}`, init),
  });
  const request = {
    brandKey: "fixture-brand",
    input: {
      schemaVersion: 1,
      sourceProductPublicId: "01890f47-0c4d-7abc-8def-1234567890ab",
      productPublicId: null,
      platformCode: "FIXTURE",
      externalProductId: "private-id",
      productName: "Fixture shoes",
      brandName: "Fixture Brand",
      productUrl: null,
      collectedAt: "2026-09-15T00:00:00Z",
      raw: { privateData: "never outbound" },
      import: null,
    },
  };

  await t.test("successful response passes through native fetch and registry", async () => {
    assert.equal((await provider.search(request)).outcome, "CANDIDATES");
    assert.equal(lastQuery, "Fixture Brand Fixture shoes");
  });
  await t.test(
    "headers and partial body both respect deadline; circuit suppresses HTTP",
    async () => {
      for (const mode of ["timeout", "body-timeout"]) {
        behavior = mode;
        now += 1000;
        assert.equal((await provider.search(request)).code, "TIMEOUT");
      }
      const before = requests;
      assert.equal((await provider.search(request)).code, "CIRCUIT_OPEN");
      assert.equal(requests, before);
    },
  );
  await t.test("healthy probe recovers without process restart", async () => {
    now += 5000;
    behavior = "success";
    assert.equal((await provider.search(request)).outcome, "CANDIDATES");
  });
  await t.test("429 cooldown suppresses repeated native fetch", async () => {
    now += 1000;
    behavior = "429";
    assert.equal((await provider.search(request)).code, "RATE_LIMIT");
    const before = requests;
    now += 1999;
    assert.equal((await provider.search(request)).code, "RATE_LIMIT");
    assert.equal(requests, before);
    now += 1;
    behavior = "success";
    assert.equal((await provider.search(request)).outcome, "CANDIDATES");
  });
  await t.test("malformed JSON is fixed error, redirect is never followed", async () => {
    now += 1000;
    behavior = "malformed";
    const malformed = await provider.search(request);
    assert.equal(malformed.code, "INVALID_SOURCE_DATA");
    assert.doesNotMatch(JSON.stringify(malformed), /private diagnostics/);
    now += 1000;
    behavior = "redirect";
    const before = requests;
    assert.equal((await provider.search(request)).code, "EXTERNAL_SEARCH_FAILED");
    assert.equal(requests, before + 1);
  });
});
