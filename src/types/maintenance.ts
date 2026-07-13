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

export type MaintenanceLedgerEventType =
  | "archive"
  | "apply"
  | "remote-landing"
  | "failure"
  | "user-feedback"
  | "doc-drift"
  | "reference-drift"
  | "harness-evolution"
  | "change-closeout";

export interface MaintenanceLedgerEntry {
  version: "1.0";
  id: string;
  projectId: string | null;
  changeId?: string;
  eventType: MaintenanceLedgerEventType;
  summary: string;
  artifactRefs: string[];
  createdAt: string;
}

export interface DemandMemoryCloseout {
  version: "1.0";
  id: string;
  changeId: string;
  title: string;
  terminalKind: "archived" | "applied" | "remote-handoff" | "merged";
  goal: string;
  finalResult: string;
  userDecision: string;
  changedFiles: string[];
  affectedModules: string[];
  evidenceRefs: string[];
  reusableLessonCandidates: ReusableLessonCandidate[];
  docsDriftCandidates: DocsDriftCandidate[];
  memoryBoundaryNotes: string[];
  createdAt: string;
}

export interface ReusableLessonCandidate {
  id: string;
  fingerprint: string;
  summary: string;
  evidenceRefs: string[];
  status: "candidate" | "superseded";
  supersededBy?: string;
}

export interface DocsDriftCandidate {
  id: string;
  fingerprint: string;
  document: string;
  summary: string;
  evidenceRefs: string[];
  status: "candidate" | "superseded";
  supersededBy?: string;
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
