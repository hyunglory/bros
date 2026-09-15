import { createHash, randomUUID } from "node:crypto";
import { Buffer } from "node:buffer";
import { lstat, mkdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { clearTimeout, setTimeout } from "node:timers";
import { URL } from "node:url";
import { readSecretFile } from "../packages/core/dist/index.js";
import { backupStatusPath, currentBackupHealth } from "./database-backup-runtime.mjs";

export const backupAlertStatePath =
  process.env.BACKUP_ALERT_STATE_PATH ?? "/var/lib/bros-backup-alert/state.json";

const MAX_STATE_BYTES = 16_384;

function stableError() {
  return new Error("Backup alert delivery failed");
}

function isLoopback(hostname) {
  return hostname === "127.0.0.1" || hostname === "::1" || hostname === "localhost";
}

export function webhookUrl(
  value,
  production = process.env.APP_ENV === "production",
  allowInsecureTestNetwork = process.env.APP_ENV === "test",
) {
  try {
    const url = new URL(value);
    if (
      !url.hostname ||
      url.username ||
      url.password ||
      url.hash ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          !production &&
          (isLoopback(url.hostname) || allowInsecureTestNetwork)
        ))
    )
      throw new Error();
    return url;
  } catch {
    throw stableError();
  }
}

export function backupAlertWebhookUrl() {
  const path = process.env.BACKUP_ALERT_WEBHOOK_URL_FILE;
  if (!path || (process.env.APP_ENV === "production" && process.env.BACKUP_ALERT_WEBHOOK_URL))
    throw stableError();
  try {
    return webhookUrl(readSecretFile(path, process.env.APP_ENV === "production"));
  } catch {
    throw stableError();
  }
}

export function alertReason(status, now) {
  if (status?.state === "FAILURE") return "DATABASE_BACKUP_FAILED";
  if (!status || typeof status.lastSuccessAt !== "string") return "DATABASE_BACKUP_STATUS_MISSING";
  const lastSuccess = new Date(status.lastSuccessAt);
  if (Number.isNaN(lastSuccess.getTime()) || lastSuccess > now)
    return "DATABASE_BACKUP_STATUS_INVALID";
  return "DATABASE_BACKUP_STALE";
}

export async function readAlertState(path = backupAlertStatePath) {
  try {
    const body = await readFile(path, "utf8");
    if (Buffer.byteLength(body) > MAX_STATE_BYTES) return { openIncident: null, schemaVersion: 1 };
    const parsed = JSON.parse(body);
    if (
      parsed?.schemaVersion !== 1 ||
      (parsed.openIncident !== null &&
        (typeof parsed.openIncident !== "object" ||
          typeof parsed.openIncident.id !== "string" ||
          typeof parsed.openIncident.delivered !== "boolean"))
    )
      return { openIncident: null, schemaVersion: 1 };
    return parsed;
  } catch {
    return { openIncident: null, schemaVersion: 1 };
  }
}

export async function writeAlertState(state, path = backupAlertStatePath) {
  const directoryPath = dirname(path);
  await mkdir(directoryPath, { recursive: true, mode: 0o700 });
  const directory = await lstat(directoryPath);
  const uid = typeof process.getuid === "function" ? process.getuid() : undefined;
  if (
    !directory.isDirectory() ||
    directory.isSymbolicLink() ||
    (process.env.APP_ENV === "production" &&
      ((directory.mode & 0o077) !== 0 || (uid !== undefined && directory.uid !== uid)))
  )
    throw stableError();
  const temporary = join(directoryPath, `.${basename(path)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, `${JSON.stringify(state)}\n`, { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}

function statusSummary(status) {
  return {
    attemptedAt: typeof status?.attemptedAt === "string" ? status.attemptedAt : null,
    lastSuccessAt: typeof status?.lastSuccessAt === "string" ? status.lastSuccessAt : null,
    state: ["FAILURE", "SUCCESS"].includes(status?.state) ? status.state : "UNKNOWN",
  };
}

function payload(kind, incident, status, now) {
  return {
    eventId: `${incident.id}:${kind}`,
    incidentId: incident.id,
    kind,
    observedAt: now.toISOString(),
    reason: incident.reason,
    schemaVersion: 1,
    status: statusSummary(status),
  };
}

async function postWebhook(url, body, fetchImpl, timeoutMs) {
  const controller = new globalThis.AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
      redirect: "error",
      signal: controller.signal,
    });
    if (!response?.ok) throw new Error();
  } catch {
    throw stableError();
  } finally {
    clearTimeout(timer);
  }
}

export async function processBackupAlertOnce(options = {}) {
  const now = options.now ?? new Date();
  const statusPath = options.statusPath ?? backupStatusPath;
  const statePath = options.statePath ?? backupAlertStatePath;
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 5_000;
  const url = options.url ?? backupAlertWebhookUrl();
  if (
    !(url instanceof URL) ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1_000 ||
    timeoutMs > 30_000
  )
    throw stableError();
  let status = null;
  try {
    const body = await readFile(statusPath, "utf8");
    if (Buffer.byteLength(body) <= MAX_STATE_BYTES) status = JSON.parse(body);
  } catch {
    status = null;
  }
  const health = currentBackupHealth(status, now);
  const state = await readAlertState(statePath);
  if (health === "UNHEALTHY") {
    const incident = state.openIncident ?? {
      detectedAt: now.toISOString(),
      delivered: false,
      id: createHash("sha256")
        .update(`${now.toISOString()}-${randomUUID()}`)
        .digest("hex")
        .slice(0, 24),
      reason: alertReason(status, now),
    };
    if (!state.openIncident) {
      state.openIncident = incident;
      await writeAlertState(state, statePath);
    }
    if (incident.delivered) return { action: "ALREADY_OPEN", health };
    try {
      await postWebhook(
        url,
        payload("BACKUP_UNHEALTHY", incident, status, now),
        fetchImpl,
        timeoutMs,
      );
      state.openIncident = { ...incident, delivered: true };
      await writeAlertState(state, statePath);
      return { action: "FAILURE_DELIVERED", health };
    } catch {
      return { action: "FAILURE_PENDING", health };
    }
  }
  if (!state.openIncident) return { action: "HEALTHY", health };
  if (!state.openIncident.delivered) {
    await writeAlertState({ openIncident: null, schemaVersion: 1 }, statePath);
    return { action: "RECOVERY_WITHOUT_DELIVERY", health };
  }
  try {
    await postWebhook(
      url,
      payload("BACKUP_RECOVERED", state.openIncident, status, now),
      fetchImpl,
      timeoutMs,
    );
    await writeAlertState({ openIncident: null, schemaVersion: 1 }, statePath);
    return { action: "RECOVERY_DELIVERED", health };
  } catch {
    return { action: "RECOVERY_PENDING", health };
  }
}
