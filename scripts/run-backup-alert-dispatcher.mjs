import { clearTimeout, setTimeout } from "node:timers";
import { createRedactedLogger } from "../packages/core/dist/index.js";
import { processBackupAlertOnce } from "./backup-alert-runtime.mjs";

const logger = createRedactedLogger();
const pollMs = Number(process.env.BACKUP_ALERT_POLL_MS ?? "60000");
if (!Number.isInteger(pollMs) || pollMs < 30_000 || pollMs > 900_000) process.exit(2);
let stopping = false;
let wake;
const stop = () => {
  stopping = true;
  wake?.();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

while (!stopping) {
  try {
    const result = await processBackupAlertOnce();
    if (result.action === "FAILURE_DELIVERED" || result.action === "RECOVERY_DELIVERED")
      logger.warn({ code: result.action }, "Backup alert state changed");
    if (result.action.endsWith("PENDING"))
      logger.error({ code: "BACKUP_ALERT_DELIVERY_PENDING" }, "Backup alert delivery is pending");
  } catch {
    logger.error(
      { code: "BACKUP_ALERT_CONFIGURATION_FAILED" },
      "Backup alert configuration failed",
    );
  }
  if (!stopping)
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, pollMs);
      wake = () => {
        clearTimeout(timer);
        resolve();
      };
    });
  wake = undefined;
}
logger.info({ code: "BACKUP_ALERT_DISPATCHER_STOPPED" }, "Backup alert dispatcher stopped");
