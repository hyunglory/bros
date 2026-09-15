import { Buffer } from "node:buffer";
import { spawn } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { lstat, mkdir, mkdtemp, readFile, rename, rm, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { TransformStream } from "node:stream/web";
import { URL } from "node:url";
import { TextEncoder } from "node:util";
import pg from "pg";
import {
  backupHealth,
  createEncryptedDatabaseBackup,
  decodeBackupEncryptionKey,
  isBackupDataKey,
  isBackupManifestKey,
  manifestKeyForDataKey,
} from "../packages/backup/dist/index.js";
import {
  createSecretProvider,
  readRuntimeSecret,
  readSecretFile,
} from "../packages/core/dist/index.js";
import {
  createLocalObjectStorage,
  createR2ObjectStorage,
  validateObjectKey,
} from "../packages/storage/dist/index.js";

export const backupStatusPath =
  process.env.BACKUP_STATUS_PATH ?? "/var/lib/bros-backup/status.json";

function stableError() {
  return new Error("Database backup operation failed");
}

export function databaseConnection(key = "DATABASE_URL") {
  const value = readRuntimeSecret(process.env, key);
  if (!value) throw stableError();
  try {
    const url = new URL(value);
    if (
      !["postgres:", "postgresql:"].includes(url.protocol) ||
      !url.hostname ||
      !url.username ||
      !url.password ||
      !url.pathname.slice(1) ||
      url.search ||
      url.hash
    )
      throw new Error();
    return url;
  } catch {
    throw stableError();
  }
}

function pgPassValue(value) {
  return value.replaceAll("\\", "\\\\").replaceAll(":", "\\:");
}

export async function createPgCredentialFile(url, root) {
  const path = join(root, ".pgpass");
  const line = [
    url.hostname,
    url.port || "5432",
    url.pathname.slice(1),
    decodeURIComponent(url.username),
    decodeURIComponent(url.password),
  ]
    .map(pgPassValue)
    .join(":");
  await writeFile(path, `${line}\n`, { flag: "wx", mode: 0o600 });
  return path;
}

export function pgEnvironment(pgPassFile) {
  const output = { PGPASSFILE: pgPassFile };
  for (const key of ["PATH", "LANG", "LC_ALL", "TZ", "HOME", "TMPDIR"])
    if (process.env[key]) output[key] = process.env[key];
  return output;
}

export async function createSecureTemporaryDirectory(prefix = "bros-database-backup-") {
  const parent = process.env.BACKUP_TEMP_ROOT ?? "/tmp";
  if (process.env.BACKUP_TEMP_ROOT) await mkdir(parent, { recursive: true, mode: 0o700 });
  const root = await mkdtemp(join(parent, prefix));
  const metadata = await lstat(root);
  const expectedUid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (
    !metadata.isDirectory() ||
    metadata.isSymbolicLink() ||
    (metadata.mode & 0o077) !== 0 ||
    (expectedUid !== undefined && metadata.uid !== expectedUid)
  ) {
    await rm(root, { force: true, recursive: true });
    throw stableError();
  }
  return root;
}

export function spawnPgDump(url, pgPassFile) {
  const child = spawn(
    "pg_dump",
    [
      "--format=custom",
      "--compress=zstd:6",
      "--no-owner",
      "--no-privileges",
      "--no-password",
      "--host",
      url.hostname,
      "--port",
      url.port || "5432",
      "--username",
      decodeURIComponent(url.username),
      "--dbname",
      url.pathname.slice(1),
    ],
    { env: pgEnvironment(pgPassFile), stdio: ["ignore", "pipe", "ignore"] },
  );
  const completion = new Promise((resolve, reject) => {
    child.once("error", () => reject(stableError()));
    child.once("close", (code) => (code === 0 ? resolve() : reject(stableError())));
  });
  return { child, completion, dumpStream: child.stdout };
}

export function backupStorage() {
  if (process.env.APP_ENV === "production") {
    const endpoint = process.env.STORAGE_R2_ENDPOINT;
    const bucket = process.env.STORAGE_R2_BUCKET;
    if (!endpoint || !bucket) throw stableError();
    return createR2ObjectStorage({ endpoint, bucket, secretProvider: createSecretProvider() });
  }
  const root = process.env.BACKUP_LOCAL_STORAGE_ROOT;
  if (!root) throw stableError();
  return createLocalObjectStorage({ root, bucket: "backup-test" });
}

export function backupEncryptionKey() {
  const path = process.env.BACKUP_ENCRYPTION_KEY_FILE;
  if (!path) throw stableError();
  try {
    return decodeBackupEncryptionKey(readSecretFile(path, process.env.APP_ENV === "production"));
  } catch {
    throw stableError();
  }
}

export async function writeBackupStatus(status) {
  const path = backupStatusPath;
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const directory = await lstat(dirname(path));
  const expectedUid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    (process.env.APP_ENV === "production" &&
      ((directory.mode & 0o077) !== 0 ||
        (expectedUid !== undefined && directory.uid !== expectedUid)))
  )
    throw stableError();
  const temporary = join(dirname(path), `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(status)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

export async function readBackupStatus() {
  try {
    const body = await readFile(backupStatusPath, "utf8");
    if (body.length > 16_384) return null;
    return JSON.parse(body);
  } catch {
    return null;
  }
}

export async function uploadLatestStatus(storage, status) {
  const body = new TextEncoder().encode(JSON.stringify(status));
  await storage.putObject({
    body,
    contentHash: createHash("sha256").update(body).digest("hex"),
    contentType: "application/json",
    key: "database-backup/status/latest.json",
  });
}

export async function runDatabaseBackup(now = new Date()) {
  process.umask(0o077);
  const previous = await readBackupStatus();
  await writeBackupStatus({
    attemptedAt: now.toISOString(),
    lastSuccessAt: typeof previous?.lastSuccessAt === "string" ? previous.lastSuccessAt : null,
    schemaVersion: 1,
    state: "RUNNING",
  });
  let client;
  let dump;
  let pgPass;
  let root;
  let temporaryPath;
  try {
    const connection = databaseConnection();
    client = new pg.Client({
      application_name: "bros-backup-lock",
      connectionString: connection.toString(),
    });
    await client.connect();
    const lock = await client.query(
      "SELECT pg_try_advisory_lock(1112686387, 1346456880) AS acquired",
    );
    if (lock.rows[0]?.acquired !== true) throw stableError();
    root = await createSecureTemporaryDirectory();
    pgPass = await createPgCredentialFile(connection, root);
    temporaryPath = join(root, "database.dump.enc");
    dump = spawnPgDump(connection, pgPass);
    const storage = backupStorage();
    const result = await createEncryptedDatabaseBackup({
      completion: dump.completion,
      createdAt: now,
      dumpStream: dump.dumpStream,
      encryptionKey: backupEncryptionKey(),
      storage,
      temporaryPath,
    });
    const status = {
      attemptedAt: now.toISOString(),
      backupObjectKey: result.manifest.object.key,
      lastSuccessAt: now.toISOString(),
      manifestKey: manifestKeyForDataKey(result.manifest.object.key),
      retentionDeleted: result.retention.deleted,
      schemaVersion: 1,
      state: "SUCCESS",
    };
    await uploadLatestStatus(storage, status);
    await writeBackupStatus(status);
    return result;
  } catch {
    dump?.child.kill("SIGTERM");
    const status = {
      attemptedAt: now.toISOString(),
      errorCode: "DATABASE_BACKUP_FAILED",
      lastSuccessAt: typeof previous?.lastSuccessAt === "string" ? previous.lastSuccessAt : null,
      schemaVersion: 1,
      state: "FAILURE",
    };
    await writeBackupStatus(status).catch(() => undefined);
    throw stableError();
  } finally {
    if (pgPass) await unlink(pgPass).catch(() => undefined);
    if (temporaryPath) await unlink(temporaryPath).catch(() => undefined);
    if (root) await rm(root, { force: true, recursive: true }).catch(() => undefined);
    if (client) await client.end().catch(() => undefined);
  }
}

export async function downloadEncryptedBackup(
  storage,
  objectKey,
  path,
  expectedSha256,
  expectedSize,
) {
  validateObjectKey(objectKey);
  if (!isBackupDataKey(objectKey)) throw stableError();
  const hash = createHash("sha256");
  let size = 0;
  const tracker = new TransformStream({
    transform(chunk, controller) {
      hash.update(chunk);
      size += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  await pipeline(
    Readable.fromWeb((await storage.getObject(objectKey)).pipeThrough(tracker)),
    createWriteStream(path, { flags: "wx", mode: 0o600 }),
  );
  if (hash.digest("hex") !== expectedSha256 || size !== expectedSize) throw stableError();
}

export async function loadManifest(storage, key) {
  validateObjectKey(key);
  if (!isBackupManifestKey(key)) throw stableError();
  const chunks = [];
  let size = 0;
  for await (const chunk of Readable.fromWeb(await storage.getObject(key))) {
    size += chunk.length;
    if (size > 65_536) throw stableError();
    chunks.push(chunk);
  }
  try {
    const manifest = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (
      manifest.schemaVersion !== 1 ||
      manifest.databaseFormat !== "postgresql-custom" ||
      manifest.encryption?.algorithm !== "AES-256-GCM" ||
      manifest.encryption?.formatVersion !== 1 ||
      !/^[0-9a-f]{16}$/.test(manifest.encryption?.keyId ?? "") ||
      !/^[0-9a-f]{64}$/.test(manifest.object?.sha256 ?? "") ||
      !Number.isSafeInteger(manifest.object?.size) ||
      manifest.object.size < 1 ||
      !/^[0-9a-f]{64}$/.test(manifest.plaintextSha256 ?? "") ||
      typeof manifest.object?.key !== "string" ||
      manifestKeyForDataKey(manifest.object.key) !== key ||
      typeof manifest.backupId !== "string" ||
      typeof manifest.createdAt !== "string"
    )
      throw new Error();
    return manifest;
  } catch {
    throw stableError();
  }
}

export function currentBackupHealth(status, now = new Date()) {
  return backupHealth(status, now);
}
