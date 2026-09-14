import { createRedactedLogger } from "@bros/core";
import type { DatabaseClient, JsonObject, JsonValue } from "@bros/db";
import type { QueueJob, QueuePort, QueueSchedule } from "@bros/queue";
import { validateObjectKey } from "@bros/storage";
import type { ObjectStorage } from "@bros/storage";

const TERMINAL_BROWSER_RUN_STATUSES = ["SUCCESS", "FAILED", "TIMEOUT", "CANCELLED"] as const;
const DEFAULT_RETENTION_DAYS = 14;
const DEFAULT_BATCH_SIZE = 100;
const CLEANUP_SCHEDULE_KEY = "artifact-retention-daily";
const CLEANUP_SCHEDULE_PUBLIC_ID = "018f0cb2-ef9d-7b29-a13d-9a4f00000011";
const BROWSER_RUN_PREFIX_PATTERN =
  /^automation\/\d{4}\/(?:0[1-9]|1[0-2])\/(?:0[1-9]|[12]\d|3[01])\/[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\//i;

export type ArtifactRetentionEventType = "HOLD_RELEASED" | "HOLD_SET" | "DELETED" | "DELETE_FAILED";

export interface ArtifactRetentionEvent {
  errorCode?: string;
  eventType: ArtifactRetentionEventType;
  holdUntil?: Date | null;
  objectKey: string;
  reason?: string;
  storageBucket?: string;
  storageProvider?: string;
}

export interface ArtifactRetentionRepository {
  listDeletedKeys(objectKeys: readonly string[]): Promise<ReadonlySet<string>>;
  listExpiredBrowserArtifacts(request: { before: Date; limit: number }): Promise<readonly string[]>;
  listHeldKeys(objectKeys: readonly string[], now: Date): Promise<ReadonlySet<string>>;
  recordEvent(event: ArtifactRetentionEvent): Promise<void>;
}

export class ArtifactRetentionError extends Error {
  constructor(readonly code: "INVALID_ARTIFACT_HOLD" | "INVALID_RETENTION_POLICY") {
    super(
      code === "INVALID_ARTIFACT_HOLD"
        ? "Artifact retention hold is invalid"
        : "Retention policy is invalid",
    );
    this.name = "ArtifactRetentionError";
  }
}

export interface ArtifactRetentionService {
  placeHold(request: { holdUntil?: Date | null; objectKey: string; reason: string }): Promise<void>;
  releaseHold(request: { objectKey: string; reason?: string }): Promise<void>;
  runCleanup(): Promise<{ deleted: number; failed: number; held: number; scanned: number }>;
}

export function createArtifactRetentionService(options: {
  batchSize?: number;
  now?: () => Date;
  repository: ArtifactRetentionRepository;
  retentionDays?: number;
  storage: Pick<ObjectStorage, "bucket" | "deleteObject" | "provider">;
}): ArtifactRetentionService {
  const batchSize = options.batchSize ?? DEFAULT_BATCH_SIZE;
  const retentionDays = options.retentionDays ?? DEFAULT_RETENTION_DAYS;
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new ArtifactRetentionError("INVALID_RETENTION_POLICY");
  }
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) {
    throw new ArtifactRetentionError("INVALID_RETENTION_POLICY");
  }
  const now = options.now ?? (() => new Date());

  return {
    async placeHold(request) {
      const objectKey = assertObjectKey(request.objectKey);
      const reason = assertReason(request.reason);
      const holdUntil = request.holdUntil ?? null;
      if (holdUntil !== null && (!(holdUntil instanceof Date) || holdUntil <= now())) {
        throw new ArtifactRetentionError("INVALID_ARTIFACT_HOLD");
      }
      await options.repository.recordEvent({ eventType: "HOLD_SET", holdUntil, objectKey, reason });
    },
    async releaseHold(request) {
      const objectKey = assertObjectKey(request.objectKey);
      await options.repository.recordEvent({
        eventType: "HOLD_RELEASED",
        objectKey,
        ...(request.reason === undefined ? {} : { reason: assertReason(request.reason) }),
      });
    },
    async runCleanup() {
      const startedAt = now();
      const before = new Date(startedAt.getTime() - retentionDays * 86_400_000);
      const candidates = uniqueSafeKeys(
        await options.repository.listExpiredBrowserArtifacts({ before, limit: batchSize }),
      );
      const [deletedKeys, heldKeys] = await Promise.all([
        options.repository.listDeletedKeys(candidates),
        options.repository.listHeldKeys(candidates, startedAt),
      ]);
      const summary = { deleted: 0, failed: 0, held: 0, scanned: candidates.length };
      for (const objectKey of candidates) {
        if (deletedKeys.has(objectKey)) continue;
        if (heldKeys.has(objectKey)) {
          summary.held += 1;
          continue;
        }
        try {
          await options.storage.deleteObject(objectKey);
          await options.repository.recordEvent({
            eventType: "DELETED",
            objectKey,
            storageBucket: options.storage.bucket,
            storageProvider: options.storage.provider,
          });
          summary.deleted += 1;
        } catch {
          await options.repository.recordEvent({
            errorCode: "ARTIFACT_DELETE_FAILED",
            eventType: "DELETE_FAILED",
            objectKey,
            storageBucket: options.storage.bucket,
            storageProvider: options.storage.provider,
          });
          summary.failed += 1;
        }
      }
      return summary;
    },
  };
}

export const artifactCleanupSchedule: QueueSchedule = {
  cron: "17 3 * * *",
  data: { publicId: CLEANUP_SCHEDULE_PUBLIC_ID },
  key: CLEANUP_SCHEDULE_KEY,
  timezone: "UTC",
};

export async function reconcileArtifactCleanupSchedule(queue: QueuePort): Promise<void> {
  await queue.schedule("artifact.cleanup", artifactCleanupSchedule);
}

export function createArtifactRetentionHandler(
  database: DatabaseClient,
  storage: Pick<ObjectStorage, "bucket" | "deleteObject" | "provider">,
  logger: ReturnType<typeof createRedactedLogger> = createRedactedLogger(),
): (job: QueueJob) => Promise<void> {
  const service = createArtifactRetentionService({
    repository: createArtifactRetentionRepository(database),
    storage,
  });
  return async () => {
    const summary = await service.runCleanup();
    logger.info({ code: "ARTIFACT_CLEANUP_COMPLETED", ...summary }, "Artifact cleanup completed");
  };
}

export function createArtifactRetentionRepository(
  database: DatabaseClient,
): ArtifactRetentionRepository {
  return {
    async listExpiredBrowserArtifacts({ before, limit }) {
      const rows = await database.db
        .selectFrom("app.automation_run")
        .select(["result_json", "screenshot_key", "trace_key"])
        .where("status", "in", TERMINAL_BROWSER_RUN_STATUSES)
        .where("finished_at", "<", before)
        .orderBy("finished_at", "asc")
        .limit(limit)
        .execute();
      return uniqueSafeKeys(
        rows.flatMap((row) => [
          startArtifactKey(row.result_json, row.screenshot_key),
          row.screenshot_key,
          row.trace_key,
          resultArtifactKey(row.result_json),
        ]),
      ).slice(0, limit);
    },
    async listDeletedKeys(objectKeys) {
      if (objectKeys.length === 0) return new Set<string>();
      const rows = await database.db
        .selectFrom("app.artifact_retention_event")
        .select("object_key")
        .where("event_type", "=", "DELETED")
        .where("object_key", "in", objectKeys)
        .execute();
      return new Set(rows.map((row) => row.object_key));
    },
    async listHeldKeys(objectKeys, at) {
      if (objectKeys.length === 0) return new Set<string>();
      const rows = await database.db
        .selectFrom("app.artifact_retention_event")
        .select(["event_type", "hold_until", "object_key"])
        .where("object_key", "in", objectKeys)
        .where("event_type", "in", ["HOLD_SET", "HOLD_RELEASED"])
        .orderBy("id", "desc")
        .execute();
      const latest = new Map<string, { eventType: string; holdUntil: Date | null }>();
      for (const row of rows) {
        if (!latest.has(row.object_key)) {
          latest.set(row.object_key, { eventType: row.event_type, holdUntil: row.hold_until });
        }
      }
      return new Set(
        [...latest].flatMap(([objectKey, state]) =>
          state.eventType === "HOLD_SET" && (state.holdUntil === null || state.holdUntil > at)
            ? [objectKey]
            : [],
        ),
      );
    },
    async recordEvent(event) {
      await database.db
        .insertInto("app.artifact_retention_event")
        .values({
          error_code: event.errorCode ?? null,
          event_type: event.eventType,
          hold_until: event.holdUntil ?? null,
          object_key: event.objectKey,
          reason: event.reason ?? null,
          storage_bucket: event.storageBucket ?? null,
          storage_provider: event.storageProvider ?? null,
        })
        .executeTakeFirstOrThrow();
    },
  };
}

function resultArtifactKey(value: JsonObject): string | null {
  const artifact = resultArtifact(value);
  if (artifact === null) return null;
  const resultKey = artifact.resultKey;
  return typeof resultKey === "string" ? resultKey : null;
}

function startArtifactKey(value: JsonObject, screenshotKey: string | null): string | null {
  const expectedStartKey = legacyStartArtifactKey(screenshotKey);
  if (expectedStartKey === null) return null;
  const artifact = resultArtifact(value);
  if (artifact !== null && Object.hasOwn(artifact, "startKey")) {
    const explicitStartKey = exactBrowserArtifactKey(artifact.startKey, "start.png");
    return explicitStartKey === expectedStartKey ? explicitStartKey : null;
  }
  return expectedStartKey;
}

function legacyStartArtifactKey(screenshotKey: string | null): string | null {
  if (typeof screenshotKey !== "string") return null;
  const match = screenshotKey.match(/^(.*\/)(?:failure|final)\.png$/);
  if (match === null || !BROWSER_RUN_PREFIX_PATTERN.test(screenshotKey)) return null;
  return exactBrowserArtifactKey(`${match[1]}start.png`, "start.png");
}

function resultArtifact(value: JsonObject): Record<string, JsonValue> | null {
  const artifact = value.artifact;
  return typeof artifact === "object" && artifact !== null && !Array.isArray(artifact)
    ? (artifact as Record<string, JsonValue>)
    : null;
}

function exactBrowserArtifactKey(value: JsonValue | undefined, filename: string): string | null {
  if (typeof value !== "string") return null;
  if (!BROWSER_RUN_PREFIX_PATTERN.test(value) || !value.endsWith(`/${filename}`)) return null;
  return value;
}

function uniqueSafeKeys(values: readonly (string | null)[]): string[] {
  const keys = new Set<string>();
  for (const value of values) {
    if (typeof value !== "string") continue;
    try {
      keys.add(validateObjectKey(value));
    } catch {
      // Never delete a malformed DB value. It remains inspectable for operator repair.
    }
  }
  return [...keys];
}

function assertObjectKey(value: string): string {
  try {
    return validateObjectKey(value);
  } catch {
    throw new ArtifactRetentionError("INVALID_ARTIFACT_HOLD");
  }
}

function assertReason(value: string): string {
  if (typeof value !== "string" || value.trim().length === 0 || value.length > 256) {
    throw new ArtifactRetentionError("INVALID_ARTIFACT_HOLD");
  }
  return value.trim();
}
