import { join } from "node:path";
import { readRequiredJsonFile } from "../fs/json.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import {
  hashArtifactRefs,
  readWorkflowGraphPlan,
  resolveArtifactRef,
  taskQueueProposalSchema,
  workflowGraphPlanSchema,
} from "../workflow-artifacts/manager.js";
import type { DecompositionReadinessManifest } from "../workflow-artifacts/manager.js";
import { activeChangePath, buildWorkflowRecoveryKey, requiredGraphRef } from "./recovery-key.js";
import { readinessSchema } from "./schemas.js";
import type { ValidatedTaskQueueProposal } from "./types.js";

export async function validateTaskQueueProposalStart(memory: ResolvedMemory, project: ManagedProject, changeId: string, taskQueueProposalId: string, workflowGraphPlanId: string): Promise<ValidatedTaskQueueProposal> {
  const changePath = await activeChangePath(memory, changeId);
  const latestGraph = await readRequiredJsonFile(join(memory.memoryRoot, changePath, "planning", "workflow-graph-plan.json"), workflowGraphPlanSchema);
  if (latestGraph.graphMode !== "sequential-v1" || latestGraph.id !== workflowGraphPlanId) throw new Error("TaskQueue start requires the latest sequential WorkflowGraphPlan.");
  const graph = await readWorkflowGraphPlan(memory, changePath, workflowGraphPlanId);
  if (graph.graphMode !== "sequential-v1" || graph.id !== latestGraph.id || graph.changeId !== changeId || graph.taskQueueProposalId !== taskQueueProposalId || graph.status !== "compiled") {
    throw new Error("TaskQueue start requires a matching compiled WorkflowGraphPlan.");
  }
  const proposalRef = requiredGraphRef(graph, ".taskqueue-proposal.json");
  const readinessRef = requiredGraphRef(graph, ".decomposition-readiness.json");
  const proposal = await readRequiredJsonFile(resolveArtifactRef(memory, proposalRef), taskQueueProposalSchema);
  if (proposal.id !== taskQueueProposalId || proposal.changeId !== changeId || proposal.status !== "confirmed") {
    throw new Error("TaskQueue start requires a confirmed TaskQueueProposal snapshot.");
  }
  const readiness = await readRequiredJsonFile(resolveArtifactRef(memory, readinessRef), readinessSchema) as DecompositionReadinessManifest;
  if (readiness.id !== proposal.readinessManifestId || readiness.changeId !== changeId || readiness.status !== "ready-for-sequential-taskqueue-proposal" || readiness.nextAllowedAction !== "taskqueue.proposal") {
    throw new Error("TaskQueue start readiness target is stale or no longer queue-ready.");
  }
  const expectedSourceHashes = await hashArtifactRefs(memory, Object.keys(graph.sourceArtifactHashes));
  for (const [artifact, hash] of Object.entries(expectedSourceHashes)) {
    if (graph.sourceArtifactHashes[artifact] !== hash) {
      throw new Error(`WorkflowGraphPlan source artifact hash mismatch: ${artifact}.`);
    }
  }
  return {
    proposal,
    readiness,
    graph,
    changePath,
    recoveryKey: await buildWorkflowRecoveryKey(memory, project, changePath, proposal, readiness, graph),
  };
}
