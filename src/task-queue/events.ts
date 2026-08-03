import { appendWorkflowTaskEvent } from "../workflow-run/manager.js";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import type { TaskQueueItem, WorkflowRunEventType } from "../types/index.js";

export async function appendTaskQueueTaskEvent(
  memory: ProjectRunsPathPort,
  item: Pick<TaskQueueItem, "workflowRunId" | "changeId" | "queueRunId" | "taskId">,
  type: WorkflowRunEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  await appendWorkflowTaskEvent(memory, item.workflowRunId, item.changeId, type, {
    queueRunId: item.queueRunId,
    taskId: item.taskId,
    ...payload,
  });
}
