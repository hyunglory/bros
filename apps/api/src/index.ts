import { PublicIdParamsSchema, contractsPackageName } from "@bros/contracts";
import type { PublicIdParams } from "@bros/contracts";
import { corePackageName } from "@bros/core";
import { dbPackageName } from "@bros/db";
import { queuePackageName } from "@bros/queue";

export const apiWorkspaceDependencies = [
  contractsPackageName,
  corePackageName,
  dbPackageName,
  queuePackageName,
] as const;

export const apiCommonSchemas = {
  publicIdParams: PublicIdParamsSchema,
} as const;

export type ApiPublicIdParams = PublicIdParams;

export { createApiDataAccess } from "./database.js";
export { createApiApp } from "./app.js";
export * from "./artifact-preview.js";
export { startApi } from "./bootstrap.js";
export * from "./import-management.js";
export * from "./security.js";
