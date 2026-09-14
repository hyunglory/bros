import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const root = new URL("../../", import.meta.url);

test("P6-10 production compose keeps internal services private and Caddy owns 80/443", async () => {
  const compose = await readFile(new URL("compose.production.yml", root), "utf8");
  assert.match(compose, /network_mode: service:api/);
  assert.match(compose, /API_HOST: 127\.0\.0\.1\n\s+API_PORT: 3000/);
  assert.match(compose, /BROS_HTTP_PORT:-80}:80/);
  assert.match(compose, /BROS_HTTPS_PORT:-443}:443/);
  assert.match(compose, /backend:\n\s+internal: true/);
  assert.match(compose, /condition: service_completed_successfully/);

  const postgresBlock = compose.match(/\n {2}postgres:[\s\S]*?\n {2}migrate:/)?.[0] ?? "";
  const workerBlock = compose.match(/\n {2}worker:[\s\S]*?\nvolumes:/)?.[0] ?? "";
  assert.doesNotMatch(postgresBlock, /\n\s+ports:/);
  assert.doesNotMatch(workerBlock, /\n\s+ports:/);
});

test("P6-10 Caddy protects readiness and overwrites upstream identity", async () => {
  for (const name of ["ops/Caddyfile", "ops/Caddyfile.public-staging"]) {
    const caddyfile = await readFile(new URL(name, root), "utf8");
    assert.match(caddyfile, /basic_auth/);
    assert.match(caddyfile, /@api path \/api\/\* \/health \/ready/);
    assert.match(caddyfile, /header_up -Authorization/);
    assert.match(caddyfile, /header_up X-BROS-Actor "?\{http\.auth\.user\.id\}"?/);
    assert.match(caddyfile, /header_up X-BROS-Proxy-Token/);
  }
});

test("P6-10 public staging uses an outbound tunnel and publishes no host ports", async () => {
  const compose = await readFile(new URL("compose.public-staging.yml", root), "utf8");
  assert.match(compose, /cloudflare\/cloudflared:/);
  assert.match(compose, /--url", "http:\/\/api:8080/);
  assert.doesNotMatch(compose, /\n\s+ports:/);
  assert.match(compose, /backend:\n\s+internal: true/);
});
