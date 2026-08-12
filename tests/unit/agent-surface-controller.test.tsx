// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AGENT_SURFACE_REFRESH_DELAY_MS,
  useAgentSurfaceController,
  type AgentSurfaceControllerPorts,
} from "../../src/web/src/controllers/useAgentSurfaceController.js";
import type { AgentSurfaceProjection } from "../../src/web/src/types.js";

function projection(scope = "scope-1", hash = "hash-1"): AgentSurfaceProjection {
  return {
    projectId: "project-1",
    productMode: "harness",
    conversationId: "conversation-1",
    graphScopeId: scope,
    scopeStatus: "active",
    projectionHash: hash,
    surfaces: [
      { agentSurfaceId: "main-agent", kind: "main-agent", roleId: "main-agent", roleDisplayName: "Main Agent", label: "主 Agent", description: "", skills: [], parentAgentSurfaceId: null, graphScopeId: scope, scopeRange: "current", status: "running", readOnly: false, createdAt: "2026-07-18T00:00:00Z" },
      { agentSurfaceId: "agent:child", kind: "agent", roleId: "planning-agent", roleDisplayName: "Planning Agent", label: "Plan Agent", description: "", skills: ["planning"], parentAgentSurfaceId: "main-agent", graphScopeId: scope, scopeRange: "current", status: "running", readOnly: false, createdAt: "2026-07-18T00:00:01Z" },
    ],
    diagnostics: [],
  };
}

function agentProjection(scope = "agent-scope", hash = "agent-hash"): AgentSurfaceProjection {
  return { ...projection(scope, hash), productMode: "agent" };
}

function ports(overrides: Partial<AgentSurfaceControllerPorts> = {}): AgentSurfaceControllerPorts {
  return {
    loadProjection: vi.fn(async () => projection()),
    cleanupResources: vi.fn(),
    openAgentSurface: vi.fn(),
    closeOfficeView: vi.fn(),
    ...overrides,
  };
}

afterEach(() => vi.useRealTimers());

describe("AgentSurfaceController", () => {
  it("loads one projection and navigates by exact agentSurfaceId", async () => {
    const ownerPorts = ports();
    const { result, rerender } = renderHook(() => useAgentSurfaceController({ projectId: "project-1", productMode: "harness", conversationId: "conversation-1", officeViewOpen: true, ports: ownerPorts }));
    await waitFor(() => expect(result.current.loadState).toBe("ready"));
    expect(ownerPorts.loadProjection).toHaveBeenCalledTimes(1);
    rerender();
    await act(async () => Promise.resolve());
    expect(ownerPorts.loadProjection).toHaveBeenCalledTimes(1);
    expect(result.current.projection?.projectionHash).toBe("hash-1");
    act(() => result.current.selectSurface("agent:child"));
    expect(ownerPorts.openAgentSurface).toHaveBeenCalledWith({ conversationId: "conversation-1", agentSurfaceId: "agent:child" });
    act(() => result.current.selectSurface("main-agent"));
    expect(ownerPorts.closeOfficeView).toHaveBeenCalledTimes(1);
  });

  it("refreshes once before opening an exact surface that arrived after the Office projection", async () => {
    const first = { ...projection(), projectionHash: "main-only", surfaces: [projection().surfaces[0]!] };
    const loadProjection = vi.fn(async () => first);
    const ownerPorts = ports({ loadProjection });
    const { result } = renderHook(() => useAgentSurfaceController({ projectId: "project-1", productMode: "harness", conversationId: "conversation-1", officeViewOpen: true, ports: ownerPorts }));
    await waitFor(() => expect(result.current.projection?.projectionHash).toBe("main-only"));
    loadProjection.mockResolvedValueOnce(projection("scope-1", "with-child"));
    let outcome: "opened" | "stale" | "error" | undefined;
    await act(async () => { outcome = await result.current.openExactSurface("agent:child", "scope-1"); });
    expect(outcome).toBe("opened");
    expect(ownerPorts.openAgentSurface).toHaveBeenCalledWith({ conversationId: "conversation-1", agentSurfaceId: "agent:child" });
    expect(loadProjection).toHaveBeenCalled();
    expect(ownerPorts.cleanupResources).not.toHaveBeenCalled();
  });

  it("cleans resources once and refuses navigation when exact refresh advances the graph scope", async () => {
    const first = { ...projection(), projectionHash: "main-only", surfaces: [projection().surfaces[0]!] };
    const loadProjection = vi.fn()
      .mockResolvedValueOnce(first)
      .mockResolvedValueOnce(projection("scope-2", "scope-2-with-child"));
    const ownerPorts = ports({ loadProjection });
    const { result } = renderHook(() => useAgentSurfaceController({
      projectId: "project-1",
      productMode: "harness",
      conversationId: "conversation-1",
      officeViewOpen: true,
      ports: ownerPorts,
    }));
    await waitFor(() => expect(result.current.projection?.projectionHash).toBe("main-only"));

    let outcome: "opened" | "stale" | "error" | undefined;
    await act(async () => { outcome = await result.current.openExactSurface("agent:child", "scope-1"); });

    expect(outcome).toBe("stale");
    await waitFor(() => expect(ownerPorts.cleanupResources).toHaveBeenCalledTimes(1));
    expect(ownerPorts.cleanupResources).toHaveBeenCalledWith("graph-scope-changed");
    expect(ownerPorts.openAgentSurface).not.toHaveBeenCalled();
    expect(ownerPorts.closeOfficeView).not.toHaveBeenCalled();
  });

  it("does not open a tab when the exact surface remains missing or the scope is stale", async () => {
    const mainOnly = { ...projection(), projectionHash: "main-only", surfaces: [projection().surfaces[0]!] };
    const ownerPorts = ports({ loadProjection: vi.fn(async () => mainOnly) });
    const { result } = renderHook(() => useAgentSurfaceController({ projectId: "project-1", productMode: "harness", conversationId: "conversation-1", officeViewOpen: true, ports: ownerPorts }));
    await waitFor(() => expect(result.current.loadState).toBe("ready"));
    await expect(result.current.openExactSurface("agent:missing", "scope-1")).resolves.toBe("stale");
    await expect(result.current.openExactSurface("main-agent", "scope-old")).resolves.toBe("stale");
    expect(ownerPorts.openAgentSurface).not.toHaveBeenCalled();
    expect(ownerPorts.closeOfficeView).not.toHaveBeenCalled();
  });

  it("coalesces invalidations and ignores a different conversation", async () => {
    vi.useFakeTimers();
    const loadProjection = vi.fn(async () => projection());
    const ownerPorts = ports({ loadProjection });
    const { result } = renderHook(() => useAgentSurfaceController({ projectId: "project-1", productMode: "harness", conversationId: "conversation-1", officeViewOpen: false, ports: ownerPorts }));
    await act(async () => Promise.resolve());
    act(() => {
      result.current.invalidate({ conversationId: "conversation-2" });
      result.current.invalidate({ conversationId: "conversation-1" });
      result.current.invalidate({ conversationId: "conversation-1" });
    });
    await act(async () => vi.advanceTimersByTimeAsync(AGENT_SURFACE_REFRESH_DELAY_MS));
    expect(loadProjection).toHaveBeenCalledTimes(2);
  });

  it("cleans resources once when a newly loaded projection changes graph scope", async () => {
    const loadProjection = vi.fn()
      .mockResolvedValueOnce(projection("scope-1", "hash-1"))
      .mockResolvedValueOnce({ ...projection("scope-2", "hash-2"), conversationId: "conversation-2" });
    const ownerPorts = ports({ loadProjection });
    const { result, rerender } = renderHook(({ conversationId }) => useAgentSurfaceController({
      projectId: "project-1",
      productMode: "harness",
      conversationId,
      officeViewOpen: true,
      ports: ownerPorts,
    }), { initialProps: { conversationId: "conversation-1" } });
    await waitFor(() => expect(result.current.projection?.graphScopeId).toBe("scope-1"));

    rerender({ conversationId: "conversation-2" });
    await waitFor(() => expect(result.current.projection?.graphScopeId).toBe("scope-2"));
    expect(ownerPorts.cleanupResources).toHaveBeenCalledTimes(1);
    expect(ownerPorts.cleanupResources).toHaveBeenCalledWith("graph-scope-changed");
  });

  it("drops a late response after the conversation changes", async () => {
    let resolveFirst!: (value: AgentSurfaceProjection) => void;
    const first = new Promise<AgentSurfaceProjection>((resolve) => { resolveFirst = resolve; });
    const loadProjection = vi.fn().mockReturnValueOnce(first).mockResolvedValueOnce({ ...projection("scope-2", "hash-2"), conversationId: "conversation-2" });
    const ownerPorts = ports({ loadProjection });
    const { result, rerender } = renderHook(({ conversationId }) => useAgentSurfaceController({ projectId: "project-1", productMode: "harness", conversationId, officeViewOpen: true, ports: ownerPorts }), { initialProps: { conversationId: "conversation-1" } });
    rerender({ conversationId: "conversation-2" });
    await waitFor(() => expect(result.current.projection?.graphScopeId).toBe("scope-2"));
    act(() => resolveFirst(projection("stale", "stale")));
    await act(async () => Promise.resolve());
    expect(result.current.projection?.graphScopeId).toBe("scope-2");
  });

  it("drops a late response after the product mode changes", async () => {
    let resolveAgent!: (value: AgentSurfaceProjection) => void;
    const agent = new Promise<AgentSurfaceProjection>((resolve) => { resolveAgent = resolve; });
    const loadProjection = vi.fn()
      .mockReturnValueOnce(agent)
      .mockResolvedValueOnce(projection("harness-scope", "harness-hash"));
    const ownerPorts = ports({ loadProjection });
    const { result, rerender } = renderHook(({ productMode }: { productMode: "agent" | "harness" }) => useAgentSurfaceController({
      projectId: "project-1",
      productMode,
      conversationId: "conversation-1",
      officeViewOpen: true,
      ports: ownerPorts,
    }), { initialProps: { productMode: "agent" as const } });
    rerender({ productMode: "harness" });
    await waitFor(() => expect(result.current.projection?.projectionHash).toBe("harness-hash"));
    act(() => resolveAgent(agentProjection("stale-agent", "stale-agent")));
    await act(async () => Promise.resolve());
    expect(result.current.projection?.productMode).toBe("harness");
    expect(result.current.projection?.projectionHash).toBe("harness-hash");
  });

  it("does not request a projection for a provisional conversation", async () => {
    const ownerPorts = ports();
    const { result } = renderHook(() => useAgentSurfaceController({
      projectId: "project-1",
      productMode: "harness",
      conversationId: "pending:test",
      officeViewOpen: true,
      ports: ownerPorts,
    }));
    await act(async () => Promise.resolve());
    expect(ownerPorts.loadProjection).not.toHaveBeenCalled();
    expect(result.current.loadState).toBe("idle");
  });

  it("accepts terminated Agent surfaces", async () => {
    const terminated = projection();
    terminated.surfaces[1] = { ...terminated.surfaces[1]!, status: "terminated", readOnly: true };
    const ownerPorts = ports({ loadProjection: vi.fn(async () => terminated) });
    const { result } = renderHook(() => useAgentSurfaceController({
      projectId: "project-1",
      productMode: "harness",
      conversationId: "conversation-1",
      officeViewOpen: true,
      ports: ownerPorts,
    }));
    await waitFor(() => expect(result.current.loadState).toBe("ready"));
    expect(result.current.surfaces[1]?.status).toBe("terminated");
  });
});
