import type { ProductMode } from "../provider-runtime/index.js";
import type { StoredConversation } from "./persistence/contracts.js";
import type {
  ConversationTurnExecutionPorts,
  ConversationTurnStrategy,
  ConversationTurnStrategyInput,
} from "./conversation-turn-contract.js";
import type { TopicMessageResult } from "./types.js";

export type ConversationTurnStrategies = Readonly<Record<ProductMode, ConversationTurnStrategy>>;

export class ConversationTurnRouter {
  constructor(
    private readonly strategies: ConversationTurnStrategies,
    private readonly ports: ConversationTurnExecutionPorts,
  ) {
    for (const productMode of ["agent", "harness"] as const) {
      if (strategies[productMode].productMode !== productMode) {
        throw new Error(`Conversation Turn Strategy for ${productMode} must declare the same productMode.`);
      }
    }
  }

  assertRequestedMode(conversation: StoredConversation, requestedMode?: ProductMode): void {
    if (requestedMode === undefined || requestedMode === conversation.productMode) return;
    const error = new Error("Conversation productMode does not match the requested mode.");
    error.name = "Conflict";
    throw error;
  }

  async route(input: ConversationTurnStrategyInput, requestedMode?: ProductMode): Promise<TopicMessageResult> {
    this.assertRequestedMode(input.conversation, requestedMode);
    return this.strategies[input.conversation.productMode].execute(input, this.ports);
  }
}
