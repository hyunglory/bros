import { randomUUID } from "node:crypto";
import { createRedactedLogger, loadConfigFromProcess } from "@bros/core";
import { createPgBossQueue } from "@bros/queue";
import { createWorkerDataAccess } from "./database.js";
import { enqueueSystemTest } from "./system-test.js";

const logger = createRedactedLogger();
try {
  const config = loadConfigFromProcess();
  const data = createWorkerDataAccess(config.database);
  const queue = createPgBossQueue(config.database);
  try {
    await queue.start();
    const receipt = await enqueueSystemTest(data.database, queue, `system.test:${randomUUID()}`);
    logger.info({ code: "SYSTEM_TEST_QUEUED", ...receipt }, "System test queued");
  } finally {
    try {
      await queue.stop();
    } finally {
      await data.database.close();
    }
  }
} catch {
  logger.error({ code: "SYSTEM_TEST_ENQUEUE_FAILED" }, "System test enqueue failed");
  process.exitCode = 1;
}
