import { randomUUID } from "node:crypto";

export function createConversationGraphScopeId(conversationId: string): string {
  const normalized = conversationId.trim();
  if (!normalized) throw new Error("Conversation graph scope requires a conversation id.");
  return `graph:${normalized}:${Date.now().toString(36)}:${randomUUID().slice(0, 8)}`;
}
