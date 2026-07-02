import { appendFile, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  buildMainAgentResumeContinuationContext,
  detectMainAgentResumeContinuationIntent,
  mainAgentResumePointsPath,
  recordMainAgentResumePoint,
  renderMainAgentResumeContinuationPromptSection,
  type MainAgentResumeKeyInput,
} from "../../src/main-agent-orchestration/index.js";
import { buildRoleContextPacket } from "../../src/context/packets.js";
import type { ChangeStatus, ResolvedMemory } from "../../src/types/index.js";

describe("main-agent resume continuation context", () => {
  let tempDir: string;
  let memory: ResolvedMemory;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aho-main-agent-resume-continuation-"));
    memory = buildMemory(tempDir);
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("binds explicit continuation to the latest same-project stable-key resume point", async () => {
    const keyInput = baseKeyInput();
    const point = await recordMainAgentResumePoint(memory, changePath(), {
      projectId: "project-1",
      changeId: "change-a",
      lane: "manual-gate",
      stopReason: "feedback-provided",
      summary: "User asked to continue with bounded feedback.",
      resumeKeyInput: keyInput,
      currentGate: keyInput.gate,
      reusableEvidenceRefs: ["runs/run-1/context.md"],
      refs: { runIds: ["run-1"], validationIds: ["validation-1"], auditIds: ["audit-1"] },
    });

    const context = await buildMainAgentResumeContinuationContext(memory, {
      projectId: "project-1",
      changeId: "change-a",
      changePath: changePath(),
      continuationIntent: { requested: true, source: "explicit", summary: "continue" },
      currentEvidence: evidenceFromKeyInput(keyInput),
      candidateLanes: ["manual-gate"],
      priority: { hasConcreteCurrentGate: true },
    });

    expect(context).toMatchObject({
      authority: "read-only-main-agent-resume-continuation-context",
      executionStarted: false,
      status: "available",
      resumePoint: { id: point.id, lane: "manual-gate", stopReason: "feedback-provided" },
      reusePosture: "subordinate-context",
      subordinateTo: ["current-gate"],
    });
    const rendered = renderMainAgentResumeContinuationPromptSection(context).join("\n");
    expect(rendered).toContain("Main Agent Resume Continuation Context");
    expect(rendered).toContain(point.id);
    expect(rendered).not.toContain("resumeKeyInput");
    expect(rendered).not.toContain("confirmationPayload");
    expect(rendered).not.toContain("actionPayload");
  });

  it("does not request continuation from ordinary chat", async () => {
    const intent = detectMainAgentResumeContinuationIntent("What happened in the last run?");
    const context = await buildMainAgentResumeContinuationContext(memory, {
      projectId: "project-1",
      changeId: "change-a",
      changePath: changePath(),
      continuationIntent: intent,
      currentEvidence: { changeId: "change-a" },
    });

    expect(context.status).toBe("not-requested");
    expect(renderMainAgentResumeContinuationPromptSection(context)).toEqual([]);
  });

  it("detects explicit Chinese continuation and feedback continuation phrases", () => {
    for (const text of [
      "按这个反馈继续跑",
      "按刚才意见继续",
      "根据上面反馈继续跑",
      "继续执行",
      "从断点继续",
      "重新跑这一段",
    ]) {
      expect(detectMainAgentResumeContinuationIntent(text)).toMatchObject({ requested: true });
    }

    expect(detectMainAgentResumeContinuationIntent("只是问一下刚才发生了什么")).toMatchObject({ requested: false });
  });

  it("fails closed for no point, project mismatch, source drift, and non-stale key drift", async () => {
    const keyInput = baseKeyInput();
    expect(await buildMainAgentResumeContinuationContext(memory, {
      projectId: "project-1",
      changeId: "change-a",
      changePath: changePath(),
      continuationIntent: { requested: true, source: "explicit" },
      currentEvidence: evidenceFromKeyInput(keyInput),
      candidateLanes: ["manual-gate"],
    })).toMatchObject({ status: "missing" });

    await recordMainAgentResumePoint(memory, changePath(), {
      projectId: "project-1",
      changeId: "change-a",
      lane: "manual-gate",
      stopReason: "user-stopped",
      summary: "Stopped.",
      resumeKeyInput: keyInput,
      currentGate: keyInput.gate,
    });

    expect(await buildMainAgentResumeContinuationContext(memory, {
      projectId: "project-2",
      changeId: "change-a",
      changePath: changePath(),
      continuationIntent: { requested: true, source: "explicit" },
      currentEvidence: evidenceFromKeyInput(keyInput),
      candidateLanes: ["manual-gate"],
    })).toMatchObject({ status: "scope-mismatch" });

    expect(await buildMainAgentResumeContinuationContext(memory, {
      projectId: "project-1",
      changeId: "change-a",
      changePath: changePath(),
      continuationIntent: { requested: true, source: "explicit" },
      currentEvidence: evidenceFromKeyInput({ ...keyInput, sourceState: { gitHead: "head-2" } }),
      candidateLanes: ["manual-gate"],
    })).toMatchObject({ status: "stale" });

    expect(await buildMainAgentResumeContinuationContext(memory, {
      projectId: "project-1",
      changeId: "change-a",
      changePath: changePath(),
      continuationIntent: { requested: true, source: "explicit" },
      currentEvidence: evidenceFromKeyInput({ ...keyInput, targetRefs: { taskIds: ["task-2"] } }),
      candidateLanes: ["manual-gate"],
    })).toMatchObject({ status: "key-mismatch" });
  });

  it("blocks on malformed latest evidence and never falls back to older points", async () => {
    const keyInput = baseKeyInput();
    await recordMainAgentResumePoint(memory, changePath(), {
      projectId: "project-1",
      changeId: "change-a",
      lane: "manual-gate",
      stopReason: "user-stopped",
      summary: "Valid old point.",
      resumeKeyInput: keyInput,
      currentGate: keyInput.gate,
    });
    const path = mainAgentResumePointsPath(memory, changePath());
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, "{\"version\":\"bad\"}\n", "utf8");

    expect(await buildMainAgentResumeContinuationContext(memory, {
      projectId: "project-1",
      changeId: "change-a",
      changePath: changePath(),
      continuationIntent: { requested: true, source: "explicit" },
      currentEvidence: evidenceFromKeyInput(keyInput),
      candidateLanes: ["manual-gate"],
    })).toMatchObject({ status: "blocked" });
  });

  it("keeps continuation context out of worker role context packets", () => {
    const packet = buildRoleContextPacket({
      roleId: "coder",
      goal: "Implement scoped task.",
      changeStatus: changeStatus(),
      evidenceSummary: ["ResumeContinuationContext must not appear here."],
    });

    expect(JSON.stringify(packet)).not.toContain("MainAgentResumeContinuationContext");
    expect(JSON.stringify(packet)).not.toContain("read-only-main-agent-resume-continuation-context");
    expect(packet.permissionProfile.mayDelegate).toBe(false);
  });
});

function baseKeyInput(): MainAgentResumeKeyInput {
  return {
    changeId: "change-a",
    lane: "manual-gate",
    gate: {
      kind: "workflow-action",
      actionType: "code.run",
      changeId: "change-a",
      targetIds: ["task-1"],
      scope: { taskId: "task-1" },
    },
    targetRefs: { taskIds: ["task-1"] },
    sourceState: { gitHead: "head-1", statusShort: [] },
    acceptedArtifactHashes: { spec: "spec-1", plan: "plan-1", tasks: "tasks-1" },
    runtimePolicy: { toolPolicy: "default" },
  };
}

function evidenceFromKeyInput(input: MainAgentResumeKeyInput) {
  return {
    changeId: input.changeId,
    gate: input.gate,
    targetRefs: input.targetRefs,
    sourceState: input.sourceState,
    acceptedArtifactHashes: input.acceptedArtifactHashes,
    runtimePolicy: input.runtimePolicy,
    feedbackHash: input.feedbackHash,
  };
}

function changePath(): string {
  return "harness/changes/active/change-a";
}

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

function changeStatus(): ChangeStatus {
  return {
    change: { id: "change-a", title: "Change A", createdAt: "2026-07-02T00:00:00.000Z" },
    acMap: {
      changeId: "change-a",
      acceptanceCriteria: [{ id: "AC-001", text: "Works." }],
      tasks: [{ id: "T-001", text: "Do it.", done: false, acIds: ["AC-001"] }],
    },
    reviewStatus: "pending",
    latestValidation: null,
    latestAudit: null,
    closeGate: { ready: false, blockingIssues: [], warnings: [] },
  } as ChangeStatus;
}
