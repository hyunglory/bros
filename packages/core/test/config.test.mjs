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
