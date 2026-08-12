import { describe, expect, it } from "vitest";
import type { AgentCatalog, AgentCatalogEntry } from "../../src/agent/catalog.js";
import { getWorkbenchProjection } from "../../src/server/workbench/projections.js";
import { buildAgentSurfaceProjection } from "../../src/workbench/agent-surface-projection.js";
import { buildAgentCatalogDisplayProjection } from "../../src/workbench/agent-catalog-display-projection.js";
import type { StoredProviderAttempt, StoredProviderThreadLink } from "../../src/workbench/persistence/contracts.js";
import type { WorkbenchProjectInput } from "../../src/workbench/read-model-types.js";

describe("Agent Surface projection", () => {
  it("projects only sanitized Catalog display metadata", () => {
    const projection = buildAgentCatalogDisplayProjection(catalog());
    expect(projection.roles[0]).toEqual({ roleId: "planning-agent", displayName: "Planning Agent", description: "Plans work.", skills: ["planning"] });
    expect(projection.catalogHash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(projection)).not.toMatch(/profilePath|writeCapability|allowedInputs|allowedOutputs|requiredGates|blockedSkills|delegatable/);
  });

  it("rejects ids on the project-level Agent Catalog projection route", async () => {
    await expect(getWorkbenchProjection({} as WorkbenchProjectInput, "agent-catalog/unexpected"))
      .rejects.toThrow("does not accept an id");
  });

  it("projects current and historical registered Agents with Catalog presentation metadata", () => {
    const projection = buildAgentSurfaceProjection({
      conversationId: "conversation-1",
      graphScopeId: "graph-current",
      scopeStatus: "active",
      conversationCreatedAt: "2026-07-18T00:00:00.000Z",
      links: [
        link("attempt-main", "main-thread", "main-agent", null, "graph-current"),
        link("attempt-plan", "plan-thread", "planning-agent", "main-agent", "graph-current", "Sagan"),
        link("attempt-coder", "coder-thread", "coder-agent", "main-agent", "graph-old"),
        link("attempt-unknown", "unknown-thread", "unknown-role", "main-agent", "graph-current"),
      ],
      attempts: [
        attempt("attempt-main", "main-thread", "main-agent", "running", "graph-current", "main"),
        attempt("attempt-plan", "plan-thread", "planning-agent", "completed", "graph-current", "planning"),
        attempt("attempt-coder", "coder-thread", "coder-agent", "terminated", "graph-old", "coder"),
        attempt("attempt-unknown", "unknown-thread", "unknown-role", "running", "graph-current", "main"),
      ],
      messages: [],
      catalog: catalog(),
    });

    expect(projection.surfaces).toHaveLength(3);
    expect(projection.surfaces).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agentSurfaceId: "main-agent",
        graphScopeId: "graph-current",
        scopeRange: "current",
        status: "running",
        readOnly: false,
      }),
      expect.objectContaining({
        agentSurfaceId: "agent:codex:thread:coder-thread",
        graphScopeId: "graph-old",
        scopeRange: "historical",
        roleDisplayName: "Coder Agent",
        description: "Implements code.",
        skills: ["coding"],
        status: "terminated",
        readOnly: true,
      }),
      expect.objectContaining({
        agentSurfaceId: "agent:codex:thread:plan-thread",
        graphScopeId: "graph-current",
        scopeRange: "current",
        label: "Planning Agent · Sagan",
        roleDisplayName: "Planning Agent",
        description: "Plans work.",
        skills: ["planning"],
        status: "completed",
        readOnly: false,
      }),
    ]));
    expect(JSON.stringify(projection)).not.toMatch(/unknown-thread|unknown-role|providerId|providerThreadId|sessionId|threadId|turnId|itemId/);
  });

  it("fails closed for mismatched Attempts, cross-scope parents, and operation-profile conflicts", () => {
    const projection = buildAgentSurfaceProjection({
      conversationId: "conversation-1",
      graphScopeId: "graph-1",
      scopeStatus: "active",
      conversationCreatedAt: "2026-07-18T00:00:00.000Z",
      links: [
        link("missing-attempt", "orphan-one", "planning-agent", "main-agent", "graph-1"),
        link("attempt-parent", "parent-thread", "planning-agent", "main-agent", "graph-old"),
        link("attempt-orphan", "orphan-two", "coder-agent", "agent:codex:thread:parent-thread", "graph-1"),
        link("attempt-rejected", "rejected-thread", "planning-agent", "main-agent", "graph-1"),
      ],
      attempts: [
        attempt("attempt-parent", "parent-thread", "planning-agent", "completed", "graph-old", "planning"),
        attempt("attempt-orphan", "orphan-two", "coder-agent", "running", "graph-1", "coder"),
        attempt("attempt-rejected", "rejected-thread", "planning-agent", "running", "graph-1", "main"),
      ],
      messages: [],
      catalog: catalog(),
    });
    expect(projection.surfaces.map((surface) => surface.agentSurfaceId)).toEqual([
      "main-agent",
      "agent:codex:thread:parent-thread",
    ]);
  });

  it("maps blocked, marks terminal scopes read-only, and produces a stable metadata-sensitive hash", () => {
    const input = {
      conversationId: "conversation-1",
      graphScopeId: "graph-1",
      scopeStatus: "terminal" as const,
      conversationCreatedAt: "2026-07-18T00:00:00.000Z",
      links: [link("attempt-worker", "worker-thread", "coder-agent", "main-agent", "graph-1")],
      attempts: [attempt("attempt-worker", "worker-thread", "coder-agent", "blocked", "graph-1", "coder")],
      messages: [],
      catalog: catalog(),
    };
    const first = buildAgentSurfaceProjection(input);
    const second = buildAgentSurfaceProjection(input);
    const changed = buildAgentSurfaceProjection({
      ...input,
      catalog: {
        ...input.catalog,
        agents: input.catalog.agents.map((entry) => entry.roleId === "coder-agent" ? { ...entry, description: "Changed." } : entry),
      },
    });
    expect(first.surfaces[0]?.readOnly).toBe(true);
    expect(first.surfaces[1]).toMatchObject({ status: "needs-change", readOnly: true });
    expect(second.projectionHash).toBe(first.projectionHash);
    expect(changed.projectionHash).not.toBe(first.projectionHash);
  });

  it("overlays waiting-user only for a registered Agent in the current active scope", () => {
    const base = {
      conversationId: "conversation-1",
      graphScopeId: "graph-1",
      conversationCreatedAt: "2026-07-18T00:00:00.000Z",
      links: [
        link("attempt-current", "worker-thread", "coder-agent", "main-agent", "graph-1"),
        link("attempt-old", "old-thread", "coder-agent", "main-agent", "graph-old"),
      ],
      attempts: [
        attempt("attempt-current", "worker-thread", "coder-agent", "completed", "graph-1", "coder"),
        attempt("attempt-old", "old-thread", "coder-agent", "completed", "graph-old", "coder"),
      ],
      messages: [interactionMessage()],
      catalog: catalog(),
    };
    const active = buildAgentSurfaceProjection({ ...base, scopeStatus: "active" });
    const terminal = buildAgentSurfaceProjection({ ...base, scopeStatus: "terminal" });
    expect(active.surfaces.find((surface) => surface.agentSurfaceId.endsWith("worker-thread"))?.status).toBe("waiting-user");
    expect(active.surfaces.find((surface) => surface.agentSurfaceId.endsWith("old-thread"))?.status).toBe("completed");
    expect(terminal.surfaces.find((surface) => surface.agentSurfaceId.endsWith("worker-thread"))?.status).toBe("completed");
  });

  it("does not expose the retired Agent Office server projection route", async () => {
    await expect(getWorkbenchProjection({} as WorkbenchProjectInput, "agent-office/conversation-1"))
      .rejects.toThrow("Unknown Workbench projection: agent-office");
  });

  it("projects provider-neutral Agent children with stable ordering beyond Office capacity", () => {
    const children = Array.from({ length: 24 }, (_, index) => {
      const id = `child-${String(index).padStart(2, "0")}`;
      return {
        link: nativeLink(`attempt-${id}`, id, "main-agent", "neutral-provider"),
        attempt: nativeAttempt(`attempt-${id}`, id, "completed", "neutral-provider"),
      };
    });
    const input = {
      projectId: "project-1",
      productMode: "agent" as const,
      conversationId: "conversation-1",
      graphScopeId: "",
      scopeStatus: "active" as const,
      conversationCreatedAt: "2026-07-18T00:00:00.000Z",
      links: children.map((item) => item.link),
      attempts: children.map((item) => item.attempt),
      messages: [],
      catalog: catalog(),
    };
    const first = buildAgentSurfaceProjection(input);
    const reordered = buildAgentSurfaceProjection({
      ...input,
      links: [...input.links].reverse(),
      attempts: [...input.attempts].reverse(),
    });
    expect(first).toMatchObject({ projectId: "project-1", productMode: "agent", diagnostics: [] });
    expect(first.surfaces).toHaveLength(25);
    expect(first.surfaces.slice(1).every((surface) => surface.roleId === "native-child-agent")).toBe(true);
    expect(reordered.projectionHash).toBe(first.projectionHash);
    expect(reordered.surfaces).toEqual(first.surfaces);
    expect(JSON.stringify(first)).not.toMatch(/providerThreadId|nativeSessionId/);
  });

  it("omits malformed, orphaned, and cyclic Agent lineage with stable diagnostics", () => {
    const parentSurfaceId = "agent:neutral-provider:thread:parent";
    const cycleASurfaceId = "agent:codex:thread:cycle-a";
    const cycleBSurfaceId = "agent:codex:thread:cycle-b";
    const projection = buildAgentSurfaceProjection({
      projectId: "project-1",
      productMode: "agent",
      conversationId: "conversation-1",
      graphScopeId: "",
      scopeStatus: "active",
      conversationCreatedAt: "2026-07-18T00:00:00.000Z",
      links: [
        nativeLink("attempt-valid", "valid", "main-agent"),
        nativeLink("attempt-orphan", "orphan", parentSurfaceId),
        nativeLink("attempt-orphan-child", "orphan-child", "agent:codex:thread:orphan"),
        nativeLink("attempt-cycle-a", "cycle-a", cycleBSurfaceId),
        nativeLink("attempt-cycle-b", "cycle-b", cycleASurfaceId),
        nativeLink("attempt-malformed", "malformed", null),
        { ...nativeLink("attempt-other-project", "other-project", "main-agent"), projectId: "project-2" },
        { ...nativeLink("attempt-other-scope", "other-scope", "main-agent"), graphScopeId: "scope-2" },
      ],
      attempts: [
        nativeAttempt("attempt-valid", "valid", "running"),
        nativeAttempt("attempt-orphan", "orphan", "running"),
        nativeAttempt("attempt-orphan-child", "orphan-child", "running"),
        nativeAttempt("attempt-cycle-a", "cycle-a", "running"),
        nativeAttempt("attempt-cycle-b", "cycle-b", "running"),
        nativeAttempt("attempt-malformed", "malformed", "running"),
        nativeAttempt("attempt-other-project", "other-project", "running"),
        nativeAttempt("attempt-other-scope", "other-scope", "running"),
      ],
      messages: [],
      catalog: catalog(),
    });
    expect(projection.surfaces.map((surface) => surface.agentSurfaceId)).toEqual([
      "main-agent",
      "agent:codex:thread:valid",
    ]);
    expect(projection.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      "cyclic-lineage",
      "cyclic-lineage",
      "malformed-lineage",
      "mismatched-fact",
      "mismatched-fact",
      "orphan-lineage",
      "orphan-lineage",
    ]);
  });

  it("keeps duplicate conflicting child facts deterministic across arrival order", () => {
    const firstLink = nativeLink("attempt-a", "duplicate", "main-agent");
    const secondLink = { ...nativeLink("attempt-b", "duplicate", "missing-parent"), updatedAt: firstLink.updatedAt };
    const input = {
      projectId: "project-1",
      productMode: "agent" as const,
      conversationId: "conversation-1",
      graphScopeId: "",
      scopeStatus: "active" as const,
      conversationCreatedAt: "2026-07-18T00:00:00.000Z",
      links: [firstLink, secondLink],
      attempts: [
        nativeAttempt("attempt-a", "duplicate", "running"),
        nativeAttempt("attempt-b", "duplicate", "running"),
      ],
      messages: [],
      catalog: catalog(),
    };
    const forward = buildAgentSurfaceProjection(input);
    const reverse = buildAgentSurfaceProjection({ ...input, links: [...input.links].reverse() });
    expect(reverse.projectionHash).toBe(forward.projectionHash);
    expect(reverse).toEqual(forward);
  });
});

function nativeLink(
  attemptId: string,
  providerThreadId: string,
  parentAgentSurfaceId: string | null,
  providerId = "codex",
): StoredProviderThreadLink {
  return {
    ...link(attemptId, providerThreadId, "native-child-agent", parentAgentSurfaceId, ""),
    providerId,
    parentThreadId: parentAgentSurfaceId === "main-agent" ? "main-thread" : "parent-thread",
  };
}

function nativeAttempt(
  attemptId: string,
  nativeSessionId: string,
  status: StoredProviderAttempt["status"],
  providerId = "codex",
): StoredProviderAttempt {
  return {
    ...attempt(attemptId, nativeSessionId, "native-child-agent", status, "", "agent"),
    productMode: "agent",
    providerId,
  };
}

function catalog(): AgentCatalog {
  return {
    version: "1.0",
    agents: [
      catalogEntry("planning-agent", "Planning Agent", "Plans work.", ["planning"]),
      catalogEntry("coder-agent", "Coder Agent", "Implements code.", ["coding"]),
    ],
  };
}

function catalogEntry(roleId: string, displayName: string, description: string, allowedSkills: string[]): AgentCatalogEntry {
  return {
    roleId,
    displayName,
    description,
    profilePath: `agents/${roleId}.md`,
    writeCapability: "read-only",
    allowedInputs: [],
    allowedOutputs: [],
    allowedSkills,
    blockedSkills: [],
    requiredGates: [],
    delegatable: false,
  };
}

function link(
  attemptId: string,
  providerThreadId: string,
  roleId: string,
  parentAgentSurfaceId: string | null,
  graphScopeId: string,
  displayName: string | null = null,
): StoredProviderThreadLink {
  return {
    projectId: "project-1",
    conversationId: "conversation-1",
    attemptId,
    productMode: "harness",
    providerId: "codex",
    providerThreadId,
    roleId,
    parentThreadId: parentAgentSurfaceId === null || parentAgentSurfaceId === "main-agent" ? null : "parent-thread",
    parentAgentSurfaceId,
    changeId: null,
    graphScopeId,
    capabilityProfile: "test",
    displayName,
    runId: attemptId,
    updatedAt: "2026-07-18T00:00:00.000Z",
  };
}

function attempt(
  attemptId: string,
  nativeSessionId: string,
  roleId: string,
  status: StoredProviderAttempt["status"],
  graphScopeId: string,
  operationProfile: string,
): StoredProviderAttempt {
  return {
    projectId: "project-1",
    conversationId: "conversation-1",
    attemptId,
    graphScopeId,
    changeId: null,
    agentTaskId: null,
    roleId,
    operationProfile,
    providerId: "codex",
    nativeSessionId,
    model: null,
    capabilitySnapshot: {} as StoredProviderAttempt["capabilitySnapshot"],
    effectiveSkillInputs: [],
    handoffHash: "handoff",
    deliveredThroughCompletedTurn: 0,
    worktreeId: null,
    status,
    createdAt: `2026-07-18T00:00:0${attemptId.length % 9}.000Z`,
    updatedAt: "2026-07-18T00:00:10.000Z",
  };
}

function interactionMessage() {
  const timestamp = "2026-07-18T00:00:05.000Z";
  return {
    id: "interaction-1",
    projectId: "project-1",
    conversationId: "conversation-1",
    changeId: "",
    position: 1,
    revision: 1,
    agentSurfaceId: "agent:codex:thread:worker-thread",
    initialThreadInput: false,
    type: "provider.user-input",
    timestamp,
    text: null,
    actionRunId: null,
    actionType: null,
    status: "pending",
    runId: "run-1",
    providerId: "codex",
    threadId: "worker-thread",
    turnId: "turn-1",
    itemId: "item-1",
    artifact: null,
    error: null,
    rawJson: JSON.stringify({
      id: "interaction-1",
      type: "provider.user-input",
      timestamp,
      graphScopeId: "graph-1",
      providerUserInput: {
        providerId: "codex",
        attemptId: "attempt-current",
        requestKey: "request-key",
        requestId: "request-1",
        threadId: "worker-thread",
        runId: "run-1",
        runtimeScopeId: "conversation-1",
        questions: [],
        status: "pending",
      },
    }),
  } as const;
}
