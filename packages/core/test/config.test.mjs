import assert from "node:assert/strict";
import test from "node:test";

import { ConfigValidationError, loadConfig } from "../dist/config/index.js";

test("loads development defaults from a valid environment", () => {
  const config = loadConfig({
    DATABASE_URL: "postgresql://bros:password@localhost:5432/bros",
  });

  assert.deepEqual(config, {
    environment: "development",
    database: {
      url: "postgresql://bros:password@localhost:5432/bros",
      poolMax: 5,
      connectionTimeoutMs: 5000,
      idleTimeoutMs: 30000,
      statementTimeoutMs: 30000,
    },
    api: {
      auth: {
        mode: "local",
        proxyAuthToken: null,
        publicOrigin: "http://127.0.0.1:3000",
      },
      host: "127.0.0.1",
      port: 3000,
      readinessTimeoutMs: 1000,
      shutdownTimeoutMs: 10000,
      localUnauthenticated: false,
    },
    worker: {
      concurrency: 1,
      shutdownTimeoutMs: 15000,
    },
    importer: { chunkSize: 100, concurrency: 2, maxQueuedBatches: 32 },
    storage: {
      driver: "local",
      localRoot: "./storage",
    },
  });
});

test("validates API readiness and shutdown deadline bounds", () => {
  const env = { DATABASE_URL: "postgresql://unused@localhost/unused" };
  assert.equal(loadConfig({ ...env, API_READINESS_TIMEOUT_MS: "250" }).api.readinessTimeoutMs, 250);
  assert.equal(loadConfig({ ...env, API_SHUTDOWN_TIMEOUT_MS: "2000" }).api.shutdownTimeoutMs, 2000);
  for (const [key, invalid] of [
    ["API_READINESS_TIMEOUT_MS", "30001"],
    ["API_SHUTDOWN_TIMEOUT_MS", "300001"],
    ["API_READINESS_TIMEOUT_MS", "0"],
    ["API_SHUTDOWN_TIMEOUT_MS", "secret-marker"],
  ]) {
    assert.throws(
      () => loadConfig({ ...env, [key]: invalid }),
      (error) => {
        assert.ok(error instanceof ConfigValidationError);
        assert.match(error.message, new RegExp(key));
        assert.doesNotMatch(error.message, /secret-marker/);
        return true;
      },
    );
  }
});

test("rejects a missing required database URL", () => {
  assert.throws(
    () => loadConfig({}),
    (error) => {
      assert.ok(error instanceof ConfigValidationError);
      assert.deepEqual(error.issues, ["DATABASE_URL is required"]);
      return true;
    },
  );
});

test("importer chunk, concurrency, and admission budgets are independently configurable", () => {
  const env = { DATABASE_URL: "postgresql://unused@localhost/unused" };
  assert.deepEqual(
    loadConfig({
      ...env,
      IMPORT_CHUNK_SIZE: "25",
      IMPORT_CONCURRENCY: "3",
      IMPORT_MAX_QUEUED_BATCHES: "4",
    }).importer,
    { chunkSize: 25, concurrency: 3, maxQueuedBatches: 4 },
  );
  for (const [key, value] of [
    ["IMPORT_CHUNK_SIZE", "1001"],
    ["IMPORT_CONCURRENCY", "0"],
    ["IMPORT_MAX_QUEUED_BATCHES", "secret-marker"],
  ]) {
    assert.throws(
      () => loadConfig({ ...env, [key]: value }),
      (error) =>
        error instanceof ConfigValidationError &&
        error.message.includes(key) &&
        !error.message.includes("secret-marker"),
    );
  }
});

test("requires explicit production settings", () => {
  assert.throws(
    () =>
      loadConfig({
        APP_ENV: "production",
        DATABASE_URL: "postgresql://bros:password@database:5432/bros",
      }),
    (error) => {
      assert.ok(error instanceof ConfigValidationError);
      assert.deepEqual(error.issues, [
        "API_HOST is required",
        "API_PORT is required",
        "API_PROXY_AUTH_TOKEN is required in production",
        "API_PUBLIC_ORIGIN is required",
        "WORKER_CONCURRENCY is required",
        "STORAGE_DRIVER is required",
        "STORAGE_LOCAL_ROOT is required",
      ]);
      return true;
    },
  );
});

test("loads explicit production settings without development defaults", () => {
  const config = loadConfig({
    APP_ENV: "production",
    DATABASE_URL: "postgresql://bros:password@database:5432/bros",
    API_HOST: "127.0.0.1",
    API_PORT: "8080",
    API_PROXY_AUTH_TOKEN: "01234567890123456789012345678901",
    API_PUBLIC_ORIGIN: "https://admin.example.test",
    WORKER_CONCURRENCY: "4",
    STORAGE_DRIVER: "r2",
    STORAGE_R2_ENDPOINT: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    STORAGE_R2_BUCKET: "private-artifacts",
  });

  assert.deepEqual(config, {
    environment: "production",
    database: {
      url: "postgresql://bros:password@database:5432/bros",
      poolMax: 5,
      connectionTimeoutMs: 5000,
      idleTimeoutMs: 30000,
      statementTimeoutMs: 30000,
    },
    api: {
      auth: {
        mode: "proxy",
        proxyAuthToken: "01234567890123456789012345678901",
        publicOrigin: "https://admin.example.test",
      },
      host: "127.0.0.1",
      port: 8080,
      readinessTimeoutMs: 1000,
      shutdownTimeoutMs: 10000,
      localUnauthenticated: false,
    },
    worker: {
      concurrency: 4,
      shutdownTimeoutMs: 15000,
    },
    importer: { chunkSize: 100, concurrency: 2, maxQueuedBatches: 32 },
    storage: {
      bucket: "private-artifacts",
      driver: "r2",
      endpoint: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    },
  });
});

test("requires a private R2 bucket and HTTPS account S3 API origin", () => {
  const base = {
    DATABASE_URL: "postgresql://localhost/bros",
    STORAGE_DRIVER: "r2",
  };
  assert.throws(
    () => loadConfig(base),
    (error) => {
      assert.ok(error instanceof ConfigValidationError);
      assert.deepEqual(error.issues, [
        "STORAGE_R2_BUCKET is required",
        "STORAGE_R2_ENDPOINT is required",
      ]);
      return true;
    },
  );
  for (const environment of [
    {
      ...base,
      STORAGE_R2_BUCKET: "Private_Artifacts",
      STORAGE_R2_ENDPOINT: "https://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    },
    {
      ...base,
      STORAGE_R2_BUCKET: "private-artifacts",
      STORAGE_R2_ENDPOINT: "http://0123456789abcdef0123456789abcdef.r2.cloudflarestorage.com",
    },
    {
      ...base,
      STORAGE_R2_BUCKET: "private-artifacts",
      STORAGE_R2_ENDPOINT: "https://storage.example.test/custom-domain",
    },
  ]) {
    assert.throws(() => loadConfig(environment), ConfigValidationError);
  }
});

test("does not include an invalid environment value in the error", () => {
  const invalidValue = "postgresql-secret-value";

  assert.throws(
    () =>
      loadConfig({
        DATABASE_URL: invalidValue,
      }),
    (error) => {
      assert.ok(error instanceof ConfigValidationError);
      assert.match(error.message, /DATABASE_URL must be a valid URL/);
      assert.doesNotMatch(error.message, new RegExp(invalidValue));
      return true;
    },
  );
});

test("allows local unauthenticated APIs only with an explicit loopback development setting", () => {
  const base = { DATABASE_URL: "postgresql://localhost/bros" };
  assert.equal(
    loadConfig({ ...base, API_LOCAL_UNAUTHENTICATED: "true" }).api.localUnauthenticated,
    true,
  );
  for (const environment of [
    { ...base, API_HOST: "0.0.0.0", API_LOCAL_UNAUTHENTICATED: "true" },
    {
      ...base,
      APP_ENV: "production",
      API_HOST: "127.0.0.1",
      API_PORT: "3000",
      WORKER_CONCURRENCY: "1",
      STORAGE_DRIVER: "r2",
      API_LOCAL_UNAUTHENTICATED: "true",
    },
    { ...base, API_LOCAL_UNAUTHENTICATED: "yes" },
  ]) {
    assert.throws(() => loadConfig(environment), ConfigValidationError);
  }
});

test("requires a loopback-bound proxy token and a production HTTPS origin", () => {
  const base = {
    DATABASE_URL: "postgresql://localhost/bros",
    API_PROXY_AUTH_TOKEN: "01234567890123456789012345678901",
  };
  assert.equal(loadConfig(base).api.auth.mode, "proxy");
  for (const environment of [
    { ...base, API_HOST: "0.0.0.0" },
    { ...base, API_PROXY_AUTH_TOKEN: "short" },
    {
      ...base,
      APP_ENV: "production",
      API_HOST: "127.0.0.1",
      API_PORT: "3000",
      API_PUBLIC_ORIGIN: "http://admin.example.test",
      WORKER_CONCURRENCY: "1",
      STORAGE_DRIVER: "r2",
    },
  ]) {
    assert.throws(() => loadConfig(environment), ConfigValidationError);
  }
});

test("validates configurable pool and timeout bounds", () => {
  const env = { DATABASE_URL: "postgresql://localhost/bros" };
  const config = loadConfig({
    ...env,
    DB_POOL_MAX: "2",
    DB_CONNECTION_TIMEOUT_MS: "500",
    DB_IDLE_TIMEOUT_MS: "1000",
    DB_STATEMENT_TIMEOUT_MS: "2000",
  });
  assert.equal(config.database.poolMax, 2);
  assert.equal(config.database.connectionTimeoutMs, 500);
  assert.equal(config.database.idleTimeoutMs, 1000);
  assert.equal(config.database.statementTimeoutMs, 2000);
  for (const [key, value] of [
    ["DB_POOL_MAX", "0"],
    ["DB_POOL_MAX", "51"],
    ["DB_CONNECTION_TIMEOUT_MS", "-1"],
    ["DB_IDLE_TIMEOUT_MS", "bad-private-value"],
    ["DB_STATEMENT_TIMEOUT_MS", "0"],
  ]) {
    assert.throws(
      () => loadConfig({ ...env, [key]: value }),
      (error) => {
        assert.ok(error instanceof ConfigValidationError);
        assert.ok(error.issues.some((issue) => issue.startsWith(key)));
        assert.equal(error.message.includes("bad-private-value"), false);
        return true;
      },
    );
  }
});
