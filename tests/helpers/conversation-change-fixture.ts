import { createConcurrentChange } from "../../src/change/manager.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import type { ManagedProject } from "../../src/types/index.js";
import { appendConversationThreadEntry } from "../../src/workbench/chat.js";
import { WorkbenchStore } from "../../src/workbench/store.js";

export async function createConversationChangeFixture(
  project: ManagedProject,
  input: { title: string; body?: string },
): Promise<{ changeId: string; conversationId: string; title: string; state: "active" }> {
  const body = input.body?.trim() || input.title;
  const result = await createConcurrentChange(project, { title: input.title, body });
  const memory = await resolveProjectMemory(project);
  if (!memory.projectId) throw new Error("Conversation fixture requires a registered project id.");
  const now = new Date().toISOString();
  const conversationId = `conv-${result.change.id}`;
  const graphScopeId = `graph:${conversationId}`;
  const store = await WorkbenchStore.open(memory);
  try {
    store.createConversation({
      projectId: memory.projectId,
      conversationId,
      title: input.title,
      state: "active",
      boundChangeId: result.change.id,
      currentGraphScopeId: graphScopeId,
      selectedProviderId: "codex",
      completedTurnSequence: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    store.acceptConversationChangeBinding(
      memory.projectId,
      conversationId,
      result.change.id,
      now,
      `fixture-acceptance:${result.change.id}`,
      `fixture-proposal:${result.change.id}`,
    );
  } finally {
    store.close();
  }
  await appendConversationThreadEntry(project, result.change.id, { type: "user.message", text: body });
  return { changeId: result.change.id, conversationId, title: result.change.title, state: "active" };
}
