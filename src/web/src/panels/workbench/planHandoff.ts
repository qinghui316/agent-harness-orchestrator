import type { AgentWorkspace, PlanHandoffCandidate, PlanHandoffAgentRoleId } from "../../types.js";

const PLAN_HANDOFF_AGENT_ROLES = new Set<PlanHandoffAgentRoleId>(["planning-agent"]);

export function derivePlanHandoffCandidate(workspace: AgentWorkspace): PlanHandoffCandidate | null {
  const attempts = workspace.agents
    .filter((agent) => PLAN_HANDOFF_AGENT_ROLES.has(agent.roleId as PlanHandoffAgentRoleId))
    .flatMap((agent) => (agent.transcript.cells ?? [])
      .filter((cell) => cell.runId && cell.text.trim() && cell.kind === "assistant-message")
      .map((cell) => ({
        sourceArtifact: cell.evidenceRefs?.find((ref) => ref.kind === "artifact")?.ref,
        proposalKey: cell.evidenceRefs?.find((ref) => ref.kind === "artifact")?.ref,
        sourceRunId: cell.runId as string,
        sourceAgentRoleId: agent.roleId as PlanHandoffAgentRoleId,
        title: agent.label || "Plan Agent",
        planText: cell.text.trim(),
        timestamp: cell.timestamp ?? "",
        status: cell.status,
      })));
  const latest = attempts.sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0];
  if (!latest?.sourceArtifact || !latest.proposalKey || ["planner-proposal-invalid", "accepted", "revision-requested", "cancelled"].includes(latest.status ?? "")) return null;
  return {
    sourceRunId: latest.sourceRunId,
    sourceAgentRoleId: latest.sourceAgentRoleId,
    title: latest.title,
    planText: latest.planText,
    sourceArtifact: latest.sourceArtifact,
    proposalKey: latest.proposalKey,
  };
}
