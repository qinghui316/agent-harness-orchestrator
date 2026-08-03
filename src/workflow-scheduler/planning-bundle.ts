import { mkdir, writeFile } from "node:fs/promises";
import { posix } from "node:path";
import { workerPermissionProfileForRole } from "../agent-task/tool-policy.js";
import { writeJsonFile } from "../fs/json.js";
import { shortHash } from "../fs/path.js";
import type { ReadySetWorkflowGraphPlan, WorkflowGraphStage } from "../types/index.js";
import { unique } from "../workflow-artifacts/utils.js";
import {
  renderSchedulerClaimReconcilePlanMarkdown,
  renderSchedulerContractMarkdown,
  renderSchedulerDispatchDryRunMarkdown,
  renderSchedulerLaunchPreflightMarkdown,
  renderSchedulerWorkerSessionPlanMarkdown,
} from "./rendering.js";
import type {
  SchedulerClaimReconcilePlan,
  SchedulerContract,
  SchedulerDispatchDryRun,
  SchedulerDryRunNodeVerdict,
  SchedulerLaunchPreflight,
  SchedulerLaunchPreflightClaimSummary,
  SchedulerLaunchPreflightSourceLockSummary,
  SchedulerLaunchRequirement,
  SchedulerWorkerAdapterFamily,
  SchedulerWorkerEventSourceExpectation,
  SchedulerWorkerSessionPlan,
} from "./types.js";

const runtimeContinuityPrerequisites = [
  "WorkerSession scope for every worker run",
  "RuntimeWorkspace boundary for local-worktree or source-root execution",
  "EventSource for replayable worker event streams",
  "AgentEventEnvelope canonical scope for normalized worker events",
  "ToolPolicyGate decision before high-impact tool execution",
  "Validation, audit, integration, and human gates remain authoritative",
];

export interface SchedulerReadySetPlanningBundle {
  contract: SchedulerContract;
  dryRun: SchedulerDispatchDryRun;
  workerPlan: SchedulerWorkerSessionPlan;
  claimReconcilePlan: SchedulerClaimReconcilePlan;
  launchPreflight: SchedulerLaunchPreflight;
}

export function compileSchedulerReadySetPlanningBundle(
  graph: ReadySetWorkflowGraphPlan,
  changeArtifactRoot: string,
  now = new Date().toISOString(),
): SchedulerReadySetPlanningBundle {
  assertReadySetGraph(graph);
  const root = normalizeChangeArtifactRoot(changeArtifactRoot);
  const sourceArtifactHashes = { ...graph.sourceArtifactHashes };
  const contract = buildContract(graph, sourceArtifactHashes, now, artifactRefs(root, "scheduler-contracts", graph.schedulerContractId));
  const dryRun = buildDryRun(graph, contract, sourceArtifactHashes, now, artifactRefs(root, "scheduler-dispatch-dry-runs", graph.schedulerDispatchDryRunId));
  const workerPlan = buildWorkerPlan(graph, dryRun, sourceArtifactHashes, now, artifactRefs(root, "scheduler-worker-session-plans", graph.schedulerWorkerPlanId));
  const claimReconcilePlan = buildClaimReconcilePlan(graph, workerPlan, sourceArtifactHashes, now, artifactRefs(root, "scheduler-claim-reconcile-plans", graph.schedulerClaimReconcilePlanId));
  const preflightId = `scheduler-launch-preflight-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${graph.changeId}:${claimReconcilePlan.id}:${now}`).slice(0, 8)}`;
  const launchPreflight = buildLaunchPreflight(
    claimReconcilePlan,
    workerPlan,
    dryRun,
    contract,
    sourceArtifactHashes,
    now,
    artifactRefs(root, "scheduler-launch-preflights", preflightId),
    preflightId,
  );
  return { contract, dryRun, workerPlan, claimReconcilePlan, launchPreflight };
}

export async function writeSchedulerReadySetPlanningBundleAt(
  evidenceRoot: string,
  bundle: SchedulerReadySetPlanningBundle,
): Promise<void> {
  await Promise.all([
    writePlanningArtifact(evidenceRoot, "scheduler-contracts", "scheduler-contract", bundle.contract, renderSchedulerContractMarkdown(bundle.contract)),
    writePlanningArtifact(evidenceRoot, "scheduler-dispatch-dry-runs", "scheduler-dispatch-dry-run", bundle.dryRun, renderSchedulerDispatchDryRunMarkdown(bundle.dryRun)),
    writePlanningArtifact(evidenceRoot, "scheduler-worker-session-plans", "scheduler-worker-session-plan", bundle.workerPlan, renderSchedulerWorkerSessionPlanMarkdown(bundle.workerPlan)),
    writePlanningArtifact(evidenceRoot, "scheduler-claim-reconcile-plans", "scheduler-claim-reconcile-plan", bundle.claimReconcilePlan, renderSchedulerClaimReconcilePlanMarkdown(bundle.claimReconcilePlan)),
    writePlanningArtifact(evidenceRoot, "scheduler-launch-preflights", "scheduler-launch-preflight", bundle.launchPreflight, renderSchedulerLaunchPreflightMarkdown(bundle.launchPreflight)),
  ]);
}

function buildContract(
  graph: ReadySetWorkflowGraphPlan,
  sourceArtifactHashes: Record<string, string>,
  now: string,
  refs: ArtifactRefs,
): SchedulerContract {
  return {
    version: "1.0",
    id: graph.schedulerContractId,
    changeId: graph.changeId,
    status: "compiled",
    schedulerMode: graph.schedulerMode,
    workflowGraphPlanId: graph.id,
    nodes: graph.nodes.map((node) => ({
      id: node.schedulerNodeId,
      unitId: node.unitId,
      taskIds: node.taskIds,
      acIds: node.acIds,
      title: node.title,
      sourceScopes: node.sourceScopes,
      stages: node.stages,
    })),
    edges: graph.edges
      .filter((edge): edge is typeof edge & { kind: "dependency" | "synthesis" } => edge.kind !== "stage-order")
      .map((edge) => ({ from: edge.from, to: edge.to, kind: edge.kind })),
    waves: graph.waves.map((wave) => ({
      index: wave.index,
      nodeIds: wave.nodeIds.map((id) => graph.nodes.find((node) => node.id === id)!.schedulerNodeId),
    })),
    conflictScopes: repeatedSourceScopes(graph),
    sourceArtifactHashes,
    artifactRefs: unique([...graph.artifactRefs, refs.artifact, refs.markdownArtifact]),
    ...refs,
    createdAt: now,
    updatedAt: now,
  };
}

function buildDryRun(
  graph: ReadySetWorkflowGraphPlan,
  contract: SchedulerContract,
  sourceArtifactHashes: Record<string, string>,
  now: string,
  refs: ArtifactRefs,
): SchedulerDispatchDryRun {
  const nodeVerdicts: SchedulerDryRunNodeVerdict[] = graph.nodes.map((node) => ({
    nodeId: node.schedulerNodeId,
    unitId: node.unitId,
    waveIndex: node.waveIndex,
    status: node.status === "blocked" ? "blocked" : "candidate",
    dependencyNodeIds: graph.edges
      .filter((edge) => edge.kind === "dependency" && edge.to === node.id)
      .map((edge) => graph.nodes.find((candidate) => candidate.id === edge.from)!.schedulerNodeId),
    dependenciesSatisfied: node.blockedReasons.every((reason) => !reason.toLowerCase().includes("depend")),
    sourceScopes: node.sourceScopes,
    stages: node.stages,
    runtimeContinuityPrerequisites,
    blockedReasons: node.blockedReasons,
  }));
  return {
    version: "1.0",
    id: graph.schedulerDispatchDryRunId,
    changeId: graph.changeId,
    status: "generated",
    schedulerMode: graph.schedulerMode,
    schedulerContractId: contract.id,
    workflowGraphPlanId: graph.id,
    nodeVerdicts,
    waveVerdicts: graph.waves.map((wave) => ({
      index: wave.index,
      nodeIds: wave.nodeIds.map((id) => graph.nodes.find((node) => node.id === id)!.schedulerNodeId),
      status: wave.blockedCount > 0 ? "blocked" : "candidate",
      candidateCount: wave.candidateCount,
      blockedCount: wave.blockedCount,
      blockedReasons: wave.blockedReasons,
    })),
    estimatedMaxWaveWidth: graph.maxPlannedWaveWidth,
    dependencyCount: graph.edges.filter((edge) => edge.kind !== "stage-order").length,
    conflictCount: contract.conflictScopes.length,
    conflictScopes: contract.conflictScopes,
    runtimeContinuityPrerequisites,
    blockedReasons: unique(graph.nodes.flatMap((node) => node.blockedReasons)),
    sourceArtifactHashes,
    artifactRefs: unique([...graph.artifactRefs, contract.artifact, contract.markdownArtifact, refs.artifact, refs.markdownArtifact]),
    ...refs,
    createdAt: now,
    updatedAt: now,
  };
}

function buildWorkerPlan(
  graph: ReadySetWorkflowGraphPlan,
  dryRun: SchedulerDispatchDryRun,
  sourceArtifactHashes: Record<string, string>,
  now: string,
  refs: ArtifactRefs,
): SchedulerWorkerSessionPlan {
  const plannedStages = graph.nodes.flatMap((node) => node.stageRefs.map((stageRef) => {
    const adapterFamily = adapterForStage(stageRef.stage);
    return {
      id: stageRef.id,
      nodeId: node.schedulerNodeId,
      unitId: node.unitId,
      waveIndex: node.waveIndex,
      stage: stageRef.stage,
      roleId: stageRef.roleId,
      status: stageRef.status,
      workspaceIntent: { kind: "future-local-worktree" as const, sourceScopes: stageRef.sourceScopes, requiresFreshWorktree: true },
      adapterFamily,
      permissionProfile: workerPermissionProfileForRole(stageRef.roleId),
      eventSourceExpectation: eventSourceExpectation(adapterFamily),
      recoveryKeyInputs: stageRef.recoveryKeyInputs,
      blockedReasons: stageRef.blockedReasons,
    };
  }));
  const plannedNodes = graph.nodes.map((node) => ({
    nodeId: node.schedulerNodeId,
    unitId: node.unitId,
    waveIndex: node.waveIndex,
    status: node.status,
    stageIds: node.stageRefs.map((stage) => stage.id),
    blockedReasons: node.blockedReasons,
  }));
  return {
    version: "1.0",
    id: graph.schedulerWorkerPlanId,
    changeId: graph.changeId,
    status: "planned",
    schedulerMode: graph.schedulerMode,
    schedulerContractId: graph.schedulerContractId,
    schedulerDispatchDryRunId: graph.schedulerDispatchDryRunId,
    workflowGraphPlanId: graph.id,
    plannedNodes,
    plannedStages,
    plannedWorkerCount: plannedStages.filter((stage) => stage.status === "planned").length,
    stageCount: plannedStages.length,
    blockedCount: plannedNodes.filter((node) => node.status === "blocked").length
      + plannedStages.filter((stage) => stage.status === "blocked").length,
    warningCount: unique(plannedStages.flatMap((stage) => stage.blockedReasons)).length,
    recoveryKeyCoverage: graph.recoveryKeyCoverage,
    sourceArtifactHashes,
    artifactRefs: unique([...graph.artifactRefs, dryRun.artifact, dryRun.markdownArtifact, refs.artifact, refs.markdownArtifact]),
    ...refs,
    createdAt: now,
    updatedAt: now,
  };
}

function buildClaimReconcilePlan(
  graph: ReadySetWorkflowGraphPlan,
  workerPlan: SchedulerWorkerSessionPlan,
  sourceArtifactHashes: Record<string, string>,
  now: string,
  refs: ArtifactRefs,
): SchedulerClaimReconcilePlan {
  return {
    version: "1.0",
    id: graph.schedulerClaimReconcilePlanId,
    changeId: graph.changeId,
    status: "planned",
    schedulerMode: graph.schedulerMode,
    schedulerContractId: graph.schedulerContractId,
    schedulerDispatchDryRunId: graph.schedulerDispatchDryRunId,
    schedulerWorkerPlanId: graph.schedulerWorkerPlanId,
    workflowGraphPlanId: graph.id,
    claimIntents: graph.nodes.map((node) => ({
      claimIntentId: node.claimIntentId,
      plannedWorkerKey: node.plannedWorkerKey,
      nodeId: node.schedulerNodeId,
      unitId: node.unitId,
      waveIndex: node.waveIndex,
      stageIds: node.stageRefs.map((stage) => stage.id),
      roleIds: node.roleIds,
      sourceScopes: node.sourceScopes,
      status: node.status,
      plannedSlotDemand: node.plannedSlotDemand,
      sourceLockIntents: node.sourceLocks.map((lock) => ({
        scope: lock.scope,
        nodeId: node.schedulerNodeId,
        unitId: lock.unitId,
        waveIndex: lock.waveIndex,
        stageIds: lock.stageIds,
      })),
      recoveryKeyInputs: node.recoveryKeyInputs,
      blockedReasons: node.blockedReasons,
    })),
    waveCheckpoints: graph.waves.map((wave) => ({
      waveIndex: wave.index,
      claimIntentIds: wave.claimIntentIds,
      candidateCount: wave.candidateCount,
      blockedCount: wave.blockedCount,
      plannedSlotDemand: wave.plannedSlotDemand,
      blockedReasons: wave.blockedReasons,
    })),
    plannedSlotDemand: graph.plannedSlotDemand,
    maxPlannedWaveWidth: graph.maxPlannedWaveWidth,
    blockedCount: graph.nodes.filter((node) => node.status === "blocked").length,
    recoveryKeyCoverage: graph.recoveryKeyCoverage,
    sourceArtifactHashes,
    artifactRefs: unique([...graph.artifactRefs, workerPlan.artifact, workerPlan.markdownArtifact, refs.artifact, refs.markdownArtifact]),
    ...refs,
    createdAt: now,
    updatedAt: now,
  };
}

function buildLaunchPreflight(
  claimPlan: SchedulerClaimReconcilePlan,
  workerPlan: SchedulerWorkerSessionPlan,
  dryRun: SchedulerDispatchDryRun,
  contract: SchedulerContract,
  sourceArtifactHashes: Record<string, string>,
  now: string,
  refs: ArtifactRefs,
  id: string,
): SchedulerLaunchPreflight {
  assertPlanningLineage(claimPlan, workerPlan, dryRun, contract);
  const claimSummaries = buildClaimSummaries(claimPlan);
  const sourceLockSummaries = buildSourceLockSummaries(claimPlan);
  const blockedReasons = unique([
    ...claimPlan.claimIntents.flatMap((claim) => claim.blockedReasons),
    ...sourceLockSummaries.flatMap((lock) => lock.blockedReasons),
  ]);
  return {
    version: "1.0",
    id,
    changeId: claimPlan.changeId,
    status: claimPlan.blockedCount > 0 || blockedReasons.length ? "blocked" : "checked",
    schedulerMode: claimPlan.schedulerMode,
    schedulerContractId: contract.id,
    schedulerDispatchDryRunId: dryRun.id,
    schedulerWorkerPlanId: workerPlan.id,
    schedulerClaimReconcilePlanId: claimPlan.id,
    workflowGraphPlanId: claimPlan.workflowGraphPlanId,
    claimSummaries,
    sourceLockSummaries,
    plannedSlotDemand: claimPlan.plannedSlotDemand,
    maxPlannedWaveWidth: claimPlan.maxPlannedWaveWidth,
    blockedCount: claimPlan.blockedCount,
    runtimeContinuityRequirements: buildRuntimeContinuityRequirements(claimPlan),
    permissionProfileRequirements: buildPermissionProfileRequirements(claimPlan),
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
    sourceArtifactHashes,
    artifactRefs: unique([claimPlan.artifact, claimPlan.markdownArtifact, refs.artifact, refs.markdownArtifact, ...Object.keys(sourceArtifactHashes)]),
    ...refs,
    createdAt: now,
    updatedAt: now,
  };
}

function assertReadySetGraph(graph: ReadySetWorkflowGraphPlan): void {
  if (graph.status !== "compiled" || graph.graphMode !== "ready-set-v1" || graph.authoringContractVersion !== "1.0") {
    throw new Error("Scheduler ready-set planning requires a compiled ready-set-v1 WorkflowGraphPlan.");
  }
  if (!graph.nodes.length || !graph.waves.length) throw new Error("Scheduler ready-set planning requires graph nodes and waves.");
  const nodeIds = new Set(graph.nodes.map((node) => node.id));
  const claimIntentIds = new Set(graph.nodes.map((node) => node.claimIntentId));
  if (nodeIds.size !== graph.nodes.length || claimIntentIds.size !== graph.nodes.length) {
    throw new Error("Scheduler ready-set planning requires unique graph node and claim intent ids.");
  }
}

function assertPlanningLineage(
  claimPlan: SchedulerClaimReconcilePlan,
  workerPlan: SchedulerWorkerSessionPlan,
  dryRun: SchedulerDispatchDryRun,
  contract: SchedulerContract,
): void {
  if (claimPlan.status !== "planned" || workerPlan.status !== "planned" || dryRun.status !== "generated" || contract.status !== "compiled") {
    throw new Error("Scheduler ready-set planning artifact statuses are invalid.");
  }
  if (claimPlan.changeId !== workerPlan.changeId || claimPlan.changeId !== dryRun.changeId || claimPlan.changeId !== contract.changeId
    || claimPlan.schedulerWorkerPlanId !== workerPlan.id
    || claimPlan.schedulerDispatchDryRunId !== dryRun.id
    || workerPlan.schedulerDispatchDryRunId !== dryRun.id
    || claimPlan.schedulerContractId !== contract.id
    || workerPlan.schedulerContractId !== contract.id
    || dryRun.schedulerContractId !== contract.id
    || claimPlan.workflowGraphPlanId !== workerPlan.workflowGraphPlanId
    || claimPlan.workflowGraphPlanId !== dryRun.workflowGraphPlanId
    || claimPlan.workflowGraphPlanId !== contract.workflowGraphPlanId) {
    throw new Error("Scheduler ready-set planning artifact lineage is inconsistent.");
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
  return claimPlan.claimIntents.flatMap((claim) => ([
    {
      id: `worker-session:${claim.claimIntentId}`,
      status: claim.status === "blocked" ? "blocked" as const : "required" as const,
      description: `Future executor must create a scoped WorkerSession for ${claim.claimIntentId} at launch time.`,
    },
    {
      id: `runtime-workspace:${claim.claimIntentId}`,
      status: claim.status === "blocked" ? "blocked" as const : "required" as const,
      description: `Future executor must bind a RuntimeWorkspace and EventSource for ${claim.claimIntentId} at launch time.`,
    },
  ]));
}

function buildPermissionProfileRequirements(claimPlan: SchedulerClaimReconcilePlan): SchedulerLaunchRequirement[] {
  return claimPlan.claimIntents.flatMap((claim) => claim.roleIds.map((roleId) => ({
    id: `permission-profile:${claim.claimIntentId}:${roleId}`,
    status: claim.status === "blocked" ? "blocked" as const : "required" as const,
    description: `Future executor must attach the current WorkerPermissionProfile for ${roleId} before running ${claim.claimIntentId}.`,
  })));
}

function repeatedSourceScopes(graph: ReadySetWorkflowGraphPlan): string[] {
  const counts = new Map<string, number>();
  for (const node of graph.nodes) {
    for (const scope of node.sourceScopes) counts.set(scope, (counts.get(scope) ?? 0) + 1);
  }
  return [...counts].filter(([, count]) => count > 1).map(([scope]) => scope).sort();
}

function adapterForStage(stage: WorkflowGraphStage): SchedulerWorkerAdapterFamily {
  if (stage === "validation") return "validation-command";
  if (stage === "audit") return "provider-readonly";
  return "provider-code";
}

function eventSourceExpectation(adapterFamily: SchedulerWorkerAdapterFamily): SchedulerWorkerEventSourceExpectation {
  if (adapterFamily === "validation-command") {
    return { adapterFamily, expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "validation.command.started", "validation.command.exited", "external-execution.completed"] };
  }
  if (adapterFamily === "provider-readonly") {
    return { adapterFamily, expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "audit.started", "provider.started", "provider.exited", "external-execution.completed"] };
  }
  return { adapterFamily, expectedEventTypes: ["permission.profile.attached", "external-execution.requested", "provider.started", "provider.exited", "external-execution.completed"] };
}

async function writePlanningArtifact<T extends { id: string }>(
  evidenceRoot: string,
  historyDirectory: string,
  latestName: string,
  value: T,
  markdown: string,
): Promise<void> {
  const planningRoot = posixPathToNative(evidenceRoot, "planning");
  const historyRoot = posixPathToNative(planningRoot, historyDirectory);
  await mkdir(historyRoot, { recursive: true });
  await Promise.all([
    writeJsonFile(posixPathToNative(historyRoot, `${value.id}.json`), value),
    writeFile(posixPathToNative(historyRoot, `${value.id}.md`), markdown, "utf8"),
    writeJsonFile(posixPathToNative(planningRoot, `${latestName}.json`), value),
    writeFile(posixPathToNative(planningRoot, `${latestName}.md`), markdown, "utf8"),
  ]);
}

type ArtifactRefs = { artifact: string; markdownArtifact: string };

function artifactRefs(changeRoot: string, directory: string, id: string): ArtifactRefs {
  return {
    artifact: posix.join(changeRoot, "planning", directory, `${id}.json`),
    markdownArtifact: posix.join(changeRoot, "planning", directory, `${id}.md`),
  };
}

function normalizeChangeArtifactRoot(value: string): string {
  const normalized = value.replaceAll("\\", "/").replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error("Scheduler ready-set planning requires a safe Skill-relative Change root.");
  }
  return normalized;
}

function posixPathToNative(root: string, ...parts: string[]): string {
  return [root, ...parts].join("/").replaceAll("/", process.platform === "win32" ? "\\" : "/");
}
