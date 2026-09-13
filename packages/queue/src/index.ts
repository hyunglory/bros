import { corePackageName } from "@bros/core";
export * from "./port.js";
export * from "./pg-boss.js";

export const queuePackageName = "@bros/queue" as const;
export const queueWorkspaceDependencies = [corePackageName] as const;
