import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { compileGoalLoopEvaluation } from "../../src/goal-loop/manager.js";
import type { ResolvedMemory } from "../../src/types/index.js";
import { readLatestGoalLoopSummary } from "../../src/workbench/projections/read-model/goal-loop.js";
import { filterGoalLoopSummaryForCurrentGate } from "../../src/workbench/projections/read-model/goal-loop-parity.js";

let tempDir: string;
let memory: ResolvedMemory;

const changeId = "controlled-post-step";
const changePath = `harness/changes/active/${changeId}`;

describe("controlled scheduler post-step projection", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aho-controlled-post-step-"));
    memory = buildMemory(tempDir);
    await mkdir(join(memory.memoryRoot, changePath), { recursive: true });
    await writeJson(join(memory.memoryRoot, changePath, "change.json"), {
      version: "1.0",
      id: changeId,
      state: "active",
      title: "Controlled post-step",
      createdAt: "2026-06-20T00:00:00.000Z",
      updatedAt: "2026-06-20T00:00:00.000Z",
      closedAt: null,
      archivePath: null,
    });
    await writeFile(join(memory.memoryRoot, changePath, "summary.md"), "# Summary\n\nReady.\n", "utf8");
    await writeFile(join(memory.memoryRoot, changePath, "spec.md"), "# Spec\n\n- AC-001: Advance once.\n", "utf8");
    await writeFile(join(memory.memoryRoot, changePath, "plan.md"), "# Plan\n", "utf8");
    await writeFile(join(memory.memoryRoot, changePath, "tasks.md"), "# Tasks\n", "utf8");
    await writeJson(join(memory.memoryRoot, changePath, "ac-map.json"), { generatedAt: "2026-06-20T00:00:00.000Z", items: [] });
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("keeps the latest post-step Goal Loop packet visible through the existing Workpad read-model filter", async () => {
    await compileGoalLoopEvaluation(memory, changePath);
    const postStep = await compileGoalLoopEvaluation(memory, changePath);

    const summary = await readLatestGoalLoopSummary(memory, changePath, changeId);

    expect(summary).toMatchObject({
      goalLoopDecisionId: postStep.goalLoopDecision.id,
      goalLoopIterationId: postStep.goalLoopIteration.id,
      goalLoopNextStepPacketId: postStep.goalLoopNextStepPacket.id,
      executionStarted: false,
    });

    expect(filterGoalLoopSummaryForCurrentGate(summary, {
      id: "current-plan-gate",
      label: "Prepare scheduler plan",
      description: "Current visible gate.",
      kind: "workflow-action",
      enabled: true,
      requiresConfirmation: true,
      actionType: "planning.scheduler.plan.prepare",
      changeId,
    })).toMatchObject({
      goalLoopDecisionId: postStep.goalLoopDecision.id,
      goalLoopIterationId: postStep.goalLoopIteration.id,
      goalLoopNextStepPacketId: postStep.goalLoopNextStepPacket.id,
      executionStarted: false,
    });
  });
});

async function writeJson(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildMemory(root: string): ResolvedMemory {
  return {
    mode: "repo-local",
    supported: true,
    writable: true,
    artifactBase: "memory-root",
    projectId: "repo",
    projectRoot: root,
    markerPath: join(root, ".agent-harness.json"),
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
    agentsRoot: join(root, "agents"),
    commandsRoot: join(root, "commands"),
    agentCatalogPath: join(root, "agents", "catalog.json"),
    skillsRoot: join(root, "skills"),
    worktreeMetadataRoot: join(root, ".agent-harness", "worktrees"),
    worktreeIndexPath: join(root, ".agent-harness", "worktrees", "index.json"),
  };
}
