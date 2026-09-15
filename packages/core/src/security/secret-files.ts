import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { EnvironmentSource } from "../config/index.js";

export class SecretFileError extends Error {
  constructor() {
    super("Secret file configuration is unsafe or unavailable");
    this.name = "SecretFileError";
  }
}

// Compose file secrets are bind mounts: enforce host permissions, not YAML mode hints.
export function readSecretFile(path: string, production = false): string {
  let fd: number | undefined;
  try {
    if (!isAbsolute(path) || (production && process.platform !== "linux")) throw new Error();
    let parent = dirname(resolve(path));
    while (true) {
      const info = lstatSync(parent);
      if (!info.isDirectory() || info.isSymbolicLink()) throw new Error();
      if (process.platform !== "win32") {
        if (info.uid !== 0 && info.uid !== process.getuid?.()) throw new Error();
        // /tmp may be an ancestor, but never the immediate secret directory.
        const trustedSticky =
          parent !== dirname(resolve(path)) && info.uid === 0 && (info.mode & 0o1000) !== 0;
        if ((info.mode & 0o022) !== 0 && !trustedSticky) throw new Error();
      }
      const next = dirname(parent);
      if (next === parent) break;
      parent = next;
    }
    if (lstatSync(path).isSymbolicLink()) throw new Error();
    fd = openSync(
      path,
      constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0),
    );
    const info = fstatSync(fd);
    if (!info.isFile() || info.nlink !== 1 || info.size < 1 || info.size > 65_536)
      throw new Error();
    if (
      process.platform !== "win32" &&
      ((info.mode & 0o077) !== 0 || (info.uid !== 0 && info.uid !== process.getuid?.()))
    )
      throw new Error();
    const value = readFileSync(fd, "utf8").replace(/\r?\n$/, "");
    if (!value || value.includes("\0") || Buffer.byteLength(value) > 65_536) throw new Error();
    return value;
  } catch {
    throw new SecretFileError();
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}

export function assertProductionSecretEnvironment(environment: EnvironmentSource): void {
  if (environment.APP_ENV !== "production") return;
  if (environment.DEBUG || environment.PWDEBUG || environment.NODE_OPTIONS)
    throw new SecretFileError();
  for (const [key, value] of Object.entries(environment)) {
    if (
      value &&
      !key.endsWith("_FILE") &&
      (/^BROS_SECRET_/.test(key) ||
        /^(DATABASE_URL|API_PROXY_AUTH_TOKEN|BROS_PROXY_AUTH_TOKEN|POSTGRES_PASSWORD|BACKUP_ENCRYPTION_KEY|BACKUP_ALERT_WEBHOOK_URL|BROS_ADMIN_PASSWORD_HASH|BROS_STAGING_ADMIN_PASSWORD)$/.test(
          key,
        ))
    ) {
      throw new SecretFileError();
    }
  }
}

export function readRuntimeSecret(environment: EnvironmentSource, key: string): string | undefined {
  assertProductionSecretEnvironment(environment);
  const path = environment[`${key}_FILE`];
  if (path && environment[key]) throw new SecretFileError();
  return path ? readSecretFile(path, environment.APP_ENV === "production") : environment[key];
}
