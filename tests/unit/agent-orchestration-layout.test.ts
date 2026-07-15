import { describe, expect, it } from "vitest";
import { layoutAgentOrchestrationGraph } from "../../src/web/src/panels/workbench/agentOrchestrationLayout.js";
import type { AgentRelationGraph } from "../../src/web/src/types.js";

describe("agent orchestration layout", () => {
  it("lays out real parent-child depth instead of workflow stages", () => {
    const graph = graphOf([
      node("main-agent", "main-agent", "主 Agent"),
      node("thread:plan", "planning-agent", "Plan Agent"),
      node("thread:coder-a", "coder-agent", "Coder Agent 1"),
      node("thread:coder-b", "coder-agent", "Coder Agent 2"),
      node("thread:evolution", "evolution-agent", "Evolution Agent"),
      node("thread:scorer", "evolution-scorer", "Scorer Agent"),
    ], [
      edge("main-agent", "thread:plan"),
      edge("main-agent", "thread:coder-a"),
      edge("main-agent", "thread:coder-b"),
      edge("main-agent", "thread:evolution"),
      edge("thread:evolution", "thread:scorer"),
    ]);

    const layout = layoutAgentOrchestrationGraph(graph);
    const byId = new Map(layout.nodes.map((item) => [item.id, item]));
    expect(byId.get("thread:plan")?.y).toBe(byId.get("thread:coder-a")?.y);
    expect(byId.get("thread:coder-a")?.y).toBe(byId.get("thread:evolution")?.y);
    expect(byId.get("thread:scorer")!.y).toBeGreaterThan(byId.get("thread:evolution")!.y);
    expect(byId.get("thread:scorer")!.y).toBeGreaterThan(byId.get("main-agent")!.y);
  });

  it("falls back deterministically for missing parents and cycles", () => {
    const graph = graphOf([
      node("main-agent", "main-agent", "主 Agent"),
      node("thread:a", "coder-agent", "A"),
      node("thread:b", "coder-agent", "B"),
      node("thread:orphan-child", "evolution-scorer", "Orphan child"),
    ], [
      edge("thread:a", "thread:b"),
      edge("thread:b", "thread:a"),
      edge("thread:missing", "thread:orphan-child"),
    ]);

    const first = layoutAgentOrchestrationGraph(graph);
    const second = layoutAgentOrchestrationGraph(graph);
    expect(first.nodes.map(({ id, x, y }) => ({ id, x, y }))).toEqual(second.nodes.map(({ id, x, y }) => ({ id, x, y })));
    expect(first.nodes.every((item) => Number.isFinite(item.x) && Number.isFinite(item.y))).toBe(true);
    expect(first.edges).toHaveLength(2);
  });

  it("keeps topology identity independent from status-only updates", () => {
    const graph = graphOf([node("main-agent", "main-agent", "主 Agent"), node("thread:plan", "planning-agent", "Plan Agent")], [edge("main-agent", "thread:plan")]);
    const first = layoutAgentOrchestrationGraph(graph);
    const second = layoutAgentOrchestrationGraph({ ...graph, nodes: graph.nodes.map((item) => ({ ...item, status: "running" })) });
    expect(first.topologyKey).toBe(second.topologyKey);
    expect(first.nodes.map(({ id, x, y }) => ({ id, x, y }))).toEqual(second.nodes.map(({ id, x, y }) => ({ id, x, y })));
  });

});

function graphOf(nodes: AgentRelationGraph["nodes"], edges: AgentRelationGraph["edges"]): AgentRelationGraph {
  return { conversationId: "conversation-1", title: "Agent 关系", summary: "", lanes: [], nodes, edges };
}

function edge(from: string, to: string): AgentRelationGraph["edges"][number] {
  return { id: `${from}->${to}`, from, to, kind: "delegates", label: "" };
}

function node(id: string, kind: AgentRelationGraph["nodes"][number]["kind"], label: string): AgentRelationGraph["nodes"][number] {
  return {
    id,
    kind,
    lane: kind === "main-agent" ? "main" : "roles",
    label,
    status: "completed",
    summary: "",
    reason: "",
    target: {},
    visualKind: "agent",
    evidenceRefs: [],
    attempts: [],
  };
}
