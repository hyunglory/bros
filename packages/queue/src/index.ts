import { corePackageName } from "@bros/core";

export const queuePackageName = "@bros/queue" as const;
export const queueWorkspaceDependencies = [corePackageName] as const;
