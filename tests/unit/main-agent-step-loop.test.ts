import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  recordMainAgentOrchestrationStep,
  type MainAgentOrchestrationDecision,
  type MainAgentOrchestrationState,
} from "../../src/agent-task/orchestration-engine.js";
import type { ManagedProject, TaskRun, WorkerLease } from "../../src/types/index.js";

type MockLeafInput = {
  orchestration: MainAgentOrchestrationState;
  decision: Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }>;
};

const controls = vi.hoisted(() => ({
  validatorOutcomes: [] as Array<"completed" | "failed">,
  auditorOutcomes: [] as Array<"completed" | "failed">,
  memoryRoot: "",
  taskRuns: new Map<string, TaskRun>(),
}));

vi.mock("../../src/memory/resolver.js", () => ({
  resolveProjectMemory: vi.fn(async () => ({
    mode: "external-local",
    supported: true,
    writable: true,
    artifactBase: "memory-root",
    projectId: "project",
    projectRoot: "E:/tmp/project",
    markerPath: "E:/tmp/project/.agent-harness/project.json",
    agentGuidePath: "E:/tmp/project/AGENTS.md",
    memoryRoot: controls.memoryRoot,
    docsRoot: `${controls.memoryRoot}/docs`,
    harnessRoot: `${controls.memoryRoot}/harness`,
    changesRoot: `${controls.memoryRoot}/harness/changes`,
    evolutionRoot: `${controls.memoryRoot}/harness/evolution`,
    templatesRoot: `${controls.memoryRoot}/templates`,
    scriptsRoot: `${controls.memoryRoot}/scripts`,
    runsRoot: `${controls.memoryRoot}/runs`,
    workbenchRoot: `${controls.memoryRoot}/workbench`,
    workbenchDbPath: `${controls.memoryRoot}/workbench/workbench.sqlite`,
    agentsRoot: `${controls.memoryRoot}/agents`,
    commandsRoot: `${controls.memoryRoot}/commands`,
    agentCatalogPath: `${controls.memoryRoot}/agents/catalog.json`,
    skillsRoot: `${controls.memoryRoot}/skills`,
    worktreeMetadataRoot: `${controls.memoryRoot}/worktrees`,
    worktreeIndexPath: `${controls.memoryRoot}/worktrees/index.json`,
  })),
}));

vi.mock("../../src/main-agent-orchestration/leaf-stages.js", () => {
  function codeRun(label: string) {
    return {
      run: {
        id: label,
        status: "completed",
        worktree: { worktreeId: `${label}-worktree` },
        artifacts: { directory: `runs/${label}` },
      },
    };
  }

  function validationRun(label: string, status: "passed" | "failed") {
    return {
      id: label,
      status,
      artifacts: { directory: `validation/${label}` },
    };
  }

  function auditRun(label: string, status: "approved" | "blocked") {
    return {
      id: label,
      status,
      artifacts: { directory: `audit/${label}` },
    };
  }

  return {
    runCoderLeafStage: vi.fn(async (input: MockLeafInput) => {
      const code = codeRun("code");
      return {
        leaf: "coder",
        roleId: "coder-agent",
        status: "completed",
        code,
        orchestration: recordMainAgentOrchestrationStep(input.orchestration, {
          roleId: "coder-agent",
          status: "completed",
          inputArtifacts: input.decision.inputArtifacts,
          outputArtifacts: ["runs/code"],
          summary: "Coder completed.",
        }),
      };
    }),
    runReworkCoderLeafStage: vi.fn(async (input: MockLeafInput) => {
      const code = codeRun("rework");
      return {
        leaf: "coder",
        roleId: "rework-coder",
        status: "completed",
        code,
        orchestration: recordMainAgentOrchestrationStep(input.orchestration, {
          roleId: "rework-coder",
          status: "completed",
          inputArtifacts: input.decision.inputArtifacts,
          outputArtifacts: ["runs/rework"],
          summary: "Rework completed.",
        }),
      };
    }),
    runValidatorLeafStage: vi.fn(async (input: MockLeafInput) => {
      const outcome = controls.validatorOutcomes.shift() ?? "completed";
      const validation = validationRun("validation", outcome === "completed" ? "passed" : "failed");
      return {
        leaf: "validator",
        roleId: "validator",
        status: outcome,
        validation,
        orchestration: recordMainAgentOrchestrationStep(input.orchestration, {
          roleId: "validator",
          status: outcome,
          inputArtifacts: input.decision.inputArtifacts,
          outputArtifacts: ["validation/validation"],
          ...(outcome === "failed" ? { failureClassification: "validation-failure", stoppedAt: "validation" } : {}),
          summary: outcome === "completed" ? "Validation passed." : "Validation failed.",
        }),
      };
    }),
    runAuditorLeafStage: vi.fn(async (input: MockLeafInput) => {
      const outcome = controls.auditorOutcomes.shift() ?? "completed";
      const audit = auditRun("audit", outcome === "completed" ? "approved" : "blocked");
      return {
        leaf: "auditor",
        roleId: "auditor-agent",
        status: outcome,
        audit,
        orchestration: recordMainAgentOrchestrationStep(input.orchestration, {
          roleId: "auditor-agent",
          status: outcome,
          inputArtifacts: input.decision.inputArtifacts,
          outputArtifacts: ["audit/audit"],
          ...(outcome === "failed" ? { failureClassification: "audit-failure", stoppedAt: "audit" } : {}),
          summary: outcome === "completed" ? "Audit approved." : "Audit failed.",
        }),
      };
    }),
  };
});

vi.mock("../../src/task-run/manager.js", () => ({
  markTaskRunStarted: vi.fn(async (_memory: unknown, taskRunId: string) => {
    const taskRun = controls.taskRuns.get(taskRunId);
    if (!taskRun) throw new Error(`TaskRun not found: ${taskRunId}`);
    const started: TaskRun = {
      ...taskRun,
      status: "running",
      startedAt: taskRun.startedAt ?? "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    };
    controls.taskRuns.set(taskRunId, started);
    return started;
  }),
  finishTaskRunFromWorkflowResult: vi.fn(async (_memory: unknown, taskRunId: string, workflow: unknown) => {
    const taskRun = controls.taskRuns.get(taskRunId);
    if (!taskRun) throw new Error(`TaskRun not found: ${taskRunId}`);
    const result = workflow as {
      stoppedAt?: "code" | "validation" | "audit";
      code?: { run?: { id?: string; worktree?: { worktreeId?: string } } };
    };
    const finished: TaskRun = {
      ...taskRun,
      status: result.stoppedAt ? "blocked" : "completed",
      runId: result.code?.run?.id,
      worktreeId: result.code?.run?.worktree?.worktreeId,
      blockedReason: result.stoppedAt ? `${result.stoppedAt} stopped.` : undefined,
      finishedAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    };
    controls.taskRuns.set(taskRunId, finished);
    return finished;
  }),
  retryTaskRun: vi.fn(async (_project: ManagedProject, options: { taskRunId: string; roleId?: string }) => {
    const previous = controls.taskRuns.get(options.taskRunId);
    if (!previous) throw new Error(`TaskRun not found: ${options.taskRunId}`);
    const retry: TaskRun = {
      ...previous,
      id: `${previous.id}-retry-${previous.attempt}`,
      roleId: options.roleId ?? previous.roleId,
      attempt: previous.attempt + 1,
      status: "claimed",
      startedAt: null,
      finishedAt: null,
      runId: undefined,
      worktreeId: undefined,
      blockedReason: undefined,
      failureReason: undefined,
      leaseId: `${previous.id}-retry-${previous.attempt}-lease`,
      createdAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
    };
    controls.taskRuns.set(retry.id, retry);
    const lease: WorkerLease = {
      version: "1.0",
      id: retry.leaseId!,
      projectId: retry.projectId,
      changeId: retry.changeId,
      taskRunId: retry.id,
      taskId: retry.taskId,
      roleId: retry.roleId,
      workerId: "worker",
      status: "claimed",
      claimedAt: "2026-06-30T00:00:00.000Z",
      updatedAt: "2026-06-30T00:00:00.000Z",
      releasedAt: null,
      expiresAt: "2026-06-30T01:00:00.000Z",
    };
    return { taskRun: retry, lease };
  }),
}));

import {
  ensureMainAgentLoopRun,
  mainAgentLoopRunPath,
} from "../../src/main-agent-orchestration/loop-evidence.js";
import {
  assessMainAgentActionBridge,
  mainAgentLoopEventsPath,
  mainAgentNextStepDecisionsPath,
  readMainAgentNextStepEvidence,
  readMainAgentLoopEvents,
  readMainAgentLoopRun,
  runMainAgentOrchestration,
  runMainAgentSourceRefreshRework,
  runMainAgentTaskRunLifecycle,
  runMainAgentTaskRunAttempt,
} from "../../src/main-agent-orchestration/index.js";
import { recordMainAgentNextStepEvidence } from "../../src/main-agent-orchestration/next-step-evidence.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import {
  runAuditorLeafStage,
  runCoderLeafStage,
  runReworkCoderLeafStage,
  runValidatorLeafStage,
} from "../../src/main-agent-orchestration/leaf-stages.js";

const project: ManagedProject = {
  id: "project",
  name: "project",
  path: "E:/tmp/project",
  addedAt: "2026-06-30T00:00:00.000Z",
  lastSeenAt: "2026-06-30T00:00:00.000Z",
};

function taskRun(overrides: Partial<TaskRun> = {}): TaskRun {
  return {
    version: "1.0",
    id: "task-run-1",
    projectId: project.id,
    changeId: "change-taskrun-lifecycle",
    taskId: "task-1",
    roleId: "coder",
    attempt: 1,
    status: "claimed",
    createdAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    startedAt: null,
    finishedAt: null,
    leaseId: "lease-1",
    ...overrides,
  };
}

function workerLease(taskRunId = "task-run-1"): WorkerLease {
  return {
    version: "1.0",
    id: "lease-1",
    projectId: project.id,
    changeId: "change-taskrun-lifecycle",
    taskRunId,
    taskId: "task-1",
    roleId: "coder",
    workerId: "worker",
    status: "claimed",
    claimedAt: "2026-06-30T00:00:00.000Z",
    updatedAt: "2026-06-30T00:00:00.000Z",
    releasedAt: null,
    expiresAt: "2026-06-30T01:00:00.000Z",
  };
}

describe("main-agent step loop contract", () => {
  beforeEach(async () => {
    controls.validatorOutcomes = [];
    controls.auditorOutcomes = [];
    controls.memoryRoot = await mkdtemp(join(tmpdir(), "aho-main-agent-loop-"));
    controls.taskRuns.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (controls.memoryRoot) await rm(controls.memoryRoot, { recursive: true, force: true });
  });

  it("records bounded loop evidence for a successful top-level run", async () => {
    const result = await runMainAgentOrchestration({
      project,
      changeId: "change-success",
    });

    const loopRunId = result.attempts[0]?.result.loopRunId;
    expect(loopRunId).toBeTruthy();
    const memory = await resolveProjectMemory(project);
    const run = await readMainAgentLoopRun(memory, loopRunId!);
    const events = await readMainAgentLoopEvents(memory, loopRunId!);
    const decisions = await readMainAgentNextStepEvidence(memory, loopRunId!);

    expect(run?.status).toBe("completed");
    expect(events.map((event) => event.type)).toEqual(expect.arrayContaining([
      "loop.started",
      "observation.recorded",
      "decision.recorded",
      "leaf.started",
      "leaf.completed",
      "loop.completed",
    ]));
    expect(events.filter((event) => event.type === "leaf.started").map((event) => event.roleId)).toEqual([
      "coder-agent",
      "validator",
      "auditor-agent",
    ]);
    const decisionEvents = events.filter((event) => event.type === "decision.recorded");
    expect(decisionEvents.every((event) => event.decisionEvidenceId && event.decisionEvidenceRef)).toBe(true);
    expect(decisions.filter((decision) => decision.decision.kind === "delegate-role").map((decision) => decision.decision.roleId)).toEqual([
      "coder-agent",
      "validator",
      "auditor-agent",
    ]);
    const completedDecision = decisions.at(-1);
    expect(completedDecision?.decision.kind).toBe("completed");
    expect(completedDecision?.gateIntent).toBe("result-handoff");
    expect(completedDecision?.targetRefs).toMatchObject({
      worktreeIds: ["code-worktree"],
      runIds: ["code"],
      validationIds: ["validation"],
      auditIds: ["audit"],
    });
    expect(decisions.every((decision) => decision.authority === "non-executing-main-agent-next-step-evidence")).toBe(true);
    expect(decisions.every((decision) => decision.executionStarted === false)).toBe(true);
    expect(decisionEvents.map((event) => event.decisionEvidenceId)).toEqual(decisions.map((decision) => decision.id));
    expect(JSON.stringify([...events, ...decisions])).not.toContain("Check chat-only");
    expect(JSON.stringify([...events, ...decisions])).not.toContain("stdout");
  });

  it("assesses result-handoff evidence against the current visible gate without executing it", async () => {
    const result = await runMainAgentOrchestration({
      project,
      changeId: "change-bridge",
    });
    const memory = await resolveProjectMemory(project);
    const decisions = await readMainAgentNextStepEvidence(memory, result.attempts[0]!.result.loopRunId!);
    const completedDecision = decisions.at(-1)!;

    const auditGate = await assessMainAgentActionBridge({
      memory,
      projectId: project.id,
      changeId: "change-bridge",
      loopRunId: completedDecision.loopRunId,
      evidenceId: completedDecision.id,
      gate: {
        kind: "approval-action",
        actionId: "audit.accept",
        changeId: "change-bridge",
        enabled: true,
        targetId: "audit",
      },
    });
    expect(auditGate).toMatchObject({
      authority: "non-executing-main-agent-action-bridge-assessment",
      executionStarted: false,
      status: "ready",
      matchedGateKind: "approval-action",
      matchedAction: "audit.accept",
    });

    const applyGate = await assessMainAgentActionBridge({
      memory,
      projectId: project.id,
      changeId: "change-bridge",
      loopRunId: completedDecision.loopRunId,
      evidenceId: completedDecision.id,
      gate: {
        kind: "approval-action",
        actionId: "result.apply",
        changeId: "change-bridge",
        enabled: true,
        targetId: "code-worktree",
      },
    });
    expect(applyGate.status).toBe("ready");

    const landingGate = await assessMainAgentActionBridge({
      memory,
      projectId: project.id,
      changeId: "change-bridge",
      loopRunId: completedDecision.loopRunId,
      evidenceId: completedDecision.id,
      gate: {
        kind: "workflow-action",
        actionType: "landing.prepare",
        changeId: "change-bridge",
        enabled: true,
        scope: { actionType: "landing.prepare", worktreeId: "code-worktree" },
      },
    });
    expect(landingGate.status).toBe("ready");

    const mismatch = await assessMainAgentActionBridge({
      memory,
      projectId: project.id,
      changeId: "change-bridge",
      loopRunId: completedDecision.loopRunId,
      evidenceId: completedDecision.id,
      gate: {
        kind: "approval-action",
        actionId: "result.apply",
        changeId: "change-bridge",
        enabled: true,
        targetId: "other-worktree",
      },
    });
    expect(mismatch.status).toBe("target-mismatch");
  });

  it("does not bridge delegate, failed, stale, disabled, or remote gates", async () => {
    controls.validatorOutcomes = ["failed"];
    const result = await runMainAgentTaskRunAttempt({
      project,
      changeId: "change-bridge-fail-closed",
      taskIds: ["task-1"],
      taskRunId: "task-run-1",
    });
    const memory = await resolveProjectMemory(project);
    const decisions = await readMainAgentNextStepEvidence(memory, result.loopRunId!);
    const failedDecision = decisions.at(-1)!;
    const delegateLoop = await ensureMainAgentLoopRun(memory, {
      loopRunId: "manual-delegate-loop",
      changeId: "change-bridge-fail-closed",
      projectId: project.id,
      entrypoint: "task-run",
    });
    const delegateDecision = await recordMainAgentNextStepEvidence(memory, delegateLoop.run, {
      stepIndex: 0,
      entrypoint: "task-run",
      observation: {
        summary: "Manual delegate observation.",
        totalSteps: 0,
        completedSteps: 0,
        failedSteps: 0,
        latestRoleId: null,
        latestStatus: null,
      },
      decision: {
        kind: "delegate-role",
        roleId: "coder-agent",
        attemptKind: "initial",
        inputArtifacts: [],
        reason: "Delegate coder leaf.",
        nextRecommendation: "Run coder leaf only.",
      },
    });

    const delegateBridge = await assessMainAgentActionBridge({
      memory,
      projectId: project.id,
      changeId: "change-bridge-fail-closed",
      loopRunId: delegateDecision.loopRunId,
      evidenceId: delegateDecision.id,
      gate: {
        kind: "approval-action",
        actionId: "result.apply",
        changeId: "change-bridge-fail-closed",
        enabled: true,
        targetId: "code-worktree",
      },
    });
    expect(delegateBridge.status).toBe("unsupported");

    const failedBridge = await assessMainAgentActionBridge({
      memory,
      projectId: project.id,
      changeId: "change-bridge-fail-closed",
      loopRunId: failedDecision.loopRunId,
      evidenceId: failedDecision.id,
      gate: {
        kind: "approval-action",
        actionId: "result.apply",
        changeId: "change-bridge-fail-closed",
        enabled: true,
        targetId: "code-worktree",
      },
    });
    expect(failedBridge.status).toBe("unsupported");

    const disabledBridge = await assessMainAgentActionBridge({
      memory,
      projectId: project.id,
      changeId: "change-bridge-fail-closed",
      loopRunId: failedDecision.loopRunId,
      evidenceId: failedDecision.id,
      gate: {
        kind: "approval-action",
        actionId: "result.apply",
        changeId: "change-bridge-fail-closed",
        enabled: false,
        targetId: "code-worktree",
      },
    });
    expect(disabledBridge.status).toBe("blocked");

    const remoteBridge = await assessMainAgentActionBridge({
      memory,
      projectId: project.id,
      changeId: "change-bridge-fail-closed",
      loopRunId: failedDecision.loopRunId,
      evidenceId: failedDecision.id,
      gate: {
        kind: "workflow-action",
        actionType: "remote-landing.merge",
        changeId: "change-bridge-fail-closed",
        enabled: true,
        scope: { actionType: "remote-landing.merge", remoteLandingResultId: "remote-1" },
      },
    });
    expect(remoteBridge.status).toBe("unsupported");
  });

  it("keeps TaskRun entrypoints single-attempt when validation fails", async () => {
    controls.validatorOutcomes = ["failed"];

    const result = await runMainAgentTaskRunAttempt({
      project,
      changeId: "change-task-run",
      taskIds: ["task-1"],
      taskRunId: "task-run-1",
    });

    expect(runCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runValidatorLeafStage).toHaveBeenCalledTimes(1);
    expect(runReworkCoderLeafStage).not.toHaveBeenCalled();
    expect(runAuditorLeafStage).not.toHaveBeenCalled();
    expect(result.stoppedAt).toBe("validation");
    expect(result.status).toBeUndefined();
    const memory = await resolveProjectMemory(project);
    const events = await readMainAgentLoopEvents(memory, result.loopRunId!);
    const decisions = await readMainAgentNextStepEvidence(memory, result.loopRunId!);
    expect(events.filter((event) => event.roleId === "rework-coder")).toHaveLength(0);
    expect(decisions.filter((decision) => decision.decision.roleId === "rework-coder")).toHaveLength(0);
    expect(events.some((event) => event.type === "loop.stopped")).toBe(true);
  });

  it("lets the main-agent TaskRun lifecycle own one bounded rework retry", async () => {
    controls.validatorOutcomes = ["failed", "completed"];
    const initialTaskRun = taskRun();
    controls.taskRuns.set(initialTaskRun.id, initialTaskRun);
    const retryHandoffs: string[] = [];

    const result = await runMainAgentTaskRunLifecycle({
      project,
      started: { taskRun: initialTaskRun, lease: workerLease() },
      prompt: "Implement the queued task.",
      onRetryTaskRunStarted: async (started) => {
        retryHandoffs.push(started.taskRun.id);
      },
    });

    expect(runCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runReworkCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runValidatorLeafStage).toHaveBeenCalledTimes(2);
    expect(runAuditorLeafStage).toHaveBeenCalledTimes(1);
    expect(result.taskRun).toMatchObject({
      id: "task-run-1-retry-1",
      roleId: "rework-coder",
      attempt: 2,
      status: "completed",
    });
    expect(result.autoRework?.previousTaskRun).toMatchObject({ id: "task-run-1", status: "blocked" });
    expect(retryHandoffs).toEqual(["task-run-1-retry-1"]);
    const workflow = result.workflow as { loopRunId?: string };
    expect(workflow.loopRunId).toBeTruthy();
    const memory = await resolveProjectMemory(project);
    const events = await readMainAgentLoopEvents(memory, workflow.loopRunId!);
    const decisions = await readMainAgentNextStepEvidence(memory, workflow.loopRunId!);
    expect(events.filter((event) => event.type === "loop.started")).toHaveLength(1);
    expect(events.filter((event) => event.type === "loop.stopped")).toHaveLength(0);
    expect(events.filter((event) => event.type === "loop.completed")).toHaveLength(1);
    expect(events.filter((event) => event.type === "leaf.started").map((event) => event.roleId)).toEqual([
      "coder-agent",
      "validator",
      "rework-coder",
      "validator",
      "auditor-agent",
    ]);
    expect(decisions.filter((decision) => decision.decision.roleId === "rework-coder")).toHaveLength(1);
  });

  it("does not let a child TaskRun finalize a parent queue loop", async () => {
    const initialTaskRun = taskRun({ id: "task-run-parent-child" });
    controls.taskRuns.set(initialTaskRun.id, initialTaskRun);
    const memory = await resolveProjectMemory(project);
    const parent = await ensureMainAgentLoopRun(memory, {
      loopRunId: "queue-parent-loop",
      changeId: initialTaskRun.changeId,
      projectId: project.id,
      entrypoint: "task-queue",
    });

    const result = await runMainAgentTaskRunLifecycle({
      project,
      started: { taskRun: initialTaskRun, lease: workerLease("task-run-parent-child") },
      prompt: "Run child task.",
      loopRunId: parent.run.id,
      ownsLoopFinalization: false,
    });

    expect(result.taskRun).toMatchObject({ id: "task-run-parent-child", status: "completed" });
    const parentAfterChild = await readMainAgentLoopRun(memory, parent.run.id);
    const events = await readMainAgentLoopEvents(memory, parent.run.id);
    expect(parentAfterChild?.entrypoint).toBe("task-queue");
    expect(parentAfterChild?.status).toBe("running");
    expect(events.filter((event) => event.type === "leaf.started").map((event) => event.roleId)).toEqual([
      "coder-agent",
      "validator",
      "auditor-agent",
    ]);
    expect(events.some((event) => event.type === "loop.completed" || event.type === "loop.stopped")).toBe(false);
  });

  it("does not create a third TaskRun when bounded rework budget is exhausted", async () => {
    controls.validatorOutcomes = ["failed"];
    const priorRetry = taskRun({ id: "task-run-retry", attempt: 2 });
    controls.taskRuns.set(priorRetry.id, priorRetry);

    const result = await runMainAgentTaskRunLifecycle({
      project,
      started: { taskRun: priorRetry, lease: workerLease("task-run-retry") },
      prompt: "Retry task.",
    });

    expect(runCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runReworkCoderLeafStage).not.toHaveBeenCalled();
    expect(runValidatorLeafStage).toHaveBeenCalledTimes(1);
    expect(runAuditorLeafStage).not.toHaveBeenCalled();
    expect(result.taskRun).toMatchObject({ id: "task-run-retry", attempt: 2, status: "blocked" });
    expect(result.autoRework).toBeUndefined();
    expect([...controls.taskRuns.keys()]).toEqual(["task-run-retry"]);
    const workflow = result.workflow as { loopRunId?: string };
    const memory = await resolveProjectMemory(project);
    const events = await readMainAgentLoopEvents(memory, workflow.loopRunId!);
    expect(events.filter((event) => event.roleId === "rework-coder")).toHaveLength(0);
    expect(events.filter((event) => event.type === "loop.stopped")).toHaveLength(1);
  });

  it("allows only the top-level runner to perform one automatic rework", async () => {
    controls.validatorOutcomes = ["failed", "completed"];

    const result = await runMainAgentOrchestration({
      project,
      changeId: "change-top-level",
    });

    expect(runCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runReworkCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runValidatorLeafStage).toHaveBeenCalledTimes(2);
    expect(runAuditorLeafStage).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("completed");
    expect(result.reworkUsed).toBe(1);
    expect(result.attempts).toHaveLength(2);
    expect(result.attempts[0]?.result.loopRunId).toBe(result.attempts[1]?.result.loopRunId);
    const memory = await resolveProjectMemory(project);
    const events = await readMainAgentLoopEvents(memory, result.attempts[0]!.result.loopRunId!);
    const decisions = await readMainAgentNextStepEvidence(memory, result.attempts[0]!.result.loopRunId!);
    expect(events.filter((event) => event.type === "loop.started")).toHaveLength(1);
    expect(events.filter((event) => event.roleId === "rework-coder" && event.type === "leaf.started")).toHaveLength(1);
    expect(decisions.filter((decision) => decision.decision.roleId === "rework-coder")).toHaveLength(1);
    expect(events.filter((event) => event.type === "loop.completed")).toHaveLength(1);
  });

  it("does not nest automatic rework for source-refresh rework entrypoints", async () => {
    controls.validatorOutcomes = ["failed"];

    const result = await runMainAgentSourceRefreshRework({
      project,
      changeId: "change-source-refresh",
    });

    expect(runCoderLeafStage).not.toHaveBeenCalled();
    expect(runReworkCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runValidatorLeafStage).toHaveBeenCalledTimes(1);
    expect(runAuditorLeafStage).not.toHaveBeenCalled();
    expect(result.stoppedAt).toBe("validation");
    expect(result.status).toBeUndefined();
    const memory = await resolveProjectMemory(project);
    const events = await readMainAgentLoopEvents(memory, result.loopRunId!);
    const decisions = await readMainAgentNextStepEvidence(memory, result.loopRunId!);
    expect(events.filter((event) => event.roleId === "rework-coder" && event.type === "leaf.started")).toHaveLength(1);
    expect(decisions.filter((decision) => decision.decision.roleId === "rework-coder")).toHaveLength(1);
    expect(events.filter((event) => event.type === "loop.stopped")).toHaveLength(1);
  });

  it("fails closed when loop evidence is missing or malformed", async () => {
    const result = await runMainAgentTaskRunAttempt({
      project,
      changeId: "change-malformed",
      taskIds: ["task-1"],
      taskRunId: "task-run-1",
    });
    const memory = await resolveProjectMemory(project);

    expect(await readMainAgentLoopRun(memory, "missing-loop")).toBeNull();
    expect(await readMainAgentLoopEvents(memory, "missing-loop")).toEqual([]);
    expect(await readMainAgentNextStepEvidence(memory, "missing-loop")).toEqual([]);

    await writeFile(mainAgentLoopEventsPath(memory, result.loopRunId!), "{not-json}\n", "utf8");
    expect(await readMainAgentLoopEvents(memory, result.loopRunId!)).toEqual([]);
    await writeFile(mainAgentNextStepDecisionsPath(memory, result.loopRunId!), "{not-json}\n", "utf8");
    expect(await readMainAgentNextStepEvidence(memory, result.loopRunId!)).toEqual([]);
  });

  it("recreates malformed loop metadata without blocking orchestration evidence", async () => {
    const memory = await resolveProjectMemory(project);
    const malformedPath = mainAgentLoopRunPath(memory, "malformed-loop");
    await mkdir(dirname(malformedPath), { recursive: true });
    await writeFile(malformedPath, "{not-json}\n", "utf8");

    const ensured = await ensureMainAgentLoopRun(memory, {
      loopRunId: "malformed-loop",
      changeId: "change-malformed-loop",
      projectId: project.id,
      entrypoint: "task-run",
    });

    expect(ensured.created).toBe(true);
    expect(ensured.run.id).toBe("malformed-loop");
    expect(ensured.run.status).toBe("running");
  });
});
