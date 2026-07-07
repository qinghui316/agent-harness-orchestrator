import { startTaskRun, retryTaskRun, finishTaskRunFromWorkflowResult } from "../../task-run/manager.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import type { ManagedProject } from "../../types/index.js";
import type { CodeExecutionGateOptions } from "../../code/manager.js";
import { requireSingleTaskId, requireTaskRunId } from "./runtime-guards.js";
import {
  runMainAgentTaskRunLifecycle,
  type MainAgentStartedTaskRun,
} from "../../main-agent-orchestration/index.js";

export interface WorkflowRuntimeActionRequest {
  taskIds?: string[];
  taskRunId?: string;
  prompt?: string;
}

export interface WorkflowRuntimeLiveSink {
  emit(event: unknown): void;
  isClosed?(): boolean;
}

export async function runTaskRunMainAgentAttempt(
  project: ManagedProject,
  changeId: string,
  request: WorkflowRuntimeActionRequest,
  live: WorkflowRuntimeLiveSink | undefined,
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
  live: WorkflowRuntimeLiveSink | undefined,
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
