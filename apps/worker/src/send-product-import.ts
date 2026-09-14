import { loadConfigFromProcess } from "@bros/core";
import { createDatabaseClient } from "@bros/db";
import { createPgBossQueue } from "@bros/queue";
import { enqueueProductImport } from "./product-import.js";

async function main() {
  const [batchPublicId, resume, ...extra] = process.argv.slice(2);
  if (!batchPublicId || (resume !== undefined && resume !== "--resume") || extra.length)
    throw new Error("Invalid import arguments");
  const config = loadConfigFromProcess();
  const database = createDatabaseClient(config.database, { applicationName: "bros-worker" });
  const queue = createPgBossQueue(config.database);
  try {
    await queue.start();
    const result = await enqueueProductImport(database, queue, batchPublicId, {
      maxQueuedBatches: config.importer.maxQueuedBatches,
      resume: resume === "--resume",
    });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } finally {
    try {
      await queue.stop();
    } finally {
      await database.close();
    }
  }
}
void main().catch(() => {
  process.stderr.write("Product import enqueue failed\n");
  process.exitCode = 1;
});
