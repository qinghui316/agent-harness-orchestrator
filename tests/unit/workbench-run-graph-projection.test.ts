import { describe, expect, it } from "vitest";
import { buildDemandAgentRunGraph } from "../../src/workbench/projections/read-model/run-graph.js";
import { buildAgentWorkspace } from "../../src/workbench/projections/read-model/agent-workspace.js";
import type { WorkbenchAgentWorkspaceAgent, WorkbenchConfirmationQueue, WorkbenchTopicDetail, WorkbenchWorkpad } from "../../src/workbench/read-model-types.js";
import type { ManagedProject } from "../../src/types/index.js";

describe("Workbench Agent relationship graph", () => {
  it("always projects one Main Agent for a real selected conversation", () => {
    const graph = buildDemandAgentRunGraph({
      project: { id: "repo" } as ManagedProject,
      selectedTopic: { id: "simple-1", title: "Simple", kind: "conversation", updatedAt: "2026-07-14T00:00:00.000Z" } as WorkbenchTopicDetail,
      confirmationQueue: { current: [], otherDemands: [], maintenance: [], history: [] } as unknown as WorkbenchConfirmationQueue,
      workpad: { conversationLifecycle: "active" } as WorkbenchWorkpad,
      agents: [],
    });

    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0]).toEqual(expect.objectContaining({ id: "main-agent", kind: "main-agent", label: "主 Agent" }));
  });

  it("projects only real model Agent surfaces and their parent relations", () => {
    const agents = [
      agent("thread:plan-1", "planning-agent", "Plan Agent", "main-thread"),
      agent("run:coder-a", "coder-agent", "Coder Agent 1"),
      agent("run:coder-b", "coder-agent", "Coder Agent 2"),
      agent("thread:evolution", "harness-evolution-agent", "Evolution Agent"),
      agent("thread:scorer", "evolution-scorer", "Scorer Agent", "evolution"),
      agent("run:validator", "validator", "Validator"),
    ];
    const graph = buildDemandAgentRunGraph({
      project: { id: "repo" } as ManagedProject,
      selectedTopic: { id: "change-1", title: "Two file task", kind: "conversation", updatedAt: "2026-06-26T00:00:00.000Z" } as WorkbenchTopicDetail,
      confirmationQueue: { current: [], otherDemands: [], maintenance: [], history: [] } as unknown as WorkbenchConfirmationQueue,
      workpad: { conversationLifecycle: "running" } as WorkbenchWorkpad,
      agents,
    });

    expect(graph.nodes.map((node) => node.label)).toEqual(["主 Agent", "Plan Agent", "Coder Agent 1", "Coder Agent 2", "Evolution Agent", "Scorer Agent"]);
    expect(graph.nodes.every((node) => node.visualKind === "agent")).toBe(true);
    expect(graph.nodes.some((node) => node.kind === "validator" || node.kind === "scheduler-worker" || node.kind === "integration-check")).toBe(false);
    expect(graph.edges).toHaveLength(5);
    expect(graph.edges.every((edge) => edge.kind === "delegates" && graph.nodes.some((node) => node.id === edge.from) && graph.nodes.some((node) => node.id === edge.to))).toBe(true);
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: "thread:evolution", to: "thread:scorer" }));
  });

  it("keeps same-role numbering stable as the durable projection grows", () => {
    const links = ["coder-b", "coder-a"].map((providerThreadId) => ({
      projectId: "repo",
      conversationId: "change-1",
      providerThreadId,
      roleId: "coder-agent",
      parentThreadId: null,
      changeId: null,
      capabilityProfile: null,
      updatedAt: "2026-07-14T00:00:00.000Z",
    }));
    const first = buildAgentWorkspace({ selectedTopic: null, workpad: {} as WorkbenchWorkpad, providerThreads: links.slice(0, 1) });
    const workspace = buildAgentWorkspace({ selectedTopic: null, workpad: {} as WorkbenchWorkpad, providerThreads: links });
    const labels = new Map(workspace.agents.map((item) => [item.id, item.label]));

    expect(first.agents[0]?.label).toBe("Coder Agent");
    expect(labels.get("thread:coder-b")).toBe("Coder Agent 2");
    expect(labels.get("thread:coder-a")).toBe("Coder Agent 1");
  });

  it("keeps a provider-visible Agent name in the durable workspace", () => {
    const workspace = buildAgentWorkspace({
      selectedTopic: null,
      workpad: {} as WorkbenchWorkpad,
      providerThreads: [{
        projectId: "repo",
        conversationId: "change-1",
        providerThreadId: "planner-newton",
        roleId: "planning-agent",
        parentThreadId: "main-thread",
        changeId: null,
        capabilityProfile: null,
        displayName: "Newton",
        updatedAt: "2026-07-14T00:00:00.000Z",
      }],
    });

    expect(workspace.agents[0]).toMatchObject({ id: "thread:planner-newton", label: "Plan Agent · Newton" });
  });

  it("keeps role-first labels and numbers only duplicate native names", () => {
    const providerThreads = ["planner-b", "planner-a"].map((providerThreadId) => ({
      projectId: "repo",
      conversationId: "change-1",
      providerThreadId,
      roleId: "planning-agent",
      parentThreadId: "main-thread",
      changeId: null,
      capabilityProfile: null,
      displayName: "Sagan",
      updatedAt: "2026-07-14T00:00:00.000Z",
    }));
    const workspace = buildAgentWorkspace({ selectedTopic: null, workpad: {} as WorkbenchWorkpad, providerThreads });
    const labels = new Map(workspace.agents.map((item) => [item.id, item.label]));

    expect(labels.get("thread:planner-a")).toBe("Plan Agent · Sagan 1");
    expect(labels.get("thread:planner-b")).toBe("Plan Agent · Sagan 2");
  });

  it("merges a background task summary into its durable provider thread surface", () => {
    const workspace = buildAgentWorkspace({
      selectedTopic: null,
      workpad: {
        mainAgentExecution: {
          runs: [],
          agentTasks: [{
            id: "maintenance-task-1",
            conversationId: "maintenance:change-1",
            roleId: "memory-maintenance-agent",
            status: "running",
            summary: "维护项目说明",
            resultSummary: null,
            evidenceRefs: [],
          }],
        },
      } as unknown as WorkbenchWorkpad,
      providerThreads: [{
        projectId: "repo",
        conversationId: "maintenance:change-1",
        providerThreadId: "maintenance-thread-1",
        roleId: "memory-maintenance-agent",
        parentThreadId: null,
        changeId: "change-1",
        capabilityProfile: "background-agent-v1",
        displayName: "Maintenance Agent",
        runId: "maintenance-run-1",
        updatedAt: "2026-07-14T00:00:00.000Z",
      }],
    });

    expect(workspace.agents).toHaveLength(1);
    expect(workspace.agents[0]).toMatchObject({ id: "thread:maintenance-thread-1", runId: "maintenance-run-1" });
    expect(workspace.agents[0]?.transcript.cells?.some((cell) => cell.id === "task:maintenance-task-1")).toBe(true);
  });
});

function agent(id: string, roleId: string, label: string, parentThreadId?: string): WorkbenchAgentWorkspaceAgent {
  return {
    id,
    roleId,
    label,
    parentThreadId,
    status: "running",
    summary: "",
    transcript: { title: label, cells: [], items: [] },
    evidenceRefs: [],
    actions: [],
  };
}
