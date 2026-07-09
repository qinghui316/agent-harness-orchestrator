import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  recordWorkflowRuntimeExecutionStep,
  type WorkflowRuntimeDecision,
  type WorkflowRuntimeExecutionState,
} from "../../src/workflow-runtime/execution-contract.js";
import type { ManagedProject, ResolvedMemory, TaskRun, WorkerLease } from "../../src/types/index.js";

type MockLeafInput = {
  orchestration: WorkflowRuntimeExecutionState;
  decision: Extract<WorkflowRuntimeDecision, { kind: "delegate-role" }>;
};

const controls = vi.hoisted(() => ({
  reworkOutcome: "completed" as "completed" | "failed",
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

vi.mock("../../src/workflow-runtime/leaf-execution.js", () => {
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
    const artifacts = {
      validation: `validation/${label}/validation.json`,
      stdout: `validation/${label}/out.log`,
      stderr: `validation/${label}/err.log`,
    };
    return {
      run: {
        id: `${label}-run`,
        artifacts,
      },
      validation: {
        id: label,
        status,
        artifacts,
      },
    };
  }

  function auditRun(label: string, status: "approved" | "blocked") {
    const artifacts = {
      audit: `audit/${label}/audit.json`,
      auditMarkdown: `audit/${label}/audit.md`,
      lastMessage: `audit/${label}/last-message.md`,
    };
    return {
      run: {
        id: `${label}-run`,
        artifacts,
      },
      audit: {
        id: label,
        status,
        artifacts,
      },
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
        orchestration: recordWorkflowRuntimeExecutionStep(input.orchestration, {
          roleId: "coder-agent",
          status: "completed",
          inputArtifacts: input.decision.inputArtifacts,
          outputArtifacts: ["runs/code"],
          summary: "Coder completed.",
        }),
      };
    }),
    runReworkCoderLeafStage: vi.fn(async (input: MockLeafInput) => {
      if (controls.reworkOutcome === "failed") {
        return {
          leaf: "coder",
          roleId: "rework-coder",
          status: "failed",
          stoppedAt: "code",
          error: "Rework failed.",
          orchestration: recordWorkflowRuntimeExecutionStep(input.orchestration, {
            roleId: "rework-coder",
            status: "failed",
            inputArtifacts: input.decision.inputArtifacts,
            outputArtifacts: [],
            failureClassification: "code-failure",
            stoppedAt: "code",
            summary: "Rework failed.",
          }),
        };
      }
      const code = codeRun("rework");
      return {
        leaf: "coder",
        roleId: "rework-coder",
        status: "completed",
        code,
        orchestration: recordWorkflowRuntimeExecutionStep(input.orchestration, {
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
        orchestration: recordWorkflowRuntimeExecutionStep(input.orchestration, {
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
        orchestration: recordWorkflowRuntimeExecutionStep(input.orchestration, {
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
  assessMainAgentActionBridge,
  readMainAgentLoopEvents,
  readMainAgentLoopRun,
  mainAgentLoopRunPath,
  mainAgentNextStepDecisionsPath,
  mainAgentNextStepEvidenceRef,
  type MainAgentLoopEntrypoint,
  type MainAgentLoopRun,
  type MainAgentNextStepEvidence,
  type MainAgentNextStepEntrypoint,
} from "../../src/main-agent-orchestration/index.js";
import { runPrFeedbackReworkWorkflow, runSourceRefreshReworkWorkflow, runStartedTaskRunStage } from "../../src/workflow-runtime/code-workflow.js";
import {
  readWorkflowRuntimeDecisionEvidence,
  readWorkflowRuntimeEvidenceEvents,
  readWorkflowRuntimeEvidenceRun,
  workflowRuntimeDecisionEvidencePath,
  workflowRuntimeEvidenceEventsPath,
} from "../../src/workflow-runtime/evidence-journal.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import {
  runAuditorLeafStage,
  runCoderLeafStage,
  runReworkCoderLeafStage,
  runValidatorLeafStage,
} from "../../src/workflow-runtime/leaf-execution.js";

const project: ManagedProject = {
  id: "project",
  name: "project",
  path: "E:/tmp/project",
  addedAt: "2026-06-30T00:00:00.000Z",
  lastSeenAt: "2026-06-30T00:00:00.000Z",
};

async function writeLegacyMainAgentLoopRun(
  memory: ResolvedMemory,
  input: {
    loopRunId: string;
    changeId: string;
    projectId: string | null;
    entrypoint: MainAgentLoopEntrypoint;
    status?: "running" | "completed" | "stopped";
  },
): Promise<{ run: MainAgentLoopRun; created: boolean }> {
  const now = "2026-06-30T00:00:00.000Z";
  const run: MainAgentLoopRun = {
    version: "1.0",
    id: input.loopRunId,
    changeId: input.changeId,
    projectId: input.projectId,
    entrypoint: input.entrypoint,
    status: input.status ?? "running",
    createdAt: now,
    updatedAt: now,
    finishedAt: input.status && input.status !== "running" ? now : null,
  };
  const path = mainAgentLoopRunPath(memory, run.id);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  return { run, created: true };
}

async function writeLegacyMainAgentNextStepEvidence(
  memory: ResolvedMemory,
  run: MainAgentLoopRun,
  input: {
    stepIndex: number;
    entrypoint: MainAgentNextStepEntrypoint;
    observation: MainAgentNextStepEvidence["observation"];
    decision: WorkflowRuntimeDecision;
    gateIntent?: MainAgentNextStepEvidence["gateIntent"];
    targetRefs?: Partial<MainAgentNextStepEvidence["targetRefs"]>;
    artifactRefs?: string[];
    refs?: Partial<MainAgentNextStepEvidence["refs"]>;
  },
): Promise<MainAgentNextStepEvidence> {
  const id = `legacy-next-step-${input.stepIndex}`;
  const evidence: MainAgentNextStepEvidence = {
    version: "1.0",
    authority: "non-executing-main-agent-next-step-evidence",
    executionStarted: false,
    id,
    ref: mainAgentNextStepEvidenceRef(run.id, id),
    loopRunId: run.id,
    changeId: run.changeId,
    projectId: run.projectId,
    entrypoint: input.entrypoint,
    stepIndex: input.stepIndex,
    createdAt: "2026-06-30T00:00:00.000Z",
    observation: input.observation,
    decision: normalizeLegacyNextStepDecision(input.decision),
    gateIntent: input.gateIntent ?? legacyGateIntentForDecision(input.decision),
    targetRefs: normalizeLegacyTargetRefs(input.targetRefs),
    artifactRefs: input.artifactRefs ?? [],
    refs: {
      agentTaskIds: input.refs?.agentTaskIds ?? [],
      runIds: input.refs?.runIds ?? [],
      validationIds: input.refs?.validationIds ?? [],
      auditIds: input.refs?.auditIds ?? [],
    },
  };
  const path = mainAgentNextStepDecisionsPath(memory, run.id);
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, `${JSON.stringify(evidence)}\n`, "utf8");
  return evidence;
}

function normalizeLegacyNextStepDecision(decision: WorkflowRuntimeDecision): MainAgentNextStepEvidence["decision"] {
  if (decision.kind === "delegate-role") {
    return {
      kind: decision.kind,
      roleId: decision.roleId,
      attemptKind: decision.attemptKind,
      stoppedAt: null,
      reason: decision.reason,
      nextRecommendation: decision.nextRecommendation,
    };
  }
  if (decision.kind === "completed") {
    return {
      kind: decision.kind,
      roleId: null,
      attemptKind: null,
      stoppedAt: null,
      reason: decision.reason,
      nextRecommendation: decision.nextRecommendation,
    };
  }
  return {
    kind: decision.kind,
    roleId: null,
    attemptKind: null,
    stoppedAt: decision.stoppedAt,
    reason: decision.reason,
    nextRecommendation: decision.nextRecommendation,
  };
}

function legacyGateIntentForDecision(decision: WorkflowRuntimeDecision): MainAgentNextStepEvidence["gateIntent"] {
  if (decision.kind === "delegate-role") return "delegate-leaf";
  if (decision.kind === "completed") return "result-handoff";
  return "none";
}

function normalizeLegacyTargetRefs(refs: Partial<MainAgentNextStepEvidence["targetRefs"]> | undefined): MainAgentNextStepEvidence["targetRefs"] {
  return {
    worktreeIds: refs?.worktreeIds ?? [],
    runIds: refs?.runIds ?? [],
    validationIds: refs?.validationIds ?? [],
    auditIds: refs?.auditIds ?? [],
    applyCheckIds: refs?.applyCheckIds ?? [],
    landingPackageIds: refs?.landingPackageIds ?? [],
  };
}

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

describe("workflow runtime leaf contract", () => {
  beforeEach(async () => {
    controls.reworkOutcome = "completed";
    controls.validatorOutcomes = [];
    controls.auditorOutcomes = [];
    controls.memoryRoot = await mkdtemp(join(tmpdir(), "aho-main-agent-loop-"));
    controls.taskRuns.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    if (controls.memoryRoot) await rm(controls.memoryRoot, { recursive: true, force: true });
  });

  describe("legacy action bridge compatibility", () => {
  it("assesses result-handoff evidence against the current visible gate without executing it", async () => {
    const memory = await resolveProjectMemory(project);
    const loop = await writeLegacyMainAgentLoopRun(memory, {
      loopRunId: "manual-success-loop",
      changeId: "change-bridge",
      projectId: project.id,
      entrypoint: "task-run",
    });
    const completedDecision = await writeLegacyMainAgentNextStepEvidence(memory, loop.run, {
      stepIndex: 0,
      entrypoint: "task-run",
      observation: {
        summary: "Manual completed handoff evidence.",
        totalSteps: 3,
        completedSteps: 3,
        failedSteps: 0,
        latestRoleId: "auditor-agent",
        latestStatus: "completed",
      },
      decision: {
        kind: "completed",
        reason: "Manual result handoff completed.",
        nextRecommendation: "Show result review and apply handoff.",
      },
      targetRefs: {
        worktreeIds: ["code-worktree"],
        runIds: ["code"],
        validationIds: ["validation"],
        auditIds: ["audit"],
      },
    });

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

    const schedulerGate = await assessMainAgentActionBridge({
      memory,
      projectId: project.id,
      changeId: "change-bridge",
      loopRunId: completedDecision.loopRunId,
      evidenceId: completedDecision.id,
      gate: {
        kind: "workflow-action",
        actionType: "planning.scheduler.worker.start-first",
        changeId: "change-bridge",
        enabled: true,
        scope: {
          actionType: "planning.scheduler.worker.start-first",
          schedulerRunId: "scheduler-run-1",
          schedulerClaimReservationId: "claim-1",
        },
      },
    });
    expect(schedulerGate.status).toBe("unsupported");

    const integrationApprovalGate = await assessMainAgentActionBridge({
      memory,
      projectId: project.id,
      changeId: "change-bridge",
      loopRunId: completedDecision.loopRunId,
      evidenceId: completedDecision.id,
      gate: {
        kind: "approval-action",
        actionId: "apply-check.apply",
        changeId: "change-bridge",
        enabled: true,
        targetId: "apply-check-1",
      },
    });
    expect(integrationApprovalGate.status).toBe("unsupported");
  });

  it("does not bridge delegate, failed, stale, disabled, or remote gates", async () => {
    const memory = await resolveProjectMemory(project);
    const failedLoop = await writeLegacyMainAgentLoopRun(memory, {
      loopRunId: "manual-failed-loop",
      changeId: "change-bridge-fail-closed",
      projectId: project.id,
      entrypoint: "task-run",
    });
    const failedDecision = await writeLegacyMainAgentNextStepEvidence(memory, failedLoop.run, {
      stepIndex: 0,
      entrypoint: "task-run",
      observation: {
        summary: "Manual failed observation.",
        totalSteps: 1,
        completedSteps: 0,
        failedSteps: 1,
        latestRoleId: "validator",
        latestStatus: "failed",
      },
      decision: {
        kind: "needs-user-input",
        stoppedAt: "validation",
        reason: "Validation failed and cannot be bridged into apply.",
        nextRecommendation: "Ask user for clarification.",
      },
    });
    const delegateLoop = await writeLegacyMainAgentLoopRun(memory, {
      loopRunId: "manual-delegate-loop",
      changeId: "change-bridge-fail-closed",
      projectId: project.id,
      entrypoint: "task-run",
    });
    const delegateDecision = await writeLegacyMainAgentNextStepEvidence(memory, delegateLoop.run, {
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

  it("fails closed for stale or incomplete result-handoff bridge evidence", async () => {
    const memory = await resolveProjectMemory(project);
    const loop = await writeLegacyMainAgentLoopRun(memory, {
      loopRunId: "manual-result-handoff-loop",
      changeId: "change-bridge-stale",
      projectId: project.id,
      entrypoint: "top-level",
    });
    const staleDecision = await writeLegacyMainAgentNextStepEvidence(memory, loop.run, {
      stepIndex: 0,
      entrypoint: "top-level",
      observation: {
        summary: "Completed handoff with an earlier worktree.",
        totalSteps: 3,
        completedSteps: 3,
        failedSteps: 0,
        latestRoleId: "auditor-agent",
        latestStatus: "completed",
      },
      decision: {
        kind: "completed",
        reason: "Initial handoff completed.",
        nextRecommendation: "Handoff result.",
      },
      targetRefs: { worktreeIds: ["wt-old"], auditIds: ["audit-old"] },
    });
    const incompleteDecision = await writeLegacyMainAgentNextStepEvidence(memory, loop.run, {
      stepIndex: 1,
      entrypoint: "top-level",
      observation: {
        summary: "Completed handoff without concrete targets.",
        totalSteps: 3,
        completedSteps: 3,
        failedSteps: 0,
        latestRoleId: "auditor-agent",
        latestStatus: "completed",
      },
      decision: {
        kind: "completed",
        reason: "Latest handoff lacks target refs.",
        nextRecommendation: "Handoff result.",
      },
    });

    const staleBridge = await assessMainAgentActionBridge({
      memory,
      projectId: project.id,
      changeId: "change-bridge-stale",
      loopRunId: loop.run.id,
      evidenceId: staleDecision.id,
      gate: {
        kind: "approval-action",
        actionId: "result.apply",
        changeId: "change-bridge-stale",
        enabled: true,
        targetId: "wt-old",
      },
    });
    expect(staleBridge.status).toBe("stale");

    const incompleteBridge = await assessMainAgentActionBridge({
      memory,
      projectId: project.id,
      changeId: "change-bridge-stale",
      loopRunId: loop.run.id,
      evidenceId: incompleteDecision.id,
      gate: {
        kind: "approval-action",
        actionId: "result.apply",
        changeId: "change-bridge-stale",
        enabled: true,
        targetId: "wt-old",
      },
    });
    expect(incompleteBridge.status).toBe("target-mismatch");

    const missingGateBridge = await assessMainAgentActionBridge({
      memory,
      projectId: project.id,
      changeId: "change-bridge-stale",
      loopRunId: loop.run.id,
      evidenceId: incompleteDecision.id,
      gate: null,
    });
    expect(missingGateBridge.status).toBe("unavailable");
  });

  });

  describe("runtime leaf sequences", () => {
  it("lets the workflow-runtime TaskRun stage own one bounded rework retry", async () => {
    controls.validatorOutcomes = ["failed", "completed"];
    const initialTaskRun = taskRun();
    controls.taskRuns.set(initialTaskRun.id, initialTaskRun);
    const retryHandoffs: string[] = [];

    const result = await runStartedTaskRunStage({
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
    const events = await readWorkflowRuntimeEvidenceEvents(memory, workflow.loopRunId!);
    expect(events.filter((event) => event.type === "runtime.started")).toHaveLength(1);
    expect(events.filter((event) => event.type === "runtime.stopped")).toHaveLength(0);
    expect(events.filter((event) => event.type === "runtime.completed")).toHaveLength(1);
    expect(events.filter((event) => event.type === "leaf.started").map((event) => event.roleId)).toEqual([
      "coder-agent",
      "validator",
      "rework-coder",
      "validator",
      "auditor-agent",
    ]);
  });

  it("does not let a child TaskRun finalize a parent queue loop", async () => {
    const initialTaskRun = taskRun({ id: "task-run-parent-child" });
    controls.taskRuns.set(initialTaskRun.id, initialTaskRun);
    const memory = await resolveProjectMemory(project);
    const parent = await writeLegacyMainAgentLoopRun(memory, {
      loopRunId: "queue-parent-loop",
      changeId: initialTaskRun.changeId,
      projectId: project.id,
      entrypoint: "task-queue",
    });

    const result = await runStartedTaskRunStage({
      project,
      started: { taskRun: initialTaskRun, lease: workerLease("task-run-parent-child") },
      prompt: "Run child task.",
      loopRunId: parent.run.id,
      ownsLoopFinalization: false,
    });

    expect(result.taskRun).toMatchObject({ id: "task-run-parent-child", status: "completed" });
    const parentAfterChild = await readMainAgentLoopRun(memory, parent.run.id);
    const parentEvents = await readMainAgentLoopEvents(memory, parent.run.id);
    const runtimeEvents = await readWorkflowRuntimeEvidenceEvents(memory, parent.run.id);
    expect(parentAfterChild?.entrypoint).toBe("task-queue");
    expect(parentAfterChild?.status).toBe("running");
    expect(parentEvents).toEqual([]);
    expect(runtimeEvents.filter((event) => event.type === "leaf.started").map((event) => event.roleId)).toEqual([
      "coder-agent",
      "validator",
      "auditor-agent",
    ]);
    expect(runtimeEvents.some((event) => event.type === "runtime.completed" || event.type === "runtime.stopped")).toBe(false);
  });

  it("does not create a third TaskRun when bounded rework budget is exhausted", async () => {
    controls.validatorOutcomes = ["failed"];
    const priorRetry = taskRun({ id: "task-run-retry", attempt: 2 });
    controls.taskRuns.set(priorRetry.id, priorRetry);

    const result = await runStartedTaskRunStage({
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
    const events = await readWorkflowRuntimeEvidenceEvents(memory, workflow.loopRunId!);
    expect(events.filter((event) => event.roleId === "rework-coder")).toHaveLength(0);
    expect(events.filter((event) => event.type === "runtime.stopped")).toHaveLength(1);
  });

  it("does not nest automatic rework for source-refresh rework entrypoints", async () => {
    controls.validatorOutcomes = ["failed"];

    const result = await runSourceRefreshReworkWorkflow({
      project,
      changeId: "change-source-refresh",
    });

    expect(runCoderLeafStage).not.toHaveBeenCalled();
    expect(runReworkCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runValidatorLeafStage).toHaveBeenCalledTimes(1);
    expect(runAuditorLeafStage).not.toHaveBeenCalled();
    expect(result.stoppedAt).toBe("validation");
    expect(result.status).toBe("needs-user-input");
    const memory = await resolveProjectMemory(project);
    const events = await readWorkflowRuntimeEvidenceEvents(memory, result.loopRunId!);
    const decisions = await readWorkflowRuntimeDecisionEvidence(memory, result.loopRunId!);
    expect(events.filter((event) => event.roleId === "rework-coder" && event.type === "leaf.started")).toHaveLength(1);
    expect(decisions.filter((decision) => decision.decision.roleId === "rework-coder")).toHaveLength(1);
    expect(events.filter((event) => event.type === "runtime.stopped")).toHaveLength(1);
  });

  it("runs source-refresh rework through rework, validation, and audit", async () => {
    const result = await runSourceRefreshReworkWorkflow({
      project,
      changeId: "change-source-refresh-success",
    });

    expect(runCoderLeafStage).not.toHaveBeenCalled();
    expect(runReworkCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runValidatorLeafStage).toHaveBeenCalledTimes(1);
    expect(runAuditorLeafStage).toHaveBeenCalledTimes(1);
    expect(result.stoppedAt).toBeNull();
    expect(result.status).toBeUndefined();
    const memory = await resolveProjectMemory(project);
    const events = await readWorkflowRuntimeEvidenceEvents(memory, result.loopRunId);
    const decisions = await readWorkflowRuntimeDecisionEvidence(memory, result.loopRunId);
    expect(events.filter((event) => event.type === "runtime.completed")).toHaveLength(1);
    expect(decisions.at(-1)?.decision.kind).toBe("completed");
  });

  it("stops source-refresh rework at audit failure without apply or nested rework", async () => {
    controls.auditorOutcomes = ["failed"];

    const result = await runSourceRefreshReworkWorkflow({
      project,
      changeId: "change-source-refresh-audit",
    });

    expect(runCoderLeafStage).not.toHaveBeenCalled();
    expect(runReworkCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runValidatorLeafStage).toHaveBeenCalledTimes(1);
    expect(runAuditorLeafStage).toHaveBeenCalledTimes(1);
    expect(result.stoppedAt).toBe("audit");
    expect(result.status).toBe("needs-user-input");
    const memory = await resolveProjectMemory(project);
    const decisions = await readWorkflowRuntimeDecisionEvidence(memory, result.loopRunId);
    expect(decisions.at(-1)?.decision.kind).toBe("needs-user-input");
    expect(decisions.filter((decision) => decision.decision.roleId === "rework-coder")).toHaveLength(1);
  });

  it("fails source-refresh rework before validation when rework-coder cannot produce code", async () => {
    controls.reworkOutcome = "failed";

    const result = await runSourceRefreshReworkWorkflow({
      project,
      changeId: "change-source-refresh-code-failure",
    });

    expect(runCoderLeafStage).not.toHaveBeenCalled();
    expect(runReworkCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runValidatorLeafStage).not.toHaveBeenCalled();
    expect(runAuditorLeafStage).not.toHaveBeenCalled();
    expect(result.stoppedAt).toBe("code");
    expect(result.status).toBe("failed");
    const memory = await resolveProjectMemory(project);
    const decisions = await readWorkflowRuntimeDecisionEvidence(memory, result.loopRunId);
    expect(decisions.at(-1)?.decision.kind).toBe("failed");
  });

  it("runs PR feedback rework through rework, validation, and audit", async () => {
    const result = await runPrFeedbackReworkWorkflow({
      project,
      changeId: "change-pr-feedback-success",
    });

    expect(runCoderLeafStage).not.toHaveBeenCalled();
    expect(runReworkCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runValidatorLeafStage).toHaveBeenCalledTimes(1);
    expect(runAuditorLeafStage).toHaveBeenCalledTimes(1);
    expect(result.stoppedAt).toBeNull();
    expect(result.status).toBeUndefined();
    const memory = await resolveProjectMemory(project);
    const events = await readWorkflowRuntimeEvidenceEvents(memory, result.loopRunId);
    const decisions = await readWorkflowRuntimeDecisionEvidence(memory, result.loopRunId);
    expect(events.filter((event) => event.type === "runtime.completed")).toHaveLength(1);
    expect(decisions.at(-1)?.decision.kind).toBe("completed");
  });

  it("stops PR feedback rework at validation failure without nested rework or audit", async () => {
    controls.validatorOutcomes = ["failed"];

    const result = await runPrFeedbackReworkWorkflow({
      project,
      changeId: "change-pr-feedback-validation",
    });

    expect(runCoderLeafStage).not.toHaveBeenCalled();
    expect(runReworkCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runValidatorLeafStage).toHaveBeenCalledTimes(1);
    expect(runAuditorLeafStage).not.toHaveBeenCalled();
    expect(result.stoppedAt).toBe("validation");
    expect(result.status).toBe("needs-user-input");
    const memory = await resolveProjectMemory(project);
    const decisions = await readWorkflowRuntimeDecisionEvidence(memory, result.loopRunId);
    expect(decisions.filter((decision) => decision.entrypoint === "feedback-rework" && decision.decision.roleId === "rework-coder")).toHaveLength(1);
    expect(decisions.at(-1)?.decision.kind).toBe("needs-user-input");
  });

  it("fails PR feedback rework before validation when rework-coder cannot produce code", async () => {
    controls.reworkOutcome = "failed";

    const result = await runPrFeedbackReworkWorkflow({
      project,
      changeId: "change-pr-feedback-code-failure",
    });

    expect(runCoderLeafStage).not.toHaveBeenCalled();
    expect(runReworkCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runValidatorLeafStage).not.toHaveBeenCalled();
    expect(runAuditorLeafStage).not.toHaveBeenCalled();
    expect(result.stoppedAt).toBe("code");
    expect(result.status).toBe("failed");
    const memory = await resolveProjectMemory(project);
    const decisions = await readWorkflowRuntimeDecisionEvidence(memory, result.loopRunId);
    expect(decisions.at(-1)?.decision.kind).toBe("failed");
  });

  it("fails closed when runtime evidence is missing or malformed", async () => {
    const malformedTaskRun = taskRun({ id: "task-run-malformed", changeId: "change-malformed" });
    controls.taskRuns.set(malformedTaskRun.id, malformedTaskRun);
    const result = await runStartedTaskRunStage({
      project,
      started: { taskRun: malformedTaskRun, lease: workerLease(malformedTaskRun.id) },
    });
    const memory = await resolveProjectMemory(project);

    expect(await readWorkflowRuntimeEvidenceRun(memory, "missing-runtime")).toBeNull();
    expect(await readWorkflowRuntimeEvidenceEvents(memory, "missing-runtime")).toEqual([]);
    expect(await readWorkflowRuntimeDecisionEvidence(memory, "missing-runtime")).toEqual([]);

    await writeFile(workflowRuntimeEvidenceEventsPath(memory, result.workflow.loopRunId!), "{not-json}\n", "utf8");
    expect(await readWorkflowRuntimeEvidenceEvents(memory, result.workflow.loopRunId!)).toEqual([]);
    await writeFile(workflowRuntimeDecisionEvidencePath(memory, result.workflow.loopRunId!), "{not-json}\n", "utf8");
    expect(await readWorkflowRuntimeDecisionEvidence(memory, result.workflow.loopRunId!)).toEqual([]);
  });

  it("treats malformed legacy loop metadata as unreadable compatibility evidence", async () => {
    const memory = await resolveProjectMemory(project);
    const malformedPath = mainAgentLoopRunPath(memory, "malformed-loop");
    await mkdir(dirname(malformedPath), { recursive: true });
    await writeFile(malformedPath, "{not-json}\n", "utf8");

    expect(await readMainAgentLoopRun(memory, "malformed-loop")).toBeNull();
  });
  });
});

