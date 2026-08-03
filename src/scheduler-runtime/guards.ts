import {
  assertSchedulerChangeScope,
  hashSchedulerArtifactRefs,
  type SchedulerArtifactStore,
} from "./artifact-store.js";
import {
  readLatestSchedulerClaimReconcilePlan,
  readLatestSchedulerContract,
  readLatestSchedulerDispatchDryRun,
  readLatestSchedulerLaunchPreflight,
  readLatestSchedulerRun,
  readLatestSchedulerWorkerSessionPlan,
  readSchedulerClaimReconcilePlan,
  readSchedulerContract,
  readSchedulerDispatchDryRun,
  readSchedulerLaunchPreflight,
  readSchedulerRun,
  readSchedulerWorkerSessionPlan,
} from "../workflow-scheduler/repository.js";
import type { SchedulerClaimReconcilePlan, SchedulerContract, SchedulerDispatchDryRun, SchedulerLaunchPreflight, SchedulerRun, SchedulerWorkerSessionPlan } from "../workflow-scheduler/types.js";
import type { SchedulerRuntimeClaimReservation, SchedulerRuntimeState } from "./types.js";

export interface SchedulerRuntimeLineage {
  run: SchedulerRun;
  launchPreflight: SchedulerLaunchPreflight;
  claimPlan: SchedulerClaimReconcilePlan;
  workerPlan: SchedulerWorkerSessionPlan;
  dryRun: SchedulerDispatchDryRun;
  contract: SchedulerContract;
}

export async function readSchedulerRuntimeLineage(memory: SchedulerArtifactStore, changePath: string, schedulerRunId: string): Promise<SchedulerRuntimeLineage> {
  const run = await readSchedulerRun(memory, changePath, schedulerRunId);
  await assertSchedulerRuntimeLineage(memory, changePath, run);
  const launchPreflight = await readSchedulerLaunchPreflight(memory, changePath, run.schedulerLaunchPreflightId);
  const claimPlan = await readSchedulerClaimReconcilePlan(memory, changePath, run.schedulerClaimReconcilePlanId);
  const workerPlan = await readSchedulerWorkerSessionPlan(memory, changePath, run.schedulerWorkerPlanId);
  const dryRun = await readSchedulerDispatchDryRun(memory, changePath, run.schedulerDispatchDryRunId);
  const contract = await readSchedulerContract(memory, changePath, run.schedulerContractId);
  validateSchedulerRuntimeLineage(run, launchPreflight, claimPlan, workerPlan, dryRun, contract);
  return { run, launchPreflight, claimPlan, workerPlan, dryRun, contract };
}

export async function assertSchedulerRuntimeLineage(memory: SchedulerArtifactStore, changePath: string, run: SchedulerRun): Promise<void> {
  await assertSchedulerChangeScope(memory, changePath, run.changeId, `SchedulerRun ${run.id}`);
  if (run.status !== "prepared") throw new Error("Scheduler runtime requires a prepared SchedulerRun.");
  const latestRun = await readLatestSchedulerRun(memory, changePath);
  if (latestRun.id !== run.id) throw new Error("Scheduler runtime requires the latest SchedulerRun.");
  const latestPreflight = await readLatestSchedulerLaunchPreflight(memory, changePath);
  if (latestPreflight.id !== run.schedulerLaunchPreflightId) throw new Error("Scheduler runtime SchedulerLaunchPreflight lineage is stale.");
  const latestClaimPlan = await readLatestSchedulerClaimReconcilePlan(memory, changePath);
  if (latestClaimPlan.id !== run.schedulerClaimReconcilePlanId) throw new Error("Scheduler runtime SchedulerClaimReconcilePlan lineage is stale.");
  const latestWorkerPlan = await readLatestSchedulerWorkerSessionPlan(memory, changePath);
  if (latestWorkerPlan.id !== run.schedulerWorkerPlanId) throw new Error("Scheduler runtime SchedulerWorkerSessionPlan lineage is stale.");
  const latestDryRun = await readLatestSchedulerDispatchDryRun(memory, changePath);
  if (latestDryRun.id !== run.schedulerDispatchDryRunId) throw new Error("Scheduler runtime SchedulerDispatchDryRun lineage is stale.");
  const latestContract = await readLatestSchedulerContract(memory, changePath);
  if (latestContract.id !== run.schedulerContractId) throw new Error("Scheduler runtime SchedulerContract lineage is stale.");
  const expectedHashes = await hashSchedulerArtifactRefs(memory, Object.keys(run.sourceArtifactHashes));
  for (const [artifact, hash] of Object.entries(expectedHashes)) {
    if (run.sourceArtifactHashes[artifact] !== hash) {
      throw new Error(`Scheduler runtime source artifact hash mismatch: ${artifact}.`);
    }
  }
}

export function assertLatestSchedulerRuntimeClaimReservation(
  reservation: Pick<SchedulerRuntimeClaimReservation, "id" | "schedulerReconcileSnapshotId">,
  runtimeState: Pick<SchedulerRuntimeState, "lastClaimReservationId" | "lastClaimReservationSnapshotId">,
  context: string,
): void {
  if (reservation.id !== runtimeState.lastClaimReservationId || reservation.schedulerReconcileSnapshotId !== runtimeState.lastClaimReservationSnapshotId) {
    throw new Error(`${context} requires the latest SchedulerRuntimeClaimReservation.`);
  }
}

export function assertLatestSchedulerRuntimeClaimReservationForSnapshot(
  reservation: Pick<SchedulerRuntimeClaimReservation, "id" | "schedulerReconcileSnapshotId" | "status">,
  runtimeState: Pick<SchedulerRuntimeState, "lastClaimReservationId" | "lastClaimReservationSnapshotId" | "lastReconcileSnapshotId">,
  snapshot: { id: string },
  context: string,
  options: { requiredStatus?: SchedulerRuntimeClaimReservation["status"] } = {},
): void {
  assertLatestSchedulerRuntimeClaimReservation(reservation, runtimeState, context);
  if (runtimeState.lastReconcileSnapshotId !== snapshot.id || runtimeState.lastClaimReservationSnapshotId !== snapshot.id) {
    throw new Error(`${context} requires the latest SchedulerRuntimeClaimReservation.`);
  }
  if (options.requiredStatus && reservation.status !== options.requiredStatus) {
    throw new Error(`${context} SchedulerRuntimeClaimReservation target is stale or not ${options.requiredStatus}.`);
  }
}

function validateSchedulerRuntimeLineage(
  run: SchedulerRun,
  launchPreflight: SchedulerLaunchPreflight,
  claimPlan: SchedulerClaimReconcilePlan,
  workerPlan: SchedulerWorkerSessionPlan,
  dryRun: SchedulerDispatchDryRun,
  contract: SchedulerContract,
): void {
  if (launchPreflight.id !== run.schedulerLaunchPreflightId || launchPreflight.changeId !== run.changeId || launchPreflight.status !== "checked") {
    throw new Error("Scheduler runtime SchedulerLaunchPreflight target is stale.");
  }
  if (claimPlan.id !== run.schedulerClaimReconcilePlanId || claimPlan.id !== launchPreflight.schedulerClaimReconcilePlanId || claimPlan.changeId !== run.changeId || claimPlan.status !== "planned") {
    throw new Error("Scheduler runtime SchedulerClaimReconcilePlan target is stale.");
  }
  if (workerPlan.id !== run.schedulerWorkerPlanId || workerPlan.id !== claimPlan.schedulerWorkerPlanId || workerPlan.id !== launchPreflight.schedulerWorkerPlanId || workerPlan.changeId !== run.changeId || workerPlan.status !== "planned") {
    throw new Error("Scheduler runtime SchedulerWorkerSessionPlan target is stale.");
  }
  if (dryRun.id !== run.schedulerDispatchDryRunId || dryRun.id !== workerPlan.schedulerDispatchDryRunId || dryRun.id !== claimPlan.schedulerDispatchDryRunId || dryRun.id !== launchPreflight.schedulerDispatchDryRunId || dryRun.changeId !== run.changeId || dryRun.status !== "generated") {
    throw new Error("Scheduler runtime SchedulerDispatchDryRun target is stale.");
  }
  if (contract.id !== run.schedulerContractId || contract.id !== dryRun.schedulerContractId || contract.id !== workerPlan.schedulerContractId || contract.id !== claimPlan.schedulerContractId || contract.id !== launchPreflight.schedulerContractId || contract.changeId !== run.changeId || contract.status !== "compiled") {
    throw new Error("Scheduler runtime SchedulerContract target is stale.");
  }
}
