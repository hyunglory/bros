import { loadConfigFromProcess } from "@bros/core";
import { createDatabaseClient } from "@bros/db";
import { createPgBossQueue } from "@bros/queue";
import { enqueueResolveBatch } from "@bros/resolver";
import { configuredResolverPipeline } from "./identifier-resolve.js";

async function main() {
  const [requestPublicId, ...sourceProductPublicIds] = process.argv.slice(2);
  if (!requestPublicId || sourceProductPublicIds.length === 0) throw new Error();
  const config = loadConfigFromProcess();
  const database = createDatabaseClient(config.database, { applicationName: "bros-worker" });
  const queue = createPgBossQueue(config.database);
  try {
    const pipeline = configuredResolverPipeline(database, config.resolver);
    await queue.start();
    const result = await enqueueResolveBatch(
      database,
      queue,
      {
        requestPublicId,
        sourceProductPublicIds,
        resolverVersion: pipeline.version,
      },
      config.resolver,
    );
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.results.some((item) => item.disposition === "ERROR")) process.exitCode = 1;
  } finally {
    try {
      await queue.stop();
    } finally {
      await database.close();
    }
  }
}
void main().catch(() => {
  process.stderr.write("Identifier resolver enqueue failed\n");
  process.exitCode = 1;
});
