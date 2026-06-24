import type { WorkflowActionScopeCarrier, WorkflowActionType } from "../workflow-actions/registry.js";
import type { ScopedAutomationAllowedApprovalActionId } from "./policy.js";

export type AutomationAuthorizationMode = "full-access";
export type AutomationCodexRuntimeCapability = "full-access";
export type AutomationRuntimeAuthority = "human-confirmed-scoped-automation-authorization";

export type AutomationStopReason =
  | "max-steps"
  | "no-primary-gate"
  | "unsupported-gate"
  | "terminal-human-gate"
  | "stale-target"
  | "source-drift"
  | "accepted-artifact-drift"
  | "in-flight-action"
  | "blocked"
  | "handler-failed";

export interface AutomationSourceState {
  gitHead?: string;
  statusShort?: string[];
  capturedAt: string;
}

export interface AutomationAcceptedArtifactHashes {
  spec?: string | null;
  plan?: string | null;
  tasks?: string | null;
  acMap?: string | null;
}

export interface AutomationAuthorization {
  version: "1.0";
  id: string;
  projectId: string;
  changeId: string;
  authority: AutomationRuntimeAuthority;
  actionType: "planning.automation.scoped-auto.run";
  mode: AutomationAuthorizationMode;
  codexRuntimeCapability: AutomationCodexRuntimeCapability;
  allowedActionTypes: WorkflowActionType[];
  allowedApprovalActionIds: ScopedAutomationAllowedApprovalActionId[];
  maxSteps: number;
  hardMaxSteps: number;
  requestedGate: WorkflowActionScopeCarrier;
  sourceState: AutomationSourceState;
  acceptedArtifactHashes: AutomationAcceptedArtifactHashes;
  humanConfirmed: true;
  scopedToCurrentChangeOnly: true;
  applyAuthorized: false;
  closeAuthorized: false;
  mergeAuthorized: false;
  remoteLandingAuthorized: false;
  harnessEvolutionAuthorized: false;
  parallelExecutorAuthorized: false;
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
}

export interface AutomationIteration {
  version: "1.0";
  id: string;
  projectId: string;
  changeId: string;
  automationAuthorizationId: string;
  automationRunId: string;
  ordinal: number;
  submittedActionType?: WorkflowActionType;
  submittedApprovalActionId?: string;
  currentGateActionType?: string;
  currentGateKind?: "workflow-action" | "approval-action";
  currentGateScope?: Record<string, unknown>;
  status: "completed" | "failed" | "stopped";
  stopReason?: AutomationStopReason;
  resultSummary?: string;
  error?: string;
  childAuditScope: {
    coveredByAutomationAuthorizationId: string;
    automationRunId: string;
  };
  artifact: string;
  markdownArtifact: string;
  createdAt: string;
  completedAt: string;
}

export interface AutomationRun {
  version: "1.0";
  id: string;
  projectId: string;
  changeId: string;
  authority: "scoped-automation-runtime-run";
  automationAuthorizationId: string;
  status: "running" | "completed" | "stopped" | "failed";
  maxSteps: number;
  completedSteps: number;
  stopReason?: AutomationStopReason;
  stopSummary?: string;
  iterations: string[];
  artifact: string;
  markdownArtifact: string;
  startedAt: string;
  updatedAt: string;
  completedAt?: string;
}
