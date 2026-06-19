import type { MaintenanceCanonicalPatchApplicationGateRecord } from "../types/index.js";

export type NonExecutingCanonicalPatchApplicationAuthority = Pick<
  MaintenanceCanonicalPatchApplicationGateRecord,
  "sourceMutationAuthorized" | "canonicalUpdateApplied" | "canonicalPatchApplied" | "executionStarted"
>;

export function buildNonExecutingCanonicalPatchApplicationAuthority(): NonExecutingCanonicalPatchApplicationAuthority {
  return {
    sourceMutationAuthorized: false,
    canonicalUpdateApplied: false,
    canonicalPatchApplied: false,
    executionStarted: false,
  };
}
