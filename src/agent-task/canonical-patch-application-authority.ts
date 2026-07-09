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

export function renderCanonicalUpdateProposalAuthorityMarkdown(): string[] {
  const authority = buildNonExecutingCanonicalUpdateProposalAuthority();
  return renderCanonicalAuthorityMarkdown([
    "Classification: non-executing maintenance proposal evidence.",
    `Human gate required: ${String(authority.humanGateRequired)}.`,
    `Canonical update authorized: ${String(authority.canonicalUpdateAuthorized)}.`,
    "This proposal does not modify stable memory, canonical docs, ECL rules, Harness templates, source root, apply state, close state, or Harness evolution state.",
  ]);
}

export function renderCanonicalUpdateDecisionAuthorityMarkdown(): string[] {
  const authority = buildNonExecutingCanonicalUpdateDecisionAuthority();
  return renderCanonicalAuthorityMarkdown([
    "Classification: human-gated maintenance decision evidence.",
    "Decision status: accepted-for-follow-up.",
    `Source mutation authorized: ${String(authority.sourceMutationAuthorized)}.`,
    `Canonical update authorized: ${String(authority.canonicalUpdateAuthorized)}.`,
    `Execution started: ${String(authority.executionStarted)}.`,
    "This decision does not modify stable memory, canonical docs, ECL rules, Harness templates, source root, apply state, close state, or Harness evolution state.",
  ]);
}

export function renderCanonicalPatchProposalAuthorityMarkdown(): string[] {
  const authority = buildNonExecutingCanonicalPatchProposalAuthority();
  return renderCanonicalAuthorityMarkdown([
    "Classification: non-executing canonical patch proposal evidence.",
    `Source mutation authorized: ${String(authority.sourceMutationAuthorized)}.`,
    `Canonical update authorized: ${String(authority.canonicalUpdateAuthorized)}.`,
    `Application authorized: ${String(authority.applicationAuthorized)}.`,
    `Execution started: ${String(authority.executionStarted)}.`,
    "Human application gate required: true.",
    "This patch proposal does not modify stable memory, canonical docs, ECL rules, Harness templates, source root, apply state, close state, remote state, or Harness evolution state.",
  ]);
}

export function renderCanonicalPatchApplicationGateAuthorityMarkdown(): string[] {
  const authority = buildNonExecutingCanonicalPatchApplicationAuthority();
  return renderCanonicalAuthorityMarkdown([
    "Classification: human-gated canonical patch application follow-up evidence.",
    "Decision status: accepted-for-application-follow-up.",
    `Source mutation authorized: ${String(authority.sourceMutationAuthorized)}.`,
    `Canonical update applied: ${String(authority.canonicalUpdateApplied)}.`,
    `Canonical patch applied: ${String(authority.canonicalPatchApplied)}.`,
    `Execution started: ${String(authority.executionStarted)}.`,
    "This gate record does not modify stable memory, canonical docs, ECL rules, Harness templates, source root, apply state, close state, remote state, or Harness evolution state.",
  ]);
}

export function renderCanonicalPatchApplicationManifestAuthorityMarkdown(): string[] {
  const authority = buildNonExecutingCanonicalPatchApplicationAuthority();
  return renderCanonicalAuthorityMarkdown([
    "Classification: non-executing canonical patch application readiness evidence.",
    `Source mutation authorized: ${String(authority.sourceMutationAuthorized)}.`,
    `Canonical update applied: ${String(authority.canonicalUpdateApplied)}.`,
    `Canonical patch applied: ${String(authority.canonicalPatchApplied)}.`,
    `Execution started: ${String(authority.executionStarted)}.`,
    "This manifest does not modify stable memory, canonical docs, ECL rules, Harness templates, source root, apply state, close state, remote state, or Harness evolution state.",
  ]);
}

export function renderCanonicalPatchApplicationResultAuthorityMarkdown(): string[] {
  const authority = buildAppliedCanonicalPatchApplicationAuthority();
  return renderCanonicalAuthorityMarkdown([
    "Classification: human-gated canonical patch application result evidence.",
    `Application authorized: ${String(authority.applicationAuthorized)}.`,
    `Source mutation authorized: ${String(authority.sourceMutationAuthorized)}.`,
    `Canonical update applied: ${String(authority.canonicalUpdateApplied)}.`,
    `Canonical patch applied: ${String(authority.canonicalPatchApplied)}.`,
    `Execution started: ${String(authority.executionStarted)}.`,
    "This result records a completed canonical docs/stable-memory patch application. It does not modify apply state, close state, remote state, IntegrationCheck, Validation, Audit, or Harness evolution state.",
  ]);
}

export function renderCanonicalPatchApplicationReportAuthorityMarkdown(): string[] {
  const authority = buildReadOnlyCanonicalPatchApplicationObservationAuthority();
  return renderCanonicalAuthorityMarkdown([
    "Classification: read-only canonical patch application observation report evidence.",
    `Application authorized: ${String(authority.applicationAuthorized)}.`,
    `Source mutation authorized by this report: ${String(authority.sourceMutationAuthorized)}.`,
    `Canonical update applied by this report: ${String(authority.canonicalUpdateApplied)}.`,
    `Canonical patch applied by this report: ${String(authority.canonicalPatchApplied)}.`,
    `Execution started by this report: ${String(authority.executionStarted)}.`,
    "This report does not modify stable memory, canonical docs, ECL rules, Harness templates, source root, apply state, close state, remote state, Validation, Audit, IntegrationCheck, or Harness evolution state.",
  ]);
}

function renderCanonicalAuthorityMarkdown(lines: string[]): string[] {
  return [
    "## Authority",
    "",
    ...lines.map((line) => `- ${line}`),
  ];
}
