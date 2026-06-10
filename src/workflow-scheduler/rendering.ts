import type { SchedulerContract } from "./types.js";

export function renderSchedulerContractMarkdown(contract: SchedulerContract): string {
  const lines = [
    `# SchedulerContract ${contract.id}`,
    "",
    `Status: ${contract.status}`,
    `Mode: ${contract.schedulerMode}`,
    `Change: ${contract.changeId}`,
    `DecompositionPlan: ${contract.decompositionPlanId}`,
    `ReadinessManifest: ${contract.readinessManifestId}`,
    "",
    "## Summary",
    "",
    `- Nodes: ${contract.nodes.length}`,
    `- Edges: ${contract.edges.length}`,
    `- Waves: ${contract.waves.length}`,
    `- Conflict scopes: ${contract.conflictScopes.length}`,
    "",
    "## Waves",
    "",
    ...contract.waves.map((wave) => `- Wave ${wave.index + 1}: ${wave.nodeIds.join(", ")}`),
    "",
    "## Nodes",
    "",
    ...contract.nodes.map((node) => [
      `### ${node.id}`,
      "",
      `- Unit: ${node.unitId}`,
      `- Title: ${node.title}`,
      `- Tasks: ${node.taskIds.join(", ") || "none"}`,
      `- ACs: ${node.acIds.join(", ") || "none"}`,
      `- Source scopes: ${node.sourceScopes.join(", ") || "none"}`,
      `- Stages: ${node.stages.join(" -> ")}`,
      "",
    ].join("\n")),
    "## Boundary",
    "",
    "This SchedulerContract is non-executing evidence. It does not create TaskRuns, WorkerLeases, worktrees, runs, child Changes, or source mutations.",
    "",
  ];
  return lines.join("\n");
}
