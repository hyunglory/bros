import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("P6-02 production and staging declare only secret paths and per-service mounts", async () => {
  for (const path of ["compose.production.yml", "compose.public-staging.yml"]) {
    const compose = await read(path);
    assert.doesNotMatch(
      compose,
      /^\s+(?:DATABASE_URL|POSTGRES_PASSWORD|API_PROXY_AUTH_TOKEN|BROS_PROXY_AUTH_TOKEN|BROS_ADMIN_PASSWORD_HASH|BROS_SECRET_STORAGE_R2_ACCESS_KEY_ID|BROS_SECRET_STORAGE_R2_SECRET_ACCESS_KEY):/m,
    );
    assert.match(compose, /POSTGRES_PASSWORD_FILE: \/run\/secrets\/postgres_password/);
    assert.match(compose, /secrets: \[database_url, proxy_token, r2_access_key, r2_secret_key\]/);
    assert.match(compose, /secrets: \[database_url, r2_access_key, r2_secret_key\]/);
    assert.match(compose, /secrets: \[caddy_auth, caddy_proxy\]/);
    const migrate = compose.match(/\n {2}migrate:[\s\S]*?\n {2}api:/)?.[0];
    assert.ok(migrate);
    assert.doesNotMatch(migrate, /r2_access_key|proxy_token|runtime-environment/);
    assert.match(compose, /no-new-privileges:true/);
    assert.match(compose, /read_only: true/);
  }
});

test("P6-02 Caddy disables admin API and config persistence, and rejects unsafe secret permissions", async () => {
  for (const path of ["ops/Caddyfile", "ops/Caddyfile.public-staging"]) {
    const caddy = await read(path);
    assert.match(caddy, /admin off/);
    assert.match(caddy, /persist_config off/);
    assert.doesNotMatch(caddy, /BROS_PROXY_AUTH_TOKEN|BROS_ADMIN_PASSWORD_HASH/);
  }
  const entrypoint = await read("ops/edge-entrypoint.sh");
  assert.match(entrypoint, /400\|600/);
  assert.match(entrypoint, /stat -c %u/);
  assert.match(entrypoint, /! -L/);
});

test("P6-02 packaging and backup exclusion contracts cover secret and session stores", async () => {
  for (const path of [".dockerignore", ".gitignore", "ops/backup-excludes.txt"]) {
    const policy = await read(path);
    for (const name of [
      ".env",
      ".secrets",
      "profiles",
      "browser-profiles",
      "auth-state",
      "storage-state",
      "*.pem",
      "*.key",
    ])
      assert.ok(policy.includes(name));
  }
});
