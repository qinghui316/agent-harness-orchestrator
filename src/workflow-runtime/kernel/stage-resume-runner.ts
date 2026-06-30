import { listRuns } from "../../run/manager.js";
import { listTaskRuns, finishTaskRunFromWorkflowResult } from "../../task-run/manager.js";
import type { CodeExecutionGateOptions } from "../../code/manager.js";
import type { ManagedProject, ResolvedMemory, StageResumeVerdict, TaskRun } from "../../types/index.js";
import { startAuditRun } from "../../audit/manager.js";
import { startValidationRun } from "../../validation/manager.js";
import { deriveWorkflowStageResumeVerdict } from "../taskqueue.js";
import type { WorkbenchLiveSink } from "../../workbench/types.js";
import { emitAssistantEvent, emitAuditAssistantEvent, emitValidationAssistantEvents } from "./live-events.js";

export async function findTaskQueueStageResumeCandidate(memory: ResolvedMemory, changeId: string, taskId: string): Promise<{ taskRun: TaskRun; verdict: StageResumeVerdict } | null> {
  const taskRuns = await listTaskRuns(memory, changeId);
  const candidates = taskRuns.filter((run) => run.taskId.toUpperCase() === taskId.toUpperCase() && !["queued", "claimed", "running"].includes(run.status));
  for (const taskRun of candidates) {
    const verdict = await deriveWorkflowStageResumeVerdict(memory, changeId, taskRun);
    if (verdict.kind !== "start-coder") return { taskRun, verdict };
  }
  return null;
}

export async function executeResumedTaskRunStage(
  project: ManagedProject,
  memory: ResolvedMemory,
  taskRun: TaskRun,
  verdict: StageResumeVerdict,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  _executionGate?: CodeExecutionGateOptions,
): Promise<unknown> {
  const coderRun = verdict.runId ? (await listRuns(memory)).find((run) => run.id === verdict.runId) : undefined;
  if (!coderRun || coderRun.status !== "completed" || !coderRun.worktree?.worktreeId) {
    const blocked = await finishTaskRunFromWorkflowResult(memory, taskRun.id, { stoppedAt: "code", code: { run: coderRun ?? { status: "failed" } } }, { changeId: taskRun.changeId, taskId: taskRun.taskId });
    return { taskRun: blocked, workflow: { stoppedAt: "code", code: { run: coderRun } } };
  }

  if (verdict.kind === "completed") {
    const completed = await finishTaskRunFromWorkflowResult(memory, taskRun.id, { stoppedAt: null, code: { run: coderRun }, audit: { audit: { status: "approved" } } }, { changeId: taskRun.changeId, taskId: taskRun.taskId });
    return { taskRun: completed, workflow: { stoppedAt: null, code: { run: coderRun } } };
  }

  if (verdict.kind === "continue-rework") {
    const workflow = {
      stoppedAt: verdict.auditId ? "audit" : "validation",
      code: { run: coderRun },
    };
    const blocked = await finishTaskRunFromWorkflowResult(memory, taskRun.id, workflow, { changeId: taskRun.changeId, taskId: taskRun.taskId });
    return { taskRun: blocked, workflow };
  }

  let validation: Awaited<ReturnType<typeof startValidationRun>> | undefined;
  if (verdict.kind === "continue-validation") {
    emitAssistantEvent(live, {
      runId: taskRun.id,
      kind: "status",
      phase: "validation-resume",
      title: "Validation running",
      summary: "Coder evidence already exists; AHO is resuming from validation.",
      artifactRef: coderRun.artifacts.directory,
    });
    validation = await startValidationRun(project, { changeId: taskRun.changeId, worktree: coderRun.worktree.worktreeId });
    emitValidationAssistantEvents(live, coderRun.id, validation);
    if (validation.validation.status !== "passed") {
      const workflow = { code: { run: coderRun }, validation, stoppedAt: "validation" };
      const blocked = await finishTaskRunFromWorkflowResult(memory, taskRun.id, workflow, { changeId: taskRun.changeId, taskId: taskRun.taskId });
      return { taskRun: blocked, workflow };
    }
  }

  emitAssistantEvent(live, {
    runId: taskRun.id,
    kind: "status",
    phase: "audit-resume",
    title: "Audit running",
    summary: "Validation evidence is available; AHO is resuming from audit.",
    artifactRef: validation?.run.artifacts.validation ?? verdict.evidenceRefs[0],
  });
  const audit = await startAuditRun(project, {
    changeId: taskRun.changeId,
    worktreeId: coderRun.worktree.worktreeId,
    prompt: "This audit resumed from WorkflowRun stage recovery after coder and validation evidence were already present.",
  });
  emitAuditAssistantEvent(live, coderRun.id, audit);
  const auditAccepted = audit.audit.status === "approved" || audit.audit.status === "approved-with-notes";
  const workflow = { code: { run: coderRun }, ...(validation ? { validation } : {}), audit, stoppedAt: auditAccepted ? null : "audit" };
  const finished = await finishTaskRunFromWorkflowResult(memory, taskRun.id, workflow, { changeId: taskRun.changeId, taskId: taskRun.taskId });
  return { taskRun: finished, workflow };
}
