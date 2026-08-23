import type { IncomingMessage, Server } from "node:http";
import type { ProjectRegistryStore } from "../../registry/store.js";
import type { TerminalRuntime } from "../terminal/terminal-runtime.js";
import type { WorkbenchApprovalAction, WorkbenchProjectInput } from "../../workbench/read-model-types.js";
import type { NewConversationSkillOverride, TopicMessageInput, WorkbenchWorkflowActionRequest } from "../../workbench/types.js";
import type { ProductMode } from "../../provider-runtime/index.js";
import type { ProjectRuntimeCoordinatorPort } from "../../project-runtime/coordinator.js";
import type { ProviderRegistry } from "../../provider-runtime/registry.js";
import type { WorkbenchProjectRemovalPort } from "./project-removal.js";
import type { ConversationTurnRoutingPort } from "../../workbench/conversation-turn-contract.js";
import type { ConversationTurnControlOwner } from "../../workbench/conversation-turn-control.js";
import type { ConversationTurnRetryOwner } from "../../workbench/conversation-turn-retry.js";
import type { ComposerDraftRecoveryService } from "../../workbench/composer-draft-recovery.js";
import type { ProductModeActivityProjectionOwner } from "../../workbench/product-mode-activity.js";
import type { ConversationContextLifecycleOwner } from "../../workbench/conversation-context-lifecycle.js";

export interface WorkbenchServeOptions {
  host?: string;
  port?: number;
  staticRoot?: string;
  store?: ProjectRegistryStore;
  terminalRuntime?: TerminalRuntime;
  projectRuntimeCoordinator?: ProjectRuntimeCoordinatorPort;
  providerRegistry?: ProviderRegistry;
  projectRemoval?: WorkbenchProjectRemovalPort;
  turnControl?: ConversationTurnControlOwner;
  turnRetry?: ConversationTurnRetryOwner;
  composerDraftRecovery?: ComposerDraftRecoveryService;
  productModeActivity?: ProductModeActivityProjectionOwner;
  conversationContext?: ConversationContextLifecycleOwner;
}

export interface WorkbenchServerHandle {
  server: Server;
  url: string;
  close(): Promise<void>;
}

export interface WorkbenchServerContext {
  input: WorkbenchProjectInput | null;
  staticRoot: string;
  store: ProjectRegistryStore;
  projectRuntimeCoordinator: ProjectRuntimeCoordinatorPort;
  providerRegistry: ProviderRegistry;
  projectRemoval: WorkbenchProjectRemovalPort;
  terminalRuntime: TerminalRuntime;
  turnRouter: ConversationTurnRoutingPort;
  turnControl: ConversationTurnControlOwner;
  turnRetry: ConversationTurnRetryOwner;
  composerDraftRecovery: ComposerDraftRecoveryService;
  productModeActivity: ProductModeActivityProjectionOwner;
  conversationContext: ConversationContextLifecycleOwner;
}

export interface ConversationTurnRetryBody {
  productMode?: unknown;
  providerId?: unknown;
  expectedAttemptId?: unknown;
  sourceMessageId?: unknown;
  clientRequestId?: unknown;
}

export interface WorkbenchActionRequest {
  action?: WorkbenchApprovalAction;
  actionType?: WorkbenchWorkflowActionRequest["actionType"];
  clientRequestId?: string;
  changeId?: string;
  graphScopeId?: string;
  prompt?: string;
  proposalId?: string;
  workflowGraphPlanId?: string;
  finalizationRequestId?: string;
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
  specTestEvidenceFingerprint?: string;
  specTestAcIds?: string[];
  specTestMissing?: boolean;
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
    worktreeId?: string;
    applyCheckId?: string;
    landingPackageId?: string;
    artifact?: string;
  };
  abandon?: {
    changeId: string;
    conversationId: string;
    graphScopeId: string;
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

export interface RemoveProjectRequest {
  confirm?: boolean;
  confirmationToken?: string;
}

export interface CreateTopicRequest {
  body?: string;
  productMode: ProductMode;
  clientRequestId: string;
  skillOverrides?: NewConversationSkillOverride[];
  confirm?: boolean;
  contextRefs?: TopicMessageInput["contextRefs"];
  attachmentIds?: string[];
  providerId?: TopicMessageInput["providerId"];
  agentTurnMode?: TopicMessageInput["agentTurnMode"];
  modelId?: TopicMessageInput["modelId"];
  reasoningEffort?: TopicMessageInput["reasoningEffort"];
}

export interface UpdateConversationTitleRequest {
  title?: string;
}

export interface TopicMessageRequest {
  text?: string;
  message?: string;
  mode?: TopicMessageInput["mode"];
  contextRefs?: TopicMessageInput["contextRefs"];
  attachmentIds?: string[];
  providerId?: TopicMessageInput["providerId"];
  providerSwitchIntent?: TopicMessageInput["providerSwitchIntent"];
  agentSurfaceId?: TopicMessageInput["agentSurfaceId"];
  productMode: ProductMode;
  agentTurnMode?: TopicMessageInput["agentTurnMode"];
  modelId?: TopicMessageInput["modelId"];
  reasoningEffort?: TopicMessageInput["reasoningEffort"];
}

export interface ConversationTurnInterruptBody {
  productMode?: unknown;
  providerId?: unknown;
  expectedAttemptId?: unknown;
}

export interface ConversationTurnSteerBody extends ConversationTurnInterruptBody {
  clientRequestId?: unknown;
  text?: unknown;
}

export interface ConversationContextCompactBody {
  productMode?: unknown;
  providerId?: unknown;
  contextRevision?: unknown;
  clientRequestId?: unknown;
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
