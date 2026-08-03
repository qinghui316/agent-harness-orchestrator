import { existsSync } from "node:fs";
import { appendFile, mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { writeJsonFile } from "../fs/json.js";
import { shortHash } from "../fs/path.js";
import type { ProjectRunsPathPort } from "../project-runtime/paths.js";
import type { SkillNativeWorkflowInitialization, SkillNativeWorkflowStartGate } from "../project-runtime/workflow-start.js";
import {
  renderSchedulerReconcileSnapshotMarkdown,
  renderSchedulerRuntimeClaimReservationMarkdown,
  renderSchedulerRuntimeStateMarkdown,
} from "../scheduler-runtime/rendering.js";
import {
  schedulerReconcileSnapshotSchema,
  schedulerRuntimeClaimReservationSchema,
  schedulerRuntimeStateSchema,
} from "../scheduler-runtime/schemas.js";
import { buildSchedulerRuntimeState } from "../scheduler-runtime/initialize.js";
import { buildSchedulerReconcileSnapshot } from "../scheduler-runtime/reconcile.js";
import { buildSchedulerRuntimeClaimReservation } from "../scheduler-runtime/claim-reservation.js";
import type {
  SchedulerReconcileSnapshot,
  SchedulerRuntimeClaimReservation,
  SchedulerRuntimeEvent,
  SchedulerRuntimeState,
} from "../scheduler-runtime/types.js";
import { resolveSchedulerCurrentTransition } from "../workflow-actions/scheduler-current-transition.js";
import { renderSchedulerRunMarkdown } from "../workflow-scheduler/rendering.js";
import { schedulerRunSchema } from "../workflow-scheduler/schemas.js";
import type { SchedulerRun } from "../workflow-scheduler/types.js";
import type { ReadySetWorkflowGraphPlan } from "../types/index.js";

export interface SkillNativeReadySetInitialization {
  schedulerRun: SchedulerRun;
  runtimeState: SchedulerRuntimeState;
  reconcileSnapshot: SchedulerReconcileSnapshot;
  claimReservation: SchedulerRuntimeClaimReservation;
  currentTransition: ReturnType<typeof resolveSchedulerCurrentTransition>;
  executionStarted: false;
}

export async function initializeSkillNativeReadySetWorkflow(
  gate: SkillNativeWorkflowStartGate,
): Promise<SkillNativeWorkflowInitialization<SkillNativeReadySetInitialization>> {
  if (gate.graph.graphMode !== "ready-set-v1" || !gate.evidence.schedulerPlanning) {
    throw new Error("Skill-native ready-set initialization requires accepted Scheduler planning evidence.");
  }
  const graph = gate.graph;
  const now = new Date().toISOString();
  const schedulerRunId = `scheduler-run-${shortHash(`${gate.execution.operationId}:${gate.graph.id}`).slice(0, 16)}`;
  const ownerRoot = schedulerRunsChangeRoot(gate.runs, gate.changeId);
  const finalRoot = schedulerRunRoot(gate.runs, gate.changeId, schedulerRunId);
  const stagingRoot = `${finalRoot}.staging`;
  assertOwnedSchedulerRuntimePath(ownerRoot, finalRoot);
  assertOwnedSchedulerRuntimePath(ownerRoot, stagingRoot);
  if (existsSync(finalRoot) || existsSync(stagingRoot)) {
    throw new Error("Skill-native ready-set execution state already exists for this Change.");
  }
  await mkdir(stagingRoot, { recursive: true });
  try {
    const initialized = buildInitialization(gate, graph, schedulerRunId, now);
    await persistInitialization(stagingRoot, initialized);
    await rename(stagingRoot, finalRoot);
    const rollback = async () => {
      assertOwnedSchedulerRuntimePath(ownerRoot, finalRoot);
      await rm(finalRoot, { recursive: true, force: true });
    };
    return {
      value: initialized,
      evidenceRefs: runtimeEvidenceRefs(initialized),
      rollback,
    };
  } catch (error) {
    await rm(stagingRoot, { recursive: true, force: true });
    await rm(finalRoot, { recursive: true, force: true });
    throw error;
  }
}

export async function listSkillNativeSchedulerRuns(
  runs: ProjectRunsPathPort,
  changeId: string,
): Promise<SchedulerRun[]> {
  const root = schedulerRunsChangeRoot(runs, changeId);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const values: SchedulerRun[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.endsWith(".staging")) continue;
    const value = await readFile(join(root, entry.name, "scheduler-run.json"), "utf8")
      .then((text) => schedulerRunSchema.parse(JSON.parse(text)));
    values.push(value);
  }
  return values.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function readSkillNativeReadySetInitialization(
  runs: ProjectRunsPathPort,
  changeId: string,
  schedulerRunId: string,
  graph: ReadySetWorkflowGraphPlan,
): Promise<SkillNativeReadySetInitialization> {
  const root = schedulerRunRoot(runs, changeId, schedulerRunId);
  const [schedulerRun, runtimeState] = await Promise.all([
    readFile(join(root, "scheduler-run.json"), "utf8").then((value) => schedulerRunSchema.parse(JSON.parse(value))),
    readFile(join(root, "scheduler-runtime-state.json"), "utf8").then((value) => schedulerRuntimeStateSchema.parse(JSON.parse(value))),
  ]);
  if (!runtimeState.lastReconcileSnapshotId || !runtimeState.lastClaimReservationId) {
    throw new Error("Skill-native Scheduler initialization is missing current snapshot or reservation identity.");
  }
  const [reconcileSnapshot, claimReservation] = await Promise.all([
    readFile(
      join(root, "scheduler-reconcile-snapshots", `${runtimeState.lastReconcileSnapshotId}.json`),
      "utf8",
    ).then((value) => schedulerReconcileSnapshotSchema.parse(JSON.parse(value))),
    readFile(
      join(root, "scheduler-runtime-claim-reservations", `${runtimeState.lastClaimReservationId}.json`),
      "utf8",
    ).then((value) => schedulerRuntimeClaimReservationSchema.parse(JSON.parse(value))),
  ]);
  if (schedulerRun.changeId !== changeId
    || schedulerRun.id !== schedulerRunId
    || runtimeState.schedulerRunId !== schedulerRunId
    || reconcileSnapshot.schedulerRunId !== schedulerRunId
    || claimReservation.schedulerRunId !== schedulerRunId
    || graph.changeId !== changeId
    || schedulerRun.workflowGraphPlanId !== graph.id
    || schedulerRun.schedulerContractId !== graph.schedulerContractId
    || schedulerRun.schedulerWorkerPlanId !== graph.schedulerWorkerPlanId
    || schedulerRun.schedulerClaimReconcilePlanId !== graph.schedulerClaimReconcilePlanId
    || !sameHashes(schedulerRun.sourceArtifactHashes, graph.sourceArtifactHashes)) {
    throw new Error("Skill-native Scheduler runtime lineage is inconsistent.");
  }
  return {
    schedulerRun,
    runtimeState,
    reconcileSnapshot,
    claimReservation,
    currentTransition: resolveSchedulerCurrentTransition({
      graph,
      reservation: claimReservation,
      workerPaths: [],
    }),
    executionStarted: false,
  };
}

function sameHashes(left: Record<string, string>, right: Record<string, string>): boolean {
  const entries = Object.entries(left);
  return entries.length === Object.keys(right).length
    && entries.every(([key, value]) => right[key] === value);
}

function buildInitialization(
  gate: SkillNativeWorkflowStartGate,
  graph: Extract<SkillNativeWorkflowStartGate["graph"], { graphMode: "ready-set-v1" }>,
  schedulerRunId: string,
  now: string,
): SkillNativeReadySetInitialization {
  const planning = gate.evidence.schedulerPlanning!;
  const snapshotId = `scheduler-reconcile-${shortHash(`${schedulerRunId}:initial`).slice(0, 16)}`;
  const reservationId = `scheduler-claim-reservation-${shortHash(`${schedulerRunId}:${snapshotId}`).slice(0, 16)}`;
  const runRefs = runtimeRefs(gate.changeId, schedulerRunId, snapshotId, reservationId);
  const schedulerRun: SchedulerRun = {
    version: "1.0",
    id: schedulerRunId,
    changeId: gate.changeId,
    status: "prepared",
    schedulerMode: graph.schedulerMode,
    schedulerContractId: planning.contract.id,
    schedulerDispatchDryRunId: planning.dryRun.id,
    schedulerWorkerPlanId: planning.workerPlan.id,
    schedulerClaimReconcilePlanId: planning.claimReconcilePlan.id,
    schedulerLaunchPreflightId: planning.launchPreflight.id,
    workflowGraphPlanId: graph.id,
    claimIntentCount: planning.launchPreflight.claimSummaries.length,
    plannedSlotDemand: planning.launchPreflight.plannedSlotDemand,
    maxPlannedWaveWidth: planning.launchPreflight.maxPlannedWaveWidth,
    blockedCount: planning.launchPreflight.blockedCount,
    humanConfirmed: true,
    futureToolPolicyGateRequired: true,
    futureHumanGateRequired: true,
    sourceArtifactHashes: { ...graph.sourceArtifactHashes },
    artifactRefs: [planning.launchPreflight.artifact, planning.launchPreflight.markdownArtifact, runRefs.run, runRefs.runMarkdown, runRefs.events],
    artifact: runRefs.run,
    markdownArtifact: runRefs.runMarkdown,
    journalArtifact: runRefs.events,
    createdAt: now,
    updatedAt: now,
  };
  const baseRuntimeState = buildSchedulerRuntimeState(schedulerRun, planning.claimReconcilePlan, {
    artifact: runRefs.state,
    eventsArtifact: runRefs.events,
  }, now);
  const reconcileSnapshot = buildSchedulerReconcileSnapshot(schedulerRun, baseRuntimeState, {
    artifact: runRefs.snapshot,
    markdownArtifact: runRefs.snapshotMarkdown,
  }, snapshotId, now);
  const claimReservation = buildSchedulerRuntimeClaimReservation(
    schedulerRun,
    baseRuntimeState,
    reconcileSnapshot,
    { artifact: runRefs.reservation, markdownArtifact: runRefs.reservationMarkdown },
    reservationId,
    now,
  );
  const runtimeState: SchedulerRuntimeState = {
    ...baseRuntimeState,
    lastReconcileSnapshotId: snapshotId,
    lastClaimReservationId: reservationId,
    lastClaimReservationSnapshotId: snapshotId,
  };
  return {
    schedulerRun,
    runtimeState,
    reconcileSnapshot,
    claimReservation,
    currentTransition: resolveSchedulerCurrentTransition({ graph, reservation: claimReservation, workerPaths: [] }),
    executionStarted: false,
  };
}

async function persistInitialization(root: string, initialized: SkillNativeReadySetInitialization): Promise<void> {
  const events = schedulerEvents(initialized);
  const snapshotsRoot = join(root, "scheduler-reconcile-snapshots");
  const reservationsRoot = join(root, "scheduler-runtime-claim-reservations");
  await Promise.all([mkdir(snapshotsRoot, { recursive: true }), mkdir(reservationsRoot, { recursive: true })]);
  await Promise.all([
    writeJsonFile(join(root, "scheduler-run.json"), initialized.schedulerRun),
    writeFile(join(root, "scheduler-run.md"), renderSchedulerRunMarkdown(initialized.schedulerRun), "utf8"),
    writeJsonFile(join(root, "scheduler-runtime-state.json"), initialized.runtimeState),
    writeFile(join(root, "scheduler-runtime-state.md"), renderSchedulerRuntimeStateMarkdown(initialized.runtimeState), "utf8"),
    writeJsonFile(join(snapshotsRoot, `${initialized.reconcileSnapshot.id}.json`), initialized.reconcileSnapshot),
    writeFile(join(snapshotsRoot, `${initialized.reconcileSnapshot.id}.md`), renderSchedulerReconcileSnapshotMarkdown(initialized.reconcileSnapshot), "utf8"),
    writeJsonFile(join(reservationsRoot, `${initialized.claimReservation.id}.json`), initialized.claimReservation),
    writeFile(join(reservationsRoot, `${initialized.claimReservation.id}.md`), renderSchedulerRuntimeClaimReservationMarkdown(initialized.claimReservation), "utf8"),
  ]);
  await appendFile(join(root, "scheduler-runtime-events.jsonl"), `${events.map((event) => JSON.stringify(event)).join("\n")}\n`, "utf8");
}

function schedulerEvents(initialized: SkillNativeReadySetInitialization): SchedulerRuntimeEvent[] {
  const { schedulerRun: run, runtimeState: state, reconcileSnapshot: snapshot, claimReservation: reservation } = initialized;
  const records: Array<[SchedulerRuntimeEvent["type"], string, string[]]> = [
    [state.status === "blocked" ? "scheduler-runtime.blocked" : "scheduler-runtime.initialized", "Scheduler runtime initialized after the human workflow gate.", [state.artifact]],
    ["scheduler-runtime.reconciled", "Scheduler runtime reconciled accepted ready-set claims.", [snapshot.artifact]],
    [reservation.status === "reserved" ? "scheduler-runtime.claim-reserved" : "scheduler-runtime.claim-blocked", "Scheduler runtime reserved the current ready-set wave.", [reservation.artifact]],
  ];
  return records.map(([type, summary, artifactRefs], index) => ({
    version: "1.0",
    id: `scheduler-runtime-event-${shortHash(`${run.id}:${type}:${index}`).slice(0, 16)}`,
    schedulerRunId: run.id,
    changeId: run.changeId,
    type,
    timestamp: run.createdAt,
    status: state.status,
    summary,
    artifactRefs,
  }));
}

function schedulerRunsChangeRoot(runs: ProjectRunsPathPort, changeId: string): string {
  assertPortableRuntimeSegment(changeId, "Change id");
  const ownerRoot = join(runs.runsRoot, "scheduler-runs");
  const target = join(ownerRoot, changeId);
  assertOwnedSchedulerRuntimePath(ownerRoot, target);
  return target;
}

function schedulerRunRoot(runs: ProjectRunsPathPort, changeId: string, schedulerRunId: string): string {
  assertPortableRuntimeSegment(schedulerRunId, "SchedulerRun id");
  return join(schedulerRunsChangeRoot(runs, changeId), schedulerRunId);
}

function runtimeRefs(
  changeId: string,
  schedulerRunId: string,
  snapshotId: string,
  reservationId: string,
) {
  const root = `runs/scheduler-runs/${changeId}/${schedulerRunId}`;
  return {
    run: `${root}/scheduler-run.json`,
    runMarkdown: `${root}/scheduler-run.md`,
    state: `${root}/scheduler-runtime-state.json`,
    events: `${root}/scheduler-runtime-events.jsonl`,
    snapshot: `${root}/scheduler-reconcile-snapshots/${snapshotId}.json`,
    snapshotMarkdown: `${root}/scheduler-reconcile-snapshots/${snapshotId}.md`,
    reservation: `${root}/scheduler-runtime-claim-reservations/${reservationId}.json`,
    reservationMarkdown: `${root}/scheduler-runtime-claim-reservations/${reservationId}.md`,
  };
}

function runtimeEvidenceRefs(
  initialized: SkillNativeReadySetInitialization,
): string[] {
  return [
    initialized.schedulerRun.artifact,
    initialized.runtimeState.artifact,
    initialized.reconcileSnapshot.artifact,
    initialized.claimReservation.artifact,
    initialized.runtimeState.eventsArtifact,
  ];
}

function assertOwnedSchedulerRuntimePath(ownerRoot: string, target: string): void {
  const scoped = relative(resolve(ownerRoot), resolve(target));
  if (!scoped || scoped.startsWith("..") || isAbsolute(scoped)) {
    throw new Error("Scheduler runtime path escaped its Change-owned sidecar root.");
  }
}

function assertPortableRuntimeSegment(value: string, label: string): void {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) {
    throw new Error(`${label} is not a portable Scheduler runtime path segment.`);
  }
}
