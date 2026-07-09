import type { CodexJsonlStreamEvent } from "../codex/jsonl.js";
import type { RunMetadata } from "../types/index.js";

export interface CodeRunOptions {
  changeId?: string;
  taskIds?: string[];
  taskRunId?: string;
  roleId?: string;
  existingWorktreeId?: string;
  executionGate?: CodeExecutionGateOptions;
  prompt?: string;
  promptFile?: string;
  model?: string;
  profile?: string;
  live?: CodeRunLiveCallbacks;
}

export type CodeExecutionGateMode = "single-change-readiness" | "taskqueue-proposal" | "scheduler-claim-reservation" | "scheduler-claim-rework" | "rework";

export interface CodeExecutionGateOptions {
  mode?: CodeExecutionGateMode;
  readinessManifestId?: string;
  taskQueueProposalId?: string;
  workflowGraphPlanId?: string;
  schedulerRunId?: string;
  schedulerClaimReservationId?: string;
  schedulerWorkerReworkPlanId?: string;
  schedulerWorkerValidationId?: string;
  schedulerWorkerAuditId?: string;
  reservationIntentId?: string;
  claimIntentId?: string;
  nodeId?: string;
  unitId?: string;
}

export interface CodeExecutionGateVerdict {
  allowed: boolean;
  mode: CodeExecutionGateMode;
  changeId: string;
  readinessManifestId?: string;
  decompositionPlanId?: string;
  taskQueueProposalId?: string;
  workflowGraphPlanId?: string;
  schedulerRunId?: string;
  schedulerClaimReservationId?: string;
  schedulerWorkerReworkPlanId?: string;
  schedulerWorkerValidationId?: string;
  schedulerWorkerAuditId?: string;
  reservationIntentId?: string;
  claimIntentId?: string;
  nodeId?: string;
  unitId?: string;
  taskRunId?: string;
  taskIds?: string[];
  reason: string;
}

export interface CodeRunResult {
  run: RunMetadata;
  warnings: string[];
}

export interface CodeRunLiveCallbacks {
  onRunStarted?: (run: RunMetadata) => void;
  onStatus?: (event: { runId: string; status: string; label?: string }) => void;
  onCodexEvent?: (event: CodexJsonlStreamEvent & { runId: string }) => void;
  onStderrChunk?: (event: { runId: string; chunk: string }) => void;
  onCallbackError?: (event: { runId: string; error: unknown }) => void;
}

export interface CodeStatusResult {
  activeChangeId: string | null;
  latest: RunMetadata | null;
  runs: RunMetadata[];
}
