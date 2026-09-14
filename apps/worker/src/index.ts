import { browserPackageName } from "@bros/browser";
import { corePackageName } from "@bros/core";
import { dbPackageName } from "@bros/db";
import { imagePackageName } from "@bros/image";
import { queuePackageName } from "@bros/queue";
import { storagePackageName } from "@bros/storage";

export const workerWorkspaceDependencies = [
  browserPackageName,
  corePackageName,
  dbPackageName,
  imagePackageName,
  queuePackageName,
  storagePackageName,
] as const;

export { createWorkerDataAccess } from "./database.js";
export * from "./runtime.js";
export * from "./bootstrap.js";
export * from "./system-test.js";
export * from "./product-import.js";
