import { readFileSync, statSync } from "node:fs";
import type { AppConfig } from "@bros/core";
import type { DatabaseClient } from "@bros/db";
import type { IdentifierPatternRegistryDefinition } from "@bros/contracts";
import { createResolverPipeline, emptyResolverPatterns } from "./pipeline.js";
export function configuredResolverPipeline(
  database: DatabaseClient,
  config: AppConfig["resolver"],
) {
  let patterns = emptyResolverPatterns;
  if (config.patternRegistryPath) {
    try {
      if (statSync(config.patternRegistryPath).size > 1048576) throw new Error();
      patterns = JSON.parse(
        readFileSync(config.patternRegistryPath, "utf8"),
      ) as IdentifierPatternRegistryDefinition;
    } catch {
      throw new Error("Resolver pattern registry could not be loaded");
    }
  }
  return createResolverPipeline(database, {
    patterns,
    providerMinIntervalMs: config.providerMinIntervalMs,
  });
}
