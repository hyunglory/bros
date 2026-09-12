import { corePackageName } from "@bros/core";

export const dbPackageName = "@bros/db" as const;
export const dbWorkspaceDependencies = [corePackageName] as const;
