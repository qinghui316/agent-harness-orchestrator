import type { AgentWorkspace, PlanHandoffCandidate, PlanHandoffAgentRoleId } from "../../types.js";

const PLAN_HANDOFF_AGENT_ROLES = new Set<PlanHandoffAgentRoleId>(["plan-session", "planning-agent"]);

export function derivePlanHandoffCandidate(workspace: AgentWorkspace): PlanHandoffCandidate | null {
  const candidates = workspace.agents
    .filter((agent) => PLAN_HANDOFF_AGENT_ROLES.has(agent.roleId as PlanHandoffAgentRoleId))
    .flatMap((agent) => (agent.transcript.cells ?? [])
      .filter((cell) => cell.runId && cell.text.trim() && cell.kind === "assistant-message")
      .map((cell) => ({
        sourceRunId: cell.runId as string,
        sourceAgentRoleId: agent.roleId as PlanHandoffAgentRoleId,
        title: agent.label || (agent.roleId === "plan-session" ? "Plan Agent" : "planning-agent"),
        planText: cell.text.trim(),
        timestamp: cell.timestamp ?? "",
      })));
  const latest = candidates.sort((left, right) => right.timestamp.localeCompare(left.timestamp))[0];
  if (!latest) return null;
  return {
    sourceRunId: latest.sourceRunId,
    sourceAgentRoleId: latest.sourceAgentRoleId,
    title: latest.title,
    planText: latest.planText,
  };
}
