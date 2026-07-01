import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import {
  recordMainAgentWorkflowGraphObservation,
  type MainAgentWorkflowGraphDecisionEvidence,
  type RecordMainAgentWorkflowGraphObservationOptions,
} from "./workflowgraph-observation.js";
import {
  buildDegradedMainAgentWorkflowGraphReplaySummary,
  buildMainAgentWorkflowGraphReplaySummary,
  type MainAgentWorkflowGraphReplaySummary,
} from "./workflowgraph-replay.js";
import {
  buildDegradedMainAgentWorkflowGraphRecoverySummary,
  buildMainAgentWorkflowGraphRecoverySummary,
  type MainAgentWorkflowGraphRecoverySummary,
} from "./workflowgraph-recovery.js";

export interface MainAgentWorkflowGraphObservationReplayResult {
  observationEvidence: MainAgentWorkflowGraphDecisionEvidence;
  replaySummary: MainAgentWorkflowGraphReplaySummary;
  recoverySummary: MainAgentWorkflowGraphRecoverySummary;
}

export async function recordMainAgentWorkflowGraphObservationAndReplay(
  memory: ResolvedMemory,
  project: ManagedProject,
  changeId: string,
  options: RecordMainAgentWorkflowGraphObservationOptions = {},
): Promise<MainAgentWorkflowGraphObservationReplayResult> {
  const observationEvidence = await recordMainAgentWorkflowGraphObservation(memory, project, changeId, options);
  const replaySummary = await buildMainAgentWorkflowGraphReplaySummary(memory, project, changeId).catch((error) =>
    buildDegradedMainAgentWorkflowGraphReplaySummary(
      project,
      changeId,
      `Replay summary derivation failed: ${errorMessage(error)}.`,
      observationEvidence,
    ),
  );
  const recoverySummary = await buildMainAgentWorkflowGraphRecoverySummary(memory, project, changeId, replaySummary).catch((error) =>
    buildDegradedMainAgentWorkflowGraphRecoverySummary(
      project,
      changeId,
      replaySummary,
      `Recovery summary derivation failed: ${errorMessage(error)}.`,
    ),
  );
  return { observationEvidence, replaySummary, recoverySummary };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "unknown error";
}
