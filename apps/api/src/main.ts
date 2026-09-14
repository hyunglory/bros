import { createRedactedLogger, loadConfigFromProcess } from "@bros/core";
import { startApi } from "./bootstrap.js";

try {
  process.umask(0o077);
  await startApi(loadConfigFromProcess());
} catch {
  createRedactedLogger().error(
    { code: "API_STARTUP_FAILED" },
    "API startup failed; check configuration and listen address",
  );
  process.exitCode = 1;
}
