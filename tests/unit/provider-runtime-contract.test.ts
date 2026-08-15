import Database from "better-sqlite3";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import type { ProviderDescriptor, ProviderTurnResult } from "../../src/provider-runtime/contracts.js";
import { ProviderRegistry } from "../../src/provider-runtime/registry.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../src/provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntime } from "../../src/project-runtime/resolution.js";
import { PROVIDER_OPERATION_CAPABILITIES, type ProviderCapabilityKey, type ProviderCapabilitySnapshot } from "../../src/provider-runtime/types.js";
import type { ManagedProject } from "../../src/types/index.js";
import { requiredProfilesForResume, switchConversationProviderAtSafePoint, workflowResumeRequestFromHandoff } from "../../src/workbench/provider-switch.js";
import { assembleSharedConversationContext } from "../../src/workbench/shared-conversation-context.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { claimAgentTask, createAgentTask } from "../../src/agent-task/manager.js";
import { acquireWorkbenchRuntimeMutationLock } from "../../src/workbench/schema-rebuild-gate.js";
import { resolveProjectSkillProvider } from "../../src/server/workbench/api-router.js";
import { createReadyProjectHarnessFixture } from "../helpers/project-harness-fixture.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-provider-contract-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("provider-neutral runtime contract", () => {
  it("requires native user-input settlement for both main and planning operations", () => {
    expect(PROVIDER_OPERATION_CAPABILITIES.agent).toEqual(expect.arrayContaining([
      "turn.start",
      "turn.resume",
      "turn.interrupt",
      "turn.user-input",
      "stream.text",
      "stream.tool-output",
      "workspace.read",
      "workspace.write",
      "skill.native-load",
      "session.continuation",
    ]));
    expect(PROVIDER_OPERATION_CAPABILITIES.agent).not.toContain("child.spawn");
    expect(PROVIDER_OPERATION_CAPABILITIES.agent).not.toContain("turn.plan");
    expect(PROVIDER_OPERATION_CAPABILITIES.agent).not.toContain("file.reference");
    expect(PROVIDER_OPERATION_CAPABILITIES.agent).not.toContain("workspace.multiroot");
    expect(PROVIDER_OPERATION_CAPABILITIES.main).toContain("turn.user-input");
    expect(PROVIDER_OPERATION_CAPABILITIES.planning).toContain("turn.user-input");
  });

  it("reports Agent and Harness readiness independently", async () => {
    const registry = new ProviderRegistry();
    const provider = fakeProvider("mode-aware");
    provider.capabilitySnapshot = async (_project, productMode) => {
      const snapshot = capabilitySnapshot("mode-aware", productMode);
      return productMode === "agent" ? snapshot : {
        ...snapshot,
        status: "degraded",
        runnable: false,
        degradedReasons: ["child orchestration unavailable"],
        capabilities: snapshot.capabilities.map((item) => item.key === "child.spawn"
          ? { ...item, runtime: "unavailable" as const }
          : item),
      };
    };
    registry.register(provider);

    await expect(registry.require("mode-aware", "agent", "agent", null, root)).resolves.toBe(provider);
    await expect(registry.require("mode-aware", "main", "harness", null, root)).rejects.toThrow(/cannot run main/);
  });

  it("rejects Provider operation profiles that do not belong to the requested product mode", async () => {
    const registry = new ProviderRegistry();
    const provider = fakeProvider("mode-profile-guard");
    let snapshotCalls = 0;
    provider.capabilitySnapshot = async (_project, productMode) => {
      snapshotCalls += 1;
      return capabilitySnapshot(provider.id, productMode);
    };
    registry.register(provider);

    await expect(registry.require(provider.id, "main", "agent", null, root)).rejects.toThrow(
      "Provider profiles main cannot run in agent product mode.",
    );
    await expect(registry.require(provider.id, "agent", "harness", null, root)).rejects.toThrow(
      "Provider profiles agent cannot run in harness product mode.",
    );
    await expect(registry.requireProfiles(provider.id, ["agent", "coder"], "agent", null, root)).rejects.toThrow(
      "Provider profiles coder cannot run in agent product mode.",
    );
    expect(snapshotCalls).toBe(0);
  });

  it("fails closed instead of selecting the first provider when more than one is registered", () => {
    const registry = new ProviderRegistry();
    registry.register(fakeProvider("alpha"));
    registry.register(fakeProvider("beta"));
    expect(() => registry.requireOnly()).toThrow("多个 Agent provider");
    expect(() => resolveProjectSkillProvider({}, undefined, registry)).toThrow("多个 Agent provider");
    expect(resolveProjectSkillProvider({ defaultProviderId: "beta" }, undefined, registry).id).toBe("beta");
    expect(resolveProjectSkillProvider({ defaultProviderId: "beta" }, "alpha", registry).id).toBe("alpha");
  });

  it("enumerates every provider turn in the same runtime scope", () => {
    const registry = new ProviderRegistry();
    for (const providerId of ["alpha", "beta"]) {
      const provider = fakeProvider(providerId);
      provider.conversation.getActiveTurn = (runtimeScopeId) => runtimeScopeId === "scope-1" ? {
        providerId,
        attemptId: `${providerId}-attempt`,
        runtimeScopeId,
        roleId: "coder-agent",
        runId: `${providerId}-run`,
        session: { providerId, sessionId: `${providerId}-session` },
        turnId: `${providerId}-turn`,
        startedAt: "2026-07-15T00:00:00.000Z",
        steer: async () => undefined,
        interrupt: async () => ({ status: "interrupt-requested" as const }),
        respondToUserInput: async () => undefined,
      } : null;
      registry.register(provider);
    }

    expect(registry.findActiveTurns(["scope-1"]).map((turn) => turn.providerId).sort()).toEqual(["alpha", "beta"]);
  });

  it("shuts down every registered Provider runtime even when one fails", async () => {
    const registry = new ProviderRegistry();
    const calls: string[] = [];
    const alpha = fakeProvider("alpha");
    const beta = fakeProvider("beta");
    alpha.runtime.shutdown = async (reason) => {
      calls.push(`alpha:${reason}`);
      throw new Error("alpha shutdown failed");
    };
    beta.runtime.shutdown = async (reason) => {
      calls.push(`beta:${reason}`);
    };
    registry.register(alpha);
    registry.register(beta);

    await expect(registry.shutdownAll("test shutdown")).rejects.toThrow("Provider runtimes failed");
    expect(calls.sort()).toEqual(["alpha:test shutdown", "beta:test shutdown"]);
  });

  it("stops only the selected project through every provider-neutral runtime", async () => {
    const registry = new ProviderRegistry();
    const calls: string[] = [];
    for (const providerId of ["alpha", "beta"]) {
      const provider = fakeProvider(providerId);
      provider.runtime.shutdownProject = async (project, reason) => {
        calls.push(`${providerId}:${project.projectId}:${project.projectPath}:${reason}`);
      };
      registry.register(provider);
    }

    await registry.shutdownProject("project-one", root, "remove project");
    expect(calls.sort()).toEqual([
      `alpha:project-one:${root}:remove project`,
      `beta:project-one:${root}:remove project`,
    ]);
  });

  it("requires leaf capabilities before resuming a paused task queue", () => {
    expect(requiredProfilesForResume({
      workflow: { resume: { nextRuntimeAction: "task.queue.start" } },
    } as unknown as import("../../src/workbench/shared-conversation-context.js").HandoffSnapshot)).toEqual(["main", "coder", "auditor"]);
  });

  it("switches a Shared Conversation through a provider-neutral ResumePoint", async () => {
    const now = new Date().toISOString();
    const registry = new ProviderRegistry();
    const alpha = fakeProvider("alpha");
    let activeAlphaTurn = true;
    let interrupted = false;
    alpha.conversation.getActiveTurn = (runtimeScopeId) => activeAlphaTurn && runtimeScopeId === "graph-1" ? {
      providerId: "alpha",
      attemptId: "alpha-attempt",
      runtimeScopeId,
      roleId: "main-agent",
      runId: "alpha-run",
      session: { providerId: "alpha", sessionId: "alpha-session" },
      turnId: "alpha-turn",
      startedAt: now,
      steer: async () => undefined,
      interrupt: async () => {
        interrupted = true;
        activeAlphaTurn = false;
        return { status: "interrupt-requested" as const };
      },
      respondToUserInput: async () => undefined,
    } : null;
    registry.register(alpha);
    registry.register(fakeProvider("beta"));
    const project = managedProject(root);
    const ahoHome = join(root, ".aho-home");
    await createReadyProjectHarnessFixture({
      projectRoot: root,
      ahoHome,
      projectId: project.id,
      projectName: project.name,
    });
    const resolution = await resolveProjectRuntime(project, {
      ahoHome,
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });
    const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
    try {
      store.conversations.createConversation({
        projectId: project.id,
        conversationId: "conversation-1",
        productMode: "harness",
        title: "Provider switch",
        state: "active",
        boundChangeId: null,
        currentGraphScopeId: "graph-1",
        selectedProviderId: "alpha",
        completedTurnSequence: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      store.providerAttempts.writeConversationProviderBinding({
        projectId: project.id,
        conversationId: "conversation-1",
        providerId: "alpha",
        nativeSessionId: "alpha-session",
        lastDeliveredCompletedTurn: 0,
        preferredModel: null,
        lastUsedAt: now,
        bindingStatus: "ready",
      });
      store.providerAttempts.createProviderAttempt({
        projectId: project.id,
        conversationId: "conversation-1",
        attemptId: "alpha-attempt",
        graphScopeId: "graph-1",
        changeId: null,
        agentTaskId: null,
        roleId: "main-agent",
        operationProfile: "main",
        providerId: "alpha",
        nativeSessionId: "alpha-session",
        model: null,
        capabilitySnapshot: await alpha.capabilitySnapshot(project, "harness", project.path),
        handoffHash: "alpha-handoff",
        deliveredThroughCompletedTurn: 0,
        worktreeId: null,
        status: "running",
        createdAt: now,
        updatedAt: now,
      });
    } finally {
      store.close();
    }

    const result = await switchConversationProviderAtSafePoint({
      project,
      resolution,
      conversationId: "conversation-1",
      targetProviderId: "beta",
      registry,
    });

    expect(interrupted).toBe(true);
    expect(result).toMatchObject({ previousProviderId: "alpha", selectedProviderId: "beta", graphScopeId: "graph-1" });
    const verified = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
    try {
      expect(verified.conversations.readConversation(project.id, "conversation-1")?.selectedProviderId).toBe("beta");
      expect(verified.providerAttempts.readConversationProviderBinding(project.id, "conversation-1", "beta")).toMatchObject({ nativeSessionId: null, bindingStatus: "ready" });
      expect(verified.providerAttempts.readLatestProviderResumePoint(project.id, "conversation-1")).toMatchObject({
        resumePointId: result.resumePointId,
        snapshotHash: result.resumePointHash,
        previousProviderId: "alpha",
        targetProviderId: "beta",
      });
      expect(verified.providerAttempts.listProviderAttempts(project.id, "conversation-1")).toEqual([
        expect.objectContaining({
          attemptId: "alpha-attempt",
          providerId: "alpha",
          status: "interrupted",
        }),
        expect.objectContaining({
          attemptId: result.resumeAttemptId,
          providerId: "beta",
          roleId: "main-agent",
          operationProfile: "main",
          status: "queued",
          handoffHash: result.resumePointHash,
        }),
      ]);
    } finally {
      verified.close();
    }

    const handoff = await assembleSharedConversationContext({
      resolution,
      conversationId: "conversation-1",
      providerId: "beta",
      currentUserMessage: "继续当前节点",
    });
    expect(handoff.snapshot.resumePoint).toMatchObject({ hash: result.resumePointHash, targetProviderId: "beta" });
    const claimStore = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
    try {
      claimStore.providerAttempts.startQueuedProviderAttempt(project.id, result.resumeAttemptId, {
        capabilitySnapshot: await registry.get("beta").capabilitySnapshot(project, "harness", project.path),
        handoffHash: handoff.hash,
        deliveredThroughCompletedTurn: 0,
        effectiveSkillInputs: [],
        model: null,
        updatedAt: new Date().toISOString(),
      });
      expect(claimStore.providerAttempts.listProviderAttempts(project.id, "conversation-1")).toEqual([
        expect.objectContaining({
          attemptId: "alpha-attempt",
          providerId: "alpha",
          status: "interrupted",
        }),
        expect.objectContaining({
          attemptId: result.resumeAttemptId,
          providerId: "beta",
          handoffHash: handoff.hash,
          status: "running",
        }),
      ]);
    } finally {
      claimStore.close();
    }
  });

  it("maps an exact paused Workflow handoff back to the existing queue resume action", () => {
    const snapshot = {
      change: { id: "change-1", active: true },
      workflow: {
        workflowRunId: "workflow-1",
        queueRunId: "queue-1",
        graph: { id: "graph-1" },
        resume: { nextRuntimeAction: "task.queue.start" },
      },
    } as unknown as import("../../src/workbench/shared-conversation-context.js").HandoffSnapshot;
    expect(workflowResumeRequestFromHandoff(snapshot)).toEqual({
      actionType: "task.queue.start",
      changeId: "change-1",
      workflowGraphPlanId: "graph-1",
      workflowRunId: "workflow-1",
      queueRunId: "queue-1",
    });
    snapshot.workflow!.resume.nextRuntimeAction = "none";
    expect(workflowResumeRequestFromHandoff(snapshot)).toBeNull();
  });

  it("delivers only unseen completed canonical turns to each provider binding", async () => {
    const project = managedProject(root);
    const ahoHome = join(root, ".aho-home");
    await createReadyProjectHarnessFixture({
      projectRoot: root,
      ahoHome,
      projectId: project.id,
      projectName: project.name,
    });
    const resolution = await resolveProjectRuntime(project, {
      ahoHome,
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });
    const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
    const now = new Date().toISOString();
    try {
      store.conversations.createConversation({
        projectId: project.id,
        conversationId: "conversation-sync",
        productMode: "harness",
        title: "Shared timeline",
        state: "active",
        boundChangeId: null,
        currentGraphScopeId: "graph-sync",
        selectedProviderId: "alpha",
        completedTurnSequence: 2,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      store.providerAttempts.writeConversationProviderBinding({
        projectId: project.id,
        conversationId: "conversation-sync",
        providerId: "alpha",
        nativeSessionId: "alpha-session",
        lastDeliveredCompletedTurn: 2,
        preferredModel: null,
        lastUsedAt: now,
        bindingStatus: "ready",
      });
      for (const [id, type, text, sequence] of [
        ["user-1", "user.message", "第一轮问题", 1],
        ["assistant-1", "assistant.message", "第一轮回答", 1],
        ["user-2", "user.message", "第二轮问题", 2],
        ["assistant-2", "assistant.message", "第二轮回答", 2],
        ["user-3", "user.message", "仍在运行的第三轮", 3],
      ] as const) {
        store.timeline.appendMessage({
          id,
          projectId: project.id,
          conversationId: "conversation-sync",
          agentSurfaceId: "main-agent",
          changeId: "",
          type,
          timestamp: now,
          text,
          actionRunId: null,
          actionType: null,
          status: null,
          runId: null,
          artifact: null,
          error: null,
          rawJson: JSON.stringify({ id, type, text, completedTurnSequence: sequence }),
        });
      }
    } finally {
      store.close();
    }

    const beta = await assembleSharedConversationContext({ resolution, conversationId: "conversation-sync", providerId: "beta", currentUserMessage: "接管" });
    expect(beta.snapshot.recentVisibleConversation.map((entry) => entry.text)).toEqual([
      "第一轮问题",
      "第一轮回答",
      "第二轮问题",
      "第二轮回答",
    ]);
    const alpha = await assembleSharedConversationContext({ resolution, conversationId: "conversation-sync", providerId: "alpha", currentUserMessage: "继续" });
    expect(alpha.snapshot.recentVisibleConversation).toEqual([]);
  });

  it("refuses a schema rebuild while a model attempt is active", async () => {
    const project = managedProject(root);
    const memory = resolveProjectRuntimePaths(project.id, root);
    await mkdir(memory.workbenchRoot, { recursive: true });
    const db = new Database(memory.workbenchDbPath);
    db.exec("CREATE TABLE provider_attempts (attempt_id TEXT, status TEXT); INSERT INTO provider_attempts VALUES ('attempt-1', 'running');");
    db.pragma("user_version = 2");
    db.close();

    await expect(openProjectRuntimeWorkbenchDatabase(memory)).rejects.toThrow("模型执行尚未结束");
  });

  it("refuses a schema rebuild while any registered provider turn is active", async () => {
    const project = managedProject(root);
    const memory = resolveProjectRuntimePaths(project.id, root);
    const registry = new ProviderRegistry();
    const provider = fakeProvider("alpha");
    provider.conversation.listActiveTurns = () => [{
      providerId: "alpha",
      attemptId: "alpha-attempt",
      runtimeScopeId: "conversation-active",
      roleId: "main-agent",
      runId: "alpha-run",
      session: { providerId: "alpha", sessionId: "alpha-session" },
      turnId: "alpha-turn",
      startedAt: "2026-07-15T00:00:00.000Z",
      steer: async () => undefined,
      interrupt: async () => ({ status: "interrupt-requested" as const }),
      respondToUserInput: async () => undefined,
    }];
    registry.register(provider);
    await mkdir(memory.workbenchRoot, { recursive: true });
    const db = new Database(memory.workbenchDbPath);
    db.exec("CREATE TABLE conversations (conversation_id TEXT, bound_change_id TEXT);");
    db.pragma("user_version = 2");
    db.close();

    await expect(openProjectRuntimeWorkbenchDatabase(memory, { providerRegistry: registry })).rejects.toThrow("provider turn 正在运行");
  });

  it("refuses a schema rebuild while a background AgentTask is running", async () => {
    const project = managedProject(root);
    const memory = resolveProjectRuntimePaths(project.id, root);
    await createAgentTask(memory, {
      conversationId: "conversation-background",
      changeId: "change-background",
      roleId: "harness-evolution-agent",
      kind: "background",
      summary: "维护项目记忆",
      initialStatus: "running",
    });
    await mkdir(memory.workbenchRoot, { recursive: true });
    const db = new Database(memory.workbenchDbPath);
    db.exec("CREATE TABLE conversations (conversation_id TEXT, bound_change_id TEXT);");
    db.pragma("user_version = 2");
    db.close();

    await expect(openProjectRuntimeWorkbenchDatabase(memory)).rejects.toThrow("后台 Agent 任务正在运行");
  });

  it("refuses a schema rebuild while another Workbench writer owns the database", async () => {
    const project = managedProject(root);
    const memory = resolveProjectRuntimePaths(project.id, root);
    await mkdir(memory.workbenchRoot, { recursive: true });
    const db = new Database(memory.workbenchDbPath);
    db.pragma("journal_mode = WAL");
    db.exec("CREATE TABLE conversations (conversation_id TEXT, bound_change_id TEXT);");
    db.pragma("user_version = 2");
    db.exec("BEGIN IMMEDIATE");
    try {
      await expect(openProjectRuntimeWorkbenchDatabase(memory)).rejects.toThrow("另一个 Workbench 实例正在使用");
    } finally {
      db.exec("ROLLBACK");
      db.close();
    }
  });

  it("rebuilds conversation state without deleting Skill settings", async () => {
    const project = managedProject(root);
    const memory = resolveProjectRuntimePaths(project.id, root);
    const now = new Date().toISOString();
    const store = await openProjectRuntimeWorkbenchDatabase(memory);
    try {
      store.conversations.createConversation({
        projectId: project.id,
        conversationId: "old-conversation",
        productMode: "harness",
        title: "Old history",
        state: "active",
        boundChangeId: null,
        currentGraphScopeId: null,
        selectedProviderId: "alpha",
        completedTurnSequence: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      });
      store.skills.upsertSkillRoot({ projectId: project.id, rootPath: join(root, "skills"), sourceKind: "custom", updatedAt: now });
      store.skills.setSkillEnablement({ projectId: project.id, changeId: null, skillId: "project-skill", scope: "project", enabled: true, updatedAt: now });
    } finally {
      store.close();
    }
    const old = new Database(memory.workbenchDbPath);
    old.pragma("user_version = 2");
    old.close();

    const rebuilt = await openProjectRuntimeWorkbenchDatabase(memory);
    try {
      expect(rebuilt.conversations.readConversation(project.id, "old-conversation")).toBeNull();
      expect(rebuilt.skills.listSkillRoots(project.id)).toEqual([expect.objectContaining({ rootPath: join(root, "skills") })]);
      expect(rebuilt.skills.listSkillEnablement(project.id)).toEqual([expect.objectContaining({ skillId: "project-skill", enabled: true })]);
    } finally {
      rebuilt.close();
    }
  });

  it("retires schema-9 bridge state without rebuilding Conversation data", async () => {
    const project = managedProject(root);
    const memory = resolveProjectRuntimePaths(project.id, root);
    const now = new Date().toISOString();
    const store = await openProjectRuntimeWorkbenchDatabase(memory);
    store.conversations.createConversation({
      projectId: project.id,
      conversationId: "preserved-conversation",
      productMode: "harness",
      title: "Preserved history",
      state: "active",
      boundChangeId: null,
      currentGraphScopeId: null,
      selectedProviderId: "alpha",
      completedTurnSequence: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    store.close();

    const schema9 = new Database(memory.workbenchDbPath);
    schema9.exec(`
      CREATE TABLE bridge_sync (
        project_id TEXT NOT NULL,
        skill_id TEXT NOT NULL,
        source_hash TEXT NOT NULL,
        materialized_path TEXT NOT NULL,
        materialized_hash TEXT NOT NULL,
        bridge_version TEXT NOT NULL,
        synced_at TEXT NOT NULL,
        PRIMARY KEY(project_id, skill_id)
      );
    `);
    schema9.pragma("user_version = 9");
    schema9.close();

    const migrated = await openProjectRuntimeWorkbenchDatabase(memory);
    expect(migrated.conversations.readConversation(project.id, "preserved-conversation")).toMatchObject({
      title: "Preserved history",
    });
    migrated.close();
    const inspected = new Database(memory.workbenchDbPath, { readonly: true });
    expect(inspected.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'bridge_sync'").get()).toBeUndefined();
    expect(Number(inspected.pragma("user_version", { simple: true }))).toBe(13);
    inspected.close();
  });

  it("prevents a file-backed AgentTask claim from racing a schema rebuild", async () => {
    const project = managedProject(root);
    const memory = resolveProjectRuntimePaths(project.id, root);
    const task = await createAgentTask(memory, {
      conversationId: "conversation-race",
      changeId: "change-race",
      roleId: "harness-evolution-agent",
      kind: "background",
      summary: "等待领取",
    });
    const rebuild = await acquireWorkbenchRuntimeMutationLock(memory, "重建 Workbench 会话数据库");
    try {
      await expect(claimAgentTask(memory, task)).rejects.toThrow("暂时不能领取 Agent 任务");
    } finally {
      await rebuild.release();
    }
    await expect(claimAgentTask(memory, task)).resolves.toMatchObject({ status: "claimed" });
  });

  it("recovers a runtime mutation lock whose owning process no longer exists", async () => {
    const project = managedProject(root);
    const memory = resolveProjectRuntimePaths(project.id, root);
    await mkdir(memory.workbenchRoot, { recursive: true });
    await writeFile(join(memory.workbenchRoot, "runtime-mutation.lock"), `${JSON.stringify({
      action: "已崩溃的数据库重建",
      pid: 2_147_483_647,
      createdAt: "2026-07-15T00:00:00.000Z",
    })}\n`, "utf8");

    const lock = await acquireWorkbenchRuntimeMutationLock(memory, "恢复后的状态变更");
    await lock.release();
  });
});

function managedProject(path: string): ManagedProject {
  const now = new Date().toISOString();
  return { id: "provider-contract-project", name: "Provider Contract", path, addedAt: now, lastSeenAt: now };
}

function fakeProvider(providerId: string): ProviderDescriptor {
  const snapshot = capabilitySnapshot(providerId, "harness");
  const turnResult = (sessionId: string): ProviderTurnResult => ({
    providerId,
    status: "completed",
    session: { providerId, sessionId },
    turnId: `${providerId}-turn`,
    lastMessage: `${providerId} completed`,
    childThreads: [],
    changedFiles: [],
  });
  return {
    id: providerId,
    displayName: providerId,
    runtime: {
      shutdown: async () => undefined,
      shutdownProject: async () => undefined,
    },
    capabilitySnapshot: async (_project, productMode) => capabilitySnapshot(providerId, productMode),
    runtimeSummary: async (_project, productMode) => ({
      providerId,
      productMode,
      harnessExecutionModes: ["stepwise", "scoped-auto"],
      snapshot: capabilitySnapshot(providerId, productMode),
    }),
    models: {
      read: async () => ({ providerId, selectedModel: null, effectiveModel: null, effectiveModelSource: "provider-default", candidates: [], available: true }),
      select: async () => ({ providerId, selectedModel: null, effectiveModel: null, effectiveModelSource: "provider-default", candidates: [], available: true }),
    },
    diagnostics: async () => ({
      providerId,
      displayName: providerId,
      installation: { available: true, version: "test" },
      adapter: { id: `${providerId}-test`, version: "1" },
      capabilities: snapshot,
      models: await Promise.resolve({ providerId, selectedModel: null, effectiveModel: null, effectiveModelSource: "provider-default" as const, candidates: [], available: true }),
      sessionHealth: "ready",
      lastError: null,
      rawEvidenceRefs: [],
      projectActions: [],
    }),
    projectActions: { list: async () => [], execute: async () => { throw new Error("No test project actions."); } },
    skills: {
      list: async ({ projectPath }) => ({ providerId, projectPath, skills: [], errors: [] }),
      setEnabled: async ({ enabled }) => ({ effectiveEnabled: enabled }),
    },
    conversation: {
      runTurn: async (request) => turnResult(request.existingSession?.sessionId ?? `${providerId}-session`),
      inspectChild: async () => "available",
      continueChild: async (request) => turnResult(request.targetSession.sessionId),
      closeChild: async (request) => turnResult(request.targetSession.sessionId),
      getActiveTurn: () => null,
      listActiveTurns: () => [],
    },
    leafExecution: { runTurn: async () => turnResult(`${providerId}-leaf-session`) },
  };
}

function capabilitySnapshot(providerId: string, productMode: "agent" | "harness"): ProviderCapabilitySnapshot {
  const keys = new Set<ProviderCapabilityKey>(Object.values(PROVIDER_OPERATION_CAPABILITIES).flat());
  return {
    providerId,
    displayName: providerId,
    productMode,
    status: "ready",
    runnable: true,
    checkedAt: new Date().toISOString(),
    snapshotHash: `${providerId}-snapshot`,
    snapshotVersion: 1,
    effectiveModel: null,
    effectiveModelSource: "provider-default",
    degradedReasons: [],
    capabilities: [...keys].map((key) => ({ key, label: key, spec: "supported", runtime: "ready", summary: "ready" })),
  };
}
