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
  | "change-closeout"
  | "maintenance-review"
  | "canonical-update-proposal";

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

export interface EvolutionCandidate {
  version: "1.0";
  id: string;
  sourceLedgerEntryIds: string[];
  subtype?: MaintenanceCandidateSubtype;
  fingerprint?: string;
  supersededBy?: string;
  title: string;
  summary: string;
  artifactRefs: string[];
  status: "candidate";
  createdAt: string;
}

export interface CandidateScore {
  version: "1.0";
  candidateId: string;
  score: number;
  rationale: string;
  risks: string[];
  confidence: "low" | "medium" | "high";
  dimensions?: Record<string, number>;
  createdAt: string;
}

export interface CandidateReview {
  version: "1.0";
  candidateId: string;
  recommendation: "accept" | "defer" | "reject" | "needs-human-review";
  summary: string;
  evidenceRefs: string[];
  createdAt: string;
}

export type MaintenanceCandidateResolutionOutcome =
  | "promote"
  | "merge"
  | "retire"
  | "archive-only"
  | "noop";

export interface MaintenanceCandidateResolution {
  version: "1.0";
  id: string;
  candidateId: string;
  outcome: MaintenanceCandidateResolutionOutcome;
  reviewRecommendation: CandidateReview["recommendation"];
  candidateSubtype?: MaintenanceCandidateSubtype;
  score: number;
  rationale: string;
  canonicalUpdateRequired: boolean;
  humanGateRequired: boolean;
  artifactRefs: string[];
  createdAt: string;
}

export type MaintenanceCanonicalUpdateTargetKind =
  | "stable-memory"
  | "canonical-docs"
  | "harness-evolution"
  | "reference"
  | "maintenance";

export interface MaintenanceCanonicalUpdateResolutionSummary {
  resolutionId: string;
  candidateId: string;
  outcome: MaintenanceCandidateResolutionOutcome;
  candidateSubtype?: MaintenanceCandidateSubtype;
  reviewRecommendation: CandidateReview["recommendation"];
  rationale: string;
  artifactRefs: string[];
}

export interface MaintenanceCanonicalUpdateProposal {
  version: "1.0";
  id: string;
  status: "proposed";
  resolutionIds: string[];
  candidateIds: string[];
  targetKinds: MaintenanceCanonicalUpdateTargetKind[];
  humanGateRequired: true;
  canonicalUpdateAuthorized: false;
  summary: string;
  resolutionSummaries: MaintenanceCanonicalUpdateResolutionSummary[];
  artifactRefs: string[];
  createdAt: string;
}

export type MaintenanceCandidateSubtype =
  | "stable-memory"
  | "docs-drift"
  | "harness-evolution"
  | "reusable-lesson"
  | "doc-budget"
  | "reference-drift";

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

export interface MaintenanceReviewWatermark {
  version: "1.0";
  lastReviewedChangeIds: string[];
  lastReviewedArchiveIndex: number;
  lastReviewWindowId: string | null;
  lastReviewedAt: string | null;
}

export interface DocBudgetReport {
  version: "1.0";
  id: string;
  documents: Array<{
    path: string;
    wordCount: number;
    softLimit: number;
    hardLimit: number;
    status: "ok" | "soft-exceeded" | "hard-exceeded";
  }>;
  createdAt: string;
}

export interface MaintenanceReviewRun {
  version: "1.0";
  id: string;
  windowChangeIds: string[];
  hotCloseoutRefs: string[];
  warmIndexRef: string;
  coldArchiveRef: string;
  docBudgetReportRef: string;
  candidateRefs: string[];
  scoreRefs: string[];
  reviewRefs: string[];
  resolutionRefs: string[];
  proposalRefs: string[];
  summary: string;
  createdAt: string;
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
