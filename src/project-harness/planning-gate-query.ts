import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { z } from "zod";
import type { WorkflowGraphPlan } from "../types/index.js";
import {
  schedulerClaimReconcilePlanSchema,
  schedulerContractSchema,
  schedulerDispatchDryRunSchema,
  schedulerLaunchPreflightSchema,
  schedulerWorkerSessionPlanSchema,
} from "../workflow-scheduler/schemas.js";
import type { SchedulerReadySetPlanningBundle } from "../workflow-scheduler/planning-bundle.js";
import { readLatestWorkflowGraphPlanAt } from "../workflow-artifacts/manager.js";
import {
  loadProjectHarnessChange,
  loadProjectHarnessContract,
  resolveProjectHarnessChangeEvidenceRoot,
  type ProjectHarnessChangeRecord,
  type ProjectHarnessContractRecord,
} from "./change.js";
import {
  projectHarnessConversationLane,
  projectHarnessLaneId,
  readProjectHarnessLane,
  resolveProjectHarnessRegistryContext,
  type ProjectHarnessLaneRecord,
} from "./registry.js";

const authorizationIntentSchema = z.object({
  version: z.literal("1.0"),
  status: z.enum(["pending", "issued", "blocked"]),
  changeId: z.string().min(1),
  conversationId: z.string().min(1),
  proposalId: z.string().min(1),
  proposalHash: z.string().regex(/^[a-f0-9]{64}$/i),
  graphId: z.string().min(1),
  authorizationId: z.string().min(1).nullable(),
  projectHarnessContentFingerprint: z.string().regex(/^[a-f0-9]{64}$/i).nullable(),
  startManifestHash: z.string().regex(/^[a-f0-9]{64}$/i).nullable(),
  reason: z.string().nullable(),
  updatedAt: z.string().min(1),
}).strict();

const mainAcceptanceSchema = z.object({
  version: z.literal("1.0"),
  acceptedBy: z.literal("main-agent"),
  projectId: z.string().min(1),
  changeId: z.string().min(1),
  conversationId: z.string().min(1),
  graphScopeId: z.string().min(1),
  proposalId: z.string().min(1),
  proposalHash: z.string().regex(/^[a-f0-9]{64}$/i),
  contractRequired: z.boolean(),
  contract: z.unknown().nullable(),
  validation: z.array(z.string()),
}).strict();

export interface ProjectHarnessPlanningGateEvidence {
  change: ProjectHarnessChangeRecord;
  lane: ProjectHarnessLaneRecord;
  contract: ProjectHarnessContractRecord | null;
  graph: WorkflowGraphPlan;
  schedulerPlanning: SchedulerReadySetPlanningBundle | null;
  authorizationIntent: z.infer<typeof authorizationIntentSchema>;
  mainAcceptance: z.infer<typeof mainAcceptanceSchema>;
}

export async function readProjectHarnessPlanningGate(input: {
  projectId: string;
  projectRoot: string;
  skillRoot: string;
  conversationId: string;
  graphScopeId: string;
  changeId: string;
}): Promise<ProjectHarnessPlanningGateEvidence> {
  const registry = await resolveProjectHarnessRegistryContext({
    projectId: input.projectId,
    projectRoot: input.projectRoot,
    skillRoot: input.skillRoot,
  });
  const laneContext = {
    ...registry,
    lane: projectHarnessConversationLane(input.conversationId, input.graphScopeId),
  };
  const [change, lane, contract] = await Promise.all([
    loadProjectHarnessChange(input.skillRoot, input.changeId, true),
    readProjectHarnessLane(laneContext),
    loadProjectHarnessContract(input.skillRoot, input.changeId),
  ]);
  const expectedLaneId = projectHarnessLaneId(laneContext);
  if (change.status !== "active"
    || change.lane_id !== expectedLaneId
    || !lane
    || lane.lane_id !== expectedLaneId
    || lane.conversation_id !== input.conversationId
    || lane.graph_scope_id !== input.graphScopeId
    || lane.active_change_id !== input.changeId
    || lane.status !== "active") {
    throw new Error("Planning gate Change and graph-scoped Lane lineage is stale.");
  }
  if (change.contract_required !== Boolean(contract)
    || change.contract_path !== (contract ? `state/registry/contracts/${input.changeId}.json` : null)) {
    throw new Error("Planning gate Registry contract binding is inconsistent.");
  }
  const evidenceRoot = await resolveProjectHarnessChangeEvidenceRoot(input.skillRoot, "active", input.changeId);
  const [graph, authorizationIntent, mainAcceptance] = await Promise.all([
    readLatestWorkflowGraphPlanAt(evidenceRoot, input.changeId),
    readFile(join(evidenceRoot, "planning", "execution-authorization-intent.json"), "utf8")
      .then((value) => authorizationIntentSchema.parse(JSON.parse(value))),
    readFile(join(evidenceRoot, "planning", "main-acceptance.json"), "utf8")
      .then((value) => mainAcceptanceSchema.parse(JSON.parse(value))),
  ]);
  if (graph.changeId !== input.changeId
    || graph.status !== "compiled"
    || authorizationIntent.changeId !== input.changeId
    || authorizationIntent.conversationId !== input.conversationId
    || authorizationIntent.graphId !== graph.id
    || mainAcceptance.projectId !== input.projectId
    || mainAcceptance.changeId !== input.changeId
    || mainAcceptance.conversationId !== input.conversationId
    || mainAcceptance.graphScopeId !== input.graphScopeId
    || mainAcceptance.proposalId !== authorizationIntent.proposalId
    || mainAcceptance.proposalHash !== authorizationIntent.proposalHash
    || mainAcceptance.contractRequired !== Boolean(contract)) {
    throw new Error("Planning gate graph and authorization intent lineage is stale.");
  }
  const schedulerPlanning = graph.graphMode === "ready-set-v1"
    ? await readSchedulerReadySetPlanningBundle(evidenceRoot, graph)
    : null;
  return { change, lane, contract, graph, schedulerPlanning, authorizationIntent, mainAcceptance };
}

export function projectHarnessPlanningStartManifestHash(
  evidence: ProjectHarnessPlanningGateEvidence,
  projectHarnessContentFingerprint: string,
): string {
  return createHash("sha256").update(stableJson({
    projectHarnessContentFingerprint,
    change: evidence.change,
    lane: evidence.lane,
    contract: evidence.contract,
    graph: evidence.graph,
    schedulerPlanning: evidence.schedulerPlanning,
    mainAcceptance: evidence.mainAcceptance,
  }), "utf8").digest("hex");
}

async function readSchedulerReadySetPlanningBundle(
  evidenceRoot: string,
  graph: Extract<WorkflowGraphPlan, { graphMode: "ready-set-v1" }>,
): Promise<SchedulerReadySetPlanningBundle> {
  const planningRoot = join(evidenceRoot, "planning");
  const [contract, dryRun, workerPlan, claimReconcilePlan, launchPreflight] = await Promise.all([
    readFile(join(planningRoot, "scheduler-contract.json"), "utf8").then((value) => schedulerContractSchema.parse(JSON.parse(value))),
    readFile(join(planningRoot, "scheduler-dispatch-dry-run.json"), "utf8").then((value) => schedulerDispatchDryRunSchema.parse(JSON.parse(value))),
    readFile(join(planningRoot, "scheduler-worker-session-plan.json"), "utf8").then((value) => schedulerWorkerSessionPlanSchema.parse(JSON.parse(value))),
    readFile(join(planningRoot, "scheduler-claim-reconcile-plan.json"), "utf8").then((value) => schedulerClaimReconcilePlanSchema.parse(JSON.parse(value))),
    readFile(join(planningRoot, "scheduler-launch-preflight.json"), "utf8").then((value) => schedulerLaunchPreflightSchema.parse(JSON.parse(value))),
  ]);
  if (contract.id !== graph.schedulerContractId
    || contract.workflowGraphPlanId !== graph.id
    || dryRun.id !== graph.schedulerDispatchDryRunId
    || dryRun.schedulerContractId !== contract.id
    || workerPlan.id !== graph.schedulerWorkerPlanId
    || workerPlan.schedulerDispatchDryRunId !== dryRun.id
    || claimReconcilePlan.id !== graph.schedulerClaimReconcilePlanId
    || claimReconcilePlan.schedulerWorkerPlanId !== workerPlan.id
    || launchPreflight.workflowGraphPlanId !== graph.id
    || launchPreflight.schedulerContractId !== contract.id
    || launchPreflight.schedulerDispatchDryRunId !== dryRun.id
    || launchPreflight.schedulerWorkerPlanId !== workerPlan.id
    || launchPreflight.schedulerClaimReconcilePlanId !== claimReconcilePlan.id
    || launchPreflight.status !== "checked") {
    throw new Error("Planning gate Scheduler ready-set lineage is stale or blocked.");
  }
  const artifacts = [contract, dryRun, workerPlan, claimReconcilePlan, launchPreflight];
  for (const artifact of artifacts) {
    if (artifact.changeId !== graph.changeId
      || artifact.workflowGraphPlanId !== graph.id
      || Object.keys(artifact.sourceArtifactHashes).length !== Object.keys(graph.sourceArtifactHashes).length
      || Object.entries(graph.sourceArtifactHashes).some(([ref, hash]) => artifact.sourceArtifactHashes[ref] !== hash)
      || [artifact.artifact, artifact.markdownArtifact, ...artifact.artifactRefs].some(isMachineAbsolutePath)) {
      throw new Error("Planning gate Scheduler ready-set artifacts are stale or contain non-portable paths.");
    }
  }
  return { contract, dryRun, workerPlan, claimReconcilePlan, launchPreflight };
}

function isMachineAbsolutePath(value: string): boolean {
  return isAbsolute(value) || /^[a-zA-Z]:[\\/]/.test(value);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
