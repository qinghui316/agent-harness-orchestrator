import type { ProviderSkillInput } from "../project-harness/contracts.js";
import type { ProductMode, ProviderId } from "../provider-runtime/index.js";
import type { ManagedProject } from "../types/index.js";
import type { StoredConversation, StoredTopicMessage } from "./persistence/contracts.js";
import type {
  TopicAttachment,
  TopicMessageResult,
  ValidatedPlanHandoffIntent,
  WorkbenchLiveSink,
} from "./types.js";

export interface TurnSkillContextRequest {
  project: ManagedProject;
  conversation: StoredConversation;
  requiredSkillIds: readonly string[];
}

export interface TurnSkillContextDiagnostic {
  code: string;
  message: string;
  skillId?: string;
}

export interface TurnSkillContextResolution {
  skillInputs: readonly ProviderSkillInput[];
  diagnostics: readonly TurnSkillContextDiagnostic[];
}

export interface TurnSkillContextPort {
  resolve(request: TurnSkillContextRequest): Promise<TurnSkillContextResolution>;
}

export interface ConversationTurnStrategyInput {
  project: ManagedProject;
  conversation: StoredConversation;
  committedMessage: StoredTopicMessage;
  attachments: readonly TopicAttachment[];
  providerId: ProviderId;
  live?: WorkbenchLiveSink;
  harnessHandoff?: ValidatedPlanHandoffIntent;
}

export interface ConversationTurnExecutionPorts {
  skillContext: TurnSkillContextPort;
}

export interface ConversationTurnStrategy {
  readonly productMode: ProductMode;
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
