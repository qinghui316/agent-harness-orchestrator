import { existsSync } from "node:fs";
import { join } from "node:path";
import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";
import { readChangePathChangeId } from "../workflow-artifacts/guards.js";
import { readLatestDecompositionPlan } from "../workflow-artifacts/decomposition-plan.js";
import { readLatestDecompositionReadinessManifest } from "../workflow-artifacts/readiness-manifest.js";
import { validateWorkflowActionRequiredTargets, type WorkflowActionType } from "../workflow-actions/registry.js";
import { readLatestSchedulerRun } from "../workflow-scheduler/repository.js";
import type { SchedulerRun } from "../workflow-scheduler/types.js";
import {
  findSchedulerRuntimeWorkerAuditForValidation,
  findSchedulerRuntimeWorkerResultForStart,
  findSchedulerRuntimeWorkerReworkAuditForValidation,
  findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence,
  findSchedulerRuntimeWorkerReworkResultForStart,
  findSchedulerRuntimeWorkerReworkStartForPlan,
  findSchedulerRuntimeWorkerReworkValidationForResult,
  findSchedulerRuntimeWorkerValidationForResult,
  listSchedulerRuntimeWorkerStarts,
  readLatestSchedulerIntegrationCandidateProjection,
  readLatestSchedulerIntegrationCheckHandoffProjection,
  readLatestSchedulerIntegrationOutcomeProjection,
  readLatestSchedulerRunBlockedCloseoutProjection,
  readLatestSchedulerRunCompletionProjection,
  readSchedulerRuntimeClaimReservationProjection,
  readSchedulerRuntimeStateProjection,
} from "../scheduler-runtime/repository.js";
import {
  findNextSchedulerReservationIntentForWorkerPaths,
  schedulerIntegrationCandidateNeedsRefresh,
  type SchedulerReservationIntentLike,
  type SchedulerWorkerPathLike,
} from "../scheduler-runtime/worker-path.js";
import type {
  SchedulerIntegrationCandidate,
  SchedulerIntegrationCheckHandoff,
  SchedulerIntegrationOutcome,
  SchedulerRunBlockedCloseout,
  SchedulerRunCompletion,
  SchedulerRuntimeClaimReservation,
  SchedulerRuntimeState,
  SchedulerRuntimeWorkerAudit,
  SchedulerRuntimeWorkerResult,
  SchedulerRuntimeWorkerReworkAudit,
  SchedulerRuntimeWorkerReworkPlan,
  SchedulerRuntimeWorkerReworkResult,
  SchedulerRuntimeWorkerReworkStart,
  SchedulerRuntimeWorkerReworkValidation,
  SchedulerRuntimeWorkerStart,
  SchedulerRuntimeWorkerValidation,
} from "../scheduler-runtime/types.js";
import {
  goalLoopContinuationBriefArtifactRefs,
  goalLoopDecisionArtifactRefs,
  goalLoopIterationArtifactRefs,
  goalLoopNextStepPacketArtifactRefs,
  readLatestGoalLoopContinuationBrief,
  readLatestGoalLoopDecision,
  readLatestGoalLoopIteration,
  readLatestGoalLoopNextStepPacket,
  writeGoalLoopContinuationBrief,
  writeGoalLoopDecision,
  writeGoalLoopIteration,
  writeGoalLoopNextStepPacket,
} from "./repository.js";
import type {
  GoalLoopContinuationBrief,
  GoalLoopCompletionAudit,
  GoalLoopConflictAssessment,
  GoalLoopDecision,
  GoalLoopDecisionKind,
  GoalLoopForbiddenAction,
  GoalLoopBudgetSignal,
  GoalLoopContinuationState,
  GoalLoopContinuationVerdict,
  GoalLoopControlPolicy,
  GoalLoopIteration,
  GoalLoopNextStepPacket,
  GoalLoopNextStepRecommendationState,
  GoalLoopRecommendedAction,
  GoalLoopResumePrecondition,
  GoalLoopSourceEvidenceRef,
  GoalLoopSuppressionReason,
} from "./types.js";

interface EvidenceSnapshot {
  changeId: string;
  planningComplete: boolean;
  sourceEvidenceRefs: GoalLoopSourceEvidenceRef[];
  schedulerRun?: SchedulerRun;
  runtimeState?: SchedulerRuntimeState | null;
  claimReservation?: SchedulerRuntimeClaimReservation | null;
  workerStarts?: SchedulerRuntimeWorkerStart[];
  workerPaths?: GoalLoopSchedulerWorkerPath[];
  currentWorkerPath?: GoalLoopSchedulerWorkerPath | null;
  nextReservationIntent?: SchedulerReservationIntentLike | null;
  integrationCandidateNeedsRefresh?: boolean;
  integrationCandidate?: SchedulerIntegrationCandidate | null;
  integrationHandoff?: SchedulerIntegrationCheckHandoff | null;
  integrationOutcome?: SchedulerIntegrationOutcome | null;
  runCompletion?: SchedulerRunCompletion | null;
  runCloseout?: SchedulerRunBlockedCloseout | null;
}

interface GoalLoopSchedulerWorkerPath {
  start: SchedulerRuntimeWorkerStart;
  result: SchedulerRuntimeWorkerResult | null;
  validation: SchedulerRuntimeWorkerValidation | null;
  audit: SchedulerRuntimeWorkerAudit | null;
  reworkPlan: SchedulerRuntimeWorkerReworkPlan | null;
  reworkStart: SchedulerRuntimeWorkerReworkStart | null;
  reworkResult: SchedulerRuntimeWorkerReworkResult | null;
  reworkValidation: SchedulerRuntimeWorkerReworkValidation | null;
  reworkAudit: SchedulerRuntimeWorkerReworkAudit | null;
  terminal: boolean;
}

export async function compileGoalLoopDecision(memory: ResolvedMemory, changePath: string): Promise<GoalLoopDecision> {
  const decision = await previewGoalLoopDecision(memory, changePath);
  await writeGoalLoopDecision(memory, changePath, decision);
  return decision;
}

export async function previewGoalLoopDecision(memory: ResolvedMemory, changePath: string): Promise<GoalLoopDecision> {
  const snapshot = await readEvidenceSnapshot(memory, changePath);
  const now = new Date().toISOString();
  const decisionId = `goal-loop-decision-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${snapshot.changeId}:${now}:${JSON.stringify(snapshot.sourceEvidenceRefs)}`)}`;
  const refs = goalLoopDecisionArtifactRefs(memory, changePath, decisionId);
  return buildDecision(snapshot, decisionId, refs.artifact, refs.markdownArtifact, now);
}

export async function compileGoalLoopEvaluation(memory: ResolvedMemory, changePath: string): Promise<{ goalLoopDecision: GoalLoopDecision; goalLoopIteration: GoalLoopIteration; goalLoopContinuationBrief: GoalLoopContinuationBrief; goalLoopNextStepPacket: GoalLoopNextStepPacket }> {
  const previousDecision = await readOptional(() => readLatestGoalLoopDecision(memory, changePath));
  const previousIteration = await readOptional(() => readLatestGoalLoopIteration(memory, changePath));
  const decision = await compileGoalLoopDecision(memory, changePath);
  const now = new Date().toISOString();
  const ordinal = (previousIteration?.ordinal ?? 0) + 1;
  const iterationId = `goal-loop-iteration-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${decision.changeId}:${ordinal}:${decision.id}`)}`;
  const refs = goalLoopIterationArtifactRefs(memory, changePath, iterationId);
  const iteration: GoalLoopIteration = {
    version: "1.0",
    id: iterationId,
    changeId: decision.changeId,
    ordinal,
    authority: "non-executing-continuation-evidence",
    trigger: "user-confirmed-evaluate",
    iterationStatus: "recorded",
    continuationVerdict: continuationVerdictForDecision(decision),
    continuationState: continuationStateForDecision(decision),
    controlPolicy: controlPolicyForDecision(decision),
    budgetSignal: budgetSignalForDecision(),
    resumePreconditions: resumePreconditionsForDecision(decision),
    suppressedBecause: suppressionReasonForDecision(decision),
    previousGoalLoopDecisionId: previousDecision?.id,
    previousGoalLoopIterationId: previousIteration?.id,
    goalLoopDecisionId: decision.id,
    decisionKind: decision.decisionKind,
    summary: decision.summary,
    recommendedAction: decision.recommendedAction,
    humanGateRequired: decision.humanGateRequired,
    conflictAssessment: decision.conflictAssessment,
    completionAudit: decision.completionAudit,
    sourceEvidenceRefs: decision.sourceEvidenceRefs,
    executionStarted: false,
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeGoalLoopIteration(memory, changePath, iteration);
  const latestIteration = await readLatestGoalLoopIteration(memory, changePath);
  assertLatestIterationForBrief(latestIteration, iteration, decision);
  const brief = await compileGoalLoopContinuationBrief(memory, changePath, decision, latestIteration);
  const packet = await compileGoalLoopNextStepPacket(memory, changePath, decision, latestIteration, brief);
  return { goalLoopDecision: decision, goalLoopIteration: latestIteration, goalLoopContinuationBrief: brief, goalLoopNextStepPacket: packet };
}

export async function compileGoalLoopContinuationBrief(
  memory: ResolvedMemory,
  changePath: string,
  decision: GoalLoopDecision,
  iteration: GoalLoopIteration,
): Promise<GoalLoopContinuationBrief> {
  assertLatestIterationForBrief(iteration, iteration, decision);
  const now = new Date().toISOString();
  const briefId = `goal-loop-continuation-brief-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${iteration.changeId}:${iteration.id}:${decision.id}`)}`;
  const refs = goalLoopContinuationBriefArtifactRefs(memory, changePath, briefId);
  const brief: GoalLoopContinuationBrief = {
    version: "1.0",
    id: briefId,
    changeId: iteration.changeId,
    authority: "non-executing-continuation-brief-evidence",
    sourceGoalLoopDecisionId: decision.id,
    sourceGoalLoopIterationId: iteration.id,
    iterationOrdinal: iteration.ordinal,
    decisionKind: iteration.decisionKind,
    continuationVerdict: iteration.continuationVerdict,
    continuationState: iteration.continuationState,
    summary: iteration.summary,
    recommendedAction: iteration.recommendedAction,
    humanGateRequired: iteration.humanGateRequired,
    controlPolicy: iteration.controlPolicy,
    budgetSignal: iteration.budgetSignal,
    resumePreconditions: iteration.resumePreconditions,
    suppressedBecause: iteration.suppressedBecause,
    conflictAssessment: iteration.conflictAssessment,
    completionAudit: iteration.completionAudit,
    sourceEvidenceRefs: iteration.sourceEvidenceRefs,
    forbiddenActions: decision.forbiddenActions,
    stalenessInstruction: "Before continuing the Goal/Change, re-read the selected Change, latest Goal Loop evidence, scheduler/runtime evidence, validation/audit evidence, IntegrationCheck/apply state, and current git/worktree state. Treat this brief as stale if any referenced evidence was superseded.",
    mainAgentInstructions: mainAgentInstructionsForBrief(iteration),
    forbiddenExecutionStatements: forbiddenExecutionStatementsForBrief(),
    executionStarted: false,
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeGoalLoopContinuationBrief(memory, changePath, brief);
  const latestBrief = await readLatestGoalLoopContinuationBrief(memory, changePath);
  if (latestBrief.id !== brief.id || latestBrief.sourceGoalLoopIterationId !== iteration.id) {
    throw new Error("GoalLoopContinuationBrief latest pointer mismatch.");
  }
  return latestBrief;
}

export async function compileGoalLoopNextStepPacket(
  memory: ResolvedMemory,
  changePath: string,
  decision: GoalLoopDecision,
  iteration: GoalLoopIteration,
  brief: GoalLoopContinuationBrief,
): Promise<GoalLoopNextStepPacket> {
  assertPacketLineage(decision, iteration, brief);
  const now = new Date().toISOString();
  const packetId = `goal-loop-next-step-packet-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${brief.changeId}:${brief.id}:${iteration.id}:${decision.id}`)}`;
  const refs = goalLoopNextStepPacketArtifactRefs(memory, changePath, packetId);
  const packet: GoalLoopNextStepPacket = {
    version: "1.0",
    id: packetId,
    changeId: brief.changeId,
    authority: "non-executing-main-agent-next-step-packet",
    sourceGoalLoopDecisionId: decision.id,
    sourceGoalLoopIterationId: iteration.id,
    sourceGoalLoopContinuationBriefId: brief.id,
    iterationOrdinal: brief.iterationOrdinal,
    decisionKind: brief.decisionKind,
    continuationVerdict: brief.continuationVerdict,
    continuationState: brief.continuationState,
    recommendationState: recommendationStateForBrief(brief),
    summary: brief.summary,
    recommendedAction: brief.recommendedAction,
    separateGateRequired: Boolean(brief.recommendedAction) || brief.continuationState === "ready-for-human-close-gate",
    humanGateRequired: brief.humanGateRequired,
    revalidationChecklist: revalidationChecklistForPacket(brief),
    mainAgentInstructions: mainAgentPacketInstructions(brief),
    forbiddenExecutionStatements: brief.forbiddenExecutionStatements,
    stalenessInstruction: brief.stalenessInstruction,
    conflictAssessment: brief.conflictAssessment,
    completionAudit: brief.completionAudit,
    sourceEvidenceRefs: brief.sourceEvidenceRefs,
    executionStarted: false,
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeGoalLoopNextStepPacket(memory, changePath, packet);
  const latestPacket = await readLatestGoalLoopNextStepPacket(memory, changePath);
  if (latestPacket.id !== packet.id || latestPacket.sourceGoalLoopContinuationBriefId !== brief.id) {
    throw new Error("GoalLoopNextStepPacket latest pointer mismatch.");
  }
  return latestPacket;
}

function assertPacketLineage(decision: GoalLoopDecision, iteration: GoalLoopIteration, brief: GoalLoopContinuationBrief): void {
  if (iteration.changeId !== decision.changeId || brief.changeId !== decision.changeId) throw new Error("GoalLoopNextStepPacket change scope mismatch.");
  if (iteration.goalLoopDecisionId !== decision.id) throw new Error("GoalLoopNextStepPacket iteration decision lineage mismatch.");
  if (brief.sourceGoalLoopDecisionId !== decision.id) throw new Error("GoalLoopNextStepPacket brief decision lineage mismatch.");
  if (brief.sourceGoalLoopIterationId !== iteration.id) throw new Error("GoalLoopNextStepPacket brief iteration lineage mismatch.");
  if (decision.executionStarted !== false || iteration.executionStarted !== false || brief.executionStarted !== false) {
    throw new Error("GoalLoopNextStepPacket requires non-executing source evidence.");
  }
  if (iteration.controlPolicy.canAutoContinue !== false || iteration.controlPolicy.canAutoExecuteRecommendedAction !== false) {
    throw new Error("GoalLoopNextStepPacket requires evidence-only control policy.");
  }
}

function recommendationStateForBrief(brief: GoalLoopContinuationBrief): GoalLoopNextStepRecommendationState {
  if (brief.recommendedAction) return "separate-gate-required";
  if (brief.continuationState === "ready-for-human-close-gate") return "ready-for-human-close-gate";
  if (brief.continuationState === "blocked") return "blocked";
  return "waiting-for-evidence";
}

function revalidationChecklistForPacket(brief: GoalLoopContinuationBrief): string[] {
  const checklist = [
    "Re-read the selected Change metadata and accepted Spec/Plan/Tasks/AC artifacts.",
    "Re-read latest scheduler/runtime, validation/audit, IntegrationCheck/apply, and Workbench confirmation evidence.",
    "Treat this packet as stale if any source evidence was superseded after it was written.",
    "Do not execute a recommended action from this packet; use the corresponding scoped Harness gate.",
  ];
  if (brief.recommendedAction) {
    checklist.push(`Revalidate required targets for ${brief.recommendedAction.actionType}: ${Object.keys(brief.recommendedAction.scope).join(", ")}.`);
  }
  if (brief.continuationState === "ready-for-human-close-gate") {
    checklist.push("Run the existing Change close gate checks before claiming completion.");
  }
  return checklist;
}

function mainAgentPacketInstructions(brief: GoalLoopContinuationBrief): string[] {
  return [
    ...brief.mainAgentInstructions,
    "Use this packet as a compact resume context for the next explanation or planning turn.",
    "If current evidence no longer matches this packet, record or request a fresh Goal Loop evaluation instead of acting on stale guidance.",
  ];
}

function assertLatestIterationForBrief(latestIteration: GoalLoopIteration, expectedIteration: GoalLoopIteration, decision: GoalLoopDecision): void {
  if (latestIteration.id !== expectedIteration.id) throw new Error("GoalLoopContinuationBrief requires the just-written latest GoalLoopIteration.");
  if (latestIteration.changeId !== decision.changeId) throw new Error("GoalLoopContinuationBrief change scope mismatch.");
  if (latestIteration.goalLoopDecisionId !== decision.id) throw new Error("GoalLoopContinuationBrief decision lineage mismatch.");
  if (latestIteration.executionStarted !== false) throw new Error("GoalLoopContinuationBrief requires non-executing GoalLoopIteration evidence.");
  if (latestIteration.controlPolicy.canAutoContinue !== false || latestIteration.controlPolicy.canAutoExecuteRecommendedAction !== false) {
    throw new Error("GoalLoopContinuationBrief requires non-executing continuation control policy.");
  }
}

function mainAgentInstructionsForBrief(iteration: GoalLoopIteration): string[] {
  const instructions = [
    "Keep the full user objective and selected Change in scope; do not shrink the long-running goal to only the last turn.",
    "Observe current repository evidence before acting; this brief is a handoff aid and may be stale.",
    "Use the recommended action only as an explanation snapshot; the concrete action must be confirmed through its own scoped Harness gate.",
    "If the completion audit is incomplete, keep looping through evidence, rework, integration, or waiting states instead of marking complete.",
    "If evidence conflicts or scope is ambiguous, stop and record a blocked/waiting decision rather than starting parallel work.",
  ];
  if (iteration.continuationState === "ready-for-human-close-gate") {
    instructions.push("Explain close readiness only after re-reading current evidence; Change close still requires the existing human close gate.");
  }
  if (iteration.continuationState === "blocked") {
    instructions.push("Ask for user direction or new evidence before continuing from the blocked state.");
  }
  return instructions;
}

function forbiddenExecutionStatementsForBrief(): string[] {
  return [
    "Do not auto-schedule a continuation turn from this brief.",
    "Do not execute the recommended action from this brief.",
    "Do not start scheduler workers, validation, audit, IntegrationCheck, apply, close, landing, PR, merge, or child Changes from this brief.",
    "Do not treat this brief as workflow truth; Change/ECL and accepted artifacts remain authoritative.",
    "Do not infer Codex token budget or continuation-lock behavior from this brief.",
  ];
}

async function readEvidenceSnapshot(memory: ResolvedMemory, changePath: string): Promise<EvidenceSnapshot> {
  const changeId = await readChangePathChangeId(memory, changePath);
  const sourceEvidenceRefs: GoalLoopSourceEvidenceRef[] = [{
    kind: "change",
    id: changeId,
    status: "active",
    summary: "Selected Change metadata defines the canonical Goal/Change scope.",
  }];
  const planningComplete = hasPlanningArtifacts(memory, changePath);

  const decompositionPlan = await readOptional(() => readLatestDecompositionPlan(memory, changePath));
  if (decompositionPlan) {
    sourceEvidenceRefs.push({
      kind: "DecompositionPlan",
      id: decompositionPlan.id,
      status: decompositionPlan.status,
      artifact: decompositionPlan.artifact,
      summary: `Recommendation: ${decompositionPlan.recommendation}.`,
    });
  }
  const readiness = await readOptional(() => readLatestDecompositionReadinessManifest(memory, changePath));
  if (readiness) {
    sourceEvidenceRefs.push({
      kind: "DecompositionReadinessManifest",
      id: readiness.id,
      status: readiness.status,
      artifact: readiness.artifact,
      summary: `Next allowed action: ${readiness.nextAllowedAction}.`,
    });
  }
  const schedulerRun = await readOptional(() => readLatestSchedulerRun(memory, changePath));
  if (!schedulerRun) {
    return { changeId, planningComplete, sourceEvidenceRefs };
  }
  sourceEvidenceRefs.push({
    kind: "SchedulerRun",
    id: schedulerRun.id,
    status: schedulerRun.status,
    artifact: schedulerRun.artifact,
    summary: "Latest SchedulerRun is the scheduler evidence shell for this Change.",
  });
  const runtimeState = await readSchedulerRuntimeStateProjection(memory, changePath, schedulerRun.id);
  const claimReservation = runtimeState?.lastClaimReservationId
    ? await readSchedulerRuntimeClaimReservationProjection(memory, changePath, schedulerRun.id, runtimeState.lastClaimReservationId)
    : null;
  const workerStarts = await listSchedulerRuntimeWorkerStarts(memory, changePath, schedulerRun.id).catch(() => []);
  const workerPaths = await readWorkerPaths(memory, changePath, schedulerRun.id, workerStarts, claimReservation?.id);
  if (runtimeState) {
    sourceEvidenceRefs.push({
      kind: "SchedulerRuntimeState",
      id: runtimeState.id,
      status: runtimeState.status,
      artifact: runtimeState.artifact,
      summary: `Last reconcile snapshot: ${runtimeState.lastReconcileSnapshotId ?? "none"}.`,
    });
  }
  if (claimReservation) {
    sourceEvidenceRefs.push({
      kind: "SchedulerRuntimeClaimReservation",
      id: claimReservation.id,
      status: claimReservation.status,
      artifact: claimReservation.artifact,
      summary: `${claimReservation.reservedCount} reserved, ${claimReservation.blockedCount} blocked.`,
    });
  }
  for (const path of workerPaths) {
    pushWorkerPathEvidence(sourceEvidenceRefs, path);
  }
  const integrationCandidate = await readLatestSchedulerIntegrationCandidateProjection(memory, changePath, schedulerRun.id);
  const integrationHandoff = await readLatestSchedulerIntegrationCheckHandoffProjection(memory, changePath, schedulerRun.id);
  const integrationOutcome = await readLatestSchedulerIntegrationOutcomeProjection(memory, changePath, schedulerRun.id);
  const runCompletion = await readLatestSchedulerRunCompletionProjection(memory, changePath, schedulerRun.id);
  const runCloseout = await readLatestSchedulerRunBlockedCloseoutProjection(memory, changePath, schedulerRun.id);
  const workerPathLikes = workerPaths.map(workerPathLike);
  const nextReservationIntent = claimReservation ? findNextSchedulerReservationIntentForWorkerPaths(claimReservation, workerPathLikes) : null;
  const integrationCandidateNeedsRefresh = schedulerIntegrationCandidateNeedsRefresh(integrationCandidate, workerPathLikes);
  for (const evidence of [
    ["SchedulerIntegrationCandidate", integrationCandidate],
    ["SchedulerIntegrationCheckHandoff", integrationHandoff],
    ["SchedulerIntegrationOutcome", integrationOutcome],
    ["SchedulerRunCompletion", runCompletion],
    ["SchedulerRunBlockedCloseout", runCloseout],
  ] as const) {
    if (!evidence[1]) continue;
    sourceEvidenceRefs.push({
      kind: evidence[0],
      id: evidence[1].id,
      status: evidence[1].status,
      artifact: evidence[1].artifact,
      summary: `${evidence[0]} is present for the latest SchedulerRun.`,
    });
  }
  return {
    changeId,
    planningComplete,
    sourceEvidenceRefs,
    schedulerRun,
    runtimeState,
    claimReservation,
    integrationCandidate,
    integrationHandoff,
    integrationOutcome,
    runCompletion,
    runCloseout,
    workerStarts,
    workerPaths,
    currentWorkerPath: workerPaths.find((path) => !path.terminal) ?? null,
    nextReservationIntent,
    integrationCandidateNeedsRefresh,
  };
}

function buildDecision(snapshot: EvidenceSnapshot, id: string, artifact: string, markdownArtifact: string, now: string): GoalLoopDecision {
  const forbiddenActions = defaultForbiddenActions();
  const conflictAssessment = assessConflict(snapshot);
  const completionAudit = auditCompletion(snapshot);
  let decisionKind: GoalLoopDecisionKind = "wait-for-evidence";
  let summary = "Current evidence is not sufficient to recommend an execution transition.";
  let recommendedAction: GoalLoopRecommendedAction | undefined;
  let humanGateRequired = true;

  if (!snapshot.planningComplete) {
    decisionKind = "planning-needed";
    summary = "Accepted Spec/Plan/Tasks/AC evidence is incomplete; continue planning before execution.";
  } else if (snapshot.runCompletion) {
    decisionKind = "completed-ready-for-human-close-gate";
    summary = "SchedulerRun completion evidence exists; the main Agent may explain close readiness, but close still needs the existing human gate.";
  } else if (snapshot.runCloseout) {
    decisionKind = "blocked";
    summary = "SchedulerRun blocked/exhausted closeout evidence exists; do not continue execution without user direction.";
  } else if (snapshot.integrationOutcome && snapshot.schedulerRun) {
    decisionKind = "human-gate";
    summary = "Scheduler integration outcome exists; the next legal step is to record SchedulerRun completion through its existing gate.";
    recommendedAction = buildRecommendedAction("planning.scheduler.run.complete", {
      changeId: snapshot.changeId,
      schedulerRunId: snapshot.schedulerRun.id,
      schedulerIntegrationOutcomeId: snapshot.integrationOutcome.id,
    }, "Record SchedulerRun completion from the terminal scheduler integration outcome.");
  } else if (snapshot.integrationHandoff && snapshot.schedulerRun) {
    decisionKind = "integration-needed";
    const terminalIntegrationStatus = snapshot.integrationHandoff.integrationCheckStatus && snapshot.integrationHandoff.integrationCheckStatus !== "passed";
    if (terminalIntegrationStatus) {
      summary = "Scheduler IntegrationCheck handoff has a terminal result; the next legal step is outcome reconciliation.";
      recommendedAction = buildRecommendedAction("planning.scheduler.integration-outcome.reconcile", {
        changeId: snapshot.changeId,
        schedulerRunId: snapshot.schedulerRun.id,
        schedulerIntegrationCheckHandoffId: snapshot.integrationHandoff.id,
      }, "Record scheduler-owned integration outcome evidence from the existing IntegrationCheck result.");
    } else {
      summary = "Scheduler IntegrationCheck handoff exists and is waiting on the existing apply/discard path before scheduler outcome reconciliation.";
    }
  } else if (snapshot.integrationCandidate && snapshot.integrationCandidate.readyCount >= 2 && snapshot.schedulerRun) {
    decisionKind = "integration-needed";
    summary = "At least two scheduler outputs are ready; the next legal step is the existing IntegrationCheck handoff.";
    recommendedAction = buildRecommendedAction("planning.scheduler.integration-check.run", {
      changeId: snapshot.changeId,
      schedulerRunId: snapshot.schedulerRun.id,
      schedulerIntegrationCandidateId: snapshot.integrationCandidate.id,
    }, "Run the existing IntegrationCheck handoff for ready scheduler outputs.");
  } else if (snapshot.schedulerRun && snapshot.claimReservation) {
    const workerPathRecommendation = recommendCurrentWorkerPath(snapshot);
    if (workerPathRecommendation) {
      decisionKind = "scheduler-next-step";
      summary = workerPathRecommendation.summary;
      recommendedAction = workerPathRecommendation.recommendedAction;
    } else if (snapshot.integrationCandidateNeedsRefresh && snapshot.workerPaths?.some((path) => hasApprovedWorkerOutput(path))) {
      decisionKind = "integration-needed";
      summary = "Scheduler worker output has passed audit and the SchedulerIntegrationCandidate is missing or stale; refresh the existing integration candidate evidence.";
      recommendedAction = buildRecommendedAction("planning.scheduler.integration-candidate.compile", {
        changeId: snapshot.changeId,
        schedulerRunId: snapshot.schedulerRun.id,
      }, "Compile or refresh scheduler-owned integration candidate evidence from approved worker outputs.");
    } else if (snapshot.integrationCandidate && snapshot.integrationCandidate.readyCount < 2 && snapshot.nextReservationIntent) {
      decisionKind = "scheduler-next-step";
      summary = "Scheduler integration candidate is waiting for more ready targets and another reserved claim is available; the next legal step is the existing start-next gate.";
      recommendedAction = buildRecommendedAction("planning.scheduler.worker.start-next", {
        changeId: snapshot.changeId,
        schedulerRunId: snapshot.schedulerRun.id,
        schedulerClaimReservationId: snapshot.claimReservation.id,
        reservationIntentId: snapshot.nextReservationIntent.reservationIntentId,
        claimIntentId: snapshot.nextReservationIntent.claimIntentId,
      }, "Start exactly one additional scheduler worker through the existing scoped gate.");
    } else if (snapshot.integrationCandidate && snapshot.integrationCandidate.readyCount < 2 && !snapshot.nextReservationIntent && (snapshot.workerPaths ?? []).every((path) => path.terminal)) {
      decisionKind = "blocked";
      summary = "Scheduler candidate cannot reach IntegrationCheck readiness and no further reserved claim is available; the next legal step is blocked/exhausted closeout.";
      recommendedAction = buildRecommendedAction("planning.scheduler.run.close-blocked", {
        changeId: snapshot.changeId,
        schedulerRunId: snapshot.schedulerRun.id,
        schedulerClaimReservationId: snapshot.claimReservation.id,
        schedulerIntegrationCandidateId: snapshot.integrationCandidate.id,
      }, "Record scheduler blocked/exhausted closeout through the existing human-gated path.");
    } else {
      const workerStartCount = snapshot.workerStarts?.length ?? 0;
      if (workerStartCount === 0 && snapshot.claimReservation.reservedCount > 0) {
      decisionKind = "scheduler-next-step";
      summary = "A reserved scheduler claim is available and no scheduler worker has started yet; the first worker start remains a separate human-gated action.";
      recommendedAction = buildRecommendedAction("planning.scheduler.worker.start-first", {
        changeId: snapshot.changeId,
        schedulerRunId: snapshot.schedulerRun.id,
        schedulerClaimReservationId: snapshot.claimReservation.id,
      }, "Start exactly one first scheduler worker through the existing scoped worker gate.");
      } else {
        decisionKind = "wait-for-evidence";
        summary = workerStartCount > 0
          ? "Scheduler worker evidence already exists, but no current worker path has a legal next gate yet."
          : "Scheduler claim reservation exists, but no reserved claim is currently recommendable.";
      }
    }
  } else {
    decisionKind = "parallel-plan-needed";
    summary = "Planning evidence exists, but scheduler plan evidence is not prepared yet.";
    recommendedAction = buildRecommendedAction("planning.scheduler.plan.prepare", {
      changeId: snapshot.changeId,
    }, "Prepare non-executing scheduler plan evidence before any worker start.");
  }

  if (recommendedAction) {
    humanGateRequired = true;
  }

  return {
    version: "1.0",
    id,
    changeId: snapshot.changeId,
    authority: "non-executing-planning-evidence",
    decisionKind,
    summary,
    recommendedAction,
    humanGateRequired,
    forbiddenActions,
    conflictAssessment,
    completionAudit,
    sourceEvidenceRefs: snapshot.sourceEvidenceRefs,
    executionStarted: false,
    artifact,
    markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
}

async function readWorkerPaths(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId: string,
  workerStarts: SchedulerRuntimeWorkerStart[],
  schedulerClaimReservationId?: string,
): Promise<GoalLoopSchedulerWorkerPath[]> {
  const scoped = schedulerClaimReservationId
    ? workerStarts.filter((start) => start.schedulerClaimReservationId === schedulerClaimReservationId)
    : workerStarts;
  const paths: GoalLoopSchedulerWorkerPath[] = [];
  for (const start of scoped) {
    const result = await findSchedulerRuntimeWorkerResultForStart(memory, changePath, schedulerRunId, start.id).catch(() => null);
    const validation = result ? await findSchedulerRuntimeWorkerValidationForResult(memory, changePath, schedulerRunId, result.id).catch(() => null) : null;
    const audit = validation ? await findSchedulerRuntimeWorkerAuditForValidation(memory, changePath, schedulerRunId, validation.id).catch(() => null) : null;
    const reworkPlan = validation ? await findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence(memory, changePath, schedulerRunId, {
      workerValidationId: validation.id,
      ...(audit ? { workerAuditId: audit.id } : {}),
    }).catch(() => null) : null;
    const reworkStart = reworkPlan ? await findSchedulerRuntimeWorkerReworkStartForPlan(memory, changePath, schedulerRunId, reworkPlan.id).catch(() => null) : null;
    const reworkResult = reworkStart ? await findSchedulerRuntimeWorkerReworkResultForStart(memory, changePath, schedulerRunId, reworkStart.id).catch(() => null) : null;
    const reworkValidation = reworkResult ? await findSchedulerRuntimeWorkerReworkValidationForResult(memory, changePath, schedulerRunId, reworkResult.id).catch(() => null) : null;
    const reworkAudit = reworkValidation ? await findSchedulerRuntimeWorkerReworkAuditForValidation(memory, changePath, schedulerRunId, reworkValidation.id).catch(() => null) : null;
    paths.push({
      start,
      result,
      validation,
      audit,
      reworkPlan,
      reworkStart,
      reworkResult,
      reworkValidation,
      reworkAudit,
      terminal: isTerminalWorkerPath({
        start,
        result,
        validation,
        audit,
        reworkPlan,
        reworkStart,
        reworkResult,
        reworkValidation,
        reworkAudit,
      }),
    });
  }
  return paths.sort((a, b) => (a.start.updatedAt ?? "").localeCompare(b.start.updatedAt ?? ""));
}

function pushWorkerPathEvidence(refs: GoalLoopSourceEvidenceRef[], path: GoalLoopSchedulerWorkerPath): void {
  refs.push({
    kind: "SchedulerRuntimeWorkerStart",
    id: path.start.id,
    status: path.start.status,
    artifact: path.start.artifact,
    summary: `Worker ${path.start.claimIntentId} start evidence exists.`,
  });
  for (const evidence of [
    ["SchedulerRuntimeWorkerResult", path.result],
    ["SchedulerRuntimeWorkerValidation", path.validation],
    ["SchedulerRuntimeWorkerAudit", path.audit],
    ["SchedulerRuntimeWorkerReworkPlan", path.reworkPlan],
    ["SchedulerRuntimeWorkerReworkStart", path.reworkStart],
    ["SchedulerRuntimeWorkerReworkResult", path.reworkResult],
    ["SchedulerRuntimeWorkerReworkValidation", path.reworkValidation],
    ["SchedulerRuntimeWorkerReworkAudit", path.reworkAudit],
  ] as const) {
    if (!evidence[1]) continue;
    refs.push({
      kind: evidence[0],
      id: evidence[1].id,
      status: evidence[1].status,
      artifact: evidence[1].artifact,
      summary: `${evidence[0]} is present for claim ${path.start.claimIntentId}.`,
    });
  }
}

function workerPathLike(path: GoalLoopSchedulerWorkerPath): SchedulerWorkerPathLike {
  return {
    start: {
      reservationIntentId: path.start.reservationIntentId,
      updatedAt: path.start.updatedAt,
    },
    terminal: path.terminal,
    ...(path.audit ? { audit: { status: path.audit.status, claimIntentId: path.audit.claimIntentId } } : {}),
    ...(path.reworkAudit ? { reworkAudit: { status: path.reworkAudit.status, claimIntentId: path.reworkAudit.claimIntentId } } : {}),
  };
}

function isTerminalWorkerPath(path: Omit<GoalLoopSchedulerWorkerPath, "terminal">): boolean {
  if (path.start.status === "failed") return true;
  if (path.result?.status === "failed") return true;
  if (path.audit?.status === "approved" || path.audit?.status === "approved-with-notes") return true;
  if (path.reworkStart?.status === "failed") return true;
  if (path.reworkResult?.status === "failed") return true;
  if (path.reworkValidation?.status === "failed") return true;
  if (path.reworkAudit?.status === "approved" || path.reworkAudit?.status === "approved-with-notes") return true;
  if (path.reworkAudit?.status === "blocked" || path.reworkAudit?.status === "failed") return true;
  return false;
}

function hasApprovedWorkerOutput(path: GoalLoopSchedulerWorkerPath): boolean {
  return path.audit?.status === "approved"
    || path.audit?.status === "approved-with-notes"
    || path.reworkAudit?.status === "approved"
    || path.reworkAudit?.status === "approved-with-notes";
}

function buildRecommendedAction(actionType: WorkflowActionType, scope: Record<string, string | string[]>, reason: string): GoalLoopRecommendedAction | undefined {
  const issues = validateWorkflowActionRequiredTargets({ actionType, ...scope });
  if (issues.length > 0) return undefined;
  return { actionType, scope, reason };
}

function recommendCurrentWorkerPath(snapshot: EvidenceSnapshot): { summary: string; recommendedAction?: GoalLoopRecommendedAction } | null {
  if (!snapshot.schedulerRun) return null;
  const path = snapshot.currentWorkerPath;
  if (!path) return null;
  const baseScope = {
    changeId: snapshot.changeId,
    schedulerRunId: snapshot.schedulerRun.id,
  };
  if (!path.result) {
    return {
      summary: "A scheduler worker has started; the next legal step is to reconcile its code run / TaskRun / WorkerLease result.",
      recommendedAction: buildRecommendedAction("planning.scheduler.worker.reconcile-result", {
        ...baseScope,
        schedulerWorkerStartId: path.start.id,
      }, "Check the current scheduler worker result through the existing result reconcile gate."),
    };
  }
  if (path.result.status !== "evidence-ready") {
    return {
      summary: `Scheduler worker result is ${path.result.status}; wait for terminal evidence before validation.`,
    };
  }
  if (!path.validation) {
    return {
      summary: "Scheduler worker result is evidence-ready; the next legal step is scoped validation on the same worktree.",
      recommendedAction: buildRecommendedAction("planning.scheduler.worker.validate-first", {
        ...baseScope,
        schedulerWorkerResultId: path.result.id,
      }, "Validate the current scheduler worker output through the existing scoped validation gate."),
    };
  }
  const needsReworkPlan = path.validation.status === "failed"
    || (path.validation.status === "passed" && (path.audit?.status === "blocked" || path.audit?.status === "failed"));
  if (needsReworkPlan) {
    if (!path.reworkPlan) {
      return {
        summary: "Scheduler worker quality evidence is blocked or failed; the next legal step is a bounded rework plan.",
        recommendedAction: buildRecommendedAction("planning.scheduler.worker.rework-plan.compile", {
          ...baseScope,
          schedulerWorkerValidationId: path.validation.id,
          ...(path.audit ? { schedulerWorkerAuditId: path.audit.id } : {}),
        }, "Compile bounded rework planning evidence for the current scheduler worker path."),
      };
    }
    if (!path.reworkStart) {
      return {
        summary: "Scheduler worker rework plan exists; the next legal step is the existing same-worktree rework start gate.",
        recommendedAction: buildRecommendedAction("planning.scheduler.worker.rework-start-first", {
          ...baseScope,
          schedulerWorkerReworkPlanId: path.reworkPlan.id,
        }, "Start one scoped rework worker through the existing scheduler rework gate."),
      };
    }
    if (!path.reworkResult) {
      return {
        summary: "Scheduler worker rework has started; the next legal step is to reconcile its rework result.",
        recommendedAction: buildRecommendedAction("planning.scheduler.worker.rework-reconcile-result", {
          ...baseScope,
          schedulerWorkerReworkStartId: path.reworkStart.id,
        }, "Check the current scheduler rework result through the existing result reconcile gate."),
      };
    }
    if (path.reworkResult.status !== "evidence-ready") {
      return {
        summary: `Scheduler worker rework result is ${path.reworkResult.status}; wait for terminal rework evidence before validation.`,
      };
    }
    if (!path.reworkValidation) {
      return {
        summary: "Scheduler worker rework result is evidence-ready; the next legal step is scoped rework validation on the same worktree.",
        recommendedAction: buildRecommendedAction("planning.scheduler.worker.rework-validate-first", {
          ...baseScope,
          schedulerWorkerReworkResultId: path.reworkResult.id,
        }, "Validate the current scheduler rework output through the existing scoped validation gate."),
      };
    }
    if (path.reworkValidation.status !== "passed") {
      return {
        summary: `Scheduler worker rework validation is ${path.reworkValidation.status}; this path needs user direction or another future rework gate.`,
      };
    }
    if (!path.reworkAudit) {
      return {
        summary: "Scheduler worker rework validation passed; the next legal step is scoped rework audit on the same worktree.",
        recommendedAction: buildRecommendedAction("planning.scheduler.worker.rework-audit-first", {
          ...baseScope,
          schedulerWorkerReworkValidationId: path.reworkValidation.id,
        }, "Audit the current scheduler rework output through the existing scoped audit gate."),
      };
    }
    return null;
  }
  if (path.validation.status !== "passed") {
    return {
      summary: `Scheduler worker validation is ${path.validation.status}; wait for valid blocking evidence before continuing.`,
    };
  }
  if (!path.audit) {
    return {
      summary: "Scheduler worker validation passed; the next legal step is scoped audit on the same worktree.",
      recommendedAction: buildRecommendedAction("planning.scheduler.worker.audit-first", {
        ...baseScope,
        schedulerWorkerValidationId: path.validation.id,
      }, "Audit the current scheduler worker output through the existing scoped audit gate."),
    };
  }
  if (path.audit.status === "approved" || path.audit.status === "approved-with-notes") return null;
  return {
    summary: `Scheduler worker audit is ${path.audit.status}; wait for bounded rework planning or user direction.`,
  };
}

function continuationVerdictForDecision(decision: GoalLoopDecision): GoalLoopContinuationVerdict {
  if (decision.decisionKind === "completed-ready-for-human-close-gate") return "ready-for-human-close-gate";
  if (decision.decisionKind === "blocked") return "blocked";
  if (decision.recommendedAction) return "recommend-existing-gate";
  return "wait";
}

function continuationStateForDecision(decision: GoalLoopDecision): GoalLoopContinuationState {
  if (decision.decisionKind === "completed-ready-for-human-close-gate") return "ready-for-human-close-gate";
  if (decision.decisionKind === "blocked") return "blocked";
  if (decision.recommendedAction) return "ready-for-existing-gate";
  return "waiting-for-evidence";
}

function controlPolicyForDecision(decision: GoalLoopDecision): GoalLoopControlPolicy {
  const recommended = decision.recommendedAction;
  return {
    authority: "evidence-only-control-constraints",
    canAutoContinue: false,
    canAutoExecuteRecommendedAction: false,
    requiresHumanGate: true,
    recommendedActionType: recommended?.actionType,
    reason: recommended
      ? `The existing ${recommended.actionType} gate may be recommended, but it must be confirmed separately.`
      : "No executable continuation is authorized by this Goal Loop iteration.",
  };
}

function budgetSignalForDecision(): GoalLoopBudgetSignal {
  return {
    status: "unknown",
    summary: "No canonical AHO goal budget/accounting source is attached to this Change; no token or time budget authority is inferred.",
  };
}

function resumePreconditionsForDecision(decision: GoalLoopDecision): GoalLoopResumePrecondition[] {
  const preconditions: GoalLoopResumePrecondition[] = [{
    kind: "selected-change-scope",
    id: decision.changeId,
    satisfied: true,
    summary: "Selected Change scope was resolved before writing Goal Loop evidence.",
  }];
  if (decision.recommendedAction) {
    preconditions.push({
      kind: "separate-human-gated-action",
      id: decision.recommendedAction.actionType,
      satisfied: false,
      summary: `${decision.recommendedAction.actionType} must be confirmed through its own scoped Harness gate.`,
    });
  } else if (decision.decisionKind === "completed-ready-for-human-close-gate") {
    preconditions.push({
      kind: "change-close-human-gate",
      satisfied: false,
      summary: "Close readiness must still pass the existing Change close human gate.",
    });
  } else if (decision.decisionKind === "blocked") {
    preconditions.push({
      kind: "user-direction",
      satisfied: false,
      summary: "Blocked Goal Loop state requires explicit user direction or new evidence.",
    });
  } else {
    preconditions.push({
      kind: "additional-evidence",
      satisfied: false,
      summary: "Additional Harness evidence is required before the next concrete gate can be recommended.",
    });
  }
  return preconditions;
}

function suppressionReasonForDecision(decision: GoalLoopDecision): GoalLoopSuppressionReason | undefined {
  if (decision.recommendedAction) {
    return {
      reason: "specific-gate-required",
      summary: "The recommended action remains a separate Harness gate and is not executed by Goal Loop evaluation.",
    };
  }
  if (decision.decisionKind === "completed-ready-for-human-close-gate") {
    return {
      reason: "ready-for-human-close-gate",
      summary: "Goal Loop may explain close readiness, but close is suppressed until the existing human gate is confirmed.",
    };
  }
  if (decision.decisionKind === "blocked") {
    return {
      reason: "blocked",
      summary: "Continuation is suppressed because the current evidence is blocked.",
    };
  }
  return {
    reason: "waiting-for-evidence",
    summary: "Continuation is suppressed until additional evidence appears or a concrete Harness gate becomes available.",
  };
}

function assessConflict(snapshot: EvidenceSnapshot): GoalLoopConflictAssessment {
  if (!snapshot.planningComplete) {
    return { level: "unknown", parallelEligible: false, reasons: ["Planning artifacts are incomplete."] };
  }
  if (snapshot.claimReservation?.blockedCount) {
    return { level: "high", parallelEligible: false, reasons: ["Latest scheduler claim reservation contains blocked claims."] };
  }
  if (snapshot.claimReservation?.reservedCount) {
    return { level: "low", parallelEligible: true, reasons: ["Latest scheduler claim reservation has reserved claims; actual worker start remains human-gated."] };
  }
  return { level: "unknown", parallelEligible: false, reasons: ["No current claim reservation proves low-conflict parallel work."] };
}

function auditCompletion(snapshot: EvidenceSnapshot): GoalLoopCompletionAudit {
  if (snapshot.runCompletion) {
    return {
      status: "ready-for-human-close-gate",
      evidence: [`SchedulerRunCompletion ${snapshot.runCompletion.id}`],
      missing: ["Existing Change close human gate."],
    };
  }
  if (snapshot.runCloseout) {
    return {
      status: "blocked",
      evidence: [`SchedulerRunBlockedCloseout ${snapshot.runCloseout.id}`],
      missing: ["User direction for blocked/exhausted scheduler path."],
    };
  }
  return {
    status: "incomplete",
    evidence: snapshot.sourceEvidenceRefs.map((ref) => `${ref.kind}${ref.id ? ` ${ref.id}` : ""}`),
    missing: ["Evidence proving the full Goal/Change is complete."],
  };
}

function defaultForbiddenActions(): GoalLoopForbiddenAction[] {
  return [
    { actionType: "scheduler-loop", reason: "GoalLoopDecision is policy evidence, not a scheduler loop." },
    { actionType: "parallel-start-all", reason: "Whole-wave or start-all dispatch is out of scope." },
    { actionType: "source-apply", reason: "Source mutation must use existing IntegrationCheck/apply human gates." },
    { actionType: "change-close", reason: "Close remains an explicit Change lifecycle human gate." },
  ];
}

function hasPlanningArtifacts(memory: ResolvedMemory, changePath: string): boolean {
  const root = join(memory.memoryRoot, changePath);
  return ["spec.md", "plan.md", "tasks.md", "ac-map.json"].every((file) => existsSync(join(root, file)));
}

async function readOptional<T>(reader: () => Promise<T>): Promise<T | null> {
  try {
    return await reader();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}
