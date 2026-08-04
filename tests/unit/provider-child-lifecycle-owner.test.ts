import { describe, expect, it, vi } from "vitest";
import type { AgentCatalog } from "../../src/agent/catalog.js";
import type { ProviderChildLifecycleEvent } from "../../src/provider-runtime/index.js";
import type { CanonicalTimelineDelivery } from "../../src/workbench/canonical-timeline-delivery.js";
import type { WorkbenchDatabase } from "../../src/workbench/persistence/database.js";
import {
  ProviderChildLifecycleOwner,
  providerChildActivityAttemptId,
} from "../../src/workbench/provider-child-lifecycle-owner.js";

describe("ProviderChildLifecycleOwner", () => {
  it("registers only after a delayed Catalog-backed role hint and is idempotent", () => {
    const fixture = ownerFixture();
    expect(fixture.owner.onLifecycle(started())).toBeNull();
    expect(fixture.createProviderAttempt).not.toHaveBeenCalled();

    const registered = fixture.owner.onLifecycle(started({ roleHint: "planning-agent" }));
    expect(registered).toEqual(expect.objectContaining({
      roleId: "planning-agent",
      threadId: "thread-child",
      parentThreadId: "thread-main",
      status: "running",
    }));
    expect(fixture.createProviderAttempt).toHaveBeenCalledTimes(1);
    expect(fixture.bindProviderAttemptThread).toHaveBeenCalledWith("project-1", expect.objectContaining({
      attemptId: providerChildActivityAttemptId("attempt-main", "thread-child", "activity-1"),
      threadId: "thread-child",
      parentThreadId: "thread-main",
    }), expect.any(String));

    fixture.owner.onLifecycle(started({ roleHint: "planning-agent" }));
    expect(fixture.createProviderAttempt).toHaveBeenCalledTimes(1);
  });

  it("keeps unknown and catalog-only roles outside product Agent registration", () => {
    const fixture = ownerFixture();
    expect(fixture.owner.onLifecycle(started({ roleHint: ["child", "agent"].join("-") }))).toBeNull();
    expect(fixture.owner.onLifecycle(started({ activityId: "activity-2", roleHint: "custom-agent" }))).toBeNull();
    expect(fixture.createProviderAttempt).not.toHaveBeenCalled();
    expect(fixture.bindProviderAttemptThread).not.toHaveBeenCalled();
  });

  it("makes Provider close irreversible and duplicate terminal events idempotent", () => {
    const fixture = ownerFixture();
    fixture.owner.onLifecycle(started({ roleHint: "planning-agent" }));
    fixture.owner.onResult({
      providerId: "codex",
      activityId: "activity-1",
      parentThreadId: "thread-main",
      threadId: "thread-child",
      status: "completed",
      finalText: "done",
      changedFiles: [],
    });
    fixture.owner.onLifecycle(started({ kind: "closed", roleHint: undefined }));
    fixture.owner.onLifecycle(started({ kind: "closed", roleHint: undefined }));
    fixture.owner.onResult({
      providerId: "codex",
      activityId: "activity-1",
      parentThreadId: "thread-main",
      threadId: "thread-child",
      status: "completed",
      finalText: "late",
      changedFiles: [],
    });
    expect(fixture.commitProviderCallback.mock.calls.map((call) => call[0].terminal?.status)).toEqual(["completed", "terminated"]);
    expect(fixture.owner.registeredForThread("thread-child")?.status).toBe("terminated");
  });

  it("creates a distinct Attempt for each continued activity on the same Child thread", () => {
    const fixture = ownerFixture();
    const first = fixture.owner.onLifecycle(started({ roleHint: "planning-agent" }))!;
    const second = fixture.owner.onLifecycle(started({
      kind: "continued",
      activityId: "activity-2",
      roleHint: "planning-agent",
    }))!;
    expect(second.attemptId).not.toBe(first.attemptId);
    expect(fixture.owner.registeredForThread("thread-child")?.attemptId).toBe(second.attemptId);
    expect(fixture.createProviderAttempt).toHaveBeenCalledTimes(2);
    expect(fixture.owner.terminalAttempts("failed")).toEqual(expect.arrayContaining([
      expect.objectContaining({ attemptId: first.attemptId, status: "failed" }),
      expect.objectContaining({ attemptId: second.attemptId, status: "failed" }),
    ]));
    expect(fixture.owner.terminalAttempts("failed")).toHaveLength(2);
  });

  it("projects a native close for a registered Child created in an earlier Main Turn", () => {
    const fixture = ownerFixture();
    fixture.listProviderThreads.mockReturnValue([{
      projectId: "project-1",
      conversationId: "conversation-1",
      providerId: "codex",
      providerThreadId: "thread-child",
      parentThreadId: "thread-main",
      roleId: "planning-agent",
      attemptId: "attempt-previous-child",
      graphScopeId: "scope-1",
      displayName: "Planner",
    }]);
    fixture.readProviderAttempt.mockReturnValue({
      conversationId: "conversation-1",
      providerId: "codex",
      nativeSessionId: "thread-child",
      graphScopeId: "scope-1",
      roleId: "planning-agent",
      operationProfile: "planning",
      status: "completed",
      attemptId: "attempt-previous-child",
    });
    const closed = fixture.owner.onLifecycle(started({ kind: "closed", activityId: "close-previous" }));
    expect(closed).toEqual(expect.objectContaining({ attemptId: "attempt-previous-child", status: "terminated" }));
    expect(fixture.commitProviderCallback).toHaveBeenCalledWith(expect.objectContaining({
      projectId: "project-1",
      conversationId: "conversation-1",
      attemptId: "attempt-previous-child",
      expectedGraphScopeId: "scope-1",
      terminal: { status: "terminated", nativeSessionId: "thread-child" },
    }));
  });

  it.each([
    ["a same-profile role mismatch", { roleId: "other-planning-agent", conversationId: "conversation-1" }],
    ["a conversation mismatch", { roleId: "planning-agent", conversationId: "conversation-other" }],
  ])("fails closed when historical Child hydration has %s", (_label, mismatch) => {
    const fixture = ownerFixture();
    fixture.listProviderThreads.mockReturnValue([{
      projectId: "project-1",
      conversationId: "conversation-1",
      providerId: "codex",
      providerThreadId: "thread-child",
      parentThreadId: "thread-main",
      roleId: "planning-agent",
      attemptId: "attempt-previous-child",
      graphScopeId: "scope-1",
      displayName: "Planner",
    }]);
    fixture.readProviderAttempt.mockReturnValue({
      providerId: "codex",
      nativeSessionId: "thread-child",
      graphScopeId: "scope-1",
      operationProfile: "planning",
      status: "completed",
      attemptId: "attempt-previous-child",
      ...mismatch,
    });

    expect(fixture.owner.onLifecycle(started({ kind: "closed", activityId: "close-previous" }))).toBeNull();
    expect(fixture.commitProviderCallback).not.toHaveBeenCalled();
  });
});

function ownerFixture() {
  const createProviderAttempt = vi.fn();
  const bindProviderAttemptThread = vi.fn();
  const completeProviderAttempt = vi.fn();
  const commitProviderCallback = vi.fn(() => []);
  const assertCurrentRunningAttemptGraph = vi.fn();
  const listProviderThreads = vi.fn(() => []);
  const readProviderAttempt = vi.fn(() => null);
  const database = {
    transaction: (operation: () => unknown) => operation(),
    unitOfWork: { commitProviderCallback },
    providerAttempts: {
      createProviderAttempt,
      bindProviderAttemptThread,
      completeProviderAttempt,
      assertCurrentRunningAttemptGraph,
      listProviderThreads,
      readProviderAttempt,
    },
  } as unknown as WorkbenchDatabase;
  const owner = new ProviderChildLifecycleOwner({
    database,
    delivery: { upsert: vi.fn(), publishCommittedMany: vi.fn() } as unknown as CanonicalTimelineDelivery,
    catalog: catalog(),
    projectId: "project-1",
    conversationId: "conversation-1",
    graphScopeId: "scope-1",
    changeId: null,
    runId: "run-1",
    parentAttemptId: "attempt-main",
    providerId: "codex",
    capabilitySnapshot: {} as never,
    model: null,
    parentHandoffHash: "handoff",
    deliveredThroughCompletedTurn: 0,
    onInvalidated: vi.fn(),
  });
  return {
    owner,
    createProviderAttempt,
    bindProviderAttemptThread,
    completeProviderAttempt,
    commitProviderCallback,
    listProviderThreads,
    readProviderAttempt,
  };
}

function started(overrides: Partial<ProviderChildLifecycleEvent> = {}): ProviderChildLifecycleEvent {
  return {
    providerId: "codex",
    kind: "started",
    activityId: "activity-1",
    parentSession: { providerId: "codex", sessionId: "thread-main" },
    childSession: { providerId: "codex", sessionId: "thread-child" },
    ...overrides,
  };
}

function catalog(): AgentCatalog {
  return {
    version: "1.0",
    agents: [entry("planning-agent"), entry("custom-agent")],
  };
}

function entry(roleId: string): AgentCatalog["agents"][number] {
  return {
    roleId,
    displayName: roleId,
    description: "",
    profilePath: `agents/${roleId}.md`,
    writeCapability: "read-only",
    allowedInputs: [],
    allowedOutputs: [],
    allowedSkills: [],
    blockedSkills: [],
    requiredGates: [],
    delegatable: false,
  };
}
