import { URL } from "node:url";
import { readRuntimeSecret } from "../security/secret-files.js";

export const appEnvironments = ["development", "test", "production"] as const;
export const storageDrivers = ["local", "r2"] as const;

export type AppEnvironment = (typeof appEnvironments)[number];
export type StorageDriver = (typeof storageDrivers)[number];
export type EnvironmentSource = Readonly<Record<string, string | undefined>>;

export type StorageConfig =
  | {
      driver: "local";
      localRoot: string;
    }
  | {
      driver: "r2";
      bucket: string;
      endpoint: string;
    };

export interface DatabaseConfig {
  url: string;
  poolMax: number;
  connectionTimeoutMs: number;
  idleTimeoutMs: number;
  statementTimeoutMs: number;
}

export interface AppConfig {
  environment: AppEnvironment;
  database: DatabaseConfig;
  api: {
    auth: {
      mode: "local" | "proxy";
      proxyAuthToken: string | null;
      publicOrigin: string;
    };
    host: string;
    port: number;
    readinessTimeoutMs: number;
    shutdownTimeoutMs: number;
    localUnauthenticated: boolean;
  };
  worker: {
    concurrency: number;
    shutdownTimeoutMs: number;
  };
  importer: { chunkSize: number; concurrency: number; maxQueuedBatches: number };
  storage: StorageConfig;
}

function readBoolean(
  environment: EnvironmentSource,
  key: string,
  issues: string[],
  defaultValue = false,
): boolean {
  const rawValue = environment[key]?.trim().toLowerCase();
  if (rawValue === undefined || rawValue === "") return defaultValue;
  if (rawValue === "true") return true;
  if (rawValue === "false") return false;
  issues.push(`${key} must be true or false`);
  return defaultValue;
}

export class ConfigValidationError extends Error {
  readonly issues: readonly string[];

  constructor(issues: readonly string[]) {
    super(`Invalid configuration: ${issues.join("; ")}`);
    this.name = "ConfigValidationError";
    this.issues = [...issues];
  }
}

function readText(
  environment: EnvironmentSource,
  key: string,
  issues: string[],
  options: {
    defaultValue?: string | undefined;
    required?: boolean | undefined;
  } = {},
): string {
  const value = environment[key]?.trim();

  if (value) {
    return value;
  }

  if (options.defaultValue !== undefined) {
    return options.defaultValue;
  }

  if (options.required) {
    issues.push(`${key} is required`);
  }

  return "";
}

function readChoice<const T extends readonly [string, ...string[]]>(
  environment: EnvironmentSource,
  key: string,
  choices: T,
  issues: string[],
  options: {
    defaultValue?: T[number] | undefined;
    required?: boolean | undefined;
  } = {},
): T[number] {
  const value = readText(environment, key, issues, options);

  if ((choices as readonly string[]).includes(value)) {
    return value as T[number];
  }

  if (value) {
    issues.push(`${key} must be one of: ${choices.join(", ")}`);
  }

  return options.defaultValue ?? choices[0];
}

function readInteger(
  environment: EnvironmentSource,
  key: string,
  issues: string[],
  options: {
    defaultValue?: number | undefined;
    maximum: number;
    minimum: number;
    required?: boolean | undefined;
  },
): number {
  const rawValue = readText(environment, key, issues, {
    defaultValue: options.defaultValue?.toString(),
    required: options.required,
  });
  const value = Number(rawValue);

  if (!Number.isInteger(value) || value < options.minimum || value > options.maximum) {
    if (rawValue) {
      issues.push(`${key} must be an integer between ${options.minimum} and ${options.maximum}`);
    }

    return options.defaultValue ?? options.minimum;
  }

  return value;
}

function validateDatabaseUrl(databaseUrl: string, issues: string[]): void {
  if (!databaseUrl) {
    return;
  }

  try {
    const parsedUrl = new URL(databaseUrl);
    if (parsedUrl.protocol !== "postgres:" && parsedUrl.protocol !== "postgresql:") {
      issues.push("DATABASE_URL must use the postgres or postgresql protocol");
    }
  } catch {
    issues.push("DATABASE_URL must be a valid URL");
  }
}

function isLoopbackHost(host: string): boolean {
  return ["127.0.0.1", "::1", "localhost"].includes(host.toLowerCase());
}

function readPublicOrigin(
  environment: EnvironmentSource,
  apiHost: string,
  apiPort: number,
  production: boolean,
  issues: string[],
): string {
  const configured = readText(environment, "API_PUBLIC_ORIGIN", issues, {
    defaultValue: production ? undefined : `http://${apiHost}:${apiPort}`,
    required: production,
  });
  try {
    const parsed = new URL(configured);
    if (parsed.origin !== configured || parsed.pathname !== "/" || parsed.search || parsed.hash) {
      throw new Error();
    }
    if (production && parsed.protocol !== "https:") throw new Error();
    return parsed.origin;
  } catch {
    if (configured) issues.push("API_PUBLIC_ORIGIN must be an origin without a path");
    return "";
  }
}

function readR2Endpoint(environment: EnvironmentSource, issues: string[]): string {
  const configured = readText(environment, "STORAGE_R2_ENDPOINT", issues, { required: true });
  if (!configured) return "";
  try {
    const parsed = new URL(configured);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      !parsed.hostname.endsWith(".r2.cloudflarestorage.com")
    ) {
      throw new Error();
    }
    return parsed.origin;
  } catch {
    issues.push("STORAGE_R2_ENDPOINT must be an HTTPS Cloudflare R2 S3 API origin");
    return "";
  }
}

function readR2Bucket(environment: EnvironmentSource, issues: string[]): string {
  const bucket = readText(environment, "STORAGE_R2_BUCKET", issues, { required: true });
  if (!bucket) return "";
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket) || bucket.includes("..")) {
    issues.push("STORAGE_R2_BUCKET must be a valid private R2 bucket name");
    return "";
  }
  return bucket;
}

export function loadConfig(
  environment: EnvironmentSource,
  role: "api" | "worker" = "api",
): AppConfig {
  const issues: string[] = [];
  const appEnvironment = readChoice(environment, "APP_ENV", appEnvironments, issues, {
    defaultValue: "development",
  });
  const production = appEnvironment === "production";
  const databaseUrl = readText(environment, "DATABASE_URL", issues, {
    required: true,
  });
  const apiHost = readText(environment, "API_HOST", issues, {
    defaultValue: production ? undefined : "127.0.0.1",
    required: production,
  });
  const apiPort = readInteger(environment, "API_PORT", issues, {
    defaultValue: production ? undefined : 3000,
    maximum: 65_535,
    minimum: 1,
    required: production,
  });
  const localUnauthenticated = readBoolean(environment, "API_LOCAL_UNAUTHENTICATED", issues);
  if (localUnauthenticated && (production || !isLoopbackHost(apiHost))) {
    issues.push("API_LOCAL_UNAUTHENTICATED requires a non-production loopback API_HOST");
  }
  const proxyAuthToken = readText(environment, "API_PROXY_AUTH_TOKEN", issues);
  const proxyMode = proxyAuthToken !== "";
  if (proxyMode && (proxyAuthToken.length < 32 || proxyAuthToken.length > 256)) {
    issues.push("API_PROXY_AUTH_TOKEN must be between 32 and 256 characters");
  }
  if (proxyMode && !isLoopbackHost(apiHost)) {
    issues.push("API proxy authentication requires a loopback API_HOST");
  }
  if (production && role === "api" && !proxyMode) {
    issues.push("API_PROXY_AUTH_TOKEN is required in production");
  }
  if (proxyMode && localUnauthenticated) {
    issues.push("API_LOCAL_UNAUTHENTICATED cannot be combined with API_PROXY_AUTH_TOKEN");
  }
  const publicOrigin = readPublicOrigin(environment, apiHost, apiPort, production, issues);
  const workerConcurrency = readInteger(environment, "WORKER_CONCURRENCY", issues, {
    defaultValue: production ? undefined : 1,
    maximum: 100,
    minimum: 1,
    required: production,
  });
  const storageDriver = readChoice(environment, "STORAGE_DRIVER", storageDrivers, issues, {
    defaultValue: production ? undefined : "local",
    required: production,
  });
  const storageLocalRoot =
    storageDriver === "local"
      ? readText(environment, "STORAGE_LOCAL_ROOT", issues, {
          defaultValue: production ? undefined : "./storage",
          required: production,
        })
      : undefined;
  const storageR2 =
    storageDriver === "r2"
      ? {
          bucket: readR2Bucket(environment, issues),
          endpoint: readR2Endpoint(environment, issues),
        }
      : undefined;

  validateDatabaseUrl(databaseUrl, issues);
  const database: DatabaseConfig = {
    url: databaseUrl,
    poolMax: readInteger(environment, "DB_POOL_MAX", issues, {
      defaultValue: 5,
      minimum: 1,
      maximum: 50,
    }),
    connectionTimeoutMs: readInteger(environment, "DB_CONNECTION_TIMEOUT_MS", issues, {
      defaultValue: 5_000,
      minimum: 1,
      maximum: 300_000,
    }),
    idleTimeoutMs: readInteger(environment, "DB_IDLE_TIMEOUT_MS", issues, {
      defaultValue: 30_000,
      minimum: 1,
      maximum: 300_000,
    }),
    statementTimeoutMs: readInteger(environment, "DB_STATEMENT_TIMEOUT_MS", issues, {
      defaultValue: 30_000,
      minimum: 1,
      maximum: 300_000,
    }),
  };

  const readinessTimeoutMs = readInteger(environment, "API_READINESS_TIMEOUT_MS", issues, {
    defaultValue: 1000,
    minimum: 1,
    maximum: 30000,
  });
  const shutdownTimeoutMs = readInteger(environment, "API_SHUTDOWN_TIMEOUT_MS", issues, {
    defaultValue: 10000,
    minimum: 1,
    maximum: 300000,
  });
  const workerShutdownTimeoutMs = readInteger(environment, "WORKER_SHUTDOWN_TIMEOUT_MS", issues, {
    defaultValue: 15000,
    minimum: 1000,
    maximum: 300000,
  });
  const importer = {
    chunkSize: readInteger(environment, "IMPORT_CHUNK_SIZE", issues, {
      defaultValue: 100,
      minimum: 1,
      maximum: 1000,
    }),
    concurrency: readInteger(environment, "IMPORT_CONCURRENCY", issues, {
      defaultValue: 2,
      minimum: 1,
      maximum: 16,
    }),
    maxQueuedBatches: readInteger(environment, "IMPORT_MAX_QUEUED_BATCHES", issues, {
      defaultValue: 32,
      minimum: 1,
      maximum: 1000,
    }),
  };
  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }

  return {
    environment: appEnvironment,
    database,
    api: {
      auth: {
        mode: proxyMode ? "proxy" : "local",
        proxyAuthToken: proxyMode ? proxyAuthToken : null,
        publicOrigin,
      },
      host: apiHost,
      port: apiPort,
      readinessTimeoutMs,
      shutdownTimeoutMs,
      localUnauthenticated,
    },
    worker: {
      concurrency: workerConcurrency,
      shutdownTimeoutMs: workerShutdownTimeoutMs,
    },
    importer,
    storage:
      storageDriver === "local"
        ? { driver: storageDriver, localRoot: storageLocalRoot ?? "" }
        : { driver: storageDriver, ...(storageR2 ?? { bucket: "", endpoint: "" }) },
  };
}

export function loadConfigFromProcess(role: "api" | "worker" = "api"): AppConfig {
  return loadConfig(
    {
      ...process.env,
      DATABASE_URL: readRuntimeSecret(process.env, "DATABASE_URL"),
      API_PROXY_AUTH_TOKEN:
        role === "api" ? readRuntimeSecret(process.env, "API_PROXY_AUTH_TOKEN") : undefined,
    },
    role,
  );
}
