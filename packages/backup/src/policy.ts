import type { ListedObject } from "@bros/storage";

export const backupPrefix = "database-backup";
export const backupRetentionPolicy = Object.freeze({ daily: 7, monthly: 3, weekly: 4 });
export const maximumBackupAgeMs = 26 * 60 * 60 * 1_000;

const BACKUP_KEY_PATTERN =
  /^database-backup\/(\d{4})\/(0[1-9]|1[0-2])\/([012]\d|3[01])\/(\d{8}T\d{6}Z-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\.(dump\.enc|manifest\.json)$/i;

export function isBackupDataKey(value: string): boolean {
  return BACKUP_KEY_PATTERN.test(value) && value.endsWith(".dump.enc");
}

export function isBackupManifestKey(value: string): boolean {
  return BACKUP_KEY_PATTERN.test(value) && value.endsWith(".manifest.json");
}

export function manifestKeyForDataKey(value: string): string {
  if (!isBackupDataKey(value)) throw new TypeError("Invalid backup object key");
  return value.replace(/\.dump\.enc$/, ".manifest.json");
}

export interface BackupGeneration {
  createdAt: Date;
  dataKey: string;
  manifestKey: string;
  stem: string;
}

function parseObject(object: ListedObject) {
  const match = object.objectKey.match(BACKUP_KEY_PATTERN);
  if (!match) return null;
  const compact = match[4]?.slice(0, 16);
  if (!compact) return null;
  const createdAt = new Date(
    `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}T${compact.slice(9, 11)}:${compact.slice(11, 13)}:${compact.slice(13, 15)}Z`,
  );
  if (Number.isNaN(createdAt.getTime())) return null;
  const expectedPath = `${match[1]}/${match[2]}/${match[3]}`;
  if (createdAt.toISOString().slice(0, 10).replaceAll("-", "/") !== expectedPath) return null;
  return { createdAt, kind: match[5], stem: object.objectKey.slice(0, -`.${match[5]}`.length) };
}

export function listBackupGenerations(objects: readonly ListedObject[]): BackupGeneration[] {
  const pairs = new Map<string, { createdAt: Date; data?: boolean; manifest?: boolean }>();
  for (const object of objects) {
    const parsed = parseObject(object);
    if (!parsed) continue;
    const pair = pairs.get(parsed.stem) ?? { createdAt: parsed.createdAt };
    if (parsed.kind === "dump.enc") pair.data = true;
    else pair.manifest = true;
    pairs.set(parsed.stem, pair);
  }
  return [...pairs]
    .filter(([, pair]) => pair.data && pair.manifest)
    .map(([stem, pair]) => ({
      createdAt: pair.createdAt,
      dataKey: `${stem}.dump.enc`,
      manifestKey: `${stem}.manifest.json`,
      stem,
    }))
    .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime());
}

function isoWeek(date: Date): string {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((value.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${value.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

export function retainedBackupKeys(generations: readonly BackupGeneration[]): Set<string> {
  const sorted = [...generations].sort(
    (left, right) => right.createdAt.getTime() - left.createdAt.getTime(),
  );
  const keep = new Set<string>();
  const take = (keyFor: (date: Date) => string, count: number) => {
    const buckets = new Set<string>();
    for (const generation of sorted) {
      const bucket = keyFor(generation.createdAt);
      if (buckets.has(bucket)) continue;
      buckets.add(bucket);
      keep.add(generation.dataKey);
      keep.add(generation.manifestKey);
      if (buckets.size >= count) break;
    }
  };
  take((date) => date.toISOString().slice(0, 10), backupRetentionPolicy.daily);
  take(isoWeek, backupRetentionPolicy.weekly);
  take((date) => date.toISOString().slice(0, 7), backupRetentionPolicy.monthly);
  return keep;
}

export function staleBackupKeys(objects: readonly ListedObject[], now: Date): readonly string[] {
  const generations = listBackupGenerations(objects);
  const keep = retainedBackupKeys(generations);
  const completeKeys = new Set(generations.flatMap((item) => [item.dataKey, item.manifestKey]));
  return objects.flatMap((object) => {
    const parsed = parseObject(object);
    if (!parsed) return [];
    if (completeKeys.has(object.objectKey))
      return keep.has(object.objectKey) ? [] : [object.objectKey];
    return now.getTime() - object.lastModified.getTime() > maximumBackupAgeMs
      ? [object.objectKey]
      : [];
  });
}

export function nextBackupTime(now: Date, hour = 3, minute = 41): Date {
  if (
    !Number.isInteger(hour) ||
    hour < 0 ||
    hour > 23 ||
    !Number.isInteger(minute) ||
    minute < 0 ||
    minute > 59
  )
    throw new TypeError("Invalid backup schedule");
  const next = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute),
  );
  if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next;
}

export function nextRequiredBackupTime(lastSuccess: Date): Date {
  if (Number.isNaN(lastSuccess.getTime())) throw new TypeError("Invalid last backup time");
  const scheduled = nextBackupTime(lastSuccess);
  const rpoDeadline = new Date(lastSuccess.getTime() + 24 * 60 * 60 * 1_000);
  return scheduled < rpoDeadline ? scheduled : rpoDeadline;
}

export function backupDue(lastSuccess: Date | null, now: Date): boolean {
  if (Number.isNaN(now.getTime())) throw new TypeError("Invalid current backup time");
  return (
    lastSuccess === null ||
    Number.isNaN(lastSuccess.getTime()) ||
    now >= nextRequiredBackupTime(lastSuccess)
  );
}

export function backupHealth(status: unknown, now: Date): "HEALTHY" | "UNHEALTHY" {
  if (
    typeof status !== "object" ||
    status === null ||
    !("state" in status) ||
    !("lastSuccessAt" in status)
  )
    return "UNHEALTHY";
  if (status.state !== "RUNNING" && status.state !== "SUCCESS") return "UNHEALTHY";
  if (typeof status.lastSuccessAt !== "string") return "UNHEALTHY";
  const lastSuccess = new Date(status.lastSuccessAt);
  return !Number.isNaN(lastSuccess.getTime()) &&
    now.getTime() - lastSuccess.getTime() <= maximumBackupAgeMs
    ? "HEALTHY"
    : "UNHEALTHY";
}
