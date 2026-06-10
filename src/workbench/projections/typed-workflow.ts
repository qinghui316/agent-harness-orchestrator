import type { ResolvedMemory, WorkflowRun } from "../../types/index.js";
import {
  readDecompositionPlanProjection,
  readDecompositionReadinessProjection,
  readTaskQueueProposalProjection,
  readWorkflowGraphPlanProjection,
  readSchedulerContractProjection,
} from "../workflow-projection.js";
import { readWorkflowRun, readWorkflowRunEvents } from "../../workflow-run/manager.js";
import type {
  DecompositionPlan,
  DecompositionReadinessManifest,
  TaskQueueProposal,
  WorkflowGraphPlan,
} from "../../workflow-artifacts/manager.js";
import type { SchedulerContract } from "../../workflow-scheduler/manager.js";

export interface WorkbenchTopicPathRef {
  id: string;
  name: string;
  path: string;
}

export function findWorkbenchTopicPath(topics: WorkbenchTopicPathRef[], changeId: string): string | null {
  return topics.find((item) => item.id === changeId || item.name === changeId)?.path ?? null;
}

export function getDecompositionPlanProjectionForPath(memory: ResolvedMemory, changePath: string): Promise<DecompositionPlan | null> {
  return readDecompositionPlanProjection(memory, changePath);
}

export function getDecompositionReadinessProjectionForPath(memory: ResolvedMemory, changePath: string): Promise<DecompositionReadinessManifest | null> {
  return readDecompositionReadinessProjection(memory, changePath);
}

export function getTaskQueueProposalProjectionForPath(memory: ResolvedMemory, changePath: string): Promise<TaskQueueProposal | null> {
  return readTaskQueueProposalProjection(memory, changePath);
}

export function getWorkflowGraphPlanProjectionForPath(memory: ResolvedMemory, changePath: string, workflowGraphPlanId?: string): Promise<WorkflowGraphPlan | null> {
  return readWorkflowGraphPlanProjection(memory, changePath, workflowGraphPlanId);
}

export function getSchedulerContractProjectionForPath(memory: ResolvedMemory, changePath: string, schedulerContractId?: string): Promise<SchedulerContract | null> {
  return readSchedulerContractProjection(memory, changePath, schedulerContractId);
}

export async function getWorkflowRunProjectionForChange(
  memory: ResolvedMemory,
  changeId: string,
  workflowRunId: string,
): Promise<{ run: WorkflowRun; events: Awaited<ReturnType<typeof readWorkflowRunEvents>> } | null> {
  const run = await readWorkflowRun(memory, changeId, workflowRunId).catch(() => null);
  if (!run) return null;
  const events = await readWorkflowRunEvents(memory, changeId, workflowRunId);
  return { run, events };
}
