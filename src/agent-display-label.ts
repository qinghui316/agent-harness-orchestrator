const ROLE_LABELS: Record<string, string> = {
  "main-agent": "主 Agent",
  "planning-agent": "Plan Agent",
  "coder-agent": "Coder Agent",
  "rework-coder": "Rework Agent",
  "auditor-agent": "Auditor Agent",
  "spec-test-proposer": "Spec-test Proposer",
  "spec-test-generator": "Spec-test Generator",
  "integration-fix-agent": "Integration Fix Agent",
  "harness-evolution-agent": "Evolution Agent",
  "evolution-scorer": "Scorer Agent",
};

export function agentRoleDisplayName(roleId?: string): string {
  return ROLE_LABELS[roleId ?? ""] ?? roleId ?? "Agent";
}

export function composeAgentDisplayLabel(roleId: string | undefined, providerDisplayName?: string): string {
  const role = agentRoleDisplayName(roleId);
  const provider = providerDisplayName?.trim();
  if (!provider || sameDisplayName(provider, role)) return role;
  return `${role} · ${provider}`;
}

export function baseAgentDisplayLabel(label: string, roleId?: string): string {
  const role = agentRoleDisplayName(roleId);
  return new RegExp(`^${escapeRegExp(role)}\\s+\\d+$`, "u").test(label) ? role : label;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sameDisplayName(left: string, right: string): boolean {
  return left.replace(/\s+/g, " ").trim().toLocaleLowerCase()
    === right.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}
