import {
  createMainAgentOrchestrationState,
  decideNextMainAgentOrchestration,
  recordMainAgentOrchestrationStep,
  type MainAgentOrchestrationDecision,
  type MainAgentOrchestrationState,
} from "../agent-task/orchestration-engine.js";
import type { CodeExecutionGateOptions } from "../code/manager.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import {
  finishTaskRunFromWorkflowResult,
  markTaskRunStarted,
  retryTaskRun,
} from "../task-run/manager.js";
import type { ManagedProject, TaskRun, WorkerLease } from "../types/index.js";
import type { WorkbenchLiveSink } from "../workbench/types.js";
import { emitAssistantEvent } from "../workflow-runtime/kernel/live-events.js";
import { createMainAgentLoopRunId, finishMainAgentLoopRun } from "./loop-evidence.js";
import { buildMainAgentTaskRunReworkPrompt, shouldRunTaskRunRework } from "./rework-policy.js";
import { runMainAgentTaskRunAttempt } from "./runner.js";

export interface MainAgentStartedTaskRun {
  taskRun: TaskRun;
  lease: WorkerLease | null;
}

export interface MainAgentTaskRunLifecycleResult {
  taskRun: TaskRun;
  lease: WorkerLease | null;
  workflow: unknown;
  autoRework?: {
    previousTaskRun: TaskRun;
    result: MainAgentTaskRunLifecycleResult;
  };
}

export interface MainAgentTaskRunLifecycleOptions {
  project: ManagedProject;
  started: MainAgentStartedTaskRun;
  prompt?: string;
  live?: WorkbenchLiveSink;
  executionGate?: CodeExecutionGateOptions;
  onRetryTaskRunStarted?: (started: MainAgentStartedTaskRun) => Promise<void>;
}

export async function runMainAgentTaskRunLifecycle(input: MainAgentTaskRunLifecycleOptions): Promise<MainAgentTaskRunLifecycleResult> {
  const loopRunId = createMainAgentLoopRunId(input.started.taskRun.changeId);
  const initial = await runStartedTaskRunAttempt({
    ...input,
    started: input.started,
    loopRunId,
    initialRole: "coder-agent",
    orchestrationState: createMainAgentOrchestrationState({ changeId: input.started.taskRun.changeId }),
    prompt: input.prompt,
  });
  const rework = await maybeRunTaskRunRework({
    project: input.project,
    previousTaskRun: initial.taskRun,
    prompt: input.prompt,
    live: input.live,
    executionGate: input.executionGate,
    loopRunId,
    orchestrationState: extractOrchestrationState(initial.workflow, initial.taskRun),
    onRetryTaskRunStarted: input.onRetryTaskRunStarted,
  });
  if (rework) return { ...rework, lease: input.started.lease, autoRework: { previousTaskRun: initial.taskRun, result: rework } };
  await finishLoopForTaskRun(input.project, loopRunId, initial.taskRun, initial.workflow);
  return initial;
}

export async function runMainAgentTaskRunReworkFromFinished(input: {
  project: ManagedProject;
  taskRun: TaskRun;
  workflow: unknown;
  prompt?: string;
  live?: WorkbenchLiveSink;
  executionGate?: CodeExecutionGateOptions;
  onRetryTaskRunStarted?: (started: MainAgentStartedTaskRun) => Promise<void>;
}): Promise<MainAgentTaskRunLifecycleResult> {
  const loopRunId = createMainAgentLoopRunId(input.taskRun.changeId);
  const orchestrationState = synthesizeOrchestrationFromFinishedWorkflow(input.taskRun, input.workflow);
  const rework = await maybeRunTaskRunRework({
    project: input.project,
    previousTaskRun: input.taskRun,
    prompt: input.prompt,
    live: input.live,
    executionGate: input.executionGate,
    loopRunId,
    orchestrationState,
    onRetryTaskRunStarted: input.onRetryTaskRunStarted,
  });
  if (rework) return { taskRun: rework.taskRun, lease: rework.lease, workflow: rework.workflow, autoRework: { previousTaskRun: input.taskRun, result: rework } };
  await finishLoopForTaskRun(input.project, loopRunId, input.taskRun, input.workflow);
  return { taskRun: input.taskRun, lease: null, workflow: input.workflow };
}

async function runStartedTaskRunAttempt(input: MainAgentTaskRunLifecycleOptions & {
  started: MainAgentStartedTaskRun;
  loopRunId: string;
  initialRole: "coder-agent" | "rework-coder";
  orchestrationState: MainAgentOrchestrationState;
  initialDecision?: Extract<MainAgentOrchestrationDecision, { kind: "delegate-role" }>;
}): Promise<MainAgentTaskRunLifecycleResult> {
  emitAssistantEvent(input.live, {
    runId: input.started.taskRun.id,
    kind: "status",
    phase: "claimed",
    title: "TaskRun claimed",
    summary: `${input.started.taskRun.taskId} attempt ${input.started.taskRun.attempt} was claimed by ${input.started.lease?.workerId ?? "local worker"}.`,
  });
  const memory = await resolveProjectMemory(input.project);
  await markTaskRunStarted(memory, input.started.taskRun.id, { changeId: input.started.taskRun.changeId, taskId: input.started.taskRun.taskId });
  emitAssistantEvent(input.live, {
    runId: input.started.taskRun.id,
    kind: "status",
    phase: "running",
    title: "TaskRun running",
    summary: `${input.started.taskRun.taskId} attempt ${input.started.taskRun.attempt} started the main-agent bounded role workflow.`,
  });
  const workflow = await runMainAgentTaskRunAttempt({
    project: input.project,
    changeId: input.started.taskRun.changeId,
    prompt: input.prompt,
    live: input.live,
    taskIds: [input.started.taskRun.taskId],
    taskRunId: input.started.taskRun.id,
    executionGate: input.executionGate,
    loopRunId: input.loopRunId,
    finalizeLoop: false,
    initialRole: input.initialRole,
    orchestrationState: input.orchestrationState,
    initialDecision: input.initialDecision,
  });
  const taskRun = await finishTaskRunFromWorkflowResult(memory, input.started.taskRun.id, workflow, {
    changeId: input.started.taskRun.changeId,
    taskId: input.started.taskRun.taskId,
  });
  return { taskRun, lease: input.started.lease, workflow };
}

async function maybeRunTaskRunRework(input: {
  project: ManagedProject;
  previousTaskRun: TaskRun;
  prompt?: string;
  live?: WorkbenchLiveSink;
  executionGate?: CodeExecutionGateOptions;
  loopRunId: string;
  orchestrationState: MainAgentOrchestrationState;
  onRetryTaskRunStarted?: (started: MainAgentStartedTaskRun) => Promise<void>;
}): Promise<MainAgentTaskRunLifecycleResult | null> {
  const decision = decideNextMainAgentOrchestration(input.orchestrationState);
  const reworkCheck = { taskRun: input.previousTaskRun, decision };
  if (!shouldRunTaskRunRework(reworkCheck)) return null;
  const reworkDecision = reworkCheck.decision;
  emitAssistantEvent(input.live, {
    runId: input.previousTaskRun.id,
    kind: "status",
    phase: "auto-rework",
    title: "正在根据验证/审查结果自动修改",
    summary: `${reworkDecision.reason} AHO is handing the evidence back to rework-coder once.`,
  });
  const retry = await retryTaskRun(input.project, {
    changeId: input.previousTaskRun.changeId,
    taskRunId: input.previousTaskRun.id,
    roleId: "rework-coder",
  });
  const retryStarted: MainAgentStartedTaskRun = { taskRun: retry.taskRun, lease: retry.lease };
  await input.onRetryTaskRunStarted?.(retryStarted);
  const rework = await runStartedTaskRunAttempt({
    project: input.project,
    started: retryStarted,
    prompt: buildMainAgentTaskRunReworkPrompt(input.prompt),
    live: input.live,
    executionGate: input.executionGate,
    loopRunId: input.loopRunId,
    initialRole: "rework-coder",
    orchestrationState: input.orchestrationState,
    initialDecision: reworkDecision,
  });
  await finishLoopForTaskRun(input.project, input.loopRunId, rework.taskRun, rework.workflow);
  return rework;
}

async function finishLoopForTaskRun(project: ManagedProject, loopRunId: string, taskRun: TaskRun, workflow: unknown): Promise<void> {
  const memory = await resolveProjectMemory(project);
  await finishMainAgentLoopRun(memory, loopRunId, {
    status: taskRun.status === "completed" ? "completed" : "stopped",
    summary: taskRun.status === "completed" ? "TaskRun main-agent lifecycle completed." : `TaskRun main-agent lifecycle stopped with status ${taskRun.status}.`,
    stoppedAt: stoppedAtFromWorkflow(workflow),
  });
}

function extractOrchestrationState(workflow: unknown, taskRun: TaskRun): MainAgentOrchestrationState {
  if (isRecord(workflow) && isRecord(workflow.orchestration) && Array.isArray(workflow.orchestration.steps)) {
    return workflow.orchestration as unknown as MainAgentOrchestrationState;
  }
  return synthesizeOrchestrationFromFinishedWorkflow(taskRun, workflow);
}

function synthesizeOrchestrationFromFinishedWorkflow(taskRun: TaskRun, workflow: unknown): MainAgentOrchestrationState {
  const stoppedAt = stoppedAtFromWorkflow(workflow);
  const state = createMainAgentOrchestrationState({ changeId: taskRun.changeId });
  if (stoppedAt !== "validation" && stoppedAt !== "audit") return state;
  return recordMainAgentOrchestrationStep(state, {
    roleId: stoppedAt === "validation" ? "validator" : "auditor-agent",
    status: "failed",
    inputArtifacts: [],
    outputArtifacts: collectWorkflowArtifactRefs(workflow),
    failureClassification: stoppedAt === "validation" ? "validation-failure" : "audit-failure",
    stoppedAt,
    summary: stoppedAt === "validation" ? "Resumed validation failed." : "Resumed audit did not approve.",
  });
}

function stoppedAtFromWorkflow(workflow: unknown): "boundary" | "code" | "validation" | "audit" | null {
  if (isRecord(workflow) && typeof workflow.stoppedAt === "string") {
    if (workflow.stoppedAt === "boundary" || workflow.stoppedAt === "code" || workflow.stoppedAt === "validation" || workflow.stoppedAt === "audit") return workflow.stoppedAt;
  }
  return null;
}

function collectWorkflowArtifactRefs(workflow: unknown): string[] {
  const refs = [
    readNestedString(workflow, "code", "run", "artifacts", "directory"),
    readNestedString(workflow, "validation", "run", "artifacts", "validation"),
    readNestedString(workflow, "audit", "run", "artifacts", "audit"),
  ];
  return refs.filter((ref): ref is string => Boolean(ref));
}

function readNestedString(value: unknown, ...keys: string[]): string | undefined {
  let current = value;
  for (const key of keys) {
    if (!isRecord(current)) return undefined;
    current = current[key];
  }
  return typeof current === "string" ? current : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
