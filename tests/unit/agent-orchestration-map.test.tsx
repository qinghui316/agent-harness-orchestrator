// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentOrchestrationMap } from "../../src/web/src/panels/workbench/AgentOrchestrationMap.js";
import type { AgentRelationGraph } from "../../src/web/src/types.js";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("Agent orchestration map", () => {
  it("renders a single Main node instead of a text-only empty state", () => {
    render(<AgentOrchestrationMap graph={graph([node("main-agent", "main-agent", "主 Agent")], [])} selectedNodeId={null} onSelectNode={() => undefined} />);

    expect(screen.getByTestId("agent-relation-node-main-agent")).toBeTruthy();
    expect(screen.queryByText("当前只有主 Agent")).toBeNull();
  });

  it("shows waiting attention on the exact child and keeps navigation callback scoped", () => {
    const onSelectNode = vi.fn();
    render(<AgentOrchestrationMap
      graph={graph([
        node("main-agent", "main-agent", "主 Agent"),
        { ...node("agent:codex:thread:plan", "agent", "Plan Agent", "planning-agent"), status: "waiting-user" },
      ], [{ id: "main-plan", from: "main-agent", to: "agent:codex:thread:plan", kind: "parent-child" }])}
      selectedNodeId={null}
      onSelectNode={onSelectNode}
    />);

    const child = screen.getByTestId("agent-relation-node-planning-agent");
    expect(child.textContent).toContain("需要你回答");
    fireEvent.click(child);
    expect(onSelectNode).toHaveBeenCalledWith("agent:codex:thread:plan");
  });

  it("keeps manual zoom when only Agent status changes and refits on container resize", () => {
    let resize: ResizeObserverCallback | undefined;
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: ResizeObserverCallback) { resize = callback; }
      observe() {}
      disconnect() {}
      unobserve() {}
    });
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(900);
    vi.spyOn(HTMLElement.prototype, "clientHeight", "get").mockReturnValue(600);
    const initial = graph([
      node("main-agent", "main-agent", "主 Agent"),
      node("agent:codex:thread:plan", "agent", "Plan Agent", "planning-agent"),
    ], [{ id: "main-plan", from: "main-agent", to: "agent:codex:thread:plan", kind: "parent-child" }]);
    const view = render(<AgentOrchestrationMap graph={initial} selectedNodeId={null} onSelectNode={() => undefined} />);

    fireEvent.click(view.container.querySelector('[data-testid="agent-orchestration-zoom-in"]') as HTMLElement);
    const stage = view.container.querySelector('[data-testid="agent-orchestration-map"]') as HTMLElement;
    const manuallyZoomed = stage.getAttribute("style");
    view.rerender(<AgentOrchestrationMap graph={{ ...initial, nodes: initial.nodes.map((item) => ({ ...item, status: "running" })) }} selectedNodeId={null} onSelectNode={() => undefined} />);
    expect(stage.getAttribute("style")).toBe(manuallyZoomed);

    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(560);
    act(() => resize?.([], {} as ResizeObserver));
    expect(stage.getAttribute("style")).not.toBe(manuallyZoomed);
  });
});

function graph(nodes: AgentRelationGraph["nodes"], edges: AgentRelationGraph["edges"]): AgentRelationGraph {
  return { conversationId: "conversation-1", title: "Agent 关系", summary: "", nodes, edges };
}

function node(id: string, kind: AgentRelationGraph["nodes"][number]["kind"], label: string, roleId = "main-agent"): AgentRelationGraph["nodes"][number] {
  return { id, kind, label, roleId, status: "completed", summary: "", target: { agentSurfaceId: id } };
}
