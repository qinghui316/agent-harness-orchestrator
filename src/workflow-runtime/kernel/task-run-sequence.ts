import { startTaskRun, retryTaskRun, markTaskRunStarted, finishTaskRunFromWorkflowResult } from "../../task-run/manager.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import type { ManagedProject, TaskRun } from "../../types/index.js";
import type { CodeExecutionGateOptions } from "../../code/manager.js";
import type { WorkbenchLiveSink, WorkbenchWorkflowActionRequest } from "../../workbench/types.js";
import { buildOfficialTaskRunReworkPrompt, buildResumeReworkPrompt, shouldAutoReworkTaskRun } from "./bounded-rework.js";
import { emitAssistantEvent } from "./live-events.js";
import { isRecord, isTaskRunLike, requireSingleTaskId, requireTaskRunId } from "./runtime-guards.js";
import { runCodeValidateAuditSequence } from "./role-stage-runner.js";

export async function runTaskRunCodeValidateAuditSequence(
  project: ManagedProject,
  changeId: string,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
  mode: "start" | "retry",
): Promise<unknown> {
  const started = mode === "start"
    ? await startTaskRun(project, { changeId, taskId: requireSingleTaskId(request.taskIds) })
    : await retryTaskRun(project, { changeId, taskRunId: requireTaskRunId(request.taskRunId) });
  return executeStartedTaskRunWorkflow(project, started, request.prompt, live);
}

export async function executeStartedTaskRunWorkflow(
  project: ManagedProject,
  started: Awaited<ReturnType<typeof startTaskRun>>,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  executionGate?: CodeExecutionGateOptions,
): Promise<unknown> {
  emitAssistantEvent(live, {
    runId: started.taskRun.id,
    kind: "status",
    phase: "claimed",
    title: "TaskRun claimed",
    summary: `${started.taskRun.taskId} attempt ${started.taskRun.attempt} was claimed by ${started.lease.workerId}.`,
  });
  try {
    const memory = await resolveProjectMemory(project);
    await markTaskRunStarted(memory, started.taskRun.id);
    emitAssistantEvent(live, {
      runId: started.taskRun.id,
      kind: "status",
      phase: "running",
      title: "TaskRun running",
      summary: `${started.taskRun.taskId} attempt ${started.taskRun.attempt} started the Coder -> Validation -> Audit workflow.`,
    });
    const workflow = await runCodeValidateAuditSequence(project, started.taskRun.changeId, prompt, live, [started.taskRun.taskId], started.taskRun.id, "coder-agent", undefined, undefined, executionGate);
    const taskRun = await finishTaskRunFromWorkflowResult(memory, started.taskRun.id, workflow);
    if (shouldAutoReworkTaskRun(taskRun)) {
      emitAssistantEvent(live, {
        runId: taskRun.id,
        kind: "status",
        phase: "auto-rework",
        title: "正在根据验证/审查结果自动修改",
        summary: `${taskRun.taskId} official attempt ${taskRun.attempt} did not pass. AHO is handing the evidence back to coder-agent for one bounded rework cycle.`,
      });
      const rework = await executeBoundedTaskRunRework(project, taskRun, buildOfficialTaskRunReworkPrompt(prompt), live, executionGate, false);
      const finalTaskRun = isRecord(rework) && isTaskRunLike(rework.taskRun) ? rework.taskRun : taskRun;
      return { taskRun: finalTaskRun, lease: started.lease, workflow, autoRework: { previousTaskRun: taskRun, result: rework } };
    }
    return { taskRun, lease: started.lease, workflow };
  } catch (cause) {
    const memory = await resolveProjectMemory(project);
    await finishTaskRunFromWorkflowResult(memory, started.taskRun.id, { stoppedAt: "code", code: { run: { status: "failed" } } }).catch(() => undefined);
    throw cause;
  }
}

export async function executeBoundedTaskRunRework(
  project: ManagedProject,
  taskRun: TaskRun,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  executionGate?: CodeExecutionGateOptions,
  buildResumePrompt = true,
): Promise<unknown> {
  const retry = await retryTaskRun(project, { changeId: taskRun.changeId, taskRunId: taskRun.id });
  const reworkPrompt = buildResumePrompt ? buildResumeReworkPrompt(prompt) : prompt;
  const rework = await executeStartedTaskRunWorkflow(project, retry, reworkPrompt, live, executionGate);
  const finalTaskRun = isRecord(rework) && isTaskRunLike(rework.taskRun) ? rework.taskRun : taskRun;
  return { taskRun: finalTaskRun, workflow: rework, autoRework: { previousTaskRun: taskRun, result: rework } };
}
