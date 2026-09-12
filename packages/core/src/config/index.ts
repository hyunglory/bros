import { URL } from "node:url";

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
    };

export interface AppConfig {
  environment: AppEnvironment;
  database: {
    url: string;
  };
  api: {
    host: string;
    port: number;
  };
  worker: {
    concurrency: number;
  };
  storage: StorageConfig;
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

export function loadConfig(environment: EnvironmentSource): AppConfig {
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

  validateDatabaseUrl(databaseUrl, issues);

  if (issues.length > 0) {
    throw new ConfigValidationError(issues);
  }

  return {
    environment: appEnvironment,
    database: { url: databaseUrl },
    api: {
      host: apiHost,
      port: apiPort,
    },
    worker: {
      concurrency: workerConcurrency,
    },
    storage:
      storageDriver === "local"
        ? { driver: storageDriver, localRoot: storageLocalRoot ?? "" }
        : { driver: storageDriver },
  };
}

export function loadConfigFromProcess(): AppConfig {
  return loadConfig(process.env);
}
