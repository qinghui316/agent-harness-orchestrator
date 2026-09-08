import type { ConversationQueuedTurnInput } from "../types.js";

export interface ConversationTurnQueueEnqueueInput extends ConversationQueuedTurnInput {
  expectedDraftUpdatedAt: string | null;
}
