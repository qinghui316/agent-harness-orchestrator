import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "../api.js";
import type { AgentSurfaceProjection, AgentSurfaceProjectionItem, AgentSurfacesInvalidationReason, ProductMode } from "../types.js";

export const AGENT_SURFACE_REFRESH_DELAY_MS = 120;

export type AgentSurfaceLoadState = "idle" | "loading" | "ready" | "error";

export interface AgentSurfaceControllerPorts {
  loadProjection?: (projectId: string, productMode: ProductMode, conversationId: string) => Promise<AgentSurfaceProjection>;
  cleanupResources: (transition: "graph-scope-changed") => void;
  openAgentSurface: (target: { conversationId: string; agentSurfaceId: string }) => void;
  closeOfficeView: () => void;
}

export interface AgentSurfaceControllerInput {
  projectId: string | null;
  productMode: ProductMode;
  conversationId: string | null;
  officeViewOpen: boolean;
  invalidationToken?: unknown;
  ports: AgentSurfaceControllerPorts;
}

export interface AgentSurfaceController {
  projection: AgentSurfaceProjection | null;
  surfaces: AgentSurfaceProjectionItem[];
  loadState: AgentSurfaceLoadState;
  loadError: string | null;
  selectedSurface: AgentSurfaceProjectionItem | null;
  selectedSurfaceId: string | null;
  reload(): void;
  invalidate(input?: { conversationId?: string; graphScopeId?: string; reason?: AgentSurfacesInvalidationReason }): void;
  selectSurface(agentSurfaceId: string): void;
  openExactSurface(agentSurfaceId: string, expectedGraphScopeId: string): Promise<"opened" | "stale" | "error">;
}

export function isAgentSurfaceProjection(value: unknown): value is AgentSurfaceProjection {
  if (!value || typeof value !== "object") return false;
  const projection = value as Partial<AgentSurfaceProjection>;
  return typeof projection.conversationId === "string"
    && typeof projection.projectId === "string"
    && (projection.productMode === "agent" || projection.productMode === "harness")
    && typeof projection.graphScopeId === "string"
    && (projection.scopeStatus === "active" || projection.scopeStatus === "terminal")
    && typeof projection.projectionHash === "string"
    && Array.isArray(projection.surfaces)
    && projection.surfaces.every(isAgentSurface)
    && Array.isArray(projection.diagnostics);
}

export function useAgentSurfaceController({
  projectId,
  productMode,
  conversationId,
  invalidationToken,
  ports,
}: AgentSurfaceControllerInput): AgentSurfaceController {
  const canonicalConversationId = conversationId?.startsWith("pending:") ? null : conversationId;
  const [projection, setProjection] = useState<AgentSurfaceProjection | null>(null);
  const [loadState, setLoadState] = useState<AgentSurfaceLoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedSurfaceId, setSelectedSurfaceId] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const portsRef = useRef(ports);
  const contextRef = useRef<string | null>(null);
  const generationRef = useRef(0);
  const requestRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef(false);
  const queuedRef = useRef(false);
  const graphScopeRef = useRef<string | null>(null);
  const projectionRef = useRef<AgentSurfaceProjection | null>(null);
  portsRef.current = ports;
  contextRef.current = projectId && canonicalConversationId ? selectionContext(projectId, productMode, canonicalConversationId) : null;

  const readProjection = useCallback(async (foreground: boolean): Promise<void> => {
    if (!projectId || !canonicalConversationId || inFlightRef.current) {
      if (projectId && canonicalConversationId) queuedRef.current = true;
      return;
    }
    const generation = generationRef.current;
    const context = selectionContext(projectId, productMode, canonicalConversationId);
    const request = ++requestRef.current;
    inFlightRef.current = true;
    if (foreground) setLoadState("loading");
    setLoadError(null);
    try {
      const next = await (portsRef.current.loadProjection ?? loadAgentSurfaceProjection)(projectId, productMode, canonicalConversationId);
      if (generationRef.current !== generation || contextRef.current !== context || requestRef.current !== request) return;
      if (!projectionMatchesSelection(next, projectId, productMode, canonicalConversationId)
        || !next.surfaces.some((surface) => surface.kind === "main-agent")) {
        throw new Error("invalid-agent-surface-projection");
      }
      projectionRef.current = next;
      setProjection((current) => current?.projectionHash === next.projectionHash ? current : next);
      setLoadState("ready");
    } catch {
      if (generationRef.current !== generation || contextRef.current !== context || requestRef.current !== request) return;
      if (foreground || !projectionRef.current) setLoadState("error");
      setLoadError("暂时无法读取 Agent 工作区，请重试。");
    } finally {
      const requestIsCurrent = generationRef.current === generation && contextRef.current === context && requestRef.current === request;
      if (requestIsCurrent) {
        inFlightRef.current = false;
        if (queuedRef.current) {
          queuedRef.current = false;
          void readProjection(false);
        }
      }
    }
  }, [canonicalConversationId, productMode, projectId]);

  const invalidate = useCallback((input?: { conversationId?: string; graphScopeId?: string; reason?: AgentSurfacesInvalidationReason }): void => {
    if (!projectId || !canonicalConversationId || (input?.conversationId && input.conversationId !== canonicalConversationId)) return;
    if (input?.graphScopeId && graphScopeRef.current && input.graphScopeId !== graphScopeRef.current && input.reason !== "scope-changed") return;
    if (inFlightRef.current) {
      queuedRef.current = true;
      return;
    }
    if (timerRef.current) return;
    timerRef.current = globalThis.setTimeout(() => {
      timerRef.current = null;
      void readProjection(false);
    }, AGENT_SURFACE_REFRESH_DELAY_MS);
  }, [canonicalConversationId, projectId, readProjection]);

  useEffect(() => {
    generationRef.current += 1;
    requestRef.current += 1;
    if (timerRef.current) globalThis.clearTimeout(timerRef.current);
    timerRef.current = null;
    inFlightRef.current = false;
    queuedRef.current = false;
    projectionRef.current = null;
    setProjection(null);
    setSelectedSurfaceId(null);
    setLoadError(null);
    setLoadState(projectId && canonicalConversationId ? "loading" : "idle");
    if (projectId && canonicalConversationId) void readProjection(true);
  }, [canonicalConversationId, productMode, projectId, reloadVersion]);

  useEffect(() => {
    if (invalidationToken === undefined) return;
    invalidate();
  }, [invalidationToken, invalidate]);

  useEffect(() => () => {
    generationRef.current += 1;
    requestRef.current += 1;
    if (timerRef.current) globalThis.clearTimeout(timerRef.current);
  }, []);

  useEffect(() => {
    if (!projection?.graphScopeId) return;
    const previous = graphScopeRef.current;
    graphScopeRef.current = projection.graphScopeId;
    if (!previous || previous === projection.graphScopeId) return;
    setSelectedSurfaceId(null);
    portsRef.current.cleanupResources("graph-scope-changed");
  }, [projection?.graphScopeId]);

  const surfaces = projection?.surfaces ?? [];
  const selectedSurface = useMemo(() => (
    surfaces.find((surface) => surface.agentSurfaceId === selectedSurfaceId)
      ?? surfaces.find((surface) => surface.kind === "main-agent")
      ?? null
  ), [selectedSurfaceId, surfaces]);

  const selectSurface = useCallback((agentSurfaceId: string): void => {
    const surface = surfaces.find((candidate) => candidate.agentSurfaceId === agentSurfaceId);
    if (!surface) return;
    setSelectedSurfaceId(agentSurfaceId);
    if (surface.kind === "main-agent") {
      portsRef.current.closeOfficeView();
      return;
    }
    if (!canonicalConversationId) return;
    portsRef.current.openAgentSurface({ conversationId: canonicalConversationId, agentSurfaceId: surface.agentSurfaceId });
  }, [canonicalConversationId, surfaces]);

  const openExactSurface = useCallback(async (
    agentSurfaceId: string,
    expectedGraphScopeId: string,
  ): Promise<"opened" | "stale" | "error"> => {
    if (!projectId || !canonicalConversationId) return "stale";
    const generation = generationRef.current;
    const context = selectionContext(projectId, productMode, canonicalConversationId);
    let candidate = projectionRef.current;
    if (candidate?.graphScopeId !== expectedGraphScopeId
      || !candidate.surfaces.some((surface) => surface.agentSurfaceId === agentSurfaceId)) {
      try {
        const refreshed = await (portsRef.current.loadProjection ?? loadAgentSurfaceProjection)(projectId, productMode, canonicalConversationId);
        if (generationRef.current !== generation || contextRef.current !== context) return "stale";
        if (!projectionMatchesSelection(refreshed, projectId, productMode, canonicalConversationId)) return "error";
        projectionRef.current = refreshed;
        graphScopeRef.current = refreshed.graphScopeId;
        setProjection((current) => current?.projectionHash === refreshed.projectionHash ? current : refreshed);
        setLoadState("ready");
        setLoadError(null);
        candidate = refreshed;
      } catch {
        if (generationRef.current === generation && contextRef.current === context) {
          setLoadError("暂时无法同步 Agent 工作区，请重试。");
        }
        return "error";
      }
    }
    if (candidate.graphScopeId !== expectedGraphScopeId) return "stale";
    const surface = candidate.surfaces.find((item) => item.agentSurfaceId === agentSurfaceId);
    if (!surface) return "stale";
    setSelectedSurfaceId(agentSurfaceId);
    if (surface.kind === "main-agent") portsRef.current.closeOfficeView();
    else portsRef.current.openAgentSurface({ conversationId: canonicalConversationId, agentSurfaceId });
    return "opened";
  }, [canonicalConversationId, productMode, projectId]);

  return {
    projection,
    surfaces,
    loadState,
    loadError,
    selectedSurface,
    selectedSurfaceId,
    reload: () => setReloadVersion((value) => value + 1),
    invalidate,
    selectSurface,
    openExactSurface,
  };
}

function isAgentSurface(value: unknown): value is AgentSurfaceProjectionItem {
  if (!value || typeof value !== "object") return false;
  const surface = value as Partial<AgentSurfaceProjectionItem>;
  return typeof surface.agentSurfaceId === "string"
    && (surface.kind === "main-agent" || surface.kind === "agent")
    && typeof surface.label === "string"
    && typeof surface.roleId === "string"
    && typeof surface.roleDisplayName === "string"
    && typeof surface.description === "string"
    && Array.isArray(surface.skills)
    && surface.skills.every((skill) => typeof skill === "string")
    && (surface.parentAgentSurfaceId === null || typeof surface.parentAgentSurfaceId === "string")
    && typeof surface.graphScopeId === "string"
    && (surface.scopeRange === "current" || surface.scopeRange === "historical")
    && (surface.status === "idle" || surface.status === "queued" || surface.status === "running" || surface.status === "completed" || surface.status === "needs-change" || surface.status === "failed" || surface.status === "waiting-user" || surface.status === "interrupted" || surface.status === "terminated")
    && typeof surface.readOnly === "boolean"
    && typeof surface.createdAt === "string";
}

function loadAgentSurfaceProjection(projectId: string, productMode: ProductMode, conversationId: string): Promise<AgentSurfaceProjection> {
  return fetchJson<AgentSurfaceProjection>(
    `/api/projects/${encodeURIComponent(projectId)}/workbench/projections/agent-surfaces/${encodeURIComponent(conversationId)}?productMode=${encodeURIComponent(productMode)}`,
  );
}

function selectionContext(projectId: string, productMode: ProductMode, conversationId: string): string {
  return `${projectId}\0${productMode}\0${conversationId}`;
}

function projectionMatchesSelection(
  projection: unknown,
  projectId: string,
  productMode: ProductMode,
  conversationId: string,
): projection is AgentSurfaceProjection {
  return isAgentSurfaceProjection(projection)
    && projection.projectId === projectId
    && projection.productMode === productMode
    && projection.conversationId === conversationId;
}
