import { rm, unlink } from "node:fs/promises";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { createDecryptedBackupStream } from "../packages/backup/dist/index.js";
import { createRedactedLogger } from "../packages/core/dist/index.js";
import {
  backupEncryptionKey,
  backupStorage,
  createPgCredentialFile,
  createSecureTemporaryDirectory,
  databaseConnection,
  downloadEncryptedBackup,
  loadManifest,
  pgEnvironment,
} from "./database-backup-runtime.mjs";

const logger = createRedactedLogger();
let encryptedPath;
let pgPass;
let root;
try {
  if (process.env.RESTORE_CONFIRM_DISPOSABLE !== "YES") throw new Error();
  const target = databaseConnection("RESTORE_DATABASE_URL");
  if (!target.pathname.slice(1).startsWith("bros_restore_")) throw new Error();
  const manifestKey = process.env.BACKUP_MANIFEST_KEY;
  if (!manifestKey) throw new Error();
  const storage = backupStorage();
  const manifest = await loadManifest(storage, manifestKey);
  root = await createSecureTemporaryDirectory("bros-database-restore-");
  encryptedPath = join(root, "database.dump.enc");
  await downloadEncryptedBackup(
    storage,
    manifest.object.key,
    encryptedPath,
    manifest.object.sha256,
    manifest.object.size,
  );
  const decrypted = await createDecryptedBackupStream(encryptedPath, backupEncryptionKey());
  if (
    decrypted.header.backupId !== manifest.backupId ||
    decrypted.header.createdAt !== manifest.createdAt
  )
    throw new Error();
  pgPass = await createPgCredentialFile(target, root);
  const restore = spawn(
    "pg_restore",
    [
      "--exit-on-error",
      "--no-owner",
      "--no-privileges",
      "--no-password",
      "--host",
      target.hostname,
      "--port",
      target.port || "5432",
      "--username",
      decodeURIComponent(target.username),
      "--dbname",
      target.pathname.slice(1),
    ],
    { env: pgEnvironment(pgPass), stdio: ["pipe", "ignore", "ignore"] },
  );
  const completion = new Promise((resolve, reject) => {
    restore.once("error", reject);
    restore.once("close", (code) => (code === 0 ? resolve() : reject(new Error())));
  });
  try {
    await pipeline(decrypted.stream, restore.stdin);
    await completion;
  } catch {
    restore.kill("SIGTERM");
    await completion.catch(() => undefined);
    throw new Error();
  }
  if (decrypted.plaintextSha256() !== manifest.plaintextSha256) throw new Error();
  logger.info(
    { code: "DATABASE_RESTORE_COMPLETED", backupId: manifest.backupId },
    "Disposable database restore completed",
  );
} catch {
  logger.error({ code: "DATABASE_RESTORE_FAILED" }, "Disposable database restore failed");
  process.exitCode = 1;
} finally {
  if (encryptedPath) await unlink(encryptedPath).catch(() => undefined);
  if (pgPass) await unlink(pgPass).catch(() => undefined);
  if (root) await rm(root, { force: true, recursive: true }).catch(() => undefined);
}
