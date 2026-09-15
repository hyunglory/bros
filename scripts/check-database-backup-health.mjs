import { currentBackupHealth, readBackupStatus } from "./database-backup-runtime.mjs";

const status = await readBackupStatus();
if (currentBackupHealth(status) !== "HEALTHY") process.exitCode = 1;
