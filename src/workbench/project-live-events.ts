import type { WorkbenchLiveEvent } from "./types.js";
import type { AgentSurfacesInvalidated } from "./agent-surface-contract.js";

type ProjectLiveSubscriber = (event: WorkbenchLiveEvent) => void;

const subscribers = new Map<string, Set<ProjectLiveSubscriber>>();

export function publishProjectLiveEvent(projectId: string, event: WorkbenchLiveEvent): void {
  for (const subscriber of subscribers.get(projectId) ?? []) subscriber(event);
}

export function publishAgentSurfacesInvalidated(projectId: string, data: AgentSurfacesInvalidated): void {
  publishProjectLiveEvent(projectId, { event: "agent-surfaces.invalidated", data });
}

export function publishConversationTurnControlInvalidated(projectId: string, data: {
  conversationId: string;
  attemptId: string;
}): void {
  publishProjectLiveEvent(projectId, { event: "conversation.turn-control.invalidated", data });
}

export function subscribeProjectLiveEvents(projectId: string, subscriber: ProjectLiveSubscriber): () => void {
  const projectSubscribers = subscribers.get(projectId) ?? new Set<ProjectLiveSubscriber>();
  projectSubscribers.add(subscriber);
  subscribers.set(projectId, projectSubscribers);
  return () => {
    projectSubscribers.delete(subscriber);
    if (projectSubscribers.size === 0) subscribers.delete(projectId);
  };
}
