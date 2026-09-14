import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

import { createApiApp } from "../../apps/api/dist/index.js";
import { createRedactedLogger, loadConfig } from "../../packages/core/dist/index.js";

const proxyToken = "01234567890123456789012345678901";
const publicOrigin = "https://admin.example.test";

function createRuntime(previewCalls) {
  const runtime = createApiApp(
    loadConfig({
      API_PROXY_AUTH_TOKEN: proxyToken,
      API_PUBLIC_ORIGIN: publicOrigin,
      DATABASE_URL: "postgresql://unused@127.0.0.1:1/unused",
    }),
    createRedactedLogger({ write: () => undefined }),
    {
      artifactPreview: {
        async getAuthorizedPreviewUrl({ actor, objectKey }) {
          previewCalls.push({ actor, objectKey });
          return "signed:private";
        },
      },
    },
  );
  runtime.app.post("/api/v1/security-probe", async (request) => ({ actor: request.auditActor }));
  return runtime;
}

test("proxy-authenticated business and artifact routes reject spoofing and cross-origin mutation", async (t) => {
  const previewCalls = [];
  const runtime = createRuntime(previewCalls);
  t.after(() => runtime.close());

  const health = await runtime.app.inject("/health");
  assert.equal(health.statusCode, 200);

  for (const headers of [
    {},
    { "x-bros-actor": "forged-admin" },
    { "x-bros-actor": "forged-admin", "x-bros-proxy-token": "wrong" },
    { "x-bros-actor": "invalid actor", "x-bros-proxy-token": proxyToken },
  ]) {
    const response = await runtime.app.inject({
      url: "/api/v1/artifacts/preview?objectKey=automation/2026/09/14/x/failure.png",
      headers,
    });
    assert.equal(response.statusCode, 401);
  }
  assert.deepEqual(previewCalls, []);

  const authenticatedHeaders = {
    "x-bros-actor": "admin.operator",
    "x-bros-proxy-token": proxyToken,
  };
  const preview = await runtime.app.inject({
    url: "/api/v1/artifacts/preview?objectKey=automation/2026/09/14/x/failure.png",
    headers: authenticatedHeaders,
  });
  assert.equal(preview.statusCode, 200);
  assert.deepEqual(preview.json(), { url: "signed:private" });
  assert.deepEqual(previewCalls, [
    { actor: "admin.operator", objectKey: "automation/2026/09/14/x/failure.png" },
  ]);

  const mutation = {
    method: "POST",
    url: "/api/v1/security-probe",
    payload: {},
    headers: { ...authenticatedHeaders, "content-type": "application/json" },
  };
  const crossOrigin = await runtime.app.inject({
    ...mutation,
    headers: { ...mutation.headers, origin: "https://attacker.example.test" },
  });
  assert.equal(crossOrigin.statusCode, 403);

  const missingOrigin = await runtime.app.inject(mutation);
  assert.equal(missingOrigin.statusCode, 403);

  const accepted = await runtime.app.inject({
    ...mutation,
    headers: { ...mutation.headers, origin: publicOrigin },
  });
  assert.equal(accepted.statusCode, 200);
  assert.deepEqual(accepted.json(), { actor: "admin.operator" });
});

test("Caddy protects all browser-visible routes and replaces caller actor headers", async () => {
  const caddyfile = await readFile(new URL("../../ops/Caddyfile", import.meta.url), "utf8");
  assert.match(caddyfile, /basic_auth/);
  assert.match(caddyfile, /header_up -Authorization/);
  assert.match(caddyfile, /header_up X-BROS-Actor "\{http\.auth\.user\.id\}"/);
  assert.match(caddyfile, /header_up X-BROS-Proxy-Token/);
  assert.doesNotMatch(caddyfile, /header_up -X-BROS-Actor/);
  assert.doesNotMatch(caddyfile, /header_up -X-BROS-Proxy-Token/);
  assert.match(caddyfile, /reverse_proxy 127\.0\.0\.1:/);
});
