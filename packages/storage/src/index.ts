import { corePackageName } from "@bros/core";
export * from "./port.js";
export * from "./object-key.js";
export * from "./local.js";
export * from "./r2.js";

export const storagePackageName = "@bros/storage" as const;
export const storageWorkspaceDependencies = [corePackageName] as const;
