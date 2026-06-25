export type { WorkflowGraphPlan, WorkflowGraphStage } from "../types/index.js";

export type DecompositionRecommendation =
  | "single-change"
  | "taskgraph-sequential"
  | "taskgraph-parallel-candidate"
  | "multi-change-candidate"
  | "needs-clarification";

export interface WorkflowRecoveryKeyInputs {
  changeId: string;
  planningBundleId?: string;
  acceptedArtifactRefs: string[];
  contextScope: "selected-demand";
  sourceRevision?: string;
  worktreeBase?: string;
  rolePolicyProfile: string;
  notes: string[];
}

export interface DecompositionUnit {
  id: string;
  title: string;
  summary: string;
  taskIds: string[];
  acIds: string[];
  scopeHints: string[];
  dependsOn: string[];
  recommendedRoleId: string;
}

export interface DecompositionScopeExpansion {
  scope: string;
  reason: string;
  accepted: boolean;
}

export interface DecompositionPlan {
  id: string;
  changeId: string;
  status: "draft" | "confirmed" | "superseded" | "rejected";
  recommendation: DecompositionRecommendation;
  rationale: string;
  units: DecompositionUnit[];
  dependencies: Array<{ from: string; to: string; kind: "blocks" | "synthesizes" | "conflicts" }>;
  conflictScopes: string[];
  sourceScopeConstraints?: string[];
  scopeExpansions?: DecompositionScopeExpansion[];
  riskSummary: string;
  openQuestions: string[];
  artifactRefs: string[];
  recoveryKeyInputs: WorkflowRecoveryKeyInputs;
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export type DecompositionReadinessStatus =
  | "ready-for-single-change"
  | "ready-for-sequential-taskqueue-proposal"
  | "ready-for-scheduler-contract"
  | "blocked-parallel-guardrails"
  | "blocked-multi-change-boundary"
  | "blocked-needs-clarification"
  | "invalid";

export type DecompositionReadinessGuardrailStatus = "passed" | "blocked" | "failed";

export interface DecompositionReadinessGuardrail {
  id: string;
  status: DecompositionReadinessGuardrailStatus;
  summary: string;
  refs: string[];
}

export interface DecompositionReadinessUnit {
  id: string;
  title: string;
  taskIds: string[];
  acIds: string[];
  dependsOn: string[];
  guardrailStatus: DecompositionReadinessGuardrailStatus;
  sourceScopes: string[];
}

export interface DecompositionReadinessManifest {
  id: string;
  changeId: string;
  decompositionPlanId: string;
  status: DecompositionReadinessStatus;
  recommendation: DecompositionRecommendation;
  executable: false;
  schedulerEligible: boolean;
  nextAllowedAction: "code.run" | "taskqueue.proposal" | "scheduler.contract" | "clarification.answer" | "none";
  units: DecompositionReadinessUnit[];
  dependencies: DecompositionPlan["dependencies"];
  conflictScopes: string[];
  guardrails: DecompositionReadinessGuardrail[];
  recoveryKeyMaterial: WorkflowRecoveryKeyInputs & {
    decompositionPlanId: string;
    taskIds: string[];
    acIds: string[];
  };
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskQueueProposalStatus = "draft" | "confirmed" | "started" | "superseded" | "rejected";

export interface TaskQueueProposalItem {
  id: string;
  taskId: string;
  unitId: string;
  title: string;
  order: number;
  dependsOn: string[];
  sourceScopes: string[];
  acIds: string[];
}

export interface TaskQueueProposal {
  id: string;
  changeId: string;
  decompositionPlanId: string;
  readinessManifestId: string;
  status: TaskQueueProposalStatus;
  recommendation: "taskgraph-sequential";
  queueMode: "sequential";
  items: TaskQueueProposalItem[];
  dependencies: DecompositionPlan["dependencies"];
  conflictScopes: string[];
  sourceArtifactHashes: Record<string, string>;
  recoveryKeyMaterial: DecompositionReadinessManifest["recoveryKeyMaterial"];
  artifactRefs: string[];
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowArtifactWithChange = { changeId: string; id?: string };
