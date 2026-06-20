import { shortHash } from "../fs/path.js";
import { resolveRunnableChangeTarget } from "../change/target.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject } from "../types/index.js";
import { readSchedulerRun } from "../workflow-scheduler/repository.js";
import {
  appendSchedulerRuntimeEvent,
  schedulerControlledStepArtifactRefs,
  writeSchedulerControlledStepEvidence,
} from "./repository.js";
import type {
  SchedulerControlledStepEvidence,
  SchedulerControlledStepForbiddenAuthority,
  SchedulerControlledStepHandoffSummary,
  SchedulerControlledStepPostStepEvidence,
  SchedulerControlledStepPreStepEvidence,
  SchedulerControlledStepResultSummary,
} from "./types.js";
import { buildSchedulerControlledLoopTurnRouteSummary } from "./controlled-loop-turn.js";
import { buildSchedulerControlledLoopTickSummary } from "./controlled-loop-tick.js";
import { buildSchedulerControlledLoopContinuationReadiness } from "./controlled-loop-continuation-readiness.js";
import { buildSchedulerControlledLoopIterationSummary } from "./controlled-loop-iteration.js";

type ScopeValue = string | string[];

export interface RecordSchedulerControlledStepEvidenceInput {
  changeId: string;
  schedulerRunId?: string;
  executedActionType: string;
  targetScope: Record<string, unknown>;
  preStepEvidence: SchedulerControlledStepPreStepEvidence;
  postStepGoalLoopEvaluation?: {
    goalLoopDecisionId: string;
    goalLoopIterationId: string;
    goalLoopContinuationBriefId: string;
    goalLoopNextStepPacketId: string;
    recommendedActionType?: string;
    continuationState: string;
    executionStarted: false;
  };
  postStepGoalLoopReadiness?: {
    goalLoopControllerPolicyId: string;
    goalLoopGateReadinessPreflightId: string;
    currentGateActionType: string;
    executionStarted: false;
    concreteGateInvoked: false;
    toolPolicyAuthorizedConcreteGate: false;
  };
  postStepGoalLoopEvaluationWarning?: string;
  postStepGoalLoopReadinessWarning?: string;
  postStepHandoff: SchedulerControlledStepHandoffSummary;
  controlledStepResultSummary?: SchedulerControlledStepResultSummary;
}

export interface RecordSchedulerControlledStepEvidenceResult {
  schedulerControlledStepEvidence: SchedulerControlledStepEvidence;
}

const FORBIDDEN_AUTHORITY: SchedulerControlledStepForbiddenAuthority = {
  loopAuthorized: false,
  wholeWaveDispatchAuthorized: false,
  slotAllocatorAuthorized: false,
  fullParallelExecutorAuthorized: false,
  sourceMutationAuthorized: false,
  applyAuthorized: false,
  closeAuthorized: false,
  mergeAuthorized: false,
  remoteLandingAuthorized: false,
  harnessEvolutionAuthorized: false,
};

export async function recordSchedulerControlledStepEvidence(
  project: ManagedProject,
  input: RecordSchedulerControlledStepEvidenceInput,
): Promise<RecordSchedulerControlledStepEvidenceResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Scheduler controlled step evidence");
  const target = await resolveRunnableChangeTarget(project, { changeId: input.changeId, allowLegacyActiveFallback: false });
  const changePath = target.status.activeChanges.find((item) => item.name === input.changeId)?.path;
  if (!changePath) throw new Error(`Scheduler controlled step evidence cannot resolve active Change path for ${input.changeId}.`);
  const schedulerRun = input.schedulerRunId ? await readSchedulerRun(memory, changePath, input.schedulerRunId) : null;
  if (input.schedulerRunId) {
    if (!schedulerRun || schedulerRun.changeId !== input.changeId) throw new Error("Scheduler controlled step evidence SchedulerRun change scope mismatch.");
  }

  const step = buildSchedulerControlledStepEvidence(memory, changePath, input);
  await writeSchedulerControlledStepEvidence(memory, changePath, step);

  if (schedulerRun) {
    await appendSchedulerRuntimeEvent(memory, changePath, schedulerRun, "scheduler-runtime.controlled-step-recorded", {
      summary: `Recorded one stopped controlled Scheduler step for ${step.executedActionType}.`,
      artifactRefs: step.artifactRefs,
      payload: {
        schedulerControlledStepEvidenceId: step.id,
        executedActionType: step.executedActionType,
        postStepStatus: step.postStepHandoff.status,
        controlledLoopTickAuthority: step.controlledLoopTick?.authority,
        controlledLoopTickRoutePosture: step.controlledLoopTick?.routeStop.routePosture,
        controlledLoopTickStopReason: step.controlledLoopTick?.routeStop.stopReason,
        controlledLoopIterationAuthority: step.controlledLoopIteration?.authority,
        controlledLoopIterationStatus: step.controlledLoopIteration?.status,
        controlledLoopIterationRoutePosture: step.controlledLoopIteration?.routePosture,
        controlledLoopIterationContinuationReadinessStatus: step.controlledLoopIteration?.continuationReadinessStatus,
        humanConfirmationStillRequired: step.humanConfirmationStillRequired,
      },
    });
  }

  return { schedulerControlledStepEvidence: step };
}

function buildSchedulerControlledStepEvidence(
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  changePath: string,
  input: RecordSchedulerControlledStepEvidenceInput,
): SchedulerControlledStepEvidence {
  const now = new Date().toISOString();
  const targetScope = normalizeTargetScope({
    ...input.targetScope,
    actionType: input.executedActionType,
    changeId: input.changeId,
    schedulerRunId: input.schedulerRunId,
  });
  const stepId = buildSchedulerControlledStepEvidenceId(input, now);
  const refs = schedulerControlledStepArtifactRefs(memory, changePath, stepId, input.schedulerRunId);
  const postStepEvidence = buildPostStepEvidence(input);
  const controlledLoopTurnRouteSummary = buildSchedulerControlledLoopTurnRouteSummary({
    executedActionType: input.executedActionType,
    postStepEvidence,
    postStepHandoff: input.postStepHandoff,
    controlledStepResultSummary: input.controlledStepResultSummary,
    forbiddenAuthority: FORBIDDEN_AUTHORITY,
  });
  const controlledLoopTick = buildSchedulerControlledLoopTickSummary({
    executedActionType: input.executedActionType,
    preStepEvidence: input.preStepEvidence,
    postStepEvidence,
    postStepHandoff: input.postStepHandoff,
    controlledLoopTurnRouteSummary,
    controlledStepResultSummary: input.controlledStepResultSummary,
    forbiddenAuthority: FORBIDDEN_AUTHORITY,
  });
  const controlledLoopContinuationReadiness = buildSchedulerControlledLoopContinuationReadiness({
    executedActionType: input.executedActionType,
    postStepHandoff: input.postStepHandoff,
    controlledLoopTurnRouteSummary,
    controlledLoopTick,
    controlledStepResultSummary: input.controlledStepResultSummary,
    forbiddenAuthority: FORBIDDEN_AUTHORITY,
    evidenceRefs: [refs.markdownArtifact, refs.artifact],
  });
  const controlledLoopIteration = buildSchedulerControlledLoopIterationSummary({
    executedActionType: input.executedActionType,
    postStepHandoff: input.postStepHandoff,
    controlledLoopTurnRouteSummary,
    controlledLoopTick,
    controlledLoopContinuationReadiness,
    controlledStepResultSummary: input.controlledStepResultSummary,
    forbiddenAuthority: FORBIDDEN_AUTHORITY,
    evidenceRefs: [refs.markdownArtifact, refs.artifact],
  });
  return {
    version: "1.0",
    id: stepId,
    changeId: input.changeId,
    schedulerRunId: input.schedulerRunId,
    status: postStepEvidence.evaluationWarning || postStepEvidence.readinessWarning ? "recorded-with-warning" : "recorded",
    executedActionType: input.executedActionType,
    targetScope,
    preStepEvidence: input.preStepEvidence,
    postStepEvidence,
    postStepHandoff: input.postStepHandoff,
    controlledStepResultSummary: input.controlledStepResultSummary,
    controlledLoopTurnRouteSummary,
    controlledLoopTick,
    controlledLoopContinuationReadiness,
    controlledLoopIteration,
    executionStarted: true,
    stoppedAfterOneSchedulerTransition: true,
    humanConfirmationStillRequired: true,
    sourceMutated: false,
    forbiddenAuthority: FORBIDDEN_AUTHORITY,
    artifactRefs: [refs.artifact, refs.markdownArtifact],
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
}

function buildPostStepEvidence(input: RecordSchedulerControlledStepEvidenceInput): SchedulerControlledStepPostStepEvidence {
  return {
    goalLoopDecisionId: input.postStepGoalLoopEvaluation?.goalLoopDecisionId,
    goalLoopIterationId: input.postStepGoalLoopEvaluation?.goalLoopIterationId,
    goalLoopContinuationBriefId: input.postStepGoalLoopEvaluation?.goalLoopContinuationBriefId,
    goalLoopNextStepPacketId: input.postStepGoalLoopEvaluation?.goalLoopNextStepPacketId,
    recommendedActionType: input.postStepGoalLoopEvaluation?.recommendedActionType,
    continuationState: input.postStepGoalLoopEvaluation?.continuationState,
    goalLoopControllerPolicyId: input.postStepGoalLoopReadiness?.goalLoopControllerPolicyId,
    goalLoopGateReadinessPreflightId: input.postStepGoalLoopReadiness?.goalLoopGateReadinessPreflightId,
    currentGateActionType: input.postStepGoalLoopReadiness?.currentGateActionType,
    evaluationWarning: input.postStepGoalLoopEvaluationWarning,
    readinessWarning: input.postStepGoalLoopReadinessWarning,
    executionStarted: false,
    concreteGateInvoked: false,
    toolPolicyAuthorizedConcreteGate: false,
  };
}

function buildSchedulerControlledStepEvidenceId(input: RecordSchedulerControlledStepEvidenceInput, now: string): string {
  const seed = [
    input.changeId,
    input.schedulerRunId ?? "change",
    input.executedActionType,
    input.preStepEvidence.goalLoopNextStepPacketId,
    input.postStepGoalLoopEvaluation?.goalLoopNextStepPacketId ?? input.postStepGoalLoopEvaluationWarning ?? "post-step-warning",
    now,
  ].join(":");
  return `scheduler-controlled-step-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(seed).slice(0, 8)}`;
}

function normalizeTargetScope(input: Record<string, unknown>): Record<string, ScopeValue> {
  const result: Record<string, ScopeValue> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === "string" && value.trim()) result[key] = value;
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) result[key] = value;
  }
  return result;
}
