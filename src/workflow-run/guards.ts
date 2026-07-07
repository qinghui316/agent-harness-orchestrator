import type { TaskQueueRun, TaskQueueWorkflowRun, WorkflowRun, WorkflowRunEvent } from "../types/index.js";
import type { WorkflowRunEventInput } from "./types.js";

export function assertWorkflowRunChangeScope(run: WorkflowRun, changeId: string): void {
  if (run.changeId !== changeId) {
    throw new Error(`WorkflowRun ${run.id} is not scoped to Change ${changeId}.`);
  }
}

export function isWorkflowRunScopedToChange(run: WorkflowRun, changeId: string): boolean {
  return run.changeId === changeId;
}

export function assertWorkflowRunEventScope(event: WorkflowRunEvent, changeId: string, workflowRunId: string): void {
  if (event.changeId !== changeId || event.workflowRunId !== workflowRunId) {
    throw new Error(`WorkflowRun event ${event.id ?? "(unknown)"} is not scoped to WorkflowRun ${workflowRunId}.`);
  }
}

export function canonicalWorkflowRunEventInput(input: WorkflowRunEventInput & Partial<WorkflowRunEvent> = {}): WorkflowRunEventInput {
  const next: WorkflowRunEventInput = {};
  if (input.queueRunId !== undefined) next.queueRunId = input.queueRunId;
  if (input.taskId !== undefined) next.taskId = input.taskId;
  if (input.taskRunId !== undefined) next.taskRunId = input.taskRunId;
  if (input.status !== undefined) next.status = input.status;
  if (input.reason !== undefined) next.reason = input.reason;
  if (input.data !== undefined) next.data = input.data;
  return next;
}

export function isTaskQueueWorkflowRun(run: WorkflowRun | null | undefined): run is TaskQueueWorkflowRun {
  return run?.source === "taskqueue-proposal";
}

export function assertWorkflowRunQueueScope(run: WorkflowRun, queue: TaskQueueRun): asserts run is TaskQueueWorkflowRun {
  if (run.source !== "taskqueue-proposal") {
    throw new Error("TaskQueue lifecycle requires a taskqueue-proposal WorkflowRun.");
  }
  if (run.changeId !== queue.changeId) {
    throw new Error("WorkflowRun and TaskQueueRun must belong to the same Change.");
  }
  if (run.queueRunId && run.queueRunId !== queue.id) {
    throw new Error("WorkflowRun is already bound to a different queueRunId.");
  }
  if (queue.workflowRunId && queue.workflowRunId !== run.id) {
    throw new Error("TaskQueueRun is bound to a different WorkflowRun.");
  }
}
