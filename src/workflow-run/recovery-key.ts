import { join } from "node:path";
import { getActiveChanges } from "../ecl/index.js";
import { getGitCommit, getGitStatusShort } from "../project/git.js";
import type { ManagedProject, ResolvedMemory, WorkflowGraphPlan, WorkflowGraphRecoveryKey, WorkflowRun } from "../types/index.js";
import {
  hashFile,
  hashText,
  readWorkflowGraphPlan,
  resolveArtifactRef,
} from "../workflow-artifacts/manager.js";

export async function recomputeWorkflowRecoveryKey(memory: ResolvedMemory, project: ManagedProject, run: WorkflowRun): Promise<WorkflowGraphRecoveryKey> {
  if (run.source !== "workflow-graph") throw new Error("TaskQueue recovery key recompute requires a graph-backed WorkflowRun.");
  const changePath = await activeChangePath(memory, run.changeId);
  if (!run.workflowGraphPlanId) throw new Error("WorkflowRun resume requires workflowGraphPlanId.");
  const graph = await readWorkflowGraphPlan(memory, changePath, run.workflowGraphPlanId);
  const next = await buildWorkflowGraphRecoveryKey(memory, project, changePath, graph);
  return { ...next, createdAt: run.recoveryKey.createdAt };
}

export async function buildWorkflowGraphRecoveryKey(memory: ResolvedMemory, project: ManagedProject, changePath: string, graph: WorkflowGraphPlan): Promise<WorkflowGraphRecoveryKey> {
  const acceptedArtifactHashes: Record<string, string> = {};
  for (const name of ["spec.md", "plan.md", "tasks.md", "ac-map.json"]) {
    acceptedArtifactHashes[name] = await hashFile(join(memory.memoryRoot, changePath, name));
  }
  return {
    version: "1.0",
    changeId: graph.changeId,
    workflowGraphPlanId: graph.id,
    acceptedArtifactHashes,
    workflowGraphPlanHash: await hashFile(resolveArtifactRef(memory, graph.artifact)),
    sourceHash: await sourceHash(project.path),
    policyHash: hashText("tool-policy-gate@workflow-graph"),
    capabilityHash: hashText(`local-runtime:${graph.graphMode}:provider-worktree`),
    createdAt: new Date().toISOString(),
  };
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

async function sourceHash(projectPath: string): Promise<string> {
  const [head, status] = await Promise.all([
    getGitCommit(projectPath).catch(() => null),
    getGitStatusShort(projectPath).catch(() => null),
  ]);
  if (!head && !status) return `nogit:${hashText(projectPath)}`;
  return hashText(JSON.stringify({ head, status: status?.slice().sort() ?? [] }));
}
