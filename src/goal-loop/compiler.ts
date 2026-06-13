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
  listSchedulerRuntimeWorkerStarts,
  readLatestSchedulerIntegrationCandidateProjection,
  readLatestSchedulerIntegrationCheckHandoffProjection,
  readLatestSchedulerIntegrationOutcomeProjection,
  readLatestSchedulerRunBlockedCloseoutProjection,
  readLatestSchedulerRunCompletionProjection,
  readSchedulerRuntimeClaimReservationProjection,
  readSchedulerRuntimeStateProjection,
} from "../scheduler-runtime/repository.js";
import type { SchedulerRuntimeClaimReservation, SchedulerRuntimeState, SchedulerRuntimeWorkerStart } from "../scheduler-runtime/types.js";
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
  integrationCandidate?: { id: string; status: string; readyTargetCount?: number; artifact?: string } | null;
  integrationHandoff?: { id: string; status: string; artifact?: string } | null;
  integrationOutcome?: { id: string; status: string; artifact?: string } | null;
  runCompletion?: { id: string; status: string; artifact?: string } | null;
  runCloseout?: { id: string; status: string; artifact?: string } | null;
}

export async function compileGoalLoopDecision(memory: ResolvedMemory, changePath: string): Promise<GoalLoopDecision> {
  const snapshot = await readEvidenceSnapshot(memory, changePath);
  const now = new Date().toISOString();
  const decisionId = `goal-loop-decision-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${snapshot.changeId}:${now}:${JSON.stringify(snapshot.sourceEvidenceRefs)}`)}`;
  const refs = goalLoopDecisionArtifactRefs(memory, changePath, decisionId);
  const decision = buildDecision(snapshot, decisionId, refs.artifact, refs.markdownArtifact, now);
  await writeGoalLoopDecision(memory, changePath, decision);
  return decision;
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
  const integrationCandidate = await readLatestSchedulerIntegrationCandidateProjection(memory, changePath, schedulerRun.id);
  const integrationHandoff = await readLatestSchedulerIntegrationCheckHandoffProjection(memory, changePath, schedulerRun.id);
  const integrationOutcome = await readLatestSchedulerIntegrationOutcomeProjection(memory, changePath, schedulerRun.id);
  const runCompletion = await readLatestSchedulerRunCompletionProjection(memory, changePath, schedulerRun.id);
  const runCloseout = await readLatestSchedulerRunBlockedCloseoutProjection(memory, changePath, schedulerRun.id);
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
  } else if (snapshot.integrationOutcome) {
    decisionKind = "human-gate";
    summary = "Scheduler integration outcome exists; source mutation or close remains controlled by existing human gates.";
  } else if (snapshot.integrationCandidate && (snapshot.integrationCandidate.readyTargetCount ?? 0) >= 2 && snapshot.schedulerRun) {
    decisionKind = "integration-needed";
    summary = "At least two scheduler outputs are ready; the next legal step is the existing IntegrationCheck handoff.";
    recommendedAction = buildRecommendedAction("planning.scheduler.integration-check.run", {
      changeId: snapshot.changeId,
      schedulerRunId: snapshot.schedulerRun.id,
      schedulerIntegrationCandidateId: snapshot.integrationCandidate.id,
    }, "Run the existing IntegrationCheck handoff for ready scheduler outputs.");
  } else if (snapshot.schedulerRun && snapshot.claimReservation) {
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
        ? "Scheduler worker evidence already exists; observe and reconcile the current worker path before recommending another start."
        : "Scheduler claim reservation exists, but no reserved claim is currently recommendable.";
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

function buildRecommendedAction(actionType: WorkflowActionType, scope: Record<string, string | string[]>, reason: string): GoalLoopRecommendedAction | undefined {
  const issues = validateWorkflowActionRequiredTargets({ actionType, ...scope });
  if (issues.length > 0) return undefined;
  return { actionType, scope, reason };
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
