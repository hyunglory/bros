import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import type { S3ClientConfig } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { SecretProvider } from "@bros/core";
import { requireSecret } from "@bros/core";
import { Readable } from "node:stream";
import { validateObjectKey } from "./object-key.js";
import { StorageError } from "./port.js";
import type { ObjectStorage, PutObjectInput, StoredObject } from "./port.js";

const R2_PROVIDER = "R2" as const;
const MAX_SIGNED_URL_EXPIRY_SECONDS = 604_800;

export interface R2ObjectStorageOptions {
  bucket: string;
  endpoint: string;
  maxAttempts?: number;
  requestHandler?: S3ClientConfig["requestHandler"];
  secretProvider: SecretProvider;
}

export function createR2ObjectStorage(options: R2ObjectStorageOptions): ObjectStorage {
  return new R2ObjectStorageAdapter(options);
}

class R2ObjectStorageAdapter implements ObjectStorage {
  readonly bucket: string;
  readonly provider = R2_PROVIDER;
  readonly #client: S3Client;

  constructor(options: R2ObjectStorageOptions) {
    this.bucket = options.bucket;
    this.#client = new S3Client({
      credentials: async () => ({
        accessKeyId: await requireSecret(options.secretProvider, "storage.r2.accessKeyId"),
        secretAccessKey: await requireSecret(options.secretProvider, "storage.r2.secretAccessKey"),
      }),
      endpoint: options.endpoint,
      maxAttempts: options.maxAttempts ?? 3,
      region: "auto",
      ...(options.requestHandler === undefined ? {} : { requestHandler: options.requestHandler }),
    });
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const key = validateObjectKey(input.key);
    const tracked = trackBody(input.body);
    try {
      await this.#client.send(
        new PutObjectCommand({
          Body: tracked.body,
          Bucket: this.bucket,
          ContentType: input.contentType,
          Key: key,
          Metadata:
            input.contentHash === undefined ? undefined : { "content-sha256": input.contentHash },
        }),
      );
      return {
        bucket: this.bucket,
        objectKey: key,
        provider: this.provider,
        size: tracked.size(),
      };
    } catch (error) {
      throw asR2StorageError(error, "Unable to store object");
    }
  }

  async getObject(keyInput: string): Promise<ReadableStream<Uint8Array>> {
    const key = validateObjectKey(keyInput);
    try {
      const response = await this.#client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      if (!response.Body)
        throw new StorageError("OBJECT_NOT_FOUND", "Stored object does not exist");
      return toWebStream(response.Body);
    } catch (error) {
      throw asR2StorageError(error, "Unable to read object");
    }
  }

  async deleteObject(keyInput: string): Promise<void> {
    const key = validateObjectKey(keyInput);
    try {
      await this.#client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      throw asR2StorageError(error, "Unable to delete object");
    }
  }

  async getSignedUrl(keyInput: string, expiresInSeconds: number): Promise<string> {
    const key = validateObjectKey(keyInput);
    if (
      !Number.isInteger(expiresInSeconds) ||
      expiresInSeconds < 1 ||
      expiresInSeconds > MAX_SIGNED_URL_EXPIRY_SECONDS
    ) {
      throw new StorageError("INVALID_SIGNED_URL_EXPIRY", "Signed URL expiry is invalid");
    }
    try {
      return await getSignedUrl(
        this.#client,
        new GetObjectCommand({ Bucket: this.bucket, Key: key }),
        {
          expiresIn: expiresInSeconds,
        },
      );
    } catch (error) {
      throw asR2StorageError(error, "Unable to sign object URL");
    }
  }

  async listObjects(prefixInput: string) {
    const prefix = validateObjectKey(prefixInput);
    const objects = [];
    let continuationToken: string | undefined;
    try {
      do {
        const response = await this.#client.send(
          new ListObjectsV2Command({
            Bucket: this.bucket,
            ContinuationToken: continuationToken,
            Prefix: `${prefix}/`,
          }),
        );
        for (const object of response.Contents ?? []) {
          if (
            typeof object.Key !== "string" ||
            typeof object.Size !== "number" ||
            !(object.LastModified instanceof Date)
          )
            continue;
          objects.push({
            lastModified: new Date(object.LastModified),
            objectKey: validateObjectKey(object.Key),
            size: object.Size,
          });
          if (objects.length > 10_000)
            throw new StorageError("STORAGE_IO_ERROR", "Object listing exceeds safety limit");
        }
        continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
        if (response.IsTruncated && !continuationToken)
          throw new StorageError("STORAGE_IO_ERROR", "Object listing pagination is invalid");
      } while (continuationToken);
      return objects;
    } catch (error) {
      throw asR2StorageError(error, "Unable to list objects");
    }
  }
}

function trackBody(body: PutObjectInput["body"]): {
  body: PutObjectInput["body"];
  size: () => number;
} {
  if (body instanceof Uint8Array) return { body, size: () => body.byteLength };
  let size = 0;
  return {
    body: body.pipeThrough(
      new TransformStream({
        transform(chunk, controller) {
          size += chunk.byteLength;
          controller.enqueue(chunk);
        },
      }),
    ),
    size: () => size,
  };
}

function toWebStream(body: unknown): ReadableStream<Uint8Array> {
  if (body instanceof ReadableStream) return body;
  if (body instanceof Readable) return Readable.toWeb(body) as ReadableStream<Uint8Array>;
  if (typeof body === "object" && body !== null && "transformToWebStream" in body) {
    const transform = (body as { transformToWebStream?: unknown }).transformToWebStream;
    if (typeof transform === "function") return transform.call(body) as ReadableStream<Uint8Array>;
  }
  throw new StorageError("STORAGE_IO_ERROR", "Stored object response has no readable body");
}

function asR2StorageError(error: unknown, message: string): StorageError {
  if (error instanceof StorageError) return error;
  if (hasName(error, "NoSuchKey") || hasStatus(error, 404)) {
    return new StorageError("OBJECT_NOT_FOUND", "Stored object does not exist");
  }
  if (
    hasStatus(error, 401) ||
    hasStatus(error, 403) ||
    hasName(error, "CredentialsProviderError") ||
    hasName(error, "SecretNotFoundError")
  ) {
    return new StorageError("STORAGE_AUTH_FAILED", "Object storage authentication failed");
  }
  return new StorageError("STORAGE_IO_ERROR", message);
}

function hasName(error: unknown, name: string): boolean {
  return error instanceof Error && error.name === name;
}

function hasStatus(error: unknown, status: number): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "$metadata" in error &&
    (error as { $metadata?: { httpStatusCode?: unknown } }).$metadata?.httpStatusCode === status
  );
}
