import { corePackageName } from "@bros/core";

export const browserPackageName = "@bros/browser" as const;
export const browserWorkspaceDependencies = [corePackageName] as const;
