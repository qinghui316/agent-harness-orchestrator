import { appendFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  bindLatestMainAgentResumePoint,
  createMainAgentStableResumeKey,
  mainAgentResumePointsPath,
  readMainAgentResumePoints,
  recordMainAgentResumePoint,
  recordScopedAutomationMainAgentResumePoint,
} from "../../src/main-agent-orchestration/index.js";
import type { ResolvedMemory } from "../../src/types/index.js";

describe("main-agent ODWF-style resume points", () => {
  let tempDir: string;
  let memory: ResolvedMemory;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aho-main-agent-resume-"));
    memory = buildMemory(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("creates stable keys independent of timestamps, labels, and prose", () => {
    const left = createMainAgentStableResumeKey({
      changeId: "change-a",
      lane: "manual-gate",
      gate: {
        kind: "workflow-action",
        actionType: "code.run",
        changeId: "change-a",
        targetIds: ["task-2", "task-1"],
        scope: { label: "Run code", taskIds: ["task-1", "task-2"], timestamp: "old" },
      },
      acceptedArtifactHashes: { plan: "plan-hash", spec: "spec-hash" },
      sourceState: { gitHead: "abc", capturedAt: "2026-07-02T00:00:00.000Z" },
    });
    const right = createMainAgentStableResumeKey({
      changeId: "change-a",
      lane: "manual-gate",
      gate: {
        kind: "workflow-action",
        actionType: "code.run",
        changeId: "change-a",
        targetIds: ["task-1", "task-2"],
        scope: { timestamp: "new", taskIds: ["task-2", "task-1"], label: "Different label" },
      },
      sourceState: { capturedAt: "2026-07-03T00:00:00.000Z", gitHead: "abc" },
      acceptedArtifactHashes: { spec: "spec-hash", plan: "plan-hash" },
    });

    expect(left).toBe(right);
  });

  it("records and binds only the latest same-Change matching resume point", async () => {
    const keyInput = {
      changeId: "change-a",
      lane: "manual-gate" as const,
      gate: {
        kind: "approval-action" as const,
        approvalActionId: "result.apply",
        changeId: "change-a",
        targetIds: ["wt-1"],
        scope: { targetId: "wt-1" },
      },
      acceptedArtifactHashes: { plan: "plan-1" },
      sourceState: { gitHead: "head-1" },
    };
    const point = await recordMainAgentResumePoint(memory, "harness/changes/active/change-a", {
      projectId: "project-1",
      changeId: "change-a",
      lane: "manual-gate",
      stopReason: "user-rejected",
      summary: "User rejected apply.",
      resumeKeyInput: keyInput,
      currentGate: keyInput.gate,
      refs: { runIds: ["run-1"], validationIds: ["validation-1"], auditIds: ["audit-1"] },
    });

    expect(point.authority).toBe("non-executing-main-agent-resume-point");
    expect(point.executionStarted).toBe(false);
    expect(JSON.stringify(point)).not.toContain("actionPayload");
    expect(await bindLatestMainAgentResumePoint(memory, "harness/changes/active/change-a", keyInput))
      .toMatchObject({ status: "bound", resumePoint: { id: point.id } });

    expect(await bindLatestMainAgentResumePoint(memory, "harness/changes/active/change-a", {
      ...keyInput,
      sourceState: { gitHead: "head-2" },
    })).toMatchObject({ status: "stale" });
    expect(await bindLatestMainAgentResumePoint(memory, "harness/changes/active/change-a", {
      ...keyInput,
      changeId: "change-b",
    })).toMatchObject({ status: "missing" });
    expect(await bindLatestMainAgentResumePoint(memory, "harness/changes/active/change-a", keyInput, { projectId: "other-project" }))
      .toMatchObject({ status: "scope-mismatch" });
  });

  it("records scoped automation stops without putting runtime instance ids into stable keys", async () => {
    const point = await recordScopedAutomationMainAgentResumePoint(memory, "harness/changes/active/change-a", {
      projectId: "project-1",
      changeId: "change-a",
      sourceStopReason: "terminal-human-gate",
      summary: "Stopped at human gate.",
      requestedGate: { actionType: "planning.automation.scoped-auto.run", changeId: "change-a" },
      currentGate: {
        kind: "workflow-action",
        actionType: "planning.scheduler.integration-check.run",
        changeId: "change-a",
        targetIds: ["scheduler-run-1"],
        scope: { schedulerRunId: "scheduler-run-1", action: { forbidden: true } },
      },
      sourceState: { gitHead: "head-1" },
      acceptedArtifactHashes: { plan: "plan-1" },
      automationAuthorizationId: "authorization-1",
      automationRunId: "automation-run-1",
      automationIterationIds: ["iteration-1"],
    });
    const sameStableInputDifferentRun = await recordScopedAutomationMainAgentResumePoint(memory, "harness/changes/active/change-a", {
      projectId: "project-1",
      changeId: "change-a",
      sourceStopReason: "terminal-human-gate",
      summary: "Stopped at human gate.",
      requestedGate: { actionType: "planning.automation.scoped-auto.run", changeId: "change-a" },
      currentGate: {
        kind: "workflow-action",
        actionType: "planning.scheduler.integration-check.run",
        changeId: "change-a",
        targetIds: ["scheduler-run-1"],
        scope: { schedulerRunId: "scheduler-run-1" },
      },
      sourceState: { gitHead: "head-1" },
      acceptedArtifactHashes: { plan: "plan-1" },
      automationAuthorizationId: "authorization-2",
      automationRunId: "automation-run-2",
      automationIterationIds: ["iteration-2"],
    });

    expect(point.stopReason).toBe("blocked");
    expect(point.currentGate.scope).not.toHaveProperty("action");
    expect(point.forbiddenActions).toContain("raw-scheduler");
    expect(point.refs.automationRunIds).toEqual(["automation-run-1"]);
    expect(point.stableResumeKey).toBe(sameStableInputDifferentRun.stableResumeKey);
    expect(JSON.stringify(point.resumeKeyInput)).not.toContain("authorization-1");
    expect(JSON.stringify(point.resumeKeyInput)).not.toContain("automation-run-1");
    expect(point.refs.automationAuthorizationIds).toEqual(["authorization-1"]);
    expect(await readMainAgentResumePoints(memory, "harness/changes/active/change-a")).toHaveLength(2);
  });

  it("rejects mismatched write scopes before appending resume point evidence", async () => {
    const gate = {
      kind: "workflow-action" as const,
      actionType: "code.run",
      changeId: "change-a",
      targetIds: ["task-1"],
      scope: { taskId: "task-1" },
    };
    await expect(recordMainAgentResumePoint(memory, "harness/changes/active/change-a", {
      changeId: "change-a",
      lane: "manual-gate",
      stopReason: "feedback-provided",
      summary: "Mismatch.",
      resumeKeyInput: { changeId: "change-b", lane: "manual-gate", gate },
      currentGate: gate,
    })).rejects.toThrow("changeId scope mismatch");

    await expect(recordMainAgentResumePoint(memory, "harness/changes/active/change-a", {
      changeId: "change-a",
      lane: "manual-gate",
      stopReason: "feedback-provided",
      summary: "Mismatch.",
      resumeKeyInput: { changeId: "change-a", lane: "manual-gate", gate },
      currentGate: { ...gate, targetIds: ["task-2"], scope: { taskId: "task-2" } },
    })).rejects.toThrow("gate scope mismatch");

    expect(await readMainAgentResumePoints(memory, "harness/changes/active/change-a")).toHaveLength(0);
  });

  it("blocks binding when latest resume point evidence is malformed", async () => {
    const keyInput = {
      changeId: "change-a",
      lane: "manual-gate" as const,
      gate: {
        kind: "workflow-action" as const,
        actionType: "code.run",
        changeId: "change-a",
        targetIds: ["task-1"],
        scope: { taskId: "task-1" },
      },
      sourceState: { gitHead: "head-1" },
    };
    await recordMainAgentResumePoint(memory, "harness/changes/active/change-a", {
      changeId: "change-a",
      lane: "manual-gate",
      stopReason: "feedback-provided",
      summary: "Valid old point.",
      resumeKeyInput: keyInput,
      currentGate: keyInput.gate,
    });
    const path = mainAgentResumePointsPath(memory, "harness/changes/active/change-a");
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, "{\"version\":\"bad\"}\n", "utf8");

    expect(await bindLatestMainAgentResumePoint(memory, "harness/changes/active/change-a", keyInput))
      .toMatchObject({ status: "blocked" });
  });
});

function buildMemory(root: string): ResolvedMemory {
  return {
    mode: "repo-local",
    supported: true,
    writable: true,
    artifactBase: "memory-root",
    projectId: "project-1",
    projectRoot: root,
    markerPath: join(root, ".agent-harness", "project.json"),
    agentGuidePath: join(root, "AGENTS.md"),
    memoryRoot: root,
    docsRoot: join(root, "docs"),
    harnessRoot: join(root, "harness"),
    changesRoot: join(root, "harness", "changes"),
    evolutionRoot: join(root, "harness", "evolution"),
    templatesRoot: join(root, "harness", "templates"),
    scriptsRoot: join(root, "scripts"),
    runsRoot: join(root, ".agent-harness", "runs"),
    workbenchRoot: join(root, ".agent-harness", "workbench"),
    workbenchDbPath: join(root, ".agent-harness", "workbench", "workbench.sqlite"),
    agentsRoot: join(root, ".agents"),
    commandsRoot: join(root, ".agents", "commands"),
    agentCatalogPath: join(root, ".agents", "agents.json"),
    skillsRoot: join(root, ".agents", "skills"),
    worktreeMetadataRoot: join(root, ".agent-harness", "worktrees"),
    worktreeIndexPath: join(root, ".agent-harness", "worktrees", "index.json"),
  };
}
