import { loadConfigFromProcess } from "../packages/core/dist/index.js";
import { createMigrationDatabase, migrateToLatest } from "../packages/db/dist/migration-runtime.js";

let database;
try {
  const config = loadConfigFromProcess();
  database = createMigrationDatabase(config.database.url);
  await migrateToLatest(database);
  console.log("Database migrations are up to date");
} catch {
  console.error(
    "Database migration failed. Check configuration, connectivity, and migration state.",
  );
  process.exitCode = 1;
} finally {
  await database?.destroy();
}
