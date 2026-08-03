import type { ManagedProject } from "../types/index.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";

export async function resolveConversationId(project: ManagedProject, targetId: string): Promise<string> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") throw new Error(`Project Harness is not ready for conversation resolution: ${state.state}.`);
  const { paths } = state.resolution;
  const database = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    const conversation = database.conversations.readConversation(paths.projectId, targetId)
      ?? database.conversations.readConversationByChangeId(paths.projectId, targetId);
    if (!conversation) throw new Error(`Conversation not found: ${targetId}.`);
    return conversation.conversationId;
  } finally {
    database.close();
  }
}
