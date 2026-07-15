import type { ResolvedMemory, TaskRun, TaskRunStatus } from "../types/index.js";
import { assertTaskRunMatchesScope } from "./guards.js";
import { releaseTaskRunLease } from "./lease-service.js";
import { resolveTaskRun, writeTaskRun } from "./repository.js";
import type { TaskRunScopeOptions, WorkflowResultLink } from "./types.js";

export async function finishTaskRunFromWorkflowResult(memory: ResolvedMemory, taskRunId: string, result: unknown, scope: TaskRunScopeOptions = {}): Promise<TaskRun> {
  const taskRun = await resolveTaskRun(memory, taskRunId, scope);
  assertTaskRunMatchesScope(taskRun, scope, "TaskRun finish");
  const outcome = classifyWorkflowResult(result);
  const linked = extractWorkflowRunLink(result);
  assertWorkflowResultLinkMatchesTaskRun(taskRun, linked);
  const next: TaskRun = {
    ...taskRun,
    status: outcome.status,
    runId: linked.runId ?? taskRun.runId,
    worktreeId: linked.worktreeId ?? taskRun.worktreeId,
    blockedReason: outcome.blockedReason,
    failureReason: outcome.failureReason,
    updatedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };
  const written = await writeTaskRun(memory, next);
  await releaseTaskRunLease(memory, written, written.finishedAt ?? new Date().toISOString());
  return written;
}

export function classifyWorkflowResult(result: unknown): { status: TaskRunStatus; blockedReason?: string; failureReason?: string } {
  if (!isRecord(result)) return { status: "failed", failureReason: "Task workflow did not return a structured result." };
  const stoppedAt = typeof result.stoppedAt === "string" ? result.stoppedAt : null;
  const codeStatus = isRecord(result.code) && isRecord(result.code.run) && typeof result.code.run.status === "string" ? result.code.run.status : null;
  const validationStatus = isRecord(result.validation) && isRecord(result.validation.validation) && typeof result.validation.validation.status === "string" ? result.validation.validation.status : null;
  const auditStatus = isRecord(result.audit) && isRecord(result.audit.audit) && typeof result.audit.audit.status === "string" ? result.audit.audit.status : null;
  if (codeStatus === "interrupted") return { status: "interrupted" };
  if (stoppedAt === null && (auditStatus === "approved" || auditStatus === "approved-with-notes")) return { status: "completed" };
  if (stoppedAt === "validation" || validationStatus === "failed") return { status: "blocked", blockedReason: "Validation failed." };
  if (stoppedAt === "audit" || auditStatus === "blocked" || auditStatus === "failed") return { status: "blocked", blockedReason: auditStatus ? `Audit ${auditStatus}.` : "Audit did not approve the task run." };
  if (stoppedAt === "code" || codeStatus === "failed") return { status: "failed", failureReason: "Coder run failed before validation." };
  return { status: "evidence-ready" };
}

function extractWorkflowRunLink(result: unknown): WorkflowResultLink {
  const workflow = isRecord(result) && isRecord(result.workflow) ? result.workflow : result;
  const codeRun = isRecord(workflow) && isRecord(workflow.code) && isRecord(workflow.code.run) ? workflow.code.run : null;
  const taskIds = isRecord(codeRun) && Array.isArray(codeRun.taskIds) ? codeRun.taskIds.filter((id): id is string => typeof id === "string") : undefined;
  return {
    runId: isRecord(codeRun) && typeof codeRun.id === "string" ? codeRun.id : undefined,
    worktreeId: isRecord(codeRun) && isRecord(codeRun.worktree) && typeof codeRun.worktree.worktreeId === "string" ? codeRun.worktree.worktreeId : undefined,
    changeId: isRecord(codeRun) && typeof codeRun.changeId === "string" ? codeRun.changeId : undefined,
    taskRunId: isRecord(codeRun) && typeof codeRun.taskRunId === "string" ? codeRun.taskRunId : undefined,
    taskIds,
  };
}

function assertWorkflowResultLinkMatchesTaskRun(taskRun: TaskRun, link: WorkflowResultLink): void {
  if (link.changeId && link.changeId !== taskRun.changeId) {
    throw new Error(`Workflow result for TaskRun ${taskRun.id} belongs to Change ${link.changeId}, not ${taskRun.changeId}.`);
  }
  if (link.taskRunId && link.taskRunId !== taskRun.id) {
    throw new Error(`Workflow result for TaskRun ${taskRun.id} references TaskRun ${link.taskRunId}.`);
  }
  if (link.taskIds?.length && !link.taskIds.some((taskId) => taskId.toUpperCase() === taskRun.taskId.toUpperCase())) {
    throw new Error(`Workflow result for TaskRun ${taskRun.id} does not include task ${taskRun.taskId}.`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
