import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  processBackupAlertOnce,
  readAlertState,
  webhookUrl,
} from "../../../scripts/backup-alert-runtime.mjs";

async function fixture(context) {
  const root = await mkdtemp(join(tmpdir(), "bros-backup-alert-"));
  context.after(() => rm(root, { force: true, recursive: true }));
  return { statePath: join(root, "alert-state.json"), statusPath: join(root, "status.json") };
}

const fakeUrl = webhookUrl("http://127.0.0.1:8787/alerts", false);

test("delivers one failure alert, suppresses duplicates, and sends one recovery", async (context) => {
  const paths = await fixture(context);
  const received = [];
  const fetchImpl = async (_url, request) => {
    received.push(JSON.parse(request.body));
    return { ok: true };
  };
  await writeFile(
    paths.statusPath,
    JSON.stringify({
      attemptedAt: "2026-09-15T00:00:00.000Z",
      lastSuccessAt: "2026-09-14T00:00:00.000Z",
      state: "FAILURE",
    }),
  );
  const first = await processBackupAlertOnce({
    fetchImpl,
    now: new Date("2026-09-15T01:00:00.000Z"),
    statePath: paths.statePath,
    statusPath: paths.statusPath,
    url: fakeUrl,
  });
  assert.equal(first.action, "FAILURE_DELIVERED");
  assert.equal(received[0].kind, "BACKUP_UNHEALTHY");
  const duplicate = await processBackupAlertOnce({
    fetchImpl,
    now: new Date("2026-09-15T01:01:00.000Z"),
    statePath: paths.statePath,
    statusPath: paths.statusPath,
    url: fakeUrl,
  });
  assert.equal(duplicate.action, "ALREADY_OPEN");
  assert.equal(received.length, 1);

  await writeFile(
    paths.statusPath,
    JSON.stringify({
      attemptedAt: "2026-09-15T01:02:00.000Z",
      lastSuccessAt: "2026-09-15T01:02:00.000Z",
      state: "SUCCESS",
    }),
  );
  const recovery = await processBackupAlertOnce({
    fetchImpl,
    now: new Date("2026-09-15T01:02:00.000Z"),
    statePath: paths.statePath,
    statusPath: paths.statusPath,
    url: fakeUrl,
  });
  assert.equal(recovery.action, "RECOVERY_DELIVERED");
  assert.equal(received[1].kind, "BACKUP_RECOVERED");
  assert.equal(received[1].status.state, "SUCCESS");
  assert.equal((await readAlertState(paths.statePath)).openIncident, null);
});

test("persists a failed delivery and retries the identical incident without recovery noise", async (context) => {
  const paths = await fixture(context);
  await writeFile(paths.statusPath, JSON.stringify({ lastSuccessAt: null, state: "FAILURE" }));
  const pending = await processBackupAlertOnce({
    fetchImpl: async () => {
      throw new Error("network");
    },
    now: new Date("2026-09-15T01:00:00.000Z"),
    statePath: paths.statePath,
    statusPath: paths.statusPath,
    url: fakeUrl,
  });
  assert.equal(pending.action, "FAILURE_PENDING");
  const firstId = (await readAlertState(paths.statePath)).openIncident.id;
  const received = [];
  const retry = await processBackupAlertOnce({
    fetchImpl: async (_url, request) => {
      received.push(JSON.parse(request.body));
      return { ok: true };
    },
    now: new Date("2026-09-15T01:01:00.000Z"),
    statePath: paths.statePath,
    statusPath: paths.statusPath,
    url: fakeUrl,
  });
  assert.equal(retry.action, "FAILURE_DELIVERED");
  assert.equal(received[0].incidentId, firstId);

  await writeFile(
    paths.statusPath,
    JSON.stringify({ lastSuccessAt: "2026-09-15T01:02:00.000Z", state: "SUCCESS" }),
  );
  await processBackupAlertOnce({
    fetchImpl: async (_url, request) => {
      received.push(JSON.parse(request.body));
      return { ok: true };
    },
    now: new Date("2026-09-15T01:02:00.000Z"),
    statePath: paths.statePath,
    statusPath: paths.statusPath,
    url: fakeUrl,
  });
  assert.equal(received[1].kind, "BACKUP_RECOVERED");
});

test("permits loopback HTTP only outside production and rejects unsafe webhook URLs", () => {
  assert.equal(webhookUrl("https://alerts.example.test/receiver", true).protocol, "https:");
  assert.throws(() => webhookUrl("http://alerts.example.test/receiver", true));
  assert.throws(() => webhookUrl("https://user:pass@alerts.example.test/receiver", true));
  assert.throws(() => webhookUrl("ftp://alerts.example.test/receiver", false));
});

test("posts a redacted backup incident to a real disposable loopback receiver", async (context) => {
  const paths = await fixture(context);
  const received = [];
  const server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      received.push(JSON.parse(body));
      response.writeHead(204).end();
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => new Promise((resolve) => server.close(resolve)));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  await writeFile(paths.statusPath, JSON.stringify({ lastSuccessAt: null, state: "FAILURE" }));
  const result = await processBackupAlertOnce({
    now: new Date("2026-09-15T01:00:00.000Z"),
    statePath: paths.statePath,
    statusPath: paths.statusPath,
    timeoutMs: 1_000,
    url: webhookUrl(`http://127.0.0.1:${String(address.port)}/alerts`, false),
  });
  assert.equal(result.action, "FAILURE_DELIVERED");
  assert.deepEqual(Object.keys(received[0].status).sort(), [
    "attemptedAt",
    "lastSuccessAt",
    "state",
  ]);
  assert.equal(received[0].status.lastSuccessAt, null);
  assert.equal(received[0].kind, "BACKUP_UNHEALTHY");
});
