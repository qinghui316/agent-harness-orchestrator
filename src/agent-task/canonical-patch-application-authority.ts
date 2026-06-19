import type {
  MaintenanceCanonicalPatchApplicationGateRecord,
  MaintenanceCanonicalPatchApplicationReport,
  MaintenanceCanonicalPatchApplicationResult,
} from "../types/index.js";

export type NonExecutingCanonicalPatchApplicationAuthority = Pick<
  MaintenanceCanonicalPatchApplicationGateRecord,
  "sourceMutationAuthorized" | "canonicalUpdateApplied" | "canonicalPatchApplied" | "executionStarted"
>;

export type AppliedCanonicalPatchApplicationAuthority = Pick<
  MaintenanceCanonicalPatchApplicationResult,
  "applicationAuthorized" | "sourceMutationAuthorized" | "canonicalUpdateApplied" | "canonicalPatchApplied" | "executionStarted"
>;

export type ReadOnlyCanonicalPatchApplicationObservationAuthority = Pick<
  MaintenanceCanonicalPatchApplicationReport,
  "applicationAuthorized" | "sourceMutationAuthorized" | "canonicalUpdateApplied" | "canonicalPatchApplied" | "executionStarted"
>;

export function buildNonExecutingCanonicalPatchApplicationAuthority(): NonExecutingCanonicalPatchApplicationAuthority {
  return {
    sourceMutationAuthorized: false,
    canonicalUpdateApplied: false,
    canonicalPatchApplied: false,
    executionStarted: false,
  };
}

export function buildAppliedCanonicalPatchApplicationAuthority(): AppliedCanonicalPatchApplicationAuthority {
  return {
    applicationAuthorized: true,
    sourceMutationAuthorized: true,
    canonicalUpdateApplied: true,
    canonicalPatchApplied: true,
    executionStarted: true,
  };
}

export function buildReadOnlyCanonicalPatchApplicationObservationAuthority(): ReadOnlyCanonicalPatchApplicationObservationAuthority {
  return {
    applicationAuthorized: true,
    sourceMutationAuthorized: false,
    canonicalUpdateApplied: false,
    canonicalPatchApplied: false,
    executionStarted: false,
  };
}
