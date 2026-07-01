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
import {
  buildDegradedMainAgentSchedulerCandidateAssessment,
  buildMainAgentSchedulerCandidateAssessment,
  type MainAgentSchedulerCandidateAssessment,
} from "./scheduler-candidate-assessment.js";
import {
  buildDegradedMainAgentControlledSchedulerRoute,
  buildMainAgentControlledSchedulerRoute,
  type MainAgentControlledSchedulerRoute,
} from "./controlled-scheduler-integration.js";

export interface MainAgentWorkflowGraphObservationReplayResult {
  observationEvidence: MainAgentWorkflowGraphDecisionEvidence;
  replaySummary: MainAgentWorkflowGraphReplaySummary;
  recoverySummary: MainAgentWorkflowGraphRecoverySummary;
  schedulerCandidateAssessment: MainAgentSchedulerCandidateAssessment;
  controlledSchedulerRoute: MainAgentControlledSchedulerRoute;
}

export async function recordMainAgentWorkflowGraphObservationAndReplay(
  memory: ResolvedMemory,
  project: ManagedProject,
  changeId: string,
  options: RecordMainAgentWorkflowGraphObservationOptions & { schedulerRunId?: string | null } = {},
): Promise<MainAgentWorkflowGraphObservationReplayResult> {
  const observationEvidence = await recordMainAgentWorkflowGraphObservation(memory, project, changeId, options);
  const replaySummary = await buildMainAgentWorkflowGraphReplaySummary(memory, project, changeId, {
    changePath: options.changePath,
    schedulerRunId: options.schedulerRunId,
  }).catch((error) =>
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
  const schedulerCandidateAssessment = await (async () => buildMainAgentSchedulerCandidateAssessment({
    project,
    changeId,
    observationEvidence,
    replaySummary,
    recoverySummary,
  }))().catch((error) =>
    buildDegradedMainAgentSchedulerCandidateAssessment(
      project,
      changeId,
      replaySummary,
      recoverySummary,
      `Scheduler candidate assessment derivation failed: ${errorMessage(error)}.`,
    ),
  );
  const controlledSchedulerRoute = await (async () => buildMainAgentControlledSchedulerRoute({
    project,
    changeId,
    replaySummary,
    recoverySummary,
    schedulerCandidateAssessment,
  }))().catch((error) =>
    buildDegradedMainAgentControlledSchedulerRoute(
      project,
      changeId,
      schedulerCandidateAssessment,
      `Controlled scheduler route derivation failed: ${errorMessage(error)}.`,
    ),
  );
  return { observationEvidence, replaySummary, recoverySummary, schedulerCandidateAssessment, controlledSchedulerRoute };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return "unknown error";
}
