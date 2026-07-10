import { resolveRunnableChangeTarget } from "../change/target.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject } from "../types/index.js";
import { createTaskQueueRunFromGraph } from "./queue-creation.js";
import { activeChangePath, createWorkflowRunForGraph } from "../workflow-run/manager.js";
import { readWorkflowGraphPlan } from "../workflow-artifacts/manager.js";
import { resumePausedTaskQueue } from "./workflow-sync.js";
import {
  assertNoActiveTaskRun,
  assertProposalTasksKnown,
  validateNoConflictingActiveQueue,
  validatePausedTaskQueueResume,
} from "./start-validation.js";
import type { TaskQueueStartOptions, TaskQueueStartResult } from "./types.js";

export async function startOrResumeTaskQueue(project: ManagedProject, options: TaskQueueStartOptions): Promise<TaskQueueStartResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "TaskQueue start");
  const target = await resolveRunnableChangeTarget(project, { changeId: options.changeId, allowLegacyActiveFallback: false });
  const acceptedTasks = target.status.acMap?.tasks ?? [];
  const activeQueue = await validateNoConflictingActiveQueue(memory, options.changeId);
  if (activeQueue?.status === "paused") {
    await validatePausedTaskQueueResume(memory, project, activeQueue, options);
    const { queue, items } = await resumePausedTaskQueue(memory, activeQueue);
    return { queue, items, resumed: true };
  }

  if (options.workflowGraphPlanId) {
    const changePath = await activeChangePath(memory, options.changeId);
    const graph = await readWorkflowGraphPlan(memory, changePath, options.workflowGraphPlanId);
    if (graph.changeId !== options.changeId || graph.graphMode !== "sequential-v1" || graph.authoringContractVersion !== "1.0") {
      throw new Error("TaskQueue graph start requires the latest authored sequential-v1 WorkflowGraphPlan.");
    }
    const workflow = await createWorkflowRunForGraph(memory, project, changePath, graph);
    assertProposalTasksKnown(acceptedTasks, graph.nodes.map((node) => node.taskId));
    await assertNoActiveTaskRun(memory, options.changeId);
    const created = await createTaskQueueRunFromGraph({
      project,
      memory,
      changeId: options.changeId,
      workflow,
      workflowGraphPlanId: graph.id,
      graphItems: graph.nodes.map((node) => ({ taskId: node.taskId, order: node.order })),
      acceptedTasks,
    });
    return { ...created, resumed: false };
  }

  throw new Error("TaskQueue start requires an accepted authored sequential WorkflowGraphPlan.");
}
