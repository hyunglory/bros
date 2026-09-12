import { corePackageName } from "@bros/core";

export const storagePackageName = "@bros/storage" as const;
export const storageWorkspaceDependencies = [corePackageName] as const;
