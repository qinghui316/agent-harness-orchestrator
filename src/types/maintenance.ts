export type MainOrchestratorDecisionAction =
  | "planning"
  | "enqueue"
  | "coding"
  | "validation"
  | "audit"
  | "bounded-rework"
  | "result-review"
  | "needs-user-input"
  | "done";

export interface MainOrchestratorDecision {
  version: "1.0";
  id: string;
  projectId: string | null;
  changeId: string;
  workerId?: string;
  attemptId?: string;
  action: MainOrchestratorDecisionAction;
  summary: string;
  reason: string;
  artifactRefs: string[];
  createdAt: string;
}

export type DemandWorkerStatus = "queued" | "claimed" | "running" | "result-ready" | "needs-user-input" | "failed" | "completed" | "released";
export type DemandWorkerAttemptStatus = "claimed" | "running" | "completed" | "needs-user-input" | "failed" | "cancelled";

export interface DemandWorker {
  version: "1.0";
  id: string;
  projectId: string | null;
  changeId: string;
  status: DemandWorkerStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  activeAttemptId?: string;
  resultSummary?: string;
  failureReason?: string;
  waitingReason?: string;
}

export interface DemandWorkerAttempt {
  version: "1.0";
  id: string;
  projectId: string | null;
  changeId: string;
  workerId: string;
  attempt: number;
  status: DemandWorkerAttemptStatus;
  createdAt: string;
  updatedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  agentTaskIds: string[];
  resultStatus?: string;
  resultSummary?: string;
  failureReason?: string;
}

export interface DemandWorkerQueue {
  version: "1.0";
  projectId: string | null;
  maxConcurrentDemands: number;
  workers: DemandWorker[];
  updatedAt: string;
}

export interface DemandWorkerSlot {
  maxConcurrentDemands: number;
  runningCount: number;
  available: boolean;
}

export interface DemandWorkerReconcileResult {
  workers: DemandWorker[];
  attempts: DemandWorkerAttempt[];
  decisions: MainOrchestratorDecision[];
}

export interface RoleScopedContextProjection {
  version: "1.0";
  roleId: string;
  allowedMemoryTier: "current-demand" | "compact-stable" | "maintenance-hot-warm-cold";
  includesMaintenanceWindow: boolean;
  includedSources: string[];
  excludedSources: string[];
  createdAt: string;
}
