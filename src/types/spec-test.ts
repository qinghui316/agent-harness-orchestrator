import type { ValidationStatus, ValidationSummary } from "./run-worktree.js";

export type SpecTestRef =
  | { type: "file"; path: string }
  | { type: "testName"; name: string; path: string }
  | { type: "command"; commandName: string }
  | { type: "note"; text: string };

export interface SpecTestMapping {
  acId: string;
  refs: SpecTestRef[];
}

export interface SpecTests {
  version: "1.0";
  changeId: string;
  updatedAt: string;
  mappings: SpecTestMapping[];
}

export type SpecTestConfidence = "none" | "linked-only" | "validation-passed" | "stale" | "invalid";

export interface SpecTestCommandEvidence {
  commandName: string;
  validationStatus: ValidationStatus | "missing";
}

export interface SpecTestAcStatus {
  acId: string;
  text: string;
  linkedEvidence: boolean;
  evidenceFilesExist: boolean;
  latestValidationStatus: ValidationStatus | null;
  commandEvidence: SpecTestCommandEvidence[];
  confidence: SpecTestConfidence;
  refs: SpecTestRef[];
  warnings: string[];
  blockingIssues: string[];
}

export interface SpecTestStatus {
  version: "1.0";
  changeId: string;
  selectedRoot: string;
  selectedWorktreeId?: string;
  latestValidation: ValidationSummary | null;
  mappings: SpecTestMapping[];
  acceptanceCriteria: SpecTestAcStatus[];
  warnings: string[];
  blockingIssues: string[];
}

export type SpecTestDriftStatus = "ok" | "missing" | "invalid" | "stale" | "failed" | "unknown";

export interface SpecTestDriftAcStatus {
  acId: string;
  text: string;
  status: SpecTestDriftStatus;
  reasons: string[];
  warnings: string[];
  blockingIssues: string[];
  recommendedNextAction: string;
}

export interface SpecTestDriftReport {
  version: "1.0";
  changeId: string;
  selectedRoot: string;
  selectedRootType: "source-root" | "worktree";
  selectedWorktreeId?: string;
  latestValidationId: string | null;
  latestValidationStatus: ValidationStatus | null;
  specTestsUpdatedAt: string;
  freshness: {
    specChangedAfterEvidence: boolean;
    tasksChangedAfterEvidence: boolean;
    validationOlderThanEvidence: boolean;
  };
  summary: Record<SpecTestDriftStatus, number>;
  acceptanceCriteria: SpecTestDriftAcStatus[];
  warnings: string[];
  blockingIssues: string[];
  strict: {
    passed: boolean;
    failingStatuses: SpecTestDriftStatus[];
  };
}

export type SpecTestProposalStatus = "proposed" | "blocked" | "failed";

export type SpecTestProposalSource = "source-root" | "worktree-only" | "suggested" | "unknown";

export type SpecTestProposalKind =
  | "existingEvidence"
  | "alreadyLinked"
  | "missingEvidence"
  | "suggestedNewTests"
  | "openQuestions";

export interface SpecTestProposalEvidence {
  refId: string;
  acId: string;
  source: SpecTestProposalSource;
  kind: SpecTestProposalKind;
  refs: SpecTestRef[];
  rationale: string;
}

export interface SpecTestProposal {
  version: "1.0";
  id: string;
  runId: string;
  changeId: string;
  status: SpecTestProposalStatus;
  worktreeId?: string;
  startedAt: string;
  finishedAt: string;
  evidence: SpecTestProposalEvidence[];
  artifacts: {
    proposal: string;
    proposalMarkdown: string;
    lastMessage: string;
  };
  warnings: string[];
}

export interface SpecTestProposalSummary {
  id: string;
  runId: string;
  changeId: string;
  status: SpecTestProposalStatus;
  worktreeId?: string;
  startedAt: string;
  finishedAt: string;
  evidenceCount: number;
  existingEvidenceCount: number;
  acceptedSourceRootCount: number;
}
