import type { ProjectWorkbenchPathPort } from "../project-runtime/paths.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import type { WorkbenchDatabase } from "./persistence/database.js";

export async function deleteConversation(runtime: ProjectWorkbenchPathPort, conversationId: string): Promise<void> {
  const database = await requireConversationDatabase(runtime);
  try {
    const conversation = database.conversations.readConversation(runtime.projectId, conversationId, { includeDeleted: true });
    if (!conversation) throw conversationNotFound(conversationId);
    database.unitOfWork.deleteConversation(runtime.projectId, conversationId, new Date().toISOString());
  } finally {
    database.close();
  }
}

export async function hideConversation(runtime: ProjectWorkbenchPathPort, conversationId: string): Promise<void> {
  const database = await requireConversationDatabase(runtime);
  try {
    const conversation = database.conversations.readConversation(runtime.projectId, conversationId);
    if (!conversation) throw conversationNotFound(conversationId);
    if (conversation.state !== "archive") {
      const error = new Error("Only archived or completed conversations can be removed from the sidebar.");
      error.name = "Conflict";
      throw error;
    }
    database.conversations.hideConversation(runtime.projectId, conversationId, new Date().toISOString());
  } finally {
    database.close();
  }
}

async function requireConversationDatabase(runtime: ProjectWorkbenchPathPort): Promise<WorkbenchDatabase> {
  if (!runtime.projectId) {
    const error = new Error("Project id is required to update a conversation.");
    error.name = "Conflict";
    throw error;
  }
  return openProjectRuntimeWorkbenchDatabase(runtime);
}

function conversationNotFound(conversationId: string): Error {
  const error = new Error(`Conversation not found: ${conversationId}.`);
  error.name = "NotFound";
  return error;
}
