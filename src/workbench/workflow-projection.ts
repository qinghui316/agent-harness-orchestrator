import type { ResolvedMemory, WorkflowRunSummary } from "../types/index.js";
import {
  readSchedulerReconcileSnapshotProjection,
  readSchedulerReconcileSnapshotByIdProjection,
  findSchedulerRuntimeWorkerAuditForValidation,
  findSchedulerRuntimeWorkerResultForStart,
  findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence,
  findSchedulerRuntimeWorkerReworkResultForStart,
  findSchedulerRuntimeWorkerReworkValidationForResult,
  findSchedulerRuntimeWorkerReworkStartForPlan,
  findSchedulerRuntimeWorkerValidationForResult,
  listSchedulerRuntimeWorkerStarts,
  readSchedulerRuntimeWorkerAuditProjection,
  readSchedulerRuntimeWorkerReworkPlanProjection,
  readSchedulerRuntimeWorkerReworkResultProjection,
  readSchedulerRuntimeWorkerReworkValidationProjection,
  readSchedulerRuntimeWorkerReworkStartProjection,
  readSchedulerRuntimeWorkerValidationProjection,
  readSchedulerRuntimeClaimReservationProjection,
  readSchedulerRuntimeStateProjection,
  type SchedulerReconcileSnapshot,
  type SchedulerRuntimeClaimReservation,
  type SchedulerRuntimeState,
  type SchedulerRuntimeWorkerResult,
  type SchedulerRuntimeWorkerStart,
  type SchedulerRuntimeWorkerAudit,
  type SchedulerRuntimeWorkerReworkPlan,
  type SchedulerRuntimeWorkerReworkResult,
  type SchedulerRuntimeWorkerReworkValidation,
  type SchedulerRuntimeWorkerReworkStart,
  type SchedulerRuntimeWorkerValidation,
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

export interface WorkbenchSchedulerWorkerStartSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerReconcileSnapshotId: string;
  status: SchedulerRuntimeWorkerStart["status"];
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "coder";
  taskRunId: string;
  workerLeaseId: string;
  worktreeId?: string;
  runId?: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerWorkerResultSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  status: SchedulerRuntimeWorkerResult["status"];
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "coder";
  taskRunId: string;
  workerLeaseId: string;
  taskRunStatus: string;
  workerLeaseStatus: string;
  worktreeId?: string;
  runId?: string;
  runStatus?: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerWorkerValidationSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  status: SchedulerRuntimeWorkerValidation["status"];
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "validation";
  taskRunId: string;
  workerLeaseId: string;
  taskRunStatus: string;
  worktreeId: string;
  codeRunId: string;
  validationRunId: string;
  validationStatus: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerWorkerAuditSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  status: SchedulerRuntimeWorkerAudit["status"];
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "audit";
  taskRunId: string;
  workerLeaseId: string;
  taskRunStatus: string;
  worktreeId: string;
  codeRunId: string;
  validationRunId: string;
  validationStatus: string;
  auditRunId: string;
  auditStatus: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerWorkerReworkPlanSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  schedulerWorkerAuditId?: string;
  status: SchedulerRuntimeWorkerReworkPlan["status"];
  blockingSource: SchedulerRuntimeWorkerReworkPlan["blockingSource"];
  reworkReason: string;
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "bounded-rework";
  taskRunId: string;
  workerLeaseId: string;
  taskRunStatus: string;
  targetWorktreeId: string;
  targetCodeRunId: string;
  validationRunId: string;
  auditRunId?: string;
  futureCodeGateMode: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerWorkerReworkStartSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkPlanId: string;
  status: SchedulerRuntimeWorkerReworkStart["status"];
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "bounded-rework";
  originalTaskRunId: string;
  originalWorkerLeaseId: string;
  reworkTaskRunId: string;
  reworkWorkerLeaseId: string;
  worktreeId: string;
  originalCodeRunId: string;
  reworkRunId?: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerWorkerReworkResultSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkPlanId: string;
  schedulerWorkerReworkStartId: string;
  status: SchedulerRuntimeWorkerReworkResult["status"];
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "bounded-rework";
  originalTaskRunId: string;
  originalWorkerLeaseId: string;
  originalCodeRunId: string;
  reworkTaskRunId: string;
  reworkWorkerLeaseId: string;
  taskRunStatus: string;
  workerLeaseStatus: string;
  worktreeId: string;
  reworkRunId?: string;
  reworkRunStatus?: string;
  failureReason?: string;
  artifact?: string;
  markdownArtifact?: string;
  updatedAt: string;
}

export interface WorkbenchSchedulerWorkerReworkValidationSummary {
  id: string;
  changeId: string;
  schedulerRunId: string;
  schedulerClaimReservationId: string;
  schedulerWorkerStartId: string;
  schedulerWorkerResultId: string;
  schedulerWorkerValidationId: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkPlanId: string;
  schedulerWorkerReworkStartId: string;
  schedulerWorkerReworkResultId: string;
  status: SchedulerRuntimeWorkerReworkValidation["status"];
  reservationIntentId: string;
  claimIntentId: string;
  nodeId: string;
  unitId: string;
  stageId: string;
  stage: "validation";
  originalTaskRunId: string;
  originalWorkerLeaseId: string;
  originalCodeRunId: string;
  reworkTaskRunId: string;
  reworkWorkerLeaseId: string;
  taskRunStatus: string;
  worktreeId: string;
  reworkRunId: string;
  validationRunId: string;
  validationStatus: SchedulerRuntimeWorkerReworkValidation["validationStatus"];
  failureReason?: string;
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
  | "planning.scheduler.worker.reconcile-result"
  | "planning.scheduler.worker.validate-first"
  | "planning.scheduler.worker.audit-first"
  | "planning.scheduler.worker.rework-plan.compile"
  | "planning.scheduler.worker.rework-start-first"
  | "planning.scheduler.worker.rework-reconcile-result"
  | "planning.scheduler.worker.rework-validate-first"
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
  schedulerWorkerStartId?: string;
  schedulerWorkerResultId?: string;
  schedulerWorkerValidationId?: string;
  schedulerWorkerAuditId?: string;
  schedulerWorkerReworkPlanId?: string;
  schedulerWorkerReworkStartId?: string;
  schedulerWorkerReworkResultId?: string;
  schedulerWorkerReworkValidationId?: string;
  reservationIntentId?: string;
  claimIntentId?: string;
  taskRunId?: string;
  workerLeaseId?: string;
  worktreeId?: string;
  runId?: string;
  validationRunId?: string;
  reworkValidationRunId?: string;
  auditRunId?: string;
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

export async function readLatestSchedulerWorkerStartSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  schedulerClaimReservationId?: string,
): Promise<WorkbenchSchedulerWorkerStartSummary | null> {
  if (!schedulerRunId) return null;
  const starts = await listSchedulerRuntimeWorkerStarts(memory, changePath, schedulerRunId).catch(() => []);
  const scoped = schedulerClaimReservationId ? starts.filter((start) => start.schedulerClaimReservationId === schedulerClaimReservationId) : starts;
  const start = [...scoped].sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0];
  return start ? summarizeSchedulerWorkerStart(start) : null;
}

export async function readSchedulerWorkerResultSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  workerStartId?: string,
): Promise<WorkbenchSchedulerWorkerResultSummary | null> {
  if (!schedulerRunId || !workerStartId) return null;
  const result = await findSchedulerRuntimeWorkerResultForStart(memory, changePath, schedulerRunId, workerStartId).catch(() => null);
  return result ? summarizeSchedulerWorkerResult(result) : null;
}

export async function readSchedulerWorkerValidationSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  workerResultId?: string,
): Promise<WorkbenchSchedulerWorkerValidationSummary | null> {
  if (!schedulerRunId || !workerResultId) return null;
  const validation = await findSchedulerRuntimeWorkerValidationForResult(memory, changePath, schedulerRunId, workerResultId).catch(() => null);
  return validation ? summarizeSchedulerWorkerValidation(validation) : null;
}

export async function readSchedulerWorkerAuditSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  workerValidationId?: string,
): Promise<WorkbenchSchedulerWorkerAuditSummary | null> {
  if (!schedulerRunId || !workerValidationId) return null;
  const audit = await findSchedulerRuntimeWorkerAuditForValidation(memory, changePath, schedulerRunId, workerValidationId).catch(() => null);
  return audit ? summarizeSchedulerWorkerAudit(audit) : null;
}

export async function readSchedulerWorkerReworkPlanSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  workerValidationId?: string,
  workerAuditId?: string,
): Promise<WorkbenchSchedulerWorkerReworkPlanSummary | null> {
  if (!schedulerRunId || !workerValidationId) return null;
  const plan = await findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence(memory, changePath, schedulerRunId, {
    workerValidationId,
    workerAuditId,
  }).catch(() => null);
  return plan ? summarizeSchedulerWorkerReworkPlan(plan) : null;
}

export async function readSchedulerWorkerReworkStartSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  reworkPlanId?: string,
): Promise<WorkbenchSchedulerWorkerReworkStartSummary | null> {
  if (!schedulerRunId || !reworkPlanId) return null;
  const start = await findSchedulerRuntimeWorkerReworkStartForPlan(memory, changePath, schedulerRunId, reworkPlanId).catch(() => null);
  return start ? summarizeSchedulerWorkerReworkStart(start) : null;
}

export async function readSchedulerWorkerReworkResultSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  reworkStartId?: string,
): Promise<WorkbenchSchedulerWorkerReworkResultSummary | null> {
  if (!schedulerRunId || !reworkStartId) return null;
  const result = await findSchedulerRuntimeWorkerReworkResultForStart(memory, changePath, schedulerRunId, reworkStartId).catch(() => null);
  return result ? summarizeSchedulerWorkerReworkResult(result) : null;
}

export async function readSchedulerWorkerReworkValidationSummary(
  memory: ResolvedMemory,
  changePath: string,
  schedulerRunId?: string,
  reworkResultId?: string,
): Promise<WorkbenchSchedulerWorkerReworkValidationSummary | null> {
  if (!schedulerRunId || !reworkResultId) return null;
  const validation = await findSchedulerRuntimeWorkerReworkValidationForResult(memory, changePath, schedulerRunId, reworkResultId).catch(() => null);
  return validation ? summarizeSchedulerWorkerReworkValidation(validation) : null;
}

function summarizeSchedulerWorkerStart(start: SchedulerRuntimeWorkerStart): WorkbenchSchedulerWorkerStartSummary {
  return {
    id: start.id,
    changeId: start.changeId,
    schedulerRunId: start.schedulerRunId,
    schedulerClaimReservationId: start.schedulerClaimReservationId,
    schedulerReconcileSnapshotId: start.schedulerReconcileSnapshotId,
    status: start.status,
    reservationIntentId: start.reservationIntentId,
    claimIntentId: start.claimIntentId,
    nodeId: start.nodeId,
    unitId: start.unitId,
    stageId: start.stageId,
    stage: "coder",
    taskRunId: start.taskRunId,
    workerLeaseId: start.workerLeaseId,
    worktreeId: start.worktreeId,
    runId: start.runId,
    artifact: start.artifact,
    markdownArtifact: start.markdownArtifact,
    updatedAt: start.updatedAt,
  };
}

function summarizeSchedulerWorkerResult(result: SchedulerRuntimeWorkerResult): WorkbenchSchedulerWorkerResultSummary {
  return {
    id: result.id,
    changeId: result.changeId,
    schedulerRunId: result.schedulerRunId,
    schedulerClaimReservationId: result.schedulerClaimReservationId,
    schedulerWorkerStartId: result.schedulerWorkerStartId,
    status: result.status,
    reservationIntentId: result.reservationIntentId,
    claimIntentId: result.claimIntentId,
    nodeId: result.nodeId,
    unitId: result.unitId,
    stageId: result.stageId,
    stage: "coder",
    taskRunId: result.taskRunId,
    workerLeaseId: result.workerLeaseId,
    taskRunStatus: result.taskRunStatus,
    workerLeaseStatus: result.workerLeaseStatus,
    worktreeId: result.worktreeId,
    runId: result.runId,
    runStatus: result.runStatus,
    artifact: result.artifact,
    markdownArtifact: result.markdownArtifact,
    updatedAt: result.updatedAt,
  };
}

function summarizeSchedulerWorkerValidation(validation: SchedulerRuntimeWorkerValidation): WorkbenchSchedulerWorkerValidationSummary {
  return {
    id: validation.id,
    changeId: validation.changeId,
    schedulerRunId: validation.schedulerRunId,
    schedulerClaimReservationId: validation.schedulerClaimReservationId,
    schedulerWorkerStartId: validation.schedulerWorkerStartId,
    schedulerWorkerResultId: validation.schedulerWorkerResultId,
    status: validation.status,
    reservationIntentId: validation.reservationIntentId,
    claimIntentId: validation.claimIntentId,
    nodeId: validation.nodeId,
    unitId: validation.unitId,
    stageId: validation.stageId,
    stage: "validation",
    taskRunId: validation.taskRunId,
    workerLeaseId: validation.workerLeaseId,
    taskRunStatus: validation.taskRunStatus,
    worktreeId: validation.worktreeId,
    codeRunId: validation.codeRunId,
    validationRunId: validation.validationRunId,
    validationStatus: validation.validationStatus,
    artifact: validation.artifact,
    markdownArtifact: validation.markdownArtifact,
    updatedAt: validation.updatedAt,
  };
}

function summarizeSchedulerWorkerAudit(audit: SchedulerRuntimeWorkerAudit): WorkbenchSchedulerWorkerAuditSummary {
  return {
    id: audit.id,
    changeId: audit.changeId,
    schedulerRunId: audit.schedulerRunId,
    schedulerClaimReservationId: audit.schedulerClaimReservationId,
    schedulerWorkerStartId: audit.schedulerWorkerStartId,
    schedulerWorkerResultId: audit.schedulerWorkerResultId,
    schedulerWorkerValidationId: audit.schedulerWorkerValidationId,
    status: audit.status,
    reservationIntentId: audit.reservationIntentId,
    claimIntentId: audit.claimIntentId,
    nodeId: audit.nodeId,
    unitId: audit.unitId,
    stageId: audit.stageId,
    stage: "audit",
    taskRunId: audit.taskRunId,
    workerLeaseId: audit.workerLeaseId,
    taskRunStatus: audit.taskRunStatus,
    worktreeId: audit.worktreeId,
    codeRunId: audit.codeRunId,
    validationRunId: audit.validationRunId,
    validationStatus: audit.validationStatus,
    auditRunId: audit.auditRunId,
    auditStatus: audit.auditStatus,
    artifact: audit.artifact,
    markdownArtifact: audit.markdownArtifact,
    updatedAt: audit.updatedAt,
  };
}

function summarizeSchedulerWorkerReworkPlan(plan: SchedulerRuntimeWorkerReworkPlan): WorkbenchSchedulerWorkerReworkPlanSummary {
  return {
    id: plan.id,
    changeId: plan.changeId,
    schedulerRunId: plan.schedulerRunId,
    schedulerClaimReservationId: plan.schedulerClaimReservationId,
    schedulerWorkerStartId: plan.schedulerWorkerStartId,
    schedulerWorkerResultId: plan.schedulerWorkerResultId,
    schedulerWorkerValidationId: plan.schedulerWorkerValidationId,
    schedulerWorkerAuditId: plan.schedulerWorkerAuditId,
    status: plan.status,
    blockingSource: plan.blockingSource,
    reworkReason: plan.reworkReason,
    reservationIntentId: plan.reservationIntentId,
    claimIntentId: plan.claimIntentId,
    nodeId: plan.nodeId,
    unitId: plan.unitId,
    stageId: plan.stageId,
    stage: "bounded-rework",
    taskRunId: plan.taskRunId,
    workerLeaseId: plan.workerLeaseId,
    taskRunStatus: plan.taskRunStatus,
    targetWorktreeId: plan.targetWorktreeId,
    targetCodeRunId: plan.targetCodeRunId,
    validationRunId: plan.validationRunId,
    auditRunId: plan.auditRunId,
    futureCodeGateMode: plan.futureCodeGateMode,
    artifact: plan.artifact,
    markdownArtifact: plan.markdownArtifact,
    updatedAt: plan.updatedAt,
  };
}

function summarizeSchedulerWorkerReworkStart(start: SchedulerRuntimeWorkerReworkStart): WorkbenchSchedulerWorkerReworkStartSummary {
  return {
    id: start.id,
    changeId: start.changeId,
    schedulerRunId: start.schedulerRunId,
    schedulerClaimReservationId: start.schedulerClaimReservationId,
    schedulerWorkerStartId: start.schedulerWorkerStartId,
    schedulerWorkerResultId: start.schedulerWorkerResultId,
    schedulerWorkerValidationId: start.schedulerWorkerValidationId,
    schedulerWorkerAuditId: start.schedulerWorkerAuditId,
    schedulerWorkerReworkPlanId: start.schedulerWorkerReworkPlanId,
    status: start.status,
    reservationIntentId: start.reservationIntentId,
    claimIntentId: start.claimIntentId,
    nodeId: start.nodeId,
    unitId: start.unitId,
    stageId: start.stageId,
    stage: "bounded-rework",
    originalTaskRunId: start.originalTaskRunId,
    originalWorkerLeaseId: start.originalWorkerLeaseId,
    reworkTaskRunId: start.reworkTaskRunId,
    reworkWorkerLeaseId: start.reworkWorkerLeaseId,
    worktreeId: start.worktreeId,
    originalCodeRunId: start.originalCodeRunId,
    reworkRunId: start.reworkRunId,
    artifact: start.artifact,
    markdownArtifact: start.markdownArtifact,
    updatedAt: start.updatedAt,
  };
}

function summarizeSchedulerWorkerReworkResult(result: SchedulerRuntimeWorkerReworkResult): WorkbenchSchedulerWorkerReworkResultSummary {
  return {
    id: result.id,
    changeId: result.changeId,
    schedulerRunId: result.schedulerRunId,
    schedulerClaimReservationId: result.schedulerClaimReservationId,
    schedulerWorkerStartId: result.schedulerWorkerStartId,
    schedulerWorkerResultId: result.schedulerWorkerResultId,
    schedulerWorkerValidationId: result.schedulerWorkerValidationId,
    schedulerWorkerAuditId: result.schedulerWorkerAuditId,
    schedulerWorkerReworkPlanId: result.schedulerWorkerReworkPlanId,
    schedulerWorkerReworkStartId: result.schedulerWorkerReworkStartId,
    status: result.status,
    reservationIntentId: result.reservationIntentId,
    claimIntentId: result.claimIntentId,
    nodeId: result.nodeId,
    unitId: result.unitId,
    stageId: result.stageId,
    stage: "bounded-rework",
    originalTaskRunId: result.originalTaskRunId,
    originalWorkerLeaseId: result.originalWorkerLeaseId,
    originalCodeRunId: result.originalCodeRunId,
    reworkTaskRunId: result.reworkTaskRunId,
    reworkWorkerLeaseId: result.reworkWorkerLeaseId,
    taskRunStatus: result.taskRunStatus,
    workerLeaseStatus: result.workerLeaseStatus,
    worktreeId: result.worktreeId,
    reworkRunId: result.reworkRunId,
    reworkRunStatus: result.reworkRunStatus,
    failureReason: result.failureReason,
    artifact: result.artifact,
    markdownArtifact: result.markdownArtifact,
    updatedAt: result.updatedAt,
  };
}

function summarizeSchedulerWorkerReworkValidation(validation: SchedulerRuntimeWorkerReworkValidation): WorkbenchSchedulerWorkerReworkValidationSummary {
  return {
    id: validation.id,
    changeId: validation.changeId,
    schedulerRunId: validation.schedulerRunId,
    schedulerClaimReservationId: validation.schedulerClaimReservationId,
    schedulerWorkerStartId: validation.schedulerWorkerStartId,
    schedulerWorkerResultId: validation.schedulerWorkerResultId,
    schedulerWorkerValidationId: validation.schedulerWorkerValidationId,
    schedulerWorkerAuditId: validation.schedulerWorkerAuditId,
    schedulerWorkerReworkPlanId: validation.schedulerWorkerReworkPlanId,
    schedulerWorkerReworkStartId: validation.schedulerWorkerReworkStartId,
    schedulerWorkerReworkResultId: validation.schedulerWorkerReworkResultId,
    status: validation.status,
    reservationIntentId: validation.reservationIntentId,
    claimIntentId: validation.claimIntentId,
    nodeId: validation.nodeId,
    unitId: validation.unitId,
    stageId: validation.stageId,
    stage: "validation",
    originalTaskRunId: validation.originalTaskRunId,
    originalWorkerLeaseId: validation.originalWorkerLeaseId,
    originalCodeRunId: validation.originalCodeRunId,
    reworkTaskRunId: validation.reworkTaskRunId,
    reworkWorkerLeaseId: validation.reworkWorkerLeaseId,
    taskRunStatus: validation.taskRunStatus,
    worktreeId: validation.worktreeId,
    reworkRunId: validation.reworkRunId,
    validationRunId: validation.validationRunId,
    validationStatus: validation.validationStatus,
    failureReason: validation.failureReason,
    artifact: validation.artifact,
    markdownArtifact: validation.markdownArtifact,
    updatedAt: validation.updatedAt,
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

export function readSchedulerWorkerValidationProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, validationId: string): Promise<SchedulerRuntimeWorkerValidation | null> {
  return readSchedulerRuntimeWorkerValidationProjection(memory, changePath, schedulerRunId, validationId);
}

export function readSchedulerWorkerAuditProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, auditId: string): Promise<SchedulerRuntimeWorkerAudit | null> {
  return readSchedulerRuntimeWorkerAuditProjection(memory, changePath, schedulerRunId, auditId);
}

export function readSchedulerWorkerReworkPlanProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkPlanId: string): Promise<SchedulerRuntimeWorkerReworkPlan | null> {
  return readSchedulerRuntimeWorkerReworkPlanProjection(memory, changePath, schedulerRunId, reworkPlanId);
}

export function readSchedulerWorkerReworkStartProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkStartId: string): Promise<SchedulerRuntimeWorkerReworkStart | null> {
  return readSchedulerRuntimeWorkerReworkStartProjection(memory, changePath, schedulerRunId, reworkStartId);
}

export function readSchedulerWorkerReworkResultProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkResultId: string): Promise<SchedulerRuntimeWorkerReworkResult | null> {
  return readSchedulerRuntimeWorkerReworkResultProjection(memory, changePath, schedulerRunId, reworkResultId);
}

export function readSchedulerWorkerReworkValidationProjection(memory: ResolvedMemory, changePath: string, schedulerRunId: string, reworkValidationId: string): Promise<SchedulerRuntimeWorkerReworkValidation | null> {
  return readSchedulerRuntimeWorkerReworkValidationProjection(memory, changePath, schedulerRunId, reworkValidationId);
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
  schedulerWorkerStart?: WorkbenchSchedulerWorkerStartSummary | null;
  schedulerWorkerResult?: WorkbenchSchedulerWorkerResultSummary | null;
  schedulerWorkerValidation?: WorkbenchSchedulerWorkerValidationSummary | null;
  schedulerWorkerAudit?: WorkbenchSchedulerWorkerAuditSummary | null;
  schedulerWorkerReworkPlan?: WorkbenchSchedulerWorkerReworkPlanSummary | null;
  schedulerWorkerReworkStart?: WorkbenchSchedulerWorkerReworkStartSummary | null;
  schedulerWorkerReworkResult?: WorkbenchSchedulerWorkerReworkResultSummary | null;
  schedulerWorkerReworkValidation?: WorkbenchSchedulerWorkerReworkValidationSummary | null;
  workflowRun?: WorkflowRunSummary | null;
}): WorkbenchTypedWorkflowNextAction {
  const { topic, readiness, intake, planningBundle, decompositionPlan, decompositionReadiness, taskQueueProposal, workflowGraphPlan, schedulerRun, schedulerRuntime, schedulerReconcileSnapshot, schedulerClaimReservation, schedulerWorkerStart, schedulerWorkerResult, schedulerWorkerValidation, schedulerWorkerAudit, schedulerWorkerReworkPlan, schedulerWorkerReworkStart, schedulerWorkerReworkResult, schedulerWorkerReworkValidation, workflowRun } = input;
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
        if (schedulerWorkerStart?.schedulerClaimReservationId === schedulerClaimReservation.id && schedulerWorkerStart.schedulerRunId === schedulerRun.id) {
          if (schedulerWorkerResult?.schedulerWorkerStartId === schedulerWorkerStart.id) {
            if (schedulerWorkerResult.status === "evidence-ready" && !schedulerWorkerValidation) {
              return {
                ...workflowNextAction("planning.scheduler.worker.validate-first", "验证第一个 worker 结果", "对 9G 创建的同一个 worktree 运行一次 scoped Validation；只写 scheduler validation evidence，不启动 audit、rework 或下一个 worker。"),
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
                schedulerWorkerStartId: schedulerWorkerStart.id,
                schedulerWorkerResultId: schedulerWorkerResult.id,
                reservationIntentId: schedulerWorkerStart.reservationIntentId,
                claimIntentId: schedulerWorkerStart.claimIntentId,
                taskRunId: schedulerWorkerResult.taskRunId,
                workerLeaseId: schedulerWorkerResult.workerLeaseId,
                worktreeId: schedulerWorkerResult.worktreeId,
                runId: schedulerWorkerResult.runId,
              };
            }
            if (schedulerWorkerValidation?.status === "passed" && !schedulerWorkerAudit) {
              return {
                ...workflowNextAction("planning.scheduler.worker.audit-first", "审计第一个 worker 结果", "对 9G 创建的同一个 worktree 运行一次 scoped Audit；只写 scheduler audit evidence，不启动 rework、下一个 worker 或 whole wave。"),
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
                schedulerWorkerStartId: schedulerWorkerStart.id,
                schedulerWorkerResultId: schedulerWorkerResult.id,
                schedulerWorkerValidationId: schedulerWorkerValidation.id,
                reservationIntentId: schedulerWorkerStart.reservationIntentId,
                claimIntentId: schedulerWorkerStart.claimIntentId,
                validationRunId: schedulerWorkerValidation.validationRunId,
              };
            }
            const needsReworkPlan = schedulerWorkerValidation?.status === "failed"
              || (schedulerWorkerValidation?.status === "passed" && (schedulerWorkerAudit?.status === "blocked" || schedulerWorkerAudit?.status === "failed"));
            if (needsReworkPlan && !schedulerWorkerReworkPlan && schedulerWorkerValidation) {
              return {
                ...workflowNextAction("planning.scheduler.worker.rework-plan.compile", "生成第一个 worker rework 计划", "根据 validation failed 或 audit blocked/failed evidence 生成 bounded rework 计划；不会启动 rework、下一个 worker 或 scheduler loop。"),
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
                schedulerWorkerStartId: schedulerWorkerStart.id,
                schedulerWorkerResultId: schedulerWorkerResult.id,
                schedulerWorkerValidationId: schedulerWorkerValidation.id,
                schedulerWorkerAuditId: schedulerWorkerAudit?.id,
                reservationIntentId: schedulerWorkerValidation.reservationIntentId,
                claimIntentId: schedulerWorkerValidation.claimIntentId,
                taskRunId: schedulerWorkerValidation.taskRunId,
                workerLeaseId: schedulerWorkerValidation.workerLeaseId,
                worktreeId: schedulerWorkerValidation.worktreeId,
                runId: schedulerWorkerValidation.codeRunId,
                validationRunId: schedulerWorkerValidation.validationRunId,
                auditRunId: schedulerWorkerAudit?.auditRunId,
              };
            }
            if (schedulerWorkerReworkPlan && !schedulerWorkerReworkStart) {
              return {
                ...workflowNextAction("planning.scheduler.worker.rework-start-first", "启动第一个 worker rework", "在原 worker worktree 上启动一次 scoped rework-coder；只创建 rework TaskRun、WorkerLease、code run 和 Runtime Continuity sidecars。"),
                decompositionPlanId: decompositionPlan.id,
                readinessManifestId: decompositionReadiness.id,
                schedulerContractId: schedulerRun.schedulerContractId,
                schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                schedulerRunId: schedulerRun.id,
                schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
                schedulerClaimReservationId: schedulerWorkerReworkPlan.schedulerClaimReservationId,
                schedulerWorkerStartId: schedulerWorkerReworkPlan.schedulerWorkerStartId,
                schedulerWorkerResultId: schedulerWorkerReworkPlan.schedulerWorkerResultId,
                schedulerWorkerValidationId: schedulerWorkerReworkPlan.schedulerWorkerValidationId,
                schedulerWorkerAuditId: schedulerWorkerReworkPlan.schedulerWorkerAuditId,
                schedulerWorkerReworkPlanId: schedulerWorkerReworkPlan.id,
                reservationIntentId: schedulerWorkerReworkPlan.reservationIntentId,
                claimIntentId: schedulerWorkerReworkPlan.claimIntentId,
                taskRunId: schedulerWorkerReworkPlan.taskRunId,
                workerLeaseId: schedulerWorkerReworkPlan.workerLeaseId,
                worktreeId: schedulerWorkerReworkPlan.targetWorktreeId,
                runId: schedulerWorkerReworkPlan.targetCodeRunId,
                validationRunId: schedulerWorkerReworkPlan.validationRunId,
                auditRunId: schedulerWorkerReworkPlan.auditRunId,
              };
            }
            if (schedulerWorkerReworkStart && !schedulerWorkerReworkResult) {
              return {
                ...workflowNextAction("planning.scheduler.worker.rework-reconcile-result", "检查第一个 worker rework 结果", "读取 rework TaskRun、WorkerLease、worktree 和 rework code run evidence；只写 scheduler rework result，不启动 validation、audit、next worker 或 whole wave。"),
                decompositionPlanId: decompositionPlan.id,
                readinessManifestId: decompositionReadiness.id,
                schedulerContractId: schedulerRun.schedulerContractId,
                schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                schedulerRunId: schedulerRun.id,
                schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
                schedulerClaimReservationId: schedulerWorkerReworkStart.schedulerClaimReservationId,
                schedulerWorkerStartId: schedulerWorkerReworkStart.schedulerWorkerStartId,
                schedulerWorkerResultId: schedulerWorkerReworkStart.schedulerWorkerResultId,
                schedulerWorkerValidationId: schedulerWorkerReworkStart.schedulerWorkerValidationId,
                schedulerWorkerAuditId: schedulerWorkerReworkStart.schedulerWorkerAuditId,
                schedulerWorkerReworkPlanId: schedulerWorkerReworkStart.schedulerWorkerReworkPlanId,
                schedulerWorkerReworkStartId: schedulerWorkerReworkStart.id,
                reservationIntentId: schedulerWorkerReworkStart.reservationIntentId,
                claimIntentId: schedulerWorkerReworkStart.claimIntentId,
                taskRunId: schedulerWorkerReworkStart.reworkTaskRunId,
                workerLeaseId: schedulerWorkerReworkStart.reworkWorkerLeaseId,
                worktreeId: schedulerWorkerReworkStart.worktreeId,
                runId: schedulerWorkerReworkStart.reworkRunId,
              };
            }
            if (schedulerWorkerReworkResult?.status === "evidence-ready" && !schedulerWorkerReworkValidation) {
              return {
                ...workflowNextAction("planning.scheduler.worker.rework-validate-first", "验证第一个 worker rework 结果", "对 9L 复用的同一个 worktree 运行一次 scoped Validation；只写 scheduler rework validation evidence，不启动 audit、next worker 或 whole wave。"),
                decompositionPlanId: decompositionPlan.id,
                readinessManifestId: decompositionReadiness.id,
                schedulerContractId: schedulerRun.schedulerContractId,
                schedulerDispatchDryRunId: schedulerRun.schedulerDispatchDryRunId,
                schedulerWorkerPlanId: schedulerRun.schedulerWorkerPlanId,
                schedulerClaimReconcilePlanId: schedulerRun.schedulerClaimReconcilePlanId,
                schedulerLaunchPreflightId: schedulerRun.schedulerLaunchPreflightId,
                schedulerRunId: schedulerRun.id,
                schedulerReconcileSnapshotId: schedulerReconcileSnapshot.id,
                schedulerClaimReservationId: schedulerWorkerReworkResult.schedulerClaimReservationId,
                schedulerWorkerStartId: schedulerWorkerReworkResult.schedulerWorkerStartId,
                schedulerWorkerResultId: schedulerWorkerReworkResult.schedulerWorkerResultId,
                schedulerWorkerValidationId: schedulerWorkerReworkResult.schedulerWorkerValidationId,
                schedulerWorkerAuditId: schedulerWorkerReworkResult.schedulerWorkerAuditId,
                schedulerWorkerReworkPlanId: schedulerWorkerReworkResult.schedulerWorkerReworkPlanId,
                schedulerWorkerReworkStartId: schedulerWorkerReworkResult.schedulerWorkerReworkStartId,
                schedulerWorkerReworkResultId: schedulerWorkerReworkResult.id,
                reservationIntentId: schedulerWorkerReworkResult.reservationIntentId,
                claimIntentId: schedulerWorkerReworkResult.claimIntentId,
                taskRunId: schedulerWorkerReworkResult.reworkTaskRunId,
                workerLeaseId: schedulerWorkerReworkResult.reworkWorkerLeaseId,
                worktreeId: schedulerWorkerReworkResult.worktreeId,
                runId: schedulerWorkerReworkResult.reworkRunId,
                validationRunId: schedulerWorkerValidation?.validationRunId,
              };
            }
            const waitingActionType = schedulerWorkerReworkValidation || schedulerWorkerReworkResult || schedulerWorkerReworkStart || schedulerWorkerReworkPlan || needsReworkPlan
              ? "planning.scheduler.worker.rework-plan.compile"
              : schedulerWorkerAudit
                ? "planning.scheduler.worker.audit-first"
                : schedulerWorkerValidation
                  ? "planning.scheduler.worker.audit-first"
                  : "planning.scheduler.worker.validate-first";
            return {
              ...workflowNextAction(waitingActionType, schedulerWorkerReworkValidation ? "等待 rework audit 阶段" : schedulerWorkerReworkResult ? "等待 rework validation 阶段" : schedulerWorkerReworkStart ? "等待 rework 结果对账阶段" : schedulerWorkerReworkPlan ? "等待启动 rework" : schedulerWorkerAudit ? "等待后续 scheduler 阶段" : schedulerWorkerValidation ? "等待 Audit 阶段" : "等待验证阶段", schedulerWorkerReworkValidation ? "第一个 scheduler worker rework validation 已记录；rework audit 另开阶段。" : schedulerWorkerReworkResult ? "第一个 scheduler worker rework result 不是 evidence-ready 或等待 rework validation 阶段。" : schedulerWorkerReworkStart ? "第一个 scheduler worker rework 已启动；可以检查 rework 结果。" : schedulerWorkerReworkPlan ? "第一个 scheduler worker rework plan 已记录；可以启动一次 same-worktree rework。" : schedulerWorkerAudit ? "第一个 scheduler worker audit 已记录；rework/next-worker 不是当前范围。" : schedulerWorkerValidation ? "第一个 scheduler worker validation 未通过或 audit 条件未满足。" : "第一个 scheduler coder worker result 不是 evidence-ready，不能启动 validation。"),
              enabled: false,
              disabledReason: schedulerWorkerReworkValidation ? "第一个 worker rework validation 已记录，等待 rework audit 阶段。" : schedulerWorkerReworkResult ? "第一个 worker rework result 不是 evidence-ready 或等待 rework validation 阶段。" : schedulerWorkerReworkStart ? "第一个 worker rework 已启动，等待检查 rework 结果。" : schedulerWorkerReworkPlan ? "第一个 worker rework plan 已记录，等待用户确认启动 rework。" : schedulerWorkerAudit ? "第一个 worker audit 已记录。rework/next-worker 不是当前范围。" : schedulerWorkerValidation ? "第一个 worker validation 不是 passed。" : "第一个 worker result 不是 evidence-ready。",
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
              schedulerWorkerStartId: schedulerWorkerStart.id,
              schedulerWorkerResultId: schedulerWorkerResult.id,
              schedulerWorkerValidationId: schedulerWorkerValidation?.id,
              schedulerWorkerAuditId: schedulerWorkerAudit?.id,
              schedulerWorkerReworkPlanId: schedulerWorkerReworkPlan?.id,
              schedulerWorkerReworkStartId: schedulerWorkerReworkStart?.id,
              schedulerWorkerReworkResultId: schedulerWorkerReworkResult?.id,
              schedulerWorkerReworkValidationId: schedulerWorkerReworkValidation?.id,
              reservationIntentId: schedulerWorkerStart.reservationIntentId,
              claimIntentId: schedulerWorkerStart.claimIntentId,
              taskRunId: schedulerWorkerReworkValidation?.reworkTaskRunId ?? schedulerWorkerReworkResult?.reworkTaskRunId ?? schedulerWorkerReworkStart?.reworkTaskRunId ?? schedulerWorkerValidation?.taskRunId ?? schedulerWorkerResult.taskRunId ?? schedulerWorkerStart.taskRunId,
              workerLeaseId: schedulerWorkerReworkValidation?.reworkWorkerLeaseId ?? schedulerWorkerReworkResult?.reworkWorkerLeaseId ?? schedulerWorkerReworkStart?.reworkWorkerLeaseId ?? schedulerWorkerValidation?.workerLeaseId ?? schedulerWorkerResult.workerLeaseId ?? schedulerWorkerStart.workerLeaseId,
              worktreeId: schedulerWorkerReworkValidation?.worktreeId ?? schedulerWorkerReworkResult?.worktreeId ?? schedulerWorkerReworkStart?.worktreeId ?? schedulerWorkerValidation?.worktreeId ?? schedulerWorkerResult.worktreeId ?? schedulerWorkerStart.worktreeId,
              runId: schedulerWorkerReworkValidation?.reworkRunId ?? schedulerWorkerReworkResult?.reworkRunId ?? schedulerWorkerReworkStart?.reworkRunId ?? schedulerWorkerValidation?.codeRunId ?? schedulerWorkerResult.runId ?? schedulerWorkerStart.runId,
              validationRunId: schedulerWorkerValidation?.validationRunId,
              reworkValidationRunId: schedulerWorkerReworkValidation?.validationRunId,
              auditRunId: schedulerWorkerAudit?.auditRunId,
            };
          }
          return {
            ...workflowNextAction("planning.scheduler.worker.reconcile-result", "检查第一个 worker 结果", "读取 TaskRun、WorkerLease、worktree 和 code run evidence；只写 scheduler worker result，不启动 validation、audit、rework 或下一个 worker。"),
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
            schedulerWorkerStartId: schedulerWorkerStart.id,
            reservationIntentId: schedulerWorkerStart.reservationIntentId,
            claimIntentId: schedulerWorkerStart.claimIntentId,
          };
        }
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
