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
  goalLoopDecisionArtifactRefs,
  goalLoopIterationArtifactRefs,
  readLatestGoalLoopDecision,
  readLatestGoalLoopIteration,
  writeGoalLoopDecision,
  writeGoalLoopIteration,
} from "./repository.js";
import type {
  GoalLoopCompletionAudit,
  GoalLoopConflictAssessment,
  GoalLoopDecision,
  GoalLoopDecisionKind,
  GoalLoopForbiddenAction,
  GoalLoopContinuationVerdict,
  GoalLoopIteration,
  GoalLoopRecommendedAction,
  GoalLoopSourceEvidenceRef,
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

export async function compileGoalLoopEvaluation(memory: ResolvedMemory, changePath: string): Promise<{ goalLoopDecision: GoalLoopDecision; goalLoopIteration: GoalLoopIteration }> {
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
  return { goalLoopDecision: decision, goalLoopIteration: iteration };
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
