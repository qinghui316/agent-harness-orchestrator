import { fromStoredThreadMessage } from "./conversation-thread-log.js";
import type {
  ConversationTurnExecutionPorts,
  ConversationTurnStrategy,
  ConversationTurnStrategyInput,
  TurnSkillContextResolution,
} from "./conversation-turn-contract.js";
import type { ProjectRuntimeState } from "../project-runtime/coordinator.js";
import type { TopicMessageResult, TopicThreadEntry } from "./types.js";

type HarnessTurnRunner = (
  project: ConversationTurnStrategyInput["project"],
  conversationId: string,
  userMessage: string,
  live: ConversationTurnStrategyInput["live"],
  handoff: ConversationTurnStrategyInput["harnessHandoff"],
  options: { graphScopeId?: string; runtimeState: ProjectRuntimeState; turnSkillResolution: TurnSkillContextResolution | null },
) => Promise<TopicThreadEntry>;

export class HarnessConversationTurnStrategy implements ConversationTurnStrategy {
  readonly productMode = "harness" as const;

  constructor(private readonly runTurn: HarnessTurnRunner) {}

  async execute(
    input: ConversationTurnStrategyInput,
    _ports: ConversationTurnExecutionPorts,
  ): Promise<TopicMessageResult> {
    const user = fromStoredThreadMessage(input.committedMessage);
    const assistant = await this.runTurn(
      input.project,
      input.conversation.conversationId,
      user.text ?? "",
      input.live,
      input.harnessHandoff,
      {
        graphScopeId: user.graphScopeId,
        runtimeState: input.runtimeState ?? (() => { throw new Error("Harness Turn runtime state is not composed."); })(),
        turnSkillResolution: input.turnSkillResolution,
      },
    );
    return {
      user,
      assistant,
      run: null,
      providerSessionId: null,
      mode: "chat",
      assistantMessage: assistant.text ?? "",
    };
  }
}
