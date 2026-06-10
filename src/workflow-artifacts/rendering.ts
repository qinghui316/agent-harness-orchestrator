import type { WorkflowGraphPlan } from "../types/index.js";
import type { DecompositionPlan, DecompositionReadinessManifest, TaskQueueProposal } from "./types.js";

export function renderDecompositionPlanMarkdown(plan: DecompositionPlan): string {
  return [
    `# DecompositionPlan ${plan.id}`,
    "",
    `Status: ${plan.status}`,
    `Recommendation: ${plan.recommendation}`,
    "",
    "## Rationale",
    "",
    plan.rationale,
    "",
    "## Units",
    "",
    ...plan.units.map((unit) => `- ${unit.id}: ${unit.title} (${unit.taskIds.join(", ") || "no task ids"})`),
    "",
    "## Boundary",
    "",
    "- Proposal only; not executable workflow truth.",
    "- Confirmation does not create child Changes, TaskRuns, AgentTasks, or code runs.",
    "",
  ].join("\n");
}

export function renderDecompositionReadinessMarkdown(manifest: DecompositionReadinessManifest): string {
  return [
    `# DecompositionReadinessManifest ${manifest.id}`,
    "",
    `Status: ${manifest.status}`,
    `Recommendation: ${manifest.recommendation}`,
    `Next allowed action: ${manifest.nextAllowedAction}`,
    "",
    "## Boundary",
    "",
    "- Readiness only; not executable workflow truth.",
    "- This artifact does not create child Changes, TaskQueues, TaskRuns, AgentTasks, worktrees, or runs.",
    "",
  ].join("\n");
}

export function renderTaskQueueProposalMarkdown(proposal: TaskQueueProposal): string {
  return [
    `# TaskQueueProposal ${proposal.id}`,
    "",
    `- Change: ${proposal.changeId}`,
    `- Status: ${proposal.status}`,
    `- DecompositionPlan: ${proposal.decompositionPlanId}`,
    `- ReadinessManifest: ${proposal.readinessManifestId}`,
    `- Queue mode: ${proposal.queueMode}`,
    "",
    "## Items",
    ...proposal.items.map((item) => `- ${item.order}. ${item.taskId} (${item.unitId}) - ${item.title}`),
    "",
    "## Boundaries",
    "- This proposal does not create TaskQueue, TaskRun, AgentTask, worktree, child Change, or run records.",
    "- Queue execution requires a separate user-confirmed planning.workflowgraph.compile and planning.taskqueue.confirm-start action.",
    "- The proposal is not workflow truth; Harness artifacts, run evidence, validation, audit, and human gates remain authoritative.",
    "",
  ].join("\n");
}

export function renderWorkflowGraphPlanMarkdown(graph: WorkflowGraphPlan): string {
  return [
    `# WorkflowGraphPlan ${graph.id}`,
    "",
    `- Change: ${graph.changeId}`,
    `- Status: ${graph.status}`,
    `- Mode: ${graph.graphMode}`,
    `- TaskQueueProposal: ${graph.taskQueueProposalId}`,
    `- ReadinessManifest: ${graph.readinessManifestId}`,
    "",
    "## Nodes",
    ...graph.nodes.map((node) => `- ${node.order}. ${node.taskId}: ${node.stages.join(" -> ")}`),
    "",
    "## Edges",
    ...(graph.edges.length ? graph.edges.map((edge) => `- ${edge.from} -> ${edge.to} (${edge.kind})`) : ["- None."]),
    "",
    "## Boundary",
    "",
    "- This is a typed execution input, not workflow truth.",
    "- Compiling this graph does not create a WorkflowRun, TaskQueueRun, TaskRun, AgentTask, worktree, or child Change.",
    "- Start/resume must bind to this versioned graph and its source artifact hashes.",
    "",
  ].join("\n");
}
