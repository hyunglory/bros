import { randomUUID } from "node:crypto";
import { URL } from "node:url";
import pg from "pg";

import { createMigrationDatabase } from "../../packages/db/dist/migration-runtime.js";

// Each run owns a newly created database. Never reset or drop the supplied database.
export async function createDatabaseFixture() {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error("TEST_DATABASE_URL is required; database integration tests cannot be skipped");
  }
  let template;
  try {
    template = new URL(process.env.TEST_DATABASE_URL);
    if (!["postgres:", "postgresql:"].includes(template.protocol)) throw new Error();
  } catch {
    throw new Error("TEST_DATABASE_URL must be a PostgreSQL URL");
  }
  const name = `bros_test_${randomUUID().replaceAll("-", "")}`;
  const options = {
    connectionTimeoutMillis: 5_000,
    statement_timeout: 60_000,
    application_name: "bros-db-test",
  };
  const admin = new pg.Client({ ...options, connectionString: template.toString() });
  let created = false;
  let client;
  let db;
  const cleanup = async () => {
    try {
      await client?.end();
      await db?.destroy();
      // The generated identifier never contains user input; only delete after CREATE succeeds.
      if (created) await admin.query(`DROP DATABASE "${name}"`);
    } finally {
      await admin.end();
    }
  };
  try {
    await admin.connect();
    await admin.query(`CREATE DATABASE "${name}" TEMPLATE template0`);
    created = true;
    template.pathname = `/${name}`;
    client = new pg.Pool({ ...options, connectionString: template.toString(), max: 4 });
    const connected = await client.query("SELECT current_database() AS name");
    if (connected.rows[0].name !== name) {
      throw new Error("Test connection did not select the newly created database");
    }
    db = createMigrationDatabase(template.toString());
    return { db, client, cleanup, connectionString: template.toString() };
  } catch {
    await cleanup();
    throw new Error(
      "Disposable test database setup failed; check TEST_DATABASE_URL and CREATEDB permission",
    );
  }
}
