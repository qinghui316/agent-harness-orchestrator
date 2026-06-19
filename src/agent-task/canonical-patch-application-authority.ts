import type {
  MaintenanceCanonicalPatchApplicationGateRecord,
  MaintenanceCanonicalPatchApplicationReport,
  MaintenanceCanonicalPatchApplicationResult,
  MaintenanceCanonicalPatchProposal,
  MaintenanceCanonicalUpdateDecision,
  MaintenanceCanonicalUpdateProposal,
} from "../types/index.js";

export type NonExecutingCanonicalPatchApplicationAuthority = Pick<
  MaintenanceCanonicalPatchApplicationGateRecord,
  "sourceMutationAuthorized" | "canonicalUpdateApplied" | "canonicalPatchApplied" | "executionStarted"
>;

export type NonExecutingCanonicalUpdateDecisionAuthority = Pick<
  MaintenanceCanonicalUpdateDecision,
  "sourceMutationAuthorized" | "canonicalUpdateAuthorized" | "executionStarted"
>;

export type NonExecutingCanonicalUpdateProposalAuthority = Pick<
  MaintenanceCanonicalUpdateProposal,
  "humanGateRequired" | "canonicalUpdateAuthorized"
>;

export type NonExecutingCanonicalPatchProposalAuthority = Pick<
  MaintenanceCanonicalPatchProposal,
  "sourceMutationAuthorized" | "canonicalUpdateAuthorized" | "applicationAuthorized" | "executionStarted"
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

export function buildNonExecutingCanonicalUpdateDecisionAuthority(): NonExecutingCanonicalUpdateDecisionAuthority {
  return {
    sourceMutationAuthorized: false,
    canonicalUpdateAuthorized: false,
    executionStarted: false,
  };
}

export function buildNonExecutingCanonicalUpdateProposalAuthority(): NonExecutingCanonicalUpdateProposalAuthority {
  return {
    humanGateRequired: true,
    canonicalUpdateAuthorized: false,
  };
}

export function buildNonExecutingCanonicalPatchProposalAuthority(): NonExecutingCanonicalPatchProposalAuthority {
  return {
    sourceMutationAuthorized: false,
    canonicalUpdateAuthorized: false,
    applicationAuthorized: false,
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
