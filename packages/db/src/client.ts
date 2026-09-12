import { Kysely, PostgresDialect } from "kysely";
import type { Transaction } from "kysely";
import pg from "pg";
import { createRedactedLogger } from "@bros/core";
import type { DatabaseConfig } from "@bros/core";

import type { Database } from "./schema.js";

export type DbExecutor = Kysely<Database> | Transaction<Database>;
export type DbTransaction = Transaction<Database>;

export function withTransaction<T>(
  db: Kysely<Database>,
  work: (transaction: DbTransaction) => Promise<T>,
): Promise<T> {
  if (db.isTransaction) {
    throw new Error(
      "Nested transactions are not supported; pass the existing transaction to repositories",
    );
  }
  // No automatic retry: the callback may include a non-repeatable side effect.
  return db.transaction().execute(work);
}

export function createDatabaseClient(
  config: DatabaseConfig,
  options: { applicationName: "bros-api" | "bros-worker" | "bros-test" },
) {
  const logger = createRedactedLogger();
  const pool = new pg.Pool({
    connectionString: config.url,
    max: config.poolMax,
    connectionTimeoutMillis: config.connectionTimeoutMs,
    idleTimeoutMillis: config.idleTimeoutMs,
    statement_timeout: config.statementTimeoutMs,
    application_name: options.applicationName,
  });
  // A socket failure while checked out can emit on Client as well as reject its query.
  // Pool only installs its own error listener while a connection is idle.
  pool.on("connect", (client) => {
    client.on("error", () =>
      logger.error({ code: "DB_CONNECTION_ERROR" }, "Database connection failed"),
    );
  });
  // pg emits idle-connection errors outside a query promise. Consume them without raw DSNs/SQL.
  pool.on("error", () =>
    logger.error({ code: "DB_IDLE_CONNECTION_ERROR" }, "Database idle connection failed"),
  );
  const db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
  let closing: Promise<void> | undefined;
  return {
    db,
    transaction: <T>(work: (transaction: DbTransaction) => Promise<T>) => withTransaction(db, work),
    close: () => (closing ??= db.destroy()),
    poolStats: () => ({ total: pool.totalCount, idle: pool.idleCount, waiting: pool.waitingCount }),
  };
}

export type DatabaseClient = ReturnType<typeof createDatabaseClient>;
