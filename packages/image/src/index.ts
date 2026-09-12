import { corePackageName } from "@bros/core";
import { storagePackageName } from "@bros/storage";

export const imagePackageName = "@bros/image" as const;
export const imageWorkspaceDependencies = [
  corePackageName,
  storagePackageName,
] as const;
