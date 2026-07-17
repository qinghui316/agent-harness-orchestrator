import { useCallback, useReducer, useRef } from "react";
import { fetchJson } from "./api.js";
import {
  canonicalTimelineReducer,
  canonicalTimelineScopeKey,
  createCanonicalTimelineState,
  type CanonicalTimelineRequestKind,
} from "./canonicalTimelineStore.js";
import type { CanonicalTimelinePage, CanonicalTimelineScope, WorkbenchLiveEvent, WorkspaceResourceTab } from "./types.js";

export function canonicalTimelineReconnectScopes(
  projectId: string,
  conversationId: string,
  tabs: WorkspaceResourceTab[],
): CanonicalTimelineScope[] {
  const surfaceIds = new Set(["main-agent"]);
  for (const tab of tabs) {
    if (tab.target.kind === "agent" && tab.target.conversationId === conversationId) {
      surfaceIds.add(tab.target.agentSurfaceId);
    }
  }
  return [...surfaceIds].map((agentSurfaceId) => ({ projectId, conversationId, agentSurfaceId }));
}

export function useCanonicalTimelineController(onError: (message: string) => void) {
  const [state, dispatch] = useReducer(canonicalTimelineReducer, undefined, createCanonicalTimelineState);
  const generationsRef = useRef(new Map<string, number>());

  const load = useCallback(async (
    scope: CanonicalTimelineScope,
    requestKind: CanonicalTimelineRequestKind,
    beforeCursor?: string,
  ): Promise<void> => {
    const generationKey = `${canonicalTimelineScopeKey(scope)}:${requestKind}`;
    const generation = (generationsRef.current.get(generationKey) ?? 0) + 1;
    generationsRef.current.set(generationKey, generation);
    dispatch({ type: "request.started", scope, requestKind, generation });
    const params = new URLSearchParams({ agentSurfaceId: scope.agentSurfaceId, limit: "100" });
    if (beforeCursor) params.set("beforeCursor", beforeCursor);
    try {
      const page = await fetchJson<CanonicalTimelinePage>(
        `/api/projects/${encodeURIComponent(scope.projectId)}/workbench/conversations/${encodeURIComponent(scope.conversationId)}/timeline?${params}`,
      );
      dispatch({ type: "page.received", scope, requestKind, generation, page });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      dispatch({ type: "request.failed", scope, requestKind, generation, error: message });
      onError(message);
    }
  }, [onError]);

  const loadLatest = useCallback((scope: CanonicalTimelineScope) => load(scope, "latest"), [load]);
  const loadEarlier = useCallback((scope: CanonicalTimelineScope, beforeCursor: string) => (
    load(scope, "before", beforeCursor)
  ), [load]);
  const ingestLiveEvent = useCallback((projectId: string, event: WorkbenchLiveEvent): {
    handled: boolean;
    refreshAgentProjection: boolean;
  } => {
    if (event.event !== "timeline.patch") return { handled: false, refreshAgentProjection: false };
    dispatch({ type: "envelope.received", projectId, envelope: event.data });
    return {
      handled: true,
      refreshAgentProjection: event.data.agentSurfaceId !== "main-agent"
        || event.data.cells.some((cell) => cell.targetAgentSurfaceId),
    };
  }, []);
  const clearProject = useCallback((projectId: string) => {
    dispatch({ type: "project.cleaned", projectId });
  }, []);
  const clearConversation = useCallback((projectId: string, conversationId: string) => {
    dispatch({ type: "conversation.cleaned", projectId, conversationId });
  }, []);

  return { state, loadLatest, loadEarlier, ingestLiveEvent, clearProject, clearConversation };
}
