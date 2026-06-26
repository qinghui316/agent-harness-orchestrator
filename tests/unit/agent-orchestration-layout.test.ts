import { describe, expect, it } from "vitest";
import { layoutAgentOrchestrationGraph, stageForNode, visualKindForNode } from "../../src/web/src/panels/workbench/agentOrchestrationLayout.js";
import type { DemandAgentRunGraph } from "../../src/web/src/types.js";

const baseGraph: DemandAgentRunGraph = {
  conversationId: "change-1",
  changeId: "change-1",
  title: "Graph",
  summary: "Synthetic graph",
  lanes: [],
  nodes: [
    node("main-agent", "main-agent", "需求"),
    node("worker:a", "scheduler-worker", "worker A", "execution", "worker"),
    node("worker:b", "scheduler-worker", "worker B", "execution", "worker"),
    node("candidate", "scheduler-integration-candidate", "组合候选", "integration", "review"),
    node("terminal", "terminal-gate", "完成", "terminal", "terminal"),
  ],
  edges: [
    { id: "main->a", from: "main-agent", to: "worker:a", kind: "continues-to", label: "worker A", edgeRole: "worker-branch" },
    { id: "main->b", from: "main-agent", to: "worker:b", kind: "continues-to", label: "worker B", edgeRole: "worker-branch" },
    { id: "a->candidate", from: "worker:a", to: "candidate", kind: "requires-evidence", label: "join", edgeRole: "worker-join" },
    { id: "b->candidate", from: "worker:b", to: "candidate", kind: "requires-evidence", label: "join", edgeRole: "worker-join" },
    { id: "candidate->terminal", from: "candidate", to: "terminal", kind: "continues-to", label: "done", edgeRole: "terminal" },
  ],
};

describe("agent orchestration layout", () => {
  it("places worker branches on the same stage before integration join", () => {
    const layout = layoutAgentOrchestrationGraph(baseGraph);
    const workerA = layout.nodes.find((item) => item.id === "worker:a");
    const workerB = layout.nodes.find((item) => item.id === "worker:b");
    const candidate = layout.nodes.find((item) => item.id === "candidate");

    expect(workerA?.stage).toBe("execution");
    expect(workerB?.stage).toBe("execution");
    expect(workerA?.y).toBe(workerB?.y);
    expect(candidate?.stage).toBe("integration");
    expect(candidate!.y).toBeGreaterThan(workerA!.y);
    expect(layout.edges.filter((edge) => edge.edgeRole === "worker-join")).toHaveLength(2);
  });

  it("keeps loop/rework edges as curved non-primary paths", () => {
    const graph = {
      ...baseGraph,
      edges: [
        ...baseGraph.edges,
        { id: "worker-loop", from: "worker:a", to: "worker:a", kind: "triggers-rework", label: "rework", edgeStyle: "loop", edgeRole: "rework" },
      ],
    } satisfies DemandAgentRunGraph;
    const layout = layoutAgentOrchestrationGraph(graph);

    expect(layout.edges.some((edge) => edge.edgeRole === "rework" && edge.path.includes("C"))).toBe(true);
  });

  it("falls back for unknown node kinds without crashing", () => {
    expect(stageForNode({ kind: "new-agent-kind", lane: "roles" })).toBe("execution");
    expect(visualKindForNode({ kind: "new-agent-kind" })).toBe("default");
  });
});

function node(id: string, kind: string, label: string, stage?: DemandAgentRunGraph["nodes"][number]["stage"], visualKind?: DemandAgentRunGraph["nodes"][number]["visualKind"]): DemandAgentRunGraph["nodes"][number] {
  return {
    id,
    kind,
    lane: kind === "main-agent" ? "main" : "roles",
    label,
    status: "completed",
    summary: `${label} summary`,
    reason: `${label} reason`,
    target: {},
    stage,
    visualKind,
    evidenceRefs: [],
    attempts: [],
  };
}
