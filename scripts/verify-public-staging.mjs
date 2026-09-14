import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash, randomUUID } from "node:crypto";
import { resolve4, resolve6 } from "node:dns/promises";
import tls from "node:tls";
import { URL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";

import {
  loadConfigFromProcess,
  createSecretProvider,
  readRuntimeSecret,
} from "../packages/core/dist/index.js";
import { createDatabaseClient } from "../packages/db/dist/index.js";
import { createPgBossQueue } from "../packages/queue/dist/index.js";
import { createObjectStorage } from "../packages/storage/dist/index.js";
import { enqueueBrowserRun } from "../apps/worker/dist/index.js";

const required = ["BROS_PUBLIC_ORIGIN", "BROS_ADMIN_USERNAME"];
for (const name of required) {
  if (!process.env[name]?.trim()) throw new Error(`Missing required environment variable: ${name}`);
}

const config = loadConfigFromProcess("worker");
const origin = new URL(process.env.BROS_PUBLIC_ORIGIN);
const username = process.env.BROS_ADMIN_USERNAME;
const password = readRuntimeSecret(process.env, "BROS_STAGING_ADMIN_PASSWORD");
if (!password) throw new Error("Staging administrator credential missing");
const authorization = `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`;
const database = createDatabaseClient(config.database, { applicationName: "bros-public-staging" });
const queue = createPgBossQueue(config.database, { pollingIntervalSeconds: 0.5 });
const storage = createObjectStorage(config.storage, {
  secretProvider: createSecretProvider(),
});
let jobId;
let run;

async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  return fetch(url, { ...options, signal: globalThis.AbortSignal.timeout(timeoutMs) });
}

async function waitForRun(publicId) {
  const deadline = Date.now() + 90000;
  let current;
  while (Date.now() < deadline) {
    current = await database.db
      .selectFrom("app.automation_run")
      .selectAll()
      .where("public_id", "=", publicId)
      .executeTakeFirstOrThrow();
    if (["SUCCESS", "FAILED", "TIMEOUT", "CANCELLED"].includes(current.status)) return current;
    await delay(250);
  }
  throw new Error(`Browser run did not finish; final status=${current?.status ?? "missing"}`);
}

async function inspectTls() {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(
      { host: origin.hostname, port: 443, rejectUnauthorized: true, servername: origin.hostname },
      () => {
        const certificate = socket.getPeerCertificate();
        const protocol = socket.getProtocol();
        socket.end();
        resolve({ protocol, validTo: certificate.valid_to });
      },
    );
    socket.setTimeout(15000, () => socket.destroy(new Error("TLS probe timed out")));
    socket.once("error", reject);
  });
}

async function main() {
  const addresses = [
    ...(await resolve4(origin.hostname).catch(() => [])),
    ...(await resolve6(origin.hostname).catch(() => [])),
  ];
  assert.ok(addresses.length > 0, "public staging hostname did not resolve");
  const tlsInfo = await inspectTls();
  assert.match(tlsInfo.protocol ?? "", /^TLSv1\.[23]$/);

  const unauthenticated = await fetchWithTimeout(new URL("/ready", origin), { redirect: "manual" });
  assert.equal(unauthenticated.status, 401);
  for (const path of ["/", "/health", "/api/v1/artifacts/preview"]) {
    assert.equal(
      (await fetchWithTimeout(new URL(path, origin), { redirect: "manual" })).status,
      401,
    );
  }
  const admin = await fetchWithTimeout(new URL("/", origin), { headers: { authorization } });
  assert.equal(admin.status, 200);
  assert.match(admin.headers.get("content-type") ?? "", /^text\/html/);
  assert.match(await admin.text(), /<div id="root"><\/div>/);
  const wrongPassword = `Basic ${Buffer.from(`${username}:invalid-staging-password`).toString("base64")}`;
  assert.equal(
    (
      await fetchWithTimeout(new URL("/ready", origin), {
        headers: { authorization: wrongPassword },
      })
    ).status,
    401,
  );
  const csrf = await fetchWithTimeout(
    new URL("/api/v1/import-batches/00000000-0000-7000-8000-000000000001/retry", origin),
    {
      method: "POST",
      headers: {
        authorization,
        origin: "https://untrusted.invalid",
        "content-type": "application/json",
      },
      body: "{}",
    },
  );
  assert.equal(csrf.status, 403);

  const identity = await fetchWithTimeout(new URL("/__staging/identity", origin), {
    headers: {
      authorization,
      "x-bros-actor": "spoofed-client",
      "x-bros-proxy-token": "spoofed-token",
    },
  });
  assert.equal(identity.status, 200);
  assert.deepEqual(await identity.json(), {
    actor: username,
    authorizationPresent: false,
    proxyTokenValid: true,
  });

  const ready = await fetchWithTimeout(new URL("/ready", origin), { headers: { authorization } });
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: "ready" });

  let directApiPortBlocked;
  try {
    const directResponse = await fetchWithTimeout(
      `https://${origin.hostname}:3000/ready`,
      { redirect: "manual" },
      5000,
    );
    directApiPortBlocked = directResponse.status !== 200;
  } catch {
    directApiPortBlocked = true;
  }
  assert.equal(directApiPortBlocked, true, "public hostname unexpectedly exposes API port 3000");

  await queue.start();
  const job = await database.db
    .insertInto("app.automation_job")
    .values({
      allow_manual_run: true,
      allow_parallel: true,
      config_json: JSON.stringify({ mode: "success" }),
      cooldown_seconds: 0,
      enabled: true,
      handler_key: "demo.browser",
      job_code: `public-staging-${randomUUID()}`,
      job_name: "P6-10 public staging browser run",
      job_type: "BROWSER",
      max_retries: 0,
      profile_key: "public-staging-profile",
      timeout_seconds: 60,
    })
    .returning(["id", "public_id"])
    .executeTakeFirstOrThrow();
  jobId = job.id;
  const receipt = await enqueueBrowserRun(database, queue, {
    input: { mode: "success" },
    jobPublicId: job.public_id,
    requestKey: `browser.manual:${randomUUID()}`,
  });
  run = await waitForRun(receipt.publicId);
  assert.equal(run.status, "SUCCESS");
  assert.equal(run.current_step, "completed");
  assert.equal(run.error_code, null);
  const resultKey = run.result_json.artifact.resultKey;
  const keys = [run.screenshot_key, run.trace_key, resultKey];
  assert.ok(keys.every((key) => typeof key === "string"));

  for (const [key, expectedType] of [
    [run.screenshot_key, /^image\/png\b/],
    [run.trace_key, /^application\/zip\b/],
    [resultKey, /^application\/json\b/],
  ]) {
    const preview = await fetchWithTimeout(
      new URL(`/api/v1/artifacts/preview?objectKey=${encodeURIComponent(key)}`, origin),
      { headers: { authorization, "x-bros-actor": "spoofed-client" } },
    );
    assert.equal(preview.status, 200);
    const payload = await preview.json();
    assert.equal(typeof payload.url, "string");
    const signedUrl = new URL(payload.url);
    const endpoint = new URL(config.storage.endpoint);
    assert.equal(signedUrl.protocol, "https:");
    assert.ok(
      [endpoint.hostname, `${config.storage.bucket}.${endpoint.hostname}`].includes(
        signedUrl.hostname,
      ),
      "preview must target the configured private R2 bucket",
    );
    assert.equal(signedUrl.searchParams.get("X-Amz-Expires"), "300");
    const unsignedUrl = new URL(signedUrl);
    unsignedUrl.search = "";
    assert.ok(!(await fetchWithTimeout(unsignedUrl, { redirect: "manual" })).ok);
    const artifact = await fetchWithTimeout(payload.url, { redirect: "error" });
    assert.equal(artifact.status, 200);
    assert.match(artifact.headers.get("content-type") ?? "", expectedType);
    assert.match(artifact.headers.get("x-amz-meta-content-sha256") ?? "", /^[a-f0-9]{64}$/);
    const bytes = Buffer.from(await artifact.arrayBuffer());
    assert.equal(
      createHash("sha256").update(bytes).digest("hex"),
      artifact.headers.get("x-amz-meta-content-sha256"),
    );
    if (key === run.screenshot_key)
      assert.deepEqual(bytes.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    if (key === run.trace_key) assert.deepEqual(bytes.subarray(0, 2), Buffer.from([80, 75]));
    if (key === resultKey) assert.equal(JSON.parse(bytes.toString("utf8")).status, "SUCCESS");
  }

  console.log(
    JSON.stringify({
      browserRun: "PASS",
      caddyAuthentication: "PASS",
      adminStatic: "PASS",
      crossOriginMutation: "DENIED",
      directApiPort: "BLOCKED",
      dnsAddresses: addresses.length,
      privateR2Preview: "PASS",
      proxyIdentityOverwrite: "PASS",
      tlsProtocol: tlsInfo.protocol,
    }),
  );
}

try {
  await main();
} finally {
  const artifactKeys = run
    ? [run.screenshot_key, run.trace_key, run.result_json?.artifact?.resultKey].filter(
        (value) => typeof value === "string",
      )
    : [];
  // The durable demo also captures start.png before final/failure evidence.
  if (run?.screenshot_key && /\/(?:final|failure)\.png$/.test(run.screenshot_key)) {
    artifactKeys.push(run.screenshot_key.replace(/\/(?:final|failure)\.png$/, "/start.png"));
  }
  const cleanup = await Promise.allSettled(
    artifactKeys.map(async (key) => {
      await storage.deleteObject(key);
      await assert.rejects(storage.getObject(key), { code: "OBJECT_NOT_FOUND" });
    }),
  );
  console.log(
    JSON.stringify({
      artifactCleanup: cleanup.every((item) => item.status === "fulfilled") ? "PASS" : "FAIL",
      artifactCount: artifactKeys.length,
    }),
  );
  if (cleanup.some((item) => item.status === "rejected")) process.exitCode = 1;
  if (jobId !== undefined) {
    await database.db
      .deleteFrom("app.automation_run")
      .where("automation_job_id", "=", jobId)
      .execute();
    await database.db.deleteFrom("app.automation_job").where("id", "=", jobId).execute();
  }
  await queue.stop().catch(() => undefined);
  await database.close();
}
