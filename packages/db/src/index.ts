import { corePackageName } from "@bros/core";

export * from "./client.js";
export * from "./identifier-compatibility.js";
export type * from "./schema.js";
export * from "./repositories/platform.js";

export const dbPackageName = "@bros/db" as const;
export const dbWorkspaceDependencies = [corePackageName] as const;
