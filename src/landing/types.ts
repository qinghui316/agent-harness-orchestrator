export type LandingTargetKind = "worktree" | "integration-check";
export type LandingReadinessStatus = "ready" | "needs-review" | "unattributed-dirty-source" | "missing-evidence";
export type LandingReviewVerdict = "ready" | "needs-user-review" | "needs-rework";

export interface LandingReadinessTarget {
  kind: LandingTargetKind;
  changeIds: string[];
  worktreeIds: string[];
  applyRunId?: string;
  applyCheckId?: string;
  expectedDiffHash: string;
  evidenceRefs: string[];
}

export interface LandingReadinessPackage {
  version: "1.0";
  id: string;
  projectId: string | null;
  target: LandingReadinessTarget;
  status: LandingReadinessStatus;
  sourceHead: string | null;
  sourceDiffHash: string;
  sourceDiffStat: string;
  changedFiles: string[];
  attributable: boolean;
  unattributedFiles: string[];
  summary: string;
  riskSummary: string;
  artifactRefs: string[];
  createdAt: string;
  reviewedAt?: string;
  review?: LandingReadinessReview;
}

export interface LandingReadinessReview {
  version: "1.0";
  packageId: string;
  roleId: "merge-reviewer-agent";
  verdict: LandingReviewVerdict;
  summary: string;
  riskSummary: string;
  evidenceRefs: string[];
  missingChecks: string[];
  suggestedNextAction: string;
  createdAt: string;
}

export interface LandingCandidate {
  kind: LandingTargetKind;
  worktreeId?: string;
  applyCheckId?: string;
  changeIds: string[];
  summary: string;
  riskSummary: string;
}

export interface LandingSourceDiff {
  diff: string;
  diffHash: string;
  diffStat: string;
  changedFiles: string[];
}
