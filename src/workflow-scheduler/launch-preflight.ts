import { mkdir } from "node:fs/promises";
import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";
import { assertWorkflowArtifactScope } from "../workflow-artifacts/guards.js";
import { hashArtifactRefs } from "../workflow-artifacts/hashes.js";
import { unique } from "../workflow-artifacts/utils.js";
import { schedulerLaunchPreflightsDir } from "./paths.js";
import {
  readLatestSchedulerClaimReconcilePlan,
  readLatestSchedulerContract,
  readLatestSchedulerDispatchDryRun,
  readLatestSchedulerWorkerSessionPlan,
  schedulerLaunchPreflightArtifactRefs,
  writeSchedulerLaunchPreflight,
} from "./repository.js";
import type {
  SchedulerClaimReconcilePlan,
  SchedulerContract,
  SchedulerDispatchDryRun,
  SchedulerLaunchPreflight,
  SchedulerLaunchPreflightClaimSummary,
  SchedulerLaunchPreflightSourceLockSummary,
  SchedulerLaunchRequirement,
  SchedulerWorkerSessionPlan,
} from "./types.js";

export async function compileSchedulerLaunchPreflight(
  memory: ResolvedMemory,
  changePath: string,
  claimPlan: SchedulerClaimReconcilePlan,
  workerPlan: SchedulerWorkerSessionPlan,
  dryRun: SchedulerDispatchDryRun,
  contract: SchedulerContract,
): Promise<SchedulerLaunchPreflight> {
  await assertWorkflowArtifactScope(memory, changePath, claimPlan, "SchedulerLaunchPreflight claim/reconcile plan");
  await assertWorkflowArtifactScope(memory, changePath, workerPlan, "SchedulerLaunchPreflight worker plan");
  await assertWorkflowArtifactScope(memory, changePath, dryRun, "SchedulerLaunchPreflight dry-run");
  await assertWorkflowArtifactScope(memory, changePath, contract, "SchedulerLaunchPreflight contract");
  await validateLaunchPreflightInput(memory, changePath, claimPlan, workerPlan, dryRun, contract);

  const now = new Date().toISOString();
  const id = `scheduler-launch-preflight-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${claimPlan.changeId}:${claimPlan.id}:${now}`).slice(0, 8)}`;
  await mkdir(schedulerLaunchPreflightsDir(memory, changePath), { recursive: true });

  const claimSummaries = buildClaimSummaries(claimPlan);
  const sourceLockSummaries = buildSourceLockSummaries(claimPlan);
  const blockedReasons = unique([
    ...claimPlan.claimIntents.flatMap((claim) => claim.blockedReasons),
    ...sourceLockSummaries.flatMap((lock) => lock.blockedReasons),
  ]);
  const runtimeContinuityRequirements = buildRuntimeContinuityRequirements(claimPlan);
  const permissionProfileRequirements = buildPermissionProfileRequirements(claimPlan);
  const status = claimPlan.blockedCount > 0 || blockedReasons.length ? "blocked" : "checked";
  const refs = schedulerLaunchPreflightArtifactRefs(memory, changePath, id);
  const sourceRefs = unique(Object.keys(claimPlan.sourceArtifactHashes));
  const preflight: SchedulerLaunchPreflight = {
    version: "1.0",
    id,
    changeId: claimPlan.changeId,
    status,
    schedulerMode: claimPlan.schedulerMode,
    schedulerContractId: contract.id,
    schedulerDispatchDryRunId: dryRun.id,
    schedulerWorkerPlanId: workerPlan.id,
    schedulerClaimReconcilePlanId: claimPlan.id,
    decompositionPlanId: claimPlan.decompositionPlanId,
    readinessManifestId: claimPlan.readinessManifestId,
    claimSummaries,
    sourceLockSummaries,
    plannedSlotDemand: claimPlan.plannedSlotDemand,
    maxPlannedWaveWidth: claimPlan.maxPlannedWaveWidth,
    blockedCount: claimPlan.blockedCount,
    runtimeContinuityRequirements,
    permissionProfileRequirements,
    toolPolicyGateRequirement: {
      id: "tool-policy-gate",
      status: "required",
      description: "Future parallel executor must re-run ToolPolicyGate at execution time; this preflight does not authorize tools.",
    },
    humanGateRequirement: {
      id: "human-gate",
      status: "required",
      description: "Future parallel executor must require explicit human confirmation before creating runtime records.",
    },
    blockedReasons,
    sourceArtifactHashes: await hashArtifactRefs(memory, sourceRefs),
    artifactRefs: unique([claimPlan.artifact, claimPlan.markdownArtifact, refs.artifact, refs.markdownArtifact, ...sourceRefs].filter((ref): ref is string => Boolean(ref))),
    artifact: refs.artifact,
    markdownArtifact: refs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerLaunchPreflight(memory, changePath, preflight);
  return preflight;
}

async function validateLaunchPreflightInput(
  memory: ResolvedMemory,
  changePath: string,
  claimPlan: SchedulerClaimReconcilePlan,
  workerPlan: SchedulerWorkerSessionPlan,
  dryRun: SchedulerDispatchDryRun,
  contract: SchedulerContract,
): Promise<void> {
  if (claimPlan.status !== "planned") throw new Error("SchedulerLaunchPreflight requires a planned SchedulerClaimReconcilePlan.");
  if (workerPlan.status !== "planned") throw new Error("SchedulerLaunchPreflight requires a planned SchedulerWorkerSessionPlan.");
  if (dryRun.status !== "generated") throw new Error("SchedulerLaunchPreflight requires a generated SchedulerDispatchDryRun.");
  if (contract.status !== "compiled") throw new Error("SchedulerLaunchPreflight requires a compiled SchedulerContract.");
  if (claimPlan.schedulerMode !== "parallel-readiness-v1" || workerPlan.schedulerMode !== "parallel-readiness-v1" || dryRun.schedulerMode !== "parallel-readiness-v1" || contract.schedulerMode !== "parallel-readiness-v1") {
    throw new Error("SchedulerLaunchPreflight requires parallel-readiness-v1 scheduler artifacts.");
  }
  if (claimPlan.changeId !== workerPlan.changeId || claimPlan.changeId !== dryRun.changeId || claimPlan.changeId !== contract.changeId) {
    throw new Error("SchedulerLaunchPreflight changeId mismatch.");
  }
  if (claimPlan.schedulerWorkerPlanId !== workerPlan.id) {
    throw new Error("SchedulerLaunchPreflight claim/reconcile plan does not match SchedulerWorkerSessionPlan.");
  }
  if (claimPlan.schedulerDispatchDryRunId !== dryRun.id || workerPlan.schedulerDispatchDryRunId !== dryRun.id) {
    throw new Error("SchedulerLaunchPreflight dry-run lineage mismatch.");
  }
  if (claimPlan.schedulerContractId !== contract.id || workerPlan.schedulerContractId !== contract.id || dryRun.schedulerContractId !== contract.id) {
    throw new Error("SchedulerLaunchPreflight scheduler contract mismatch.");
  }
  if (claimPlan.decompositionPlanId !== workerPlan.decompositionPlanId || claimPlan.decompositionPlanId !== dryRun.decompositionPlanId || claimPlan.decompositionPlanId !== contract.decompositionPlanId) {
    throw new Error("SchedulerLaunchPreflight decompositionPlanId mismatch.");
  }
  if (claimPlan.readinessManifestId !== workerPlan.readinessManifestId || claimPlan.readinessManifestId !== dryRun.readinessManifestId || claimPlan.readinessManifestId !== contract.readinessManifestId) {
    throw new Error("SchedulerLaunchPreflight readinessManifestId mismatch.");
  }

  const latestClaimPlan = await readLatestSchedulerClaimReconcilePlan(memory, changePath);
  if (latestClaimPlan.id !== claimPlan.id) throw new Error("SchedulerLaunchPreflight requires the latest SchedulerClaimReconcilePlan.");
  const latestWorkerPlan = await readLatestSchedulerWorkerSessionPlan(memory, changePath);
  if (latestWorkerPlan.id !== workerPlan.id) throw new Error("SchedulerLaunchPreflight requires the latest SchedulerWorkerSessionPlan.");
  const latestDryRun = await readLatestSchedulerDispatchDryRun(memory, changePath);
  if (latestDryRun.id !== dryRun.id) throw new Error("SchedulerLaunchPreflight requires the latest SchedulerDispatchDryRun.");
  const latestContract = await readLatestSchedulerContract(memory, changePath);
  if (latestContract.id !== contract.id) throw new Error("SchedulerLaunchPreflight requires the latest SchedulerContract.");

  const expectedHashes = await hashArtifactRefs(memory, Object.keys(claimPlan.sourceArtifactHashes));
  for (const [artifact, hash] of Object.entries(expectedHashes)) {
    if (claimPlan.sourceArtifactHashes[artifact] !== hash) {
      throw new Error(`SchedulerLaunchPreflight source artifact hash mismatch: ${artifact}.`);
    }
  }
}

function buildClaimSummaries(claimPlan: SchedulerClaimReconcilePlan): SchedulerLaunchPreflightClaimSummary[] {
  return claimPlan.claimIntents.map((claim) => ({
    claimIntentId: claim.claimIntentId,
    plannedWorkerKey: claim.plannedWorkerKey,
    nodeId: claim.nodeId,
    unitId: claim.unitId,
    waveIndex: claim.waveIndex,
    status: claim.status,
    plannedSlotDemand: claim.plannedSlotDemand,
    sourceScopes: claim.sourceScopes,
    blockedReasons: claim.blockedReasons,
  }));
}

function buildSourceLockSummaries(claimPlan: SchedulerClaimReconcilePlan): SchedulerLaunchPreflightSourceLockSummary[] {
  const byScope = new Map<string, SchedulerLaunchPreflightSourceLockSummary>();
  for (const claim of claimPlan.claimIntents) {
    for (const intent of claim.sourceLockIntents) {
      const existing = byScope.get(intent.scope) ?? {
        scope: intent.scope,
        waveIndexes: [],
        claimIntentIds: [],
        status: "clear" as const,
        blockedReasons: [],
      };
      existing.waveIndexes = unique([...existing.waveIndexes.map(String), String(intent.waveIndex)]).map(Number).sort((left, right) => left - right);
      existing.claimIntentIds = unique([...existing.claimIntentIds, claim.claimIntentId]);
      if (claim.status === "blocked") {
        existing.status = "blocked";
        existing.blockedReasons = unique([...existing.blockedReasons, ...claim.blockedReasons]);
      }
      byScope.set(intent.scope, existing);
    }
  }
  return [...byScope.values()].sort((left, right) => left.scope.localeCompare(right.scope));
}

function buildRuntimeContinuityRequirements(claimPlan: SchedulerClaimReconcilePlan): SchedulerLaunchRequirement[] {
  const requirements = new Map<string, SchedulerLaunchRequirement>();
  for (const claim of claimPlan.claimIntents) {
    requirements.set(`worker-session:${claim.claimIntentId}`, {
      id: `worker-session:${claim.claimIntentId}`,
      status: claim.status === "blocked" ? "blocked" : "required",
      description: `Future executor must create a scoped WorkerSession for ${claim.claimIntentId} at launch time.`,
    });
    requirements.set(`runtime-workspace:${claim.claimIntentId}`, {
      id: `runtime-workspace:${claim.claimIntentId}`,
      status: claim.status === "blocked" ? "blocked" : "required",
      description: `Future executor must bind a RuntimeWorkspace and EventSource for ${claim.claimIntentId} at launch time.`,
    });
  }
  return [...requirements.values()];
}

function buildPermissionProfileRequirements(claimPlan: SchedulerClaimReconcilePlan): SchedulerLaunchRequirement[] {
  return claimPlan.claimIntents.flatMap((claim) => claim.roleIds.map((roleId) => ({
    id: `permission-profile:${claim.claimIntentId}:${roleId}`,
    status: claim.status === "blocked" ? "blocked" as const : "required" as const,
    description: `Future executor must attach the current WorkerPermissionProfile for ${roleId} before running ${claim.claimIntentId}.`,
  })));
}
