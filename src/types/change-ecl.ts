import type { AuditSummary, ValidationSummary } from "./run-worktree.js";
import type { ChangeIndexItem } from "./project.js";
import type { SpecTestStatus } from "./spec-test.js";

export type ChangeState = "active" | "archived";

export interface ChangeMetadata {
  version: "1.0";
  id: string;
  title: string;
  state: ChangeState;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  archivePath: string | null;
  originConversationId?: string;
}

export type ReviewStatus = "pending" | "approved" | "approved-with-notes" | "blocked" | "missing" | "unknown";

export interface AcceptanceCriterion {
  id: string;
  text: string;
  taskIds: string[];
  validationRefs: string[];
  warnings: string[];
}

export interface ParsedTask {
  id: string;
  text: string;
  acIds: string[];
  done: boolean;
  warnings: string[];
}

export interface AcMap {
  version: "1.0";
  generatedAt: string;
  changeId: string;
  acceptanceCriteria: AcceptanceCriterion[];
  tasks: ParsedTask[];
  warnings: string[];
  blockingIssues: string[];
}

export interface CloseGateResult {
  ready: boolean;
  warnings: string[];
  blockingIssues: string[];
}

export interface ChangeStatus {
  projectPath: string;
  activeChanges: ChangeIndexItem[];
  change: ChangeMetadata | null;
  reviewStatus: ReviewStatus;
  acMap: AcMap | null;
  specTest: SpecTestStatus | null;
  latestValidation: ValidationSummary | null;
  latestAudit: AuditSummary | null;
  closeGate: CloseGateResult;
}
