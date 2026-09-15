import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable } from "node:stream";
import test from "node:test";
import { createLocalObjectStorage } from "../../storage/dist/index.js";
import {
  backupHealth,
  backupDue,
  createDecryptedBackupStream,
  createEncryptedDatabaseBackup,
  decodeBackupEncryptionKey,
  encryptBackupStream,
  listBackupGenerations,
  maximumBackupAgeMs,
  nextBackupTime,
  nextRequiredBackupTime,
  retainedBackupKeys,
  staleBackupKeys,
} from "../dist/index.js";

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), "bros-backup-test-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  return root;
}

async function consume(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function listedPair(createdAt, id = "00000000-0000-4000-8000-000000000000") {
  const date = createdAt.toISOString();
  const day = date.slice(0, 10).replaceAll("-", "/");
  const stamp = `${date.slice(0, 10).replaceAll("-", "")}T${date.slice(11, 19).replaceAll(":", "")}Z`;
  const stem = `database-backup/${day}/${stamp}-${id}`;
  return [
    { lastModified: createdAt, objectKey: `${stem}.dump.enc`, size: 100 },
    { lastModified: createdAt, objectKey: `${stem}.manifest.json`, size: 100 },
  ];
}

test("encrypts database bytes with authenticated metadata and rejects a wrong key", async (context) => {
  const root = await fixture(context);
  const path = join(root, "database.dump.enc");
  const key = randomBytes(32);
  const plaintext = randomBytes(128 * 1024);
  const encrypted = await encryptBackupStream({
    backupId: "7aa54663-2de7-4bfb-a2d5-ecc8a7fd4d25",
    createdAt: new Date("2026-09-15T03:41:00.000Z"),
    input: Readable.from([plaintext]),
    key,
    outputPath: path,
  });

  const bytes = await readFile(path);
  assert.equal(bytes.includes(plaintext.subarray(0, 64)), false);
  assert.equal(encrypted.size, bytes.length);
  const decrypted = await createDecryptedBackupStream(path, key);
  assert.deepEqual(await consume(decrypted.stream), plaintext);
  assert.equal(decrypted.plaintextSha256(), encrypted.plaintextSha256);
  await assert.rejects(createDecryptedBackupStream(path, randomBytes(32)), {
    message: "Backup decryption failed",
  });
  bytes[bytes.length - 17] ^= 1;
  await writeFile(path, bytes);
  const tampered = await createDecryptedBackupStream(path, key);
  await assert.rejects(consume(tampered.stream), { message: "Backup decryption failed" });
});

test("creates an encrypted object-manifest pair and verifies uploaded object integrity", async (context) => {
  const root = await fixture(context);
  const storageRoot = join(root, "objects");
  const storage = createLocalObjectStorage({ bucket: "backup-test", root: storageRoot });
  const plaintext = Buffer.from("sensitive-database-row");
  const result = await createEncryptedDatabaseBackup({
    completion: Promise.resolve(),
    createdAt: new Date("2026-09-15T03:41:00.000Z"),
    dumpStream: Readable.from([plaintext]),
    encryptionKey: randomBytes(32),
    storage,
    temporaryPath: join(root, "temporary.enc"),
  });

  const objects = await storage.listObjects("database-backup");
  assert.equal(objects.length, 2);
  assert.equal(result.manifest.object.key.endsWith(".dump.enc"), true);
  assert.equal(
    objects.some((object) => object.objectKey.endsWith(".manifest.json")),
    true,
  );
  assert.equal(
    (await consume(await storage.getObject(result.manifest.object.key))).includes(plaintext),
    false,
  );
});

test("applies 7 daily, 4 weekly, and 3 monthly retention without deleting recent partials", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");
  const objects = [];
  for (let days = 0; days < 100; days += 1) {
    objects.push(...listedPair(new Date(now.getTime() - days * 86_400_000)));
  }
  const generations = listBackupGenerations(objects);
  const keep = retainedBackupKeys(generations);
  assert.equal(keep.has(generations[0].dataKey), true);
  assert.equal(keep.size <= 28, true);
  assert.equal(keep.size >= 14, true);

  const oldPartial = listedPair(new Date(now.getTime() - maximumBackupAgeMs - 1_000))[0];
  const recentPartial = listedPair(
    new Date(now.getTime() - maximumBackupAgeMs + 1_000),
    "11111111-1111-4111-8111-111111111111",
  )[0];
  const stale = staleBackupKeys([...objects, oldPartial, recentPartial], now);
  assert.equal(stale.includes(oldPartial.objectKey), true);
  assert.equal(stale.includes(recentPartial.objectKey), false);
  for (const key of keep) assert.equal(stale.includes(key), false);
});

test("detects backup health after 26 hours and computes the next UTC schedule", () => {
  const now = new Date("2026-09-15T12:00:00.000Z");
  assert.equal(
    backupHealth(
      {
        lastSuccessAt: new Date(now.getTime() - maximumBackupAgeMs).toISOString(),
        state: "SUCCESS",
      },
      now,
    ),
    "HEALTHY",
  );
  assert.equal(
    backupHealth(
      {
        lastSuccessAt: new Date(now.getTime() - maximumBackupAgeMs - 1).toISOString(),
        state: "SUCCESS",
      },
      now,
    ),
    "UNHEALTHY",
  );
  assert.equal(
    backupHealth({ lastSuccessAt: now.toISOString(), state: "FAILURE" }, now),
    "UNHEALTHY",
  );
  assert.equal(
    backupHealth({ lastSuccessAt: now.toISOString(), state: "RUNNING" }, now),
    "HEALTHY",
  );
  assert.equal(
    nextBackupTime(new Date("2026-09-15T03:40:59.000Z")).toISOString(),
    "2026-09-15T03:41:00.000Z",
  );
  assert.equal(
    nextBackupTime(new Date("2026-09-15T03:41:00.000Z")).toISOString(),
    "2026-09-16T03:41:00.000Z",
  );
  const catchUp = new Date("2026-09-15T12:00:00.000Z");
  assert.equal(nextRequiredBackupTime(catchUp).toISOString(), "2026-09-16T03:41:00.000Z");
  assert.equal(backupDue(catchUp, new Date("2026-09-16T03:40:59.999Z")), false);
  assert.equal(backupDue(catchUp, new Date("2026-09-16T03:41:00.000Z")), true);
  assert.equal(backupDue(null, now), true);
});

test("requires exactly 32 bytes of hexadecimal key material", () => {
  assert.equal(decodeBackupEncryptionKey("a".repeat(64)).byteLength, 32);
  assert.throws(() => decodeBackupEncryptionKey("a".repeat(63)), {
    message: "Invalid backup encryption key",
  });
});
