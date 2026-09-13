export const storageProviders = ["LOCAL", "R2", "S3"] as const;

export type StorageProvider = (typeof storageProviders)[number];
export type ObjectBody = Uint8Array | ReadableStream<Uint8Array>;

export interface PutObjectInput {
  body: ObjectBody;
  key: string;
}

export interface StoredObject {
  bucket: string;
  objectKey: string;
  provider: StorageProvider;
  size: number;
}

export interface ObjectStorage {
  readonly bucket: string;
  readonly provider: StorageProvider;
  putObject(input: PutObjectInput): Promise<StoredObject>;
  getObject(key: string): Promise<ReadableStream<Uint8Array>>;
  deleteObject(key: string): Promise<void>;
  getSignedUrl(key: string, expiresInSeconds: number): Promise<string>;
}

export type StorageErrorCode =
  | "INVALID_OBJECT_KEY"
  | "INVALID_SIGNED_URL"
  | "INVALID_SIGNED_URL_EXPIRY"
  | "OBJECT_NOT_FOUND"
  | "STORAGE_IO_ERROR"
  | "UNSUPPORTED_STORAGE_DRIVER";

export class StorageError extends Error {
  readonly code: StorageErrorCode;

  constructor(code: StorageErrorCode, message: string) {
    super(message);
    this.name = "StorageError";
    this.code = code;
  }
}
