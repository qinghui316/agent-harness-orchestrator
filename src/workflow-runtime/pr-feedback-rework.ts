import type { WorkflowRuntimeExecutionState } from "./execution-contract.js";
import type { AuditLeafRun, CodeLeafRun, ValidationLeafRun } from "./leaf-execution.js";
import type { ManagedProject } from "../types/index.js";
import {
  runReworkValidationAuditSequence,
  type ReworkValidationAuditSequenceConfig,
} from "./rework-validation-audit-sequence.js";
import type { WorkflowRuntimeLiveSink } from "./kernel/live-events.js";

export interface PrFeedbackReworkWorkflowInput {
  project: ManagedProject;
  changeId: string;
  prompt?: string;
  live?: WorkflowRuntimeLiveSink;
}

export interface PrFeedbackReworkWorkflowResult {
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

const PR_FEEDBACK_REWORK_SEQUENCE: ReworkValidationAuditSequenceConfig = {
  entrypoint: "feedback-rework",
  loopStartedSummary: "PR feedback rework runtime loop started.",
  observationEmptySummary: "PR feedback rework has no role evidence yet.",
  observationProgressPrefix: "PR feedback rework",
  leafStartedSummaryPrefix: "PR feedback rework",
  rework: {
    goal: "Revise the same demand result according to remote Draft PR feedback.",
    reason: "Remote PR feedback requires a same-demand rework attempt.",
    nextRecommendation: "Run validation and audit after rework-coder completes.",
  },
  validation: {
    goal: "Run independent mechanical validation for the PR feedback rework result.",
    reason: "PR feedback rework produced a completed worktree proposal.",
    nextRecommendation: "Run auditor-agent after validation passes.",
    failureSummary: "Validation failed during PR feedback rework.",
  },
  audit: {
    goal: "Run independent semantic audit for the validated PR feedback rework result.",
    reason: "Independent validation passed.",
    nextRecommendation: "Prepare a fresh landing review if audit accepts.",
    failureSummary: "Audit failed during PR feedback rework.",
  },
  codeFailureSummary: "PR feedback rework did not produce a completed worktree proposal.",
  stoppedSummary: "PR feedback rework stopped before completion.",
  completedReason: "PR feedback rework completed validation and audit.",
  completedNextRecommendation: "Prepare a fresh landing review before updating the Draft PR.",
};

export async function runPrFeedbackReworkWorkflow(
  input: PrFeedbackReworkWorkflowInput,
): Promise<PrFeedbackReworkWorkflowResult> {
  return runReworkValidationAuditSequence({
    ...input,
    config: PR_FEEDBACK_REWORK_SEQUENCE,
  });
}
