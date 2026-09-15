import { createRedactedLogger } from "../packages/core/dist/index.js";
import { processBackupAlertOnce } from "./backup-alert-runtime.mjs";

const logger = createRedactedLogger();
try {
  const result = await processBackupAlertOnce();
  logger.info({ code: result.action }, "Backup alert dispatch completed");
  if (result.action.endsWith("PENDING")) process.exitCode = 1;
} catch {
  logger.error({ code: "BACKUP_ALERT_CONFIGURATION_FAILED" }, "Backup alert configuration failed");
  process.exitCode = 1;
}
