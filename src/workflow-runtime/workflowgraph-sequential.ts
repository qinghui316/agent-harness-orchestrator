import { resolveProjectActiveExecutionScope } from "../project-runtime/active-execution-scope.js";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import {
  listTaskQueueItems,
  readTaskQueueRun,
  reconcileTaskQueuesFromRuntime,
} from "../task-queue/manager.js";
import type {
  ManagedProject,
  SequentialWorkflowGraphPlan,
  TaskQueueItem,
  TaskQueueRun,
  WorkflowGraphPlan,
  WorkflowRun,
} from "../types/index.js";
import { readWorkflowRun } from "../workflow-run/manager.js";
import { isTaskQueueWorkflowRun } from "../workflow-run/guards.js";
import type { WorkflowRuntimeLiveSink } from "./kernel/live-events.js";
import { runSkillNativeSequentialExecution } from "./skill-native-sequential.js";

export interface WorkflowGraphSequentialRuntimeInput {
  project: ManagedProject;
  changeId: string;
  live?: WorkflowRuntimeLiveSink;
  workflowGraphPlanId?: string;
  workflowRunId?: string;
  queueRunId?: string;
}

export interface WorkflowGraphSequentialRuntimeResult {
  queue: TaskQueueRun;
  workflowRun: WorkflowRun;
  items: TaskQueueItem[];
  status: "completed" | "stopped";
  summary: string;
}

export async function runWorkflowGraphSequentialExecution(
  input: WorkflowGraphSequentialRuntimeInput,
): Promise<WorkflowGraphSequentialRuntimeResult> {
  const scope = await resolveProjectActiveExecutionScope(input.project, input.changeId);
  const graph = scope.harness.planning.graph;
  assertSequentialTarget(graph, input);
  const workflowRunId = requiredIdentity(input.workflowRunId, "WorkflowRun");
  const queueRunId = requiredIdentity(input.queueRunId, "TaskQueueRun");
  const [queue, workflowRun, items] = await Promise.all([
    readTaskQueueRun(scope.runtime, input.changeId, queueRunId),
    readWorkflowRun(scope.runtime, input.changeId, workflowRunId),
    listTaskQueueItems(scope.runtime, input.changeId, queueRunId),
  ]);
  if (!isTaskQueueWorkflowRun(workflowRun)
    || queue.status !== "paused"
    || queue.workflowGraphPlanId !== graph.id
    || queue.workflowRunId !== workflowRun.id
    || workflowRun.workflowGraphPlanId !== graph.id) {
    throw new Error("TaskQueue resume target is stale or not the accepted paused WorkflowRun.");
  }
  await reconcileTaskQueuesFromRuntime(scope.runtime, {
    changeId: input.changeId,
    queueRunId,
  });
  const reconciledQueue = await readTaskQueueRun(scope.runtime, input.changeId, queueRunId);
  const reconciledItems = await listTaskQueueItems(scope.runtime, input.changeId, queueRunId);
  if (reconciledQueue.status !== "paused") {
    throw new Error("TaskQueue resume target changed during revalidation.");
  }
  return runSkillNativeSequentialExecution({
    project: input.project,
    runtime: scope.runtime,
    harness: scope.harness,
    initialized: {
      workflowRun,
      queue: reconciledQueue,
      items: reconciledItems.length > 0 ? reconciledItems : items,
    },
    live: input.live,
  });
}

export async function selectNextSequentialGraphQueueItem(
  runtime: ProjectRunsPathPort,
  graph: WorkflowGraphPlan,
  queue: TaskQueueRun,
): Promise<TaskQueueItem | null> {
  if (graph.graphMode !== "sequential-v1" || queue.workflowGraphPlanId !== graph.id) {
    throw new Error("TaskQueue and sequential WorkflowGraph scope do not match.");
  }
  const items = await listTaskQueueItems(runtime, queue.changeId, queue.id);
  if (items.some((item) => item.status === "running")) return null;
  const byTaskId = new Map<string, TaskQueueItem>();
  for (const item of items) {
    const key = item.taskId.toUpperCase();
    if (byTaskId.has(key)) throw new Error(`TaskQueue ${queue.id} has duplicate task item ${key}.`);
    byTaskId.set(key, item);
  }
  for (const node of [...graph.nodes].sort((left, right) => left.order - right.order)) {
    const item = byTaskId.get(node.taskId.toUpperCase());
    if (!item) throw new Error(`WorkflowGraph node ${node.id} has no matching TaskQueue item.`);
    if (item.status === "queued") return item;
  }
  return null;
}

function assertSequentialTarget(
  graph: WorkflowGraphPlan,
  input: WorkflowGraphSequentialRuntimeInput,
): asserts graph is SequentialWorkflowGraphPlan {
  if (graph.graphMode !== "sequential-v1"
    || graph.changeId !== input.changeId
    || (input.workflowGraphPlanId && input.workflowGraphPlanId !== graph.id)) {
    throw new Error("TaskQueue resume requires the exact accepted sequential-v1 WorkflowGraphPlan.");
  }
}

function requiredIdentity(value: string | undefined, label: string): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`TaskQueue resume requires an exact ${label} id.`);
  return normalized;
}
