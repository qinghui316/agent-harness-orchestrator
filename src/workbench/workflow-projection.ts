import type { ResolvedMemory, WorkflowRunSummary } from "../types/index.js";
import {
  readSchedulerReconcileSnapshotProjection,
  readSchedulerReconcileSnapshotByIdProjection,
  readSchedulerRuntimeClaimReservationProjection,
  readSchedulerRuntimeStateProjection,
  type SchedulerReconcileSnapshot,
  type SchedulerRuntimeClaimReservation,
  type SchedulerRuntimeState,
} from "../scheduler-runtime/manager.js";
import {
  readLatestDecompositionPlan,
  readLatestDecompositionReadinessManifest,
  readLatestTaskQueueProposal,
  readLatestWorkflowGraphPlan,
  readWorkflowGraphPlan,
  type DecompositionPlan,
  type DecompositionReadinessManifest,
  type DecompositionRecommendation,
  type TaskQueueProposal,
  type WorkflowGraphPlan,
} from "../workflow-artifacts/manager.js";
import {
  readLatestSchedulerClaimReconcilePlan,
  readLatestSchedulerLaunchPreflight,
  readLatestSchedulerRun,
  readLatestSchedulerDispatchDryRun,
  readLatestSchedulerContract,
  readLatestSchedulerWorkerSessionPlan,
  readSchedulerClaimReconcilePlan,
  readSchedulerLaunchPreflight,
  readSchedulerRun,
  readSchedulerRunJournal,
  readSchedulerDispatchDryRun,
  readSchedulerContract,
  readSchedulerWorkerSessionPlan,
  type SchedulerClaimReconcilePlan,
  type SchedulerLaunchPreflight,
  type SchedulerRun,
  type SchedulerWorkerSessionPlan,
  type SchedulerDispatchDryRun,
  type SchedulerContract,
} from "../workflow-scheduler/manager.js";

export interface WorkbenchDecompositionPlanSummary {
  id: string;
  changeId: string;
  status: DecompositionPlan["status"];
  recommendation: DecompositionRecommendation;
  rationale: string;
  unitCount: number;
  dependencyCount: number;
  conflictScopeCount: number;
  riskSummary: string;
  openQuestionCount: number;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchDecompositionReadinessSummary {
  id: string;
  changeId: string;
  decompositionPlanId: string;
  status: DecompositionReadinessManifest["status"];
  recommendation: DecompositionRecommendation;
  schedulerEligible: boolean;
  nextAllowedAction: DecompositionReadinessManifest["nextAllowedAction"];
  guardrailStatus: "passed" | "blocked" | "failed";
  unitCount: number;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchTaskQueueProposalSummary {
  id: string;
  changeId: string;
  decompositionPlanId: string;
  readinessManifestId: string;
  status: TaskQueueProposal["status"];
  queueMode: TaskQueueProposal["queueMode"];
  itemCount: number;
  dependencyCount: number;
  conflictScopeCount: number;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchWorkflowGraphPlanSummary {
  id: string;
  changeId: string;
  status: WorkflowGraphPlan["status"];
  graphMode: WorkflowGraphPlan["graphMode"];
  taskQueueProposalId: string;
  readinessManifestId: string;
  nodeCount: number;
  edgeCount: number;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerContractSummary {
  id: string;
  changeId: string;
  status: SchedulerContract["status"];
  schedulerMode: SchedulerContract["schedulerMode"];
  decompositionPlanId: string;
  readinessManifestId: string;
  nodeCount: number;
  waveCount: number;
  dependencyCount: number;
  conflictCount: number;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerDispatchDryRunSummary {
  id: string;
  changeId: string;
  status: SchedulerDispatchDryRun["status"];
  schedulerMode: SchedulerDispatchDryRun["schedulerMode"];
  schedulerContractId: string;
  waveCount: number;
  nodeCount: number;
  blockedCount: number;
  estimatedMaxWaveWidth: number;
  prerequisiteCount: number;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerWorkerSessionPlanSummary {
  id: string;
  changeId: string;
  status: SchedulerWorkerSessionPlan["status"];
  schedulerMode: SchedulerWorkerSessionPlan["schedulerMode"];
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  plannedWorkerCount: number;
  stageCount: number;
  blockedCount: number;
  warningCount: number;
  recoveryKeyCoverage: SchedulerWorkerSessionPlan["recoveryKeyCoverage"];
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerClaimReconcilePlanSummary {
  id: string;
  changeId: string;
  status: SchedulerClaimReconcilePlan["status"];
  schedulerMode: SchedulerClaimReconcilePlan["schedulerMode"];
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  waveCount: number;
  claimIntentCount: number;
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  recoveryKeyCoverage: SchedulerClaimReconcilePlan["recoveryKeyCoverage"];
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerLaunchPreflightSummary {
  id: string;
  changeId: string;
  status: SchedulerLaunchPreflight["status"];
  schedulerMode: SchedulerLaunchPreflight["schedulerMode"];
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  claimIntentCount: number;
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  humanGateRequired: boolean;
  toolPolicyGateRequired: boolean;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerRunSummary {
  id: string;
  changeId: string;
  status: SchedulerRun["status"];
  schedulerMode: SchedulerRun["schedulerMode"];
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  claimIntentCount: number;
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  humanConfirmed: boolean;
  futureToolPolicyGateRequired: boolean;
  futureHumanGateRequired: boolean;
  journalEventCount: number;
  artifact?: string;
  markdownArtifact?: string;
  journalArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerRuntimeSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  status: SchedulerRuntimeState["status"];
  schedulerMode: SchedulerRuntimeState["schedulerMode"];
  claimIntentCount: number;
  waveCount: number;
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  lastReconcileSnapshotId?: string;
  lastClaimReservationId?: string;
  lastClaimReservationSnapshotId?: string;
  artifact?: string;
  eventsArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerClaimReservationSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerReconcileSnapshotId: string;
  status: SchedulerRuntimeClaimReservation["status"];
  schedulerMode: SchedulerRuntimeClaimReservation["schedulerMode"];
  reservedCount: number;
  blockedCount: number;
  sourceLockCount: number;
  waveIndex: number;
  launchConfirmed?: boolean;
  supersedesReservationId?: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerReconcileSnapshotSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  status: SchedulerReconcileSnapshot["status"];
  schedulerMode: SchedulerReconcileSnapshot["schedulerMode"];
  claimIntentCount: number;
  waveCount: number;
  plannedSlotDemand: number;
  maxPlannedWaveWidth: number;
  blockedCount: number;
  warningCount: number;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

type WorkflowProjectionActionType =
  | "intake.scan"
  | "intake.reanalyze"
  | "planning.generate"
  | "planning.confirm-execution"
  | "planning.decompose"
  | "planning.decomposition.confirm"
  | "planning.decomposition.assess-readiness"
  | "planning.taskqueue.propose"
  | "planning.scheduler.plan.prepare"
  | "planning.scheduler.contract.compile"
  | "planning.scheduler.dispatch.dry-run"
  | "planning.scheduler.worker-plan.compile"
  | "planning.scheduler.claim-reconcile.compile"
  | "planning.scheduler.launch-preflight.check"
  | "planning.scheduler.run.prepare"
  | "planning.scheduler.runtime.initialize"
  | "planning.scheduler.runtime.reconcile"
  | "planning.scheduler.runtime.reserve-claims"
  | "planning.scheduler.worker.start-first"
  | "planning.workflowgraph.compile"
  | "planning.taskqueue.confirm-start"
  | "code.run";

export interface WorkbenchTypedWorkflowNextAction {
  id: string;
  label: string;
  description: string;
  kind: "workflow-action";
  enabled: boolean;
  requiresConfirmation: boolean;
  actionType: WorkflowProjectionActionType;
  planningBundleId?: string;
  decompositionPlanId?: string;
  readinessManifestId?: string;
  taskQueueProposalId?: string;
  workflowGraphPlanId?: string;
  schedulerContractId?: string;
  schedulerDispatchDryRunId?: string;
  schedulerWorkerPlanId?: string;
  schedulerClaimReconcilePlanId?: string;
  schedulerLaunchPreflightId?: string;
  schedulerRunId?: string;
  schedulerReconcileSnapshotId?: string;
  schedulerClaimReservationId?: string;
  reservationIntentId?: string;
  claimIntentId?: string;
  disabledReason?: string;
}

export interface TypedWorkflowProjectionTopic {
  runs: Array<{ runtime?: string }>;
}

export interface TypedWorkflowProjectionReadiness {
  specReady: boolean;
  planReady: boolean;
  tasksReady: boolean;
}

export interface TypedWorkflowProjectionIntake {
  pendingClarifications: unknown[];
  openQuestions: unknown[];
}

export interface TypedWorkflowPlanningBundle {
  id: string;
  status: "draft" | "confirmed";
}

export async function readLatestDecompositionPlanSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchDecompositionPlanSummary | null> {
  const plan = await readLatestDecompositionPlan(memory, changePath).catch(() => null);
  if (!plan) return null;
  return {
    id: plan.id,
    changeId: plan.changeId,
    status: plan.status,
    recommendation: plan.recommendation,
    rationale: plan.rationale,
    unitCount: plan.units.length,
    dependencyCount: plan.dependencies.length,
    conflictScopeCount: plan.conflictScopes.length,
    riskSummary: plan.riskSummary,
    openQuestionCount: plan.openQuestions.length,
    artifact: plan.artifact,
    markdownArtifact: plan.markdownArtifact,
    updatedAt: plan.updatedAt,
  };
}

export async function readLatestDecompositionReadinessSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchDecompositionReadinessSummary | null> {
  const manifest = await readLatestDecompositionReadinessManifest(memory, changePath).catch(() => null);
  if (!manifest) return null;
  const guardrailStatus = manifest.guardrails.some((item) => item.status === "failed")
    ? "failed"
    : manifest.guardrails.some((item) => item.status === "blocked")
      ? "blocked"
      : "passed";
  return {
    id: manifest.id,
    changeId: manifest.changeId,
    decompositionPlanId: manifest.decompositionPlanId,
    status: manifest.status,
    recommendation: manifest.recommendation,
    schedulerEligible: manifest.schedulerEligible,
    nextAllowedAction: manifest.nextAllowedAction,
    guardrailStatus,
    unitCount: manifest.units.length,
    artifact: manifest.artifact,
    markdownArtifact: manifest.markdownArtifact,
    updatedAt: manifest.updatedAt,
  };
}

export async function readLatestTaskQueueProposalSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchTaskQueueProposalSummary | null> {
  const proposal = await readLatestTaskQueueProposal(memory, changePath).catch(() => null);
  if (!proposal) return null;
  return {
    id: proposal.id,
    changeId: proposal.changeId,
    decompositionPlanId: proposal.decompositionPlanId,
    readinessManifestId: proposal.readinessManifestId,
    status: proposal.status,
    queueMode: proposal.queueMode,
    itemCount: proposal.items.length,
    dependencyCount: proposal.dependencies.length,
    conflictScopeCount: proposal.conflictScopes.length,
    artifact: proposal.artifact,
    markdownArtifact: proposal.markdownArtifact,
    updatedAt: proposal.updatedAt,
  };
}

export async function readLatestWorkflowGraphPlanSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchWorkflowGraphPlanSummary | null> {
  const graph = await readLatestWorkflowGraphPlan(memory, changePath).catch(() => null);
  if (!graph) return null;
  return {
    id: graph.id,
    changeId: graph.changeId,
    status: graph.status,
    graphMode: graph.graphMode,
    taskQueueProposalId: graph.taskQueueProposalId,
    readinessManifestId: graph.readinessManifestId,
    nodeCount: graph.nodes.length,
    edgeCount: graph.edges.length,
    artifact: graph.artifact,
    markdownArtifact: graph.markdownArtifact,
    updatedAt: graph.updatedAt,
  };
}

export async function readLatestSchedulerContractSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchSchedulerContractSummary | null> {
  const contract = await readLatestSchedulerContract(memory, changePath).catch(() => null);
  if (!contract) return null;
  return {
    id: contract.id,
    changeId: contract.changeId,
    status: contract.status,
    schedulerMode: contract.schedulerMode,
    decompositionPlanId: contract.decompositionPlanId,
    readinessManifestId: contract.readinessManifestId,
    nodeCount: contract.nodes.length,
    waveCount: contract.waves.length,
    dependencyCount: contract.edges.length,
    conflictCount: contract.conflictScopes.length,
    artifact: contract.artifact,
    markdownArtifact: contract.markdownArtifact,
    updatedAt: contract.updatedAt,
  };
}

export async function readLatestSchedulerDispatchDryRunSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchSchedulerDispatchDryRunSummary | null> {
  const dryRun = await readLatestSchedulerDispatchDryRun(memory, changePath).catch(() => null);
  if (!dryRun) return null;
  return {
    id: dryRun.id,
    changeId: dryRun.changeId,
    status: dryRun.status,
    schedulerMode: dryRun.schedulerMode,
    schedulerContractId: dryRun.schedulerContractId,
    waveCount: dryRun.waveVerdicts.length,
    nodeCount: dryRun.nodeVerdicts.length,
    blockedCount: dryRun.nodeVerdicts.filter((node) => node.status === "blocked").length,
    estimatedMaxWaveWidth: dryRun.estimatedMaxWaveWidth,
    prerequisiteCount: dryRun.runtimeContinuityPrerequisites.length,
    artifact: dryRun.artifact,
    markdownArtifact: dryRun.markdownArtifact,
    updatedAt: dryRun.updatedAt,
  };
}

export async function readLatestSchedulerWorkerSessionPlanSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchSchedulerWorkerSessionPlanSummary | null> {
  const plan = await readLatestSchedulerWorkerSessionPlan(memory, changePath).catch(() => null);
  if (!plan) return null;
  return {
    id: plan.id,
    changeId: plan.changeId,
    status: plan.status,
    schedulerMode: plan.schedulerMode,
    schedulerContractId: plan.schedulerContractId,
    schedulerDispatchDryRunId: plan.schedulerDispatchDryRunId,
    plannedWorkerCount: plan.plannedWorkerCount,
    stageCount: plan.stageCount,
    blockedCount: plan.blockedCount,
    warningCount: plan.warningCount,
    recoveryKeyCoverage: plan.recoveryKeyCoverage,
    artifact: plan.artifact,
    markdownArtifact: plan.markdownArtifact,
    updatedAt: plan.updatedAt,
  };
}

export async function readLatestSchedulerClaimReconcilePlanSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchSchedulerClaimReconcilePlanSummary | null> {
  const plan = await readLatestSchedulerClaimReconcilePlan(memory, changePath).catch(() => null);
  if (!plan) return null;
  return {
    id: plan.id,
    changeId: plan.changeId,
    status: plan.status,
    schedulerMode: plan.schedulerMode,
    schedulerContractId: plan.schedulerContractId,
    schedulerDispatchDryRunId: plan.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: plan.schedulerWorkerPlanId,
    waveCount: plan.waveCheckpoints.length,
    claimIntentCount: plan.claimIntents.length,
    plannedSlotDemand: plan.plannedSlotDemand,
    maxPlannedWaveWidth: plan.maxPlannedWaveWidth,
    blockedCount: plan.blockedCount,
    recoveryKeyCoverage: plan.recoveryKeyCoverage,
    artifact: plan.artifact,
    markdownArtifact: plan.markdownArtifact,
    updatedAt: plan.updatedAt,
  };
}

export async function readLatestSchedulerLaunchPreflightSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchSchedulerLaunchPreflightSummary | null> {
  const preflight = await readLatestSchedulerLaunchPreflight(memory, changePath).catch(() => null);
  if (!preflight) return null;
  return {
    id: preflight.id,
    changeId: preflight.changeId,
    status: preflight.status,
    schedulerMode: preflight.schedulerMode,
    schedulerContractId: preflight.schedulerContractId,
    schedulerDispatchDryRunId: preflight.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: preflight.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: preflight.schedulerClaimReconcilePlanId,
    claimIntentCount: preflight.claimSummaries.length,
    plannedSlotDemand: preflight.plannedSlotDemand,
    maxPlannedWaveWidth: preflight.maxPlannedWaveWidth,
    blockedCount: preflight.blockedCount,
    humanGateRequired: preflight.humanGateRequirement.status === "required",
    toolPolicyGateRequired: preflight.toolPolicyGateRequirement.status === "required",
    artifact: preflight.artifact,
    markdownArtifact: preflight.markdownArtifact,
    updatedAt: preflight.updatedAt,
  };
}

export async function readLatestSchedulerRunSummary(memory: ResolvedMemory, changePath: string): Promise<WorkbenchSchedulerRunSummary | null> {
  const run = await readLatestSchedulerRun(memory, changePath).catch(() => null);
  if (!run) return null;
  const journal = await readSchedulerRunJournal(memory, changePath, run.id).catch(() => []);
  return {
    id: run.id,
    changeId: run.changeId,
    status: run.status,
    schedulerMode: run.schedulerMode,
    schedulerContractId: run.schedulerContractId,
    schedulerDispatchDryRunId: run.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: run.schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId: run.schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId: run.schedulerLaunchPreflightId,
    claimIntentCount: run.claimIntentCount,
    plannedSlotDemand: run.plannedSlotDemand,
    maxPlannedWaveWidth: run.maxPlannedWaveWidth,
    blockedCount: run.blockedCount,
    humanConfirmed: run.humanConfirmed,
    futureToolPolicyGateRequired: run.futureToolPolicyGateRequired,
    futureHumanGateRequired: run.futureHumanGateRequired,
    journalEventCount: journal.length,
    artifact: run.artifact,
    markdownArtifact: run.markdownArtifact,
    journalArtifact: run.journalArtifact,
    updatedAt: run.updatedAt,
  };
}

export async function readSchedulerRuntimeSummary(memory: ResolvedMemory, changePath: string, schedulerRunId?: string): Promise<WorkbenchSchedulerRuntimeSummary | null> {
  if (!schedulerRunId) return null;
  const state = await readSchedulerRuntimeStateProjection(memory, changePath, schedulerRunId);
  if (!state) return null;
  return {
    id: state.id,
    changeId: state.changeId,
    schedulerRunId: state.schedulerRunId,
    status: state.status,
    schedulerMode: state.schedulerMode,
    claimIntentCount: state.claimIntents.length,
    waveCount: state.waves.length,
    plannedSlotDemand: state.plannedSlotDemand,
    maxPlannedWaveWidth: state.maxPlannedWaveWidth,
    blockedCount: state.blockedCount,
    lastReconcileSnapshotId: state.lastReconcileSnapshotId,
    lastClaimReservationId: state.lastClaimReservationId,
    lastClaimReservationSnapshotId: state.lastClaimReservationSnapshotId,
    artifact: state.artifact,
    eventsArtifact: state.eventsArtifact,
    updatedAt: state.updatedAt,
  };
}

export async function readSchedulerClaimReservationSummary(memory: ResolvedMemory, changePath: string, schedulerRunId?: string, reservationId?: string): Promise<WorkbenchSchedulerClaimReservationSummary | null> {
  if (!schedulerRunId || !reservationId) return null;
  const reservation = await readSchedulerRuntimeClaimReservationProjection(memory, changePath, schedulerRunId, reservationId);
  if (!reservation) return null;
  return {
    id: reservation.id,
    changeId: reservation.changeId,
    schedulerRunId: reservation.schedulerRunId,
    schedulerReconcileSnapshotId: reservation.schedulerReconcileSnapshotId,
    status: reservation.status,
    schedulerMode: reservation.schedulerMode,
    reservedCount: reservation.reservedCount,
    blockedCount: reservation.blockedCount,
    sourceLockCount: reservation.sourceLockCount,
    waveIndex: reservation.waves[0]?.waveIndex ?? 0,
    supersedesReservationId: reservation.supersedesReservationId,
    artifact: reservation.artifact,
    markdownArtifact: reservation.markdownArtifact,
    updatedAt: reservation.createdAt,
  };
}

export async function readSchedulerReconcileSnapshotSummary(memory: ResolvedMemory, changePath: string, schedulerRunId?: string, snapshotId?: string): Promise<WorkbenchSchedulerReconcileSnapshotSummary | null> {
  if (!schedulerRunId || !snapshotId) return null;
  const snapshot = await readSchedulerReconcileSnapshotProjection(memory, changePath, schedulerRunId, snapshotId);
  if (!snapshot) return null;
  return {
    id: snapshot.id,
    changeId: snapshot.changeId,
    schedulerRunId: snapshot.schedulerRunId,
    status: snapshot.status,
    schedulerMode: snapshot.schedulerMode,
    claimIntentCount: snapshot.claimIntents.length,
    waveCount: snapshot.waves.length,
    plannedSlotDemand: snapshot.plannedSlotDemand,
    maxPlannedWaveWidth: snapshot.maxPlannedWaveWidth,
    blockedCount: snapshot.blockedCount,
    warningCount: snapshot.warningCount,
    artifact: snapshot.artifact,
    markdownArtifact: snapshot.markdownArtifact,
    updatedAt: snapshot.createdAt,
  };
}

export function readDecompositionPlanProjection(memory: ResolvedMemory, changePath: string): Promise<DecompositionPlan | null> {
  return readLatestDecompositionPlan(memory, changePath).catch(() => null);
}

export function readDecompositionReadinessProjection(memory: ResolvedMemory, changePath: string): Promise<DecompositionReadinessManifest | null> {
  return readLatestDecompositionReadinessManifest(memory, changePath).catch(() => null);
}

export function readTaskQueueProposalProjection(memory: ResolvedMemory, changePath: string): Promise<TaskQueueProposal | null> {
  return readLatestTaskQueueProposal(memory, changePath).catch(() => null);
}

export function readWorkflowGraphPlanProjection(memory: ResolvedMemory, changePath: string, workflowGraphPlanId?: string): Promise<WorkflowGraphPlan | null> {
  return workflowGraphPlanId
    ? readWorkflowGraphPlan(memory, changePath, workflowGraphPlanId).catch(() => null)
    : readLatestWorkflowGraphPlan(memory, changePath).catch(() => null);
}

export function readSchedulerContractProjection(memory: ResolvedMemory, changePath: string, schedulerContractId?: string): Promise<SchedulerContract | null> {
  return schedulerContractId
    ? readSchedulerContract(memory, changePath, schedulerContractId).catch(() => null)
    : readLatestSchedulerContract(memory, changePath).catch(() => null);
}

export function readSchedulerDispatchDryRunProjection(memory: ResolvedMemory, changePath: string, dryRunId?: string): Promise<SchedulerDispatchDryRun | null> {
  return dryRunId
    ? readSchedulerDispatchDryRun(memory, changePath, dryRunId).catch(() => null)
    : readLatestSchedulerDispatchDryRun(memory, changePath).catch(() => null);
}

export function readSchedulerWorkerSessionPlanProjection(memory: ResolvedMemory, changePath: string, workerPlanId?: string): Promise<SchedulerWorkerSessionPlan | null> {
  return workerPlanId
    ? readSchedulerWorkerSessionPlan(memory, changePath, workerPlanId).catch(() => null)
    : readLatestSchedulerWorkerSessionPlan(memory, changePath).catch(() => null);
}

export function readSchedulerClaimReconcilePlanProjection(memory: ResolvedMemory, changePath: string, claimReconcilePlanId?: string): Promise<SchedulerClaimReconcilePlan | null> {
  return claimReconcilePlanId
    ? readSchedulerClaimReconcilePlan(memory, changePath, claimReconcilePlanId).catch(() => null)
    : readLatestSchedulerClaimReconcilePlan(memory, changePath).catch(() => null);
}

export function readSchedulerLaunchPreflightProjection(memory: ResolvedMemory, changePath: string, preflightId?: string): Promise<SchedulerLaunchPreflight | null> {
  return preflightId
    ? readSchedulerLaunchPreflight(memory, changePath, preflightId).catch(() => null)
    : readLatestSchedulerLaunchPreflight(memory, changePath).catch(() => null);
}

export function readSchedulerRunProjection(memory: ResolvedMemory, changePath: string, schedulerRunId?: string): Promise<SchedulerRun | null> {
  return schedulerRunId
    ? readSchedulerRun(memory, changePath, schedulerRunId).catch(() => null)
    : readLatestSchedulerRun(memory, changePath).catch(() => null);
}

export function readSchedulerRuntimeProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string): Promise<SchedulerRuntimeState | null> {
  return readSchedulerRuntimeStateProjection(memory, changePath, schedulerRunId);
}

export function readSchedulerReconcileProjection(memory: ResolvedMemory, changePath: string, snapshotId: string, schedulerRunId?: string): Promise<SchedulerReconcileSnapshot | null> {
  return schedulerRunId
    ? readSchedulerReconcileSnapshotProjection(memory, changePath, schedulerRunId, snapshotId)
    : readSchedulerReconcileSnapshotByIdProjection(memory, changePath, snapshotId);
}

export function readSchedulerClaimReservationProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reservationId: string): Promise<SchedulerRuntimeClaimReservation | null> {
  return readSchedulerRuntimeClaimReservationProjection(memory, changePath, schedulerRunId, reservationId);
}

export function buildTypedWorkflowNextAction(input: {
  topic: TypedWorkflowProjectionTopic;
  readiness: TypedWorkflowProjectionReadiness;
  intake?: TypedWorkflowProjectionIntake;
  planningBundle?: TypedWorkflowPlanningBundle | null;
  decompositionPlan?: WorkbenchDecompositionPlanSummary | null;
  decompositionReadiness?: WorkbenchDecompositionReadinessSummary | null;
  taskQueueProposal?: WorkbenchTaskQueueProposalSummary | null;
  workflowGraphPlan?: WorkbenchWorkflowGraphPlanSummary | null;
  schedulerContract?: WorkbenchSchedulerContractSummary | null;
  schedulerDispatchDryRun?: WorkbenchSchedulerDispatchDryRunSummary | null;
  schedulerWorkerSessionPlan?: WorkbenchSchedulerWorkerSessionPlanSummary | null;
  schedulerClaimReconcilePlan?: WorkbenchSchedulerClaimReconcilePlanSummary | null;
  schedulerLaunchPreflight?: WorkbenchSchedulerLaunchPreflightSummary | null;
  schedulerRun?: WorkbenchSchedulerRunSummary | null;
  schedulerRuntime?: WorkbenchSchedulerRuntimeSummary | null;
  schedulerReconcileSnapshot?: WorkbenchSchedulerReconcileSnapshotSummary | null;
  schedulerClaimReservation?: WorkbenchSchedulerClaimReservationSummary | null;
  workflowRun?: WorkflowRunSummary | null;
}): WorkbenchTypedWorkflowNextAction {
  const { topic, readiness, intake, planningBundle, decompositionPlan, decompositionReadiness, taskQueueProposal, workflowGraphPlan, schedulerRun, schedulerRuntime, schedulerReconcileSnapshot, schedulerClaimReservation, workflowRun } = input;
  if (!readiness.specReady && !topic.runs.some((run) => run.runtime === "intake-scan")) {
    return workflowNextAction("intake.scan", "分析需求", "先只读扫描项目，整理当前理解、相关文件和待确认问题。", false);
  }
  if (!readiness.specReady && (intake?.pendingClarifications.length || intake?.openQuestions.length)) {
    return workflowNextAction("intake.reanalyze", "继续澄清需求", "回答需要确认的问题，AHO 会更新当前理解。", false);
  }
  if (planningBundle?.status === "draft") {
    const next = workflowNextAction("planning.confirm-execution", "确认规划", "确认当前方案并写入内部 spec/plan/tasks/ac-map；不会启动执行。");
    return { ...next, planningBundleId: planningBundle.id };
  }
  if (!readiness.specReady || !readiness.planReady || !readiness.tasksReady) {
    return workflowNextAction("planning.generate", "生成方案草案", "在主对话里生成 proposal/spec/design/tasks 草案；确认执行后才写入内部 artifacts。");
  }
  if (!decompositionPlan) {
    return workflowNextAction("planning.decompose", "生成拆分提案", "根据已确认方案生成 DecompositionPlan；不会启动执行。");
  }
  if (decompositionPlan.status === "draft") {
    return { ...workflowNextAction("planning.decomposition.confirm", "确认拆分方向", "确认这个 DecompositionPlan；不会启动执行。"), decompositionPlanId: decompositionPlan.id };
  }
  if (decompositionPlan.status === "confirmed" && decompositionReadiness?.decompositionPlanId !== decompositionPlan.id) {
    return { ...workflowNextAction("planning.decomposition.assess-readiness", "检查执行边界", "生成 DecompositionReadinessManifest；不会启动执行。"), decompositionPlanId: decompositionPlan.id };
  }
  if (decompositionReadiness?.nextAllowedAction === "code.run") {
    return { ...workflowNextAction("code.run", "运行 Code", "readiness 已授权单 Change code.run。"), readinessManifestId: decompositionReadiness.id };
  }
  if (decompositionReadiness?.nextAllowedAction === "taskqueue.proposal") {
    if (!taskQueueProposal || taskQueueProposal.readinessManifestId !== decompositionReadiness.id || ["superseded", "rejected"].includes(taskQueueProposal.status)) {
      return { ...workflowNextAction("planning.taskqueue.propose", "生成 TaskQueue 提案", "生成顺序 TaskQueueProposal；不会启动执行。"), readinessManifestId: decompositionReadiness.id };
    }
    if (!workflowGraphPlan || workflowGraphPlan.taskQueueProposalId !== taskQueueProposal.id || workflowGraphPlan.readinessManifestId !== decompositionReadiness.id) {
      return { ...workflowNextAction("planning.workflowgraph.compile", "编译执行图", "生成 versioned WorkflowGraphPlan；不会启动执行。"), taskQueueProposalId: taskQueueProposal.id, readinessManifestId: decompositionReadiness.id };
    }
    if (!workflowRun || workflowRun.workflowGraphPlanId !== workflowGraphPlan.id) {
      return {
        ...workflowNextAction("planning.taskqueue.confirm-start", "确认启动 TaskQueue", "重新校验 graph/proposal/readiness 后创建 TaskQueue/TaskRun 并开始顺序执行。"),
        taskQueueProposalId: taskQueueProposal.id,
        workflowGraphPlanId: workflowGraphPlan.id,
        readinessManifestId: decompositionReadiness.id,
        decompositionPlanId: taskQueueProposal.decompositionPlanId,
      };
    }
  }
  if (decompositionReadiness?.nextAllowedAction === "scheduler.contract") {
    if (!decompositionPlan || decompositionPlan.id !== decompositionReadiness.decompositionPlanId) {
      return {
        ...workflowNextAction("planning.decomposition.assess-readiness", "等待执行边界", "当前 readiness 与 DecompositionPlan 不匹配。"),
        enabled: false,
        disabledReason: "当前 DecompositionReadinessManifest 与 DecompositionPlan 不匹配。",
      };
    }
    if (
      schedulerRun?.status === "prepared"
      && schedulerRuntime?.schedulerRunId === schedulerRun.id
      && schedulerRuntime.lastReconcileSnapshotId
      && schedulerReconcileSnapshot?.id === schedulerRuntime.lastReconcileSnapshotId
      && schedulerRuntime.lastClaimReservationId
      && schedulerRuntime.lastClaimReservationSnapshotId === schedulerReconcileSnapshot.id
      && schedulerClaimReservation?.id === schedulerRuntime.lastClaimReservationId
      && schedulerClaimReservation.schedulerRunId === schedulerRun.id
      && schedulerClaimReservation.schedulerReconcileSnapshotId === schedulerReconcileSnapshot.id
    ) {
      if (schedulerClaimReservation.launchConfirmed) {
        return {
          ...workflowNextAction("planning.scheduler.worker.start-first", "启动第一个 worker", "用户已确认并行执行计划启动意图；本操作只启动 latest claim reservation 中第一个 runnable claim 的 coder stage。"),
          decompositionPlanId: decompositionPlan.id,
          readinessManifestId: decompositionReadiness.id,
          schedulerContractId: schedulerRun.schedulerContractId,
          schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
          schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
          schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
          schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
          schedulerRunId: schedulerRun.id,
          schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
          schedulerClaimReservationId: schedulerClaimReservation.id,
        };
      }
      return {
        ...workflowNextAction("planning.scheduler.plan.prepare", "确认启动这个并行执行计划", "主 Agent 会重读 prepared scheduler evidence，输出可读 launch brief 并记录你的整体启动意图；本阶段不会启动 worker。"),
        decompositionPlanId: decompositionPlan.id,
        readinessManifestId: decompositionReadiness.id,
        schedulerContractId: schedulerRun.schedulerContractId,
        schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
        schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
        schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
        schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
        schedulerRunId: schedulerRun.id,
        schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
        schedulerClaimReservationId: schedulerClaimReservation.id,
      };
    }
    return {
      ...workflowNextAction("planning.scheduler.plan.prepare", "准备并行执行计划", "主 Agent 一次性补齐 scheduler pre-executor evidence，并在对话里解释计划；不会启动 scheduler、worker、lease、worktree 或 run。"),
      decompositionPlanId: decompositionPlan.id,
      readinessManifestId: decompositionReadiness.id,
    };
  }
  return {
    ...workflowNextAction("planning.decomposition.assess-readiness", "等待执行边界", "当前 readiness 不允许直接执行。"),
    enabled: false,
    disabledReason: "当前 DecompositionReadinessManifest 未授权 code.run 或 TaskQueueProposal。",
  };
}

function workflowNextAction(actionType: WorkflowProjectionActionType, label: string, description: string, requiresConfirmation = true): WorkbenchTypedWorkflowNextAction {
  return {
    id: `workflow:${actionType}`,
    label,
    description,
    kind: "workflow-action",
    actionType,
    enabled: true,
    requiresConfirmation,
  };
}
