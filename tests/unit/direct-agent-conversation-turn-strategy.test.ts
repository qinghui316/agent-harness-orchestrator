import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ProviderRegistry,
  type ActiveProviderTurn,
  type ProviderCapabilityKey,
  type ProviderCapabilitySnapshot,
  type ProviderDescriptor,
  type ProviderRealtimeEvent,
  type ProviderTurnRequest,
  type ProviderTurnResult,
} from "../../src/provider-runtime/index.js";
import { PROVIDER_OPERATION_CAPABILITIES } from "../../src/provider-runtime/types.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../src/provider-runtime/project-harness-discovery.js";
import { ProjectRuntimeCoordinator } from "../../src/project-runtime/coordinator.js";
import { ProjectRegistryStore } from "../../src/registry/store.js";
import { createWorkbenchConversation } from "../../src/workbench/conversation-service.js";
import { DirectAgentConversationTurnStrategy } from "../../src/workbench/direct-agent-conversation-turn-strategy.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
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
    const harness = fakeProvider({ lastMessage: "Direct Agent completed without realtime text." });
    const skillContext = skillResolution();
    const { strategy, registry } = strategyFor(harness.descriptor);
    const input = await initialTurnInput(fixture, "Read the current project marker.");
    const resolve = vi.fn(async () => skillContext);

    const result = await strategy.execute(input, { skillContext: { resolve } });

    expect(result).toMatchObject({
      assistant: { text: "Direct Agent completed without realtime text.", status: "completed" },
      providerSessionId: "session-1",
    });
    expect(resolve).toHaveBeenCalledWith({
      project: fixture.project,
      conversation: input.conversation,
      requiredSkillIds: [],
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

  it("resumes only the same Conversation binding and persists top-level realtime while ignoring child events", async () => {
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
    expect(firstState.messages.filter((message) => message.type === "assistant.message")).toHaveLength(1);
    expect(firstState.messages.at(-1)).toMatchObject({ text: "realtime reply", status: "completed" });
    expect(firstState.attempts).toHaveLength(1);
    expect(firstState.threads).toEqual([expect.objectContaining({ roleId: "main-agent", parentThreadId: null })]);

    const firstLater = await appendCanonicalUserMessage(fixture, first.conversation.conversationId, "Resume this Conversation");
    await strategy.execute(firstLater, emptyPorts());
    expect(provider.requests[2]?.existingSession).toEqual({ providerId: "codex", sessionId: "session-1" });
    const resumedState = await readState(fixture.paths, fixture.project.id, first.conversation.conversationId);
    expect(resumedState.attempts).toHaveLength(2);
    expect(resumedState.threads.every((thread) => thread.roleId === "main-agent")).toBe(true);
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
    expect(state.attempts).toEqual([expect.objectContaining({ status: "failed" })]);
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
    expect(state.attempts).toEqual([expect.objectContaining({ status: "failed" })]);
    expect(state.conversation.completedTurnSequence).toBe(0);
    expect(state.messages).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "assistant.message", status: "failed" }),
    ]));
    expect(state.messages).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "assistant.message", status: "running" }),
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
          vi.spyOn(database.unitOfWork, "commitProviderCallback")
            .mockImplementationOnce(() => { throw new Error("Injected Timeline recovery failure."); })
            .mockImplementation((input) => commitProviderCallback(input));
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
    expect(state.attempts).toEqual([expect.objectContaining({ status: "failed" })]);
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
}

function fakeProvider(behavior: FakeProviderBehavior = {}): {
  descriptor: ProviderDescriptor;
  requests: ProviderTurnRequest[];
  interrupts: number;
} {
  const providerId = "codex";
  const requests: ProviderTurnRequest[] = [];
  let active: ActiveProviderTurn | null = null;
  let interrupts = 0;
  const result = (request: ProviderTurnRequest, status = behavior.status ?? "completed", sessionId = request.existingSession?.sessionId ?? "session-1"): ProviderTurnResult => ({
    providerId,
    status,
    session: { providerId, sessionId },
    turnId: "turn-1",
    lastMessage: behavior.lastMessage ?? (status === "failed" ? "" : "completed"),
    childThreads: behavior.realtime ? [{ providerId, parentThreadId: "session-1", threadId: "child-1", finalText: "child", changedFiles: [] }] : [],
    changedFiles: [],
    ...(behavior.error ? { error: behavior.error } : {}),
  });
  const descriptor: ProviderDescriptor = {
    id: providerId,
    displayName: "Codex",
    runtime: { shutdown: async () => undefined, shutdownProject: async () => undefined },
    capabilitySnapshot: async (_project, productMode) => capabilitySnapshot(productMode),
    runtimeSummary: async (_project, productMode) => ({
      providerId,
      productMode,
      harnessExecutionModes: ["stepwise", "scoped-auto"],
      snapshot: capabilitySnapshot(productMode),
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
      capabilities: capabilitySnapshot("agent"),
      models: { providerId, selectedModel: null, effectiveModel: "test-model", effectiveModelSource: "provider-default", candidates: [], available: true },
      sessionHealth: "ready",
      lastError: null,
      rawEvidenceRefs: [],
      projectActions: [],
    }),
    projectActions: { list: async () => [], execute: async () => { throw new Error("not supported"); } },
    skills: {
      list: async ({ projectPath }) => ({ providerId, projectPath, skills: [], errors: [] }),
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
          request.onRealtimeEvent?.(realtime(request, { type: "text_delta", delta: "child reply" }, {
            threadId: "child-1",
            parentThreadId: sessionId,
            turnId: "child-turn",
            roleId: "coder-agent",
          }));
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
      inspectChild: async () => "available",
      continueChild: async (request) => result(request),
      closeChild: async (request) => result(request),
      getActiveTurn: () => active,
      listActiveTurns: () => active ? [active] : [],
    },
    leafExecution: { runTurn: async (request) => result(request) },
  };
  return {
    descriptor,
    requests,
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

function capabilitySnapshot(productMode: "agent" | "harness"): ProviderCapabilitySnapshot {
  const keys = new Set<ProviderCapabilityKey>(Object.values(PROVIDER_OPERATION_CAPABILITIES).flat());
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

function emptyPorts() {
  return { skillContext: { resolve: async () => skillResolution() } };
}

function skillResolution(): TurnSkillContextResolution {
  return {
    skillInputs: [{ id: "ordinary-skill", path: join(root, "ordinary-skill", "SKILL.md"), contentHash: "skill-hash", source: "project", required: false }],
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
