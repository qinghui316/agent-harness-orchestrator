import type { WorkflowGraphPlan } from "../types/index.js";

export function renderWorkflowGraphPlanMarkdown(graph: WorkflowGraphPlan): string {
  if (graph.graphMode === "ready-set-v1") return renderReadySetWorkflowGraphPlanMarkdown(graph);
  return [
    `# WorkflowGraphPlan ${graph.id}`,
    "",
    `- Change: ${graph.changeId}`,
    `- Status: ${graph.status}`,
    `- Mode: ${graph.graphMode}`,
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

function renderReadySetWorkflowGraphPlanMarkdown(graph: WorkflowGraphPlan & { graphMode: "ready-set-v1" }): string {
  return [
    `# WorkflowGraphPlan ${graph.id}`,
    "",
    `- Change: ${graph.changeId}`,
    `- Status: ${graph.status}`,
    `- Mode: ${graph.graphMode}`,
    `- SchedulerContract: ${graph.schedulerContractId}`,
    `- SchedulerWorkerSessionPlan: ${graph.schedulerWorkerPlanId}`,
    `- SchedulerClaimReconcilePlan: ${graph.schedulerClaimReconcilePlanId}`,
    "",
    "## Waves",
    ...graph.waves.map((wave) => `- Wave ${wave.index}: ${wave.nodeIds.length} nodes, ${wave.candidateCount} candidates, ${wave.blockedCount} blocked`),
    "",
    "## Nodes",
    ...graph.nodes.map((node) => `- ${node.id} (${node.schedulerNodeId}, wave ${node.waveIndex}): ${node.stages.join(" -> ")}; claim ${node.claimIntentId}`),
    "",
    "## Edges",
    ...(graph.edges.length ? graph.edges.map((edge) => `- ${edge.from} -> ${edge.to} (${edge.kind})`) : ["- None."]),
    "",
    "## Boundary",
    "",
    "- This is a ready-set graph contract and lineage artifact, not execution authorization.",
    "- Compiling this graph does not create a WorkflowRun, SchedulerRun, TaskRun, WorkerLease, worktree, run, validation, audit, confirmation entry, or child Change.",
    "- Scheduler single-worker starts may use this graph to derive the current exact target, but execution still requires SchedulerRuntimeClaimReservation, SchedulerContract, human confirmation, and workflow-runtime Scheduler revalidation.",
    "",
  ].join("\n");
}
