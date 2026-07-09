import type { WorkflowRuntimeExecutionState } from "./execution-contract.js";
import type { AuditLeafRun, CodeLeafRun, ValidationLeafRun } from "./leaf-execution.js";
import type { ManagedProject } from "../types/index.js";
import {
  runReworkValidationAuditSequence,
  type ReworkValidationAuditSequenceConfig,
} from "./rework-validation-audit-sequence.js";
import type { WorkflowRuntimeLiveSink } from "./kernel/live-events.js";

export interface SourceRefreshReworkWorkflowInput {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkflowRuntimeLiveSink;
}

export interface SourceRefreshReworkWorkflowResult {
  code?: CodeLeafRun;
  validation?: ValidationLeafRun;
  audit?: AuditLeafRun;
  status?: "failed" | "needs-user-input";
  error?: string;
  stoppedAt: "boundary" | "code" | "validation" | "audit" | null;
  boundaryAudit?: unknown;
  orchestration: WorkflowRuntimeExecutionState;
  loopRunId: string;
}

const SOURCE_REFRESH_REWORK_SEQUENCE: ReworkValidationAuditSequenceConfig = {
  entrypoint: "source-refresh-rework",
  loopStartedSummary: "Source-refresh rework runtime loop started.",
  observationEmptySummary: "Source-refresh rework has no role evidence yet.",
  observationProgressPrefix: "Source-refresh rework",
  leafStartedSummaryPrefix: "Source-refresh rework",
  rework: {
    goal: "Refresh the prior same-demand result against the current source state.",
    reason: "The user requested source-refresh rework for an existing result.",
    nextRecommendation: "Run validation and audit after rework-coder completes.",
  },
  validation: {
    goal: "Run independent mechanical validation for the refreshed worktree.",
    reason: "Source-refresh rework produced a completed worktree proposal.",
    nextRecommendation: "Run auditor-agent after validation passes.",
    failureSummary: "Validation failed during source-refresh rework.",
  },
  audit: {
    goal: "Run independent semantic audit for the refreshed validated worktree.",
    reason: "Independent validation passed.",
    nextRecommendation: "Show result review and apply handoff if audit accepts.",
    failureSummary: "Audit failed during source-refresh rework.",
  },
  codeFailureSummary: "Source-refresh rework did not produce a completed worktree proposal.",
  stoppedSummary: "Source-refresh rework stopped before completion.",
  completedReason: "Source-refresh rework completed validation and audit.",
  completedNextRecommendation: "Show result review and apply handoff.",
};

export async function runSourceRefreshReworkWorkflow(
  input: SourceRefreshReworkWorkflowInput,
): Promise<SourceRefreshReworkWorkflowResult> {
  return runReworkValidationAuditSequence({
    ...input,
    config: SOURCE_REFRESH_REWORK_SEQUENCE,
  });
}
