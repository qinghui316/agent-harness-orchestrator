import type { ManagedProject } from "../types/index.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { openWorkbenchDatabase } from "./persistence/open-workbench-database.js";

export async function resolveConversationId(project: ManagedProject, targetId: string): Promise<string> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Workbench conversation resolution");
  if (!memory.projectId) throw new Error("Project id is required to resolve a conversation.");
  const database = await openWorkbenchDatabase(memory);
  try {
    const conversation = database.conversations.readConversation(memory.projectId, targetId)
      ?? database.conversations.readConversationByChangeId(memory.projectId, targetId);
    if (!conversation) throw new Error(`Conversation not found: ${targetId}.`);
    return conversation.conversationId;
  } finally {
    database.close();
  }
}
