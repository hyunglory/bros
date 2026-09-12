import { contractsPackageName } from "@bros/contracts";
import { corePackageName } from "@bros/core";
import { dbPackageName } from "@bros/db";
import { queuePackageName } from "@bros/queue";

export const apiWorkspaceDependencies = [
  contractsPackageName,
  corePackageName,
  dbPackageName,
  queuePackageName,
] as const;
