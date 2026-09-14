import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { randomUUID } from "node:crypto";
import { URL } from "node:url";

import { createArtifactPreviewPort } from "../apps/api/dist/index.js";
import {
  createArtifactRetentionRepository,
  createArtifactRetentionService,
} from "../apps/worker/dist/index.js";
import { createBrowserArtifactService } from "../packages/browser/dist/index.js";
import { EnvSecretProvider, loadConfig } from "../packages/core/dist/index.js";
import { createDatabaseClient } from "../packages/db/dist/index.js";
import { createMigrator } from "../packages/db/dist/migration-runtime.js";
import { createObjectStorage, createR2ObjectStorage } from "../packages/storage/dist/index.js";
import { createDatabaseFixture } from "../tests/integration/database-fixture.mjs";

const REQUIRED_ENVIRONMENT = [
  "TEST_DATABASE_URL",
  "STORAGE_R2_ENDPOINT",
  "STORAGE_R2_BUCKET",
  "BROS_SECRET_STORAGE_R2_ACCESS_KEY_ID",
  "BROS_SECRET_STORAGE_R2_SECRET_ACCESS_KEY",
];

function assertEnvironment() {
  for (const name of REQUIRED_ENVIRONMENT) {
    if (!process.env[name]?.trim())
      throw new Error(`Missing required environment variable: ${name}`);
  }
}

function uuidV7Shape() {
  const parts = randomUUID().split("-");
  parts[2] = `7${parts[2].slice(1)}`;
  parts[3] = `8${parts[3].slice(1)}`;
  return parts.join("-");
}

async function readBytes(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

async function expectMissing(storage, key) {
  await assert.rejects(storage.getObject(key), { code: "OBJECT_NOT_FOUND" });
}

async function verifyWrongCredentialMapping(config, key) {
  const validAccessKeyId = process.env.BROS_SECRET_STORAGE_R2_ACCESS_KEY_ID;
  const invalidSecret = `${process.env.BROS_SECRET_STORAGE_R2_SECRET_ACCESS_KEY}-invalid`;
  const storage = createR2ObjectStorage({
    bucket: config.storage.bucket,
    endpoint: config.storage.endpoint,
    maxAttempts: 1,
    secretProvider: {
      async get(secretKey) {
        return secretKey === "storage.r2.accessKeyId" ? validAccessKeyId : invalidSecret;
      },
    },
  });
  await assert.rejects(storage.getObject(key), { code: "STORAGE_AUTH_FAILED" });
}

async function main() {
  let stage = "environment";
  assertEnvironment();
  console.log(`R2_STAGING_STAGE ${stage}`);

  stage = "database-fixture";
  const fixture = await createDatabaseFixture();
  console.log(`R2_STAGING_STAGE ${stage}`);

  stage = "database-migration";
  try {
    const migration = await createMigrator(fixture.db).migrateToLatest();
    if (migration.error) {
      console.error(
        JSON.stringify({
          errorCode:
            typeof migration.error === "object" &&
            migration.error !== null &&
            "code" in migration.error
              ? migration.error.code
              : null,
          errorType:
            migration.error instanceof Error ? migration.error.name : typeof migration.error,
          migrations: migration.results?.map((result) => ({
            name: result.migrationName,
            status: result.status,
          })),
          stage,
        }),
      );
      throw new Error("Database migration failed");
    }
  } catch (error) {
    console.error(`R2_STAGING_VALIDATION_FAILED ${stage}`);
    await fixture.cleanup();
    throw error;
  }
  console.log(`R2_STAGING_STAGE ${stage}`);

  const config = loadConfig({
    DATABASE_URL: fixture.connectionString,
    DB_POOL_MAX: "4",
    STORAGE_DRIVER: "r2",
    STORAGE_R2_BUCKET: process.env.STORAGE_R2_BUCKET,
    STORAGE_R2_ENDPOINT: process.env.STORAGE_R2_ENDPOINT,
  });
  const database = createDatabaseClient(config.database, { applicationName: "bros-r2-staging" });
  const storage = createObjectStorage(config.storage, {
    secretProvider: new EnvSecretProvider(process.env),
  });
  const runPublicId = uuidV7Shape();
  const createdAt = new Date("2026-08-01T00:00:00.000Z");
  const runArtifacts = createBrowserArtifactService({
    authorization: { authorize: async ({ actor }) => actor?.role === "ADMIN" },
    now: () => createdAt,
    storage,
  }).createRun({ capturePolicy: "synthetic-demo", createdAt, runPublicId });
  const allKeys = [];

  try {
    stage = "r2-put";
    const startBody = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.from("r2-staging-start"),
    ]);
    const screenshotBody = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      Buffer.from("r2-staging-failure"),
    ]);
    const start = await runArtifacts.captureScreenshot("start", {
      async screenshot() {
        return startBody;
      },
    });
    allKeys.push(start.objectKey);
    const screenshot = await runArtifacts.captureScreenshot("failure", {
      async screenshot() {
        return screenshotBody;
      },
    });
    allKeys.push(screenshot.objectKey);
    const trace = await runArtifacts.writeTrace(Buffer.from("r2-staging-trace"));
    allKeys.push(trace.objectKey);
    const result = await runArtifacts.writeResult({
      currentStep: "verify-r2-staging",
      currentUrl: "https://staging.invalid/browser-flow",
      errorCode: null,
      result: { validation: "private-r2" },
      status: "SUCCESS",
    });
    allKeys.push(result.objectKey);
    console.log(`R2_STAGING_STAGE ${stage}`);

    stage = "r2-read-and-auth-failure";
    assert.deepEqual(await readBytes(await storage.getObject(start.objectKey)), startBody);
    assert.deepEqual(
      await readBytes(await storage.getObject(screenshot.objectKey)),
      screenshotBody,
    );
    await verifyWrongCredentialMapping(config, result.objectKey);
    console.log(`R2_STAGING_STAGE ${stage}`);

    stage = "private-and-authorized-preview";
    const unsignedUrl = new URL(config.storage.endpoint);
    unsignedUrl.pathname = `/${config.storage.bucket}/${result.objectKey}`;
    const unsignedResponse = await fetch(unsignedUrl, { redirect: "manual" });
    assert.equal(
      unsignedResponse.ok,
      false,
      "private R2 object unexpectedly allowed unsigned access",
    );

    const browserPreview = createBrowserArtifactService({
      authorization: { authorize: async ({ actor }) => actor?.role === "ADMIN" },
      storage,
    });
    await assert.rejects(
      browserPreview.getAuthorizedPreviewUrl({
        actor: { role: "VIEWER" },
        objectKey: result.objectKey,
      }),
      { code: "ARTIFACT_ACCESS_DENIED" },
    );
    const previewPort = createArtifactPreviewPort(storage);
    const signedUrl = await previewPort.getAuthorizedPreviewUrl({
      actor: "r2-staging-admin",
      objectKey: result.objectKey,
    });
    const previewResponse = await fetch(signedUrl, { redirect: "error" });
    assert.equal(previewResponse.status, 200);
    assert.match(previewResponse.headers.get("content-type") ?? "", /^application\/json\b/);
    assert.match(previewResponse.headers.get("x-amz-meta-content-sha256") ?? "", /^[a-f0-9]{64}$/);
    const previewBody = Buffer.from(await previewResponse.arrayBuffer());
    assert.match(previewBody.toString("utf8"), /"validation":"private-r2"/);
    console.log(`R2_STAGING_STAGE ${stage}`);

    stage = "retention-fixture";
    const job = await database.db
      .insertInto("app.automation_job")
      .values({
        allow_manual_run: true,
        allow_parallel: true,
        config_json: JSON.stringify({}),
        cooldown_seconds: 0,
        enabled: true,
        handler_key: "demo.browser",
        job_code: `r2-staging-${randomUUID()}`,
        job_name: "R2 staging retention fixture",
        job_type: "BROWSER",
        max_retries: 0,
        profile_key: "r2-staging-profile",
        timeout_seconds: 60,
      })
      .returning("id")
      .executeTakeFirstOrThrow();
    await database.db
      .insertInto("app.automation_run")
      .values({
        attempt_no: 1,
        automation_job_id: job.id,
        finished_at: createdAt,
        input_json: JSON.stringify({}),
        request_key: `r2-staging:${randomUUID()}`,
        result_json: JSON.stringify({
          artifact: { resultKey: result.objectKey, startKey: start.objectKey },
        }),
        screenshot_key: screenshot.objectKey,
        started_at: createdAt,
        status: "SUCCESS",
        trace_key: trace.objectKey,
        trigger_type: "MANUAL",
      })
      .executeTakeFirstOrThrow();
    console.log(`R2_STAGING_STAGE ${stage}`);

    stage = "held-and-unheld-cleanup";
    const retention = createArtifactRetentionService({
      now: () => new Date("2026-09-14T12:00:00.000Z"),
      repository: createArtifactRetentionRepository(database),
      storage,
    });
    await retention.placeHold({ objectKey: start.objectKey, reason: "R2 staging hold validation" });
    assert.deepEqual(await retention.runCleanup(), { deleted: 3, failed: 0, held: 1, scanned: 4 });
    await storage.getObject(start.objectKey);
    await expectMissing(storage, screenshot.objectKey);
    await expectMissing(storage, trace.objectKey);
    await expectMissing(storage, result.objectKey);

    await retention.releaseHold({ objectKey: start.objectKey, reason: "R2 staging hold released" });
    assert.deepEqual(await retention.runCleanup(), { deleted: 1, failed: 0, held: 0, scanned: 4 });
    await expectMissing(storage, start.objectKey);

    const events = await database.db
      .selectFrom("app.artifact_retention_event")
      .select(["event_type", "storage_bucket", "storage_provider"])
      .orderBy("id")
      .execute();
    assert.deepEqual(
      events.map((event) => event.event_type),
      ["HOLD_SET", "DELETED", "DELETED", "DELETED", "HOLD_RELEASED", "DELETED"],
    );
    for (const event of events.filter((item) => item.event_type === "DELETED")) {
      assert.equal(event.storage_provider, "R2");
      assert.equal(event.storage_bucket, config.storage.bucket);
    }
    console.log(`R2_STAGING_STAGE ${stage}`);

    console.log(
      JSON.stringify({
        bucket: config.storage.bucket,
        cleanup: "PASS",
        credentialFailureMapping: "PASS",
        deletedArtifactCount: 4,
        privateUnsignedAccess: "DENIED",
        provider: storage.provider,
        signedPreviewSeconds: 300,
      }),
    );
  } catch (error) {
    console.error(
      JSON.stringify({
        errorCode:
          typeof error === "object" && error !== null && "code" in error ? error.code : null,
        errorType: error instanceof Error ? error.name : typeof error,
        stage,
      }),
    );
    throw error;
  } finally {
    console.log("R2_STAGING_STAGE final-cleanup");
    await Promise.allSettled(allKeys.map((key) => storage.deleteObject(key)));
    await database.close();
    await fixture.cleanup();
  }
}

main().catch(() => {
  process.exitCode = 1;
});
