import type { AuditResult, RunMetadata, ValidationResult, WorktreeStatus } from "../types/index.js";
import type { ExecutionAuthorizationSnapshot } from "../types/index.js";
import type { HighImpactApprovalScope } from "../workflow-actions/high-impact-approval.js";

export interface WorktreeGateState {
  ready: boolean;
  warnings: string[];
  blockingIssues: string[];
  changeId: string;
  worktree: WorktreeStatus;
  diffHash: string;
  diffStat: string;
  changedPaths: string[];
  expectedTree: string;
  validation: ValidationResult | null;
  audit: AuditResult | null;
  reviewAuditId: string | null;
  sourceHead: string | null;
}

export type ApplyReadinessKind =
  | "ready"
  | "source-drift"
  | "dirty-source"
  | "stale-validation"
  | "stale-audit"
  | "not-approved";

export interface ApplyReadinessClassification {
  kind: ApplyReadinessKind;
  message: string;
  primaryAction: "apply" | "refresh-rework" | "refresh-status" | "revalidate" | "reaudit" | "request-changes";
}

export interface WorktreePreviewResult {
  gate: WorktreeGateState;
}

export interface WorktreeApplyOptions {
  commit?: boolean;
  message?: string;
  userConfirmed?: boolean;
  actionScope?: HighImpactApprovalScope;
  approvalActionId?: "result.apply";
}

export interface WorktreeDiscardOptions {
  actionScope?: HighImpactApprovalScope;
  approvalActionId?: "worktree.discard";
}

export type ApplyTransactionStage = "prepared" | "patch-applied" | "commit-created" | "evidence-written" | "completed";

export interface ApplyTransaction {
  version: "1.0";
  id: string;
  changeId: string;
  worktreeId: string;
  worktreeIdentityHash: string;
  runId: string;
  diffHash: string;
  manifestHash: string;
  changedPaths: string[];
  expectedTree: string;
  sourceHeadBefore: string;
  stage: ApplyTransactionStage;
  commitRequested: boolean;
  commitMessage: string;
  commitHash: string | null;
  validationId: string;
  auditId: string;
  reviewAuditId: string;
  authorization: {
    authorizationId: string;
    authorizationEpoch: number;
    snapshot: ExecutionAuthorizationSnapshot;
    manifestHash: string;
    operationId: string;
    claimToken: string;
    fencingToken: number;
  };
  actionScope: HighImpactApprovalScope;
  approvalActionId: "result.apply" | null;
  blockedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorktreeApplyResult {
  run: RunMetadata;
  apply: {
    version: "1.0";
    changeId: string;
    worktreeId: string;
    worktreeDiffHash: string;
    validationId: string;
    auditId: string;
    reviewAuditId: string;
    sourceHeadBefore: string | null;
    sourceHeadAfter: string | null;
    committed: boolean;
    commitHash?: string;
    status: "applied" | "failed";
  };
}

export interface WorktreeResultApplyResult extends WorktreeApplyResult {
  auditAccepted?: {
    auditId: string;
    reviewPath: string;
  };
}

export interface WorktreeDiscardResult {
  run: RunMetadata;
  discard: {
    version: "1.0";
    changeId: string;
    worktreeId: string;
    status: "discarded" | "failed";
  };
}

export interface WorktreeDiscardTransaction {
  version: "1.0";
  worktreeId: string;
  changeId: string;
  runId: string;
  checkoutPath: string;
  worktreeIdentityHash: string;
  manifestHash: string;
  stage: "prepared" | "checkout-removed" | "evidence-written" | "completed";
  actionScope: HighImpactApprovalScope;
  approvalActionId: "worktree.discard" | null;
  authorization: {
    authorizationId: string;
    authorizationEpoch: number;
    snapshot: ExecutionAuthorizationSnapshot;
    operationId: string;
    claimToken: string;
    fencingToken: number;
  };
  createdAt: string;
  updatedAt: string;
  blockedReason: string | null;
}
