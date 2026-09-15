import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { unlink } from "node:fs/promises";
import { Readable } from "node:stream";
import type { ObjectStorage } from "@bros/storage";
import { backupPrefix, manifestKeyForDataKey, staleBackupKeys } from "./policy.js";
import { encryptBackupStream } from "./crypto.js";

export interface DatabaseBackupManifest {
  backupId: string;
  createdAt: string;
  databaseFormat: "postgresql-custom";
  encryption: { algorithm: "AES-256-GCM"; formatVersion: 1; keyId: string };
  object: { key: string; sha256: string; size: number };
  plaintextSha256: string;
  schemaVersion: 1;
}

function backupStem(createdAt: Date, backupId: string): string {
  const date = createdAt.toISOString();
  const day = date.slice(0, 10).replaceAll("-", "/");
  const compact = `${date.slice(0, 10).replaceAll("-", "")}T${date.slice(11, 19).replaceAll(":", "")}Z`;
  return `${backupPrefix}/${day}/${compact}-${backupId}`;
}

async function hashObject(storage: ObjectStorage, key: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of Readable.fromWeb(await storage.getObject(key))) hash.update(chunk);
  return hash.digest("hex");
}

export async function enforceBackupRetention(storage: ObjectStorage, now = new Date()) {
  const objects = await storage.listObjects(backupPrefix);
  const stale = staleBackupKeys(objects, now);
  for (const key of stale) await storage.deleteObject(key);
  return { deleted: stale.length, scanned: objects.length };
}

export async function createEncryptedDatabaseBackup(options: {
  completion: Promise<void>;
  createdAt?: Date;
  dumpStream: NodeJS.ReadableStream;
  encryptionKey: Uint8Array;
  storage: ObjectStorage;
  temporaryPath: string;
}): Promise<{ manifest: DatabaseBackupManifest; retention: { deleted: number; scanned: number } }> {
  void options.completion.catch(() => undefined);
  const createdAt = options.createdAt ?? new Date();
  const backupId = randomUUID();
  const stem = backupStem(createdAt, backupId);
  const dataKey = `${stem}.dump.enc`;
  const manifestKey = `${stem}.manifest.json`;
  try {
    const encrypted = await encryptBackupStream({
      backupId,
      createdAt,
      input: options.dumpStream,
      key: options.encryptionKey,
      outputPath: options.temporaryPath,
    });
    await options.completion;
    await options.storage.putObject({
      body: Readable.toWeb(createReadStream(options.temporaryPath)),
      contentLength: encrypted.size,
      contentHash: encrypted.objectSha256,
      contentType: "application/octet-stream",
      key: dataKey,
    });
    if ((await hashObject(options.storage, dataKey)) !== encrypted.objectSha256)
      throw new Error("Backup upload integrity failed");
    const manifest: DatabaseBackupManifest = {
      backupId,
      createdAt: createdAt.toISOString(),
      databaseFormat: "postgresql-custom",
      encryption: {
        algorithm: "AES-256-GCM",
        formatVersion: 1,
        keyId: encrypted.header.keyId,
      },
      object: { key: dataKey, sha256: encrypted.objectSha256, size: encrypted.size },
      plaintextSha256: encrypted.plaintextSha256,
      schemaVersion: 1,
    };
    const body = new TextEncoder().encode(JSON.stringify(manifest));
    await options.storage.putObject({
      body,
      contentHash: createHash("sha256").update(body).digest("hex"),
      contentType: "application/json",
      key: manifestKey,
    });
    if (manifestKeyForDataKey(manifest.object.key) !== manifestKey)
      throw new Error("Backup manifest pairing failed");
    return { manifest, retention: await enforceBackupRetention(options.storage, createdAt) };
  } finally {
    await unlink(options.temporaryPath).catch(() => undefined);
  }
}
