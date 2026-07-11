import type { AuditResult, RunMetadata, ValidationResult, WorktreeStatus } from "../types/index.js";
import type { ExecutionAuthorizationSnapshot } from "../types/index.js";

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
}

export interface AuthorizedWorktreeApplyOptions extends WorktreeApplyOptions {
  authorizationId: string;
  authorizationEpoch: number;
  authorizationSnapshot: ExecutionAuthorizationSnapshot;
  userConfirmed: boolean;
}

export type ApplyTransactionStage = "prepared" | "patch-applied" | "commit-created" | "evidence-written" | "completed";

export interface ApplyTransaction {
  version: "1.0";
  id: string;
  changeId: string;
  worktreeId: string;
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
  } | null;
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
