import { contractsPackageName } from "@bros/contracts";
import type { ErrorEnvelope, PublicId } from "@bros/contracts";

export const adminWorkspaceDependencies = [contractsPackageName] as const;

export interface AdminResourceReference {
  publicId: PublicId;
}

export type AdminApiError = ErrorEnvelope;
