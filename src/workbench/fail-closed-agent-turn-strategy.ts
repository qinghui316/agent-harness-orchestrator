import type {
  ConversationTurnExecutionPorts,
  ConversationTurnStrategy,
  ConversationTurnStrategyInput,
} from "./conversation-turn-contract.js";
import type { TopicMessageResult } from "./types.js";

export class FailClosedAgentTurnStrategy implements ConversationTurnStrategy {
  readonly productMode = "agent" as const;

  execute(
    input: ConversationTurnStrategyInput,
    _ports: ConversationTurnExecutionPorts,
  ): Promise<TopicMessageResult> {
    const error = new Error(input.harnessHandoff
      ? "Agent mode does not accept AHO planning handoffs."
      : "Direct Agent execution is not enabled yet.");
    error.name = "Conflict";
    return Promise.reject(error);
  }
}
