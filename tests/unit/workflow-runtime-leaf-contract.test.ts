import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  recordWorkflowRuntimeExecutionStep,
  type WorkflowRuntimeDecision,
  type WorkflowRuntimeExecutionState,
} from "../../src/workflow-runtime/execution-contract.js";
import type { ManagedProject, TaskRun, WorkerLease } from "../../src/types/index.js";
import type { ProjectExecutionRuntimePort } from "../../src/project-runtime/execution-ports.js";
import type { SkillNativeTaskRunStageContext } from "../../src/workflow-runtime/taskrun-stage.js";
import type { WorkflowLeafExecutionServices } from "../../src/workflow-runtime/leaf-execution.js";
import {
  prepareSkillNativeWorkbenchFixture,
  writeSkillNativeAcceptedSpecAndTasks,
  type SkillNativeWorkbenchFixture,
} from "../helpers/skill-native-workbench-fixture.js";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";

type MockLeafInput = {
  orchestration: WorkflowRuntimeExecutionState;
  decision: Extract<WorkflowRuntimeDecision, { kind: "delegate-role" }>;
};

const controls = vi.hoisted(() => ({
  reworkOutcome: "completed" as "completed" | "failed",
  validatorOutcomes: [] as Array<"completed" | "failed">,
  auditorOutcomes: [] as Array<"completed" | "failed">,
  taskRuns: new Map<string, TaskRun>(),
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

vi.mock("../../src/task-run/manager.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/task-run/manager.js")>();
  return {
  ...actual,
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
  retryTaskRunFromRuntime: vi.fn(async (
    _runtime: unknown,
    _changeStatus: unknown,
    options: { taskRunId: string; roleId?: string },
  ) => {
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
  };
});

import {
  readMainAgentLoopEvents,
  readMainAgentLoopRun,
  mainAgentLoopRunPath,
  type MainAgentLoopEntrypoint,
  type MainAgentLoopRun,
} from "../../src/main-agent-orchestration/index.js";
import { runPrFeedbackReworkWorkflow, runSourceRefreshReworkWorkflow, runStartedTaskRunStage } from "../../src/workflow-runtime/code-workflow.js";
import {
  readWorkflowRuntimeDecisionEvidence,
  readWorkflowRuntimeEvidenceEvents,
  readWorkflowRuntimeEvidenceRun,
  workflowRuntimeDecisionEvidencePath,
  workflowRuntimeEvidenceEventsPath,
} from "../../src/workflow-runtime/evidence-journal.js";
import {
  runAuditorLeafStage,
  runCoderLeafStage,
  runReworkCoderLeafStage,
  runValidatorLeafStage,
} from "../../src/workflow-runtime/leaf-execution.js";

let project: ManagedProject;
let fixture: SkillNativeWorkbenchFixture;
const publishedScopes = new Map<string, SkillNativeTaskRunStageContext>();

async function writeMainAgentLoopRun(
  memory: ProjectExecutionRuntimePort,
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

async function skillNativeScope(changeId: string): Promise<SkillNativeTaskRunStageContext> {
  const existing = publishedScopes.get(changeId);
  if (existing) return existing;
  const topic = await createConversationChangeFixture(project, { title: changeId });
  if (topic.changeId !== changeId) {
    throw new Error(`Fixture Change identity drifted: expected ${changeId}, received ${topic.changeId}.`);
  }
  const prepared = await writeSkillNativeAcceptedSpecAndTasks(fixture, changeId);
  const leafServices = {
    startCode: vi.fn(),
    startValidation: vi.fn(),
    startAudit: vi.fn(),
  } as unknown as WorkflowLeafExecutionServices;
  const scope = {
    runtime: prepared.runtime,
    changeStatus: prepared.harness.changeStatus,
    leafServices,
  };
  publishedScopes.set(changeId, scope);
  return scope;
}

describe("workflow runtime leaf contract", () => {
  beforeEach(async () => {
    controls.reworkOutcome = "completed";
    controls.validatorOutcomes = [];
    controls.auditorOutcomes = [];
    const projectRoot = await mkdtemp(join(tmpdir(), "aho-main-agent-loop-"));
    project = {
      id: "project",
      name: "project",
      path: projectRoot,
      addedAt: "2026-06-30T00:00:00.000Z",
      lastSeenAt: "2026-06-30T00:00:00.000Z",
    };
    fixture = await prepareSkillNativeWorkbenchFixture({ project });
    publishedScopes.clear();
    controls.taskRuns.clear();
    vi.clearAllMocks();
  });

  afterEach(async () => {
    fixture.restoreEnvironment();
    await rm(project.path, { recursive: true, force: true });
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
      skillNative: await skillNativeScope(initialTaskRun.changeId),
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
    const memory = fixture.runtime;
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
    const memory = fixture.runtime;
    const parent = await writeMainAgentLoopRun(memory, {
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
      skillNative: await skillNativeScope(initialTaskRun.changeId),
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
      skillNative: await skillNativeScope(priorRetry.changeId),
    });

    expect(runCoderLeafStage).toHaveBeenCalledTimes(1);
    expect(runReworkCoderLeafStage).not.toHaveBeenCalled();
    expect(runValidatorLeafStage).toHaveBeenCalledTimes(1);
    expect(runAuditorLeafStage).not.toHaveBeenCalled();
    expect(result.taskRun).toMatchObject({ id: "task-run-retry", attempt: 2, status: "blocked" });
    expect(result.autoRework).toBeUndefined();
    expect([...controls.taskRuns.keys()]).toEqual(["task-run-retry"]);
    const workflow = result.workflow as { loopRunId?: string };
    const memory = fixture.runtime;
    const events = await readWorkflowRuntimeEvidenceEvents(memory, workflow.loopRunId!);
    expect(events.filter((event) => event.roleId === "rework-coder")).toHaveLength(0);
    expect(events.filter((event) => event.type === "runtime.stopped")).toHaveLength(1);
  });

  it("does not nest automatic rework for source-refresh rework entrypoints", async () => {
    controls.validatorOutcomes = ["failed"];
    await skillNativeScope("change-source-refresh");

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
    const memory = fixture.runtime;
    const events = await readWorkflowRuntimeEvidenceEvents(memory, result.loopRunId!);
    const decisions = await readWorkflowRuntimeDecisionEvidence(memory, result.loopRunId!);
    expect(events.filter((event) => event.roleId === "rework-coder" && event.type === "leaf.started")).toHaveLength(1);
    expect(decisions.filter((decision) => decision.decision.roleId === "rework-coder")).toHaveLength(1);
    expect(events.filter((event) => event.type === "runtime.stopped")).toHaveLength(1);
  });

  it("runs source-refresh rework through rework, validation, and audit", async () => {
    await skillNativeScope("change-source-refresh-success");
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
    const memory = fixture.runtime;
    const events = await readWorkflowRuntimeEvidenceEvents(memory, result.loopRunId);
    const decisions = await readWorkflowRuntimeDecisionEvidence(memory, result.loopRunId);
    expect(events.filter((event) => event.type === "runtime.completed")).toHaveLength(1);
    expect(decisions.at(-1)?.decision.kind).toBe("completed");
  });

  it("stops source-refresh rework at audit failure without apply or nested rework", async () => {
    controls.auditorOutcomes = ["failed"];
    await skillNativeScope("change-source-refresh-audit");

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
    const memory = fixture.runtime;
    const decisions = await readWorkflowRuntimeDecisionEvidence(memory, result.loopRunId);
    expect(decisions.at(-1)?.decision.kind).toBe("needs-user-input");
    expect(decisions.filter((decision) => decision.decision.roleId === "rework-coder")).toHaveLength(1);
  });

  it("fails source-refresh rework before validation when rework-coder cannot produce code", async () => {
    controls.reworkOutcome = "failed";
    await skillNativeScope("change-source-refresh-code-failure");

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
    const memory = fixture.runtime;
    const decisions = await readWorkflowRuntimeDecisionEvidence(memory, result.loopRunId);
    expect(decisions.at(-1)?.decision.kind).toBe("failed");
  });

  it("runs PR feedback rework through rework, validation, and audit", async () => {
    await skillNativeScope("change-pr-feedback-success");
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
    const memory = fixture.runtime;
    const events = await readWorkflowRuntimeEvidenceEvents(memory, result.loopRunId);
    const decisions = await readWorkflowRuntimeDecisionEvidence(memory, result.loopRunId);
    expect(events.filter((event) => event.type === "runtime.completed")).toHaveLength(1);
    expect(decisions.at(-1)?.decision.kind).toBe("completed");
  });

  it("stops PR feedback rework at validation failure without nested rework or audit", async () => {
    controls.validatorOutcomes = ["failed"];
    await skillNativeScope("change-pr-feedback-validation");

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
    const memory = fixture.runtime;
    const decisions = await readWorkflowRuntimeDecisionEvidence(memory, result.loopRunId);
    expect(decisions.filter((decision) => decision.entrypoint === "feedback-rework" && decision.decision.roleId === "rework-coder")).toHaveLength(1);
    expect(decisions.at(-1)?.decision.kind).toBe("needs-user-input");
  });

  it("fails PR feedback rework before validation when rework-coder cannot produce code", async () => {
    controls.reworkOutcome = "failed";
    await skillNativeScope("change-pr-feedback-code-failure");

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
    const memory = fixture.runtime;
    const decisions = await readWorkflowRuntimeDecisionEvidence(memory, result.loopRunId);
    expect(decisions.at(-1)?.decision.kind).toBe("failed");
  });

  it("fails closed when runtime evidence is missing or malformed", async () => {
    const malformedTaskRun = taskRun({ id: "task-run-malformed", changeId: "change-malformed" });
    controls.taskRuns.set(malformedTaskRun.id, malformedTaskRun);
    const result = await runStartedTaskRunStage({
      project,
      started: { taskRun: malformedTaskRun, lease: workerLease(malformedTaskRun.id) },
      skillNative: await skillNativeScope(malformedTaskRun.changeId),
    });
    const memory = fixture.runtime;

    expect(await readWorkflowRuntimeEvidenceRun(memory, "missing-runtime")).toBeNull();
    expect(await readWorkflowRuntimeEvidenceEvents(memory, "missing-runtime")).toEqual([]);
    expect(await readWorkflowRuntimeDecisionEvidence(memory, "missing-runtime")).toEqual([]);

    await writeFile(workflowRuntimeEvidenceEventsPath(memory, result.workflow.loopRunId!), "{not-json}\n", "utf8");
    expect(await readWorkflowRuntimeEvidenceEvents(memory, result.workflow.loopRunId!)).toEqual([]);
    await writeFile(workflowRuntimeDecisionEvidencePath(memory, result.workflow.loopRunId!), "{not-json}\n", "utf8");
    expect(await readWorkflowRuntimeDecisionEvidence(memory, result.workflow.loopRunId!)).toEqual([]);
  });

  it("treats malformed loop metadata as unreadable evidence", async () => {
    const memory = fixture.runtime;
    const malformedPath = mainAgentLoopRunPath(memory, "malformed-loop");
    await mkdir(dirname(malformedPath), { recursive: true });
    await writeFile(malformedPath, "{not-json}\n", "utf8");

    expect(await readMainAgentLoopRun(memory, "malformed-loop")).toBeNull();
  });
  });
});

