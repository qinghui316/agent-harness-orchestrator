import { startTaskRun, retryTaskRun, finishTaskRunFromWorkflowResult } from "../../task-run/manager.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import type { ManagedProject, TaskRun } from "../../types/index.js";
import type { CodeExecutionGateOptions } from "../../code/manager.js";
import type { WorkbenchLiveSink, WorkbenchWorkflowActionRequest } from "../../workbench/types.js";
import { requireSingleTaskId, requireTaskRunId } from "./runtime-guards.js";
import {
  runMainAgentTaskRunLifecycle,
  runMainAgentTaskRunReworkFromFinished,
  type MainAgentStartedTaskRun,
} from "../../main-agent-orchestration/index.js";

export async function runTaskRunMainAgentAttempt(
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
  onRetryTaskRunStarted?: (started: MainAgentStartedTaskRun) => Promise<void>,
): Promise<unknown> {
  try {
    return await runMainAgentTaskRunLifecycle({
      project,
      started,
      prompt,
      live,
      executionGate,
      onRetryTaskRunStarted,
    });
  } catch (cause) {
    const memory = await resolveProjectMemory(project);
    await finishTaskRunFromWorkflowResult(memory, started.taskRun.id, { stoppedAt: "code", code: { run: { status: "failed" } } }, { changeId: started.taskRun.changeId, taskId: started.taskRun.taskId }).catch(() => undefined);
    throw cause;
  }
}

export async function executeTaskRunReworkIfEligible(
  project: ManagedProject,
  taskRun: TaskRun,
  workflow: unknown,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  executionGate?: CodeExecutionGateOptions,
  onRetryTaskRunStarted?: (started: MainAgentStartedTaskRun) => Promise<void>,
): Promise<unknown> {
  return runMainAgentTaskRunReworkFromFinished({
    project,
    taskRun,
    workflow,
    prompt,
    live,
    executionGate,
    onRetryTaskRunStarted,
  });
}
