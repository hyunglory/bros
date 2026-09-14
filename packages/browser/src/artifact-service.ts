import { maskSensitiveText, secretRedactionCensor } from "@bros/core";
import { buildObjectKey, validateObjectKey } from "@bros/storage";
import { createHash } from "node:crypto";
import type { ObjectStorage, StoredObject } from "@bros/storage";
import type { Page } from "playwright";

import { browserErrorCodes } from "./error-taxonomy.js";
import type { BrowserErrorCode } from "./error-taxonomy.js";

const DEFAULT_PREVIEW_TTL_SECONDS = 300;
const DEFAULT_RETENTION_DAYS = 14;
const MAX_RESULT_DEPTH = 8;
const MAX_RESULT_NODES = 1_000;
const MAX_RESULT_STRING_LENGTH = 4_096;
const MAX_RESULT_BYTES = 1_048_576;
const RUN_PUBLIC_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SENSITIVE_KEY_SUFFIXES = [
  "apikey",
  "authorization",
  "cookie",
  "credential",
  "credentials",
  "password",
  "secret",
  "signature",
  "token",
] as const;

export const browserArtifactKinds = ["start", "failure", "final", "trace", "result"] as const;
export type BrowserArtifactKind = (typeof browserArtifactKinds)[number];

type JsonValue = boolean | number | string | null | JsonValue[] | { [key: string]: JsonValue };

export interface BrowserArtifactResultInput {
  readonly currentStep: string;
  readonly currentUrl: string;
  readonly errorCode: BrowserErrorCode | null;
  readonly result?: Readonly<Record<string, unknown>>;
  readonly status: "FAILED" | "SUCCESS" | "TIMEOUT";
}

export interface StoredBrowserArtifact extends StoredObject {
  readonly kind: BrowserArtifactKind;
  readonly retainUntil: string;
}

export interface BrowserArtifactRun {
  captureScreenshot(
    kind: "failure" | "final" | "start",
    page: Pick<Page, "screenshot">,
  ): Promise<StoredBrowserArtifact>;
  writeResult(result: BrowserArtifactResultInput): Promise<StoredBrowserArtifact>;
  writeTrace(body: Uint8Array | ReadableStream<Uint8Array>): Promise<StoredBrowserArtifact>;
}

export interface BrowserArtifactPreviewAuthorization {
  authorize(request: {
    readonly action: "browser-artifact:preview";
    readonly actor: unknown;
    readonly objectKey: string;
  }): Promise<boolean>;
}

export interface BrowserArtifactService {
  createRun(request: {
    readonly createdAt?: Date;
    readonly runPublicId: string;
  }): BrowserArtifactRun;
  getAuthorizedPreviewUrl(request: {
    readonly actor: unknown;
    readonly expiresInSeconds?: number;
    readonly objectKey: string;
  }): Promise<string>;
}

export class BrowserArtifactServiceError extends Error {
  constructor(
    readonly code:
      | "ARTIFACT_ACCESS_DENIED"
      | "ARTIFACT_CAPTURE_FAILED"
      | "ARTIFACT_PREVIEW_FAILED"
      | "ARTIFACT_UPLOAD_FAILED"
      | "INVALID_ARTIFACT_REQUEST",
  ) {
    super(
      code === "ARTIFACT_ACCESS_DENIED"
        ? "Browser artifact access denied"
        : code === "ARTIFACT_CAPTURE_FAILED"
          ? "Browser artifact capture failed"
          : code === "ARTIFACT_PREVIEW_FAILED"
            ? "Browser artifact preview failed"
            : code === "ARTIFACT_UPLOAD_FAILED"
              ? "Browser artifact upload failed"
              : "Invalid browser artifact request",
    );
    this.name = "BrowserArtifactServiceError";
  }
}

function artifactFilename(kind: BrowserArtifactKind): string {
  return kind === "trace" ? "trace.zip" : kind === "result" ? "result.json" : `${kind}.png`;
}

function artifactContentType(kind: BrowserArtifactKind): string {
  return kind === "trace"
    ? "application/zip"
    : kind === "result"
      ? "application/json"
      : "image/png";
}

function assertRunPublicId(runPublicId: string): void {
  if (typeof runPublicId !== "string" || !RUN_PUBLIC_ID_PATTERN.test(runPublicId)) {
    throw new BrowserArtifactServiceError("INVALID_ARTIFACT_REQUEST");
  }
}

function assertDate(date: Date): void {
  if (Number.isNaN(date.getTime()))
    throw new BrowserArtifactServiceError("INVALID_ARTIFACT_REQUEST");
}

function createRunPrefix(createdAt: Date, runPublicId: string): string[] {
  const year = createdAt.getUTCFullYear().toString().padStart(4, "0");
  const month = (createdAt.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = createdAt.getUTCDate().toString().padStart(2, "0");
  return ["automation", year, month, day, runPublicId];
}

function retainUntil(createdAt: Date): string {
  return new Date(createdAt.getTime() + DEFAULT_RETENTION_DAYS * 86_400_000).toISOString();
}

function asStoredArtifact(
  stored: StoredObject,
  kind: BrowserArtifactKind,
  retention: string,
): StoredBrowserArtifact {
  return Object.freeze({ ...stored, kind, retainUntil: retention });
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replaceAll(/[_-]/g, "").toLowerCase();
  return SENSITIVE_KEY_SUFFIXES.some((suffix) => normalized.endsWith(suffix));
}

function sanitizeValue(
  value: unknown,
  state: { nodes: number; seen: Set<object> },
  depth: number,
  key?: string,
): JsonValue {
  state.nodes += 1;
  if (state.nodes > MAX_RESULT_NODES || depth > MAX_RESULT_DEPTH) {
    throw new BrowserArtifactServiceError("INVALID_ARTIFACT_REQUEST");
  }
  if (key !== undefined && isSensitiveKey(key)) return secretRedactionCensor;
  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new BrowserArtifactServiceError("INVALID_ARTIFACT_REQUEST");
    return value;
  }
  if (typeof value === "string") {
    if (value.length > MAX_RESULT_STRING_LENGTH) {
      throw new BrowserArtifactServiceError("INVALID_ARTIFACT_REQUEST");
    }
    return maskSensitiveText(value);
  }
  if (typeof value !== "object" || value === null || state.seen.has(value)) {
    throw new BrowserArtifactServiceError("INVALID_ARTIFACT_REQUEST");
  }
  state.seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > 100) throw new BrowserArtifactServiceError("INVALID_ARTIFACT_REQUEST");
      return value.map((item) => sanitizeValue(item, state, depth + 1));
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new BrowserArtifactServiceError("INVALID_ARTIFACT_REQUEST");
    }
    const output: Record<string, JsonValue> = {};
    for (const [entryKey, entryValue] of Object.entries(value)) {
      if (entryKey.length === 0 || entryKey.length > 128 || entryValue === undefined) {
        throw new BrowserArtifactServiceError("INVALID_ARTIFACT_REQUEST");
      }
      output[entryKey] = sanitizeValue(entryValue, state, depth + 1, entryKey);
    }
    return output;
  } finally {
    state.seen.delete(value);
  }
}

function sanitizeResult(result: Readonly<Record<string, unknown>> | undefined): JsonValue {
  return sanitizeValue(result ?? {}, { nodes: 0, seen: new Set() }, 0);
}

function assertResult(result: BrowserArtifactResultInput): void {
  if (
    typeof result.currentStep !== "string" ||
    typeof result.currentUrl !== "string" ||
    !["FAILED", "SUCCESS", "TIMEOUT"].includes(result.status) ||
    result.currentStep.trim() === "" ||
    result.currentStep.length > 128 ||
    result.currentUrl.trim() === "" ||
    result.currentUrl.length > MAX_RESULT_STRING_LENGTH ||
    (result.errorCode !== null && !browserErrorCodes.includes(result.errorCode)) ||
    (result.status === "SUCCESS" ? result.errorCode !== null : result.errorCode === null) ||
    (result.result !== undefined &&
      (typeof result.result !== "object" || result.result === null || Array.isArray(result.result)))
  ) {
    throw new BrowserArtifactServiceError("INVALID_ARTIFACT_REQUEST");
  }
}

function assertArtifactObjectKey(objectKey: string): void {
  try {
    validateObjectKey(objectKey);
  } catch {
    throw new BrowserArtifactServiceError("INVALID_ARTIFACT_REQUEST");
  }
  const parts = objectKey.split("/");
  if (
    parts.length !== 6 ||
    parts[0] !== "automation" ||
    !/^\d{4}$/.test(parts[1] ?? "") ||
    !/^(?:0[1-9]|1[0-2])$/.test(parts[2] ?? "") ||
    !/^(?:0[1-9]|[12]\d|3[01])$/.test(parts[3] ?? "") ||
    !RUN_PUBLIC_ID_PATTERN.test(parts[4] ?? "") ||
    !["start.png", "failure.png", "final.png", "trace.zip", "result.json"].includes(parts[5] ?? "")
  ) {
    throw new BrowserArtifactServiceError("INVALID_ARTIFACT_REQUEST");
  }
}

export function createBrowserArtifactService(options: {
  readonly authorization?: BrowserArtifactPreviewAuthorization;
  readonly now?: () => Date;
  readonly storage: ObjectStorage;
}): BrowserArtifactService {
  const now = options.now ?? (() => new Date());

  const upload = async (
    key: string,
    body: Uint8Array | ReadableStream<Uint8Array>,
    kind: BrowserArtifactKind,
    retention: string,
  ): Promise<StoredBrowserArtifact> => {
    try {
      const stored = await options.storage.putObject({
        body,
        contentType: artifactContentType(kind),
        key,
        ...(body instanceof Uint8Array
          ? { contentHash: createHash("sha256").update(body).digest("hex") }
          : {}),
      });
      return asStoredArtifact(stored, kind, retention);
    } catch {
      throw new BrowserArtifactServiceError("ARTIFACT_UPLOAD_FAILED");
    }
  };

  return {
    createRun(request) {
      assertRunPublicId(request.runPublicId);
      const sourceDate = request.createdAt ?? now();
      if (!(sourceDate instanceof Date)) {
        throw new BrowserArtifactServiceError("INVALID_ARTIFACT_REQUEST");
      }
      const createdAt = new Date(sourceDate.getTime());
      assertDate(createdAt);
      const prefix = createRunPrefix(createdAt, request.runPublicId);
      const retention = retainUntil(createdAt);
      const keyFor = (kind: BrowserArtifactKind) =>
        buildObjectKey(...prefix, artifactFilename(kind));

      return {
        async captureScreenshot(kind, page) {
          let body: Uint8Array;
          try {
            body = await page.screenshot({ fullPage: true, type: "png" });
          } catch {
            throw new BrowserArtifactServiceError("ARTIFACT_CAPTURE_FAILED");
          }
          return upload(keyFor(kind), body, kind, retention);
        },
        async writeResult(result) {
          assertResult(result);
          const envelope = {
            createdAt: createdAt.toISOString(),
            currentStep: maskSensitiveText(result.currentStep),
            currentUrl: maskSensitiveText(result.currentUrl),
            errorCode: result.errorCode,
            result: sanitizeResult(result.result),
            retention: { days: DEFAULT_RETENTION_DAYS, retainUntil: retention },
            runPublicId: request.runPublicId,
            schemaVersion: 1,
            status: result.status,
          };
          const body = new TextEncoder().encode(JSON.stringify(envelope));
          if (body.byteLength > MAX_RESULT_BYTES) {
            throw new BrowserArtifactServiceError("INVALID_ARTIFACT_REQUEST");
          }
          return upload(keyFor("result"), body, "result", retention);
        },
        writeTrace(body) {
          return upload(keyFor("trace"), body, "trace", retention);
        },
      };
    },
    async getAuthorizedPreviewUrl(request) {
      const ttl = request.expiresInSeconds ?? DEFAULT_PREVIEW_TTL_SECONDS;
      if (!Number.isInteger(ttl) || ttl < 1 || ttl > DEFAULT_PREVIEW_TTL_SECONDS) {
        throw new BrowserArtifactServiceError("INVALID_ARTIFACT_REQUEST");
      }
      let authorized: boolean;
      try {
        authorized =
          (await options.authorization?.authorize({
            action: "browser-artifact:preview",
            actor: request.actor,
            objectKey: request.objectKey,
          })) ?? false;
      } catch {
        throw new BrowserArtifactServiceError("ARTIFACT_ACCESS_DENIED");
      }
      if (authorized !== true) throw new BrowserArtifactServiceError("ARTIFACT_ACCESS_DENIED");
      assertArtifactObjectKey(request.objectKey);
      try {
        return await options.storage.getSignedUrl(request.objectKey, ttl);
      } catch {
        throw new BrowserArtifactServiceError("ARTIFACT_PREVIEW_FAILED");
      }
    },
  };
}
