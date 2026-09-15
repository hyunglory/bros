import { createRedactedLogger } from "../packages/core/dist/index.js";
import { runDatabaseBackup } from "./database-backup-runtime.mjs";

const logger = createRedactedLogger();
try {
  const result = await runDatabaseBackup();
  logger.info(
    {
      code: "DATABASE_BACKUP_COMPLETED",
      objectKey: result.manifest.object.key,
      retentionDeleted: result.retention.deleted,
    },
    "Database backup completed",
  );
} catch {
  logger.error({ code: "DATABASE_BACKUP_FAILED" }, "Database backup failed");
  process.exitCode = 1;
}
