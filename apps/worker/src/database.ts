import type { DatabaseConfig } from "@bros/core";
import { createDatabaseClient, createPlatformRepository } from "@bros/db";

export function createWorkerDataAccess(config: DatabaseConfig) {
  const database = createDatabaseClient(config, { applicationName: "bros-worker" });
  return { database, platforms: createPlatformRepository(database.db) };
}
