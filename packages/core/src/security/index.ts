import pino from "pino";
import type { DestinationStream, Logger, LoggerOptions } from "pino";

import type { EnvironmentSource } from "../config/index.js";
import { assertProductionSecretEnvironment, readRuntimeSecret } from "./secret-files.js";
export * from "./secret-files.js";

export type R2SecretKey = "storage.r2.accessKeyId" | "storage.r2.secretAccessKey";
export type ProviderSecretKey = `provider.${string}.apiKey`;
export type BrowserSecretKey =
  `browser.profile.${string}.${"username" | "password" | "otpSeed" | "cookie" | "accessToken"}`;
export type SecretKey = R2SecretKey | ProviderSecretKey | BrowserSecretKey;

const secretKeyPattern =
  /^(?:storage\.r2\.(?:accessKeyId|secretAccessKey)|provider\.[a-z][a-z0-9]{0,31}\.apiKey|browser\.profile\.[a-z][a-z0-9]{0,31}\.(?:username|password|otpSeed|cookie|accessToken))$/;

export interface SecretProvider {
  get(secretKey: SecretKey): Promise<string | undefined>;
}

export class SecretNotFoundError extends Error {
  readonly secretKey: SecretKey;

  constructor(secretKey: SecretKey) {
    super(`Required secret is missing: ${secretKey}`);
    this.name = "SecretNotFoundError";
    this.secretKey = secretKey;
  }
}

export function assertSecretKey(secretKey: string): asserts secretKey is SecretKey {
  if (!secretKeyPattern.test(secretKey)) {
    throw new TypeError("Secret key does not follow the approved naming convention");
  }
}

export function secretKeyToEnvironmentVariable(secretKey: SecretKey): string {
  assertSecretKey(secretKey);

  const suffix = secretKey
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replaceAll(".", "_")
    .toUpperCase();

  return `BROS_SECRET_${suffix}`;
}

export function createBrowserSecretKeys(profileKey: string): Readonly<{
  accessToken: BrowserSecretKey;
  cookie: BrowserSecretKey;
  otpSeed: BrowserSecretKey;
  password: BrowserSecretKey;
  username: BrowserSecretKey;
}> {
  const keys = {
    accessToken: `browser.profile.${profileKey}.accessToken`,
    cookie: `browser.profile.${profileKey}.cookie`,
    otpSeed: `browser.profile.${profileKey}.otpSeed`,
    password: `browser.profile.${profileKey}.password`,
    username: `browser.profile.${profileKey}.username`,
  } as const;

  for (const secretKey of Object.values(keys)) {
    assertSecretKey(secretKey);
  }

  return keys;
}

export class EnvSecretProvider implements SecretProvider {
  constructor(private readonly environment: EnvironmentSource) {}

  async get(secretKey: SecretKey): Promise<string | undefined> {
    assertProductionSecretEnvironment(this.environment);
    const environmentVariable = secretKeyToEnvironmentVariable(secretKey);
    const value = this.environment[environmentVariable]?.trim();
    return value || undefined;
  }
}

export class FileSecretProvider implements SecretProvider {
  constructor(private readonly environment: EnvironmentSource) {
    assertProductionSecretEnvironment(environment);
  }

  async get(secretKey: SecretKey): Promise<string | undefined> {
    const value = readRuntimeSecret(this.environment, secretKeyToEnvironmentVariable(secretKey));
    return value || undefined;
  }
}

export function createSecretProvider(environment: EnvironmentSource = process.env): SecretProvider {
  return new FileSecretProvider(environment);
}

export async function requireSecret(
  provider: SecretProvider,
  secretKey: SecretKey,
): Promise<string> {
  const value = await provider.get(secretKey);
  if (value === undefined) {
    throw new SecretNotFoundError(secretKey);
  }

  return value;
}

export const secretRedactionCensor = "[REDACTED]";

export const secretRedactionPaths = [
  "password",
  "secret",
  "token",
  "accessToken",
  "refreshToken",
  "apiKey",
  "cookie",
  "authorization",
  "url",
  "credentials",
  "database.url",
  "config.database.url",
  "req.url",
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['set-cookie']",
  "res.headers['set-cookie']",
  "*.password",
  "*.secret",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.apiKey",
  "*.cookie",
  "*.authorization",
  "*.*.password",
  "*.*.secret",
  "*.*.token",
  "*.*.accessToken",
  "*.*.refreshToken",
  "*.*.apiKey",
  "*.*.cookie",
  "*.*.authorization",
] as const;

export function maskSensitiveText(value: string): string {
  return value
    .replace(/\b(?:set-cookie|cookie|authorization)\s*[:=][^\r\n]*/gi, secretRedactionCensor)
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, `$1 ${secretRedactionCensor}`)
    .replace(
      /([?&](?:access_token|api_key|key|signature|token|x-amz-signature|x-amz-credential|x-amz-security-token)=)[^&#\s]*/gi,
      `$1${secretRedactionCensor}`,
    )
    .replace(
      /\b(password|secret|signature|x-amz-signature|token|access[_-]?token|api[_-]?key|cookie)\s*[:=]\s*(?:"[^"\r\n]*"|'[^'\r\n]*'|[^\r\n]*)/gi,
      `$1=${secretRedactionCensor}`,
    )
    .replace(/:\/\/([^:/@\s]+):([^@\s]+)@/g, `://$1:${secretRedactionCensor}@`);
}

export function isSensitiveField(key: string): boolean {
  return /(?:password|secret|token|cookie|cookies|authorization|credential|credentials|apikey|accesskey|accesskeyid|otpseed|signature|url)$/i.test(
    key.replaceAll(/[^a-z0-9]/gi, ""),
  );
}

function sanitizeLog(value: unknown, seen = new Set<object>(), depth = 0): unknown {
  if (typeof value === "string") return maskSensitiveText(value);
  if (typeof value !== "object" || value === null) return value;
  if (depth > 10 || seen.has(value)) return "[TRUNCATED]";
  if (value instanceof Error) return serializeError(value);
  seen.add(value);
  try {
    if (Array.isArray(value))
      return value.slice(0, 100).map((entry) => sanitizeLog(entry, seen, depth + 1));
    const safe: Record<string, unknown> = {};
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(value)).slice(
      0,
      100,
    )) {
      if (descriptor.enumerable)
        Object.defineProperty(safe, key, {
          enumerable: true,
          value:
            isSensitiveField(key) || !Object.hasOwn(descriptor, "value")
              ? secretRedactionCensor
              : sanitizeLog(descriptor.value, seen, depth + 1),
        });
    }
    return safe;
  } finally {
    seen.delete(value);
  }
}

function serializeError(error: unknown): Record<string, unknown> {
  if (!(error instanceof Error)) {
    return { message: "Non-Error value thrown" };
  }

  return {
    type: error.name,
    message: maskSensitiveText(error.message),
    ...(error.stack === undefined ? {} : { stack: maskSensitiveText(error.stack) }),
  };
}

export function createRedactedLogger(destination?: DestinationStream): Logger {
  const options: LoggerOptions = {
    hooks: {
      logMethod(inputArguments, method) {
        const safeArguments = inputArguments.map((argument) =>
          sanitizeLog(argument),
        ) as typeof inputArguments;
        const firstArgument = inputArguments[0];

        if (
          typeof firstArgument === "object" &&
          firstArgument !== null &&
          "err" in firstArgument &&
          firstArgument.err instanceof Error &&
          !safeArguments.some((argument) => typeof argument === "string")
        ) {
          safeArguments.push(maskSensitiveText(firstArgument.err.message));
        }

        return method.apply(this, safeArguments);
      },
    },
    redact: {
      paths: [...secretRedactionPaths],
      censor: secretRedactionCensor,
    },
    serializers: {
      err: serializeError,
    },
  };

  return destination === undefined ? pino(options) : pino(options, destination);
}
