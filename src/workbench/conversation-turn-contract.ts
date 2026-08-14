import type { ProviderSkillInput } from "../project-harness/contracts.js";
import type { ProductMode, ProviderId } from "../provider-runtime/index.js";
import type { ProjectRuntimeState } from "../project-runtime/coordinator.js";
import type { ProjectRuntimeResolution } from "../project-runtime/context.js";
import type { ManagedProject } from "../types/index.js";
import type { StoredConversation, StoredTopicMessage } from "./persistence/contracts.js";
import type {
  TopicAttachment,
  TopicMessageResult,
  TopicThreadEntry,
  ValidatedPlanHandoffIntent,
  WorkbenchLiveSink,
} from "./types.js";

export interface TurnSkillContextRequest {
  project: ManagedProject;
  conversation: StoredConversation;
  requiredSkillIds: readonly string[];
  runtimeState?: ProjectRuntimeState;
}

export interface TurnSkillContextPreparation {
  paths: import("../project-runtime/paths.js").ProjectRuntimePaths;
  identityInputs?: readonly ProviderSkillInput[];
  extraRoots?: readonly string[];
  requiredSkillIds?: readonly string[];
  isSkillVisible?: (skill: { name: string; skillId: string; sourceKind: string }) => boolean;
  nativeSkillRoots?: readonly string[];
}

export interface TurnSkillContextDiagnostic {
  code: string;
  message: string;
  skillId?: string;
}

export interface TurnSkillContextResolution {
  skillInputs: readonly ProviderSkillInput[];
  diagnostics: readonly TurnSkillContextDiagnostic[];
  nativeSkillRoots?: readonly string[];
  requiredNativeSkills?: readonly string[];
  resolutionHash?: string;
}

export interface TurnSkillContextPort {
  resolve(request: TurnSkillContextRequest): Promise<TurnSkillContextResolution>;
}

export interface ConversationTurnRequest {
  project: ManagedProject;
  conversation: StoredConversation;
  committedMessage: StoredTopicMessage;
  attachments: readonly TopicAttachment[];
  providerId: ProviderId;
  live?: WorkbenchLiveSink;
  harnessHandoff?: ValidatedPlanHandoffIntent;
  requiredSkillIds?: readonly string[];
}

/** Internal input created only by ConversationTurnRouter after composition. */
export interface ConversationTurnStrategyInput extends ConversationTurnRequest {
  runtimeState: ProjectRuntimeState;
  turnSkillResolution: TurnSkillContextResolution | null;
}

/** Internal side-effect-free validation input created before Turn Skill discovery. */
export interface ConversationTurnStrategyPreflightInput extends ConversationTurnRequest {
  runtimeState: ProjectRuntimeState;
}

export interface ConversationTurnExecutionPorts {
  skillContext: TurnSkillContextPort;
}

export interface ConversationTurnContinuationOptions {
  goalResume?: { deliveryKey: string; contextText: string };
  graphScopeId?: string;
}

export type ConversationTurnContinuationPort = (
  project: ManagedProject,
  conversationId: string,
  message: string,
  live?: WorkbenchLiveSink,
  planHandoff?: ValidatedPlanHandoffIntent,
  options?: ConversationTurnContinuationOptions,
) => Promise<TopicThreadEntry>;

export interface ConversationTurnRoutingPort {
  assertRequestedMode(conversation: StoredConversation, requestedMode?: ProductMode): void;
  route(input: ConversationTurnRequest, requestedMode?: ProductMode): Promise<TopicMessageResult>;
  resolveProviderId: (project: ManagedProject, requestedProviderId?: ProviderId) => ProviderId;
  resolveRuntimeState: (project: ManagedProject) => Promise<ProjectRuntimeState>;
  switchProviderAtSafePoint?: (input: {
    project: ManagedProject;
    resolution: ProjectRuntimeResolution;
    conversationId: string;
    targetProviderId: ProviderId;
  }) => Promise<import("./provider-switch.js").ProviderSwitchResult>;
  continueMainAgentTurn?: ConversationTurnContinuationPort;
  runAgentNativeChildFollowup?: (input: {
    project: ManagedProject;
    conversationId: string;
    agentSurfaceId: string;
    message: string;
    live?: WorkbenchLiveSink;
  }) => Promise<TopicMessageResult>;
  runExactChildAgentTurn?: (input: {
    project: ManagedProject;
    conversationId: string;
    agentSurfaceId: string;
    message: string;
    live?: WorkbenchLiveSink;
  }) => Promise<TopicMessageResult>;
}

export interface ConversationTurnStrategy {
  readonly productMode: ProductMode;
  preflight?(input: ConversationTurnStrategyPreflightInput): void | Promise<void>;
  execute(
    input: ConversationTurnStrategyInput,
    ports: ConversationTurnExecutionPorts,
  ): Promise<TopicMessageResult>;
}

export interface ModeActivitySummary {
  runningCount: number;
  failedCount: number;
  attentionCount: number;
}
