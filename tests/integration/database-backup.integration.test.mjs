import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { URL } from "node:url";

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("P6-06 production and staging isolate a hardened backup scheduler", async () => {
  for (const path of ["compose.production.yml", "compose.public-staging.yml"]) {
    const compose = await read(path);
    const backup = compose.match(/\n {2}backup:[\s\S]*?(?:\n {2}tunnel:|\nvolumes:)/)?.[0] ?? "";
    assert.match(backup, /target: backup/);
    assert.match(backup, /BACKUP_ENCRYPTION_KEY_FILE: \/run\/secrets\/backup_encryption_key/);
    assert.match(backup, /scripts\/check-database-backup-health\.mjs/);
    assert.match(backup, /read_only: true/);
    assert.match(backup, /cap_drop: \[ALL\]/);
    assert.match(backup, /no-new-privileges:true/);
    assert.match(backup, /- backend\n\s+- egress/);
    assert.doesNotMatch(backup, /profiles|proxy_token|caddy_auth|ports:/);
  }
});

test("P6-06 backup image contains PostgreSQL tools and runs as UID 1000", async () => {
  const dockerfile = await read("ops/Dockerfile");
  const backup =
    dockerfile.match(/FROM \$\{POSTGRES_IMAGE\} AS backup[\s\S]*?FROM caddy:/)?.[0] ?? "";
  assert.match(backup, /COPY --from=build \/usr\/local\/bin\/node/);
  assert.match(backup, /USER 1000:1000/);
  assert.match(backup, /run-database-backup-scheduler\.mjs/);
});

test("P6-03 backup alert receiver receives only the status volume and webhook file secret", async () => {
  for (const path of ["compose.production.yml", "compose.public-staging.yml"]) {
    const compose = await read(path);
    const alert =
      compose.match(/\n {2}backup-alert:[\s\S]*?(?:\n {2}tunnel:|\nvolumes:)/)?.[0] ?? "";
    assert.match(alert, /target: backup/);
    assert.match(alert, /run-backup-alert-dispatcher\.mjs/);
    assert.match(alert, /BACKUP_ALERT_WEBHOOK_URL_FILE: \/run\/secrets\/backup_alert_webhook_url/);
    assert.match(alert, /secrets: \[backup_alert_webhook_url\]/);
    assert.match(alert, /backup_status:\/var\/lib\/bros-backup:ro/);
    assert.match(alert, /backup_alert_state:\/var\/lib\/bros-backup-alert/);
    assert.match(alert, /- egress/);
    assert.doesNotMatch(alert, /database_url|r2_access_key|r2_secret_key|profiles|ports:/);
  }
});

test("P6-06 runtime keeps credentials out of pg_dump argv and enforces encrypted restore pairing", async () => {
  const runtime = await read("scripts/database-backup-runtime.mjs");
  const restore = await read("scripts/database-restore-drill.mjs");
  assert.match(runtime, /PGPASSFILE/);
  assert.match(runtime, /--no-password/);
  assert.doesNotMatch(runtime, /"--password"/);
  assert.match(runtime, /pg_try_advisory_lock/);
  assert.match(runtime, /manifestKeyForDataKey/);
  assert.match(restore, /RESTORE_CONFIRM_DISPOSABLE/);
  assert.match(restore, /startsWith\("bros_restore_"\)/);
  assert.match(restore, /--exit-on-error/);
});

test("P6-06 runbook fixes retention, RPO/RTO, stale detection, and live-validation boundary", async () => {
  const runbook = await read("docs/P6_06_DB_BACKUP.md");
  for (const contract of [
    "7 daily",
    "4 ISO-weekly",
    "3 monthly",
    "RPO 24h",
    "RTO 4h",
    "26시간",
    "실제 private R2",
  ])
    assert.ok(runbook.includes(contract));
});
