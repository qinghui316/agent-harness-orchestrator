import { existsSync } from "node:fs";
import { join } from "node:path";
import { recordToolEventAuditEntry } from "../../agent-task/boundary-audit.js";
import { evaluateToolPolicy, highImpactActions } from "../../agent-task/tool-policy.js";
import { getChangeStatusForChange } from "../../change/manager.js";
import { readIntegrationCheck } from "../../integration-check/manager.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import { readRun } from "../../run/repository.js";
import { readSchedulerRuntimeLineage } from "../../scheduler-runtime/guards.js";
import { findSchedulerClaimReservationForSnapshot, findSchedulerRuntimeWorkerAuditForValidation, findSchedulerRuntimeWorkerResultForStart, findSchedulerRuntimeWorkerReworkAuditForValidation, findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence, findSchedulerRuntimeWorkerReworkResultForStart, findSchedulerRuntimeWorkerReworkStartForPlan, findSchedulerRuntimeWorkerReworkValidationForResult, findSchedulerRuntimeWorkerStartForReservationIntent, findSchedulerRuntimeWorkerValidationForResult, listSchedulerRuntimeWorkerStarts, readLatestSchedulerIntegrationCandidateProjection, readLatestSchedulerIntegrationCheckHandoffProjection, readLatestSchedulerIntegrationOutcomeProjection, readLatestSchedulerRunBlockedCloseoutProjection, readLatestSchedulerRunCompletionProjection, readSchedulerIntegrationOutcome, readSchedulerReconcileSnapshot, readSchedulerRuntimeClaimReservation, readSchedulerRuntimeStateProjection, readSchedulerRuntimeWorkerAudit, readSchedulerRuntimeWorkerResult, readSchedulerRuntimeWorkerReworkPlan, readSchedulerRuntimeWorkerReworkResult, readSchedulerRuntimeWorkerReworkStart, readSchedulerRuntimeWorkerReworkValidation, readSchedulerRuntimeWorkerStart, readSchedulerRuntimeWorkerValidation } from "../../scheduler-runtime/repository.js";
import { latestLandingQueueSnapshot } from "../../landing-queue/manager.js";
import { readLatestGoalLoopControllerPolicy, readLatestGoalLoopNextStepPacket } from "../../goal-loop/manager.js";
import { listTaskQueues } from "../../task-queue/manager.js";
import { listTaskRuns } from "../../task-run/manager.js";
import type { ManagedProject, ResolvedMemory } from "../../types/index.js";
import { assertKnownTaskIds, requireSingleTaskId, requireTaskRunId } from "../../workflow-runtime/code-workflow.js";
import {
  readLatestDecompositionPlan,
  readLatestDecompositionReadinessManifest,
  readLatestTaskQueueProposal,
  readLatestWorkflowGraphPlan,
} from "../../workflow-artifacts/manager.js";
import {
  readLatestSchedulerContract,
  readLatestSchedulerClaimReconcilePlan,
  readLatestSchedulerDispatchDryRun,
  readLatestSchedulerLaunchPreflight,
  readLatestSchedulerWorkerSessionPlan,
  readLatestSchedulerRun,
  readSchedulerClaimReconcilePlan,
  readSchedulerContract,
  readSchedulerDispatchDryRun,
  readSchedulerLaunchPreflight,
  readSchedulerRun,
  readSchedulerWorkerSessionPlan,
} from "../../workflow-scheduler/manager.js";
import {
  assertWorkflowActionRequiredTargets,
  workflowActionScopePayload as buildWorkflowActionScopePayload,
  workflowActionScopesMatchStrict,
  workflowActionTargetId as buildWorkflowActionTargetId,
} from "../../workflow-actions/registry.js";
import { readWorkflowRun } from "../../workflow-run/manager.js";
import type { WorkbenchLiveSink, WorkbenchWorkflowActionRequest } from "../types.js";
import { requireActiveChangeTarget } from "./active-target.js";
import { assertGoalLoopAssistedConcreteGateConfirmation } from "./goal-loop-gate-confirmation.js";
import { readLatestPlanningBundle } from "./planning-bundle.js";

const HIGH_IMPACT_WORKBENCH_ACTIONS = new Set(highImpactActions());

export function assertWorkflowActionScope(request: WorkbenchWorkflowActionRequest): void {
  assertWorkflowActionRequiredTargets(request);
  const requireOne = (label: string, values: Array<unknown>): void => {
    if (!values.some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value))) throw new Error(`${request.actionType} requires ${label}.`);
  };
  switch (request.actionType) {
    case "result.refresh-rework":
    case "result.revalidate":
    case "result.reaudit":
    case "result.refresh-status":
    case "validate.run":
    case "audit.run":
    case "spec-test.drift":
      requireOne("worktreeId", [request.worktreeId]);
      return;
    case "landing.prepare":
    case "landing.refresh":
      requireOne("applyCheckId or worktreeId", [request.applyCheckId, request.worktreeId]);
      return;
    case "landing.review":
      requireOne("landingPackageId", [request.landingPackageId]);
      return;
    case "landing-queue.refresh":
      return;
    case "landing-queue.merge-next":
      requireOne("landingPackageId", [request.landingPackageId]);
      return;
    default:
      return;
  }
}

export async function auditHighImpactWorkflowAction(project: ManagedProject, changeId: string, request: WorkbenchWorkflowActionRequest, live?: WorkbenchLiveSink): Promise<void> {
  if (!HIGH_IMPACT_WORKBENCH_ACTIONS.has(request.actionType)) return;
  const memory = await resolveProjectMemory(project);
  await assertCurrentHighImpactWorkflowTarget(memory, changeId, request);
  const targetId = workflowActionTargetId(request, changeId);
  const scope = workflowActionScopePayload(request, changeId);
  const decision = evaluateToolPolicy({
    actionType: request.actionType,
    actorRoleId: "main-agent",
    changeId,
    conversationId: changeId,
    targetId,
    enforcementMode: "broker-enforced",
  });
  const artifact = await recordToolEventAuditEntry(memory, {
    changeId,
    conversationId: changeId,
    actorRoleId: "main-agent",
    actionType: request.actionType,
    targetId,
    scope,
    decision,
  });
  live?.emit({
    event: "run.status",
    data: {
      actionRunId: decision.id,
      status: decision.status === "denied" || decision.status === "unavailable" ? "failed" : "running",
      label: "ToolPolicyGate",
    },
  });
  if (decision.status === "denied" || decision.status === "unavailable") {
    throw new Error(`${decision.readableMessage} Evidence: ${artifact}`);
  }
}

async function assertCurrentHighImpactWorkflowTarget(memory: ResolvedMemory, changeId: string, request: WorkbenchWorkflowActionRequest): Promise<void> {
  if (request.goalLoopGateReadinessPreflightId) {
    const target = await requireActiveChangeTarget(memory, changeId, "Goal Loop-assisted concrete gate");
    await assertGoalLoopAssistedConcreteGateConfirmation(memory, target.path, changeId, request);
  }
  if (request.actionType === "planning.confirm-execution") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.confirm-execution");
    if (!request.planningBundleId) throw new Error("planning.confirm-execution requires planningBundleId.");
    const bundle = await readLatestPlanningBundle(memory, target.path);
    if (bundle.id !== request.planningBundleId || bundle.status !== "draft" || !existsSync(join(memory.memoryRoot, target.path, "planning", "latest-bundle.json"))) {
      throw new Error("planning.confirm-execution target is stale or no longer confirmable.");
    }
  }
  if (request.actionType === "planning.decomposition.confirm") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.decomposition.confirm");
    if (!request.decompositionPlanId) throw new Error("planning.decomposition.confirm requires decompositionPlanId.");
    const plan = await readLatestDecompositionPlan(memory, target.path);
    if (plan.id !== request.decompositionPlanId || plan.status !== "draft") {
      throw new Error("planning.decomposition.confirm target is stale or no longer confirmable.");
    }
  }
  if (request.actionType === "planning.decomposition.assess-readiness") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.decomposition.assess-readiness");
    if (!request.decompositionPlanId) throw new Error("planning.decomposition.assess-readiness requires decompositionPlanId.");
    const plan = await readLatestDecompositionPlan(memory, target.path);
    if (plan.id !== request.decompositionPlanId || plan.status !== "confirmed") {
      throw new Error("planning.decomposition.assess-readiness target is stale or no longer assessable.");
    }
  }
  if (request.actionType === "planning.taskqueue.propose") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.taskqueue.propose");
    if (!request.readinessManifestId) throw new Error("planning.taskqueue.propose requires readinessManifestId.");
    const manifest = await readLatestDecompositionReadinessManifest(memory, target.path);
    if (manifest.id !== request.readinessManifestId || manifest.status !== "ready-for-sequential-taskqueue-proposal" || manifest.nextAllowedAction !== "taskqueue.proposal") {
      throw new Error("planning.taskqueue.propose target is stale or no longer proposal-ready.");
    }
  }
  if (request.actionType === "planning.goal-loop.evaluate") {
    await requireActiveChangeTarget(memory, changeId, "planning.goal-loop.evaluate");
    if (request.changeId && request.changeId !== changeId) throw new Error("planning.goal-loop.evaluate changeId scope mismatch.");
  }
  if (request.actionType === "planning.goal-loop.feedback.evaluate") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.goal-loop.feedback.evaluate");
    if (request.changeId && request.changeId !== changeId) throw new Error("planning.goal-loop.feedback.evaluate changeId scope mismatch.");
    if (!request.goalLoopNextStepPacketId) throw new Error("planning.goal-loop.feedback.evaluate requires goalLoopNextStepPacketId.");
    const packet = await readLatestGoalLoopNextStepPacket(memory, target.path);
    if (packet.id !== request.goalLoopNextStepPacketId || packet.changeId !== changeId || packet.executionStarted !== false) {
      throw new Error("planning.goal-loop.feedback.evaluate target is stale or no longer feedback-ready.");
    }
  }
  if (request.actionType === "planning.goal-loop.controller.refresh") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.goal-loop.controller.refresh");
    if (request.changeId && request.changeId !== changeId) throw new Error("planning.goal-loop.controller.refresh changeId scope mismatch.");
    if (!request.goalLoopNextStepPacketId) throw new Error("planning.goal-loop.controller.refresh requires goalLoopNextStepPacketId.");
    if (!request.goalLoopCurrentGateActionType) throw new Error("planning.goal-loop.controller.refresh requires goalLoopCurrentGateActionType.");
    const packet = await readLatestGoalLoopNextStepPacket(memory, target.path);
    if (packet.id !== request.goalLoopNextStepPacketId || packet.changeId !== changeId || packet.executionStarted !== false) {
      throw new Error("planning.goal-loop.controller.refresh target is stale or no longer refreshable.");
    }
    if (!packet.recommendedAction || packet.recommendedAction.actionType !== request.goalLoopCurrentGateActionType) {
      throw new Error("planning.goal-loop.controller.refresh target no longer matches the current gate.");
    }
  }
  if (request.actionType === "planning.goal-loop.gate-readiness.prepare") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.goal-loop.gate-readiness.prepare");
    if (request.changeId && request.changeId !== changeId) throw new Error("planning.goal-loop.gate-readiness.prepare changeId scope mismatch.");
    if (!request.goalLoopNextStepPacketId) throw new Error("planning.goal-loop.gate-readiness.prepare requires goalLoopNextStepPacketId.");
    if (!request.goalLoopControllerPolicyId) throw new Error("planning.goal-loop.gate-readiness.prepare requires goalLoopControllerPolicyId.");
    if (!request.goalLoopCurrentGateActionType) throw new Error("planning.goal-loop.gate-readiness.prepare requires goalLoopCurrentGateActionType.");
    if (request.goalLoopCurrentGateActionType.startsWith("planning.goal-loop.")) throw new Error("planning.goal-loop.gate-readiness.prepare cannot target recursive Goal Loop actions.");
    const [packet, policy] = await Promise.all([
      readLatestGoalLoopNextStepPacket(memory, target.path),
      readLatestGoalLoopControllerPolicy(memory, target.path),
    ]);
    if (packet.id !== request.goalLoopNextStepPacketId || packet.changeId !== changeId || packet.executionStarted !== false) {
      throw new Error("planning.goal-loop.gate-readiness.prepare packet target is stale.");
    }
    if (
      policy.id !== request.goalLoopControllerPolicyId
      || policy.changeId !== changeId
      || policy.sourceGoalLoopNextStepPacketId !== packet.id
      || policy.verdict !== "recommend-existing-gate"
      || policy.gateStatus !== "matches-current-gate"
      || policy.executionStarted !== false
      || !policy.currentGate
    ) {
      throw new Error("planning.goal-loop.gate-readiness.prepare controller policy target is stale.");
    }
    if (!packet.recommendedAction || packet.recommendedAction.actionType !== request.goalLoopCurrentGateActionType || policy.currentGate.actionType !== request.goalLoopCurrentGateActionType) {
      throw new Error("planning.goal-loop.gate-readiness.prepare target no longer matches the current gate.");
    }
    const expectedGate = { actionType: request.goalLoopCurrentGateActionType, changeId, ...packet.recommendedAction.scope };
    const requestedGate = { actionType: request.goalLoopCurrentGateActionType, changeId, ...readConcreteGateRequestScope(request, packet.recommendedAction.scope) };
    if (!workflowActionScopesMatchStrict(expectedGate, requestedGate)) {
      throw new Error("planning.goal-loop.gate-readiness.prepare concrete gate scope mismatch.");
    }
  }
  if (request.actionType === "planning.scheduler.plan.prepare") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.plan.prepare");
    if (request.changeId && request.changeId !== changeId) throw new Error("planning.scheduler.plan.prepare changeId scope mismatch.");
    if (request.schedulerClaimReservationId || request.schedulerReconcileSnapshotId || request.schedulerRunId) {
      if (!request.schedulerRunId) throw new Error("planning.scheduler.plan.prepare launch confirmation requires schedulerRunId.");
      if (!request.schedulerReconcileSnapshotId) throw new Error("planning.scheduler.plan.prepare launch confirmation requires schedulerReconcileSnapshotId.");
      if (!request.schedulerClaimReservationId) throw new Error("planning.scheduler.plan.prepare launch confirmation requires schedulerClaimReservationId.");
      const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
      if (run.changeId !== changeId || run.status !== "prepared") throw new Error("planning.scheduler.plan.prepare SchedulerRun target is stale.");
      const latestRun = await readLatestSchedulerRun(memory, target.path);
      if (latestRun.id !== run.id) throw new Error("planning.scheduler.plan.prepare requires the latest SchedulerRun.");
      await readSchedulerRuntimeLineage(memory, target.path, run.id);
      const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
      if (!runtimeState) throw new Error("planning.scheduler.plan.prepare requires initialized SchedulerRuntimeState.");
      if (runtimeState.lastReconcileSnapshotId !== request.schedulerReconcileSnapshotId) throw new Error("planning.scheduler.plan.prepare requires the latest SchedulerReconcileSnapshot.");
      if (runtimeState.lastClaimReservationId !== request.schedulerClaimReservationId || runtimeState.lastClaimReservationSnapshotId !== request.schedulerReconcileSnapshotId) {
        throw new Error("planning.scheduler.plan.prepare requires the latest SchedulerRuntimeClaimReservation.");
      }
      const snapshot = await readSchedulerReconcileSnapshot(memory, target.path, run.id, request.schedulerReconcileSnapshotId);
      if (snapshot.changeId !== changeId || snapshot.schedulerRunId !== run.id || snapshot.schedulerRuntimeStateId !== runtimeState.id) {
        throw new Error("planning.scheduler.plan.prepare SchedulerReconcileSnapshot target is stale.");
      }
      const reservation = await readSchedulerRuntimeClaimReservation(memory, target.path, run.id, request.schedulerClaimReservationId);
      if (reservation.changeId !== changeId || reservation.schedulerRunId !== run.id || reservation.schedulerReconcileSnapshotId !== snapshot.id || reservation.schedulerRuntimeStateId !== runtimeState.id) {
        throw new Error("planning.scheduler.plan.prepare SchedulerRuntimeClaimReservation target is stale.");
      }
      return;
    }
    const plan = await readLatestDecompositionPlan(memory, target.path);
    if (plan.changeId !== changeId || plan.status !== "confirmed" || plan.recommendation !== "taskgraph-parallel-candidate") {
      throw new Error("planning.scheduler.plan.prepare requires a confirmed parallel DecompositionPlan.");
    }
    const manifest = await readLatestDecompositionReadinessManifest(memory, target.path);
    if (manifest.changeId !== changeId || manifest.decompositionPlanId !== plan.id || manifest.status !== "ready-for-scheduler-contract" || manifest.nextAllowedAction !== "scheduler.contract") {
      throw new Error("planning.scheduler.plan.prepare readiness target is stale.");
    }
  }
  if (request.actionType === "planning.scheduler.contract.compile") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.contract.compile");
    if (!request.decompositionPlanId) throw new Error("planning.scheduler.contract.compile requires decompositionPlanId.");
    if (!request.readinessManifestId) throw new Error("planning.scheduler.contract.compile requires readinessManifestId.");
    const plan = await readLatestDecompositionPlan(memory, target.path);
    if (plan.id !== request.decompositionPlanId || plan.changeId !== changeId || plan.status !== "confirmed" || plan.recommendation !== "taskgraph-parallel-candidate") {
      throw new Error("planning.scheduler.contract.compile plan target is stale or no longer compilable.");
    }
    const manifest = await readLatestDecompositionReadinessManifest(memory, target.path);
    if (manifest.id !== request.readinessManifestId || manifest.changeId !== changeId || manifest.decompositionPlanId !== plan.id || manifest.status !== "ready-for-scheduler-contract" || manifest.nextAllowedAction !== "scheduler.contract") {
      throw new Error("planning.scheduler.contract.compile readiness target is stale.");
    }
  }
  if (request.actionType === "planning.scheduler.dispatch.dry-run") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.dispatch.dry-run");
    if (!request.schedulerContractId) throw new Error("planning.scheduler.dispatch.dry-run requires schedulerContractId.");
    const contract = await readSchedulerContract(memory, target.path, request.schedulerContractId);
    if (contract.id !== request.schedulerContractId || contract.changeId !== changeId || contract.status !== "compiled") {
      throw new Error("planning.scheduler.dispatch.dry-run SchedulerContract target is stale.");
    }
  }
  if (request.actionType === "planning.scheduler.worker-plan.compile") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.worker-plan.compile");
    if (!request.schedulerDispatchDryRunId) throw new Error("planning.scheduler.worker-plan.compile requires schedulerDispatchDryRunId.");
    const dryRun = await readSchedulerDispatchDryRun(memory, target.path, request.schedulerDispatchDryRunId);
    if (dryRun.id !== request.schedulerDispatchDryRunId || dryRun.changeId !== changeId || dryRun.status !== "generated") {
      throw new Error("planning.scheduler.worker-plan.compile SchedulerDispatchDryRun target is stale.");
    }
    const latestDryRun = await readLatestSchedulerDispatchDryRun(memory, target.path);
    if (latestDryRun.id !== dryRun.id) throw new Error("planning.scheduler.worker-plan.compile requires the latest SchedulerDispatchDryRun.");
    const contract = await readSchedulerContract(memory, target.path, dryRun.schedulerContractId);
    if (contract.id !== dryRun.schedulerContractId || contract.changeId !== changeId || contract.status !== "compiled") {
      throw new Error("planning.scheduler.worker-plan.compile SchedulerContract lineage is stale.");
    }
    const latestContract = await readLatestSchedulerContract(memory, target.path);
    if (latestContract.id !== contract.id) throw new Error("planning.scheduler.worker-plan.compile requires the latest SchedulerContract.");
  }
  if (request.actionType === "planning.scheduler.claim-reconcile.compile") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.claim-reconcile.compile");
    if (!request.schedulerWorkerPlanId) throw new Error("planning.scheduler.claim-reconcile.compile requires schedulerWorkerPlanId.");
    const workerPlan = await readSchedulerWorkerSessionPlan(memory, target.path, request.schedulerWorkerPlanId);
    if (workerPlan.id !== request.schedulerWorkerPlanId || workerPlan.changeId !== changeId || workerPlan.status !== "planned") {
      throw new Error("planning.scheduler.claim-reconcile.compile SchedulerWorkerSessionPlan target is stale.");
    }
    const latestWorkerPlan = await readLatestSchedulerWorkerSessionPlan(memory, target.path);
    if (latestWorkerPlan.id !== workerPlan.id) throw new Error("planning.scheduler.claim-reconcile.compile requires the latest SchedulerWorkerSessionPlan.");
    const dryRun = await readSchedulerDispatchDryRun(memory, target.path, workerPlan.schedulerDispatchDryRunId);
    if (dryRun.id !== workerPlan.schedulerDispatchDryRunId || dryRun.changeId !== changeId || dryRun.status !== "generated") {
      throw new Error("planning.scheduler.claim-reconcile.compile SchedulerDispatchDryRun lineage is stale.");
    }
    const latestDryRun = await readLatestSchedulerDispatchDryRun(memory, target.path);
    if (latestDryRun.id !== dryRun.id) throw new Error("planning.scheduler.claim-reconcile.compile requires the latest SchedulerDispatchDryRun.");
    const contract = await readSchedulerContract(memory, target.path, workerPlan.schedulerContractId);
    if (contract.id !== workerPlan.schedulerContractId || contract.id !== dryRun.schedulerContractId || contract.changeId !== changeId || contract.status !== "compiled") {
      throw new Error("planning.scheduler.claim-reconcile.compile SchedulerContract lineage is stale.");
    }
    const latestContract = await readLatestSchedulerContract(memory, target.path);
    if (latestContract.id !== contract.id) throw new Error("planning.scheduler.claim-reconcile.compile requires the latest SchedulerContract.");
  }
  if (request.actionType === "planning.scheduler.launch-preflight.check") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.launch-preflight.check");
    if (!request.schedulerClaimReconcilePlanId) throw new Error("planning.scheduler.launch-preflight.check requires schedulerClaimReconcilePlanId.");
    const claimPlan = await readSchedulerClaimReconcilePlan(memory, target.path, request.schedulerClaimReconcilePlanId);
    if (claimPlan.id !== request.schedulerClaimReconcilePlanId || claimPlan.changeId !== changeId || claimPlan.status !== "planned") {
      throw new Error("planning.scheduler.launch-preflight.check SchedulerClaimReconcilePlan target is stale.");
    }
    const latestClaimPlan = await readLatestSchedulerClaimReconcilePlan(memory, target.path);
    if (latestClaimPlan.id !== claimPlan.id) throw new Error("planning.scheduler.launch-preflight.check requires the latest SchedulerClaimReconcilePlan.");
    const workerPlan = await readSchedulerWorkerSessionPlan(memory, target.path, claimPlan.schedulerWorkerPlanId);
    if (workerPlan.id !== claimPlan.schedulerWorkerPlanId || workerPlan.changeId !== changeId || workerPlan.status !== "planned") {
      throw new Error("planning.scheduler.launch-preflight.check SchedulerWorkerSessionPlan lineage is stale.");
    }
    const latestWorkerPlan = await readLatestSchedulerWorkerSessionPlan(memory, target.path);
    if (latestWorkerPlan.id !== workerPlan.id) throw new Error("planning.scheduler.launch-preflight.check requires the latest SchedulerWorkerSessionPlan.");
    const dryRun = await readSchedulerDispatchDryRun(memory, target.path, claimPlan.schedulerDispatchDryRunId);
    if (dryRun.id !== claimPlan.schedulerDispatchDryRunId || dryRun.id !== workerPlan.schedulerDispatchDryRunId || dryRun.changeId !== changeId || dryRun.status !== "generated") {
      throw new Error("planning.scheduler.launch-preflight.check SchedulerDispatchDryRun lineage is stale.");
    }
    const latestDryRun = await readLatestSchedulerDispatchDryRun(memory, target.path);
    if (latestDryRun.id !== dryRun.id) throw new Error("planning.scheduler.launch-preflight.check requires the latest SchedulerDispatchDryRun.");
    const contract = await readSchedulerContract(memory, target.path, claimPlan.schedulerContractId);
    if (contract.id !== claimPlan.schedulerContractId || contract.id !== workerPlan.schedulerContractId || contract.id !== dryRun.schedulerContractId || contract.changeId !== changeId || contract.status !== "compiled") {
      throw new Error("planning.scheduler.launch-preflight.check SchedulerContract lineage is stale.");
    }
    const latestContract = await readLatestSchedulerContract(memory, target.path);
    if (latestContract.id !== contract.id) throw new Error("planning.scheduler.launch-preflight.check requires the latest SchedulerContract.");
  }
  if (request.actionType === "planning.scheduler.run.prepare") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.run.prepare");
    if (!request.schedulerLaunchPreflightId) throw new Error("planning.scheduler.run.prepare requires schedulerLaunchPreflightId.");
    const preflight = await readSchedulerLaunchPreflight(memory, target.path, request.schedulerLaunchPreflightId);
    if (preflight.id !== request.schedulerLaunchPreflightId || preflight.changeId !== changeId || preflight.status !== "checked") {
      throw new Error("planning.scheduler.run.prepare SchedulerLaunchPreflight target is stale or not checked.");
    }
    const latestPreflight = await readLatestSchedulerLaunchPreflight(memory, target.path);
    if (latestPreflight.id !== preflight.id) throw new Error("planning.scheduler.run.prepare requires the latest SchedulerLaunchPreflight.");
    const claimPlan = await readSchedulerClaimReconcilePlan(memory, target.path, preflight.schedulerClaimReconcilePlanId);
    if (claimPlan.id !== preflight.schedulerClaimReconcilePlanId || claimPlan.changeId !== changeId || claimPlan.status !== "planned") {
      throw new Error("planning.scheduler.run.prepare SchedulerClaimReconcilePlan lineage is stale.");
    }
    const latestClaimPlan = await readLatestSchedulerClaimReconcilePlan(memory, target.path);
    if (latestClaimPlan.id !== claimPlan.id) throw new Error("planning.scheduler.run.prepare requires the latest SchedulerClaimReconcilePlan.");
    const workerPlan = await readSchedulerWorkerSessionPlan(memory, target.path, preflight.schedulerWorkerPlanId);
    if (workerPlan.id !== preflight.schedulerWorkerPlanId || workerPlan.id !== claimPlan.schedulerWorkerPlanId || workerPlan.changeId !== changeId || workerPlan.status !== "planned") {
      throw new Error("planning.scheduler.run.prepare SchedulerWorkerSessionPlan lineage is stale.");
    }
    const latestWorkerPlan = await readLatestSchedulerWorkerSessionPlan(memory, target.path);
    if (latestWorkerPlan.id !== workerPlan.id) throw new Error("planning.scheduler.run.prepare requires the latest SchedulerWorkerSessionPlan.");
    const dryRun = await readSchedulerDispatchDryRun(memory, target.path, preflight.schedulerDispatchDryRunId);
    if (dryRun.id !== preflight.schedulerDispatchDryRunId || dryRun.id !== claimPlan.schedulerDispatchDryRunId || dryRun.id !== workerPlan.schedulerDispatchDryRunId || dryRun.changeId !== changeId || dryRun.status !== "generated") {
      throw new Error("planning.scheduler.run.prepare SchedulerDispatchDryRun lineage is stale.");
    }
    const latestDryRun = await readLatestSchedulerDispatchDryRun(memory, target.path);
    if (latestDryRun.id !== dryRun.id) throw new Error("planning.scheduler.run.prepare requires the latest SchedulerDispatchDryRun.");
    const contract = await readSchedulerContract(memory, target.path, preflight.schedulerContractId);
    if (contract.id !== preflight.schedulerContractId || contract.id !== claimPlan.schedulerContractId || contract.id !== workerPlan.schedulerContractId || contract.id !== dryRun.schedulerContractId || contract.changeId !== changeId || contract.status !== "compiled") {
      throw new Error("planning.scheduler.run.prepare SchedulerContract lineage is stale.");
    }
    const latestContract = await readLatestSchedulerContract(memory, target.path);
    if (latestContract.id !== contract.id) throw new Error("planning.scheduler.run.prepare requires the latest SchedulerContract.");
  }
  if (request.actionType === "planning.scheduler.runtime.initialize" || request.actionType === "planning.scheduler.runtime.reconcile" || request.actionType === "planning.scheduler.runtime.reserve-claims") {
    const target = await requireActiveChangeTarget(memory, changeId, request.actionType);
    if (!request.schedulerRunId) throw new Error(`${request.actionType} requires schedulerRunId.`);
    const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
    if (run.id !== request.schedulerRunId || run.changeId !== changeId || run.status !== "prepared") {
      throw new Error(`${request.actionType} SchedulerRun target is stale or not prepared.`);
    }
    const latestRun = await readLatestSchedulerRun(memory, target.path);
    if (latestRun.id !== run.id) throw new Error(`${request.actionType} requires the latest SchedulerRun.`);
    await readSchedulerRuntimeLineage(memory, target.path, run.id);
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
    if (request.actionType === "planning.scheduler.runtime.initialize" && runtimeState) {
      throw new Error("planning.scheduler.runtime.initialize SchedulerRuntimeState already exists.");
    }
    if ((request.actionType === "planning.scheduler.runtime.reconcile" || request.actionType === "planning.scheduler.runtime.reserve-claims") && !runtimeState) {
      throw new Error(`${request.actionType} requires initialized SchedulerRuntimeState.`);
    }
    if (request.actionType === "planning.scheduler.runtime.reserve-claims") {
      if (!request.schedulerReconcileSnapshotId) throw new Error("planning.scheduler.runtime.reserve-claims requires schedulerReconcileSnapshotId.");
      if (runtimeState?.lastReconcileSnapshotId !== request.schedulerReconcileSnapshotId) {
        throw new Error("planning.scheduler.runtime.reserve-claims requires the latest SchedulerReconcileSnapshot.");
      }
      const snapshot = await readSchedulerReconcileSnapshot(memory, target.path, run.id, request.schedulerReconcileSnapshotId);
      if (snapshot.changeId !== changeId || snapshot.schedulerRunId !== run.id || snapshot.schedulerRuntimeStateId !== runtimeState.id) {
        throw new Error("planning.scheduler.runtime.reserve-claims SchedulerReconcileSnapshot target is stale.");
      }
      const existing = await findSchedulerClaimReservationForSnapshot(memory, target.path, run.id, snapshot.id);
      if (existing) throw new Error("planning.scheduler.runtime.reserve-claims reservation already exists for this snapshot.");
    }
  }
  if (request.actionType === "planning.scheduler.worker.start-first" || request.actionType === "planning.scheduler.worker.start-next") {
    const target = await requireActiveChangeTarget(memory, changeId, request.actionType, { includeChangeId: false });
    if (!request.schedulerRunId) throw new Error(`${request.actionType} requires schedulerRunId.`);
    if (!request.schedulerClaimReservationId) throw new Error(`${request.actionType} requires schedulerClaimReservationId.`);
    if (request.actionType === "planning.scheduler.worker.start-next") {
      if (!request.reservationIntentId) throw new Error("planning.scheduler.worker.start-next requires reservationIntentId.");
      if (!request.claimIntentId) throw new Error("planning.scheduler.worker.start-next requires claimIntentId.");
    }
    const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
    if (run.id !== request.schedulerRunId || run.changeId !== changeId || run.status !== "prepared") {
      throw new Error(`${request.actionType} SchedulerRun target is stale or not prepared.`);
    }
    const latestRun = await readLatestSchedulerRun(memory, target.path);
    if (latestRun.id !== run.id) throw new Error(`${request.actionType} requires the latest SchedulerRun.`);
    await readSchedulerRuntimeLineage(memory, target.path, run.id);
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
    if (!runtimeState?.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId) {
      throw new Error(`${request.actionType} requires runtime state with latest reconcile snapshot and claim reservation.`);
    }
    const snapshot = await readSchedulerReconcileSnapshot(memory, target.path, run.id, runtimeState.lastReconcileSnapshotId);
    const reservation = await readSchedulerRuntimeClaimReservation(memory, target.path, run.id, request.schedulerClaimReservationId);
    if (reservation.id !== runtimeState.lastClaimReservationId || reservation.schedulerReconcileSnapshotId !== snapshot.id || runtimeState.lastClaimReservationSnapshotId !== snapshot.id || reservation.status !== "reserved") {
      throw new Error(`${request.actionType} SchedulerRuntimeClaimReservation target is stale or not reserved.`);
    }
    const selectedIntent = request.reservationIntentId
      ? reservation.reservationIntents.find((intent) => intent.reservationIntentId === request.reservationIntentId)
      : reservation.reservationIntents.find((intent) => intent.status === "reserved");
    if (!selectedIntent || selectedIntent.status !== "reserved") {
      throw new Error(`${request.actionType} requires a runnable reservation intent.`);
    }
    if (request.claimIntentId && selectedIntent.claimIntentId !== request.claimIntentId) {
      throw new Error(`${request.actionType} claimIntentId target is stale.`);
    }
    const existing = await findSchedulerRuntimeWorkerStartForReservationIntent(memory, target.path, run.id, selectedIntent.reservationIntentId);
    if (existing) throw new Error(`${request.actionType} reservation intent already started.`);
    if (request.actionType === "planning.scheduler.worker.start-next") {
      const starts = await listSchedulerRuntimeWorkerStarts(memory, target.path, run.id);
      const scopedStarts = starts.filter((start) => start.schedulerClaimReservationId === reservation.id);
      if (!scopedStarts.length) {
        throw new Error("planning.scheduler.worker.start-next requires an existing scheduler worker start.");
      }
      const startedReservationIntentIds = new Set(scopedStarts.map((start) => start.reservationIntentId));
      const nextIntent = reservation.reservationIntents
        .filter((intent) => intent.status === "reserved" && !startedReservationIntentIds.has(intent.reservationIntentId))
        .sort((a, b) => a.waveIndex - b.waveIndex || reservation.reservationIntents.indexOf(a) - reservation.reservationIntents.indexOf(b))[0];
      if (!nextIntent || request.reservationIntentId !== nextIntent.reservationIntentId) {
        throw new Error("planning.scheduler.worker.start-next must target the first unstarted reserved reservation intent.");
      }
      const latestCandidate = await readLatestSchedulerIntegrationCandidateProjection(memory, target.path, run.id);
      if (!latestCandidate || latestCandidate.schedulerClaimReservationId !== reservation.id || latestCandidate.status !== "waiting" || latestCandidate.readyCount !== 1 || latestCandidate.blockedCount !== 0) {
        throw new Error("planning.scheduler.worker.start-next requires a waiting SchedulerIntegrationCandidate with exactly one ready output and no blocked output.");
      }
      const latestHandoff = await readLatestSchedulerIntegrationCheckHandoffProjection(memory, target.path, run.id);
      if (latestHandoff) throw new Error("planning.scheduler.worker.start-next is blocked after SchedulerIntegrationCheck handoff exists.");
      const latestOutcome = await readLatestSchedulerIntegrationOutcomeProjection(memory, target.path, run.id);
      if (latestOutcome) throw new Error("planning.scheduler.worker.start-next is blocked after SchedulerIntegrationOutcome exists.");
    }
  }
  if (request.actionType === "planning.scheduler.worker.reconcile-result") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.worker.reconcile-result", { includeChangeId: false });
    if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.reconcile-result requires schedulerRunId.");
    if (!request.schedulerWorkerStartId) throw new Error("planning.scheduler.worker.reconcile-result requires schedulerWorkerStartId.");
    const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
    if (run.id !== request.schedulerRunId || run.changeId !== changeId || run.status !== "prepared") {
      throw new Error("planning.scheduler.worker.reconcile-result SchedulerRun target is stale or not prepared.");
    }
    const latestRun = await readLatestSchedulerRun(memory, target.path);
    if (latestRun.id !== run.id) throw new Error("planning.scheduler.worker.reconcile-result requires the latest SchedulerRun.");
    await readSchedulerRuntimeLineage(memory, target.path, run.id);
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
    if (!runtimeState?.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId) {
      throw new Error("planning.scheduler.worker.reconcile-result requires runtime state with latest reconcile snapshot and claim reservation.");
    }
    const snapshot = await readSchedulerReconcileSnapshot(memory, target.path, run.id, runtimeState.lastReconcileSnapshotId);
    const reservation = await readSchedulerRuntimeClaimReservation(memory, target.path, run.id, runtimeState.lastClaimReservationId);
    if (reservation.schedulerReconcileSnapshotId !== snapshot.id || runtimeState.lastClaimReservationSnapshotId !== snapshot.id) {
      throw new Error("planning.scheduler.worker.reconcile-result SchedulerRuntimeClaimReservation target is stale.");
    }
    const workerStart = await readSchedulerRuntimeWorkerStart(memory, target.path, run.id, request.schedulerWorkerStartId);
    if (
      workerStart.changeId !== changeId
      || workerStart.schedulerRunId !== run.id
      || workerStart.schedulerRuntimeStateId !== runtimeState.id
      || workerStart.schedulerReconcileSnapshotId !== snapshot.id
      || workerStart.schedulerClaimReservationId !== reservation.id
    ) {
      throw new Error("planning.scheduler.worker.reconcile-result WorkerStart target is stale.");
    }
    if (request.schedulerClaimReservationId && request.schedulerClaimReservationId !== workerStart.schedulerClaimReservationId) {
      throw new Error("planning.scheduler.worker.reconcile-result SchedulerRuntimeClaimReservation scope mismatch.");
    }
    if (request.reservationIntentId && request.reservationIntentId !== workerStart.reservationIntentId) {
      throw new Error("planning.scheduler.worker.reconcile-result reservationIntentId scope mismatch.");
    }
    if (request.claimIntentId && request.claimIntentId !== workerStart.claimIntentId) {
      throw new Error("planning.scheduler.worker.reconcile-result claimIntentId scope mismatch.");
    }
    if (request.taskRunId && request.taskRunId !== workerStart.taskRunId) {
      throw new Error("planning.scheduler.worker.reconcile-result TaskRun scope mismatch.");
    }
    if (request.workerLeaseId && request.workerLeaseId !== workerStart.workerLeaseId) {
      throw new Error("planning.scheduler.worker.reconcile-result WorkerLease scope mismatch.");
    }
    if (request.worktreeId && request.worktreeId !== workerStart.worktreeId) {
      throw new Error("planning.scheduler.worker.reconcile-result worktree scope mismatch.");
    }
    if (request.runId && request.runId !== workerStart.runId) {
      throw new Error("planning.scheduler.worker.reconcile-result code run scope mismatch.");
    }
    const existingResult = await findSchedulerRuntimeWorkerResultForStart(memory, target.path, run.id, workerStart.id);
    if (request.schedulerWorkerResultId && existingResult?.id !== request.schedulerWorkerResultId) {
      throw new Error("planning.scheduler.worker.reconcile-result WorkerResult scope mismatch.");
    }
  }
  if (request.actionType === "planning.scheduler.worker.validate-first") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.worker.validate-first", { includeChangeId: false });
    if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.validate-first requires schedulerRunId.");
    if (!request.schedulerWorkerResultId) throw new Error("planning.scheduler.worker.validate-first requires schedulerWorkerResultId.");
    const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
    if (run.id !== request.schedulerRunId || run.changeId !== changeId || run.status !== "prepared") {
      throw new Error("planning.scheduler.worker.validate-first SchedulerRun target is stale or not prepared.");
    }
    const latestRun = await readLatestSchedulerRun(memory, target.path);
    if (latestRun.id !== run.id) throw new Error("planning.scheduler.worker.validate-first requires the latest SchedulerRun.");
    await readSchedulerRuntimeLineage(memory, target.path, run.id);
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
    if (!runtimeState?.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId) {
      throw new Error("planning.scheduler.worker.validate-first requires runtime state with latest reconcile snapshot and claim reservation.");
    }
    const snapshot = await readSchedulerReconcileSnapshot(memory, target.path, run.id, runtimeState.lastReconcileSnapshotId);
    const reservation = await readSchedulerRuntimeClaimReservation(memory, target.path, run.id, runtimeState.lastClaimReservationId);
    if (reservation.schedulerReconcileSnapshotId !== snapshot.id || runtimeState.lastClaimReservationSnapshotId !== snapshot.id) {
      throw new Error("planning.scheduler.worker.validate-first SchedulerRuntimeClaimReservation target is stale.");
    }
    const workerResult = await readSchedulerRuntimeWorkerResult(memory, target.path, run.id, request.schedulerWorkerResultId);
    if (
      workerResult.changeId !== changeId
      || workerResult.schedulerRunId !== run.id
      || workerResult.schedulerRuntimeStateId !== runtimeState.id
      || workerResult.schedulerReconcileSnapshotId !== snapshot.id
      || workerResult.schedulerClaimReservationId !== reservation.id
      || workerResult.status !== "evidence-ready"
    ) {
      throw new Error("planning.scheduler.worker.validate-first WorkerResult target is stale.");
    }
    if (request.schedulerWorkerStartId && request.schedulerWorkerStartId !== workerResult.schedulerWorkerStartId) {
      throw new Error("planning.scheduler.worker.validate-first WorkerStart scope mismatch.");
    }
    if (request.schedulerClaimReservationId && request.schedulerClaimReservationId !== workerResult.schedulerClaimReservationId) {
      throw new Error("planning.scheduler.worker.validate-first SchedulerRuntimeClaimReservation scope mismatch.");
    }
    if (request.reservationIntentId && request.reservationIntentId !== workerResult.reservationIntentId) {
      throw new Error("planning.scheduler.worker.validate-first reservationIntentId scope mismatch.");
    }
    if (request.claimIntentId && request.claimIntentId !== workerResult.claimIntentId) {
      throw new Error("planning.scheduler.worker.validate-first claimIntentId scope mismatch.");
    }
    if (request.taskRunId && request.taskRunId !== workerResult.taskRunId) {
      throw new Error("planning.scheduler.worker.validate-first TaskRun scope mismatch.");
    }
    if (request.workerLeaseId && request.workerLeaseId !== workerResult.workerLeaseId) {
      throw new Error("planning.scheduler.worker.validate-first WorkerLease scope mismatch.");
    }
    if (request.worktreeId && request.worktreeId !== workerResult.worktreeId) {
      throw new Error("planning.scheduler.worker.validate-first worktree scope mismatch.");
    }
    if (request.runId && request.runId !== workerResult.runId) {
      throw new Error("planning.scheduler.worker.validate-first code run scope mismatch.");
    }
    const existingValidation = await findSchedulerRuntimeWorkerValidationForResult(memory, target.path, run.id, workerResult.id);
    if (request.schedulerWorkerValidationId && existingValidation?.id !== request.schedulerWorkerValidationId) {
      throw new Error("planning.scheduler.worker.validate-first WorkerValidation scope mismatch.");
    }
    if (request.validationRunId && existingValidation?.validationRunId !== request.validationRunId) {
      throw new Error("planning.scheduler.worker.validate-first validation run scope mismatch.");
    }
  }
  if (request.actionType === "planning.scheduler.worker.audit-first") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.worker.audit-first", { includeChangeId: false });
    if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.audit-first requires schedulerRunId.");
    if (!request.schedulerWorkerValidationId) throw new Error("planning.scheduler.worker.audit-first requires schedulerWorkerValidationId.");
    const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
    if (run.id !== request.schedulerRunId || run.changeId !== changeId || run.status !== "prepared") {
      throw new Error("planning.scheduler.worker.audit-first SchedulerRun target is stale or not prepared.");
    }
    const latestRun = await readLatestSchedulerRun(memory, target.path);
    if (latestRun.id !== run.id) throw new Error("planning.scheduler.worker.audit-first requires the latest SchedulerRun.");
    await readSchedulerRuntimeLineage(memory, target.path, run.id);
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
    if (!runtimeState?.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId) {
      throw new Error("planning.scheduler.worker.audit-first requires runtime state with latest reconcile snapshot and claim reservation.");
    }
    const snapshot = await readSchedulerReconcileSnapshot(memory, target.path, run.id, runtimeState.lastReconcileSnapshotId);
    const reservation = await readSchedulerRuntimeClaimReservation(memory, target.path, run.id, runtimeState.lastClaimReservationId);
    if (reservation.schedulerReconcileSnapshotId !== snapshot.id || runtimeState.lastClaimReservationSnapshotId !== snapshot.id) {
      throw new Error("planning.scheduler.worker.audit-first SchedulerRuntimeClaimReservation target is stale.");
    }
    const workerValidation = await readSchedulerRuntimeWorkerValidation(memory, target.path, run.id, request.schedulerWorkerValidationId);
    if (
      workerValidation.changeId !== changeId
      || workerValidation.schedulerRunId !== run.id
      || workerValidation.schedulerRuntimeStateId !== runtimeState.id
      || workerValidation.schedulerReconcileSnapshotId !== snapshot.id
      || workerValidation.schedulerClaimReservationId !== reservation.id
      || workerValidation.status !== "passed"
    ) {
      throw new Error("planning.scheduler.worker.audit-first WorkerValidation target is stale.");
    }
    if (request.schedulerWorkerStartId && request.schedulerWorkerStartId !== workerValidation.schedulerWorkerStartId) {
      throw new Error("planning.scheduler.worker.audit-first WorkerStart scope mismatch.");
    }
    if (request.schedulerWorkerResultId && request.schedulerWorkerResultId !== workerValidation.schedulerWorkerResultId) {
      throw new Error("planning.scheduler.worker.audit-first WorkerResult scope mismatch.");
    }
    if (request.schedulerClaimReservationId && request.schedulerClaimReservationId !== workerValidation.schedulerClaimReservationId) {
      throw new Error("planning.scheduler.worker.audit-first SchedulerRuntimeClaimReservation scope mismatch.");
    }
    if (request.reservationIntentId && request.reservationIntentId !== workerValidation.reservationIntentId) {
      throw new Error("planning.scheduler.worker.audit-first reservationIntentId scope mismatch.");
    }
    if (request.claimIntentId && request.claimIntentId !== workerValidation.claimIntentId) {
      throw new Error("planning.scheduler.worker.audit-first claimIntentId scope mismatch.");
    }
    if (request.taskRunId && request.taskRunId !== workerValidation.taskRunId) {
      throw new Error("planning.scheduler.worker.audit-first TaskRun scope mismatch.");
    }
    if (request.workerLeaseId && request.workerLeaseId !== workerValidation.workerLeaseId) {
      throw new Error("planning.scheduler.worker.audit-first WorkerLease scope mismatch.");
    }
    if (request.worktreeId && request.worktreeId !== workerValidation.worktreeId) {
      throw new Error("planning.scheduler.worker.audit-first worktree scope mismatch.");
    }
    if (request.runId && request.runId !== workerValidation.codeRunId) {
      throw new Error("planning.scheduler.worker.audit-first code run scope mismatch.");
    }
    if (request.validationRunId && request.validationRunId !== workerValidation.validationRunId) {
      throw new Error("planning.scheduler.worker.audit-first validation run scope mismatch.");
    }
    const existingAudit = await findSchedulerRuntimeWorkerAuditForValidation(memory, target.path, run.id, workerValidation.id);
    if (request.schedulerWorkerAuditId && existingAudit?.id !== request.schedulerWorkerAuditId) {
      throw new Error("planning.scheduler.worker.audit-first WorkerAudit scope mismatch.");
    }
    if (request.auditRunId && existingAudit?.auditRunId !== request.auditRunId) {
      throw new Error("planning.scheduler.worker.audit-first audit run scope mismatch.");
    }
  }
  if (request.actionType === "planning.scheduler.worker.rework-plan.compile") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.worker.rework-plan.compile", { includeChangeId: false });
    if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.rework-plan.compile requires schedulerRunId.");
    if (!request.schedulerWorkerValidationId) throw new Error("planning.scheduler.worker.rework-plan.compile requires schedulerWorkerValidationId.");
    const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
    if (run.id !== request.schedulerRunId || run.changeId !== changeId || run.status !== "prepared") {
      throw new Error("planning.scheduler.worker.rework-plan.compile SchedulerRun target is stale or not prepared.");
    }
    const latestRun = await readLatestSchedulerRun(memory, target.path);
    if (latestRun.id !== run.id) throw new Error("planning.scheduler.worker.rework-plan.compile requires the latest SchedulerRun.");
    await readSchedulerRuntimeLineage(memory, target.path, run.id);
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
    if (!runtimeState?.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId) {
      throw new Error("planning.scheduler.worker.rework-plan.compile requires runtime state with latest reconcile snapshot and claim reservation.");
    }
    const snapshot = await readSchedulerReconcileSnapshot(memory, target.path, run.id, runtimeState.lastReconcileSnapshotId);
    const reservation = await readSchedulerRuntimeClaimReservation(memory, target.path, run.id, runtimeState.lastClaimReservationId);
    if (reservation.schedulerReconcileSnapshotId !== snapshot.id || runtimeState.lastClaimReservationSnapshotId !== snapshot.id) {
      throw new Error("planning.scheduler.worker.rework-plan.compile SchedulerRuntimeClaimReservation target is stale.");
    }
    const workerValidation = await readSchedulerRuntimeWorkerValidation(memory, target.path, run.id, request.schedulerWorkerValidationId);
    if (
      workerValidation.changeId !== changeId
      || workerValidation.schedulerRunId !== run.id
      || workerValidation.schedulerRuntimeStateId !== runtimeState.id
      || workerValidation.schedulerReconcileSnapshotId !== snapshot.id
      || workerValidation.schedulerClaimReservationId !== reservation.id
    ) {
      throw new Error("planning.scheduler.worker.rework-plan.compile WorkerValidation target is stale.");
    }
    if (request.schedulerWorkerStartId && request.schedulerWorkerStartId !== workerValidation.schedulerWorkerStartId) {
      throw new Error("planning.scheduler.worker.rework-plan.compile WorkerStart scope mismatch.");
    }
    if (request.schedulerWorkerResultId && request.schedulerWorkerResultId !== workerValidation.schedulerWorkerResultId) {
      throw new Error("planning.scheduler.worker.rework-plan.compile WorkerResult scope mismatch.");
    }
    if (request.schedulerClaimReservationId && request.schedulerClaimReservationId !== workerValidation.schedulerClaimReservationId) {
      throw new Error("planning.scheduler.worker.rework-plan.compile SchedulerRuntimeClaimReservation scope mismatch.");
    }
    if (request.reservationIntentId && request.reservationIntentId !== workerValidation.reservationIntentId) {
      throw new Error("planning.scheduler.worker.rework-plan.compile reservationIntentId scope mismatch.");
    }
    if (request.claimIntentId && request.claimIntentId !== workerValidation.claimIntentId) {
      throw new Error("planning.scheduler.worker.rework-plan.compile claimIntentId scope mismatch.");
    }
    if (request.taskRunId && request.taskRunId !== workerValidation.taskRunId) {
      throw new Error("planning.scheduler.worker.rework-plan.compile TaskRun scope mismatch.");
    }
    if (request.workerLeaseId && request.workerLeaseId !== workerValidation.workerLeaseId) {
      throw new Error("planning.scheduler.worker.rework-plan.compile WorkerLease scope mismatch.");
    }
    if (request.worktreeId && request.worktreeId !== workerValidation.worktreeId) {
      throw new Error("planning.scheduler.worker.rework-plan.compile worktree scope mismatch.");
    }
    if (request.runId && request.runId !== workerValidation.codeRunId) {
      throw new Error("planning.scheduler.worker.rework-plan.compile code run scope mismatch.");
    }
    if (request.validationRunId && request.validationRunId !== workerValidation.validationRunId) {
      throw new Error("planning.scheduler.worker.rework-plan.compile validation run scope mismatch.");
    }
    let workerAuditId: string | undefined;
    if (workerValidation.status === "failed") {
      if (request.schedulerWorkerAuditId) throw new Error("planning.scheduler.worker.rework-plan.compile validation failed target must not include WorkerAudit.");
      const existingAudit = await findSchedulerRuntimeWorkerAuditForValidation(memory, target.path, run.id, workerValidation.id);
      if (existingAudit) throw new Error("planning.scheduler.worker.rework-plan.compile validation failed target already has WorkerAudit evidence.");
    } else if (workerValidation.status === "passed") {
      if (!request.schedulerWorkerAuditId) throw new Error("planning.scheduler.worker.rework-plan.compile passed validation requires WorkerAudit.");
      const workerAudit = await readSchedulerRuntimeWorkerAudit(memory, target.path, run.id, request.schedulerWorkerAuditId);
      const existingAudit = await findSchedulerRuntimeWorkerAuditForValidation(memory, target.path, run.id, workerValidation.id);
      if (!existingAudit || existingAudit.id !== workerAudit.id || workerAudit.schedulerWorkerValidationId !== workerValidation.id) {
        throw new Error("planning.scheduler.worker.rework-plan.compile WorkerAudit target is stale.");
      }
      if (workerAudit.status !== "blocked" && workerAudit.status !== "failed") {
        throw new Error("planning.scheduler.worker.rework-plan.compile requires blocked or failed WorkerAudit.");
      }
      if (request.auditRunId && request.auditRunId !== workerAudit.auditRunId) {
        throw new Error("planning.scheduler.worker.rework-plan.compile audit run scope mismatch.");
      }
      workerAuditId = workerAudit.id;
    } else {
      throw new Error("planning.scheduler.worker.rework-plan.compile unsupported WorkerValidation status.");
    }
    const existingPlan = await findSchedulerRuntimeWorkerReworkPlanForBlockingEvidence(memory, target.path, run.id, {
      workerValidationId: workerValidation.id,
      workerAuditId,
    });
    if (request.schedulerWorkerReworkPlanId && existingPlan?.id !== request.schedulerWorkerReworkPlanId) {
      throw new Error("planning.scheduler.worker.rework-plan.compile WorkerReworkPlan scope mismatch.");
    }
  }
  if (request.actionType === "planning.scheduler.worker.rework-start-first") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.worker.rework-start-first", { includeChangeId: false });
    if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.rework-start-first requires schedulerRunId.");
    if (!request.schedulerWorkerReworkPlanId) throw new Error("planning.scheduler.worker.rework-start-first requires schedulerWorkerReworkPlanId.");
    const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
    if (run.id !== request.schedulerRunId || run.changeId !== changeId || run.status !== "prepared") {
      throw new Error("planning.scheduler.worker.rework-start-first SchedulerRun target is stale or not prepared.");
    }
    const latestRun = await readLatestSchedulerRun(memory, target.path);
    if (latestRun.id !== run.id) throw new Error("planning.scheduler.worker.rework-start-first requires the latest SchedulerRun.");
    await readSchedulerRuntimeLineage(memory, target.path, run.id);
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
    if (!runtimeState?.lastClaimReservationId) {
      throw new Error("planning.scheduler.worker.rework-start-first requires runtime state with latest claim reservation.");
    }
    const reworkPlan = await readSchedulerRuntimeWorkerReworkPlan(memory, target.path, run.id, request.schedulerWorkerReworkPlanId);
    if (
      reworkPlan.changeId !== changeId
      || reworkPlan.schedulerRunId !== run.id
      || reworkPlan.schedulerRuntimeStateId !== runtimeState.id
      || reworkPlan.schedulerClaimReservationId !== runtimeState.lastClaimReservationId
      || reworkPlan.futureCodeGateMode !== "scheduler-claim-rework"
    ) {
      throw new Error("planning.scheduler.worker.rework-start-first WorkerReworkPlan target is stale.");
    }
    if (request.schedulerClaimReservationId && request.schedulerClaimReservationId !== reworkPlan.schedulerClaimReservationId) {
      throw new Error("planning.scheduler.worker.rework-start-first SchedulerRuntimeClaimReservation scope mismatch.");
    }
    if (request.schedulerWorkerValidationId && request.schedulerWorkerValidationId !== reworkPlan.schedulerWorkerValidationId) {
      throw new Error("planning.scheduler.worker.rework-start-first WorkerValidation scope mismatch.");
    }
    if (request.schedulerWorkerAuditId && request.schedulerWorkerAuditId !== reworkPlan.schedulerWorkerAuditId) {
      throw new Error("planning.scheduler.worker.rework-start-first WorkerAudit scope mismatch.");
    }
    if (request.reservationIntentId && request.reservationIntentId !== reworkPlan.reservationIntentId) {
      throw new Error("planning.scheduler.worker.rework-start-first reservationIntentId scope mismatch.");
    }
    if (request.claimIntentId && request.claimIntentId !== reworkPlan.claimIntentId) {
      throw new Error("planning.scheduler.worker.rework-start-first claimIntentId scope mismatch.");
    }
    if (request.taskRunId && request.taskRunId !== reworkPlan.taskRunId) {
      throw new Error("planning.scheduler.worker.rework-start-first original TaskRun scope mismatch.");
    }
    if (request.workerLeaseId && request.workerLeaseId !== reworkPlan.workerLeaseId) {
      throw new Error("planning.scheduler.worker.rework-start-first original WorkerLease scope mismatch.");
    }
    if (request.worktreeId && request.worktreeId !== reworkPlan.targetWorktreeId) {
      throw new Error("planning.scheduler.worker.rework-start-first worktree scope mismatch.");
    }
    if (request.runId && request.runId !== reworkPlan.targetCodeRunId) {
      throw new Error("planning.scheduler.worker.rework-start-first original code run scope mismatch.");
    }
    const existingStart = await findSchedulerRuntimeWorkerReworkStartForPlan(memory, target.path, run.id, reworkPlan.id);
    if (existingStart) throw new Error("planning.scheduler.worker.rework-start-first rework plan already started.");
  }
  if (request.actionType === "planning.scheduler.worker.rework-reconcile-result") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.worker.rework-reconcile-result", { includeChangeId: false });
    if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.rework-reconcile-result requires schedulerRunId.");
    if (!request.schedulerWorkerReworkStartId) throw new Error("planning.scheduler.worker.rework-reconcile-result requires schedulerWorkerReworkStartId.");
    const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
    if (run.id !== request.schedulerRunId || run.changeId !== changeId || run.status !== "prepared") {
      throw new Error("planning.scheduler.worker.rework-reconcile-result SchedulerRun target is stale or not prepared.");
    }
    const latestRun = await readLatestSchedulerRun(memory, target.path);
    if (latestRun.id !== run.id) throw new Error("planning.scheduler.worker.rework-reconcile-result requires the latest SchedulerRun.");
    await readSchedulerRuntimeLineage(memory, target.path, run.id);
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
    if (!runtimeState?.lastClaimReservationId) {
      throw new Error("planning.scheduler.worker.rework-reconcile-result requires runtime state with latest claim reservation.");
    }
    const reworkStart = await readSchedulerRuntimeWorkerReworkStart(memory, target.path, run.id, request.schedulerWorkerReworkStartId);
    if (
      reworkStart.changeId !== changeId
      || reworkStart.schedulerRunId !== run.id
      || reworkStart.schedulerRuntimeStateId !== runtimeState.id
      || reworkStart.schedulerClaimReservationId !== runtimeState.lastClaimReservationId
    ) {
      throw new Error("planning.scheduler.worker.rework-reconcile-result ReworkStart target is stale.");
    }
    const reworkPlan = await readSchedulerRuntimeWorkerReworkPlan(memory, target.path, run.id, reworkStart.schedulerWorkerReworkPlanId);
    if (reworkPlan.id !== reworkStart.schedulerWorkerReworkPlanId || reworkPlan.futureCodeGateMode !== "scheduler-claim-rework" || reworkPlan.targetWorktreeId !== reworkStart.worktreeId) {
      throw new Error("planning.scheduler.worker.rework-reconcile-result ReworkPlan target is stale.");
    }
    if (request.schedulerClaimReservationId && request.schedulerClaimReservationId !== reworkStart.schedulerClaimReservationId) {
      throw new Error("planning.scheduler.worker.rework-reconcile-result SchedulerRuntimeClaimReservation scope mismatch.");
    }
    if (request.schedulerWorkerReworkPlanId && request.schedulerWorkerReworkPlanId !== reworkStart.schedulerWorkerReworkPlanId) {
      throw new Error("planning.scheduler.worker.rework-reconcile-result WorkerReworkPlan scope mismatch.");
    }
    if (request.reservationIntentId && request.reservationIntentId !== reworkStart.reservationIntentId) {
      throw new Error("planning.scheduler.worker.rework-reconcile-result reservationIntentId scope mismatch.");
    }
    if (request.claimIntentId && request.claimIntentId !== reworkStart.claimIntentId) {
      throw new Error("planning.scheduler.worker.rework-reconcile-result claimIntentId scope mismatch.");
    }
    if (request.taskRunId && request.taskRunId !== reworkStart.reworkTaskRunId) {
      throw new Error("planning.scheduler.worker.rework-reconcile-result rework TaskRun scope mismatch.");
    }
    if (request.workerLeaseId && request.workerLeaseId !== reworkStart.reworkWorkerLeaseId) {
      throw new Error("planning.scheduler.worker.rework-reconcile-result rework WorkerLease scope mismatch.");
    }
    if (request.worktreeId && request.worktreeId !== reworkStart.worktreeId) {
      throw new Error("planning.scheduler.worker.rework-reconcile-result worktree scope mismatch.");
    }
    if (request.runId && request.runId !== reworkStart.reworkRunId) {
      throw new Error("planning.scheduler.worker.rework-reconcile-result rework code run scope mismatch.");
    }
    if (reworkStart.reworkRunId) {
      const codeRun = await readRun(memory, reworkStart.reworkRunId);
      const gate = codeRun.executionGate;
      if (!gate?.allowed || gate.mode !== "scheduler-claim-rework") {
        throw new Error("planning.scheduler.worker.rework-reconcile-result rework code run did not use scheduler-claim-rework gate.");
      }
      if (gate.schedulerRunId !== run.id || gate.schedulerClaimReservationId !== reworkStart.schedulerClaimReservationId || gate.schedulerWorkerReworkPlanId !== reworkStart.schedulerWorkerReworkPlanId || gate.taskRunId !== reworkStart.reworkTaskRunId) {
        throw new Error("planning.scheduler.worker.rework-reconcile-result rework code gate target is stale.");
      }
    }
    const existingResult = await findSchedulerRuntimeWorkerReworkResultForStart(memory, target.path, run.id, reworkStart.id);
    if (request.schedulerWorkerReworkResultId && existingResult?.id !== request.schedulerWorkerReworkResultId) {
      throw new Error("planning.scheduler.worker.rework-reconcile-result WorkerReworkResult scope mismatch.");
    }
  }
  if (request.actionType === "planning.scheduler.worker.rework-validate-first") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.worker.rework-validate-first", { includeChangeId: false });
    if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.rework-validate-first requires schedulerRunId.");
    if (!request.schedulerWorkerReworkResultId) throw new Error("planning.scheduler.worker.rework-validate-first requires schedulerWorkerReworkResultId.");
    const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
    if (run.id !== request.schedulerRunId || run.changeId !== changeId || run.status !== "prepared") {
      throw new Error("planning.scheduler.worker.rework-validate-first SchedulerRun target is stale or not prepared.");
    }
    const latestRun = await readLatestSchedulerRun(memory, target.path);
    if (latestRun.id !== run.id) throw new Error("planning.scheduler.worker.rework-validate-first requires the latest SchedulerRun.");
    await readSchedulerRuntimeLineage(memory, target.path, run.id);
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
    if (!runtimeState?.lastClaimReservationId) {
      throw new Error("planning.scheduler.worker.rework-validate-first requires runtime state with latest claim reservation.");
    }
    const reworkResult = await readSchedulerRuntimeWorkerReworkResult(memory, target.path, run.id, request.schedulerWorkerReworkResultId);
    if (
      reworkResult.changeId !== changeId
      || reworkResult.schedulerRunId !== run.id
      || reworkResult.schedulerRuntimeStateId !== runtimeState.id
      || reworkResult.schedulerClaimReservationId !== runtimeState.lastClaimReservationId
      || reworkResult.status !== "evidence-ready"
    ) {
      throw new Error("planning.scheduler.worker.rework-validate-first ReworkResult target is stale.");
    }
    const reworkStart = await readSchedulerRuntimeWorkerReworkStart(memory, target.path, run.id, reworkResult.schedulerWorkerReworkStartId);
    if (reworkStart.id !== reworkResult.schedulerWorkerReworkStartId || reworkStart.schedulerWorkerReworkPlanId !== reworkResult.schedulerWorkerReworkPlanId || reworkStart.reworkTaskRunId !== reworkResult.reworkTaskRunId) {
      throw new Error("planning.scheduler.worker.rework-validate-first ReworkStart target is stale.");
    }
    const reworkPlan = await readSchedulerRuntimeWorkerReworkPlan(memory, target.path, run.id, reworkResult.schedulerWorkerReworkPlanId);
    if (reworkPlan.id !== reworkResult.schedulerWorkerReworkPlanId || reworkPlan.futureCodeGateMode !== "scheduler-claim-rework" || reworkPlan.targetWorktreeId !== reworkResult.worktreeId) {
      throw new Error("planning.scheduler.worker.rework-validate-first ReworkPlan target is stale.");
    }
    if (request.schedulerClaimReservationId && request.schedulerClaimReservationId !== reworkResult.schedulerClaimReservationId) {
      throw new Error("planning.scheduler.worker.rework-validate-first SchedulerRuntimeClaimReservation scope mismatch.");
    }
    if (request.schedulerWorkerReworkPlanId && request.schedulerWorkerReworkPlanId !== reworkResult.schedulerWorkerReworkPlanId) {
      throw new Error("planning.scheduler.worker.rework-validate-first WorkerReworkPlan scope mismatch.");
    }
    if (request.schedulerWorkerReworkStartId && request.schedulerWorkerReworkStartId !== reworkResult.schedulerWorkerReworkStartId) {
      throw new Error("planning.scheduler.worker.rework-validate-first WorkerReworkStart scope mismatch.");
    }
    if (request.schedulerWorkerValidationId && request.schedulerWorkerValidationId !== reworkResult.schedulerWorkerValidationId) {
      throw new Error("planning.scheduler.worker.rework-validate-first WorkerValidation scope mismatch.");
    }
    if (request.schedulerWorkerAuditId && request.schedulerWorkerAuditId !== reworkResult.schedulerWorkerAuditId) {
      throw new Error("planning.scheduler.worker.rework-validate-first WorkerAudit scope mismatch.");
    }
    if (request.reservationIntentId && request.reservationIntentId !== reworkResult.reservationIntentId) {
      throw new Error("planning.scheduler.worker.rework-validate-first reservationIntentId scope mismatch.");
    }
    if (request.claimIntentId && request.claimIntentId !== reworkResult.claimIntentId) {
      throw new Error("planning.scheduler.worker.rework-validate-first claimIntentId scope mismatch.");
    }
    if (request.taskRunId && request.taskRunId !== reworkResult.reworkTaskRunId) {
      throw new Error("planning.scheduler.worker.rework-validate-first rework TaskRun scope mismatch.");
    }
    if (request.workerLeaseId && request.workerLeaseId !== reworkResult.reworkWorkerLeaseId) {
      throw new Error("planning.scheduler.worker.rework-validate-first rework WorkerLease scope mismatch.");
    }
    if (request.worktreeId && request.worktreeId !== reworkResult.worktreeId) {
      throw new Error("planning.scheduler.worker.rework-validate-first worktree scope mismatch.");
    }
    if (request.runId && request.runId !== reworkResult.reworkRunId) {
      throw new Error("planning.scheduler.worker.rework-validate-first rework code run scope mismatch.");
    }
    if (reworkResult.reworkRunId) {
      const codeRun = await readRun(memory, reworkResult.reworkRunId);
      const gate = codeRun.executionGate;
      if (!gate?.allowed || gate.mode !== "scheduler-claim-rework") {
        throw new Error("planning.scheduler.worker.rework-validate-first rework code run did not use scheduler-claim-rework gate.");
      }
      if (gate.schedulerRunId !== run.id || gate.schedulerClaimReservationId !== reworkResult.schedulerClaimReservationId || gate.schedulerWorkerReworkPlanId !== reworkResult.schedulerWorkerReworkPlanId || gate.taskRunId !== reworkResult.reworkTaskRunId) {
        throw new Error("planning.scheduler.worker.rework-validate-first rework code gate target is stale.");
      }
    }
    const existingValidation = await findSchedulerRuntimeWorkerReworkValidationForResult(memory, target.path, run.id, reworkResult.id);
    if (request.schedulerWorkerReworkValidationId && existingValidation?.id !== request.schedulerWorkerReworkValidationId) {
      throw new Error("planning.scheduler.worker.rework-validate-first WorkerReworkValidation scope mismatch.");
    }
    if (request.reworkValidationRunId && existingValidation?.validationRunId !== request.reworkValidationRunId) {
      throw new Error("planning.scheduler.worker.rework-validate-first rework validation run scope mismatch.");
    }
  }
  if (request.actionType === "planning.scheduler.worker.rework-audit-first") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.worker.rework-audit-first", { includeChangeId: false });
    if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.rework-audit-first requires schedulerRunId.");
    if (!request.schedulerWorkerReworkValidationId) throw new Error("planning.scheduler.worker.rework-audit-first requires schedulerWorkerReworkValidationId.");
    const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
    if (run.id !== request.schedulerRunId || run.changeId !== changeId || run.status !== "prepared") {
      throw new Error("planning.scheduler.worker.rework-audit-first SchedulerRun target is stale or not prepared.");
    }
    const latestRun = await readLatestSchedulerRun(memory, target.path);
    if (latestRun.id !== run.id) throw new Error("planning.scheduler.worker.rework-audit-first requires the latest SchedulerRun.");
    await readSchedulerRuntimeLineage(memory, target.path, run.id);
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
    if (!runtimeState?.lastClaimReservationId) {
      throw new Error("planning.scheduler.worker.rework-audit-first requires runtime state with latest claim reservation.");
    }
    const reworkValidation = await readSchedulerRuntimeWorkerReworkValidation(memory, target.path, run.id, request.schedulerWorkerReworkValidationId);
    if (
      reworkValidation.changeId !== changeId
      || reworkValidation.schedulerRunId !== run.id
      || reworkValidation.schedulerRuntimeStateId !== runtimeState.id
      || reworkValidation.schedulerClaimReservationId !== runtimeState.lastClaimReservationId
      || reworkValidation.status !== "passed"
    ) {
      throw new Error("planning.scheduler.worker.rework-audit-first ReworkValidation target is stale.");
    }
    const reworkResult = await readSchedulerRuntimeWorkerReworkResult(memory, target.path, run.id, reworkValidation.schedulerWorkerReworkResultId);
    if (reworkResult.id !== reworkValidation.schedulerWorkerReworkResultId || reworkResult.status !== "evidence-ready" || reworkResult.reworkTaskRunId !== reworkValidation.reworkTaskRunId) {
      throw new Error("planning.scheduler.worker.rework-audit-first ReworkResult target is stale.");
    }
    const reworkStart = await readSchedulerRuntimeWorkerReworkStart(memory, target.path, run.id, reworkValidation.schedulerWorkerReworkStartId);
    if (reworkStart.id !== reworkValidation.schedulerWorkerReworkStartId || reworkStart.schedulerWorkerReworkPlanId !== reworkValidation.schedulerWorkerReworkPlanId || reworkStart.reworkTaskRunId !== reworkValidation.reworkTaskRunId) {
      throw new Error("planning.scheduler.worker.rework-audit-first ReworkStart target is stale.");
    }
    const reworkPlan = await readSchedulerRuntimeWorkerReworkPlan(memory, target.path, run.id, reworkValidation.schedulerWorkerReworkPlanId);
    if (reworkPlan.id !== reworkValidation.schedulerWorkerReworkPlanId || reworkPlan.futureCodeGateMode !== "scheduler-claim-rework" || reworkPlan.targetWorktreeId !== reworkValidation.worktreeId) {
      throw new Error("planning.scheduler.worker.rework-audit-first ReworkPlan target is stale.");
    }
    if (request.schedulerClaimReservationId && request.schedulerClaimReservationId !== reworkValidation.schedulerClaimReservationId) {
      throw new Error("planning.scheduler.worker.rework-audit-first SchedulerRuntimeClaimReservation scope mismatch.");
    }
    if (request.schedulerWorkerReworkPlanId && request.schedulerWorkerReworkPlanId !== reworkValidation.schedulerWorkerReworkPlanId) {
      throw new Error("planning.scheduler.worker.rework-audit-first WorkerReworkPlan scope mismatch.");
    }
    if (request.schedulerWorkerReworkStartId && request.schedulerWorkerReworkStartId !== reworkValidation.schedulerWorkerReworkStartId) {
      throw new Error("planning.scheduler.worker.rework-audit-first WorkerReworkStart scope mismatch.");
    }
    if (request.schedulerWorkerReworkResultId && request.schedulerWorkerReworkResultId !== reworkValidation.schedulerWorkerReworkResultId) {
      throw new Error("planning.scheduler.worker.rework-audit-first WorkerReworkResult scope mismatch.");
    }
    if (request.schedulerWorkerValidationId && request.schedulerWorkerValidationId !== reworkValidation.schedulerWorkerValidationId) {
      throw new Error("planning.scheduler.worker.rework-audit-first WorkerValidation scope mismatch.");
    }
    if (request.schedulerWorkerAuditId && request.schedulerWorkerAuditId !== reworkValidation.schedulerWorkerAuditId) {
      throw new Error("planning.scheduler.worker.rework-audit-first WorkerAudit scope mismatch.");
    }
    if (request.reservationIntentId && request.reservationIntentId !== reworkValidation.reservationIntentId) {
      throw new Error("planning.scheduler.worker.rework-audit-first reservationIntentId scope mismatch.");
    }
    if (request.claimIntentId && request.claimIntentId !== reworkValidation.claimIntentId) {
      throw new Error("planning.scheduler.worker.rework-audit-first claimIntentId scope mismatch.");
    }
    if (request.taskRunId && request.taskRunId !== reworkValidation.reworkTaskRunId) {
      throw new Error("planning.scheduler.worker.rework-audit-first rework TaskRun scope mismatch.");
    }
    if (request.workerLeaseId && request.workerLeaseId !== reworkValidation.reworkWorkerLeaseId) {
      throw new Error("planning.scheduler.worker.rework-audit-first rework WorkerLease scope mismatch.");
    }
    if (request.worktreeId && request.worktreeId !== reworkValidation.worktreeId) {
      throw new Error("planning.scheduler.worker.rework-audit-first worktree scope mismatch.");
    }
    if (request.runId && request.runId !== reworkValidation.reworkRunId) {
      throw new Error("planning.scheduler.worker.rework-audit-first rework code run scope mismatch.");
    }
    if (request.reworkValidationRunId && request.reworkValidationRunId !== reworkValidation.validationRunId) {
      throw new Error("planning.scheduler.worker.rework-audit-first rework validation run scope mismatch.");
    }
    const codeRun = await readRun(memory, reworkValidation.reworkRunId);
    const gate = codeRun.executionGate;
    if (!gate?.allowed || gate.mode !== "scheduler-claim-rework") {
      throw new Error("planning.scheduler.worker.rework-audit-first rework code run did not use scheduler-claim-rework gate.");
    }
    if (gate.schedulerRunId !== run.id || gate.schedulerClaimReservationId !== reworkValidation.schedulerClaimReservationId || gate.schedulerWorkerReworkPlanId !== reworkValidation.schedulerWorkerReworkPlanId || gate.taskRunId !== reworkValidation.reworkTaskRunId) {
      throw new Error("planning.scheduler.worker.rework-audit-first rework code gate target is stale.");
    }
    const validationRun = await readRun(memory, reworkValidation.validationRunId);
    if (validationRun.changeId !== changeId || validationRun.runtime !== "validator" || validationRun.worktree?.worktreeId !== reworkValidation.worktreeId) {
      throw new Error("planning.scheduler.worker.rework-audit-first validation run target is stale.");
    }
    const existingAudit = await findSchedulerRuntimeWorkerReworkAuditForValidation(memory, target.path, run.id, reworkValidation.id);
    if (request.schedulerWorkerReworkAuditId && existingAudit?.id !== request.schedulerWorkerReworkAuditId) {
      throw new Error("planning.scheduler.worker.rework-audit-first WorkerReworkAudit scope mismatch.");
    }
    if (request.reworkAuditRunId && existingAudit?.auditRunId !== request.reworkAuditRunId) {
      throw new Error("planning.scheduler.worker.rework-audit-first rework audit run scope mismatch.");
    }
  }
  if (request.actionType === "planning.scheduler.integration-candidate.compile") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.integration-candidate.compile", { includeChangeId: false });
    if (!request.schedulerRunId) throw new Error("planning.scheduler.integration-candidate.compile requires schedulerRunId.");
    const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
    if (run.id !== request.schedulerRunId || run.changeId !== changeId || run.status !== "prepared") {
      throw new Error("planning.scheduler.integration-candidate.compile SchedulerRun target is stale or not prepared.");
    }
    const latestRun = await readLatestSchedulerRun(memory, target.path);
    if (latestRun.id !== run.id) throw new Error("planning.scheduler.integration-candidate.compile requires the latest SchedulerRun.");
    await readSchedulerRuntimeLineage(memory, target.path, run.id);
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
    if (!runtimeState?.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId) {
      throw new Error("planning.scheduler.integration-candidate.compile requires runtime state with latest reconcile snapshot and claim reservation.");
    }
    const snapshot = await readSchedulerReconcileSnapshot(memory, target.path, run.id, runtimeState.lastReconcileSnapshotId);
    const reservation = await readSchedulerRuntimeClaimReservation(memory, target.path, run.id, runtimeState.lastClaimReservationId);
    if (reservation.schedulerReconcileSnapshotId !== snapshot.id || runtimeState.lastClaimReservationSnapshotId !== snapshot.id) {
      throw new Error("planning.scheduler.integration-candidate.compile SchedulerRuntimeClaimReservation target is stale.");
    }
    if (request.schedulerClaimReservationId && request.schedulerClaimReservationId !== reservation.id) {
      throw new Error("planning.scheduler.integration-candidate.compile SchedulerRuntimeClaimReservation scope mismatch.");
    }
    if (request.schedulerReconcileSnapshotId && request.schedulerReconcileSnapshotId !== snapshot.id) {
      throw new Error("planning.scheduler.integration-candidate.compile SchedulerReconcileSnapshot scope mismatch.");
    }
    const latestCandidate = await readLatestSchedulerIntegrationCandidateProjection(memory, target.path, run.id);
    if (request.schedulerIntegrationCandidateId && latestCandidate?.id !== request.schedulerIntegrationCandidateId) {
      throw new Error("planning.scheduler.integration-candidate.compile SchedulerIntegrationCandidate scope mismatch.");
    }
  }
  if (request.actionType === "planning.scheduler.integration-check.run") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.integration-check.run", { includeChangeId: false });
    if (!request.schedulerRunId) throw new Error("planning.scheduler.integration-check.run requires schedulerRunId.");
    if (!request.schedulerIntegrationCandidateId) throw new Error("planning.scheduler.integration-check.run requires schedulerIntegrationCandidateId.");
    const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
    if (run.id !== request.schedulerRunId || run.changeId !== changeId || run.status !== "prepared") {
      throw new Error("planning.scheduler.integration-check.run SchedulerRun target is stale or not prepared.");
    }
    const latestRun = await readLatestSchedulerRun(memory, target.path);
    if (latestRun.id !== run.id) throw new Error("planning.scheduler.integration-check.run requires the latest SchedulerRun.");
    await readSchedulerRuntimeLineage(memory, target.path, run.id);
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
    if (!runtimeState?.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId) {
      throw new Error("planning.scheduler.integration-check.run requires runtime state with latest reconcile snapshot and claim reservation.");
    }
    const snapshot = await readSchedulerReconcileSnapshot(memory, target.path, run.id, runtimeState.lastReconcileSnapshotId);
    const reservation = await readSchedulerRuntimeClaimReservation(memory, target.path, run.id, runtimeState.lastClaimReservationId);
    if (reservation.schedulerReconcileSnapshotId !== snapshot.id || runtimeState.lastClaimReservationSnapshotId !== snapshot.id) {
      throw new Error("planning.scheduler.integration-check.run SchedulerRuntimeClaimReservation target is stale.");
    }
    if (request.schedulerClaimReservationId && request.schedulerClaimReservationId !== reservation.id) {
      throw new Error("planning.scheduler.integration-check.run SchedulerRuntimeClaimReservation scope mismatch.");
    }
    if (request.schedulerReconcileSnapshotId && request.schedulerReconcileSnapshotId !== snapshot.id) {
      throw new Error("planning.scheduler.integration-check.run SchedulerReconcileSnapshot scope mismatch.");
    }
    const latestCandidate = await readLatestSchedulerIntegrationCandidateProjection(memory, target.path, run.id);
    if (!latestCandidate || latestCandidate.id !== request.schedulerIntegrationCandidateId) {
      throw new Error("planning.scheduler.integration-check.run requires the latest SchedulerIntegrationCandidate.");
    }
    if (
      latestCandidate.status !== "ready"
      || latestCandidate.readyCount < 2
      || latestCandidate.schedulerClaimReservationId !== reservation.id
      || latestCandidate.schedulerRuntimeStateId !== runtimeState.id
    ) {
      throw new Error("planning.scheduler.integration-check.run SchedulerIntegrationCandidate is not ready for IntegrationCheck handoff.");
    }
    if (request.worktreeIds?.length && !sameStringArray(request.worktreeIds, latestCandidate.readyWorktreeIds)) {
      throw new Error("planning.scheduler.integration-check.run worktreeIds target scope mismatch.");
    }
  }
  if (request.actionType === "planning.scheduler.integration-outcome.reconcile") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.integration-outcome.reconcile", { includeChangeId: false });
    if (!request.schedulerRunId) throw new Error("planning.scheduler.integration-outcome.reconcile requires schedulerRunId.");
    if (!request.schedulerIntegrationCheckHandoffId) throw new Error("planning.scheduler.integration-outcome.reconcile requires schedulerIntegrationCheckHandoffId.");
    const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
    if (run.id !== request.schedulerRunId || run.changeId !== changeId || run.status !== "prepared") {
      throw new Error("planning.scheduler.integration-outcome.reconcile SchedulerRun target is stale or not prepared.");
    }
    const latestRun = await readLatestSchedulerRun(memory, target.path);
    if (latestRun.id !== run.id) throw new Error("planning.scheduler.integration-outcome.reconcile requires the latest SchedulerRun.");
    await readSchedulerRuntimeLineage(memory, target.path, run.id);
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
    if (!runtimeState?.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId) {
      throw new Error("planning.scheduler.integration-outcome.reconcile requires runtime state with latest reconcile snapshot and claim reservation.");
    }
    const snapshot = await readSchedulerReconcileSnapshot(memory, target.path, run.id, runtimeState.lastReconcileSnapshotId);
    const reservation = await readSchedulerRuntimeClaimReservation(memory, target.path, run.id, runtimeState.lastClaimReservationId);
    if (reservation.schedulerReconcileSnapshotId !== snapshot.id || runtimeState.lastClaimReservationSnapshotId !== snapshot.id) {
      throw new Error("planning.scheduler.integration-outcome.reconcile SchedulerRuntimeClaimReservation target is stale.");
    }
    const latestCandidate = await readLatestSchedulerIntegrationCandidateProjection(memory, target.path, run.id);
    if (!latestCandidate || latestCandidate.schedulerClaimReservationId !== reservation.id) {
      throw new Error("planning.scheduler.integration-outcome.reconcile SchedulerIntegrationCandidate scope mismatch.");
    }
    if (request.schedulerIntegrationCandidateId && request.schedulerIntegrationCandidateId !== latestCandidate.id) {
      throw new Error("planning.scheduler.integration-outcome.reconcile SchedulerIntegrationCandidate target scope mismatch.");
    }
    const latestHandoff = await readLatestSchedulerIntegrationCheckHandoffProjection(memory, target.path, run.id);
    if (!latestHandoff || latestHandoff.id !== request.schedulerIntegrationCheckHandoffId) {
      throw new Error("planning.scheduler.integration-outcome.reconcile requires the latest SchedulerIntegrationCheckHandoff.");
    }
    if (latestHandoff.schedulerIntegrationCandidateId !== latestCandidate.id || latestHandoff.schedulerClaimReservationId !== reservation.id || latestHandoff.schedulerRuntimeStateId !== runtimeState.id) {
      throw new Error("planning.scheduler.integration-outcome.reconcile SchedulerIntegrationCheckHandoff scope mismatch.");
    }
    const check = await readIntegrationCheck(memory, latestHandoff.integrationCheckId);
    if (check.status === "passed") {
      throw new Error("planning.scheduler.integration-outcome.reconcile waits for the existing apply/discard confirmation while IntegrationCheck is passed.");
    }
    if (request.applyCheckId && request.applyCheckId !== latestHandoff.integrationCheckId) {
      throw new Error("planning.scheduler.integration-outcome.reconcile applyCheckId target scope mismatch.");
    }
    if (request.worktreeIds?.length && !sameStringArray(request.worktreeIds, latestHandoff.readyWorktreeIds)) {
      throw new Error("planning.scheduler.integration-outcome.reconcile worktreeIds target scope mismatch.");
    }
  }
  if (request.actionType === "planning.scheduler.run.complete") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.run.complete", { includeChangeId: false });
    if (!request.schedulerRunId) throw new Error("planning.scheduler.run.complete requires schedulerRunId.");
    if (!request.schedulerIntegrationOutcomeId) throw new Error("planning.scheduler.run.complete requires schedulerIntegrationOutcomeId.");
    const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
    if (run.id !== request.schedulerRunId || run.changeId !== changeId) {
      throw new Error("planning.scheduler.run.complete SchedulerRun target is stale.");
    }
    if (run.status !== "prepared" && run.status !== "completed") {
      throw new Error("planning.scheduler.run.complete SchedulerRun target is not completable.");
    }
    const latestRun = await readLatestSchedulerRun(memory, target.path);
    if (latestRun.id !== run.id) throw new Error("planning.scheduler.run.complete requires the latest SchedulerRun.");
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
    if (!runtimeState?.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId) {
      throw new Error("planning.scheduler.run.complete requires runtime state with latest reconcile snapshot and claim reservation.");
    }
    const latestOutcome = await readLatestSchedulerIntegrationOutcomeProjection(memory, target.path, run.id);
    if (!latestOutcome || latestOutcome.id !== request.schedulerIntegrationOutcomeId) {
      throw new Error("planning.scheduler.run.complete requires the latest SchedulerIntegrationOutcome.");
    }
    const outcome = await readSchedulerIntegrationOutcome(memory, target.path, run.id, request.schedulerIntegrationOutcomeId);
    if (
      outcome.schedulerRuntimeStateId !== runtimeState.id
      || outcome.schedulerClaimReservationId !== runtimeState.lastClaimReservationId
      || outcome.schedulerReconcileSnapshotId !== runtimeState.lastClaimReservationSnapshotId
      || outcome.schedulerReconcileSnapshotId !== runtimeState.lastReconcileSnapshotId
    ) {
      throw new Error("planning.scheduler.run.complete SchedulerIntegrationOutcome target is stale.");
    }
    if (request.schedulerReconcileSnapshotId && request.schedulerReconcileSnapshotId !== outcome.schedulerReconcileSnapshotId) {
      throw new Error("planning.scheduler.run.complete schedulerReconcileSnapshotId target scope mismatch.");
    }
    if (request.schedulerClaimReservationId && request.schedulerClaimReservationId !== outcome.schedulerClaimReservationId) {
      throw new Error("planning.scheduler.run.complete schedulerClaimReservationId target scope mismatch.");
    }
    if (request.schedulerIntegrationCandidateId && request.schedulerIntegrationCandidateId !== outcome.schedulerIntegrationCandidateId) {
      throw new Error("planning.scheduler.run.complete SchedulerIntegrationCandidate target scope mismatch.");
    }
    if (request.schedulerIntegrationCheckHandoffId && request.schedulerIntegrationCheckHandoffId !== outcome.schedulerIntegrationCheckHandoffId) {
      throw new Error("planning.scheduler.run.complete SchedulerIntegrationCheckHandoff target scope mismatch.");
    }
    const check = await readIntegrationCheck(memory, outcome.integrationCheckId);
    if (check.status === "passed") {
      throw new Error("planning.scheduler.run.complete cannot complete while IntegrationCheck is waiting for apply/discard.");
    }
    if (check.status !== outcome.integrationCheckStatus) {
      throw new Error("planning.scheduler.run.complete IntegrationCheck status drifted.");
    }
    if (request.applyCheckId && request.applyCheckId !== outcome.integrationCheckId) {
      throw new Error("planning.scheduler.run.complete applyCheckId target scope mismatch.");
    }
    const existingCompletion = await readLatestSchedulerRunCompletionProjection(memory, target.path, run.id);
    if (existingCompletion && existingCompletion.schedulerIntegrationOutcomeId !== outcome.id) {
      throw new Error("planning.scheduler.run.complete latest SchedulerRunCompletion target is stale.");
    }
    if (request.worktreeIds?.length && !sameStringArray(request.worktreeIds, outcome.readyWorktreeIds)) {
      throw new Error("planning.scheduler.run.complete worktreeIds target scope mismatch.");
    }
  }
  if (request.actionType === "planning.scheduler.run.close-blocked") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.scheduler.run.close-blocked", { includeChangeId: false });
    if (!request.schedulerRunId) throw new Error("planning.scheduler.run.close-blocked requires schedulerRunId.");
    if (!request.schedulerClaimReservationId) throw new Error("planning.scheduler.run.close-blocked requires schedulerClaimReservationId.");
    if (!request.schedulerIntegrationCandidateId) throw new Error("planning.scheduler.run.close-blocked requires schedulerIntegrationCandidateId.");
    const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
    if (run.id !== request.schedulerRunId || run.changeId !== changeId || run.status !== "prepared") {
      throw new Error("planning.scheduler.run.close-blocked SchedulerRun target is stale or not prepared.");
    }
    const latestRun = await readLatestSchedulerRun(memory, target.path);
    if (latestRun.id !== run.id) throw new Error("planning.scheduler.run.close-blocked requires the latest SchedulerRun.");
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
    if (!runtimeState?.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId) {
      throw new Error("planning.scheduler.run.close-blocked requires runtime state with latest reconcile snapshot and claim reservation.");
    }
    if (runtimeState.lastClaimReservationId !== request.schedulerClaimReservationId) {
      throw new Error("planning.scheduler.run.close-blocked requires the latest SchedulerRuntimeClaimReservation.");
    }
    const latestCandidate = await readLatestSchedulerIntegrationCandidateProjection(memory, target.path, run.id);
    if (!latestCandidate || latestCandidate.id !== request.schedulerIntegrationCandidateId) {
      throw new Error("planning.scheduler.run.close-blocked requires the latest SchedulerIntegrationCandidate.");
    }
    if (latestCandidate.schedulerRuntimeStateId !== runtimeState.id || latestCandidate.schedulerClaimReservationId !== runtimeState.lastClaimReservationId || latestCandidate.schedulerReconcileSnapshotId !== runtimeState.lastClaimReservationSnapshotId) {
      throw new Error("planning.scheduler.run.close-blocked SchedulerIntegrationCandidate target is stale.");
    }
    if (latestCandidate.readyCount >= 2) {
      throw new Error("planning.scheduler.run.close-blocked is not allowed when IntegrationCheck can run.");
    }
    if (await readLatestSchedulerIntegrationCheckHandoffProjection(memory, target.path, run.id)) {
      throw new Error("planning.scheduler.run.close-blocked is blocked after SchedulerIntegrationCheck handoff exists.");
    }
    if (await readLatestSchedulerIntegrationOutcomeProjection(memory, target.path, run.id)) {
      throw new Error("planning.scheduler.run.close-blocked is blocked after SchedulerIntegrationOutcome exists.");
    }
    if (await readLatestSchedulerRunCompletionProjection(memory, target.path, run.id)) {
      throw new Error("planning.scheduler.run.close-blocked is blocked after SchedulerRunCompletion exists.");
    }
    if (await readLatestSchedulerRunBlockedCloseoutProjection(memory, target.path, run.id)) {
      throw new Error("planning.scheduler.run.close-blocked latest SchedulerRunBlockedCloseout target is stale.");
    }
  }
  if (request.actionType === "planning.workflowgraph.compile") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.workflowgraph.compile");
    if (!request.taskQueueProposalId) throw new Error("planning.workflowgraph.compile requires taskQueueProposalId.");
    if (!request.readinessManifestId) throw new Error("planning.workflowgraph.compile requires readinessManifestId.");
    const proposal = await readLatestTaskQueueProposal(memory, target.path);
    if (proposal.id !== request.taskQueueProposalId || proposal.changeId !== changeId || !["draft", "confirmed"].includes(proposal.status)) {
      throw new Error("planning.workflowgraph.compile target is stale or no longer compilable.");
    }
    const manifest = await readLatestDecompositionReadinessManifest(memory, target.path);
    if (manifest.id !== request.readinessManifestId || manifest.id !== proposal.readinessManifestId || manifest.status !== "ready-for-sequential-taskqueue-proposal") {
      throw new Error("planning.workflowgraph.compile readiness target is stale.");
    }
  }
  if (request.actionType === "planning.taskqueue.confirm-start") {
    const target = await requireActiveChangeTarget(memory, changeId, "planning.taskqueue.confirm-start");
    if (!request.taskQueueProposalId) throw new Error("planning.taskqueue.confirm-start requires taskQueueProposalId.");
    if (!request.workflowGraphPlanId) throw new Error("planning.taskqueue.confirm-start requires workflowGraphPlanId.");
    if (!request.readinessManifestId) throw new Error("planning.taskqueue.confirm-start requires readinessManifestId.");
    if (!request.decompositionPlanId) throw new Error("planning.taskqueue.confirm-start requires decompositionPlanId.");
    const proposal = await readLatestTaskQueueProposal(memory, target.path);
    if (proposal.id !== request.taskQueueProposalId || proposal.changeId !== changeId || proposal.status !== "confirmed" || proposal.decompositionPlanId !== request.decompositionPlanId || proposal.readinessManifestId !== request.readinessManifestId) {
      throw new Error("planning.taskqueue.confirm-start target is stale or no longer startable.");
    }
    const manifest = await readLatestDecompositionReadinessManifest(memory, target.path);
    if (manifest.id !== proposal.readinessManifestId || manifest.status !== "ready-for-sequential-taskqueue-proposal") {
      throw new Error("planning.taskqueue.confirm-start readiness target is stale.");
    }
    const graph = await readLatestWorkflowGraphPlan(memory, target.path);
    if (graph.id !== request.workflowGraphPlanId || graph.taskQueueProposalId !== proposal.id || graph.readinessManifestId !== manifest.id || graph.status !== "compiled") {
      throw new Error("planning.taskqueue.confirm-start graph target is stale.");
    }
  }
  if (request.actionType === "code.run" && request.taskIds?.length) {
    assertKnownTaskIds(await getChangeStatusForChange(memory, changeId), request.taskIds, "code.run");
  }
  if (request.actionType === "task.run.start") {
    assertKnownTaskIds(await getChangeStatusForChange(memory, changeId), [requireSingleTaskId(request.taskIds)], "task.run.start");
  }
  if (request.actionType === "task.run.retry") {
    const taskRunId = requireTaskRunId(request.taskRunId);
    const runs = await listTaskRuns(memory, changeId);
    if (!runs.some((run) => run.id === taskRunId)) throw new Error(`task.run.retry target is stale or not scoped to Change ${changeId}.`);
  }
  if (request.actionType === "landing-queue.merge-next") {
    const snapshot = await latestLandingQueueSnapshot(memory);
    const candidate = snapshot?.candidates.find((item) => item.landingPackageId === request.landingPackageId);
    if (!candidate || !candidate.canMerge || !candidate.changeIds.includes(changeId)) {
      throw new Error("landing-queue.merge-next target is stale or not currently mergeable.");
    }
  }
  if (request.actionType === "pr-draft.create") {
    if (!request.landingPackageId) throw new Error("pr-draft.create requires landingPackageId.");
  }
  if (request.actionType === "task.queue.start") {
    const queues = await listTaskQueues(memory, changeId);
    if (request.queueRunId) {
      const queue = queues.find((item) => item.id === request.queueRunId);
      if (!queue || queue.status !== "paused") throw new Error("task.queue.start target is stale or not paused.");
      if (!workflowActionScopesMatchStrict({ ...queue, queueRunId: queue.id }, request)) throw new Error("task.queue.start target scope is stale or incomplete.");
      if (!queue.workflowRunId) throw new Error("task.queue.start target has no WorkflowRun binding.");
      const workflow = await readWorkflowRun(memory, changeId, queue.workflowRunId);
      if (!workflowActionScopesMatchStrict({ ...workflow, workflowRunId: workflow.id }, request)) throw new Error("task.queue.start WorkflowRun scope is stale or incomplete.");
      return;
    }
    if (!request.taskQueueProposalId) throw new Error("task.queue.start requires queueRunId for resume or taskQueueProposalId from planning.taskqueue.confirm-start.");
  }
}

export function workflowActionTargetId(request: WorkbenchWorkflowActionRequest, changeId: string, result?: unknown): string {
  return buildWorkflowActionTargetId(request, changeId, result);
}

export function workflowActionScopePayload(request: WorkbenchWorkflowActionRequest, changeId: string, result?: unknown): Record<string, unknown> {
  return buildWorkflowActionScopePayload(request, changeId, result);
}

function sameStringArray(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

function readConcreteGateRequestScope(request: WorkbenchWorkflowActionRequest, expectedScope: Record<string, string | string[]>): Record<string, string | string[]> {
  const result: Record<string, string | string[]> = {};
  const values = request as unknown as Record<string, unknown>;
  for (const key of Object.keys(expectedScope)) {
    if (key === "changeId") continue;
    const value = values[key];
    if (typeof value === "string") result[key] = value;
    if (Array.isArray(value) && value.every((item) => typeof item === "string")) result[key] = value;
  }
  return result;
}
