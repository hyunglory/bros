import { Kysely, PostgresDialect } from "kysely";
import { Migrator } from "kysely/migration";
import pg from "pg";

import * as baseline from "./migrations/001-baseline.js";
import * as identifierCompat from "./migrations/002-identifier-compat-index.js";
import * as resolverOrchestration from "./migrations/003-resolver-orchestration.js";
import * as providerQuota from "./migrations/004-provider-quota.js";

// Migration-only connection. Runtime repositories and pooling belong to P1-06.
export function createMigrationDatabase(connectionString: string): Kysely<unknown> {
  return new Kysely<unknown>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        connectionString,
        max: 2,
        connectionTimeoutMillis: 5_000,
        idleTimeoutMillis: 5_000,
        statement_timeout: 60_000,
        application_name: "bros-migration",
      }),
    }),
  });
}

export function createMigrator(db: Kysely<unknown>): Migrator {
  return new Migrator({
    db,
    migrationTableSchema: "bros_migrations",
    provider: {
      getMigrations: async () => ({
        "001-baseline": baseline,
        "002-identifier-compat-index": identifierCompat,
        "003-resolver-orchestration": resolverOrchestration,
        "004-provider-quota": providerQuota,
      }),
    },
  });
}

export async function migrateToLatest(db: Kysely<unknown>): Promise<void> {
  const result = await createMigrator(db).migrateToLatest();
  if (result.error) {
    // Driver errors may contain row values, SQL, and credentials. Do not propagate them.
    throw new Error("Database migration failed; inspect the schema with an authorized operator");
  }
}
