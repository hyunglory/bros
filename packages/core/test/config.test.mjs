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
      host: "127.0.0.1",
      port: 3000,
    },
    worker: {
      concurrency: 1,
    },
    storage: {
      driver: "local",
      localRoot: "./storage",
    },
  });
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
    API_HOST: "0.0.0.0",
    API_PORT: "8080",
    WORKER_CONCURRENCY: "4",
    STORAGE_DRIVER: "r2",
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
      host: "0.0.0.0",
      port: 8080,
    },
    worker: {
      concurrency: 4,
    },
    storage: {
      driver: "r2",
    },
  });
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
