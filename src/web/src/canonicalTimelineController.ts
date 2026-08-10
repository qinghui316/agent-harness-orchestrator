import { useCallback, useReducer, useRef } from "react";
import { fetchJson } from "./api.js";
import {
  canonicalTimelineReducer,
  canonicalTimelineScopeKey,
  createCanonicalTimelineState,
  type CanonicalTimelineRequestKind,
} from "./canonicalTimelineStore.js";
import type { CanonicalTimelineEnvelope, CanonicalTimelinePage, CanonicalTimelineScope } from "./types.js";

export type CanonicalTimelineReconnectCandidate = {
  target: {
    kind: string;
    conversationId?: string;
    agentSurfaceId?: string;
  };
};

export function canonicalTimelineReconnectScopes(
  projectId: string,
  productMode: CanonicalTimelineScope["productMode"],
  conversationId: string,
  candidates: readonly CanonicalTimelineReconnectCandidate[],
): CanonicalTimelineScope[] {
  const surfaceIds = new Set(["main-agent"]);
  for (const candidate of candidates) {
    if (candidate.target.kind === "agent"
      && candidate.target.conversationId === conversationId
      && candidate.target.agentSurfaceId) {
      surfaceIds.add(candidate.target.agentSurfaceId);
    }
  }
  return [...surfaceIds].map((agentSurfaceId) => ({ projectId, productMode, conversationId, agentSurfaceId }));
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
    const params = new URLSearchParams({ productMode: scope.productMode, agentSurfaceId: scope.agentSurfaceId, limit: "100" });
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
  const ingestEnvelope = useCallback((projectId: string, envelope: CanonicalTimelineEnvelope): void => {
    dispatch({ type: "envelope.received", projectId, envelope });
  }, []);
  const clearProject = useCallback((projectId: string) => {
    dispatch({ type: "project.cleaned", projectId });
  }, []);
  const clearConversation = useCallback((projectId: string, conversationId: string) => {
    dispatch({ type: "conversation.cleaned", projectId, conversationId });
  }, []);

  return { state, loadLatest, loadEarlier, ingestEnvelope, clearProject, clearConversation };
}
