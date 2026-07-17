import type { ResolvedMemory } from "../types/index.js";
import { openWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import type { WorkbenchDatabase } from "./persistence/database.js";

export async function deleteConversation(memory: ResolvedMemory, conversationId: string): Promise<void> {
  const database = await requireConversationDatabase(memory);
  try {
    const conversation = database.conversations.readConversation(memory.projectId!, conversationId, { includeDeleted: true });
    if (!conversation) throw conversationNotFound(conversationId);
    database.unitOfWork.deleteConversation(memory.projectId!, conversationId, new Date().toISOString());
  } finally {
    database.close();
  }
}

export async function hideConversation(memory: ResolvedMemory, conversationId: string): Promise<void> {
  const database = await requireConversationDatabase(memory);
  try {
    const conversation = database.conversations.readConversation(memory.projectId!, conversationId);
    if (!conversation) throw conversationNotFound(conversationId);
    if (conversation.state !== "archive") {
      const error = new Error("Only archived or completed conversations can be removed from the sidebar.");
      error.name = "Conflict";
      throw error;
    }
    database.conversations.hideConversation(memory.projectId!, conversationId, new Date().toISOString());
  } finally {
    database.close();
  }
}

async function requireConversationDatabase(memory: ResolvedMemory): Promise<WorkbenchDatabase> {
  if (!memory.projectId) {
    const error = new Error("Project id is required to update a conversation.");
    error.name = "Conflict";
    throw error;
  }
  return openWorkbenchDatabase(memory);
}

function conversationNotFound(conversationId: string): Error {
  const error = new Error(`Conversation not found: ${conversationId}.`);
  error.name = "NotFound";
  return error;
}
