import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { spawnSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import { setTimeout } from "node:timers/promises";

import { createEncryptedDatabaseBackup } from "../packages/backup/dist/index.js";
import { createR2ObjectStorage } from "../packages/storage/dist/index.js";

const required = [
  "P606_R2_ACCESS_KEY_ID",
  "P606_R2_SECRET_ACCESS_KEY",
  "STORAGE_R2_BUCKET",
  "STORAGE_R2_ENDPOINT",
];
for (const name of required) if (!process.env[name]?.trim()) throw new Error(`Missing ${name}`);

const runId = `bros-p606-r2-${randomUUID().slice(0, 8)}`;
const image = `${runId}-backup`;
const postgres = `${runId}-postgres`;
const network = `${runId}-network`;
const fixture = `${runId}-fixture`;
const label = `bros.p606.r2.run=${runId}`;
const databasePassword = randomUUID();
const encryptionKey = randomBytes(32).toString("hex");
const wrongEncryptionKey = randomBytes(32).toString("hex");
const sentinel = `P606-R2-${randomUUID()}`;
const r2AccessKeyId = process.env.P606_R2_ACCESS_KEY_ID;
const r2SecretAccessKey = process.env.P606_R2_SECRET_ACCESS_KEY;
const endpoint = process.env.STORAGE_R2_ENDPOINT;
const bucket = process.env.STORAGE_R2_BUCKET;
let networkCreated = false;
let postgresCreated = false;
let volumeCreated = false;
let stage = "preflight";
const createdKeys = new Set(["database-backup/status/latest.json"]);

function docker(args, options = {}) {
  const result = spawnSync("docker", args, {
    encoding: "utf8",
    input: options.input === undefined ? undefined : JSON.stringify(options.input),
    maxBuffer: 16 * 1024 * 1024,
    stdio: ["pipe", "pipe", "pipe"],
    timeout: options.timeout ?? 180_000,
  });
  if (!options.allowFailure && (result.status !== 0 || result.error))
    throw new Error(`Docker operation failed at ${stage}`, { cause: result });
  return result;
}

function fixtureRun(mode, input, extra = []) {
  return docker(
    [
      "run",
      "--rm",
      "-i",
      "--label",
      label,
      "--user",
      "0",
      "--mount",
      `type=volume,src=${fixture},dst=/fixture`,
      ...extra,
      image,
      "node",
      "tests/ops/database-backup-fixture.mjs",
      mode,
    ],
    { input },
  );
}

const secretMount = [
  "--mount",
  `type=volume,src=${fixture},dst=/run/secrets,volume-subpath=backup,readonly`,
];
const statusMount = ["--mount", `type=volume,src=${fixture},dst=/status,volume-subpath=status`];
const hardened = [
  "--read-only",
  "--cap-drop=ALL",
  "--security-opt=no-new-privileges",
  "--tmpfs",
  "/tmp:rw,noexec,nosuid,size=1g,mode=1777",
];
const environment = (values) =>
  Object.entries(values).flatMap(([key, value]) => ["--env", `${key}=${value}`]);
const runtime = {
  APP_ENV: "production",
  BACKUP_ENCRYPTION_KEY_FILE: "/run/secrets/backup_encryption_key",
  BACKUP_STATUS_PATH: "/status/status.json",
  BROS_SECRET_STORAGE_R2_ACCESS_KEY_ID_FILE: "/run/secrets/r2_access_key",
  BROS_SECRET_STORAGE_R2_SECRET_ACCESS_KEY_FILE: "/run/secrets/r2_secret_key",
  DATABASE_URL_FILE: "/run/secrets/database_url",
  STORAGE_R2_BUCKET: bucket,
  STORAGE_R2_ENDPOINT: endpoint,
};
const oneShot = (command, env = runtime, options = {}) =>
  docker(
    [
      "run",
      "--rm",
      "-i",
      "--label",
      label,
      ...hardened,
      "--network",
      network,
      ...secretMount,
      ...statusMount,
      ...environment(env),
      image,
      "node",
      command,
    ],
    options,
  );

function storage(secretAccessKey = r2SecretAccessKey) {
  return createR2ObjectStorage({
    bucket,
    endpoint,
    maxAttempts: 1,
    secretProvider: {
      async get(key) {
        return key === "storage.r2.accessKeyId" ? r2AccessKeyId : secretAccessKey;
      },
    },
  });
}

async function readBytes(objectStorage, key) {
  const chunks = [];
  for await (const chunk of Readable.fromWeb(await objectStorage.getObject(key))) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function putRetentionPairs(objectStorage) {
  const root = await mkdtemp(join(tmpdir(), "bros-p606-r2-"));
  try {
    const pairs = [];
    for (let day = 1; day <= 15; day += 1) {
      const result = await createEncryptedDatabaseBackup({
        completion: Promise.resolve(),
        createdAt: new Date(`2025-01-${String(day).padStart(2, "0")}T00:00:00.000Z`),
        dumpStream: Readable.from(Buffer.from(`P606-R2-retention-fixture-${day}`)),
        encryptionKey: Buffer.from(encryptionKey, "hex"),
        storage: objectStorage,
        temporaryPath: join(root, `retention-${day}.dump.enc`),
      });
      const manifestKey = result.manifest.object.key.replace(/\.dump\.enc$/, ".manifest.json");
      createdKeys.add(result.manifest.object.key);
      createdKeys.add(manifestKey);
      pairs.push({ dataKey: result.manifest.object.key, manifestKey });
    }
    return pairs;
  } finally {
    await rm(root, { force: true, recursive: true });
  }
}

try {
  const objectStorage = storage();
  const existing = await objectStorage.listObjects("database-backup");
  assert.equal(existing.length, 0, "R2 database-backup prefix must be empty before live validation");

  stage = "r2-write-probe";
  const probeKey = `database-backup/live-probe-${randomUUID()}`;
  createdKeys.add(probeKey);
  const probe = Buffer.from("bros-p606-r2-private-write-probe");
  await objectStorage.putObject({
    body: probe,
    contentHash: createHash("sha256").update(probe).digest("hex"),
    contentType: "application/octet-stream",
    key: probeKey,
  });
  assert.deepEqual(await readBytes(objectStorage, probeKey), probe);
  await objectStorage.deleteObject(probeKey);
  createdKeys.delete(probeKey);

  stage = "build";
  docker(["build", "--target", "backup", "--tag", image, "--file", "ops/Dockerfile", "."], {
    timeout: 600_000,
  });
  stage = "fixture";
  docker(["volume", "create", fixture]);
  volumeCreated = true;
  fixtureRun("prepare", {
    databasePassword,
    encryptionKey,
    r2AccessKeyId,
    r2SecretAccessKey,
    wrongEncryptionKey,
  });
  docker(["network", "create", network]);
  networkCreated = true;
  stage = "postgres";
  docker([
    "run",
    "-d",
    "--name",
    postgres,
    "--label",
    label,
    "--network",
    network,
    "--network-alias",
    "postgres",
    "--mount",
    `type=volume,src=${fixture},dst=/run/secrets,volume-subpath=postgres,readonly`,
    ...environment({
      POSTGRES_DB: "bros",
      POSTGRES_PASSWORD_FILE: "/run/secrets/postgres_password",
      POSTGRES_USER: "bros",
    }),
    "postgres:18.6-bookworm@sha256:1c59e2c3c818eaa0f0628f695b36e7c9e362d6b219b36a54a32df645cbd7e1af",
  ]);
  postgresCreated = true;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const ready = docker(["exec", postgres, "pg_isready", "-U", "bros", "-d", "bros"], {
      allowFailure: true,
    });
    if (ready.status === 0) break;
    if (attempt === 39) throw new Error("PostgreSQL readiness failed");
    await setTimeout(500);
  }

  stage = "migration";
  oneShot("scripts/migrate.mjs", { APP_ENV: "production", DATABASE_URL_FILE: runtime.DATABASE_URL_FILE });
  fixtureRun("seed", { sentinel }, ["--network", network, ...secretMount]);

  stage = "expired-r2-pair";
  const retentionPairs = await putRetentionPairs(objectStorage);
  stage = "backup-r2";
  const backup = oneShot("scripts/database-backup-once.mjs");
  assert.equal(backup.status, 0);
  const status = JSON.parse(fixtureRun("read-status", {}, statusMount).stdout.trim());
  createdKeys.add(status.backupObjectKey);
  createdKeys.add(status.manifestKey);

  stage = "r2-encryption-and-retention";
  const manifest = JSON.parse((await readBytes(objectStorage, status.manifestKey)).toString("utf8"));
  const encrypted = await readBytes(objectStorage, status.backupObjectKey);
  assert.equal(encrypted.subarray(0, 8).toString("ascii"), "BROSDB01");
  assert.equal(createHash("sha256").update(encrypted).digest("hex"), manifest.object.sha256);
  for (const value of [databasePassword, encryptionKey, sentinel])
    assert.equal(encrypted.includes(Buffer.from(value)), false, "Encrypted object contains protected input");
  const after = await objectStorage.listObjects("database-backup");
  const afterKeys = new Set(after.map((item) => item.objectKey));
  assert.ok(
    retentionPairs.some((pair) => !afterKeys.has(pair.dataKey) && !afterKeys.has(pair.manifestKey)),
    "Retention did not delete any complete fixture pair",
  );
  assert.equal(afterKeys.has(status.backupObjectKey), true, "Current data object is missing");
  assert.equal(afterKeys.has(status.manifestKey), true, "Current manifest object is missing");

  stage = "restore";
  const restoreDatabase = `bros_restore_${runId.replaceAll("-", "_")}`;
  fixtureRun("create-restore", { database: restoreDatabase, output: "restore_database_url" }, [
    "--network",
    network,
    "--mount",
    `type=volume,src=${fixture},dst=/run/secrets,volume-subpath=backup`,
  ]);
  const started = Date.now();
  const restore = oneShot("scripts/database-restore-drill.mjs", {
    ...runtime,
    BACKUP_MANIFEST_KEY: status.manifestKey,
    RESTORE_CONFIRM_DISPOSABLE: "YES",
    RESTORE_DATABASE_URL_FILE: "/run/secrets/restore_database_url",
  });
  assert.equal(restore.status, 0);
  const rtoMs = Date.now() - started;
  assert.ok(rtoMs < 4 * 60 * 60 * 1_000);
  fixtureRun("verify-restore", { input: "restore_database_url", sentinel }, [
    "--network",
    network,
    ...secretMount,
  ]);

  stage = "wrong-r2-credential";
  await assert.rejects(storage(`${r2SecretAccessKey}-invalid`).getObject(status.manifestKey), {
    code: "STORAGE_AUTH_FAILED",
  });
  console.log(`P606_R2_ENCRYPT_RESTORE_PASS rto_ms=${rtoMs}`);
  console.log("P606_R2_RETENTION_PAIR_DELETE_PASS");
  console.log("P606_R2_WRONG_CREDENTIAL_PASS");
} catch (error) {
  console.error(`P606_R2_VERIFY_FAILED stage=${stage}; credential-bearing output withheld`);
  const diagnostics = [error.message, error.cause?.stdout, error.cause?.stderr]
    .filter(Boolean)
    .join("\n");
  const redacted = [databasePassword, encryptionKey, wrongEncryptionKey, sentinel, r2AccessKeyId, r2SecretAccessKey].reduce(
    (value, secret) => value.replaceAll(secret, "[REDACTED]"),
    diagnostics,
  );
  console.error(redacted.slice(-4096));
  process.exitCode = 1;
} finally {
  try {
    const objectStorage = storage();
    await Promise.allSettled([...createdKeys].map((key) => objectStorage.deleteObject(key)));
  } catch {
    console.error("P606_R2_OBJECT_CLEANUP_FAILED");
    process.exitCode = 1;
  }
  if (postgresCreated) docker(["rm", "-f", "-v", postgres], { allowFailure: true });
  if (networkCreated) docker(["network", "rm", network], { allowFailure: true });
  if (volumeCreated) docker(["volume", "rm", fixture], { allowFailure: true });
  docker(["image", "rm", image], { allowFailure: true });
  console.log("P606_R2_CLEANUP_FINISHED");
}
