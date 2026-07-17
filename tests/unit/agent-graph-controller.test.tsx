// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_GRAPH_MAX_RETRIES,
  AGENT_GRAPH_REFRESH_DELAY_MS,
  advancePendingAgentSurfaceWaits,
  useAgentGraphController,
  type AgentGraphControllerPorts,
} from "../../src/web/src/controllers/useAgentGraphController.js";
import type { AgentRelationGraph, AgentWorkspace } from "../../src/web/src/types.js";

const workspace = (ids: string[] = []): AgentWorkspace => ({
  selectedAgentId: ids[0] ?? "main-agent",
  agents: ids.map((id) => ({
    id,
    roleId: "planning-agent",
    providerId: "codex",
    parentAgentId: "main-agent",
    label: `Agent ${id}`,
    status: "running",
    summary: "working",
    evidenceRefs: [],
    actions: [],
  })),
});

const graph = (scope = "scope-1", childSurfaceId = "agent:codex:thread:child-1"): AgentRelationGraph => ({
  graphScopeId: scope,
  conversationId: "conversation-1",
  title: "Agent 关系",
  summary: "server projection",
  nodes: [
    {
      id: "main-agent",
      kind: "main-agent",
      label: "主 Agent",
      roleId: "main-agent",
      status: "running",
      summary: "main",
      target: { conversationId: "conversation-1", agentSurfaceId: "main-agent" },
    },
    {
      id: "node-child",
      kind: "agent",
      label: "Plan Agent",
      roleId: "planning-agent",
      status: "running",
      summary: "planning",
      target: { conversationId: "conversation-1", agentSurfaceId: childSurfaceId },
    },
  ],
  edges: [{ id: "edge-1", from: "main-agent", to: "node-child", kind: "parent-child" }],
});

function ports(overrides: Partial<AgentGraphControllerPorts> = {}): AgentGraphControllerPorts {
  return {
    loadGraph: vi.fn(async () => graph()),
    loadSnapshotWorkspace: vi.fn(async () => workspace(["agent:codex:thread:child-1"])),
    updateSessionProjection: vi.fn(),
    cleanupResources: vi.fn(),
    openAgentSurface: vi.fn(),
    closeGraphView: vi.fn(),
    ...overrides,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("agent graph controller", () => {
  it("loads only the server graph for the graph view and exposes deterministic load state", async () => {
    const ownerPorts = ports();
    const { result } = renderHook(() => useAgentGraphController({
      projectId: "project-1",
      conversationId: "conversation-1",
      graphViewOpen: true,
      snapshotGraph: null,
      snapshotWorkspace: workspace(),
      ports: ownerPorts,
    }));

    expect(result.current.loadState).toBe("loading");
    await waitFor(() => expect(result.current.loadState).toBe("ready"));
    expect(result.current.graph.nodes.map((node) => node.id)).toEqual(["main-agent", "node-child"]);
    expect(ownerPorts.loadGraph).toHaveBeenCalledWith("project-1", "conversation-1");
    expect(ownerPorts.updateSessionProjection).not.toHaveBeenCalled();
  });

  it("reports invalid and failed graph reads and retries only when requested", async () => {
    const loadGraph = vi.fn()
      .mockResolvedValueOnce({ title: "bad", summary: "bad", nodes: [], edges: [] })
      .mockResolvedValueOnce(graph());
    const ownerPorts = ports({ loadGraph });
    const { result } = renderHook(() => useAgentGraphController({
      projectId: "project-1",
      conversationId: "conversation-1",
      graphViewOpen: true,
      snapshotGraph: null,
      snapshotWorkspace: workspace(),
      ports: ownerPorts,
    }));

    await waitFor(() => expect(result.current.loadState).toBe("error"));
    expect(result.current.loadError).toBe("无法加载 Agent 关系，请重试。");
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.loadState).toBe("ready"));
    expect(loadGraph).toHaveBeenCalledTimes(2);
  });

  it("debounces projection refresh for 180ms and updates the session from server projections", async () => {
    vi.useFakeTimers();
    const nextWorkspace = workspace(["agent:codex:thread:child-1"]);
    const nextGraph = graph();
    const ownerPorts = ports({
      loadGraph: vi.fn(async () => nextGraph),
      loadSnapshotWorkspace: vi.fn(async () => nextWorkspace),
    });
    const { result } = renderHook(() => useAgentGraphController({
      projectId: "project-1",
      conversationId: "conversation-1",
      graphViewOpen: false,
      snapshotGraph: null,
      snapshotWorkspace: workspace(),
      ports: ownerPorts,
    }));

    act(() => {
      result.current.refreshProjection();
      result.current.refreshProjection();
      vi.advanceTimersByTime(AGENT_GRAPH_REFRESH_DELAY_MS - 1);
    });
    expect(ownerPorts.loadGraph).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(ownerPorts.updateSessionProjection).toHaveBeenCalledTimes(1);
    expect(ownerPorts.updateSessionProjection).toHaveBeenCalledWith({ graph: nextGraph, workspace: nextWorkspace });
  });

  it("keeps exactly eight retries for a pending agent surface", () => {
    const pending = new Map([["agent:late", 0]]);
    for (let retry = 0; retry < AGENT_GRAPH_MAX_RETRIES; retry += 1) {
      expect(advancePendingAgentSurfaceWaits(pending)).toBe(true);
      expect(pending.get("agent:late")).toBe(retry + 1);
    }
    expect(advancePendingAgentSurfaceWaits(pending)).toBe(false);
    expect(pending.size).toBe(0);
  });

  it("stops retrying as soon as the pending canonical surface appears", async () => {
    vi.useFakeTimers();
    const loadSnapshotWorkspace = vi.fn()
      .mockResolvedValueOnce(workspace())
      .mockResolvedValueOnce(workspace(["agent:codex:thread:child-1"]));
    const ownerPorts = ports({ loadSnapshotWorkspace });
    const { result } = renderHook(() => useAgentGraphController({
      projectId: "project-1",
      conversationId: "conversation-1",
      graphViewOpen: false,
      snapshotGraph: graph(),
      snapshotWorkspace: workspace(),
      ports: ownerPorts,
    }));

    act(() => result.current.waitForAgentSurface("agent:codex:thread:child-1"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AGENT_GRAPH_REFRESH_DELAY_MS * 2);
    });
    expect(loadSnapshotWorkspace).toHaveBeenCalledTimes(2);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AGENT_GRAPH_REFRESH_DELAY_MS * 2);
    });
    expect(loadSnapshotWorkspace).toHaveBeenCalledTimes(2);
  });

  it("opens only the canonical child surface and keeps main navigation separate", async () => {
    vi.useFakeTimers();
    const ownerPorts = ports();
    const { result } = renderHook(() => useAgentGraphController({
      projectId: "project-1",
      conversationId: "conversation-1",
      graphViewOpen: false,
      snapshotGraph: graph(),
      snapshotWorkspace: workspace(),
      ports: ownerPorts,
    }));

    act(() => result.current.selectNode("node-child"));
    expect(ownerPorts.openAgentSurface).toHaveBeenCalledWith({
      conversationId: "conversation-1",
      agentSurfaceId: "agent:codex:thread:child-1",
    });
    expect(ownerPorts.closeGraphView).not.toHaveBeenCalled();

    act(() => result.current.selectNode("main-agent"));
    expect(ownerPorts.closeGraphView).toHaveBeenCalledTimes(1);
    expect(ownerPorts.openAgentSurface).toHaveBeenCalledTimes(1);
  });

  it("notifies resource cleanup once when the server graph scope changes", async () => {
    const ownerPorts = ports();
    const { rerender } = renderHook(({ snapshotGraph }) => useAgentGraphController({
      projectId: "project-1",
      conversationId: "conversation-1",
      graphViewOpen: false,
      snapshotGraph,
      snapshotWorkspace: workspace(),
      ports: ownerPorts,
    }), { initialProps: { snapshotGraph: graph("scope-1") } });

    rerender({ snapshotGraph: graph("scope-2") });
    await waitFor(() => expect(ownerPorts.cleanupResources).toHaveBeenCalledWith("graph-scope-changed"));
    expect(ownerPorts.cleanupResources).toHaveBeenCalledTimes(1);
  });

  it("retains the last canonical scope across an empty projection before cleanup", async () => {
    const ownerPorts = ports();
    const { rerender } = renderHook(({ snapshotGraph }: { snapshotGraph: AgentRelationGraph | null }) => useAgentGraphController({
      projectId: "project-1",
      conversationId: "conversation-1",
      graphViewOpen: false,
      snapshotGraph,
      snapshotWorkspace: workspace(),
      ports: ownerPorts,
    }), { initialProps: { snapshotGraph: graph("scope-1") as AgentRelationGraph | null } });

    rerender({ snapshotGraph: null });
    rerender({ snapshotGraph: graph("scope-2") });

    await waitFor(() => expect(ownerPorts.cleanupResources).toHaveBeenCalledWith("graph-scope-changed"));
    expect(ownerPorts.cleanupResources).toHaveBeenCalledTimes(1);
  });

  it("drops late graph view responses after the conversation changes", async () => {
    let resolveFirst!: (value: AgentRelationGraph) => void;
    const first = new Promise<AgentRelationGraph>((resolve) => { resolveFirst = resolve; });
    const loadGraph = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce({ ...graph("scope-2"), conversationId: "conversation-2" });
    const ownerPorts = ports({ loadGraph });
    const { result, rerender } = renderHook(({ conversationId }) => useAgentGraphController({
      projectId: "project-1",
      conversationId,
      graphViewOpen: true,
      snapshotGraph: null,
      snapshotWorkspace: workspace(),
      ports: ownerPorts,
    }), { initialProps: { conversationId: "conversation-1" } });

    rerender({ conversationId: "conversation-2" });
    await waitFor(() => expect(result.current.loadState).toBe("ready"));
    act(() => resolveFirst(graph("scope-stale")));
    await act(async () => Promise.resolve());
    expect(result.current.graph.graphScopeId).toBe("scope-2");
  });

  it("drops an older graph response when reload starts in the same conversation", async () => {
    let resolveFirst!: (value: AgentRelationGraph) => void;
    const first = new Promise<AgentRelationGraph>((resolve) => { resolveFirst = resolve; });
    const loadGraph = vi.fn()
      .mockReturnValueOnce(first)
      .mockResolvedValueOnce(graph("scope-current"));
    const ownerPorts = ports({ loadGraph });
    const { result } = renderHook(() => useAgentGraphController({
      projectId: "project-1",
      conversationId: "conversation-1",
      graphViewOpen: true,
      snapshotGraph: null,
      snapshotWorkspace: workspace(),
      ports: ownerPorts,
    }));

    act(() => result.current.reload());
    await waitFor(() => expect(result.current.graph.graphScopeId).toBe("scope-current"));
    act(() => resolveFirst(graph("scope-stale")));
    await act(async () => Promise.resolve());
    expect(result.current.graph.graphScopeId).toBe("scope-current");
  });
});
