import { createRedactedLogger, loadConfigFromProcess } from "@bros/core";
import { startApi } from "./bootstrap.js";

try {
  await startApi(loadConfigFromProcess());
} catch {
  createRedactedLogger().error(
    { code: "API_STARTUP_FAILED" },
    "API startup failed; check configuration and listen address",
  );
  process.exitCode = 1;
}
