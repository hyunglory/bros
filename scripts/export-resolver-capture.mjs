import { writeFile } from "node:fs/promises";
import { loadConfigFromProcess } from "../packages/core/dist/index.js";
import { createDatabaseClient } from "../packages/db/dist/index.js";
import {
  createResolverCaptureExporter,
  ResolverCaptureError,
} from "../packages/resolver/dist/index.js";

let database;
try {
  const [runId, outputPath, ...extra] = process.argv.slice(2);
  if (!runId || !outputPath || extra.length)
    throw new ResolverCaptureError("INVALID_CAPTURE_ARGUMENTS");
  const config = loadConfigFromProcess();
  database = createDatabaseClient(config.database, { applicationName: "bros-capture-export" });
  const exported = await createResolverCaptureExporter(database).export(runId);
  // Deliberate local privileged export; never stdout, overwrite, or public HTTP.
  await writeFile(outputPath, JSON.stringify(exported, null, 2) + "\n", {
    flag: "wx",
    mode: 0o600,
  });
  console.log(`Resolver capture exported: ${exported.captureDigest}`);
} catch (error) {
  const code =
    error instanceof ResolverCaptureError
      ? error.code
      : error?.code === "EEXIST"
        ? "CAPTURE_OUTPUT_EXISTS"
        : "CAPTURE_EXPORT_FAILED";
  console.error(`Resolver capture export failed: ${code}`);
  process.exitCode = 1;
} finally {
  try {
    await database?.close();
  } catch {
    console.error("Resolver capture export failed: CAPTURE_DATABASE_CLOSE_FAILED");
    process.exitCode = 1;
  }
}
