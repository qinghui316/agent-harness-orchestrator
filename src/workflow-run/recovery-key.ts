import { join } from "node:path";
import { getActiveChanges } from "../ecl/index.js";
import { readRequiredJsonFile } from "../fs/json.js";
import { getGitCommit, getGitStatusShort } from "../project/git.js";
import type { ManagedProject, ResolvedMemory, WorkflowGraphPlan, WorkflowRecoveryKey, WorkflowRun } from "../types/index.js";
import {
  hashFile,
  hashText,
  readWorkflowGraphPlan,
  resolveArtifactRef,
  taskQueueProposalSchema,
} from "../workflow-artifacts/manager.js";
import type { DecompositionReadinessManifest, TaskQueueProposal } from "../workflow-artifacts/manager.js";
import { readinessSchema } from "./schemas.js";

export async function buildWorkflowRecoveryKey(memory: ResolvedMemory, project: ManagedProject, changePath: string, proposal: TaskQueueProposal, _readiness: DecompositionReadinessManifest, graph: WorkflowGraphPlan): Promise<WorkflowRecoveryKey> {
  const acceptedArtifactHashes: Record<string, string> = {};
  for (const name of ["spec.md", "plan.md", "tasks.md", "ac-map.json"]) {
    acceptedArtifactHashes[name] = await hashFile(join(memory.memoryRoot, changePath, name));
  }
  const proposalRef = requiredGraphRef(graph, ".taskqueue-proposal.json");
  const readinessRef = requiredGraphRef(graph, ".decomposition-readiness.json");
  return {
    version: "1.0",
    changeId: proposal.changeId,
    decompositionPlanId: proposal.decompositionPlanId,
    readinessManifestId: proposal.readinessManifestId,
    taskQueueProposalId: proposal.id,
    workflowGraphPlanId: graph.id,
    acceptedArtifactHashes,
    proposalHash: await hashFile(resolveArtifactRef(memory, proposalRef)),
    readinessHash: await hashFile(resolveArtifactRef(memory, readinessRef)),
    workflowGraphPlanHash: await hashFile(resolveArtifactRef(memory, graph.artifact)),
    sourceHash: await sourceHash(project.path),
    policyHash: hashText("tool-policy-gate@phase-7l:sequential-workflowgraph"),
    capabilityHash: hashText("local-runtime:taskqueue-sequential:codex-worktree"),
    createdAt: new Date().toISOString(),
  };
}

export async function recomputeWorkflowRecoveryKey(memory: ResolvedMemory, project: ManagedProject, run: WorkflowRun): Promise<WorkflowRecoveryKey> {
  const changePath = await activeChangePath(memory, run.changeId);
  if (!run.workflowGraphPlanId) throw new Error("WorkflowRun resume requires workflowGraphPlanId.");
  const graph = await readWorkflowGraphPlan(memory, changePath, run.workflowGraphPlanId);
  const proposal = await readRequiredJsonFile(resolveArtifactRef(memory, requiredGraphRef(graph, ".taskqueue-proposal.json")), taskQueueProposalSchema);
  const readiness = await readRequiredJsonFile(resolveArtifactRef(memory, requiredGraphRef(graph, ".decomposition-readiness.json")), readinessSchema) as DecompositionReadinessManifest;
  const next = await buildWorkflowRecoveryKey(memory, project, changePath, proposal, readiness, graph);
  return { ...next, createdAt: run.recoveryKey.createdAt };
}

export async function activeChangePath(memory: ResolvedMemory, changeId: string): Promise<string> {
  const active = await getActiveChanges(memory);
  const target = active.find((item) => item.name === changeId);
  if (!target) throw new Error(`Active Change not found for WorkflowRun target: ${changeId}.`);
  return target.path;
}

export function sameJson(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function requiredGraphRef(graph: WorkflowGraphPlan, suffix: string): string {
  const ref = graph.artifactRefs.find((item) => item.endsWith(suffix));
  if (!ref) throw new Error(`WorkflowGraphPlan ${graph.id} is missing ${suffix} source ref.`);
  return ref;
}

async function sourceHash(projectPath: string): Promise<string> {
  const [head, status] = await Promise.all([
    getGitCommit(projectPath).catch(() => null),
    getGitStatusShort(projectPath).catch(() => null),
  ]);
  if (!head && !status) return `nogit:${hashText(projectPath)}`;
  return hashText(JSON.stringify({ head, status: status?.slice().sort() ?? [] }));
}
