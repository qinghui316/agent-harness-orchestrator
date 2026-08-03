import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { WorkflowGraphPlan } from "../types/index.js";
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
  reason: z.string().nullable(),
  updatedAt: z.string().min(1),
}).strict();

export interface ProjectHarnessPlanningGateEvidence {
  change: ProjectHarnessChangeRecord;
  lane: ProjectHarnessLaneRecord;
  contract: ProjectHarnessContractRecord | null;
  graph: WorkflowGraphPlan;
  authorizationIntent: z.infer<typeof authorizationIntentSchema>;
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
  const [graph, authorizationIntent] = await Promise.all([
    readLatestWorkflowGraphPlanAt(evidenceRoot, input.changeId),
    readFile(join(evidenceRoot, "planning", "execution-authorization-intent.json"), "utf8")
      .then((value) => authorizationIntentSchema.parse(JSON.parse(value))),
  ]);
  if (graph.changeId !== input.changeId
    || graph.status !== "compiled"
    || authorizationIntent.changeId !== input.changeId
    || authorizationIntent.conversationId !== input.conversationId
    || authorizationIntent.graphId !== graph.id) {
    throw new Error("Planning gate graph and authorization intent lineage is stale.");
  }
  return { change, lane, contract, graph, authorizationIntent };
}
