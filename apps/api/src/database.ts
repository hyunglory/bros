import type { DatabaseConfig } from "@bros/core";
import { createDatabaseClient, createPlatformRepository } from "@bros/db";

export function createApiDataAccess(config: DatabaseConfig) {
  const database = createDatabaseClient(config, { applicationName: "bros-api" });
  return { database, platforms: createPlatformRepository(database.db) };
}
