import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
import {
  ProviderRegistry,
  type ActiveProviderTurn,
  type ProviderCapabilityKey,
  type ProviderCapabilitySnapshot,
  type ProviderDescriptor,
  type ProviderNativeSkill,
  type ProviderRealtimeEvent,
  type ProviderTurnRequest,
  type ProviderTurnResult,
} from "../../src/provider-runtime/index.js";
import { PROVIDER_OPERATION_CAPABILITIES } from "../../src/provider-runtime/types.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../src/provider-runtime/project-harness-discovery.js";
import { ProjectRuntimeCoordinator } from "../../src/project-runtime/coordinator.js";
import { ProjectRegistryStore } from "../../src/registry/store.js";
import { hashNativeSkillPackageContent } from "../../src/skill/content-hash.js";
import { TurnSkillContextResolver } from "../../src/skill/turn-skill-context-resolver.js";
import { createWorkbenchConversation } from "../../src/workbench/conversation-service.js";
import { AgentNativeChildLifecycleService, runAgentNativeChildFollowup } from "../../src/workbench/agent-native-child-lifecycle-service.js";
import { createAssistantTranscriptCapture } from "../../src/workbench/live-transcript.js";
import { DirectAgentConversationTurnStrategy } from "../../src/workbench/direct-agent-conversation-turn-strategy.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { TimelineRepository } from "../../src/workbench/persistence/repositories/timeline-repository.js";
import type { ProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import type { ConversationTurnStrategyInput, TurnSkillContextResolution } from "../../src/workbench/conversation-turn-contract.js";
import type { WorkbenchLiveEvent } from "../../src/workbench/types.js";

let root: string;
let previousAhoHome: string | undefined;
let fixture: Awaited<ReturnType<typeof createOnboardingFixture>>;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-direct-agent-turn-"));
  previousAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(root, "aho-home");
  fixture = await createOnboardingFixture(root, process.env.AHO_HOME);
});

afterEach(async () => {
  if (previousAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = previousAhoHome;
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe("DirectAgentConversationTurnStrategy", () => {
  it("runs from an onboarding project path with Agent readiness and persists no-delta output", async () => {
    const skillPath = join(root, "ordinary-skill", "SKILL.md");
    await mkdir(dirname(skillPath), { recursive: true });
    await writeFile(skillPath, "---\nname: ordinary-skill\ndescription: Direct Agent test Skill.\n---\n", "utf8");
    const skillContext = skillResolution({
      path: skillPath,
      contentHash: await hashNativeSkillPackageContent(dirname(skillPath)),
    });
    const harness = fakeProvider({
      lastMessage: "Direct Agent completed without realtime text.",
      skills: [{
        name: "ordinary-skill",
        description: "Direct Agent test Skill",
        path: skillPath,
        scope: "user",
        enabled: true,
        contentHash: skillContext.skillInputs[0]!.contentHash,
      }],
    });
    const { strategy, registry } = strategyFor(harness.descriptor);
    const input = await initialTurnInput(fixture, "Read the current project marker.");
    const database = await openProjectRuntimeWorkbenchDatabase(fixture.paths);
    try {
      database.skills.setSkillEnablement({
        projectId: fixture.project.id,
        changeId: input.conversation.conversationId,
        skillId: "ordinary-skill",
        scope: "topic",
        enabled: true,
        updatedAt: new Date().toISOString(),
      });
    } finally {
      database.close();
    }
    const resolver = new TurnSkillContextResolver({
      providerRegistry: registry,
      resolvePaths: () => fixture.paths,
    });

    const result = await strategy.execute(input, { skillContext: resolver });

    expect(result).toMatchObject({
      assistant: { text: "Direct Agent completed without realtime text.", status: "completed" },
      providerSessionId: "session-1",
    });
    expect(harness.requests).toHaveLength(1);
    const request = harness.requests[0]!;
    expect(request).toMatchObject({
      providerId: "codex",
      operationProfile: "agent",
      projectId: fixture.project.id,
      conversationId: input.conversation.conversationId,
      runtimeScopeId: input.conversation.conversationId,
      roleId: "main-agent",
      cwd: fixture.project.path,
      sandboxPolicy: "workspace-write",
      existingSession: null,
      skillInputs: skillContext.skillInputs,
      runtimeWorkspaceRoots: [fixture.project.path],
      writableRoots: [fixture.project.path],
    });
    expect(request.tools).toBeUndefined();
    expect(request.objectiveSession).toBeUndefined();
    expect(request.requiredNativeSkills).toBeUndefined();
    expect(request.additionalContext).toBeUndefined();
    expect(registry.findActiveTurn(input.conversation.conversationId)).toBeNull();

    const state = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    expect(state.conversation.completedTurnSequence).toBe(1);
    expect(state.attempts).toEqual([
      expect.objectContaining({
        productMode: "agent",
        operationProfile: "agent",
        roleId: "main-agent",
        status: "completed",
        effectiveSkillInputs: skillContext.skillInputs,
      }),
    ]);
    expect(state.binding).toMatchObject({ nativeSessionId: "session-1", bindingStatus: "ready" });
    expect(state.messages).toEqual([
      expect.objectContaining({ type: "user.message", text: "Read the current project marker." }),
      expect.objectContaining({ type: "assistant.message", text: "Direct Agent completed without realtime text.", status: "completed" }),
    ]);
  });

  it("does not discover Skills or create Provider activity for a stale Conversation", async () => {
    const provider = fakeProvider();
    const skillList = vi.spyOn(provider.descriptor.skills, "list");
    const { strategy, registry } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Do not execute this stale Turn.");
    const database = await openProjectRuntimeWorkbenchDatabase(fixture.paths);
    try {
      database.conversations.markConversationDeleted(
        fixture.project.id,
        input.conversation.conversationId,
        new Date().toISOString(),
      );
    } finally {
      database.close();
    }
    const resolver = new TurnSkillContextResolver({
      providerRegistry: registry,
      resolvePaths: () => fixture.paths,
    });

    await expect(strategy.execute(input, { skillContext: resolver })).rejects.toMatchObject({
      name: "TurnSkillContextError",
      code: "stale_conversation",
    });
    expect(skillList).not.toHaveBeenCalled();
    expect(provider.requests).toEqual([]);
    const sidecar = await openProjectRuntimeWorkbenchDatabase(fixture.paths);
    try {
      expect(sidecar.providerAttempts.listProviderAttempts(
        fixture.project.id,
        input.conversation.conversationId,
      )).toEqual([]);
    } finally {
      sidecar.close();
    }
  });

  it("resumes only the same Conversation binding and persists top-level plus native-child realtime", async () => {
    const provider = fakeProvider({ realtime: true, lastMessage: "fallback must not duplicate" });
    const { strategy } = strategyFor(provider.descriptor);
    const first = await initialTurnInput(fixture, "First turn");
    await strategy.execute(first, emptyPorts());

    const secondFixture = await createAgentConversation(fixture, "Second conversation");
    const secondInput = await storedTurnInput(fixture, secondFixture.conversationId);
    await strategy.execute(secondInput, emptyPorts());

    expect(provider.requests[0]?.existingSession).toBeNull();
    expect(provider.requests[1]?.existingSession).toBeNull();

    const firstState = await readState(fixture.paths, fixture.project.id, first.conversation.conversationId);
    expect(firstState.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ agentSurfaceId: "main-agent", text: "realtime reply", status: "completed" }),
      expect.objectContaining({ text: "child", status: "completed" }),
      expect.objectContaining({
        agentSurfaceId: "agent:codex:thread:session-1-child-1",
        threadId: "session-1-child-1",
        rawJson: expect.stringContaining("child reply"),
      }),
    ]));
    expect(firstState.attempts).toEqual(expect.arrayContaining([
      expect.objectContaining({ roleId: "main-agent", status: "completed" }),
      expect.objectContaining({ roleId: "native-child-agent", operationProfile: "agent", status: "completed" }),
    ]));
    expect(firstState.threads).toEqual(expect.arrayContaining([
      expect.objectContaining({ roleId: "main-agent", parentThreadId: null }),
      expect.objectContaining({
        roleId: "native-child-agent",
        parentThreadId: "session-1",
        providerThreadId: "session-1-child-1",
      }),
    ]));

    const firstLater = await appendCanonicalUserMessage(fixture, first.conversation.conversationId, "Resume this Conversation");
    await strategy.execute(firstLater, emptyPorts());
    expect(provider.requests[2]?.existingSession).toEqual({ providerId: "codex", sessionId: "session-1" });
    const resumedState = await readState(fixture.paths, fixture.project.id, first.conversation.conversationId);
    expect(resumedState.attempts.filter((attempt) => attempt.roleId === "main-agent")).toHaveLength(2);
    expect(resumedState.attempts.filter((attempt) => attempt.roleId === "native-child-agent")).toHaveLength(1);
    expect(resumedState.threads).toEqual(expect.arrayContaining([
      expect.objectContaining({ roleId: "main-agent", parentThreadId: null }),
      expect.objectContaining({ roleId: "native-child-agent", parentThreadId: "session-1" }),
    ]));
  });

  it("deduplicates replayed child callbacks and converges closed-before-start with a late result", async () => {
    const provider = fakeProvider({ realtime: true, replayChildCallbacks: true, closeBeforeStart: true });
    const { strategy } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Exercise child callback convergence");

    await expect(strategy.execute(input, emptyPorts())).resolves.toMatchObject({ providerSessionId: "session-1" });
    const state = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    expect(state.attempts.filter((attempt) => attempt.roleId === "native-child-agent")).toEqual([
      expect.objectContaining({ status: "terminated" }),
    ]);
    expect(state.threads.filter((thread) => thread.roleId === "native-child-agent")).toHaveLength(1);
    expect(state.messages.filter((message) => message.text === "child")).toHaveLength(1);
  });

  it.each(["failed", "completed"] as const)("keeps repeated running child results non-terminal before %s", async (terminalStatus) => {
    const observedStatuses: string[] = [];
    const behavior: FakeProviderBehavior = {
      realtime: true,
      childResultCallbacks: ["running", "running", "provider-specific-pending", terminalStatus],
    };
    const provider = fakeProvider(behavior);
    const { strategy } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, `Converge running child to ${terminalStatus}`);
    behavior.onChildResult = async () => {
      const state = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
      observedStatuses.push(state.attempts.find((attempt) => attempt.roleId === "native-child-agent")?.status ?? "missing");
    };

    await expect(strategy.execute(input, emptyPorts())).resolves.toMatchObject({ providerSessionId: "session-1" });
    const state = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    expect(observedStatuses).toEqual(["running", "running", "running", terminalStatus]);
    expect(state.attempts.filter((attempt) => attempt.roleId === "native-child-agent")).toEqual([
      expect.objectContaining({ status: terminalStatus }),
    ]);
    expect(state.messages.filter((message) => message.text === "child initial input")).toHaveLength(1);
    expect(state.messages.filter((message) => message.id.endsWith(":result"))).toHaveLength(1);
  });

  it.each([
    ["project", { projectId: "wrong-project" }],
    ["conversation", { conversationId: "wrong-conversation" }],
    ["graph", { graphScopeId: "wrong-graph" }],
    ["run", { runId: "wrong-run" }],
    ["provider", { providerId: "wrong-provider" }],
    ["parent-child", { parentThreadId: "wrong-parent" }],
  ] as const)("drops child realtime with mismatched %s identity without persistence", async (_label, override) => {
    const provider = fakeProvider({ realtime: true, childRealtimeOverrides: [override] });
    const { strategy } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Fence child realtime");
    await strategy.execute(input, emptyPorts());
    const state = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    expect(state.messages.some((message) => message.text?.includes("must-not-persist"))).toBe(false);
    expect(state.attempts.filter((attempt) => attempt.roleId === "native-child-agent")).toHaveLength(1);
  });

  it.each(["completed", "failed"] as const)("lets closed override %s and deduplicates repeated close", async (terminalStatus) => {
    const provider = fakeProvider({
      realtime: true,
      childResultCallbacks: [terminalStatus],
      childCloseAfterResult: true,
      replayChildCallbacks: true,
    });
    const { strategy } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, `Close after ${terminalStatus}`);
    await strategy.execute(input, emptyPorts());
    const state = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    expect(state.attempts.filter((attempt) => attempt.roleId === "native-child-agent")).toEqual([
      expect.objectContaining({ status: "terminated" }),
    ]);
    expect(state.messages.filter((message) => message.text === "Provider closed native child.")).toHaveLength(1);
  });

  it("runs the top-level Agent when native child capability is absent", async () => {
    const provider = fakeProvider({ childCapability: false });
    const { strategy } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Provider has no child support");

    await expect(strategy.execute(input, emptyPorts())).resolves.toMatchObject({ assistantMessage: "completed" });
    expect((await readState(fixture.paths, fixture.project.id, input.conversation.conversationId)).attempts).toEqual([
      expect.objectContaining({ roleId: "main-agent", status: "completed" }),
    ]);
  });

  it("rejects a child callback whose parent Attempt ThreadLink is stale without child mutation", async () => {
    const provider = fakeProvider({ realtime: true, childLifecycleParentOverride: "stale-parent", suppressChildSnapshot: true });
    const { strategy } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Reject stale parent callback");
    await expect(strategy.execute(input, emptyPorts())).rejects.toMatchObject({ name: "Conflict" });
    const state = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    expect(state.attempts.filter((attempt) => attempt.roleId === "native-child-agent")).toEqual([]);
    expect(state.threads.filter((thread) => thread.roleId === "native-child-agent")).toEqual([]);
    expect(state.messages.some((message) => message.text === "Provider started native child.")).toBe(false);
  });

  it("inspects exact lineage before sending plain-text follow-up only to the native child", async () => {
    const provider = fakeProvider({ realtime: true });
    const { strategy, registry } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Create child history");
    await strategy.execute(input, emptyPorts());

    await expect(runAgentNativeChildFollowup({
      project: fixture.project,
      conversationId: input.conversation.conversationId,
      agentSurfaceId: "agent:codex:thread:session-1-child-1",
      message: "Continue precisely here",
      providerRegistry: registry,
    })).resolves.toMatchObject({ providerSessionId: "session-1-child-1" });
    expect(provider.inspectedChildren).toEqual(["session-1-child-1"]);
    expect(provider.continuedChildren).toEqual(["session-1-child-1"]);
  });

  it("persists main to child to grandchild lineage and follows up on the exact nested child", async () => {
    const provider = fakeProvider({ realtime: true, nestedChild: true });
    const { strategy, registry } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Create nested child history");
    await strategy.execute(input, emptyPorts());

    const state = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    expect(state.threads).toEqual(expect.arrayContaining([
      expect.objectContaining({
        providerThreadId: "session-1-child-1",
        parentThreadId: "session-1",
        parentAgentSurfaceId: "main-agent",
      }),
      expect.objectContaining({
        providerThreadId: "session-1-grandchild-1",
        parentThreadId: "session-1-child-1",
        parentAgentSurfaceId: "agent:codex:thread:session-1-child-1",
      }),
    ]));

    await expect(runAgentNativeChildFollowup({
      project: fixture.project,
      conversationId: input.conversation.conversationId,
      agentSurfaceId: "agent:codex:thread:session-1-grandchild-1",
      message: "Continue the grandchild",
      providerRegistry: registry,
    })).resolves.toMatchObject({ providerSessionId: "session-1-grandchild-1" });
    expect(provider.inspectedLineages).toContainEqual({ parent: "session-1-child-1", target: "session-1-grandchild-1" });
    expect(provider.continuedLineages).toContainEqual({ parent: "session-1-child-1", target: "session-1-grandchild-1" });
  });

  it.each(["orphan", "cycle", "mismatch"] as const)("rejects %s nested lineage before Provider inspection", async (damage) => {
    const provider = fakeProvider({ realtime: true, nestedChild: true });
    const { strategy, registry } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, `Create ${damage} nested lineage`);
    await strategy.execute(input, emptyPorts());
    await damageNestedLineage(fixture.paths, fixture.project.id, damage);

    await expect(runAgentNativeChildFollowup({
      project: fixture.project,
      conversationId: input.conversation.conversationId,
      agentSurfaceId: "agent:codex:thread:session-1-grandchild-1",
      message: "Must fail closed",
      providerRegistry: registry,
    })).rejects.toMatchObject({ name: "Conflict" });
    expect(provider.inspectedLineages).toEqual([]);
    expect(provider.continuedLineages).toEqual([]);
  });

  it("returns Conflict for stale lineage without sending to child or main", async () => {
    const provider = fakeProvider({ realtime: true, childInspection: "stale" });
    const { strategy, registry } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Create stale child history");
    await strategy.execute(input, emptyPorts());

    await expect(runAgentNativeChildFollowup({
      project: fixture.project,
      conversationId: input.conversation.conversationId,
      agentSurfaceId: "agent:codex:thread:session-1-child-1",
      message: "Must not fallback",
      providerRegistry: registry,
    })).rejects.toMatchObject({ name: "Conflict", message: expect.stringContaining("stale") });
    expect(provider.continuedChildren).toEqual([]);
    expect(provider.requests).toHaveLength(1);
  });

  it("terminalizes a failed follow-up when the Provider rejects continueChild", async () => {
    const provider = fakeProvider({ realtime: true, continueChildError: "follow-up failed" });
    const { strategy, registry } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Create child for failed follow-up");
    await strategy.execute(input, emptyPorts());

    await expect(runAgentNativeChildFollowup({
      project: fixture.project,
      conversationId: input.conversation.conversationId,
      agentSurfaceId: "agent:codex:thread:session-1-child-1",
      message: "Fail this follow-up",
      providerRegistry: registry,
    })).rejects.toThrow("follow-up failed");
    const state = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    expect(state.attempts.filter((attempt) => attempt.roleId === "native-child-agent").at(-1)).toMatchObject({ status: "failed" });
    expect(state.attempts.every((attempt) => attempt.status !== "queued" && attempt.status !== "running")).toBe(true);
  });

  it("rejects a non-throwing failed follow-up result after persisting one failed terminal fact", async () => {
    const provider = fakeProvider({ realtime: true, continueChildStatus: "failed" });
    const { strategy, registry } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Create child for failed result");
    await strategy.execute(input, emptyPorts());

    await expect(runAgentNativeChildFollowup({
      project: fixture.project,
      conversationId: input.conversation.conversationId,
      agentSurfaceId: "agent:codex:thread:session-1-child-1",
      message: "Return failed",
      providerRegistry: registry,
    })).rejects.toThrow("Native child follow-up failed");
    const state = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    const children = state.attempts.filter((attempt) => attempt.roleId === "native-child-agent");
    const latest = children.at(-1)!;
    expect(children.filter((attempt) => attempt.attemptId === latest.attemptId)).toHaveLength(1);
    expect(latest.status).toBe("failed");
    expect(state.messages.filter((message) => {
      const raw = JSON.parse(message.rawJson) as { attemptId?: string; status?: string };
      return raw.attemptId === latest.attemptId && message.id.endsWith(":result");
    }).length).toBeLessThanOrEqual(1);
  });

  it("preserves existing interrupted follow-up return semantics", async () => {
    const provider = fakeProvider({ realtime: true, continueChildStatus: "interrupted" });
    const { strategy, registry } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Create child for interrupted result");
    await strategy.execute(input, emptyPorts());
    await expect(runAgentNativeChildFollowup({
      project: fixture.project,
      conversationId: input.conversation.conversationId,
      agentSurfaceId: "agent:codex:thread:session-1-child-1",
      message: "Interrupt",
      providerRegistry: registry,
    })).resolves.toMatchObject({ providerSessionId: "session-1-child-1" });
  });

  it("atomically rolls back follow-up Attempt and ThreadLink when the user Timeline write fails", async () => {
    const provider = fakeProvider({ realtime: true });
    const { strategy, registry } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Create child before atomic failure");
    await strategy.execute(input, emptyPorts());
    const before = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    const originalAppend = TimelineRepository.prototype.appendMessage;
    const spy = vi.spyOn(TimelineRepository.prototype, "appendMessage").mockImplementation(function (message) {
      if (message.id.startsWith(`user:${input.conversation.conversationId}:codex:agent-child-`)) throw new Error("Injected follow-up Timeline failure.");
      return originalAppend.call(this, message);
    });
    try {
      await expect(runAgentNativeChildFollowup({
        project: fixture.project,
        conversationId: input.conversation.conversationId,
        agentSurfaceId: "agent:codex:thread:session-1-child-1",
        message: "Must roll back",
        providerRegistry: registry,
      })).rejects.toThrow("Injected follow-up Timeline failure");
    } finally {
      spy.mockRestore();
    }
    const after = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    expect(after.attempts).toHaveLength(before.attempts.length);
    expect(after.threads).toHaveLength(before.threads.length);
    expect(after.messages.filter((message) => message.text === "Must roll back")).toHaveLength(0);
    expect(provider.continuedChildren).toEqual([]);
  });

  it("does not create follow-up activity when run artifact mkdir fails", async () => {
    const provider = fakeProvider({ realtime: true });
    const { strategy, registry } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Create child before mkdir failure");
    await strategy.execute(input, emptyPorts());
    const before = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    await rm(fixture.paths.runsRoot, { recursive: true, force: true });
    await writeFile(fixture.paths.runsRoot, "not-a-directory", "utf8");
    await expect(runAgentNativeChildFollowup({
      project: fixture.project,
      conversationId: input.conversation.conversationId,
      agentSurfaceId: "agent:codex:thread:session-1-child-1",
      message: "Must fail before persistence",
      providerRegistry: registry,
    })).rejects.toThrow();
    const after = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    expect(after.attempts).toHaveLength(before.attempts.length);
    expect(after.threads).toHaveLength(before.threads.length);
    expect(provider.continuedChildren).toEqual([]);
  });

  it("keeps late activity A callbacks isolated after same-thread activity B and service restart", async () => {
    const provider = fakeProvider({ realtime: true });
    const { strategy, registry } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Create activity A");
    await strategy.execute(input, emptyPorts());
    await runAgentNativeChildFollowup({
      project: fixture.project,
      conversationId: input.conversation.conversationId,
      agentSurfaceId: "agent:codex:thread:session-1-child-1",
      message: "Create activity B",
      providerRegistry: registry,
    });
    const before = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    const children = before.attempts.filter((attempt) => attempt.roleId === "native-child-agent");
    const activityA = children[0]!;
    const activityB = children[1]!;
    const main = before.attempts.find((attempt) => attempt.roleId === "main-agent")!;
    const database = await openProjectRuntimeWorkbenchDatabase(fixture.paths);
    try {
      const restarted = new AgentNativeChildLifecycleService({
        database,
        projectId: fixture.project.id,
        conversationId: input.conversation.conversationId,
        graphScopeId: input.conversation.currentGraphScopeId!,
        runId: main.attemptId,
        parentAttemptId: main.attemptId,
        providerId: "codex",
        capabilitySnapshot: capabilitySnapshot("agent"),
        model: null,
        parentHandoffHash: main.handoffHash,
        deliveredThroughCompletedTurn: 0,
        capture: createAssistantTranscriptCapture(undefined),
        publish: () => undefined,
        onInvalidated: () => undefined,
      });
      restarted.onResult({
        providerId: "codex", activityId: "activity-1", parentThreadId: "session-1", threadId: "session-1-child-1",
        status: "failed", finalText: "late A failure", changedFiles: [],
      });
      restarted.onLifecycle({
        providerId: "codex", kind: "closed", activityId: "activity-1",
        parentSession: { providerId: "codex", sessionId: "session-1" },
        childSession: { providerId: "codex", sessionId: "session-1-child-1" },
      });
    } finally {
      database.close();
    }
    const after = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    expect(after.attempts.find((attempt) => attempt.attemptId === activityA.attemptId)?.status).toBe("terminated");
    expect(after.attempts.find((attempt) => attempt.attemptId === activityB.attemptId)?.status).toBe(activityB.status);
    const late = after.messages.find((message) => message.text === "late A failure")!;
    const raw = JSON.parse(late.rawJson) as { attemptId?: string; status?: string };
    expect(raw).toMatchObject({ attemptId: activityA.attemptId, status: "completed" });
  });

  it("fails attachments before Skill resolution, readiness, or Attempt creation", async () => {
    const provider = fakeProvider();
    const { strategy } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Attachment boundary");
    input.attachments = [{
      id: "attachment-1",
      fileName: "input.txt",
      mediaType: "text/plain",
      kind: "text",
      size: 3,
      hash: "hash",
      source: "composer",
      createdAt: new Date().toISOString(),
      storagePath: join(root, "input.txt"),
      runtimeMode: "bounded-text-preview",
    }];
    const resolve = vi.fn();

    await expect(strategy.execute(input, { skillContext: { resolve } })).rejects.toMatchObject({
      name: "Conflict",
      message: "Direct Agent attachments are not supported in this increment.",
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(provider.requests).toEqual([]);
    expect((await readState(fixture.paths, fixture.project.id, input.conversation.conversationId)).attempts).toEqual([]);
  });

  it("keeps the committed user message and creates no Attempt when Skill resolution fails", async () => {
    const provider = fakeProvider();
    const { strategy } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Skill resolution boundary");

    await expect(strategy.execute(input, {
      skillContext: { resolve: async () => { throw new Error("Skill context unavailable"); } },
    })).rejects.toThrow("Skill context unavailable");

    const state = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    expect(state.messages).toEqual([expect.objectContaining({ type: "user.message", text: "Skill resolution boundary" })]);
    expect(state.attempts).toEqual([]);
    expect(provider.requests).toEqual([]);
  });

  it.each([
    { label: "failed result", behavior: { status: "failed" as const, error: "provider failed" }, expectedStatus: "failed" },
    { label: "thrown error", behavior: { throwError: "provider threw" }, expectedStatus: "failed" },
    { label: "interrupted result", behavior: { status: "interrupted" as const }, expectedStatus: "interrupted" },
  ])("terminalizes a $label once without advancing the completed sequence", async ({ behavior, expectedStatus }) => {
    const provider = fakeProvider(behavior);
    const { strategy } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, `Exercise ${expectedStatus}`);

    if (expectedStatus === "interrupted") {
      await expect(strategy.execute(input, emptyPorts())).resolves.toMatchObject({ providerSessionId: "session-1" });
    } else {
      await expect(strategy.execute(input, emptyPorts())).rejects.toThrow(/provider failed|provider threw/);
    }

    const state = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    expect(state.attempts).toEqual([expect.objectContaining({ status: expectedStatus })]);
    expect(state.conversation.completedTurnSequence).toBe(0);
    expect(state.messages[0]).toMatchObject({ type: "user.message", text: `Exercise ${expectedStatus}` });
    expect(state.binding?.bindingStatus).toBe(expectedStatus === "interrupted" ? "ready" : "stale");
  });

  it("interrupts unsupported provider input and records a bounded failed Turn", async () => {
    const provider = fakeProvider({ userInput: true });
    const { strategy } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Ask for unsupported input");
    const events: WorkbenchLiveEvent[] = [];
    input.live = { emit: (event) => events.push(event) };

    await expect(strategy.execute(input, emptyPorts())).rejects.toMatchObject({
      name: "Conflict",
      message: "Direct Agent provider input is not supported in this increment.",
    });
    expect(provider.interrupts).toBe(1);
    expect(events).toContainEqual(expect.objectContaining({
      event: "error",
      data: expect.objectContaining({ message: "Direct Agent provider input is not supported in this increment." }),
    }));
    const state = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    expect(state.attempts).toEqual([
      expect.objectContaining({ roleId: "main-agent", status: "failed" }),
    ]);
    expect(state.conversation.completedTurnSequence).toBe(0);
  });

  it("rejects an overlapping Turn before creating a second Attempt", async () => {
    const release = deferred<void>();
    const entered = deferred<void>();
    const provider = fakeProvider({ waitForRelease: release.promise, onEntered: () => entered.resolve() });
    const { strategy } = strategyFor(provider.descriptor);
    const first = await initialTurnInput(fixture, "First active Turn");
    const firstRun = strategy.execute(first, emptyPorts());
    await entered.promise;

    const overlapping = await appendCanonicalUserMessage(fixture, first.conversation.conversationId, "Overlapping Turn");
    await expect(strategy.execute(overlapping, emptyPorts())).rejects.toMatchObject({
      name: "Conflict",
      message: "Direct Agent Conversation already has an active Turn.",
    });
    expect((await readState(fixture.paths, fixture.project.id, first.conversation.conversationId)).attempts).toHaveLength(1);

    release.resolve();
    await expect(firstRun).resolves.toMatchObject({ providerSessionId: "session-1" });
    const state = await readState(fixture.paths, fixture.project.id, first.conversation.conversationId);
    expect(state.attempts).toEqual([expect.objectContaining({ status: "completed" })]);
    expect(state.binding).toMatchObject({ bindingStatus: "ready", nativeSessionId: "session-1" });
  });

  it("recovers a running Attempt and realtime Timeline when the primary terminal transaction fails", async () => {
    const provider = fakeProvider({ realtime: true, lastMessage: "Terminal recovery candidate" });
    let injected = false;
    const { strategy } = strategyFor(provider.descriptor, {
      openDatabase: async (paths) => {
        const database = await openProjectRuntimeWorkbenchDatabase(paths);
        if (!injected) {
          injected = true;
          vi.spyOn(database.unitOfWork, "commitProviderTurnTerminal")
            .mockImplementationOnce(() => { throw new Error("Injected terminal persistence failure."); });
        }
        return database;
      },
    });
    const input = await initialTurnInput(fixture, "Recover terminal persistence");

    await expect(strategy.execute(input, emptyPorts())).rejects.toThrow("Injected terminal persistence failure.");
    const state = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    expect(state.attempts).toEqual(expect.arrayContaining([
      expect.objectContaining({ roleId: "main-agent", status: "failed" }),
      expect.objectContaining({ roleId: "native-child-agent", status: "completed" }),
    ]));
    expect(state.attempts.every((attempt) => attempt.status !== "queued" && attempt.status !== "running")).toBe(true);
    expect(state.conversation.completedTurnSequence).toBe(0);
    expect(state.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "assistant.message", status: "failed" }),
    ]));
    expect(state.messages).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ agentSurfaceId: "main-agent", type: "assistant.message", status: "running" }),
    ]));
  });

  it("preserves terminal errors when Timeline recovery falls back to closing only the Attempt", async () => {
    const provider = fakeProvider({ realtime: true, lastMessage: "Attempt-only recovery candidate" });
    let injected = false;
    const { strategy } = strategyFor(provider.descriptor, {
      openDatabase: async (paths) => {
        const database = await openProjectRuntimeWorkbenchDatabase(paths);
        if (!injected) {
          injected = true;
          const commitProviderCallback = database.unitOfWork.commitProviderCallback.bind(database.unitOfWork);
          vi.spyOn(database.unitOfWork, "commitProviderTurnTerminal")
            .mockImplementationOnce(() => { throw new Error("Injected primary terminal failure."); });
          let failedMainTimelineRecovery = false;
          vi.spyOn(database.unitOfWork, "commitProviderCallback")
            .mockImplementation((input) => {
              if (!input.attemptId.startsWith("native-child:") && !failedMainTimelineRecovery) {
                failedMainTimelineRecovery = true;
                throw new Error("Injected Timeline recovery failure.");
              }
              return commitProviderCallback(input);
            });
        }
        return database;
      },
    });
    const input = await initialTurnInput(fixture, "Recover Attempt after Timeline recovery failure");

    let failure: unknown;
    try {
      await strategy.execute(input, emptyPorts());
    } catch (error) {
      failure = error;
    }
    expect(errorMessages(failure)).toEqual(expect.arrayContaining([
      "Injected primary terminal failure.",
      "Injected Timeline recovery failure.",
    ]));
    const state = await readState(fixture.paths, fixture.project.id, input.conversation.conversationId);
    expect(state.attempts).toEqual(expect.arrayContaining([
      expect.objectContaining({ roleId: "main-agent", status: "failed" }),
      expect.objectContaining({ roleId: "native-child-agent", status: "completed" }),
    ]));
    expect(state.attempts.every((attempt) => attempt.status !== "queued" && attempt.status !== "running")).toBe(true);
    expect(state.conversation.completedTurnSequence).toBe(0);
  });

  it("runs against repair-required shared paths without creating Harness workflow artifacts", async () => {
    const ready = await import("../helpers/project-harness-fixture.js").then(({ createReadyProjectHarnessFixture }) =>
      createReadyProjectHarnessFixture({
        projectRoot: fixture.project.path,
        ahoHome: process.env.AHO_HOME!,
        projectId: fixture.project.id,
        projectName: fixture.project.name,
      }));
    await rm(join(ready.skillRoot, "references", "rules", "critical.md"), { force: true });
    const state = await new ProjectRuntimeCoordinator({
      store: new ProjectRegistryStore(process.env.AHO_HOME!),
      ahoHome: process.env.AHO_HOME!,
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    }).resolve(fixture.project);
    expect(state.state).toBe("repair-required");

    const provider = fakeProvider();
    const { strategy } = strategyFor(provider.descriptor);
    const input = await initialTurnInput(fixture, "Repair state must not block Agent mode");
    await expect(strategy.execute(input, emptyPorts())).resolves.toMatchObject({ providerSessionId: "session-1" });
    expect(provider.requests[0]).toMatchObject({ cwd: fixture.project.path, operationProfile: "agent" });
    expect(await readdir(join(ready.skillRoot, "state", "changes", "active"))).toEqual([]);
  });
});

interface FakeProviderBehavior {
  lastMessage?: string;
  realtime?: boolean;
  status?: "completed" | "interrupted" | "failed";
  error?: string;
  throwError?: string;
  userInput?: boolean;
  waitForRelease?: Promise<void>;
  onEntered?: () => void;
  skills?: ProviderNativeSkill[];
  childCapability?: boolean;
  replayChildCallbacks?: boolean;
  closeBeforeStart?: boolean;
  childInspection?: "available" | "stale";
  continueChildError?: string;
  childResultCallbacks?: Array<string>;
  onChildResult?: (status: string) => void | Promise<void>;
  nestedChild?: boolean;
  continueChildStatus?: "completed" | "failed" | "interrupted";
  childRealtimeOverrides?: Array<Partial<ProviderRealtimeEvent>>;
  childCloseAfterResult?: boolean;
  childLifecycleParentOverride?: string;
  suppressChildSnapshot?: boolean;
}

function fakeProvider(behavior: FakeProviderBehavior = {}): {
  descriptor: ProviderDescriptor;
  requests: ProviderTurnRequest[];
  interrupts: number;
  inspectedChildren: string[];
  continuedChildren: string[];
  inspectedLineages: Array<{ parent: string; target: string }>;
  continuedLineages: Array<{ parent: string; target: string }>;
} {
  const providerId = "codex";
  const requests: ProviderTurnRequest[] = [];
  let active: ActiveProviderTurn | null = null;
  let interrupts = 0;
  const inspectedChildren: string[] = [];
  const continuedChildren: string[] = [];
  const inspectedLineages: Array<{ parent: string; target: string }> = [];
  const continuedLineages: Array<{ parent: string; target: string }> = [];
  const result = (request: ProviderTurnRequest, status = behavior.status ?? "completed", sessionId = request.existingSession?.sessionId ?? "session-1"): ProviderTurnResult => ({
    providerId,
    status,
    session: { providerId, sessionId },
    turnId: "turn-1",
    lastMessage: behavior.lastMessage ?? (status === "failed" ? "" : "completed"),
    childThreads: behavior.realtime && !behavior.suppressChildSnapshot ? [{ providerId, activityId: "activity-1", parentThreadId: sessionId, threadId: `${sessionId}-child-1`, status: "completed", finalText: "child", changedFiles: [] }] : [],
    changedFiles: [],
    ...(behavior.error ? { error: behavior.error } : {}),
  });
  const descriptor: ProviderDescriptor = {
    id: providerId,
    displayName: "Codex",
    runtime: { shutdown: async () => undefined, shutdownProject: async () => undefined },
    capabilitySnapshot: async (_project, productMode) => capabilitySnapshot(productMode, behavior.childCapability !== false),
    runtimeSummary: async (_project, productMode) => ({
      providerId,
      productMode,
      harnessExecutionModes: ["stepwise", "scoped-auto"],
      snapshot: capabilitySnapshot(productMode, behavior.childCapability !== false),
    }),
    models: {
      read: async () => ({ providerId, selectedModel: null, effectiveModel: "test-model", effectiveModelSource: "provider-default", candidates: [], available: true }),
      select: async () => ({ providerId, selectedModel: null, effectiveModel: "test-model", effectiveModelSource: "provider-default", candidates: [], available: true }),
    },
    diagnostics: async () => ({
      providerId,
      displayName: "Codex",
      installation: { available: true, version: "test" },
      adapter: { id: "test", version: "1" },
      capabilities: capabilitySnapshot("agent", behavior.childCapability !== false),
      models: { providerId, selectedModel: null, effectiveModel: "test-model", effectiveModelSource: "provider-default", candidates: [], available: true },
      sessionHealth: "ready",
      lastError: null,
      rawEvidenceRefs: [],
      projectActions: [],
    }),
    projectActions: { list: async () => [], execute: async () => { throw new Error("not supported"); } },
    skills: {
      list: async ({ projectPath }) => ({ providerId, projectPath, skills: behavior.skills ?? [], errors: [] }),
      setEnabled: async ({ enabled }) => ({ effectiveEnabled: enabled }),
    },
    conversation: {
      runTurn: async (request) => {
        requests.push(request);
        if (behavior.throwError) throw new Error(behavior.throwError);
        const sessionId = request.existingSession?.sessionId ?? `session-${requests.length}`;
        active = {
          providerId,
          attemptId: request.attemptId,
          runtimeScopeId: request.runtimeScopeId!,
          roleId: request.roleId,
          runId: request.runId,
          session: { providerId, sessionId },
          turnId: "turn-1",
          startedAt: new Date().toISOString(),
          steer: async () => undefined,
          interrupt: async () => { interrupts += 1; },
          respondToUserInput: async () => undefined,
        };
        behavior.onEntered?.();
        if (behavior.waitForRelease) await behavior.waitForRelease;
        if (behavior.realtime) {
          const childThreadId = `${sessionId}-child-1`;
          request.onRealtimeEvent?.(realtime(request, { type: "text_delta", delta: "realtime reply", raw: {} }, { sessionId, threadId: sessionId }));
          request.onRealtimeEvent?.(realtime(request, {
            type: "tool_event",
            phase: "completed",
            status: "completed",
            id: "tool-1",
            name: "shell_command",
            command: "pwd",
            output: request.cwd,
          }, { sessionId, threadId: sessionId, itemId: "tool-1" }));
          const started = {
            providerId,
            kind: "started" as const,
            activityId: "activity-1",
            parentSession: { providerId, sessionId: behavior.childLifecycleParentOverride ?? sessionId },
            childSession: { providerId, sessionId: childThreadId },
            roleHint: "coder-agent",
            displayName: "Native coder",
          };
          const closed = { ...started, kind: "closed" as const };
          if (behavior.closeBeforeStart) request.onChildLifecycleEvent?.(closed);
          request.onChildLifecycleEvent?.(started);
          if (behavior.replayChildCallbacks) request.onChildLifecycleEvent?.(started);
          if (behavior.nestedChild) {
            const grandchildThreadId = `${sessionId}-grandchild-1`;
            request.onChildLifecycleEvent?.({
              ...started,
              activityId: "activity-grandchild-1",
              parentSession: { providerId, sessionId: childThreadId },
              childSession: { providerId, sessionId: grandchildThreadId },
              displayName: "Native grandchild",
            });
            request.onChildThreadResult?.({
              providerId,
              activityId: "activity-grandchild-1",
              parentThreadId: childThreadId,
              threadId: grandchildThreadId,
              status: "completed",
              displayName: "Native grandchild",
              finalText: "grandchild completed",
              changedFiles: [],
            });
          }
          for (const status of behavior.childResultCallbacks ?? []) {
            request.onChildThreadResult?.({
              providerId,
              activityId: "activity-1",
              parentThreadId: sessionId,
              threadId: childThreadId,
              status,
              displayName: "Native coder",
              finalText: status === "running" ? "" : `child ${status}`,
              changedFiles: [],
              initialInput: {
                turnId: "child-turn",
                itemId: "child-input",
                text: "child initial input",
              },
            });
            await behavior.onChildResult?.(status);
          }
          request.onRealtimeEvent?.(realtime(request, { type: "text_delta", delta: "child reply" }, {
            threadId: childThreadId,
            parentThreadId: sessionId,
            turnId: "child-turn",
            roleId: "coder-agent",
          }));
          for (const override of behavior.childRealtimeOverrides ?? []) {
            request.onRealtimeEvent?.(realtime(request, { type: "text_delta", delta: "must-not-persist" }, {
              threadId: childThreadId,
              parentThreadId: sessionId,
              turnId: "child-turn-mismatch",
              roleId: "coder-agent",
              ...override,
            }));
          }
          if (behavior.replayChildCallbacks && !behavior.closeBeforeStart) request.onChildLifecycleEvent?.(closed);
          if (behavior.childCloseAfterResult) request.onChildLifecycleEvent?.(closed);
        }
        if (behavior.userInput) {
          request.onUserInputRequest?.({
            providerId,
            requestId: "input-1",
            sessionId,
            threadId: sessionId,
            turnId: "turn-1",
            attemptId: request.attemptId,
            runId: request.runId,
            runtimeScopeId: request.runtimeScopeId!,
            roleId: request.roleId,
            questions: [{ id: "q1", question: "Continue?", inputMode: "single", allowCustom: false }],
          });
          await Promise.resolve();
          active = null;
          return result(request, "interrupted", sessionId);
        }
        active = null;
        return result(request, behavior.status, sessionId);
      },
      inspectChild: async (request) => {
        inspectedChildren.push(request.targetSession.sessionId);
        inspectedLineages.push({ parent: request.parentSession.sessionId, target: request.targetSession.sessionId });
        return behavior.childInspection ?? "available";
      },
      continueChild: async (request) => {
        continuedChildren.push(request.targetSession.sessionId);
        continuedLineages.push({ parent: request.parentSession.sessionId, target: request.targetSession.sessionId });
        if (behavior.continueChildError) throw new Error(behavior.continueChildError);
        return result(request, behavior.continueChildStatus);
      },
      closeChild: async (request) => result(request),
      getActiveTurn: () => active,
      listActiveTurns: () => active ? [active] : [],
    },
    leafExecution: { runTurn: async (request) => result(request) },
  };
  return {
    descriptor,
    requests,
    inspectedChildren,
    continuedChildren,
    inspectedLineages,
    continuedLineages,
    get interrupts() { return interrupts; },
  };
}

function strategyFor(descriptor: ProviderDescriptor, options: Omit<ConstructorParameters<typeof DirectAgentConversationTurnStrategy>[0], "providerRegistry"> = {}) {
  const registry = new ProviderRegistry();
  registry.register(descriptor);
  return { registry, strategy: new DirectAgentConversationTurnStrategy({ ...options, providerRegistry: registry }) };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function errorMessages(error: unknown): string[] {
  if (!(error instanceof Error)) return [String(error)];
  return [
    error.message,
    ...(error instanceof AggregateError ? error.errors.flatMap(errorMessages) : []),
  ];
}

function capabilitySnapshot(productMode: "agent" | "harness", childCapability = true): ProviderCapabilitySnapshot {
  const keys = new Set<ProviderCapabilityKey>(Object.values(PROVIDER_OPERATION_CAPABILITIES).flat());
  if (!childCapability) {
    keys.delete("child.spawn");
    keys.delete("child.result");
  }
  return {
    providerId: "codex",
    displayName: "Codex",
    productMode,
    status: "ready",
    runnable: true,
    checkedAt: new Date().toISOString(),
    snapshotHash: `snapshot-${productMode}`,
    snapshotVersion: 1,
    effectiveModel: "test-model",
    effectiveModelSource: "provider-default",
    degradedReasons: [],
    capabilities: [...keys].map((key) => ({ key, label: key, spec: "supported", runtime: "ready", summary: "ready" })),
  };
}

function realtime(
  request: ProviderTurnRequest,
  streamEvent: ProviderRealtimeEvent["streamEvent"],
  overrides: Partial<ProviderRealtimeEvent> = {},
): ProviderRealtimeEvent {
  return {
    projectId: request.projectId,
    conversationId: request.conversationId,
    graphScopeId: request.graphScopeId,
    runId: request.runId,
    attemptId: request.attemptId,
    providerId: request.providerId,
    sessionId: request.existingSession?.sessionId ?? "session-1",
    threadId: request.existingSession?.sessionId ?? "session-1",
    turnId: "turn-1",
    itemId: "message-1",
    roleId: request.roleId,
    streamEvent,
    method: "test/event",
    ...overrides,
  };
}

async function createOnboardingFixture(baseRoot: string, ahoHome: string) {
  const projectRoot = join(baseRoot, "project");
  await mkdir(projectRoot, { recursive: true });
  await writeFile(join(projectRoot, "cwd-marker.txt"), "direct-agent-cwd\n", "utf8");
  const store = new ProjectRegistryStore(ahoHome);
  const coordinator = new ProjectRuntimeCoordinator({
    store,
    ahoHome,
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  const registered = await coordinator.register({ path: projectRoot, name: "Direct Agent Test" });
  if (registered.state !== "onboarding") throw new Error(`Expected onboarding fixture, received ${registered.state}.`);
  return { project: registered.project, paths: registered.paths };
}

async function createAgentConversation(current: typeof fixture, body: string) {
  return createWorkbenchConversation(current.project, {
    body,
    productMode: "agent",
    clientRequestId: `request-${Math.random().toString(36).slice(2)}`,
  }, undefined, { runMainAgent: false });
}

async function initialTurnInput(current: typeof fixture, body: string): Promise<ConversationTurnStrategyInput> {
  const created = await createAgentConversation(current, body);
  return storedTurnInput(current, created.conversationId);
}

async function storedTurnInput(current: typeof fixture, conversationId: string): Promise<ConversationTurnStrategyInput> {
  const database = await openProjectRuntimeWorkbenchDatabase(current.paths);
  try {
    const conversation = database.conversations.readConversation(current.project.id, conversationId)!;
    const committedMessage = database.timeline.listConversationMessages(current.project.id, conversationId).at(-1)!;
    return {
      project: current.project,
      conversation,
      committedMessage,
      attachments: [],
      providerId: conversation.selectedProviderId,
    };
  } finally {
    database.close();
  }
}

async function appendCanonicalUserMessage(current: typeof fixture, conversationId: string, text: string): Promise<ConversationTurnStrategyInput> {
  const database = await openProjectRuntimeWorkbenchDatabase(current.paths);
  try {
    const conversation = database.conversations.readConversation(current.project.id, conversationId)!;
    const timestamp = new Date().toISOString();
    database.timeline.appendMessage({
      id: `user:${conversationId}:${Date.now().toString(36)}`,
      projectId: current.project.id,
      conversationId,
      changeId: "",
      agentSurfaceId: "main-agent",
      type: "user.message",
      timestamp,
      text,
      actionRunId: null,
      actionType: null,
      status: null,
      runId: null,
      providerId: null,
      threadId: null,
      turnId: null,
      itemId: null,
      artifact: null,
      error: null,
      rawJson: JSON.stringify({
        conversationId,
        graphScopeId: conversation.currentGraphScopeId,
        completedTurnSequence: conversation.completedTurnSequence + 1,
        text,
      }),
    });
  } finally {
    database.close();
  }
  return storedTurnInput(current, conversationId);
}

async function damageNestedLineage(paths: ProjectRuntimePaths, projectId: string, damage: "orphan" | "cycle" | "mismatch"): Promise<void> {
  const database = new Database(paths.workbenchDbPath);
  try {
    if (damage === "orphan") {
      database.prepare(`UPDATE provider_thread_links SET parent_thread_id = ?
        WHERE project_id = ? AND provider_thread_id = ?`).run("missing-parent", projectId, "session-1-child-1");
    } else if (damage === "cycle") {
      database.prepare(`UPDATE provider_thread_links SET parent_thread_id = ?, parent_agent_surface_id = ?
        WHERE project_id = ? AND provider_thread_id = ?`).run(
        "session-1-grandchild-1",
        "agent:codex:thread:session-1-grandchild-1",
        projectId,
        "session-1-child-1",
      );
    } else {
      database.prepare(`UPDATE provider_thread_links SET parent_agent_surface_id = ?
        WHERE project_id = ? AND provider_thread_id = ?`).run("main-agent", projectId, "session-1-grandchild-1");
    }
  } finally {
    database.close();
  }
}

function emptyPorts() {
  return { skillContext: { resolve: async () => skillResolution() } };
}

function skillResolution(overrides: Partial<TurnSkillContextResolution["skillInputs"][number]> = {}): TurnSkillContextResolution {
  return {
    skillInputs: [{
      id: "ordinary-skill",
      path: join(root, "ordinary-skill", "SKILL.md"),
      contentHash: "skill-hash",
      source: "provider-native",
      required: false,
      ...overrides,
    }],
    diagnostics: [],
  };
}

async function readState(paths: ProjectRuntimePaths, projectId: string, conversationId: string) {
  const database = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    const conversation = database.conversations.readConversation(projectId, conversationId)!;
    return {
      conversation,
      messages: database.timeline.listConversationMessages(projectId, conversationId),
      attempts: database.providerAttempts.listProviderAttempts(projectId, conversationId),
      threads: database.providerAttempts.listProviderThreads(projectId, conversationId),
      binding: database.providerAttempts.readConversationProviderBinding(projectId, conversationId, conversation.selectedProviderId),
    };
  } finally {
    database.close();
  }
}
