import type { DecompositionReadinessManifest, TaskQueueProposal } from "../workflow-artifacts/manager.js";
import type { ManagedProject, WorkflowGraphPlan, WorkflowRecoveryKey } from "../types/index.js";

export interface ValidatedTaskQueueProposal {
  proposal: TaskQueueProposal;
  readiness: DecompositionReadinessManifest;
  graph: WorkflowGraphPlan;
  changePath: string;
  recoveryKey: WorkflowRecoveryKey;
}

export interface WorkflowRunEventInput {
  queueRunId?: string;
  taskId?: string;
  taskRunId?: string;
  status?: string;
  reason?: string;
  data?: Record<string, unknown>;
}

export interface WorkflowRecoveryContext {
  project: ManagedProject;
  changePath: string;
  proposal: TaskQueueProposal;
  readiness: DecompositionReadinessManifest;
  graph: WorkflowGraphPlan;
}
