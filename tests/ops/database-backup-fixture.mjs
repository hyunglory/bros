import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { chown, chmod, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { URL } from "node:url";
import pg from "pg";

let input = "";
for await (const chunk of process.stdin) input += chunk.toString();
const request = input ? JSON.parse(input) : {};
const mode = process.argv[2];

async function privateFile(path, value, uid) {
  await writeFile(path, value, { flag: "wx", mode: 0o400 });
  await chown(path, uid, uid);
  await chmod(path, 0o400);
}

async function connect(path = "/run/secrets/database_url") {
  const client = new pg.Client({ connectionString: await readFile(path, "utf8") });
  await client.connect();
  return client;
}

async function files(root) {
  const output = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) output.push(...(await files(path)));
    else output.push(path);
  }
  return output;
}

if (mode === "prepare") {
  for (const [name, uid] of [
    ["postgres", 999],
    ["backup", 1000],
    ["objects", 1000],
    ["status", 1000],
    ["alert-state", 1000],
  ]) {
    await mkdir(`/fixture/${name}`, { mode: 0o700 });
    await chown(`/fixture/${name}`, uid, uid);
  }
  const url = new URL("postgresql://postgres:5432/bros");
  url.username = "bros";
  url.password = request.databasePassword;
  await privateFile("/fixture/postgres/postgres_password", request.databasePassword, 999);
  await privateFile("/fixture/backup/database_url", url.toString(), 1000);
  await privateFile("/fixture/backup/backup_encryption_key", request.encryptionKey, 1000);
  if (typeof request.r2AccessKeyId === "string" && typeof request.r2SecretAccessKey === "string") {
    await privateFile("/fixture/backup/r2_access_key", request.r2AccessKeyId, 1000);
    await privateFile("/fixture/backup/r2_secret_key", request.r2SecretAccessKey, 1000);
  }
  await privateFile(
    "/fixture/backup/backup_alert_webhook_url",
    "http://alert-receiver:8787/alerts",
    1000,
  );
  await privateFile(
    "/fixture/backup/wrong_backup_encryption_key",
    request.wrongEncryptionKey,
    1000,
  );
  const wrong = new URL(url);
  wrong.password = "wrong-disposable-password";
  await privateFile("/fixture/backup/wrong_database_url", wrong.toString(), 1000);
} else if (mode === "seed") {
  const client = await connect();
  try {
    await client.query("CREATE TABLE p606_probe (id integer PRIMARY KEY, value text NOT NULL)");
    await client.query("INSERT INTO p606_probe (id, value) VALUES (1, $1), (2, $2)", [
      request.sentinel,
      createHash("sha256").update(request.sentinel).digest("hex"),
    ]);
  } finally {
    await client.end();
  }
} else if (mode === "create-restore") {
  assert.match(request.database, /^bros_restore_[a-z0-9_]+$/);
  const client = await connect();
  try {
    await client.query(`CREATE DATABASE ${pg.escapeIdentifier(request.database)}`);
  } finally {
    await client.end();
  }
  const url = new URL(await readFile("/run/secrets/database_url", "utf8"));
  url.pathname = `/${request.database}`;
  await privateFile(`/run/secrets/${request.output}`, url.toString(), 1000);
} else if (mode === "verify-restore") {
  const client = await connect(`/run/secrets/${request.input}`);
  try {
    const result = await client.query("SELECT id, value FROM p606_probe ORDER BY id");
    assert.deepEqual(result.rows, [
      { id: 1, value: request.sentinel },
      { id: 2, value: createHash("sha256").update(request.sentinel).digest("hex") },
    ]);
  } finally {
    await client.end();
  }
} else if (mode === "inspect") {
  const status = JSON.parse(await readFile("/status/status.json", "utf8"));
  assert.equal(status.state, "SUCCESS");
  const paths = await files("/objects/database-backup");
  const encryptedPath = paths.find((path) => path.endsWith(".dump.enc"));
  const manifestPath = paths.find((path) => path.endsWith(".manifest.json"));
  assert.ok(encryptedPath);
  assert.ok(manifestPath);
  const encrypted = await readFile(encryptedPath);
  assert.equal(encrypted.subarray(0, 8).toString("ascii"), "BROSDB01");
  for (const value of request.sensitive)
    assert.equal(encrypted.includes(Buffer.from(value)), false);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  assert.equal(manifest.object.key, status.backupObjectKey);
  assert.equal(status.manifestKey.endsWith(".manifest.json"), true);
  process.stdout.write(`${JSON.stringify({ manifestKey: status.manifestKey })}\n`);
} else if (mode === "read-status") {
  const status = JSON.parse(await readFile("/status/status.json", "utf8"));
  assert.equal(status.state, "SUCCESS");
  assert.equal(typeof status.backupObjectKey, "string");
  assert.equal(typeof status.manifestKey, "string");
  process.stdout.write(
    `${JSON.stringify({ backupObjectKey: status.backupObjectKey, manifestKey: status.manifestKey })}\n`,
  );
} else if (mode === "stale-status") {
  await writeFile(
    "/status/status.json",
    `${JSON.stringify({
      attemptedAt: request.at,
      lastSuccessAt: request.at,
      schemaVersion: 1,
      state: "SUCCESS",
    })}\n`,
    { mode: 0o600 },
  );
} else if (mode === "set-status") {
  await writeFile("/status/status.json", `${JSON.stringify(request.status)}\n`, { mode: 0o600 });
} else {
  throw new Error("Unknown fixture mode");
}
