import { describe, expect, it } from "vitest";
import { buildAgentRelationGraph } from "../../src/workbench/projections/read-model/agent-relation-graph.js";
import { buildAgentWorkspace } from "../../src/workbench/projections/read-model/agent-workspace.js";
import type { WorkbenchAgentWorkspaceAgent, WorkbenchConfirmationQueue, WorkbenchTopicDetail, WorkbenchWorkpad } from "../../src/workbench/read-model-types.js";
import type { ManagedProject } from "../../src/types/index.js";

describe("Workbench Agent relationship graph", () => {
  it("always projects one Main Agent for a real selected conversation", () => {
    const graph = buildAgentRelationGraph({
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
      agent("agent:codex:thread:plan-1", "planning-agent", "Plan Agent"),
      agent("agent:codex:thread:coder-a", "coder-agent", "Coder Agent 1"),
      agent("agent:codex:thread:coder-b", "coder-agent", "Coder Agent 2"),
      agent("agent:codex:thread:evolution", "harness-evolution-agent", "Evolution Agent"),
      agent("agent:codex:thread:scorer", "evolution-scorer", "Scorer Agent", "agent:codex:thread:evolution"),
      agent("agent:codex:thread:validator", "validator", "Validator"),
    ];
    const graph = buildAgentRelationGraph({
      project: { id: "repo" } as ManagedProject,
      selectedTopic: { id: "change-1", title: "Two file task", kind: "conversation", updatedAt: "2026-06-26T00:00:00.000Z" } as WorkbenchTopicDetail,
      confirmationQueue: { current: [], otherDemands: [], maintenance: [], history: [] } as unknown as WorkbenchConfirmationQueue,
      workpad: { conversationLifecycle: "running" } as WorkbenchWorkpad,
      agents,
    });

    expect(graph.nodes.map((node) => node.label)).toEqual(["主 Agent", "Plan Agent", "Coder Agent 1", "Coder Agent 2", "Evolution Agent", "Scorer Agent"]);
    expect(graph.nodes.every((node) => node.kind === "main-agent" || node.kind === "agent")).toBe(true);
    expect(JSON.stringify(graph)).not.toMatch(/lane|stage|evidence|attempt|runtime|validator|integration|apply/i);
    expect(graph.edges).toHaveLength(5);
    expect(graph.edges.every((edge) => edge.kind === "parent-child" && graph.nodes.some((node) => node.id === edge.from) && graph.nodes.some((node) => node.id === edge.to))).toBe(true);
    expect(graph.edges).toContainEqual(expect.objectContaining({ from: "agent:codex:thread:evolution", to: "agent:codex:thread:scorer" }));
  });

  it("keeps same-role numbering stable as the durable projection grows", () => {
    const links = ["coder-b", "coder-a"].map((providerThreadId) => ({
      projectId: "repo",
      providerId: "codex",
      conversationId: "change-1",
      providerThreadId,
      roleId: "coder-agent",
      parentThreadId: null,
      changeId: null,
      graphScopeId: "graph-1",
      capabilityProfile: null,
      updatedAt: "2026-07-14T00:00:00.000Z",
    }));
    const first = workspaceFor(links.slice(0, 1), "graph-1");
    const workspace = workspaceFor(links, "graph-1");
    const labels = new Map(workspace.agents.map((item) => [item.id, item.label]));

    expect(first.agents[0]?.label).toBe("Coder Agent");
    expect(labels.get("agent:codex:thread:coder-b")).toBe("Coder Agent 2");
    expect(labels.get("agent:codex:thread:coder-a")).toBe("Coder Agent 1");
  });

  it("keeps a provider-visible Agent name in the durable workspace", () => {
    const workspace = workspaceFor([{
        projectId: "repo",
        providerId: "codex",
        conversationId: "change-1",
        providerThreadId: "planner-newton",
        roleId: "planning-agent",
        parentThreadId: "main-thread",
        changeId: null,
        graphScopeId: "graph-1",
        capabilityProfile: null,
        displayName: "Newton",
        updatedAt: "2026-07-14T00:00:00.000Z",
      }], "graph-1");

    expect(workspace.agents[0]).toMatchObject({ id: "agent:codex:thread:planner-newton", providerId: "codex", label: "Plan Agent · Newton" });
  });

  it("does not create an Agent from timeline content or an unmatched thread link", () => {
    const selectedTopic = {
      id: "conversation-1",
      title: "Timeline only",
      kind: "conversation",
      threadItems: [{
        id: "timeline-child",
        kind: "assistant-turn",
        source: "chat",
        graphScopeId: "graph-1",
        providerId: "codex",
        threadId: "timeline-thread",
        agentRoleId: "planning-agent",
      }],
    } as unknown as WorkbenchTopicDetail;
    expect(buildAgentWorkspace({ selectedTopic, graphScopeId: "graph-1" }).agents).toEqual([]);

    expect(buildAgentWorkspace({
      selectedTopic,
      providerThreads: [{
        projectId: "repo",
        conversationId: "conversation-1",
        attemptId: "missing-attempt",
        providerId: "codex",
        providerThreadId: "linked-thread",
        roleId: "planning-agent",
        parentThreadId: null,
        changeId: null,
        graphScopeId: "graph-1",
        capabilityProfile: "planning",
        updatedAt: "2026-07-15T00:00:00.000Z",
      }],
      providerAttempts: [],
      graphScopeId: "graph-1",
    }).agents).toEqual([]);
  });

  it("projects only provider threads assigned to the selected graph scope", () => {
    const providerThreads = [
      { providerThreadId: "old-plan", graphScopeId: "graph-old" },
      { providerThreadId: "current-plan", graphScopeId: "graph-current" },
    ].map((item) => ({
      projectId: "repo",
      providerId: "codex",
      conversationId: "conversation-1",
      providerThreadId: item.providerThreadId,
      roleId: "planning-agent",
      parentThreadId: "main-thread",
      changeId: null,
      graphScopeId: item.graphScopeId,
      capabilityProfile: null,
      updatedAt: "2026-07-15T00:00:00.000Z",
    }));

    const workspace = workspaceFor(providerThreads, "graph-current");

    expect(workspace.agents.map((agent) => agent.id)).toEqual(["agent:codex:thread:current-plan"]);
  });

  it("qualifies equal provider thread ids and preserves true child lineage", () => {
    const providerThreads = [
      { providerId: "codex", providerThreadId: "main-codex", roleId: "main-agent", parentThreadId: null },
      { providerId: "codex", providerThreadId: "shared", roleId: "planning-agent", parentThreadId: "main-codex" },
      { providerId: "test-provider", providerThreadId: "shared", roleId: "coder-agent", parentThreadId: null },
      { providerId: "codex", providerThreadId: "nested", roleId: "child-agent", parentThreadId: "shared" },
    ].map((item) => ({
      projectId: "repo",
      conversationId: "conversation-1",
      changeId: null,
      graphScopeId: "graph-current",
      capabilityProfile: null,
      updatedAt: "2026-07-15T00:00:00.000Z",
      ...item,
    }));

    const workspace = workspaceFor(providerThreads, "graph-current");
    const graph = buildAgentRelationGraph({
      project: { id: "repo" } as ManagedProject,
      selectedTopic: { id: "conversation-1", title: "Shared", kind: "conversation" } as WorkbenchTopicDetail,
      confirmationQueue: { current: [], otherDemands: [], maintenance: [], history: [] } as unknown as WorkbenchConfirmationQueue,
      workpad: { conversationLifecycle: "running" } as WorkbenchWorkpad,
      agents: workspace.agents,
    });

    expect(workspace.agents.map((agent) => agent.id)).toEqual([
      "agent:codex:thread:shared",
      "agent:test-provider:thread:shared",
      "agent:codex:thread:nested",
    ]);
    expect(graph.nodes.filter((node) => node.kind === "main-agent")).toHaveLength(1);
    expect(graph.edges).toContainEqual(expect.objectContaining({
      from: "agent:codex:thread:shared",
      to: "agent:codex:thread:nested",
    }));
  });

  it("keeps role-first labels and numbers only duplicate native names", () => {
    const providerThreads = ["planner-b", "planner-a"].map((providerThreadId) => ({
      projectId: "repo",
      providerId: "codex",
      conversationId: "change-1",
      providerThreadId,
      roleId: "planning-agent",
      parentThreadId: "main-thread",
      changeId: null,
      graphScopeId: "graph-1",
      capabilityProfile: null,
      displayName: "Sagan",
      updatedAt: "2026-07-14T00:00:00.000Z",
    }));
    const workspace = workspaceFor(providerThreads, "graph-1");
    const labels = new Map(workspace.agents.map((item) => [item.id, item.label]));

    expect(labels.get("agent:codex:thread:planner-a")).toBe("Plan Agent · Sagan 1");
    expect(labels.get("agent:codex:thread:planner-b")).toBe("Plan Agent · Sagan 2");
  });

  it("takes background Agent status only from its owning provider attempt", () => {
    const workspace = workspaceFor([{
        projectId: "repo",
        providerId: "codex",
        conversationId: "maintenance:change-1",
        providerThreadId: "maintenance-thread-1",
        roleId: "memory-maintenance-agent",
        parentThreadId: null,
        changeId: "change-1",
        graphScopeId: "graph-1",
        capabilityProfile: "background-agent-v1",
        displayName: "Maintenance Agent",
        runId: "maintenance-run-1",
        updatedAt: "2026-07-14T00:00:00.000Z",
      }], "graph-1", "failed");

    expect(workspace.agents).toHaveLength(1);
    expect(workspace.agents[0]).toMatchObject({ id: "agent:codex:thread:maintenance-thread-1", runId: "maintenance-run-1" });
    expect(workspace.agents[0]?.status).toBe("failed");
    expect(workspace.agents[0]).not.toHaveProperty("transcript");
  });
});

function workspaceFor(
  rawThreads: Array<Record<string, unknown> & { providerId: string; providerThreadId: string; conversationId: string; roleId: string; graphScopeId: string | null }>,
  graphScopeId: string,
  status: "running" | "failed" = "running",
) {
  const providerThreads = rawThreads.map((thread) => ({
    ...thread,
    attemptId: `attempt:${thread.providerId}:${thread.providerThreadId}`,
  })) as Parameters<typeof buildAgentWorkspace>[0]["providerThreads"];
  const providerAttempts = providerThreads!.map((link) => ({
    projectId: link.projectId,
    conversationId: link.conversationId,
    attemptId: link.attemptId!,
    graphScopeId: link.graphScopeId,
    changeId: link.changeId,
    agentTaskId: null,
    roleId: link.roleId,
    operationProfile: link.capabilityProfile ?? "main",
    providerId: link.providerId,
    nativeSessionId: link.providerThreadId,
    model: null,
    capabilitySnapshot: { providerId: link.providerId, operationProfile: "main", supported: [], missing: [], checkedAt: "2026-07-15T00:00:00.000Z" },
    handoffHash: "handoff",
    deliveredThroughCompletedTurn: 0,
    worktreeId: null,
    status,
    createdAt: link.updatedAt,
    updatedAt: link.updatedAt,
  })) as Parameters<typeof buildAgentWorkspace>[0]["providerAttempts"];
  return buildAgentWorkspace({ selectedTopic: null, providerThreads, providerAttempts, graphScopeId });
}

function agent(id: string, roleId: string, label: string, parentAgentId = "main-agent"): WorkbenchAgentWorkspaceAgent {
  return {
    id,
    roleId,
    providerId: "codex",
    label,
    parentAgentId,
    status: "running",
    summary: "",
    evidenceRefs: [],
    actions: [],
  };
}
