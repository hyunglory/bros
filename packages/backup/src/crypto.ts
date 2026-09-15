import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { Buffer } from "node:buffer";
import { createReadStream, createWriteStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";

const MAGIC = Buffer.from("BROSDB01", "ascii");
const TAG_LENGTH = 16;
const MAX_HEADER_LENGTH = 4_096;

export interface BackupEncryptionHeader {
  algorithm: "AES-256-GCM";
  backupId: string;
  createdAt: string;
  formatVersion: 1;
  keyId: string;
  nonce: string;
}

export function decodeBackupEncryptionKey(value: string): Buffer {
  if (!/^[0-9a-f]{64}$/i.test(value)) throw new TypeError("Invalid backup encryption key");
  return Buffer.from(value, "hex");
}

export function backupKeyId(key: Uint8Array): string {
  if (key.byteLength !== 32) throw new TypeError("Invalid backup encryption key");
  return createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function headerPrefix(header: BackupEncryptionHeader): Buffer {
  const encoded = Buffer.from(JSON.stringify(header), "utf8");
  if (encoded.byteLength > MAX_HEADER_LENGTH) throw new TypeError("Backup header is too large");
  const length = Buffer.alloc(4);
  length.writeUInt32BE(encoded.byteLength);
  return Buffer.concat([MAGIC, length, encoded]);
}

export async function encryptBackupStream(options: {
  backupId: string;
  createdAt: Date;
  input: NodeJS.ReadableStream;
  key: Uint8Array;
  outputPath: string;
}): Promise<{
  header: BackupEncryptionHeader;
  objectSha256: string;
  plaintextSha256: string;
  size: number;
}> {
  if (options.key.byteLength !== 32 || Number.isNaN(options.createdAt.getTime()))
    throw new TypeError("Invalid backup encryption request");
  const nonce = randomBytes(12);
  const header: BackupEncryptionHeader = {
    algorithm: "AES-256-GCM",
    backupId: options.backupId,
    createdAt: options.createdAt.toISOString(),
    formatVersion: 1,
    keyId: backupKeyId(options.key),
    nonce: nonce.toString("hex"),
  };
  const prefix = headerPrefix(header);
  const file = await open(options.outputPath, "wx", 0o600);
  const plaintextHash = createHash("sha256");
  const cipher = createCipheriv("aes-256-gcm", options.key, nonce);
  cipher.setAAD(prefix);
  const tracker = new Transform({
    transform(chunk, _encoding, callback) {
      plaintextHash.update(chunk);
      callback(null, chunk);
    },
  });
  try {
    await file.write(prefix, 0, prefix.length, 0);
    await pipeline(
      options.input,
      tracker,
      cipher,
      createWriteStream(options.outputPath, {
        fd: file.fd,
        start: prefix.length,
        autoClose: false,
      }),
    );
    const details = await stat(options.outputPath);
    const tag = cipher.getAuthTag();
    await file.write(tag, 0, tag.length, details.size);
    await file.sync();
  } finally {
    await file.close();
  }
  const details = await stat(options.outputPath);
  const objectHash = createHash("sha256");
  await pipeline(
    createReadStream(options.outputPath),
    new Transform({
      transform(chunk, _encoding, callback) {
        objectHash.update(chunk);
        callback();
      },
    }),
  );
  return {
    header,
    objectSha256: objectHash.digest("hex"),
    plaintextSha256: plaintextHash.digest("hex"),
    size: details.size,
  };
}

export async function readBackupHeader(path: string): Promise<{
  dataEnd: number;
  dataStart: number;
  header: BackupEncryptionHeader;
  prefix: Buffer;
  tag: Buffer;
}> {
  const file = await open(path, "r");
  try {
    const details = await file.stat();
    if (!details.isFile() || details.size < MAGIC.length + 4 + TAG_LENGTH + 1)
      throw new TypeError("Invalid encrypted backup");
    const first = Buffer.alloc(MAGIC.length + 4);
    await file.read(first, 0, first.length, 0);
    if (!first.subarray(0, MAGIC.length).equals(MAGIC))
      throw new TypeError("Invalid encrypted backup");
    const headerLength = first.readUInt32BE(MAGIC.length);
    if (
      headerLength < 1 ||
      headerLength > MAX_HEADER_LENGTH ||
      first.length + headerLength + TAG_LENGTH >= details.size
    )
      throw new TypeError("Invalid encrypted backup");
    const encoded = Buffer.alloc(headerLength);
    await file.read(encoded, 0, encoded.length, first.length);
    const header = JSON.parse(encoded.toString("utf8")) as BackupEncryptionHeader;
    const createdAt = new Date(header.createdAt);
    if (
      header.formatVersion !== 1 ||
      header.algorithm !== "AES-256-GCM" ||
      !/^[0-9a-f]{24}$/.test(header.nonce) ||
      !/^[0-9a-f]{16}$/.test(header.keyId) ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        header.backupId,
      ) ||
      Number.isNaN(createdAt.getTime()) ||
      createdAt.toISOString() !== header.createdAt
    )
      throw new TypeError("Invalid encrypted backup");
    const tag = Buffer.alloc(TAG_LENGTH);
    await file.read(tag, 0, tag.length, details.size - TAG_LENGTH);
    return {
      dataEnd: details.size - TAG_LENGTH - 1,
      dataStart: first.length + headerLength,
      header,
      prefix: Buffer.concat([first, encoded]),
      tag,
    };
  } catch {
    throw new TypeError("Invalid encrypted backup");
  } finally {
    await file.close();
  }
}

export async function createDecryptedBackupStream(
  path: string,
  key: Uint8Array,
): Promise<{
  header: BackupEncryptionHeader;
  plaintextSha256: () => string;
  stream: NodeJS.ReadableStream;
}> {
  const parsed = await readBackupHeader(path);
  if (backupKeyId(key) !== parsed.header.keyId) throw new TypeError("Backup decryption failed");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(parsed.header.nonce, "hex"));
  decipher.setAAD(parsed.prefix);
  decipher.setAuthTag(parsed.tag);
  const hash = createHash("sha256");
  const decrypted = createReadStream(path, {
    start: parsed.dataStart,
    end: parsed.dataEnd,
  }).pipe(decipher);
  const output = Readable.from(
    (async function* trackPlaintext() {
      try {
        for await (const chunk of decrypted) {
          hash.update(chunk);
          yield chunk;
        }
      } catch (error) {
        throw new TypeError("Backup decryption failed", { cause: error });
      }
    })(),
  );
  return {
    header: parsed.header,
    plaintextSha256: () => hash.copy().digest("hex"),
    stream: output,
  };
}
