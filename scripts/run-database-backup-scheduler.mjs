import { clearTimeout, setTimeout } from "node:timers";
import { createRedactedLogger } from "../packages/core/dist/index.js";
import { backupDue, nextRequiredBackupTime } from "../packages/backup/dist/index.js";
import { readBackupStatus, runDatabaseBackup } from "./database-backup-runtime.mjs";

const logger = createRedactedLogger();
const retryMs = 15 * 60 * 1_000;
let stopping = false;
let wake;
const stop = () => {
  stopping = true;
  wake?.();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
process.umask(0o077);

while (!stopping) {
  const now = new Date();
  const status = await readBackupStatus();
  const lastSuccess =
    typeof status?.lastSuccessAt === "string" ? new Date(status.lastSuccessAt) : null;
  const due = backupDue(lastSuccess, now);
  let waitMs;
  if (due) {
    try {
      const result = await runDatabaseBackup(now);
      logger.info(
        { code: "DATABASE_BACKUP_COMPLETED", objectKey: result.manifest.object.key },
        "Scheduled database backup completed",
      );
      waitMs = nextRequiredBackupTime(new Date()).getTime() - Date.now();
    } catch {
      logger.error({ code: "DATABASE_BACKUP_FAILED" }, "Scheduled database backup failed");
      waitMs = retryMs;
    }
  } else {
    waitMs = nextRequiredBackupTime(lastSuccess).getTime() - now.getTime();
  }
  if (!stopping)
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, Math.max(1_000, waitMs));
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  wake = undefined;
}
logger.info({ code: "DATABASE_BACKUP_SCHEDULER_STOPPED" }, "Database backup scheduler stopped");
