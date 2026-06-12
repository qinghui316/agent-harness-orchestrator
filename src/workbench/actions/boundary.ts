import { existsSync } from "node:fs";
import { join } from "node:path";
import { recordToolEventAuditEntry } from "../../agent-task/boundary-audit.js";
import { evaluateToolPolicy, highImpactActions } from "../../agent-task/tool-policy.js";
import { getChangeStatusForChange } from "../../change/manager.js";
import { getActiveChanges } from "../../ecl/index.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import { readSchedulerRuntimeLineage } from "../../scheduler-runtime/guards.js";
import { findSchedulerClaimReservationForSnapshot, findSchedulerRuntimeWorkerAuditForValidation, findSchedulerRuntimeWorkerResultForStart, findSchedulerRuntimeWorkerStartForReservationIntent, findSchedulerRuntimeWorkerValidationForResult, readSchedulerReconcileSnapshot, readSchedulerRuntimeClaimReservation, readSchedulerRuntimeStateProjection, readSchedulerRuntimeWorkerResult, readSchedulerRuntimeWorkerStart, readSchedulerRuntimeWorkerValidation } from "../../scheduler-runtime/repository.js";
import { latestLandingQueueSnapshot } from "../../landing-queue/manager.js";
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
  if (request.actionType === "planning.confirm-execution") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.confirm-execution target is stale or missing active Change: ${changeId}.`);
    if (!request.planningBundleId) throw new Error("planning.confirm-execution requires planningBundleId.");
    const bundle = await readLatestPlanningBundle(memory, target.path);
    if (bundle.id !== request.planningBundleId || bundle.status !== "draft" || !existsSync(join(memory.memoryRoot, target.path, "planning", "latest-bundle.json"))) {
      throw new Error("planning.confirm-execution target is stale or no longer confirmable.");
    }
  }
  if (request.actionType === "planning.decomposition.confirm") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.decomposition.confirm target is stale or missing active Change: ${changeId}.`);
    if (!request.decompositionPlanId) throw new Error("planning.decomposition.confirm requires decompositionPlanId.");
    const plan = await readLatestDecompositionPlan(memory, target.path);
    if (plan.id !== request.decompositionPlanId || plan.status !== "draft") {
      throw new Error("planning.decomposition.confirm target is stale or no longer confirmable.");
    }
  }
  if (request.actionType === "planning.decomposition.assess-readiness") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.decomposition.assess-readiness target is stale or missing active Change: ${changeId}.`);
    if (!request.decompositionPlanId) throw new Error("planning.decomposition.assess-readiness requires decompositionPlanId.");
    const plan = await readLatestDecompositionPlan(memory, target.path);
    if (plan.id !== request.decompositionPlanId || plan.status !== "confirmed") {
      throw new Error("planning.decomposition.assess-readiness target is stale or no longer assessable.");
    }
  }
  if (request.actionType === "planning.taskqueue.propose") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.taskqueue.propose target is stale or missing active Change: ${changeId}.`);
    if (!request.readinessManifestId) throw new Error("planning.taskqueue.propose requires readinessManifestId.");
    const manifest = await readLatestDecompositionReadinessManifest(memory, target.path);
    if (manifest.id !== request.readinessManifestId || manifest.status !== "ready-for-sequential-taskqueue-proposal" || manifest.nextAllowedAction !== "taskqueue.proposal") {
      throw new Error("planning.taskqueue.propose target is stale or no longer proposal-ready.");
    }
  }
  if (request.actionType === "planning.scheduler.plan.prepare") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.scheduler.plan.prepare target is stale or missing active Change: ${changeId}.`);
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
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.scheduler.contract.compile target is stale or missing active Change: ${changeId}.`);
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
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.scheduler.dispatch.dry-run target is stale or missing active Change: ${changeId}.`);
    if (!request.schedulerContractId) throw new Error("planning.scheduler.dispatch.dry-run requires schedulerContractId.");
    const contract = await readSchedulerContract(memory, target.path, request.schedulerContractId);
    if (contract.id !== request.schedulerContractId || contract.changeId !== changeId || contract.status !== "compiled") {
      throw new Error("planning.scheduler.dispatch.dry-run SchedulerContract target is stale.");
    }
  }
  if (request.actionType === "planning.scheduler.worker-plan.compile") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.scheduler.worker-plan.compile target is stale or missing active Change: ${changeId}.`);
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
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.scheduler.claim-reconcile.compile target is stale or missing active Change: ${changeId}.`);
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
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.scheduler.launch-preflight.check target is stale or missing active Change: ${changeId}.`);
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
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.scheduler.run.prepare target is stale or missing active Change: ${changeId}.`);
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
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`${request.actionType} target is stale or missing active Change: ${changeId}.`);
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
  if (request.actionType === "planning.scheduler.worker.start-first") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error("planning.scheduler.worker.start-first target is stale or missing active Change.");
    if (!request.schedulerRunId) throw new Error("planning.scheduler.worker.start-first requires schedulerRunId.");
    if (!request.schedulerClaimReservationId) throw new Error("planning.scheduler.worker.start-first requires schedulerClaimReservationId.");
    const run = await readSchedulerRun(memory, target.path, request.schedulerRunId);
    if (run.id !== request.schedulerRunId || run.changeId !== changeId || run.status !== "prepared") {
      throw new Error("planning.scheduler.worker.start-first SchedulerRun target is stale or not prepared.");
    }
    const latestRun = await readLatestSchedulerRun(memory, target.path);
    if (latestRun.id !== run.id) throw new Error("planning.scheduler.worker.start-first requires the latest SchedulerRun.");
    await readSchedulerRuntimeLineage(memory, target.path, run.id);
    const runtimeState = await readSchedulerRuntimeStateProjection(memory, target.path, run.id);
    if (!runtimeState?.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId) {
      throw new Error("planning.scheduler.worker.start-first requires runtime state with latest reconcile snapshot and claim reservation.");
    }
    const snapshot = await readSchedulerReconcileSnapshot(memory, target.path, run.id, runtimeState.lastReconcileSnapshotId);
    const reservation = await readSchedulerRuntimeClaimReservation(memory, target.path, run.id, request.schedulerClaimReservationId);
    if (reservation.id !== runtimeState.lastClaimReservationId || reservation.schedulerReconcileSnapshotId !== snapshot.id || runtimeState.lastClaimReservationSnapshotId !== snapshot.id || reservation.status !== "reserved") {
      throw new Error("planning.scheduler.worker.start-first SchedulerRuntimeClaimReservation target is stale or not reserved.");
    }
    const selectedIntent = request.reservationIntentId
      ? reservation.reservationIntents.find((intent) => intent.reservationIntentId === request.reservationIntentId)
      : reservation.reservationIntents.find((intent) => intent.status === "reserved");
    if (!selectedIntent || selectedIntent.status !== "reserved") {
      throw new Error("planning.scheduler.worker.start-first requires a runnable reservation intent.");
    }
    if (request.claimIntentId && selectedIntent.claimIntentId !== request.claimIntentId) {
      throw new Error("planning.scheduler.worker.start-first claimIntentId target is stale.");
    }
    const existing = await findSchedulerRuntimeWorkerStartForReservationIntent(memory, target.path, run.id, selectedIntent.reservationIntentId);
    if (existing) throw new Error("planning.scheduler.worker.start-first reservation intent already started.");
  }
  if (request.actionType === "planning.scheduler.worker.reconcile-result") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error("planning.scheduler.worker.reconcile-result target is stale or missing active Change.");
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
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error("planning.scheduler.worker.validate-first target is stale or missing active Change.");
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
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error("planning.scheduler.worker.audit-first target is stale or missing active Change.");
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
  if (request.actionType === "planning.workflowgraph.compile") {
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.workflowgraph.compile target is stale or missing active Change: ${changeId}.`);
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
    const active = await getActiveChanges(memory);
    const target = active.find((item) => item.name === changeId);
    if (!target) throw new Error(`planning.taskqueue.confirm-start target is stale or missing active Change: ${changeId}.`);
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
