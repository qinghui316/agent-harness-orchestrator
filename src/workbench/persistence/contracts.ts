import type { ProviderCapabilitySnapshot, ProviderId, ProviderModelRef } from "../../provider-runtime/index.js";

export interface StoredTopicMessage {
  id: string;
  projectId: string;
  conversationId: string;
  changeId: string;
  position: number;
  revision: number;
  agentSurfaceId: string;
  initialThreadInput: boolean;
  type: string;
  timestamp: string;
  text: string | null;
  actionRunId: string | null;
  actionType: string | null;
  status: string | null;
  runId: string | null;
  providerId?: string | null;
  threadId?: string | null;
  turnId?: string | null;
  itemId?: string | null;
  artifact: string | null;
  error: string | null;
  rawJson: string;
}

export type StoredTopicMessageWrite = Omit<StoredTopicMessage, "position" | "revision" | "initialThreadInput"> & {
  initialThreadInput?: boolean;
};

export interface StoredConversation {
  projectId: string;
  conversationId: string;
  title: string;
  state: "active" | "archive";
  surfaceKind?: "user" | "runtime";
  boundChangeId: string | null;
  currentGraphScopeId: string | null;
  selectedProviderId: ProviderId;
  completedTurnSequence: number;
  timelinePosition: number;
  timelineRevision: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
}

export interface StoredProviderThreadLink {
  projectId: string;
  conversationId: string;
  attemptId: string;
  providerId: ProviderId;
  providerThreadId: string;
  roleId: string;
  parentThreadId: string | null;
  changeId: string | null;
  graphScopeId: string | null;
  capabilityProfile: string | null;
  displayName?: string | null;
  runId?: string | null;
  updatedAt: string;
}

export interface StoredConversationProviderBinding {
  projectId: string;
  conversationId: string;
  providerId: ProviderId;
  nativeSessionId: string | null;
  lastDeliveredCompletedTurn: number;
  preferredModel: ProviderModelRef | null;
  lastUsedAt: string | null;
  bindingStatus: "ready" | "unavailable" | "stale";
}

export interface StoredProviderAttempt {
  projectId: string;
  conversationId: string | null;
  attemptId: string;
  graphScopeId: string | null;
  changeId: string | null;
  agentTaskId: string | null;
  roleId: string;
  operationProfile: string;
  providerId: ProviderId;
  nativeSessionId: string | null;
  model: ProviderModelRef | null;
  capabilitySnapshot: ProviderCapabilitySnapshot;
  handoffHash: string;
  deliveredThroughCompletedTurn: number;
  worktreeId: string | null;
  status: "queued" | "running" | "completed" | "interrupted" | "failed" | "blocked";
  createdAt: string;
  updatedAt: string;
}

export interface StoredProviderResumePoint {
  projectId: string;
  conversationId: string;
  resumePointId: string;
  graphScopeId: string | null;
  changeId: string | null;
  previousProviderId: ProviderId;
  targetProviderId: ProviderId;
  snapshotJson: string;
  snapshotHash: string;
  createdAt: string;
}

export interface StoredSkillIndex {
  projectId: string;
  skillId: string;
  name: string;
  description: string;
  sourcePath: string;
  sourceKind: string;
  sourceHash: string;
  metadataJson: string;
  updatedAt: string;
}

export interface StoredSkillRoot {
  projectId: string;
  rootPath: string;
  sourceKind: string;
  updatedAt: string;
}

export type SkillEnablementScope = "project" | "topic";

export interface StoredSkillEnablement {
  projectId: string;
  changeId: string | null;
  skillId: string;
  scope: SkillEnablementScope;
  enabled: boolean;
  updatedAt: string;
}

export interface StoredBridgeSync {
  projectId: string;
  skillId: string;
  sourceHash: string;
  materializedPath: string;
  materializedHash: string;
  bridgeVersion: string;
  syncedAt: string;
}

export type StoredDecisionStatus = "pending" | "accepted" | "requested-changes" | "dismissed" | "completed" | "failed";

export interface StoredDecisionRecord {
  id: string;
  projectId: string;
  changeId: string | null;
  decisionType: string;
  status: StoredDecisionStatus;
  label: string;
  summary: string;
  targetId: string | null;
  runId: string | null;
  artifact: string | null;
  actionId: string | null;
  feedback: string | null;
  payloadJson: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}
