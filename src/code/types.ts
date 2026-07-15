import type { ProviderStreamEvent } from "../provider-runtime/index.js";
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

export type CodeExecutionGateMode = "workflow-graph" | "scheduler-claim-reservation" | "scheduler-claim-rework" | "rework";

export interface CodeExecutionGateOptions {
  mode?: CodeExecutionGateMode;
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
  onProviderEvent?: (event: ProviderStreamEvent & {
    runId: string;
    threadId?: string;
    parentThreadId?: string;
    turnId?: string;
    agentRoleId?: string;
    agentSurfaceId?: string;
    agentDisplayName?: string;
  }) => void;
  onStderrChunk?: (event: { runId: string; chunk: string }) => void;
  onCallbackError?: (event: { runId: string; error: unknown }) => void;
}

export interface CodeStatusResult {
  activeChangeId: string | null;
  latest: RunMetadata | null;
  runs: RunMetadata[];
}
