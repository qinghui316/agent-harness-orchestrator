import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import {
  recordMainAgentWorkflowGraphObservation,
  type MainAgentWorkflowGraphDecisionEvidence,
  type RecordMainAgentWorkflowGraphObservationOptions,
} from "./workflowgraph-observation.js";
import {
  buildMainAgentWorkflowGraphReplaySummary,
  type MainAgentWorkflowGraphReplaySummary,
} from "./workflowgraph-replay.js";

export interface MainAgentWorkflowGraphObservationReplayResult {
  observationEvidence: MainAgentWorkflowGraphDecisionEvidence;
  replaySummary: MainAgentWorkflowGraphReplaySummary;
}

export async function recordMainAgentWorkflowGraphObservationAndReplay(
  memory: ResolvedMemory,
  project: ManagedProject,
  changeId: string,
  options: RecordMainAgentWorkflowGraphObservationOptions = {},
): Promise<MainAgentWorkflowGraphObservationReplayResult> {
  const observationEvidence = await recordMainAgentWorkflowGraphObservation(memory, project, changeId, options);
  const replaySummary = await buildMainAgentWorkflowGraphReplaySummary(memory, project, changeId);
  return { observationEvidence, replaySummary };
}
