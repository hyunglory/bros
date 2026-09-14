import assert from "node:assert/strict";
import test from "node:test";

import {
  ArtifactRetentionError,
  artifactCleanupSchedule,
  createArtifactRetentionService,
  reconcileArtifactCleanupSchedule,
} from "../dist/index.js";

const screenshotKey = "automation/2026/08/01/018f0cb2-ef9d-7b29-a13d-9a4f00000001/failure.png";
const traceKey = "automation/2026/08/01/018f0cb2-ef9d-7b29-a13d-9a4f00000001/trace.zip";
const resultKey = "automation/2026/08/01/018f0cb2-ef9d-7b29-a13d-9a4f00000001/result.json";
const fixedNow = new Date("2026-09-14T12:00:00.000Z");

function createFixture({ failingKeys = [] } = {}) {
  const events = [];
  const deleted = [];
  const failureSet = new Set(failingKeys);
  const repository = {
    async listDeletedKeys(keys) {
      return new Set(
        events
          .filter((event) => event.eventType === "DELETED" && keys.includes(event.objectKey))
          .map((event) => event.objectKey),
      );
    },
    async listExpiredBrowserArtifacts() {
      return [screenshotKey, traceKey, resultKey, "automation/../do-not-delete.txt", screenshotKey];
    },
    async listHeldKeys(keys, now) {
      const latest = new Map();
      for (const event of events) {
        if (event.eventType === "HOLD_SET" || event.eventType === "HOLD_RELEASED") {
          latest.set(event.objectKey, event);
        }
      }
      return new Set(
        [...latest.values()]
          .filter(
            (event) =>
              keys.includes(event.objectKey) &&
              event.eventType === "HOLD_SET" &&
              (event.holdUntil === null || event.holdUntil > now),
          )
          .map((event) => event.objectKey),
      );
    },
    async recordEvent(event) {
      events.push({ ...event, holdUntil: event.holdUntil ?? null });
    },
  };
  const storage = {
    bucket: "development",
    provider: "LOCAL",
    async deleteObject(key) {
      if (failureSet.has(key)) throw new Error("storage credential must not be logged");
      deleted.push(key);
    },
  };
  return {
    deleted,
    events,
    service: createArtifactRetentionService({
      now: () => fixedNow,
      repository,
      storage,
    }),
  };
}

test("P6-05 preserves active holds, deletes expired browser artifacts, and records append-only events", async () => {
  const fixture = createFixture();
  await fixture.service.placeHold({ objectKey: traceKey, reason: "open incident" });

  assert.deepEqual(await fixture.service.runCleanup(), {
    deleted: 2,
    failed: 0,
    held: 1,
    scanned: 3,
  });
  assert.deepEqual(fixture.deleted, [screenshotKey, resultKey]);
  assert.deepEqual(
    fixture.events.map((event) => event.eventType),
    ["HOLD_SET", "DELETED", "DELETED"],
  );

  assert.deepEqual(await fixture.service.runCleanup(), {
    deleted: 0,
    failed: 0,
    held: 1,
    scanned: 3,
  });

  await fixture.service.releaseHold({ objectKey: traceKey, reason: "incident closed" });
  assert.deepEqual(await fixture.service.runCleanup(), {
    deleted: 1,
    failed: 0,
    held: 0,
    scanned: 3,
  });
  assert.deepEqual(fixture.deleted, [screenshotKey, resultKey, traceKey]);
});

test("P6-05 records a stable deletion failure and rejects malformed holds", async () => {
  const fixture = createFixture({ failingKeys: [resultKey] });
  assert.deepEqual(await fixture.service.runCleanup(), {
    deleted: 2,
    failed: 1,
    held: 0,
    scanned: 3,
  });
  const failure = fixture.events.find((event) => event.eventType === "DELETE_FAILED");
  assert.deepEqual(failure, {
    errorCode: "ARTIFACT_DELETE_FAILED",
    eventType: "DELETE_FAILED",
    holdUntil: null,
    objectKey: resultKey,
    storageBucket: "development",
    storageProvider: "LOCAL",
  });
  await assert.rejects(
    fixture.service.placeHold({ objectKey: "automation/../outside.txt", reason: "invalid" }),
    ArtifactRetentionError,
  );
  await assert.rejects(
    fixture.service.placeHold({ objectKey: screenshotKey, reason: "", holdUntil: fixedNow }),
    ArtifactRetentionError,
  );
});

test("P6-05 uses one UTC daily queue schedule with a reference-only payload", async () => {
  const scheduled = [];
  await reconcileArtifactCleanupSchedule({
    async schedule(name, schedule) {
      scheduled.push({ name, schedule });
    },
  });
  assert.deepEqual(scheduled, [{ name: "artifact.cleanup", schedule: artifactCleanupSchedule }]);
  assert.deepEqual(artifactCleanupSchedule, {
    cron: "17 3 * * *",
    data: { publicId: "018f0cb2-ef9d-7b29-a13d-9a4f00000011" },
    key: "artifact-retention-daily",
    timezone: "UTC",
  });
});
