import type { IncomingMessage, Server } from "node:http";
import type { ProjectRegistryStore } from "../../registry/store.js";
import type { TerminalRuntime } from "../terminal/terminal-runtime.js";
import type { ClarificationAnswer } from "../../workbench/intake.js";
import type { WorkbenchApprovalAction, WorkbenchProjectInput } from "../../workbench/manager.js";
import type { TopicMessageInput, WorkbenchWorkflowActionRequest } from "../../workbench/chat.js";
import type { MemoryMode } from "../../types/index.js";

export interface WorkbenchServeOptions {
  host?: string;
  port?: number;
  staticRoot?: string;
  store?: ProjectRegistryStore;
  terminalRuntime?: TerminalRuntime;
}

export interface WorkbenchServerHandle {
  server: Server;
  url: string;
}

export interface WorkbenchServerContext {
  input: WorkbenchProjectInput | null;
  staticRoot: string;
  store: ProjectRegistryStore;
  terminalRuntime: TerminalRuntime;
}

export interface WorkbenchActionRequest {
  action?: WorkbenchApprovalAction;
  actionType?: WorkbenchWorkflowActionRequest["actionType"];
  changeId?: string;
  prompt?: string;
  proposalId?: string;
  planningBundleId?: string;
  decompositionPlanId?: string;
  readinessManifestId?: string;
  taskQueueProposalId?: string;
  workflowGraphPlanId?: string;
  schedulerContractId?: string;
  schedulerDispatchDryRunId?: string;
  schedulerWorkerPlanId?: string;
  schedulerClaimReconcilePlanId?: string;
  schedulerLaunchPreflightId?: string;
  schedulerRunId?: string;
  schedulerReconcileSnapshotId?: string;
  schedulerClaimReservationId?: string;
  schedulerIntegrationCandidateId?: string;
  schedulerIntegrationCheckHandoffId?: string;
  schedulerIntegrationOutcomeId?: string;
  schedulerRunCompletionId?: string;
  schedulerRunBlockedCloseoutId?: string;
  goalLoopDecisionId?: string;
  goalLoopIterationId?: string;
  goalLoopContinuationBriefId?: string;
  goalLoopNextStepPacketId?: string;
  goalLoopFeedbackId?: string;
  goalLoopControllerPolicyId?: string;
  goalLoopGateReadinessPreflightId?: string;
  goalLoopCurrentGateActionType?: WorkbenchWorkflowActionRequest["actionType"];
  automationMode?: "request-approval" | "full-access";
  postPlanAutomationMode?: "request-approval" | "full-access";
  automationCurrentGateActionType?: WorkbenchWorkflowActionRequest["actionType"];
  automationCurrentGateApprovalActionId?: string;
  automationCurrentGateTargetId?: string;
  automationCurrentGateRunId?: string;
  automationCurrentGateArtifact?: string;
  automationAuthorizationId?: string;
  automationRunId?: string;
  maxSteps?: number;
  maintenanceProposalId?: string;
  maintenancePatchProposalId?: string;
  maintenanceApplicationManifestId?: string;
  schedulerWorkerStartId?: string;
  schedulerWorkerResultId?: string;
  schedulerWorkerValidationId?: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkPlanId?: string;
  schedulerWorkerReworkStartId?: string;
  schedulerWorkerReworkResultId?: string;
  schedulerWorkerReworkValidationId?: string;
  schedulerWorkerReworkAuditId?: string;
  reservationIntentId?: string;
  claimIntentId?: string;
  workflowRunId?: string;
  queueRunId?: string;
  worktreeId?: string;
  worktreeIds?: string[];
  applyCheckId?: string;
  landingPackageId?: string;
  remoteLandingResultId?: string;
  taskIds?: string[];
  taskRunId?: string;
  workerLeaseId?: string;
  runId?: string;
  validationRunId?: string;
  reworkValidationRunId?: string;
  auditRunId?: string;
  confirm?: boolean;
  feedback?: string;
  feedbackContext?: {
    contextId?: string;
    actionId?: string;
    actionKind?: string;
    actionType?: WorkbenchWorkflowActionRequest["actionType"];
    approvalActionId?: string;
    approvalId?: string;
    changeId?: string;
    targetId?: string;
    runId?: string;
    planningBundleId?: string;
    worktreeId?: string;
    applyCheckId?: string;
    landingPackageId?: string;
    artifact?: string;
  };
  abandon?: {
    changeId?: string;
    reason?: string;
  };
  options?: {
    commit?: boolean;
    message?: string;
  };
}

export interface IntakeRequest {
  changeId?: string;
  prompt?: string;
  message?: string;
}

export interface ClarificationAnswerRequest {
  changeId?: string;
  answers?: ClarificationAnswer[];
  answer?: string;
}

export interface AddExistingProjectRequest {
  path?: string;
  name?: string;
  confirm?: boolean;
}

export interface CreateNewProjectRequest {
  parentPath?: string;
  name?: string;
  git?: boolean;
  readme?: boolean;
  initialCommit?: boolean;
  confirm?: boolean;
}

export interface InitProjectHarnessRequest {
  memoryMode?: MemoryMode;
  confirm?: boolean;
}

export interface TrustCodexProjectRequest {
  confirm?: boolean;
}

export interface RemoveProjectRequest {
  confirm?: boolean;
}

export interface CreateTopicRequest {
  title?: string;
  body?: string;
  confirm?: boolean;
  contextRefs?: TopicMessageInput["contextRefs"];
  attachmentIds?: string[];
}

export interface TopicMessageRequest {
  text?: string;
  message?: string;
  mode?: TopicMessageInput["mode"];
  contextRefs?: TopicMessageInput["contextRefs"];
  attachmentIds?: string[];
}

export interface FolderDialogResult {
  path: string | null;
  canceled: boolean;
  supported: boolean;
  error?: string;
}

export interface NativeFolderDialogCommand {
  command: string;
  args: string[];
}

export type JsonRequest = IncomingMessage;
