import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open, realpath, rename, unlink } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { SecretProvider, StorageConfig } from "@bros/core";
import { validateObjectKey } from "./object-key.js";
import { StorageError } from "./port.js";
import type { ObjectBody, ObjectStorage, PutObjectInput, StoredObject } from "./port.js";
import { createR2ObjectStorage } from "./r2.js";

const LOCAL_PROVIDER = "LOCAL" as const;
const DEFAULT_BUCKET = "local";
const MIN_SIGNING_SECRET_BYTES = 32;
const MAX_SIGNED_URL_EXPIRY_SECONDS = 86_400;
const bucketPattern = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export interface LocalObjectStorageOptions {
  bucket?: string;
  now?: () => Date;
  root: string;
  signingSecret?: Uint8Array;
}

export interface LocalObjectStorage extends ObjectStorage {
  getObjectBySignedUrl(url: string): Promise<ReadableStream<Uint8Array>>;
}

export function createLocalObjectStorage(options: LocalObjectStorageOptions): LocalObjectStorage {
  return new LocalObjectStorageAdapter(options);
}

export function createObjectStorage(
  config: StorageConfig,
  options: { secretProvider?: SecretProvider } = {},
): ObjectStorage {
  if (config.driver === "local") {
    return createLocalObjectStorage({ root: config.localRoot });
  }

  if (config.driver === "r2") {
    if (!options.secretProvider) {
      throw new StorageError("STORAGE_AUTH_FAILED", "Object storage authentication is required");
    }
    return createR2ObjectStorage({ ...config, secretProvider: options.secretProvider });
  }

  throw new StorageError(
    "UNSUPPORTED_STORAGE_DRIVER",
    "The configured storage driver is not implemented",
  );
}

class LocalObjectStorageAdapter implements LocalObjectStorage {
  readonly bucket: string;
  readonly provider = LOCAL_PROVIDER;

  readonly #configuredRoot: string;
  readonly #now: () => Date;
  readonly #signingSecret: Uint8Array;
  #rootPromise: Promise<string> | undefined;

  constructor(options: LocalObjectStorageOptions) {
    if (options.root.trim().length === 0) {
      throw new StorageError("STORAGE_IO_ERROR", "Local storage root is required");
    }

    const bucket = options.bucket ?? DEFAULT_BUCKET;
    if (!bucketPattern.test(bucket)) {
      throw new StorageError("STORAGE_IO_ERROR", "Local storage bucket is invalid");
    }

    const signingSecret = options.signingSecret ?? randomBytes(MIN_SIGNING_SECRET_BYTES);
    if (signingSecret.byteLength < MIN_SIGNING_SECRET_BYTES) {
      throw new StorageError("STORAGE_IO_ERROR", "Local signing secret is too short");
    }

    this.bucket = bucket;
    this.#configuredRoot = resolve(options.root);
    this.#now = options.now ?? (() => new Date());
    this.#signingSecret = new Uint8Array(signingSecret);
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const key = validateObjectKey(input.key);
    const root = await this.#getRoot();
    const target = this.#targetPath(root, key);
    const parent = dirname(target);
    await this.#ensureSafeDirectory(root, parent);
    await this.#assertSafeTarget(target, true);

    const temporaryPath = join(parent, `.bros-${randomBytes(16).toString("hex")}.tmp`);
    let size: number;
    let file;

    try {
      file = await open(
        temporaryPath,
        constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY,
        0o600,
      );
      size = await writeBody(file, input.body);
      await file.sync();
      await file.close();
      file = undefined;

      await this.#ensureSafeDirectory(root, parent);
      await this.#assertSafeTarget(target, true);
      await rename(temporaryPath, target);
    } catch (error) {
      await file?.close().catch(() => undefined);
      await unlink(temporaryPath).catch(() => undefined);
      throw asStorageError(error, "Unable to store object");
    }

    return { bucket: this.bucket, objectKey: key, provider: this.provider, size };
  }

  async getObject(keyInput: string): Promise<ReadableStream<Uint8Array>> {
    const key = validateObjectKey(keyInput);
    const root = await this.#getRoot();
    const target = this.#targetPath(root, key);
    let file;

    try {
      await this.#assertSafeExistingParent(root, dirname(target));
      file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
      const metadata = await file.stat();
      if (!metadata.isFile()) {
        await file.close();
        file = undefined;
        throw new StorageError("OBJECT_NOT_FOUND", "Stored object does not exist");
      }

      const stream = file.readableWebStream({ autoClose: true }) as ReadableStream<Uint8Array>;
      file = undefined;
      return stream;
    } catch (error) {
      await file?.close().catch(() => undefined);
      throw asStorageError(error, "Unable to read object");
    }
  }

  async deleteObject(keyInput: string): Promise<void> {
    const key = validateObjectKey(keyInput);
    const root = await this.#getRoot();
    const target = this.#targetPath(root, key);

    try {
      await this.#assertSafeExistingParent(root, dirname(target));
      await this.#assertSafeTarget(target, false);
      await unlink(target);
    } catch (error) {
      if (isMissing(error)) {
        return;
      }
      throw asStorageError(error, "Unable to delete object");
    }
  }

  async getSignedUrl(keyInput: string, expiresInSeconds: number): Promise<string> {
    const key = validateObjectKey(keyInput);
    if (
      !Number.isInteger(expiresInSeconds) ||
      expiresInSeconds < 1 ||
      expiresInSeconds > MAX_SIGNED_URL_EXPIRY_SECONDS
    ) {
      throw new StorageError(
        "INVALID_SIGNED_URL_EXPIRY",
        "Signed URL expiry must be between 1 and 86400 seconds",
      );
    }

    const expiresAt = Math.floor(this.#now().getTime() / 1_000) + expiresInSeconds;
    const signature = this.#sign(key, expiresAt);
    const url = new URL(`bros-local://${this.bucket}/`);
    url.pathname = `/${key}`;
    url.searchParams.set("expires", String(expiresAt));
    url.searchParams.set("signature", signature);
    return url.toString();
  }

  async getObjectBySignedUrl(urlInput: string): Promise<ReadableStream<Uint8Array>> {
    let url: URL;
    try {
      url = new URL(urlInput);
    } catch {
      throw invalidSignedUrl();
    }

    const allowedParameters = new Set(["expires", "signature"]);
    if (
      url.protocol !== "bros-local:" ||
      url.hostname !== this.bucket ||
      url.username !== "" ||
      url.password !== "" ||
      url.port !== "" ||
      url.hash !== "" ||
      [...url.searchParams.keys()].some((key) => !allowedParameters.has(key)) ||
      url.searchParams.getAll("expires").length !== 1 ||
      url.searchParams.getAll("signature").length !== 1
    ) {
      throw invalidSignedUrl();
    }

    let key: string;
    try {
      key = validateObjectKey(
        url.pathname
          .slice(1)
          .split("/")
          .map((segment) => decodeURIComponent(segment))
          .join("/"),
      );
    } catch {
      throw invalidSignedUrl();
    }

    const expiresText = url.searchParams.get("expires") ?? "";
    const signature = url.searchParams.get("signature") ?? "";
    if (!/^\d{1,12}$/.test(expiresText) || !/^[a-f0-9]{64}$/.test(signature)) {
      throw invalidSignedUrl();
    }

    const expiresAt = Number(expiresText);
    const expected = Buffer.from(this.#sign(key, expiresAt), "hex");
    const actual = Buffer.from(signature, "hex");
    if (!timingSafeEqual(expected, actual)) {
      throw invalidSignedUrl();
    }

    if (expiresAt <= Math.floor(this.#now().getTime() / 1_000)) {
      throw new StorageError("INVALID_SIGNED_URL_EXPIRY", "Signed URL has expired");
    }

    return this.getObject(key);
  }

  async #getRoot(): Promise<string> {
    this.#rootPromise ??= this.#initializeRoot();
    return this.#rootPromise;
  }

  async #initializeRoot(): Promise<string> {
    try {
      await mkdir(this.#configuredRoot, { mode: 0o700, recursive: true });
      const rootMetadata = await lstat(this.#configuredRoot);
      if (rootMetadata.isSymbolicLink() || !rootMetadata.isDirectory()) {
        throw new StorageError("STORAGE_IO_ERROR", "Local storage root must be a directory");
      }
      return await realpath(this.#configuredRoot);
    } catch (error) {
      throw asStorageError(error, "Unable to initialize local storage");
    }
  }

  #targetPath(root: string, key: string): string {
    const target = join(root, ...key.split("/"));
    const fromRoot = relative(root, target);
    if (fromRoot.length === 0 || fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
      throw new StorageError("INVALID_OBJECT_KEY", "Object key escapes the storage root");
    }
    return target;
  }

  async #ensureSafeDirectory(root: string, directory: string): Promise<void> {
    const fromRoot = relative(root, directory);
    const segments = fromRoot.length === 0 ? [] : fromRoot.split(/[\\/]/);
    let current = root;

    for (const segment of segments) {
      current = join(current, segment);
      try {
        const metadata = await lstat(current);
        if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
          throw new StorageError("STORAGE_IO_ERROR", "Storage path is not a safe directory");
        }
      } catch (error) {
        if (!isMissing(error)) {
          throw error;
        }
        try {
          await mkdir(current, { mode: 0o700 });
        } catch (mkdirError) {
          if (!hasCode(mkdirError, "EEXIST")) {
            throw mkdirError;
          }
        }

        const metadata = await lstat(current);
        if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
          throw new StorageError("STORAGE_IO_ERROR", "Storage path is not a safe directory");
        }
      }
    }

    await this.#assertResolvedInsideRoot(root, directory);
  }

  async #assertSafeExistingParent(root: string, directory: string): Promise<void> {
    const fromRoot = relative(root, directory);
    const segments = fromRoot.length === 0 ? [] : fromRoot.split(/[\\/]/);
    let current = root;

    for (const segment of segments) {
      current = join(current, segment);
      const metadata = await lstat(current);
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) {
        throw new StorageError("STORAGE_IO_ERROR", "Storage path is not a safe directory");
      }
    }

    await this.#assertResolvedInsideRoot(root, directory);
  }

  async #assertSafeTarget(target: string, allowMissing: boolean): Promise<void> {
    try {
      const metadata = await lstat(target);
      if (metadata.isSymbolicLink() || !metadata.isFile()) {
        throw new StorageError("STORAGE_IO_ERROR", "Storage target is not a regular file");
      }
    } catch (error) {
      if (allowMissing && isMissing(error)) {
        return;
      }
      throw error;
    }
  }

  async #assertResolvedInsideRoot(root: string, directory: string): Promise<void> {
    const resolvedDirectory = await realpath(directory);
    const fromRoot = relative(root, resolvedDirectory);
    if (fromRoot.startsWith("..") || isAbsolute(fromRoot)) {
      throw new StorageError("STORAGE_IO_ERROR", "Storage path escapes the configured root");
    }
  }

  #sign(key: string, expiresAt: number): string {
    return createHmac("sha256", this.#signingSecret)
      .update(`${this.bucket}\n${key}\n${String(expiresAt)}`)
      .digest("hex");
  }
}

async function writeBody(
  file: Awaited<ReturnType<typeof open>>,
  body: ObjectBody,
): Promise<number> {
  if (body instanceof Uint8Array) {
    await file.writeFile(body);
    return body.byteLength;
  }

  const reader = body.getReader();
  let size = 0;
  try {
    while (true) {
      const result = await reader.read();
      if (result.done) {
        return size;
      }
      if (!(result.value instanceof Uint8Array)) {
        throw new StorageError("STORAGE_IO_ERROR", "Object stream emitted an invalid chunk");
      }
      await file.writeFile(result.value);
      size += result.value.byteLength;
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally {
    reader.releaseLock();
  }
}

function asStorageError(error: unknown, message: string): StorageError {
  if (error instanceof StorageError) {
    return error;
  }
  if (isMissing(error)) {
    return new StorageError("OBJECT_NOT_FOUND", "Stored object does not exist");
  }
  return new StorageError("STORAGE_IO_ERROR", message);
}

function isMissing(error: unknown): boolean {
  return hasCode(error, "ENOENT");
}

function hasCode(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === code
  );
}

function invalidSignedUrl(): StorageError {
  return new StorageError("INVALID_SIGNED_URL", "Local signed URL is invalid");
}
