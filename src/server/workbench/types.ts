import type { IncomingMessage, Server } from "node:http";
import type { ProjectRegistryStore } from "../../registry/store.js";
import type { ClarificationAnswer } from "../../workbench/intake.js";
import type { WorkbenchApprovalAction, WorkbenchProjectInput } from "../../workbench/manager.js";
import type { TopicMessageInput, WorkbenchWorkflowActionRequest } from "../../workbench/chat.js";
import type { MemoryMode } from "../../types/index.js";

export interface WorkbenchServeOptions {
  host?: string;
  port?: number;
  staticRoot?: string;
  store?: ProjectRegistryStore;
}

export interface WorkbenchServerHandle {
  server: Server;
  url: string;
}

export interface WorkbenchServerContext {
  input: WorkbenchProjectInput | null;
  staticRoot: string;
  store: ProjectRegistryStore;
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
  workflowRunId?: string;
  queueRunId?: string;
  worktreeId?: string;
  worktreeIds?: string[];
  applyCheckId?: string;
  landingPackageId?: string;
  remoteLandingResultId?: string;
  taskIds?: string[];
  taskRunId?: string;
  confirm?: boolean;
  feedback?: string;
  feedbackContext?: {
    contextId?: string;
    approvalId?: string;
    changeId?: string;
    targetId?: string;
    runId?: string;
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

export interface CreateTopicRequest {
  title?: string;
  body?: string;
  confirm?: boolean;
}

export interface TopicMessageRequest {
  text?: string;
  message?: string;
  mode?: TopicMessageInput["mode"];
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
