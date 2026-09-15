import { loadConfig } from "../../packages/core/dist/index.js";
import { createDatabaseClient } from "../../packages/db/dist/index.js";
import { createPostgresProviderQuota } from "../../packages/resolver/dist/index.js";

process.on("message", async (policy) => {
  const database = createDatabaseClient(
    loadConfig({ DATABASE_URL: process.env.TEST_DATABASE_URL }).database,
    { applicationName: "bros-test" },
  );
  const quota = createPostgresProviderQuota(database, policy);
  try {
    await quota.execute(
      {
        ...policy,
        costMicrousd: policy.requestCostMicrousd,
        signal: new globalThis.AbortController().signal,
      },
      async () => {
        process.send({ status: "ACTIVE", reservation: await quota.inspect() });
        // Simulate a process lost during an uncertain paid call. Parent kills this process.
        await new Promise(() => {
          globalThis.setInterval(() => {
            /* Keep the crashed-worker simulation alive. */
          }, 1000);
        });
      },
    );
  } catch {
    process.send({ status: "FAILED" });
    await database.close();
    process.exit(1);
  }
});
