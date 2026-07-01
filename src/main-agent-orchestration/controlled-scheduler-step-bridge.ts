import { resolveRunnableChangeTarget } from "../change/target.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import {
  runControlledSchedulerLoopStep,
  type ControlledSchedulerLoopStepRequest,
  type ControlledSchedulerLoopStepServices,
} from "../scheduler-runtime/controlled-loop-step.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import {
  recordMainAgentWorkflowGraphObservationAndReplay,
  type MainAgentWorkflowGraphObservationReplayResult,
} from "./workflowgraph-replay-consumption.js";

type ControlledSchedulerLoopStepRunner = typeof runControlledSchedulerLoopStep;
type WorkflowGraphObservationRecorder = typeof recordMainAgentWorkflowGraphObservationAndReplay;

export interface MainAgentControlledSchedulerStepBridgeServices extends ControlledSchedulerLoopStepServices {
  runControlledSchedulerLoopStep?: ControlledSchedulerLoopStepRunner;
  recordWorkflowGraphObservationAndReplay?: WorkflowGraphObservationRecorder;
}

export async function runMainAgentControlledSchedulerStep(
  project: ManagedProject,
  changeId: string,
  request: ControlledSchedulerLoopStepRequest,
  services: MainAgentControlledSchedulerStepBridgeServices,
): Promise<Record<string, unknown>> {
  const context = await resolveMainAgentControlledSchedulerBridgeContext(project, changeId);
  const recordObservation = services.recordWorkflowGraphObservationAndReplay ?? recordMainAgentWorkflowGraphObservationAndReplay;
  const runStep = services.runControlledSchedulerLoopStep ?? runControlledSchedulerLoopStep;

  await recordObservation(context.memory, project, changeId, { changePath: context.changePath, schedulerRunId: request.schedulerRunId });

  try {
    const result = await runStep(project, changeId, request, services);
    await recordPostObservation(recordObservation, context.memory, project, changeId, context.changePath, request.schedulerRunId);
    return result;
  } catch (error) {
    await recordPostObservation(recordObservation, context.memory, project, changeId, context.changePath, request.schedulerRunId);
    throw error;
  }
}

async function resolveMainAgentControlledSchedulerBridgeContext(
  project: ManagedProject,
  changeId: string,
): Promise<{ memory: ResolvedMemory; changePath: string }> {
  const memory = await resolveProjectMemory(project);
  const target = await resolveRunnableChangeTarget(project, { changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === changeId)?.path;
  if (!changePath) {
    throw new Error(`Main-agent controlled scheduler bridge cannot resolve active Change path for ${changeId}.`);
  }
  return { memory, changePath };
}

async function recordPostObservation(
  recordObservation: WorkflowGraphObservationRecorder,
  memory: ResolvedMemory,
  project: ManagedProject,
  changeId: string,
  changePath: string,
  schedulerRunId?: string | null,
): Promise<MainAgentWorkflowGraphObservationReplayResult | null> {
  try {
    return await recordObservation(memory, project, changeId, { changePath, schedulerRunId });
  } catch {
    return null;
  }
}
