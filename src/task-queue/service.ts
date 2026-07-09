import { resolveRunnableChangeTarget } from "../change/target.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject } from "../types/index.js";
import { createTaskQueueRunFromProposal } from "./queue-creation.js";
import { resumePausedTaskQueue } from "./workflow-sync.js";
import {
  assertNoActiveTaskRun,
  assertProposalTasksKnown,
  validateNewTaskQueueStart,
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

  const { validated, workflow } = await validateNewTaskQueueStart(memory, project, options);
  const proposalTaskIds = validated.proposal.items.map((item) => item.taskId);
  assertProposalTasksKnown(acceptedTasks, proposalTaskIds);
  await assertNoActiveTaskRun(memory, options.changeId);
  const { queue, items } = await createTaskQueueRunFromProposal({
    project,
    memory,
    changeId: options.changeId,
    workflow,
    taskQueueProposalId: validated.proposal.id,
    workflowGraphPlanId: validated.graph.id,
    decompositionPlanId: validated.proposal.decompositionPlanId,
    readinessManifestId: validated.proposal.readinessManifestId,
    proposalItems: validated.proposal.items,
    acceptedTasks,
  });
  return { queue, items, resumed: false };
}
