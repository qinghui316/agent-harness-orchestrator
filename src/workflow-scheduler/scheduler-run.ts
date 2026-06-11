import { mkdir } from "node:fs/promises";
import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";
import { assertWorkflowArtifactScope } from "../workflow-artifacts/guards.js";
import { hashArtifactRefs } from "../workflow-artifacts/hashes.js";
import { unique } from "../workflow-artifacts/utils.js";
import { schedulerRunsDir } from "./paths.js";
import {
  appendSchedulerRunJournalEvent,
  readLatestSchedulerClaimReconcilePlan,
  readLatestSchedulerContract,
  readLatestSchedulerDispatchDryRun,
  readLatestSchedulerLaunchPreflight,
  readLatestSchedulerWorkerSessionPlan,
  schedulerRunArtifactRefs,
  writeSchedulerRun,
} from "./repository.js";
import type {
  SchedulerClaimReconcilePlan,
  SchedulerContract,
  SchedulerDispatchDryRun,
  SchedulerLaunchPreflight,
  SchedulerRun,
  SchedulerWorkerSessionPlan,
} from "./types.js";

export async function prepareSchedulerRun(
  memory: ResolvedMemory,
  changePath: string,
  launchPreflight: SchedulerLaunchPreflight,
  claimPlan: SchedulerClaimReconcilePlan,
  workerPlan: SchedulerWorkerSessionPlan,
  dryRun: SchedulerDispatchDryRun,
  contract: SchedulerContract,
): Promise<SchedulerRun> {
  await assertWorkflowArtifactScope(memory, changePath, launchPreflight, "SchedulerRun launch preflight");
  await assertWorkflowArtifactScope(memory, changePath, claimPlan, "SchedulerRun claim/reconcile plan");
  await assertWorkflowArtifactScope(memory, changePath, workerPlan, "SchedulerRun worker plan");
  await assertWorkflowArtifactScope(memory, changePath, dryRun, "SchedulerRun dry-run");
  await assertWorkflowArtifactScope(memory, changePath, contract, "SchedulerRun contract");
  await validateSchedulerRunInput(memory, changePath, launchPreflight, claimPlan, workerPlan, dryRun, contract);

  const now = new Date().toISOString();
  const id = `scheduler-run-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${launchPreflight.changeId}:${launchPreflight.id}:${now}`).slice(0, 8)}`;
  await mkdir(schedulerRunsDir(memory, changePath), { recursive: true });
  const refs = schedulerRunArtifactRefs(memory, changePath, id);
  const sourceRefs = unique(Object.keys(launchPreflight.sourceArtifactHashes));
  const run: SchedulerRun = {
    version: "1.0",
    id,
    changeId: launchPreflight.changeId,
    status: "prepared",
    schedulerMode: launchPreflight.schedulerMode,
    schedulerContractId: contract.id,
    schedulerDispatchDryRunId: dryRun.id,
    schedulerWorkerPlanId: workerPlan.id,
    schedulerClaimReconcilePlanId: claimPlan.id,
    schedulerLaunchPreflightId: launchPreflight.id,
    decompositionPlanId: launchPreflight.decompositionPlanId,
    readinessManifestId: launchPreflight.readinessManifestId,
    claimIntentCount: launchPreflight.claimSummaries.length,
    plannedSlotDemand: launchPreflight.plannedSlotDemand,
    maxPlannedWaveWidth: launchPreflight.maxPlannedWaveWidth,
    blockedCount: launchPreflight.blockedCount,
    humanConfirmed: true,
    futureToolPolicyGateRequired: launchPreflight.toolPolicyGateRequirement.status === "required",
    futureHumanGateRequired: launchPreflight.humanGateRequirement.status === "required",
    sourceArtifactHashes: await hashArtifactRefs(memory, sourceRefs),
    artifactRefs: unique([launchPreflight.artifact, launchPreflight.markdownArtifact, refs.artifact, refs.markdownArtifact, refs.journalArtifact, ...sourceRefs].filter((ref): ref is string => Boolean(ref))),
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    journalArtifact: refs.journalArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerRun(memory, changePath, run);
  await appendSchedulerRunJournalEvent(memory, changePath, run, "scheduler-run.prepared", {
    status: run.status,
    summary: "SchedulerRun journal shell prepared after human confirmation. No scheduler runtime or worker records were created.",
    artifactRefs: [run.artifact, run.markdownArtifact, run.journalArtifact],
    payload: {
      schedulerLaunchPreflightId: run.schedulerLaunchPreflightId,
      futureToolPolicyGateRequired: run.futureToolPolicyGateRequired,
      futureHumanGateRequired: run.futureHumanGateRequired,
    },
  });
  return run;
}

async function validateSchedulerRunInput(
  memory: ResolvedMemory,
  changePath: string,
  launchPreflight: SchedulerLaunchPreflight,
  claimPlan: SchedulerClaimReconcilePlan,
  workerPlan: SchedulerWorkerSessionPlan,
  dryRun: SchedulerDispatchDryRun,
  contract: SchedulerContract,
): Promise<void> {
  if (launchPreflight.status !== "checked") throw new Error("SchedulerRun requires a checked SchedulerLaunchPreflight.");
  if (claimPlan.status !== "planned") throw new Error("SchedulerRun requires a planned SchedulerClaimReconcilePlan.");
  if (workerPlan.status !== "planned") throw new Error("SchedulerRun requires a planned SchedulerWorkerSessionPlan.");
  if (dryRun.status !== "generated") throw new Error("SchedulerRun requires a generated SchedulerDispatchDryRun.");
  if (contract.status !== "compiled") throw new Error("SchedulerRun requires a compiled SchedulerContract.");
  if (launchPreflight.schedulerMode !== "parallel-readiness-v1" || claimPlan.schedulerMode !== "parallel-readiness-v1" || workerPlan.schedulerMode !== "parallel-readiness-v1" || dryRun.schedulerMode !== "parallel-readiness-v1" || contract.schedulerMode !== "parallel-readiness-v1") {
    throw new Error("SchedulerRun requires parallel-readiness-v1 scheduler artifacts.");
  }
  if (launchPreflight.changeId !== claimPlan.changeId || launchPreflight.changeId !== workerPlan.changeId || launchPreflight.changeId !== dryRun.changeId || launchPreflight.changeId !== contract.changeId) {
    throw new Error("SchedulerRun changeId mismatch.");
  }
  if (launchPreflight.schedulerClaimReconcilePlanId !== claimPlan.id || claimPlan.schedulerWorkerPlanId !== workerPlan.id) {
    throw new Error("SchedulerRun claim/reconcile lineage mismatch.");
  }
  if (launchPreflight.schedulerWorkerPlanId !== workerPlan.id || workerPlan.schedulerDispatchDryRunId !== dryRun.id || launchPreflight.schedulerDispatchDryRunId !== dryRun.id) {
    throw new Error("SchedulerRun worker/dry-run lineage mismatch.");
  }
  if (launchPreflight.schedulerContractId !== contract.id || claimPlan.schedulerContractId !== contract.id || workerPlan.schedulerContractId !== contract.id || dryRun.schedulerContractId !== contract.id) {
    throw new Error("SchedulerRun SchedulerContract lineage mismatch.");
  }
  if (launchPreflight.decompositionPlanId !== claimPlan.decompositionPlanId || launchPreflight.decompositionPlanId !== workerPlan.decompositionPlanId || launchPreflight.decompositionPlanId !== dryRun.decompositionPlanId || launchPreflight.decompositionPlanId !== contract.decompositionPlanId) {
    throw new Error("SchedulerRun decompositionPlanId mismatch.");
  }
  if (launchPreflight.readinessManifestId !== claimPlan.readinessManifestId || launchPreflight.readinessManifestId !== workerPlan.readinessManifestId || launchPreflight.readinessManifestId !== dryRun.readinessManifestId || launchPreflight.readinessManifestId !== contract.readinessManifestId) {
    throw new Error("SchedulerRun readinessManifestId mismatch.");
  }

  const latestPreflight = await readLatestSchedulerLaunchPreflight(memory, changePath);
  if (latestPreflight.id !== launchPreflight.id) throw new Error("SchedulerRun requires the latest SchedulerLaunchPreflight.");
  const latestClaimPlan = await readLatestSchedulerClaimReconcilePlan(memory, changePath);
  if (latestClaimPlan.id !== claimPlan.id) throw new Error("SchedulerRun requires the latest SchedulerClaimReconcilePlan.");
  const latestWorkerPlan = await readLatestSchedulerWorkerSessionPlan(memory, changePath);
  if (latestWorkerPlan.id !== workerPlan.id) throw new Error("SchedulerRun requires the latest SchedulerWorkerSessionPlan.");
  const latestDryRun = await readLatestSchedulerDispatchDryRun(memory, changePath);
  if (latestDryRun.id !== dryRun.id) throw new Error("SchedulerRun requires the latest SchedulerDispatchDryRun.");
  const latestContract = await readLatestSchedulerContract(memory, changePath);
  if (latestContract.id !== contract.id) throw new Error("SchedulerRun requires the latest SchedulerContract.");

  const expectedHashes = await hashArtifactRefs(memory, Object.keys(launchPreflight.sourceArtifactHashes));
  for (const [artifact, hash] of Object.entries(expectedHashes)) {
    if (launchPreflight.sourceArtifactHashes[artifact] !== hash) {
      throw new Error(`SchedulerRun source artifact hash mismatch: ${artifact}.`);
    }
  }
}
