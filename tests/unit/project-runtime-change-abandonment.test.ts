import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readBundledAgentCatalog } from "../../src/agent/catalog.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../src/provider-runtime/project-harness-discovery.js";
import { defaultProviderRegistry } from "../../src/provider-runtime/default-registry.js";
import { agentThreadSurfaceId } from "../../src/provider-runtime/agent-surface-id.js";
import {
  abandonSkillNativeProjectHarnessChange,
  recoverPendingProjectHarnessChangeAbandonments,
  type ProjectHarnessChangeAbandonmentFailureStage,
} from "../../src/project-runtime/change-abandonment.js";
import { ProjectRuntimeCoordinator, resolveProjectRuntimeState } from "../../src/project-runtime/coordinator.js";
import type { ProjectRuntimeResolution } from "../../src/project-runtime/context.js";
import { loadProjectHarnessChange } from "../../src/project-harness/change.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { persistProviderUserInputRequest } from "../../src/workbench/provider-input-lifecycle.js";
import { bindProviderAttemptThread, finishProviderAttempt, startProviderAttempt } from "../../src/workbench/provider-attempts.js";
import { ProviderChildLifecycleOwner } from "../../src/workbench/provider-child-lifecycle-owner.js";
import { CanonicalTimelineDelivery } from "../../src/workbench/canonical-timeline-delivery.js";
import { runExactChildAgentTurn } from "../../src/workbench/provider-child-turn-coordinator.js";
import { ProjectRegistryStore } from "../../src/registry/store.js";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";
import { createReadyProjectHarnessFixture } from "../helpers/project-harness-fixture.js";
import { getTempDir, git, initGitRepository, project } from "./workbench/fixtures.js";

const FAILURE_STAGES: ProjectHarnessChangeAbandonmentFailureStage[] = [
  "preparation-recorded",
  "journal-prepared",
  "evidence-moved",
  "archive-published",
  "registry-record-written",
  "lane-cleared",
  "index-rebuilt",
  "before-sqlite-commit",
  "sqlite-committed",
  "before-journal-complete",
];

const ROLLBACK_FAILURE_STAGES: ProjectHarnessChangeAbandonmentFailureStage[] = [
  "rollback-evidence-restored",
  "rollback-record-restored",
  "rollback-lane-restored",
  "rollback-index-restored",
  "rollback-sidecar-restored",
];

describe.sequential("Skill-native Project Harness Change abandonment", () => {
  let fixture: { skillRoot: string; resolution: ProjectRuntimeResolution };
  let previousAhoHome: string | undefined;

  beforeEach(async () => {
    await initGitRepository(getTempDir());
    await writeFile(join(getTempDir(), ".gitignore"), ".agents/\n.claude/\n.aho-home/\n", "utf8");
    await writeFile(join(getTempDir(), "package.json"), "{\"name\":\"change-abandon-fixture\"}\n", "utf8");
    await git(getTempDir(), ["add", ".gitignore", "package.json"]);
    await git(getTempDir(), ["commit", "-m", "fixture source"]);
    const ahoHome = join(getTempDir(), ".aho-home");
    previousAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = ahoHome;
    const harness = await createReadyProjectHarnessFixture({
      projectRoot: getTempDir(),
      ahoHome,
      projectId: project().id,
      projectName: project().name,
    });
    const state = await resolveProjectRuntimeState(project(), {
      ahoHome,
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });
    if (state.state !== "ready") throw new Error(`Fixture Project Runtime is not ready: ${state.state}.`);
    fixture = { skillRoot: harness.skillRoot, resolution: state.resolution };
  });

  afterEach(() => {
    if (previousAhoHome === undefined) delete process.env.AHO_HOME;
    else process.env.AHO_HOME = previousAhoHome;
  });

  it("archives Change, Lane, INDEX, Conversation and decision under one transaction identity", async () => {
    const topic = await createConversationChangeFixture(project(), { title: "Atomic Archive" });

    const result = await abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: `graph:${topic.conversationId}`,
      reason: "No longer required.",
      createTransactionId: () => "change-abandon-atomic-archive",
    });

    expect(result).toMatchObject({
      status: "abandoned",
      transactionId: "change-abandon-atomic-archive",
      archivePath: `state/changes/archive/${topic.changeId}`,
      change: { id: topic.changeId, state: "archived" },
    });
    const record = await loadProjectHarnessChange(fixture.skillRoot, topic.changeId, true);
    expect(record).toMatchObject({
      status: "abandoned",
      completion_commit: null,
      evidence_paths: [`state/changes/archive/${topic.changeId}`],
    });
    expect(await readFile(join(fixture.skillRoot, "state", "changes", "INDEX.json"), "utf8"))
      .toContain(`state/changes/archive/${topic.changeId}/summary.md`);
    const store = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    try {
      expect(store.conversations.readConversation(project().id, topic.conversationId)).toMatchObject({ state: "archive" });
      expect(store.conversations.isConversationGraphScopeTerminal(project().id, `graph:${topic.conversationId}`)).toBe(true);
      expect(store.decisions.listDecisions(project().id, topic.changeId)).toEqual([
        expect.objectContaining({ decisionType: "workpad.abandon", status: "dismissed", targetId: topic.changeId }),
      ]);
    } finally {
      store.close();
    }
  });

  it.each(FAILURE_STAGES)("restores every Skill and sidecar artifact after %s failure", async (stage) => {
    const topic = await createConversationChangeFixture(project(), { title: `Rollback ${stage}` });
    const beforeRecord = await loadProjectHarnessChange(fixture.skillRoot, topic.changeId, true);
    const beforeIndex = await readFile(join(fixture.skillRoot, "state", "changes", "INDEX.json"), "utf8");

    await expect(abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: `graph:${topic.conversationId}`,
      createTransactionId: () => `change-abandon-rollback-${stage}`,
      failureInjection: (current) => {
        if (current === stage) throw new Error(`injected ${stage}`);
      },
    })).rejects.toThrow(`injected ${stage}`);

    expect(await loadProjectHarnessChange(fixture.skillRoot, topic.changeId, true)).toEqual(beforeRecord);
    await expect(readFile(join(fixture.skillRoot, "state", "changes", "active", topic.changeId, "summary.md"), "utf8"))
      .resolves.toContain(topic.changeId);
    await expect(readFile(join(fixture.skillRoot, "state", "changes", "archive", topic.changeId, "summary.md"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(join(fixture.skillRoot, "state", "changes", "INDEX.json"), "utf8")).toBe(beforeIndex);
    const store = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    try {
      expect(store.conversations.readConversation(project().id, topic.conversationId)).toMatchObject({ state: "active" });
      expect(store.conversations.isConversationGraphScopeTerminal(project().id, `graph:${topic.conversationId}`)).toBe(false);
      expect(store.decisions.listDecisions(project().id, topic.changeId)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it.each(ROLLBACK_FAILURE_STAGES)("recovers after a crash at %s", async (stage) => {
    const topic = await createConversationChangeFixture(project(), { title: `Rollback Crash ${stage}` });
    const transactionId = `change-abandon-${stage}`;

    await expect(abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: `graph:${topic.conversationId}`,
      createTransactionId: () => transactionId,
      failureInjection: (current) => {
        if (current === "before-journal-complete" || current === stage) throw new Error(`injected ${current}`);
      },
    })).rejects.toThrow("rollback could not restore Skill and sidecar state");

    const recovered = await recoverPendingProjectHarnessChangeAbandonments(fixture.resolution);

    expect(recovered.find((candidate) => candidate.transactionId === transactionId)?.stage).toBe("rolled-back");
    expect(await loadProjectHarnessChange(fixture.skillRoot, topic.changeId, true)).toMatchObject({ status: "planning" });
    const store = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    try {
      expect(store.conversations.readConversation(project().id, topic.conversationId)).toMatchObject({ state: "active" });
      expect(store.conversations.readConversationGraphScope(project().id, `graph:${topic.conversationId}`))
        .toMatchObject({ status: "active" });
      expect(store.decisions.listDecisions(project().id, topic.changeId)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("recovers an incomplete abandonment during Project Runtime startup before returning project state", async () => {
    const topic = await createConversationChangeFixture(project(), { title: "Startup Recovery" });
    const transactionId = "change-abandon-startup-recovery";
    await expect(abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: `graph:${topic.conversationId}`,
      createTransactionId: () => transactionId,
      failureInjection: (stage) => {
        if (stage === "before-journal-complete" || stage === "rollback-evidence-restored") {
          throw new Error(`injected ${stage}`);
        }
      },
    })).rejects.toThrow("rollback could not restore Skill and sidecar state");

    const ahoHome = join(getTempDir(), ".aho-home");
    const registry = new ProjectRegistryStore(ahoHome);
    await registry.registerProject({
      path: getTempDir(),
      name: project().name,
      projectId: project().id,
    });
    const coordinator = new ProjectRuntimeCoordinator({
      store: registry,
      ahoHome,
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });

    const startup = await coordinator.reconcileStartup();

    expect(startup.states).toEqual([expect.objectContaining({ state: "ready" })]);
    expect(await loadProjectHarnessChange(fixture.skillRoot, topic.changeId, true)).toMatchObject({ status: "planning" });
    expect(existsSync(join(
      fixture.resolution.paths.transactionStagingRoot,
      "change-abandon",
      `${transactionId}.json`,
    ))).toBe(false);
    const store = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    try {
      expect(store.conversations.readConversation(project().id, topic.conversationId)).toMatchObject({ state: "active" });
      expect(store.conversations.readConversationGraphScope(project().id, `graph:${topic.conversationId}`))
        .toMatchObject({ status: "active" });
      expect(store.decisions.listDecisions(project().id, topic.changeId)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("recovers an incomplete post-sidecar journal by restoring both owners", async () => {
    const topic = await createConversationChangeFixture(project(), { title: "Crash Recovery" });
    const transactionId = "change-abandon-crash-recovery";
    await expect(abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: `graph:${topic.conversationId}`,
      createTransactionId: () => transactionId,
      failureInjection: (stage) => {
        if (stage === "before-terminal-cleanup") throw new Error("injected terminal cleanup crash");
      },
    })).rejects.toThrow("injected terminal cleanup crash");
    const journalPath = join(
      fixture.resolution.paths.transactionStagingRoot,
      "change-abandon",
      `${transactionId}.json`,
    );
    const journal = JSON.parse(await readFile(journalPath, "utf8")) as {
      stage: string;
      candidateRoot: string;
      previousEvidenceRoot: string;
      archiveEvidenceRoot: string;
    };
    journal.stage = "sidecar-published";
    await writeFile(journalPath, `${JSON.stringify(journal, null, 2)}\n`, "utf8");

    const recovered = await recoverPendingProjectHarnessChangeAbandonments(fixture.resolution);

    expect(recovered.find((candidate) => candidate.transactionId === transactionId)?.stage).toBe("rolled-back");
    expect(await loadProjectHarnessChange(fixture.skillRoot, topic.changeId, true)).toMatchObject({ status: "planning" });
    const store = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    try {
      expect(store.conversations.readConversation(project().id, topic.conversationId)).toMatchObject({ state: "active" });
      expect(store.decisions.listDecisions(project().id, topic.changeId)).toEqual([]);
    } finally {
      store.close();
    }
  });

  it("removes an orphan candidate recorded before the durable transaction journal", async () => {
    const transactionId = "change-abandon-preparation-crash";
    const candidateRoot = join(
      dirname(fixture.skillRoot),
      `.${fixture.resolution.harness.skillName}.${transactionId}.abandon-candidate`,
    );
    const transactionRoot = join(fixture.resolution.paths.transactionStagingRoot, "change-abandon");
    const preparationPath = join(transactionRoot, `${transactionId}.preparing.json`);
    await mkdir(candidateRoot);
    await mkdir(transactionRoot, { recursive: true });
    await writeFile(preparationPath, `${JSON.stringify({
      version: "1.0",
      kind: "change-abandon-preparation",
      transactionId,
      projectId: project().id,
      projectRoot: project().path,
      skillName: fixture.resolution.harness.skillName,
      skillRoot: fixture.skillRoot,
      sidecarRoot: fixture.resolution.paths.sidecarRoot,
      candidateRoot,
      createdAt: new Date().toISOString(),
    }, null, 2)}\n`, "utf8");

    await recoverPendingProjectHarnessChangeAbandonments(fixture.resolution);

    expect(existsSync(candidateRoot)).toBe(false);
    expect(existsSync(preparationPath)).toBe(false);
  });

  it("returns the same terminal fact on retry without duplicating decision state", async () => {
    const topic = await createConversationChangeFixture(project(), { title: "Idempotent Abandon" });
    await abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: `graph:${topic.conversationId}`,
      createTransactionId: () => "change-abandon-idempotent-first",
    });

    const retried = await abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: `graph:${topic.conversationId}`,
      createTransactionId: () => "change-abandon-idempotent-retry",
    });

    expect(retried).toMatchObject({ status: "already_abandoned", transactionId: null });
    const store = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    try {
      expect(store.decisions.listDecisions(project().id, topic.changeId)).toHaveLength(1);
    } finally {
      store.close();
    }
  });

  it("removes a completed recovery journal before later Change, Lane, and INDEX progress", async () => {
    const first = await createConversationChangeFixture(project(), { title: "Completed Journal First" });
    const firstTransactionId = "change-abandon-completed-journal-first";
    await abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: first.changeId,
      expectedConversationId: first.conversationId,
      expectedGraphScopeId: `graph:${first.conversationId}`,
      createTransactionId: () => firstTransactionId,
    });
    expect(existsSync(join(
      fixture.resolution.paths.transactionStagingRoot,
      "change-abandon",
      `${firstTransactionId}.json`,
    ))).toBe(false);

    const second = await createConversationChangeFixture(project(), { title: "Completed Journal Second" });
    await expect(abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: second.changeId,
      expectedConversationId: second.conversationId,
      expectedGraphScopeId: `graph:${second.conversationId}`,
      createTransactionId: () => "change-abandon-completed-journal-second",
    })).resolves.toMatchObject({ status: "abandoned" });
    await expect(recoverPendingProjectHarnessChangeAbandonments(fixture.resolution)).resolves.toEqual([]);
  });

  it("removes a rolled-back recovery journal before later Change, Lane, and INDEX progress", async () => {
    const first = await createConversationChangeFixture(project(), { title: "Rolled Back Journal First" });
    const firstTransactionId = "change-abandon-rolled-back-journal-first";
    await expect(abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: first.changeId,
      expectedConversationId: first.conversationId,
      expectedGraphScopeId: `graph:${first.conversationId}`,
      createTransactionId: () => firstTransactionId,
      failureInjection: (stage) => {
        if (stage === "before-journal-complete") throw new Error("injected rollback");
      },
    })).rejects.toThrow("injected rollback");
    expect(existsSync(join(
      fixture.resolution.paths.transactionStagingRoot,
      "change-abandon",
      `${firstTransactionId}.json`,
    ))).toBe(false);

    const second = await createConversationChangeFixture(project(), { title: "Rolled Back Journal Second" });
    await expect(abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: second.changeId,
      expectedConversationId: second.conversationId,
      expectedGraphScopeId: `graph:${second.conversationId}`,
      createTransactionId: () => "change-abandon-after-rolled-back-journal",
    })).resolves.toMatchObject({ status: "abandoned" });
    await expect(recoverPendingProjectHarnessChangeAbandonments(fixture.resolution)).resolves.toEqual([]);
  });

  it.each(["archive", "lane", "index"] as const)("rejects an idempotent retry when completed %s state is incomplete", async (part) => {
    const topic = await createConversationChangeFixture(project(), { title: `Incomplete ${part}` });
    await abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: `graph:${topic.conversationId}`,
    });
    const transactionRoot = join(fixture.resolution.paths.transactionStagingRoot, "change-abandon");
    for (const entry of await readdir(transactionRoot)) {
      if (entry.endsWith(".json")) await rm(join(transactionRoot, entry));
    }
    if (part === "archive") {
      await rm(join(fixture.skillRoot, "state", "changes", "archive", topic.changeId), { recursive: true });
    } else if (part === "lane") {
      const laneRoot = join(fixture.skillRoot, "state", "registry", "lanes");
      const lanePath = join(laneRoot, (await readdir(laneRoot))[0]!);
      const lane = JSON.parse(await readFile(lanePath, "utf8")) as Record<string, unknown>;
      lane.active_change_id = "another-change";
      lane.status = "active";
      await writeFile(lanePath, `${JSON.stringify(lane, null, 2)}\n`, "utf8");
    } else {
      const indexPath = join(fixture.skillRoot, "state", "changes", "INDEX.json");
      const index = JSON.parse(await readFile(indexPath, "utf8")) as { changes: Array<{ change_id: string }> };
      index.changes = index.changes.filter((candidate) => candidate.change_id !== topic.changeId);
      await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
    }

    await expect(abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: `graph:${topic.conversationId}`,
    })).rejects.toThrow(/Completed Change abandon/);
  });

  it("rejects stale Conversation or graph action identity before publication", async () => {
    const topic = await createConversationChangeFixture(project(), { title: "Stale Abandon Action" });

    await expect(abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: "stale-conversation",
      expectedGraphScopeId: `graph:${topic.conversationId}`,
    })).rejects.toThrow("exact current Conversation graph and Change binding");
    await expect(abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: "graph:stale",
    })).rejects.toThrow("exact current Conversation graph and Change binding");
    expect(await loadProjectHarnessChange(fixture.skillRoot, topic.changeId, true)).toMatchObject({ status: "planning" });
  });

  it("rejects Lane drift instead of clearing another active Change claim", async () => {
    const topic = await createConversationChangeFixture(project(), { title: "Lane Drift" });
    const laneRoot = join(fixture.skillRoot, "state", "registry", "lanes");
    const lanePath = join(laneRoot, (await readdir(laneRoot))[0]!);
    const lane = JSON.parse(await readFile(lanePath, "utf8")) as Record<string, unknown>;
    lane.active_change_id = "another-change";
    await writeFile(lanePath, `${JSON.stringify(lane, null, 2)}\n`, "utf8");

    await expect(abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: `graph:${topic.conversationId}`,
    })).rejects.toThrow("exact active Change to own its Lane");
    expect(await loadProjectHarnessChange(fixture.skillRoot, topic.changeId, true)).toMatchObject({ status: "planning" });
  });

  it("rejects a Lane whose logical Conversation graph identity is forged", async () => {
    const topic = await createConversationChangeFixture(project(), { title: "Lane Identity Drift" });
    const laneRoot = join(fixture.skillRoot, "state", "registry", "lanes");
    const lanePath = join(laneRoot, (await readdir(laneRoot))[0]!);
    const lane = JSON.parse(await readFile(lanePath, "utf8")) as Record<string, unknown>;
    lane.graph_scope_id = "graph:another-conversation";
    await writeFile(lanePath, `${JSON.stringify(lane, null, 2)}\n`, "utf8");

    await expect(abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: `graph:${topic.conversationId}`,
    })).rejects.toThrow("exact active Change to own its Lane");
  });

  it("fences a running Provider terminal callback after archive publication", async () => {
    const topic = await createConversationChangeFixture(project(), { title: "Late Provider Callback" });
    const graphScopeId = `graph:${topic.conversationId}`;
    const store = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    try {
      store.providerAttempts.createProviderAttempt({
        projectId: project().id,
        conversationId: topic.conversationId,
        attemptId: "attempt-late-abandon",
        graphScopeId,
        changeId: topic.changeId,
        agentTaskId: null,
        roleId: "main-agent",
        operationProfile: "main",
        providerId: "codex",
        nativeSessionId: null,
        model: null,
        capabilitySnapshot: { providerId: "codex", effectiveModel: null } as never,
        handoffHash: "late-abandon",
        deliveredThroughCompletedTurn: 0,
        worktreeId: null,
        status: "running",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } finally {
      store.close();
    }
    await abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: graphScopeId,
    });

    const after = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    try {
      expect(() => after.unitOfWork.commitProviderTurnTerminal({
        projectId: project().id,
        conversationId: topic.conversationId,
        runId: "run-late-abandon",
        mainAttemptId: "attempt-late-abandon",
        expectedGraphScopeId: graphScopeId,
        mainStatus: "completed",
        mainNativeSessionId: "session-late-abandon",
        childAttempts: [],
        expectedCompletedTurnSequence: 0,
        advanceCompletedTurn: true,
        updatedAt: new Date().toISOString(),
      })).toThrow("Provider terminal callback no longer owns the current conversation graph");
      expect(after.providerAttempts.readProviderAttempt(project().id, "attempt-late-abandon"))
        .toMatchObject({ status: "running" });
      expect(after.conversations.readConversation(project().id, topic.conversationId))
        .toMatchObject({ state: "archive", completedTurnSequence: 0 });
    } finally {
      after.close();
    }
  });

  it("fences finishProviderAttempt after archive publication", async () => {
    const topic = await createConversationChangeFixture(project(), { title: "Late Worker Finish" });
    const graphScopeId = `graph:${topic.conversationId}`;
    const memory = { projectId: project().id, workbenchDbPath: fixture.resolution.paths.workbenchDbPath };
    await startProviderAttempt(memory, {
      attemptId: "attempt-late-worker-finish",
      providerId: "codex",
      capabilitySnapshot: {} as never,
      operationProfile: "auditor",
      roleId: "auditor-agent",
      handoffHash: "late-worker-finish",
      conversationId: topic.conversationId,
      graphScopeId,
      changeId: topic.changeId,
    });
    await abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: graphScopeId,
    });

    await expect(finishProviderAttempt(memory, "attempt-late-worker-finish", "completed", null))
      .rejects.toThrow("Provider terminal callback no longer owns the current conversation graph");
    const store = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    try {
      expect(store.providerAttempts.readProviderAttempt(project().id, "attempt-late-worker-finish"))
        .toMatchObject({ status: "running" });
    } finally {
      store.close();
    }
  });

  it("fences a native Child terminal result and its Timeline mutation after archive publication", async () => {
    const topic = await createConversationChangeFixture(project(), { title: "Late Native Child" });
    const graphScopeId = `graph:${topic.conversationId}`;
    const store = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    const now = new Date().toISOString();
    store.providerAttempts.createProviderAttempt({
      projectId: project().id,
      conversationId: topic.conversationId,
      attemptId: "attempt-late-child-parent",
      graphScopeId,
      changeId: topic.changeId,
      agentTaskId: null,
      roleId: "main-agent",
      parentAgentSurfaceId: null,
      operationProfile: "main",
      providerId: "codex",
      nativeSessionId: "thread-late-child-parent",
      model: null,
      capabilitySnapshot: {} as never,
      handoffHash: "late-child-parent",
      deliveredThroughCompletedTurn: 0,
      worktreeId: null,
      status: "running",
      createdAt: now,
      updatedAt: now,
    });
    store.providerAttempts.bindProviderAttemptThread(project().id, {
      attemptId: "attempt-late-child-parent",
      threadId: "thread-late-child-parent",
      parentThreadId: null,
      parentAgentSurfaceId: null,
      runId: "run-late-child-parent",
    }, now);
    const owner = new ProviderChildLifecycleOwner({
      database: store,
      delivery: new CanonicalTimelineDelivery(store),
      catalog: readBundledAgentCatalog(),
      projectId: project().id,
      conversationId: topic.conversationId,
      graphScopeId,
      changeId: topic.changeId,
      runId: "run-late-native-child",
      parentAttemptId: "attempt-late-child-parent",
      providerId: "codex",
      capabilitySnapshot: {} as never,
      model: null,
      parentHandoffHash: "late-child-parent",
      deliveredThroughCompletedTurn: 0,
      onInvalidated: () => undefined,
    });
    const child = owner.onLifecycle({
      providerId: "codex",
      kind: "started",
      activityId: "activity-late-native-child",
      roleHint: "planning-agent",
      parentSession: { providerId: "codex", sessionId: "thread-late-child-parent" },
      childSession: { providerId: "codex", sessionId: "thread-late-native-child" },
    });
    expect(child).not.toBeNull();
    await abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: graphScopeId,
    });
    const beforeTimeline = store.timeline.listConversationMessages(project().id, topic.conversationId);

    expect(() => owner.onResult({
      providerId: "codex",
      activityId: "activity-late-native-child",
      parentThreadId: "thread-late-child-parent",
      threadId: "thread-late-native-child",
      status: "completed",
      displayName: "Late planner",
      finalText: "late",
      changedFiles: [],
      initialInput: { turnId: "turn-late-child", itemId: "item-late-child", text: "late input" },
    })).toThrow("Provider terminal callback no longer owns the current conversation graph");
    expect(store.timeline.listConversationMessages(project().id, topic.conversationId)).toEqual(beforeTimeline);
    expect(store.providerAttempts.readProviderAttempt(project().id, child!.attemptId)).toMatchObject({ status: "running" });
    store.close();
  });

  it("atomically rejects a late Child continuation result without appending assistant Timeline", async () => {
    const topic = await createConversationChangeFixture(project(), { title: "Late Child Continuation" });
    const graphScopeId = `graph:${topic.conversationId}`;
    const memory = { projectId: project().id, workbenchDbPath: fixture.resolution.paths.workbenchDbPath };
    await startProviderAttempt(memory, {
      attemptId: "attempt-late-continuation-main",
      providerId: "codex",
      capabilitySnapshot: {} as never,
      operationProfile: "main",
      roleId: "main-agent",
      handoffHash: "late-continuation-main",
      conversationId: topic.conversationId,
      graphScopeId,
      changeId: topic.changeId,
    });
    await bindProviderAttemptThread(memory, {
      attemptId: "attempt-late-continuation-main",
      threadId: "thread-late-continuation-main",
      parentThreadId: null,
      parentAgentSurfaceId: null,
    });
    await startProviderAttempt(memory, {
      attemptId: "attempt-late-continuation-source",
      providerId: "codex",
      capabilitySnapshot: {} as never,
      operationProfile: "auditor",
      roleId: "auditor-agent",
      parentAgentSurfaceId: "main-agent",
      handoffHash: "late-continuation-source",
      conversationId: topic.conversationId,
      graphScopeId,
      changeId: topic.changeId,
    });
    await bindProviderAttemptThread(memory, {
      attemptId: "attempt-late-continuation-source",
      threadId: "thread-late-continuation-child",
      parentThreadId: "thread-late-continuation-main",
      parentAgentSurfaceId: "main-agent",
    });
    await finishProviderAttempt(memory, "attempt-late-continuation-source", "completed", "thread-late-continuation-child");

    let releaseProvider!: () => void;
    let markProviderStarted!: () => void;
    const providerStarted = new Promise<void>((resolve) => { markProviderStarted = resolve; });
    const providerRelease = new Promise<void>((resolve) => { releaseProvider = resolve; });
    const original = defaultProviderRegistry.get("codex");
    const descriptor = {
      ...original,
      conversation: {
        ...original.conversation,
        inspectChild: async () => "available" as const,
        continueChild: async () => {
          markProviderStarted();
          await providerRelease;
          return {
            providerId: "codex",
            status: "completed" as const,
            session: { providerId: "codex", sessionId: "thread-late-continuation-child" },
            turnId: "turn-late-continuation",
            lastMessage: "late assistant",
            childThreads: [],
            changedFiles: [],
          };
        },
      },
    };
    const getSpy = vi.spyOn(defaultProviderRegistry, "get").mockReturnValue(descriptor);
    const requireSpy = vi.spyOn(defaultProviderRegistry, "requireProfiles").mockResolvedValue({
      descriptor,
      snapshot: {} as never,
    });
    try {
      const turn = runExactChildAgentTurn({
        project: project(),
        conversationId: topic.conversationId,
        agentSurfaceId: agentThreadSurfaceId("codex", "thread-late-continuation-child"),
        message: "continue",
      });
      await providerStarted;
      await abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
        changeId: topic.changeId,
        expectedConversationId: topic.conversationId,
        expectedGraphScopeId: graphScopeId,
      });
      const archivedStore = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
      const beforeTimeline = archivedStore.timeline.listConversationMessages(project().id, topic.conversationId);
      archivedStore.close();
      releaseProvider();
      await expect(turn).rejects.toThrow("Provider terminal callback no longer owns the current conversation graph");

      const after = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
      try {
        expect(after.timeline.listConversationMessages(project().id, topic.conversationId)).toEqual(beforeTimeline);
        const continuation = after.providerAttempts.listProviderAttempts(project().id, topic.conversationId)
          .find((attempt) => attempt.attemptId !== "attempt-late-continuation-main"
            && attempt.attemptId !== "attempt-late-continuation-source");
        expect(continuation).toMatchObject({ status: "running" });
      } finally {
        after.close();
      }
    } finally {
      releaseProvider?.();
      getSpy.mockRestore();
      requireSpy.mockRestore();
    }
  });

  it("fences a pending provider-input settlement after archive publication", async () => {
    const topic = await createConversationChangeFixture(project(), { title: "Late Interaction Callback" });
    const graphScopeId = `graph:${topic.conversationId}`;
    const requestKey = "run-late-interaction:main:turn:item:request-late-interaction";
    await persistProviderUserInputRequest(fixture.resolution.paths, {
      providerId: "codex",
      requestKey,
      requestId: "request-late-interaction",
      runId: "run-late-interaction",
      runtimeScopeId: topic.conversationId,
      conversationId: topic.conversationId,
      graphScopeId,
      changeId: topic.changeId,
      attemptId: "attempt-late-interaction",
      questions: [{ id: "question-late-interaction", header: "Input", question: "Continue?", options: [] }],
      status: "pending",
    });
    const before = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    const messageId = `provider-user-input:${requestKey}`;
    const beforeRow = before.timeline.readMessage(project().id, topic.conversationId, messageId);
    before.close();

    await abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: graphScopeId,
    });

    const after = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    try {
      expect(() => after.interactions.transitionProviderUserInputRequest(
        project().id,
        topic.conversationId,
        graphScopeId,
        requestKey,
        "pending",
        "submitted",
        { skippedQuestionIds: ["question-late-interaction"], disposition: "skipped" },
        new Date().toISOString(),
      )).toThrow("Provider user input settlement no longer owns the current active conversation graph");
      expect(after.timeline.readMessage(project().id, topic.conversationId, messageId)).toEqual(beforeRow);
      expect(after.interactions.readProviderUserInputRequest(project().id, topic.conversationId, requestKey))
        .toMatchObject({ status: "pending", graphScopeId });
    } finally {
      after.close();
    }
  });

  it("archives only the selected Change and leaves another Conversation Lane active", async () => {
    const first = await createConversationChangeFixture(project(), { title: "Scoped First" });
    const second = await createConversationChangeFixture(project(), { title: "Scoped Second" });

    await abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: second.changeId,
      expectedConversationId: second.conversationId,
      expectedGraphScopeId: `graph:${second.conversationId}`,
      createTransactionId: () => "change-abandon-scoped-second",
    });

    expect(await loadProjectHarnessChange(fixture.skillRoot, first.changeId, true)).toMatchObject({ status: "planning" });
    expect(await loadProjectHarnessChange(fixture.skillRoot, second.changeId, true)).toMatchObject({ status: "abandoned" });
    const store = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    try {
      expect(store.conversations.readConversation(project().id, first.conversationId)).toMatchObject({ state: "active" });
      expect(store.conversations.readConversation(project().id, second.conversationId)).toMatchObject({ state: "archive" });
    } finally {
      store.close();
    }
  });

  it("does not route the Workbench abandon action through the legacy Change owner", async () => {
    const source = await readFile(join(process.cwd(), "src", "server", "workbench", "actions.ts"), "utf8");
    expect(source).not.toContain("abandonChangeForChange");
    expect(source).toContain("abandonSkillNativeProjectHarnessChange");
  });

  it("rejects a recovery journal whose artifact path escapes current Skill authority", async () => {
    const topic = await createConversationChangeFixture(project(), { title: "Forged Recovery" });
    const transactionId = "change-abandon-forged-recovery";
    await expect(abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: `graph:${topic.conversationId}`,
      createTransactionId: () => transactionId,
      failureInjection: (stage) => {
        if (stage === "before-terminal-cleanup") throw new Error("injected terminal cleanup crash");
      },
    })).rejects.toThrow("injected terminal cleanup crash");
    const path = join(
      fixture.resolution.paths.transactionStagingRoot,
      "change-abandon",
      `${transactionId}.json`,
    );
    const journal = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    journal.changeRecordPath = join(getTempDir(), "outside-change-record.json");
    await writeFile(path, `${JSON.stringify(journal, null, 2)}\n`, "utf8");

    await expect(recoverPendingProjectHarnessChangeAbandonments(fixture.resolution))
      .rejects.toThrow("artifact paths do not match current Skill authority");
  });

  it.each(["decision-before", "decision-after"] as const)("rejects a recovery journal with forged %s identity", async (part) => {
    const topic = await createConversationChangeFixture(project(), { title: `Forged ${part}` });
    const transactionId = `change-abandon-forged-${part}`;
    await expect(abandonSkillNativeProjectHarnessChange(project(), fixture.resolution, {
      changeId: topic.changeId,
      expectedConversationId: topic.conversationId,
      expectedGraphScopeId: `graph:${topic.conversationId}`,
      createTransactionId: () => transactionId,
      failureInjection: (stage) => {
        if (stage === "before-terminal-cleanup") throw new Error("injected terminal cleanup crash");
      },
    })).rejects.toThrow("injected terminal cleanup crash");
    const path = join(
      fixture.resolution.paths.transactionStagingRoot,
      "change-abandon",
      `${transactionId}.json`,
    );
    const journal = JSON.parse(await readFile(path, "utf8")) as Record<string, unknown>;
    if (part === "decision-before") {
      journal.decisionBefore = {
        ...(journal.decisionAfter as Record<string, unknown>),
        id: "forged-prior-decision",
      };
    } else {
      journal.decisionAfter = {
        ...(journal.decisionAfter as Record<string, unknown>),
        id: "forged-terminal-decision",
      };
    }
    await writeFile(path, `${JSON.stringify(journal, null, 2)}\n`, "utf8");

    await expect(recoverPendingProjectHarnessChangeAbandonments(fixture.resolution))
      .rejects.toThrow("dynamic-state lineage does not match journal authority");
  });

  it("rejects a Junction or non-file transaction journal entry", async () => {
    const transactionRoot = join(fixture.resolution.paths.transactionStagingRoot, "change-abandon");
    const target = join(getTempDir(), "unexpected-journal-target");
    const link = join(transactionRoot, "unexpected.json");
    await mkdir(transactionRoot, { recursive: true });
    await mkdir(target);
    await symlink(target, link, process.platform === "win32" ? "junction" : "dir");

    await expect(recoverPendingProjectHarnessChangeAbandonments(fixture.resolution))
      .rejects.toThrow("link, Junction, or non-file entry");
  });
});
