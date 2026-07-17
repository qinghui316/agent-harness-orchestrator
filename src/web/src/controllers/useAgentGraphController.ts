import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchJson } from "../api.js";
import type { AgentRelationGraph, AgentRelationGraphNode, AgentWorkspace, Snapshot } from "../types.js";

export const AGENT_GRAPH_REFRESH_DELAY_MS = 180;
export const AGENT_GRAPH_MAX_RETRIES = 8;

export type AgentGraphLoadState = "idle" | "loading" | "ready" | "error";

export interface AgentGraphProjection {
  graph: AgentRelationGraph;
  workspace: AgentWorkspace;
}

export interface AgentGraphControllerPorts {
  loadGraph?: (projectId: string, conversationId: string) => Promise<AgentRelationGraph>;
  loadSnapshotWorkspace?: (projectId: string, conversationId: string) => Promise<AgentWorkspace>;
  updateSessionProjection: (projection: AgentGraphProjection) => void;
  cleanupResources: (transition: "graph-scope-changed") => void;
  openAgentSurface: (target: { conversationId: string; agentSurfaceId: string }) => void;
  closeGraphView: () => void;
}

export interface AgentGraphControllerInput {
  projectId: string | null;
  conversationId: string | null;
  graphViewOpen: boolean;
  snapshotGraph: AgentRelationGraph | null;
  snapshotWorkspace: AgentWorkspace;
  invalidationToken?: unknown;
  ports: AgentGraphControllerPorts;
}

export interface AgentGraphController {
  graph: AgentRelationGraph;
  loadedGraph: AgentRelationGraph | null;
  loadState: AgentGraphLoadState;
  loadError: string | null;
  selectedNode: AgentRelationGraphNode | null;
  selectedNodeId: string | null;
  reload: () => void;
  refreshProjection: () => void;
  waitForAgentSurface: (agentSurfaceId: string) => void;
  selectNode: (nodeId: string) => void;
}

export function emptyAgentRelationGraph(): AgentRelationGraph {
  return {
    title: "Agent 关系",
    summary: "真实子 Agent 开始工作后，会在这里显示父子关系。",
    nodes: [],
    edges: [],
  };
}

export function isAgentRelationGraph(value: unknown): value is AgentRelationGraph {
  if (!value || typeof value !== "object") return false;
  const graph = value as Partial<AgentRelationGraph>;
  return typeof graph.title === "string"
    && typeof graph.summary === "string"
    && Array.isArray(graph.nodes)
    && Array.isArray(graph.edges);
}

export function advancePendingAgentSurfaceWaits(
  pending: Map<string, number>,
  availableAgentIds: ReadonlySet<string> = new Set(),
): boolean {
  let shouldRetry = false;
  for (const [agentSurfaceId, attempt] of pending) {
    if (availableAgentIds.has(agentSurfaceId) || attempt >= AGENT_GRAPH_MAX_RETRIES) {
      pending.delete(agentSurfaceId);
      continue;
    }
    pending.set(agentSurfaceId, attempt + 1);
    shouldRetry = true;
  }
  return shouldRetry;
}

export function useAgentGraphController({
  projectId,
  conversationId,
  graphViewOpen,
  snapshotGraph,
  snapshotWorkspace,
  invalidationToken,
  ports,
}: AgentGraphControllerInput): AgentGraphController {
  const [loadedGraph, setLoadedGraph] = useState<AgentRelationGraph | null>(null);
  const [loadState, setLoadState] = useState<AgentGraphLoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [reloadVersion, setReloadVersion] = useState(0);
  const portsRef = useRef(ports);
  const contextRef = useRef<string | null>(null);
  const graphScopeRef = useRef<string | null>(null);
  const workspaceRef = useRef(snapshotWorkspace);
  const refreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshInFlightRef = useRef(false);
  const refreshQueuedRef = useRef(false);
  const pendingAgentSurfacesRef = useRef(new Map<string, number>());
  const generationRef = useRef(0);
  const graphLoadTokenRef = useRef(0);

  portsRef.current = ports;
  workspaceRef.current = snapshotWorkspace;
  contextRef.current = projectId && conversationId ? `${projectId}:${conversationId}` : null;

  const cancelRefresh = useCallback(() => {
    if (refreshTimerRef.current) globalThis.clearTimeout(refreshTimerRef.current);
    refreshTimerRef.current = null;
    refreshInFlightRef.current = false;
    refreshQueuedRef.current = false;
  }, []);

  const scheduleProjectionRefreshRef = useRef<() => void>(() => undefined);
  const scheduleProjectionRefresh = useCallback((): void => {
    if (!projectId || !conversationId) return;
    if (refreshInFlightRef.current) {
      refreshQueuedRef.current = true;
      return;
    }
    if (refreshTimerRef.current) return;
    const requestContext = `${projectId}:${conversationId}`;
    const requestGeneration = generationRef.current;
    refreshTimerRef.current = globalThis.setTimeout(() => {
      refreshTimerRef.current = null;
      refreshInFlightRef.current = true;
      void Promise.all([
        (portsRef.current.loadSnapshotWorkspace ?? loadAgentWorkspace)(projectId, conversationId),
        (portsRef.current.loadGraph ?? loadAgentGraph)(projectId, conversationId),
      ]).then(([workspace, graph]) => {
        if (generationRef.current !== requestGeneration || contextRef.current !== requestContext) return;
        if (!isAgentRelationGraph(graph)) throw new Error("invalid-agent-graph");
        workspaceRef.current = workspace;
        setLoadedGraph(graph);
        portsRef.current.updateSessionProjection({ graph, workspace });
        if (advancePendingAgentSurfaceWaits(
          pendingAgentSurfacesRef.current,
          new Set(workspace.agents.map((agent) => agent.id)),
        )) {
          refreshQueuedRef.current = true;
        }
      }).catch(() => {
        if (generationRef.current !== requestGeneration || contextRef.current !== requestContext) return;
        if (advancePendingAgentSurfaceWaits(pendingAgentSurfacesRef.current)) {
          refreshQueuedRef.current = true;
        }
      }).finally(() => {
        if (generationRef.current !== requestGeneration || contextRef.current !== requestContext) return;
        refreshInFlightRef.current = false;
        if (refreshQueuedRef.current) {
          refreshQueuedRef.current = false;
          scheduleProjectionRefreshRef.current();
        }
      });
    }, AGENT_GRAPH_REFRESH_DELAY_MS);
  }, [conversationId, projectId]);
  scheduleProjectionRefreshRef.current = scheduleProjectionRefresh;

  useEffect(() => {
    generationRef.current += 1;
    cancelRefresh();
    pendingAgentSurfacesRef.current.clear();
    graphScopeRef.current = null;
    setLoadedGraph(null);
    setLoadState("idle");
    setLoadError(null);
    setSelectedNodeId(null);
  }, [cancelRefresh, conversationId, projectId]);

  useEffect(() => () => {
    generationRef.current += 1;
    cancelRefresh();
    pendingAgentSurfacesRef.current.clear();
  }, [cancelRefresh]);

  useEffect(() => {
    const loadToken = ++graphLoadTokenRef.current;
    if (!graphViewOpen || !projectId || !conversationId) return;
    const requestContext = `${projectId}:${conversationId}`;
    const requestGeneration = generationRef.current;
    setLoadState("loading");
    setLoadError(null);
    void (portsRef.current.loadGraph ?? loadAgentGraph)(projectId, conversationId).then((graph) => {
      if (graphLoadTokenRef.current !== loadToken
        || generationRef.current !== requestGeneration
        || contextRef.current !== requestContext) return;
      if (!isAgentRelationGraph(graph) || graph.nodes.length === 0) {
        setLoadState("error");
        setLoadError("无法加载 Agent 关系，请重试。");
        return;
      }
      setLoadedGraph(graph);
      setLoadState("ready");
    }).catch(() => {
      if (graphLoadTokenRef.current !== loadToken
        || generationRef.current !== requestGeneration
        || contextRef.current !== requestContext) return;
      setLoadState("error");
      setLoadError("暂时无法读取 Agent 关系，请重试。");
    });
    return () => {
      if (graphLoadTokenRef.current === loadToken) graphLoadTokenRef.current += 1;
    };
  }, [conversationId, graphViewOpen, invalidationToken, projectId, reloadVersion]);

  const graph = isAgentRelationGraph(loadedGraph)
    ? loadedGraph
    : isAgentRelationGraph(snapshotGraph)
      ? snapshotGraph
      : emptyAgentRelationGraph();

  useEffect(() => {
    const graphScopeId = graph.graphScopeId ?? null;
    if (!graphScopeId) return;
    const previous = graphScopeRef.current;
    graphScopeRef.current = graphScopeId;
    if (!previous || previous === graphScopeId) return;
    setSelectedNodeId(null);
    pendingAgentSurfacesRef.current.clear();
    portsRef.current.cleanupResources("graph-scope-changed");
  }, [graph.graphScopeId]);

  const selectedNode = useMemo(() => (
    graph.nodes.find((node) => node.id === selectedNodeId) ?? graph.nodes[0] ?? null
  ), [graph.nodes, selectedNodeId]);

  const waitForAgentSurface = useCallback((agentSurfaceId: string): void => {
    if (!agentSurfaceId || agentSurfaceId === "main-agent") return;
    if (!workspaceRef.current.agents.some((agent) => agent.id === agentSurfaceId)) {
      pendingAgentSurfacesRef.current.set(agentSurfaceId, 0);
    }
    scheduleProjectionRefreshRef.current();
  }, []);

  const selectNode = useCallback((nodeId: string): void => {
    const node = graph.nodes.find((candidate) => candidate.id === nodeId);
    if (!node) return;
    setSelectedNodeId(nodeId);
    if (node.kind === "main-agent") {
      portsRef.current.closeGraphView();
      return;
    }
    const agentSurfaceId = node.target.agentSurfaceId;
    if (!agentSurfaceId || agentSurfaceId === "main-agent" || !conversationId) return;
    portsRef.current.openAgentSurface({ conversationId, agentSurfaceId });
    waitForAgentSurface(agentSurfaceId);
  }, [conversationId, graph.nodes, waitForAgentSurface]);

  return {
    graph,
    loadedGraph,
    loadState,
    loadError,
    selectedNode,
    selectedNodeId,
    reload: () => setReloadVersion((value) => value + 1),
    refreshProjection: scheduleProjectionRefresh,
    waitForAgentSurface,
    selectNode,
  };
}

function loadAgentGraph(projectId: string, conversationId: string): Promise<AgentRelationGraph> {
  return fetchJson<AgentRelationGraph>(
    `/api/projects/${encodeURIComponent(projectId)}/workbench/projections/agent-graph/${encodeURIComponent(conversationId)}`,
  );
}

async function loadAgentWorkspace(projectId: string, conversationId: string): Promise<AgentWorkspace> {
  return (
    await fetchJson<Snapshot>(
      `/api/projects/${encodeURIComponent(projectId)}/workbench/snapshot?topic=${encodeURIComponent(conversationId)}`,
    )
  ).right.agentWorkspace;
}
