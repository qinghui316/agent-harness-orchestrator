import {
  createWorkflowRuntimeExecutionState,
  type WorkflowRuntimeDecision,
  type WorkflowRuntimeRole,
  type WorkflowRuntimeExecutionState,
} from "./execution-contract.js";
import { listAuditResults } from "../audit/artifacts.js";
import { startAuditRun } from "../audit/manager.js";
import type { CodeExecutionGateOptions } from "../code/manager.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { listRuns } from "../run/manager.js";
import { listTaskQueueItems } from "../task-queue/manager.js";
import {
  finishTaskRunFromWorkflowResult,
  listTaskRuns,
  markTaskRunStarted,
  retryTaskRun,
  startTaskRun,
} from "../task-run/manager.js";
import type {
  ManagedProject,
  ResolvedMemory,
  RunMetadata,
  StageResumeVerdict,
  AuditResult,
  TaskQueueItem,
  TaskRun,
  ValidationResult,
  WorkerLease,
} from "../types/index.js";
import { listValidationResults } from "../validation/artifacts.js";
import { startValidationRun } from "../validation/manager.js";
import { deriveStageResumeVerdict } from "../workflow-run/manager.js";
import {
  runAuditorLeafStage,
  runCoderLeafStage,
  runReworkCoderLeafStage,
  runValidatorLeafStage,
  type AuditLeafRun,
  type CodeLeafRun,
  type WorkflowRuntimeAuditorLeafResult,
  type WorkflowRuntimeCoderLeafResult,
  type WorkflowRuntimeValidatorLeafResult,
  type ValidationLeafRun,
} from "./leaf-execution.js";
import {
  appendWorkflowRuntimeEvidenceEvent,
  createWorkflowRuntimeEvidenceRunId,
  ensureWorkflowRuntimeEvidenceRun,
  finishWorkflowRuntimeEvidenceRun,
  type WorkflowRuntimeEvidenceRun,
} from "./evidence-journal.js";
import {
  emitAssistantEvent,
  emitAuditAssistantEvent,
  emitValidationAssistantEvents,
  type WorkflowRuntimeLiveSink,
} from "./kernel/live-events.js";
import { compactArtifactRefs, isRecord, isTaskRunLike, requireSingleTaskId, requireTaskRunId } from "./kernel/runtime-guards.js";

export interface WorkflowRuntimeActionRequest {
  taskIds?: string[];
  taskRunId?: string;
  prompt?: string;
}

const TASKRUN_REWORK_BUDGET = 1;

export interface RuntimeStartedTaskRun {
  taskRun: TaskRun;
  lease: WorkerLease | null;
}

export interface RuntimeTaskRunStageResult {
  taskRun: TaskRun;
  lease: WorkerLease | null;
  workflow: RuntimeTaskRunWorkflowResult;
  autoRework?: {
    previousTaskRun: TaskRun;
    result: RuntimeTaskRunStageResult;
  };
}

export interface RuntimeTaskRunStageOptions {
  project: ManagedProject;
  started: RuntimeStartedTaskRun;
  prompt?: string;
  live?: WorkflowRuntimeLiveSink;
  executionGate?: CodeExecutionGateOptions;
  loopRunId?: string;
  ownsLoopFinalization?: boolean;
  initialRole?: "coder-agent" | "rework-coder";
  orchestrationState?: WorkflowRuntimeExecutionState;
  initialDecision?: DelegateDecision<"coder-agent" | "rework-coder">;
  onRetryTaskRunStarted?: (started: RuntimeStartedTaskRun) => Promise<void>;
}

export type RuntimeTaskRunWorkflowResult = RuntimeTaskRunAttemptWorkflowResult & {
  status?: "failed" | "needs-user-input";
  error?: string;
  orchestration: WorkflowRuntimeExecutionState;
  loopRunId?: string;
};

type DelegateDecision<RoleId extends WorkflowRuntimeRole> =
  Extract<WorkflowRuntimeDecision, { kind: "delegate-role" }> & { roleId: RoleId };

export async function runTaskRunStageAction(
  project: ManagedProject,
  changeId: string,
  request: WorkflowRuntimeActionRequest,
  live: WorkflowRuntimeLiveSink | undefined,
  mode: "start" | "retry",
): Promise<RuntimeTaskRunStageResult> {
  const started = mode === "start"
    ? await startTaskRun(project, { changeId, taskId: requireSingleTaskId(request.taskIds) })
    : await retryTaskRun(project, { changeId, taskRunId: requireTaskRunId(request.taskRunId) });
  return runStartedTaskRunStage({
    project,
    started,
    prompt: request.prompt,
    live,
  });
}

export async function runStartedTaskRunStage(input: RuntimeTaskRunStageOptions): Promise<RuntimeTaskRunStageResult> {
  const loopRunId = input.loopRunId ?? createWorkflowRuntimeEvidenceRunId(input.started.taskRun.changeId);
  const ownsLoopFinalization = input.ownsLoopFinalization ?? input.loopRunId === undefined;
  const initialRole = input.initialRole ?? roleFromTaskRun(input.started.taskRun);
  const initial = await runOneStartedTaskRunAttempt({
    ...input,
    loopRunId,
    ownsLoopFinalization: false,
    initialRole,
    orchestrationState: input.orchestrationState ?? createWorkflowRuntimeExecutionState({ changeId: input.started.taskRun.changeId }),
    initialDecision: input.initialDecision ?? codeDecision(initialRole, input.started.taskRun),
  });
  const rework = await maybeRunTaskRunRework({
    project: input.project,
    previousTaskRun: initial.taskRun,
    workflow: initial.workflow,
    prompt: input.prompt,
    live: input.live,
    executionGate: input.executionGate,
    loopRunId,
    orchestrationState: initial.workflow.orchestration,
    onRetryTaskRunStarted: input.onRetryTaskRunStarted,
  });
  if (rework) {
    if (ownsLoopFinalization) await finishLoopForTaskRun(input.project, loopRunId, rework.taskRun, rework.workflow);
    return { ...rework, autoRework: { previousTaskRun: initial.taskRun, result: rework } };
  }
  if (ownsLoopFinalization) await finishLoopForTaskRun(input.project, loopRunId, initial.taskRun, initial.workflow);
  return initial;
}

export async function findTaskRunStageResumeCandidate(
  memory: ResolvedMemory,
  changeId: string,
  item: TaskQueueItem,
): Promise<{ taskRun: TaskRun; verdict: StageResumeVerdict } | null> {
  const taskRuns = await listTaskRuns(memory, changeId);
  const queueItems = await listTaskQueueItems(memory, changeId);
  const candidates = taskRuns.filter((run) =>
    run.taskId.toUpperCase() === item.taskId.toUpperCase()
    && !["queued", "claimed", "running"].includes(run.status)
    && (!item.taskRunId || run.id === item.taskRunId)
    && !queueItems.some((queueItem) => queueItem.queueRunId !== item.queueRunId && queueItem.taskRunId === run.id)
  );
  for (const taskRun of candidates) {
    const verdict = await deriveStageResumeVerdict(memory, changeId, taskRun);
    if (verdict.kind !== "start-coder") return { taskRun, verdict };
  }
  return null;
}

export async function runResumedTaskRunStage(input: {
  project: ManagedProject;
  memory: ResolvedMemory;
  taskRun: TaskRun;
  verdict: StageResumeVerdict;
  prompt?: string;
  live?: WorkflowRuntimeLiveSink;
  executionGate?: CodeExecutionGateOptions;
  onRetryTaskRunStarted?: (started: RuntimeStartedTaskRun) => Promise<void>;
}): Promise<RuntimeTaskRunStageResult> {
  const resumed = await executeResumedTaskRunStage(input);
  const taskRun = isRecord(resumed) && isTaskRunLike(resumed.taskRun) ? resumed.taskRun : null;
  if (!taskRun) throw new Error(`TaskRun resume ${input.taskRun.id} did not return a TaskRun result.`);
  const workflow = isRuntimeTaskRunWorkflowResult(resumed.workflow) ? resumed.workflow : workflowFromUnknown(resumed.workflow, input.taskRun.changeId);
  const rework = await maybeRunTaskRunRework({
    project: input.project,
    previousTaskRun: taskRun,
    workflow,
    prompt: input.prompt,
    live: input.live,
    executionGate: input.executionGate,
    loopRunId: createWorkflowRuntimeEvidenceRunId(taskRun.changeId),
    orchestrationState: workflow.orchestration,
    onRetryTaskRunStarted: input.onRetryTaskRunStarted,
  });
  if (rework) return { taskRun: rework.taskRun, lease: rework.lease, workflow: rework.workflow, autoRework: { previousTaskRun: taskRun, result: rework } };
  return { taskRun, lease: null, workflow };
}

export async function assertTaskRunResumeEvidenceScope(memory: ResolvedMemory, changeId: string, item: TaskQueueItem, verdict: StageResumeVerdict): Promise<void> {
  if (verdict.taskId && verdict.taskId.toUpperCase() !== item.taskId.toUpperCase()) {
    throw new Error(`TaskQueue resume evidence is scoped to ${verdict.taskId}, not ${item.taskId}.`);
  }
  const runs = await listRuns(memory);
  const coderRun = verdict.runId ? runs.find((run) => run.id === verdict.runId) : undefined;
  if (coderRun) {
    if (coderRun.changeId !== changeId) throw new Error("TaskQueue resume coder evidence belongs to another Change.");
    if (!coderRun.taskIds?.some((taskId) => taskId.toUpperCase() === item.taskId.toUpperCase())) {
      throw new Error("TaskQueue resume coder evidence does not include the queue item task.");
    }
  }
  const validations = await listValidationResults(memory, changeId);
  if (verdict.validationId && !validations.some((validation) => validation.id === verdict.validationId)) {
    throw new Error("TaskQueue resume validation evidence is stale or missing.");
  }
  const audits = await listAuditResults(memory, changeId);
  if (verdict.auditId && !audits.some((audit) => audit.id === verdict.auditId)) {
    throw new Error("TaskQueue resume audit evidence is stale or missing.");
  }
}

async function runOneStartedTaskRunAttempt(input: RuntimeTaskRunStageOptions & {
  loopRunId: string;
  ownsLoopFinalization: boolean;
  initialRole: "coder-agent" | "rework-coder";
  orchestrationState: WorkflowRuntimeExecutionState;
  initialDecision: DelegateDecision<"coder-agent" | "rework-coder">;
}): Promise<RuntimeTaskRunStageResult> {
  const memory = await resolveProjectMemory(input.project);
  const { run: loopRun, created } = await ensureWorkflowRuntimeEvidenceRun(memory, {
    runtimeRunId: input.loopRunId,
    changeId: input.started.taskRun.changeId,
    projectId: input.project.id,
    entrypoint: "task-run",
  });
  if (created) {
    await appendWorkflowRuntimeEvidenceEvent(memory, loopRun, {
      type: "runtime.started",
      entrypoint: "task-run",
      summary: "TaskRun runtime stage loop started.",
    });
  }
  emitAssistantEvent(input.live, {
    runId: input.started.taskRun.id,
    kind: "status",
    phase: "claimed",
    title: "TaskRun claimed",
    summary: `${input.started.taskRun.taskId} attempt ${input.started.taskRun.attempt} was claimed by ${input.started.lease?.workerId ?? "local worker"}.`,
  });
  await markTaskRunStarted(memory, input.started.taskRun.id, { changeId: input.started.taskRun.changeId, taskId: input.started.taskRun.taskId });
  emitAssistantEvent(input.live, {
    runId: input.started.taskRun.id,
    kind: "status",
    phase: "running",
    title: "TaskRun running",
    summary: `${input.started.taskRun.taskId} attempt ${input.started.taskRun.attempt} started the runtime-owned TaskRun stage workflow.`,
  });
  const workflow = await runTaskRunAttempt({
    project: input.project,
    memory,
    changeId: input.started.taskRun.changeId,
    taskRun: input.started.taskRun,
    prompt: input.prompt,
    live: input.live,
    taskIds: [input.started.taskRun.taskId],
    executionGate: input.executionGate,
    loopRun,
    initialRole: input.initialRole,
    orchestration: input.orchestrationState,
    initialDecision: input.initialDecision,
  });
  const taskRun = await finishTaskRunFromWorkflowResult(memory, input.started.taskRun.id, workflow, {
    changeId: input.started.taskRun.changeId,
    taskId: input.started.taskRun.taskId,
  });
  return { taskRun, lease: input.started.lease, workflow };
}

async function runTaskRunAttempt(input: {
  project: ManagedProject;
  memory: ResolvedMemory;
  changeId: string;
  taskRun: TaskRun;
  prompt?: string;
  live?: WorkflowRuntimeLiveSink;
  taskIds: string[];
  executionGate?: CodeExecutionGateOptions;
  loopRun: WorkflowRuntimeEvidenceRun;
  initialRole: "coder-agent" | "rework-coder";
  orchestration: WorkflowRuntimeExecutionState;
  initialDecision: DelegateDecision<"coder-agent" | "rework-coder">;
}): Promise<RuntimeTaskRunWorkflowResult> {
  let orchestration = input.orchestration;
  const codeResult = await runCodeLeaf(input, input.initialRole, input.initialDecision, orchestration, 0);
  orchestration = codeResult.orchestration;
  if (codeResult.status === "failed" || !codeResult.code) {
    return {
      code: codeResult.code,
      boundaryAudit: codeResult.boundaryAudit,
      status: "failed",
      error: codeResult.error,
      stoppedAt: codeResult.stoppedAt ?? "code",
      orchestration,
      loopRunId: input.loopRun.id,
    };
  }

  const validationDecision = validatorDecision(compactArtifactRefs(codeResult.code.run.artifacts.directory, codeResult.code.run.artifacts.implementation));
  const validationResult = await runValidationLeaf(input, validationDecision, codeResult.code, orchestration, 1);
  orchestration = validationResult.orchestration;
  if (validationResult.status === "failed" || !validationResult.validation) {
    return {
      code: codeResult.code,
      validation: validationResult.validation,
      status: validationResult.validation ? undefined : "failed",
      error: validationResult.error,
      stoppedAt: "validation",
      orchestration,
      loopRunId: input.loopRun.id,
    };
  }

  const auditDecision = auditorDecision(compactArtifactRefs(validationResult.validation.run.artifacts.validation, validationResult.validation.run.artifacts.stdout));
  const auditResult = await runAuditLeaf(input, auditDecision, codeResult.code, validationResult.validation, orchestration, 2);
  orchestration = auditResult.orchestration;
  if (auditResult.status === "failed") {
    return {
      code: codeResult.code,
      validation: validationResult.validation,
      audit: auditResult.audit,
      stoppedAt: "audit",
      orchestration,
      loopRunId: input.loopRun.id,
    };
  }

  return {
    code: codeResult.code,
    validation: validationResult.validation,
    audit: auditResult.audit,
    stoppedAt: null,
    orchestration,
    loopRunId: input.loopRun.id,
  };
}

async function runCodeLeaf(
  input: Parameters<typeof runTaskRunAttempt>[0],
  roleId: "coder-agent" | "rework-coder",
  decision: DelegateDecision<"coder-agent" | "rework-coder">,
  orchestration: WorkflowRuntimeExecutionState,
  stepIndex: number,
): Promise<WorkflowRuntimeCoderLeafResult> {
  await appendLeafStarted(input.memory, input.loopRun, stepIndex, roleId, decision);
  const result = roleId === "rework-coder"
    ? await runReworkCoderLeafStage({
      project: input.project,
      memory: input.memory,
      changeId: input.changeId,
      prompt: input.prompt,
      live: input.live,
      taskIds: input.taskIds,
      taskRunId: input.taskRun.id,
      orchestration,
      decision,
      executionGate: input.executionGate,
    })
    : await runCoderLeafStage({
      project: input.project,
      memory: input.memory,
      changeId: input.changeId,
      prompt: input.prompt,
      live: input.live,
      taskIds: input.taskIds,
      taskRunId: input.taskRun.id,
      roleId,
      orchestration,
      decision,
      executionGate: input.executionGate,
    });
  await appendLeafCompleted(input.memory, input.loopRun, stepIndex, roleId, result.status, result.stoppedAt, compactArtifactRefs(result.code?.run.artifacts.directory, result.code?.run.artifacts.implementation));
  return result;
}

async function runValidationLeaf(
  input: Parameters<typeof runTaskRunAttempt>[0],
  decision: DelegateDecision<"validator">,
  code: CodeLeafRun,
  orchestration: WorkflowRuntimeExecutionState,
  stepIndex: number,
): Promise<WorkflowRuntimeValidatorLeafResult> {
  await appendLeafStarted(input.memory, input.loopRun, stepIndex, "validator", decision);
  const result = await runValidatorLeafStage({
    project: input.project,
    memory: input.memory,
    changeId: input.changeId,
    live: input.live,
    orchestration,
    decision,
    code,
  });
  await appendLeafCompleted(input.memory, input.loopRun, stepIndex, "validator", result.status, result.stoppedAt, compactArtifactRefs(result.validation?.run.artifacts.validation, result.validation?.run.artifacts.stdout, result.validation?.run.artifacts.stderr));
  return result;
}

async function runAuditLeaf(
  input: Parameters<typeof runTaskRunAttempt>[0],
  decision: DelegateDecision<"auditor-agent">,
  code: CodeLeafRun,
  validation: ValidationLeafRun,
  orchestration: WorkflowRuntimeExecutionState,
  stepIndex: number,
): Promise<WorkflowRuntimeAuditorLeafResult> {
  await appendLeafStarted(input.memory, input.loopRun, stepIndex, "auditor-agent", decision);
  const result = await runAuditorLeafStage({
    project: input.project,
    memory: input.memory,
    changeId: input.changeId,
    live: input.live,
    orchestration,
    decision,
    code,
    validation,
  });
  await appendLeafCompleted(input.memory, input.loopRun, stepIndex, "auditor-agent", result.status, result.stoppedAt, compactArtifactRefs(result.audit?.audit.artifacts.audit, result.audit?.audit.artifacts.auditMarkdown, result.audit?.audit.artifacts.lastMessage));
  return result;
}

async function maybeRunTaskRunRework(input: {
  project: ManagedProject;
  previousTaskRun: TaskRun;
  workflow: RuntimeTaskRunWorkflowResult;
  prompt?: string;
  live?: WorkflowRuntimeLiveSink;
  executionGate?: CodeExecutionGateOptions;
  loopRunId: string;
  orchestrationState: WorkflowRuntimeExecutionState;
  onRetryTaskRunStarted?: (started: RuntimeStartedTaskRun) => Promise<void>;
}): Promise<RuntimeTaskRunStageResult | null> {
  if (!shouldRunRework(input.previousTaskRun, input.workflow)) return null;
  emitAssistantEvent(input.live, {
    runId: input.previousTaskRun.id,
    kind: "status",
    phase: "auto-rework",
    title: "正在根据验证/审查结果自动修改",
    summary: "Validation or audit failed; AHO is handing the evidence back to rework-coder once.",
  });
  const retry = await retryTaskRun(input.project, {
    changeId: input.previousTaskRun.changeId,
    taskRunId: input.previousTaskRun.id,
    roleId: "rework-coder",
  });
  const retryStarted: RuntimeStartedTaskRun = { taskRun: retry.taskRun, lease: retry.lease };
  await input.onRetryTaskRunStarted?.(retryStarted);
  return runOneStartedTaskRunAttempt({
    project: input.project,
    started: retryStarted,
    prompt: buildTaskRunReworkPrompt(input.prompt),
    live: input.live,
    executionGate: input.executionGate,
    loopRunId: input.loopRunId,
    ownsLoopFinalization: false,
    initialRole: "rework-coder",
    orchestrationState: input.orchestrationState,
    initialDecision: reworkDecision(reworkInputArtifacts(input.workflow), input.workflow.stoppedAt === "audit" ? "audit" : "validation"),
  });
}

function shouldRunRework(taskRun: TaskRun, workflow: RuntimeTaskRunWorkflowResult): boolean {
  if (taskRun.status !== "blocked" && taskRun.status !== "failed") return false;
  if (workflow.stoppedAt !== "validation" && workflow.stoppedAt !== "audit") return false;
  const officialReworkAttempt = Math.max(0, taskRun.attempt - 1);
  return officialReworkAttempt < TASKRUN_REWORK_BUDGET;
}

async function executeResumedTaskRunStage(input: {
  project: ManagedProject;
  memory: ResolvedMemory;
  taskRun: TaskRun;
  verdict: StageResumeVerdict;
  live?: WorkflowRuntimeLiveSink;
}): Promise<{ taskRun: TaskRun; workflow: RuntimeTaskRunWorkflowResult }> {
  const runs = await listRuns(input.memory);
  const coderRun = input.verdict.runId ? runs.find((run) => run.id === input.verdict.runId) : undefined;
  const validationEvidence = input.verdict.validationId
    ? (await listValidationResults(input.memory, input.taskRun.changeId)).find((validation) => validation.id === input.verdict.validationId)
    : undefined;
  const auditEvidence = input.verdict.auditId
    ? (await listAuditResults(input.memory, input.taskRun.changeId)).find((audit) => audit.id === input.verdict.auditId)
    : undefined;
  const existingValidation = validationEvidence ? validationRunFromEvidence(runs, validationEvidence) : undefined;
  const existingAudit = auditEvidence ? auditRunFromEvidence(runs, auditEvidence) : undefined;
  if (!coderRun || coderRun.status !== "completed" || !coderRun.worktree?.worktreeId) {
    const workflow = workflowFromUnknown({ stoppedAt: "code", code: { run: coderRun ?? { status: "failed" } } }, input.taskRun.changeId);
    const blocked = await finishTaskRunFromWorkflowResult(input.memory, input.taskRun.id, workflow, { changeId: input.taskRun.changeId, taskId: input.taskRun.taskId });
    return { taskRun: blocked, workflow };
  }

  if (input.verdict.kind === "completed") {
    const workflow = workflowFromUnknown({ stoppedAt: null, code: { run: coderRun }, validation: existingValidation, audit: existingAudit }, input.taskRun.changeId);
    const completed = await finishTaskRunFromWorkflowResult(input.memory, input.taskRun.id, workflow, { changeId: input.taskRun.changeId, taskId: input.taskRun.taskId });
    return { taskRun: completed, workflow };
  }

  if (input.verdict.kind === "continue-rework") {
    const workflow = workflowFromUnknown({ stoppedAt: input.verdict.auditId ? "audit" : "validation", code: { run: coderRun }, validation: existingValidation, audit: existingAudit }, input.taskRun.changeId);
    const blocked = await finishTaskRunFromWorkflowResult(input.memory, input.taskRun.id, workflow, { changeId: input.taskRun.changeId, taskId: input.taskRun.taskId });
    return { taskRun: blocked, workflow };
  }

  let validation: Awaited<ReturnType<typeof startValidationRun>> | undefined = existingValidation;
  if (input.verdict.kind === "continue-validation") {
    emitAssistantEvent(input.live, {
      runId: input.taskRun.id,
      kind: "status",
      phase: "validation-resume",
      title: "Validation running",
      summary: "Coder evidence already exists; AHO is resuming from validation.",
      artifactRef: coderRun.artifacts.directory,
    });
    validation = await startValidationRun(input.project, { changeId: input.taskRun.changeId, worktree: coderRun.worktree.worktreeId });
    emitValidationAssistantEvents(input.live, coderRun.id, validation);
    if (validation.validation.status !== "passed") {
      const workflow = workflowFromUnknown({ code: { run: coderRun }, validation, stoppedAt: "validation" }, input.taskRun.changeId);
      const blocked = await finishTaskRunFromWorkflowResult(input.memory, input.taskRun.id, workflow, { changeId: input.taskRun.changeId, taskId: input.taskRun.taskId });
      return { taskRun: blocked, workflow };
    }
  }

  emitAssistantEvent(input.live, {
    runId: input.taskRun.id,
    kind: "status",
    phase: "audit-resume",
    title: "Audit running",
    summary: "Validation evidence is available; AHO is resuming from audit.",
    artifactRef: validation?.run.artifacts.validation ?? input.verdict.evidenceRefs[0],
  });
  const audit = await startAuditRun(input.project, {
    changeId: input.taskRun.changeId,
    worktreeId: coderRun.worktree.worktreeId,
    prompt: "This audit resumed from WorkflowRun stage recovery after coder and validation evidence were already present.",
  });
  emitAuditAssistantEvent(input.live, coderRun.id, audit);
  const auditAccepted = audit.audit.status === "approved" || audit.audit.status === "approved-with-notes";
  const workflow = workflowFromUnknown({ code: { run: coderRun }, ...(validation ? { validation } : {}), audit, stoppedAt: auditAccepted ? null : "audit" }, input.taskRun.changeId);
  const finished = await finishTaskRunFromWorkflowResult(input.memory, input.taskRun.id, workflow, { changeId: input.taskRun.changeId, taskId: input.taskRun.taskId });
  return { taskRun: finished, workflow };
}

function validationRunFromEvidence(runs: RunMetadata[], validation: ValidationResult): ValidationLeafRun {
  const run = runs.find((item) => item.id === validation.runId) ?? {
    id: validation.runId,
    artifacts: {
      directory: `runs/${validation.runId}`,
      validation: `runs/${validation.runId}/validation.json`,
      stdout: `runs/${validation.runId}/stdout.log`,
      stderr: `runs/${validation.runId}/stderr.log`,
    },
  } as RunMetadata;
  return { run, validation } as ValidationLeafRun;
}

function auditRunFromEvidence(runs: RunMetadata[], audit: AuditResult): AuditLeafRun {
  const run = runs.find((item) => item.id === audit.runId) ?? {
    id: audit.runId,
    artifacts: {
      directory: `runs/${audit.runId}`,
      audit: audit.artifacts.audit,
      auditMarkdown: audit.artifacts.auditMarkdown,
      lastMessage: audit.artifacts.lastMessage,
    },
  } as RunMetadata;
  return { run, audit } as AuditLeafRun;
}

async function finishLoopForTaskRun(project: ManagedProject, loopRunId: string, taskRun: TaskRun, workflow: RuntimeTaskRunWorkflowResult): Promise<void> {
  const memory = await resolveProjectMemory(project);
  const { run } = await ensureWorkflowRuntimeEvidenceRun(memory, {
    runtimeRunId: loopRunId,
    changeId: taskRun.changeId,
    projectId: project.id,
    entrypoint: "task-run",
  });
  await finishWorkflowRuntimeEvidenceRun(memory, run, {
    status: taskRun.status === "completed" ? "completed" : "stopped",
    summary: taskRun.status === "completed" ? "TaskRun runtime stage completed." : `TaskRun runtime stage stopped with status ${taskRun.status}.`,
    stoppedAt: workflow.stoppedAt,
  });
}

async function appendLeafStarted(
  memory: ResolvedMemory,
  loopRun: WorkflowRuntimeEvidenceRun,
  stepIndex: number,
  roleId: WorkflowRuntimeRole,
  decision: Extract<WorkflowRuntimeDecision, { kind: "delegate-role" }>,
): Promise<void> {
  await appendWorkflowRuntimeEvidenceEvent(memory, loopRun, {
    type: "leaf.started",
    stepIndex,
    entrypoint: "task-run",
    roleId,
    attemptKind: decision.attemptKind,
    decisionKind: decision.kind,
    reason: decision.reason,
    summary: `Runtime TaskRun stage started ${roleId}.`,
    artifactRefs: decision.inputArtifacts,
  });
}

async function appendLeafCompleted(
  memory: ResolvedMemory,
  loopRun: WorkflowRuntimeEvidenceRun,
  stepIndex: number,
  roleId: WorkflowRuntimeRole,
  status: "completed" | "failed",
  stoppedAt: "boundary" | "code" | "validation" | "audit" | undefined,
  artifactRefs: string[],
): Promise<void> {
  await appendWorkflowRuntimeEvidenceEvent(memory, loopRun, {
    type: "leaf.completed",
    stepIndex,
    entrypoint: "task-run",
    roleId,
    status,
    stoppedAt,
    summary: `Runtime TaskRun stage ${roleId} ${status}.`,
    artifactRefs,
  });
}

function codeDecision(roleId: "coder-agent" | "rework-coder", taskRun: TaskRun): DelegateDecision<"coder-agent" | "rework-coder"> {
  return roleId === "rework-coder"
    ? reworkDecision([taskRun.id], "validation")
    : {
      kind: "delegate-role",
      roleId: "coder-agent",
      goal: "Implement the confirmed task in an AHO-owned worktree.",
      inputArtifacts: [taskRun.id],
      reason: "Runtime TaskRun stage starts with the implementation role.",
      attemptKind: "initial",
      nextRecommendation: "Run independent validation after coder-agent completes.",
    };
}

function reworkDecision(inputArtifacts: string[], stoppedAt: "validation" | "audit"): DelegateDecision<"rework-coder"> {
  return {
    kind: "delegate-role",
    roleId: "rework-coder",
    goal: "Repair implementation from validation or audit evidence.",
    inputArtifacts,
    reason: `${stoppedAt} failed and bounded TaskRun rework budget is available.`,
    attemptKind: "rework",
    nextRecommendation: "Run validation and audit again after rework-coder completes.",
  };
}

function validatorDecision(inputArtifacts: string[]): DelegateDecision<"validator"> {
  return {
    kind: "delegate-role",
    roleId: "validator",
    goal: "Run independent mechanical validation for the coder worktree.",
    inputArtifacts,
    reason: "Coder produced a completed worktree proposal.",
    attemptKind: "follow-up",
    nextRecommendation: "Run auditor-agent after validation passes.",
  };
}

function auditorDecision(inputArtifacts: string[]): DelegateDecision<"auditor-agent"> {
  return {
    kind: "delegate-role",
    roleId: "auditor-agent",
    goal: "Run independent semantic audit for the validated worktree.",
    inputArtifacts,
    reason: "Independent validation passed.",
    attemptKind: "follow-up",
    nextRecommendation: "Show result review and apply handoff if audit accepts.",
  };
}

function buildTaskRunReworkPrompt(prompt: string | undefined): string {
  return [
    prompt,
    "",
    "AHO official validation/audit did not accept the previous attempt.",
    "Read the latest validation/audit/run evidence for this Change and fix the assigned worktree proposal.",
    "Do not ask the user unless the evidence shows requirement ambiguity, product tradeoff, environment failure, or no real code rework path.",
  ].filter((item): item is string => Boolean(item)).join("\n");
}

function roleFromTaskRun(taskRun: TaskRun): "coder-agent" | "rework-coder" {
  return taskRun.roleId === "rework-coder" ? "rework-coder" : "coder-agent";
}

function reworkInputArtifacts(workflow: RuntimeTaskRunWorkflowResult): string[] {
  if (workflow.stoppedAt === "audit") {
    return compactArtifactRefs(workflow.audit?.audit.artifacts.auditMarkdown, workflow.audit?.audit.artifacts.lastMessage);
  }
  return compactArtifactRefs(workflow.validation?.run.artifacts.validation, workflow.validation?.run.artifacts.stderr);
}

function workflowFromUnknown(value: unknown, changeId: string): RuntimeTaskRunWorkflowResult {
  const workflow = isRecord(value) ? value : {};
  return {
    ...(workflow as unknown as Partial<RuntimeTaskRunAttemptWorkflowResult>),
    stoppedAt: stoppedAtFromUnknown(workflow),
    orchestration: createWorkflowRuntimeExecutionState({ changeId }),
  };
}

function isRuntimeTaskRunWorkflowResult(value: unknown): value is RuntimeTaskRunWorkflowResult {
  return isRecord(value) && isRecord(value.orchestration) && Array.isArray(value.orchestration.steps);
}

function stoppedAtFromUnknown(value: Record<string, unknown>): RuntimeTaskRunAttemptWorkflowResult["stoppedAt"] {
  return value.stoppedAt === "boundary" || value.stoppedAt === "code" || value.stoppedAt === "validation" || value.stoppedAt === "audit" || value.stoppedAt === null
    ? value.stoppedAt
    : null;
}

interface RuntimeTaskRunAttemptWorkflowResult {
  code?: CodeLeafRun;
  validation?: ValidationLeafRun;
  audit?: AuditLeafRun;
  stoppedAt: "boundary" | "code" | "validation" | "audit" | null;
  boundaryAudit?: unknown;
}
