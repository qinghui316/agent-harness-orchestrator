import type { ResolvedMemory } from "../types/index.js";
import { readLatestDecompositionPlan } from "../workflow-artifacts/decomposition-plan.js";
import { readLatestDecompositionReadinessManifest } from "../workflow-artifacts/readiness-manifest.js";
import { compileSchedulerClaimReconcilePlan } from "../workflow-scheduler/claim-reconcile.js";
import { compileSchedulerContract } from "../workflow-scheduler/compiler.js";
import { compileSchedulerDispatchDryRun } from "../workflow-scheduler/dry-run.js";
import { compileSchedulerLaunchPreflight } from "../workflow-scheduler/launch-preflight.js";
import { readSchedulerRun } from "../workflow-scheduler/repository.js";
import { prepareSchedulerRun } from "../workflow-scheduler/scheduler-run.js";
import type {
  SchedulerClaimReconcilePlan,
  SchedulerContract,
  SchedulerDispatchDryRun,
  SchedulerLaunchPreflight,
  SchedulerRun,
  SchedulerWorkerSessionPlan,
} from "../workflow-scheduler/types.js";
import { compileSchedulerWorkerSessionPlan } from "../workflow-scheduler/worker-plan.js";
import { initializeSchedulerRuntime } from "./initialize.js";
import { buildSchedulerLaunchBrief, type SchedulerLaunchBrief } from "./launch-brief.js";
import { reconcileSchedulerRuntime } from "./reconcile.js";
import {
  readSchedulerReconcileSnapshot,
  readSchedulerRuntimeClaimReservation,
  readSchedulerRuntimeState,
} from "./repository.js";
import { reserveSchedulerRuntimeClaims } from "./claim-reservation.js";
import type { SchedulerRuntimeClaimReservation, SchedulerReconcileSnapshot, SchedulerRuntimeState } from "./types.js";

export interface SchedulerPlanPreparationOptions {
  schedulerRunId?: string;
  schedulerReconcileSnapshotId?: string;
  schedulerClaimReservationId?: string;
}

export interface SchedulerPlanPreparationResult {
  status: "prepared" | "blocked";
  mode: "prepared-new-evidence" | "launch-confirmation";
  contract?: SchedulerContract;
  dryRun?: SchedulerDispatchDryRun;
  workerPlan?: SchedulerWorkerSessionPlan;
  claimReconcilePlan?: SchedulerClaimReconcilePlan;
  launchPreflight?: SchedulerLaunchPreflight;
  schedulerRun?: SchedulerRun;
  runtimeState?: SchedulerRuntimeState;
  reconcileSnapshot?: SchedulerReconcileSnapshot;
  claimReservation?: SchedulerRuntimeClaimReservation;
  launchBrief?: SchedulerLaunchBrief;
  blockedSummary?: string;
  executionStarted: false;
}

export async function prepareSchedulerPlanEvidence(
  memory: ResolvedMemory,
  changePath: string,
  options: SchedulerPlanPreparationOptions = {},
): Promise<SchedulerPlanPreparationResult> {
  if (options.schedulerRunId || options.schedulerReconcileSnapshotId || options.schedulerClaimReservationId) {
    return confirmPreparedSchedulerPlan(memory, changePath, options);
  }

  const plan = await readLatestDecompositionPlan(memory, changePath);
  const readiness = await readLatestDecompositionReadinessManifest(memory, changePath);
  if (plan.id !== readiness.decompositionPlanId || plan.changeId !== readiness.changeId) {
    throw new Error("planning.scheduler.plan.prepare requires matching latest DecompositionPlan and readiness.");
  }
  if (plan.status !== "confirmed" || plan.recommendation !== "taskgraph-parallel-candidate") {
    throw new Error("planning.scheduler.plan.prepare requires a confirmed parallel DecompositionPlan.");
  }
  if (readiness.status !== "ready-for-scheduler-contract" || readiness.nextAllowedAction !== "scheduler.contract") {
    throw new Error("planning.scheduler.plan.prepare requires scheduler readiness.");
  }

  const contract = await compileSchedulerContract(memory, changePath, plan, readiness);
  const dryRun = await compileSchedulerDispatchDryRun(memory, changePath, contract);
  const workerPlan = await compileSchedulerWorkerSessionPlan(memory, changePath, dryRun, contract);
  const claimReconcilePlan = await compileSchedulerClaimReconcilePlan(memory, changePath, workerPlan, dryRun, contract);
  const launchPreflight = await compileSchedulerLaunchPreflight(memory, changePath, claimReconcilePlan, workerPlan, dryRun, contract);
  if (launchPreflight.status !== "checked") {
    return {
      status: "blocked",
      mode: "prepared-new-evidence",
      contract,
      dryRun,
      workerPlan,
      claimReconcilePlan,
      launchPreflight,
      blockedSummary: launchPreflight.blockedReasons.length
        ? launchPreflight.blockedReasons.join("; ")
        : "Scheduler launch preflight is blocked.",
      executionStarted: false,
    };
  }

  const schedulerRun = await prepareSchedulerRun(memory, changePath, launchPreflight, claimReconcilePlan, workerPlan, dryRun, contract);
  const runtimeState = await initializeSchedulerRuntime(memory, changePath, schedulerRun.id);
  const reconcileSnapshot = await reconcileSchedulerRuntime(memory, changePath, schedulerRun.id);
  const claimReservation = await reserveSchedulerRuntimeClaims(memory, changePath, schedulerRun.id, reconcileSnapshot.id);
  const launchBrief = buildSchedulerLaunchBrief(schedulerRun, runtimeState, reconcileSnapshot, claimReservation);
  return {
    status: launchBrief.status === "ready" ? "prepared" : "blocked",
    mode: "prepared-new-evidence",
    contract,
    dryRun,
    workerPlan,
    claimReconcilePlan,
    launchPreflight,
    schedulerRun,
    runtimeState,
    reconcileSnapshot,
    claimReservation,
    launchBrief,
    blockedSummary: launchBrief.status === "blocked" ? launchBrief.summary : undefined,
    executionStarted: false,
  };
}

async function confirmPreparedSchedulerPlan(
  memory: ResolvedMemory,
  changePath: string,
  options: SchedulerPlanPreparationOptions,
): Promise<SchedulerPlanPreparationResult> {
  if (!options.schedulerRunId) throw new Error("planning.scheduler.plan.prepare launch confirmation requires schedulerRunId.");
  if (!options.schedulerReconcileSnapshotId) throw new Error("planning.scheduler.plan.prepare launch confirmation requires schedulerReconcileSnapshotId.");
  if (!options.schedulerClaimReservationId) throw new Error("planning.scheduler.plan.prepare launch confirmation requires schedulerClaimReservationId.");
  const schedulerRun = await readSchedulerRun(memory, changePath, options.schedulerRunId);
  const runtimeState = await readSchedulerRuntimeState(memory, changePath, schedulerRun.id);
  const reconcileSnapshot = await readSchedulerReconcileSnapshot(memory, changePath, schedulerRun.id, options.schedulerReconcileSnapshotId);
  const claimReservation = await readSchedulerRuntimeClaimReservation(memory, changePath, schedulerRun.id, options.schedulerClaimReservationId);
  if (runtimeState.lastReconcileSnapshotId !== reconcileSnapshot.id) {
    throw new Error("planning.scheduler.plan.prepare launch confirmation requires the latest SchedulerReconcileSnapshot.");
  }
  if (runtimeState.lastClaimReservationId !== claimReservation.id || runtimeState.lastClaimReservationSnapshotId !== reconcileSnapshot.id) {
    throw new Error("planning.scheduler.plan.prepare launch confirmation requires the latest SchedulerRuntimeClaimReservation.");
  }
  const launchBrief = buildSchedulerLaunchBrief(schedulerRun, runtimeState, reconcileSnapshot, claimReservation);
  return {
    status: launchBrief.status === "ready" ? "prepared" : "blocked",
    mode: "launch-confirmation",
    schedulerRun,
    runtimeState,
    reconcileSnapshot,
    claimReservation,
    launchBrief,
    blockedSummary: launchBrief.status === "blocked" ? launchBrief.summary : undefined,
    executionStarted: false,
  };
}
