import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import type { ManagedProject } from "../types/index.js";
import { resolveProjectHarnessTopic } from "./topic-resolver.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import type { CanonicalTimelineEnvelope } from "./canonical-timeline-contract.js";
import { CanonicalTimelineDelivery } from "./canonical-timeline-delivery.js";
import { toCanonicalTimelineMessage } from "./canonical-timeline-message.js";
import type { TopicThreadEntry, WorkbenchLiveSink } from "./types.js";

export interface CanonicalTimelineWriter {
  upsert(entry: TopicThreadEntry): CanonicalTimelineEnvelope;
  close(): void;
}

export async function openCanonicalTimelineWriter(
  project: ManagedProject,
  changeId: string,
  live?: WorkbenchLiveSink,
): Promise<CanonicalTimelineWriter> {
  const state = await requireReadyRuntime(project);
  await resolveProjectHarnessTopic(state.resolution, changeId);
  const database = await openProjectRuntimeWorkbenchDatabase(state.resolution.paths);
  const projectId = state.resolution.harness.projectId;
  const conversation = database.conversations.findConversationForChange(projectId, changeId);
  if (!conversation) {
    database.close();
    throw new Error(`Change ${changeId} is not bound to a Demand Conversation.`);
  }
  const graphScopeId = database.conversations.findGraphScopeForChange(projectId, changeId) ?? undefined;
  const delivery = new CanonicalTimelineDelivery(database, "harness", live);
  return {
    upsert(entry) {
      const canonical: TopicThreadEntry = {
        ...entry,
        conversationId: conversation.conversationId,
        changeId,
        graphScopeId: entry.graphScopeId ?? graphScopeId,
      };
      return delivery.upsert(toCanonicalTimelineMessage(projectId, conversation.conversationId, canonical));
    },
    close: () => database.close(),
  };
}

export async function appendCanonicalTimelineEntry(
  project: ManagedProject,
  changeId: string,
  input: Omit<TopicThreadEntry, "id" | "timestamp" | "changeId">,
  live?: WorkbenchLiveSink,
): Promise<CanonicalTimelineEnvelope> {
  const state = await requireReadyRuntime(project);
  await resolveProjectHarnessTopic(state.resolution, changeId);
  const database = await openProjectRuntimeWorkbenchDatabase(state.resolution.paths);
  const projectId = state.resolution.harness.projectId;
  const conversation = database.conversations.findConversationForChange(projectId, changeId);
  if (!conversation) {
    database.close();
    throw new Error(`Change ${changeId} is not bound to a Demand Conversation.`);
  }
  const entry: TopicThreadEntry = {
    id: `msg-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    conversationId: conversation.conversationId,
    changeId,
    graphScopeId: database.conversations.findGraphScopeForChange(projectId, changeId) ?? undefined,
    ...input,
  };
  try {
    return new CanonicalTimelineDelivery(database, "harness", live).append(toCanonicalTimelineMessage(projectId, conversation.conversationId, entry));
  } finally {
    database.close();
  }
}

async function requireReadyRuntime(project: ManagedProject) {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") throw new Error(`Project Harness is not ready for Timeline writes: ${state.state}.`);
  return state;
}
