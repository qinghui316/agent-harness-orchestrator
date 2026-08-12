import { execFile } from "node:child_process";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  ProviderRegistry,
  type ProviderCapabilityKey,
  type ProviderCapabilitySnapshot,
  type ProviderDescriptor,
  type ProviderTurnResult,
} from "../../src/provider-runtime/index.js";
import { PROVIDER_OPERATION_CAPABILITIES } from "../../src/provider-runtime/types.js";
import { initializeProjectRuntimeSidecar } from "../../src/project-runtime/lifecycle.js";
import { resolveProjectRuntimePaths, type ProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { ProjectRegistryStore } from "../../src/registry/store.js";
import type { ManagedProject } from "../../src/types/index.js";
import { reconcileStaleAgentNativeChildren } from "../../src/workbench/agent-native-child-lifecycle-service.js";
import { getAgentSurfaceProjection } from "../../src/workbench/agent-surface-projection.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { createReadyProjectHarnessFixture } from "../helpers/project-harness-fixture.js";

const execFileAsync = promisify(execFile);
const now = "2026-08-12T00:00:00.000Z";
let root: string;
let previousAhoHome: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-native-child-recovery-"));
  previousAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(root, "aho-home");
});

afterEach(async () => {
  if (previousAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = previousAhoHome;
  await rm(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
});

describe("Agent native child startup recovery", () => {
  it.each(["onboarding", "ready", "repair-required"] as const)(
    "reconciles %s projects from Provider proof without touching Harness children",
    async (runtimeState) => {
      const { project, paths } = await createProject(runtimeState);
      await seedRecoveryFacts(project, paths);
      await expect(getAgentSurfaceProjection({ project }, "agent-conversation", "agent")).resolves.toMatchObject({
        projectId: project.id,
        productMode: "agent",
        conversationId: "agent-conversation",
      });
      if (runtimeState === "ready") {
        await expect(getAgentSurfaceProjection({ project }, "harness-conversation", "harness")).resolves.toMatchObject({
          productMode: "harness",
        });
      } else {
        await expect(getAgentSurfaceProjection({ project }, "harness-conversation", "harness"))
          .rejects.toThrow("Agent surfaces are unavailable for this project.");
      }
      const inspected: string[] = [];
      const registry = registryWithInspection((threadId) => {
        inspected.push(threadId);
        return threadId === "child-live" ? "available" : "stale";
      });

      await expect(reconcileStaleAgentNativeChildren({ project, providerRegistry: registry })).resolves.toBe(2);

      const database = await openProjectRuntimeWorkbenchDatabase(paths, { providerRegistry: registry });
      try {
        const agentAttempts = database.providerAttempts.listProviderAttempts(project.id, "agent-conversation");
        expect(agentAttempts).toEqual(expect.arrayContaining([
          expect.objectContaining({ attemptId: "child-stale-attempt", status: "failed" }),
          expect.objectContaining({ attemptId: "child-live-attempt", status: "running" }),
          expect.objectContaining({ attemptId: "child-queued-missing-link", status: "failed" }),
        ]));
        expect(database.providerAttempts.listProviderAttempts(project.id, "harness-conversation")
          .filter((attempt) => attempt.roleId === "coder-agent")).toEqual([
          expect.objectContaining({ attemptId: "harness-child-attempt", status: "running" }),
        ]);
        const diagnostics = database.timeline.listConversationMessages(project.id, "agent-conversation")
          .filter((message) => message.text?.includes("no active Provider proof"));
        expect(diagnostics.map((message) => message.threadId).sort()).toEqual(["child-queued", "child-stale"]);
      } finally {
        database.close();
      }
      expect(inspected.sort()).toEqual(["child-live", "child-stale"]);
    },
  );

  it("terminalizes a historical-scope stale child while isolating malformed rows", async () => {
    const { project, paths } = await createProject("onboarding");
    await seedRecoveryFacts(project, paths);
    const database = await openProjectRuntimeWorkbenchDatabase(paths);
    try {
      createAttempt(database, project.id, "agent-conversation", "malformed-attempt", "agent", "running", "native-child-agent", "agent", "malformed-child");
      createAttempt(database, project.id, "agent-conversation", "graph-null-attempt", "agent", "running", "native-child-agent", "agent", "graph-null-child", "main-agent", null);
      createAttempt(database, project.id, "agent-conversation", "session-null-attempt", "agent", "running", "native-child-agent", "agent", null);
      createAttempt(database, project.id, "agent-conversation", "identity-null-attempt", "agent", "queued", "native-child-agent", "agent", null, "main-agent", null);
      database.conversations.activateGraphScope(project.id, "agent-conversation", "graph-current-new", "2026-08-12T00:01:00.000Z");
    } finally {
      database.close();
    }
    const registry = registryWithInspection((threadId) => threadId === "child-live" ? "available" : "stale");

    await expect(reconcileStaleAgentNativeChildren({ project, providerRegistry: registry })).resolves.toBe(6);
    const restored = await openProjectRuntimeWorkbenchDatabase(paths, { providerRegistry: registry });
    try {
      expect(restored.conversations.readConversation(project.id, "agent-conversation")?.currentGraphScopeId).toBe("graph-current-new");
      expect(restored.providerAttempts.readProviderAttempt(project.id, "child-stale-attempt")?.status).toBe("failed");
      expect(restored.providerAttempts.readProviderAttempt(project.id, "malformed-attempt")?.status).toBe("failed");
      for (const attemptId of ["graph-null-attempt", "session-null-attempt", "identity-null-attempt"]) {
        expect(restored.providerAttempts.readProviderAttempt(project.id, attemptId)?.status).toBe("failed");
      }
      const quarantine = restored.timeline.listConversationMessages(project.id, "agent-conversation")
        .find((message) => message.text?.includes("quarantined after malformed persisted lineage"));
      expect(quarantine).toMatchObject({ status: "failed" });
      expect(JSON.parse(quarantine!.rawJson)).toMatchObject({ attemptId: "malformed-attempt" });
      const missingIdentityDiagnostics = restored.timeline.listConversationMessages(project.id, "agent-conversation")
        .filter((message) => message.text?.includes("persisted Provider identity was incomplete"));
      expect(missingIdentityDiagnostics).toHaveLength(3);
      const rawDiagnostics = missingIdentityDiagnostics.map((message) => JSON.parse(message.rawJson) as {
        attemptId: string;
        graphScopeId?: string;
        threadId?: string;
      });
      expect(rawDiagnostics).toEqual(expect.arrayContaining([
        expect.objectContaining({ attemptId: "graph-null-attempt", threadId: "graph-null-child" }),
        expect.objectContaining({ attemptId: "session-null-attempt", graphScopeId: "graph-agent-conversation" }),
        expect.objectContaining({ attemptId: "identity-null-attempt" }),
      ]));
      expect(rawDiagnostics.find((entry) => entry.attemptId === "graph-null-attempt")).not.toHaveProperty("graphScopeId");
      expect(rawDiagnostics.find((entry) => entry.attemptId === "session-null-attempt")).not.toHaveProperty("threadId");
      expect(rawDiagnostics.find((entry) => entry.attemptId === "identity-null-attempt")).not.toHaveProperty("graphScopeId");
      expect(rawDiagnostics.find((entry) => entry.attemptId === "identity-null-attempt")).not.toHaveProperty("threadId");
    } finally {
      restored.close();
    }
  });
});

async function createProject(runtimeState: "onboarding" | "ready" | "repair-required"): Promise<{
  project: ManagedProject;
  paths: ProjectRuntimePaths;
}> {
  const projectId = `native-child-${runtimeState}`;
  const projectRoot = join(root, projectId);
  await mkdir(projectRoot, { recursive: true });
  await writeFile(join(projectRoot, "tracked.txt"), "fixture\n", "utf8");
  await execFileAsync("git", ["init"], { cwd: projectRoot, windowsHide: true });
  await execFileAsync("git", ["config", "user.email", "test@example.com"], { cwd: projectRoot, windowsHide: true });
  await execFileAsync("git", ["config", "user.name", "Test User"], { cwd: projectRoot, windowsHide: true });
  await execFileAsync("git", ["add", "tracked.txt"], { cwd: projectRoot, windowsHide: true });
  await execFileAsync("git", ["commit", "-m", "fixture"], { cwd: projectRoot, windowsHide: true });

  const store = new ProjectRegistryStore(process.env.AHO_HOME!);
  const { project } = await store.registerProject({ path: projectRoot, name: projectId, projectId });
  if (runtimeState !== "onboarding") {
    const ready = await createReadyProjectHarnessFixture({
      projectRoot,
      ahoHome: process.env.AHO_HOME!,
      projectId,
      projectName: project.name,
    });
    if (runtimeState === "repair-required") {
      await rm(join(ready.skillRoot, "references", "rules", "critical.md"), { force: true });
    }
  }
  const paths = resolveProjectRuntimePaths(projectId, process.env.AHO_HOME!);
  await initializeProjectRuntimeSidecar(paths);
  return { project, paths };
}

async function seedRecoveryFacts(project: ManagedProject, paths: ProjectRuntimePaths): Promise<void> {
  const database = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    createConversation(database, project.id, "agent-conversation", "agent");
    createConversation(database, project.id, "harness-conversation", "harness");
    createAttempt(database, project.id, "agent-conversation", "agent-main-attempt", "agent", "running", "main-agent", "agent", "parent-main", null);
    createAttempt(database, project.id, "harness-conversation", "harness-main-attempt", "harness", "running", "main-agent", "main", "harness-main", null);
    createAttempt(database, project.id, "agent-conversation", "child-stale-attempt", "agent", "running", "native-child-agent", "agent", "child-stale");
    createAttempt(database, project.id, "agent-conversation", "child-live-attempt", "agent", "running", "native-child-agent", "agent", "child-live");
    createAttempt(database, project.id, "agent-conversation", "child-queued-missing-link", "agent", "queued", "native-child-agent", "agent", "child-queued");
    createAttempt(database, project.id, "harness-conversation", "harness-child-attempt", "harness", "running", "coder-agent", "worktree", "harness-child");
    database.providerAttempts.bindProviderAttemptThread(project.id, {
      attemptId: "agent-main-attempt", threadId: "parent-main", parentThreadId: null, parentAgentSurfaceId: null, runId: "run-agent",
    }, now);
    database.providerAttempts.bindProviderAttemptThread(project.id, {
      attemptId: "harness-main-attempt", threadId: "harness-main", parentThreadId: null, parentAgentSurfaceId: null, runId: "run-harness",
    }, now);
    database.providerAttempts.bindProviderAttemptThread(project.id, {
      attemptId: "child-stale-attempt", threadId: "child-stale", parentThreadId: "parent-main", parentAgentSurfaceId: "main-agent", runId: "run-agent",
    }, now);
    database.providerAttempts.bindProviderAttemptThread(project.id, {
      attemptId: "child-live-attempt", threadId: "child-live", parentThreadId: "parent-main", parentAgentSurfaceId: "main-agent", runId: "run-agent",
    }, now);
    database.providerAttempts.bindProviderAttemptThread(project.id, {
      attemptId: "harness-child-attempt", threadId: "harness-child", parentThreadId: "harness-main", parentAgentSurfaceId: "main-agent", runId: "run-harness",
    }, now);
  } finally {
    database.close();
  }
}

function createConversation(database: Awaited<ReturnType<typeof openProjectRuntimeWorkbenchDatabase>>, projectId: string, conversationId: string, productMode: "agent" | "harness"): void {
  database.conversations.createConversation({
    projectId,
    conversationId,
    productMode,
    title: conversationId,
    state: "active",
    boundChangeId: null,
    currentGraphScopeId: `graph-${conversationId}`,
    selectedProviderId: "codex",
    completedTurnSequence: 0,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  });
  database.conversations.initializeConversationGraphScope(projectId, conversationId, `graph-${conversationId}`, now);
}

function createAttempt(
  database: Awaited<ReturnType<typeof openProjectRuntimeWorkbenchDatabase>>,
  projectId: string,
  conversationId: string,
  attemptId: string,
  productMode: "agent" | "harness",
  status: "queued" | "running",
  roleId: string,
  operationProfile: string,
  nativeSessionId: string | null,
  parentAgentSurfaceId: string | null = "main-agent",
  graphScopeId: string | null = `graph-${conversationId}`,
): void {
  database.providerAttempts.createProviderAttempt({
    projectId,
    conversationId,
    attemptId,
    productMode,
    graphScopeId,
    changeId: null,
    agentTaskId: null,
    roleId,
    parentAgentSurfaceId,
    operationProfile,
    providerId: "codex",
    nativeSessionId,
    model: null,
    capabilitySnapshot: capabilitySnapshot(productMode),
    effectiveSkillInputs: [],
    handoffHash: `handoff-${attemptId}`,
    deliveredThroughCompletedTurn: 0,
    worktreeId: null,
    status,
    createdAt: now,
    updatedAt: now,
  });
}

function registryWithInspection(inspect: (threadId: string) => "available" | "stale"): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(fakeProvider(inspect));
  return registry;
}

function fakeProvider(inspect: (threadId: string) => "available" | "stale"): ProviderDescriptor {
  const completed = (sessionId: string): ProviderTurnResult => ({
    providerId: "codex", status: "completed", session: { providerId: "codex", sessionId }, turnId: "turn", lastMessage: "done", childThreads: [], changedFiles: [],
  });
  return {
    id: "codex",
    displayName: "Codex",
    runtime: { shutdown: async () => undefined, shutdownProject: async () => undefined },
    capabilitySnapshot: async (_project, productMode) => capabilitySnapshot(productMode),
    runtimeSummary: async (_project, productMode) => ({ providerId: "codex", productMode, harnessExecutionModes: ["stepwise"], snapshot: capabilitySnapshot(productMode) }),
    models: {
      read: async () => ({ providerId: "codex", selectedModel: null, effectiveModel: null, effectiveModelSource: "provider-default", candidates: [], available: true }),
      select: async () => ({ providerId: "codex", selectedModel: null, effectiveModel: null, effectiveModelSource: "provider-default", candidates: [], available: true }),
    },
    diagnostics: async () => ({
      providerId: "codex", displayName: "Codex", installation: { available: true, version: "test" }, adapter: { id: "test", version: "1" },
      capabilities: capabilitySnapshot("agent"), models: { providerId: "codex", selectedModel: null, effectiveModel: null, effectiveModelSource: "provider-default", candidates: [], available: true },
      sessionHealth: "ready", lastError: null, rawEvidenceRefs: [], projectActions: [],
    }),
    projectActions: { list: async () => [], execute: async () => { throw new Error("not supported"); } },
    skills: { list: async ({ projectPath }) => ({ providerId: "codex", projectPath, skills: [], errors: [] }), setEnabled: async ({ enabled }) => ({ effectiveEnabled: enabled }) },
    conversation: {
      runTurn: async (request) => completed(request.existingSession?.sessionId ?? "main"),
      inspectChild: async (request) => inspect(request.targetSession.sessionId),
      continueChild: async (request) => completed(request.targetSession.sessionId),
      closeChild: async (request) => completed(request.targetSession.sessionId),
      getActiveTurn: () => null,
      listActiveTurns: () => [],
    },
    leafExecution: { runTurn: async () => completed("leaf") },
  };
}

function capabilitySnapshot(productMode: "agent" | "harness"): ProviderCapabilitySnapshot {
  const keys = new Set<ProviderCapabilityKey>(Object.values(PROVIDER_OPERATION_CAPABILITIES).flat());
  return {
    providerId: "codex", displayName: "Codex", productMode, status: "ready", runnable: true, checkedAt: now,
    snapshotHash: `snapshot-${productMode}`, snapshotVersion: 1, effectiveModel: null, effectiveModelSource: "provider-default", degradedReasons: [],
    capabilities: [...keys].map((key) => ({ key, label: key, spec: "supported", runtime: "ready", summary: "ready" })),
  };
}
