import type { StoredProviderAttempt, StoredProviderThreadLink } from "../../store.js";
import type { WorkbenchAgentWorkspace, WorkbenchAgentWorkspaceAgent, WorkbenchTopicDetail } from "../../read-model-types.js";
import { agentRoleDisplayName, baseAgentDisplayLabel, composeAgentDisplayLabel } from "../../../agent-display-label.js";
import { agentThreadSurfaceId } from "../../../provider-runtime/agent-surface-id.js";

const MODEL_ROLES = new Set([
  "planning-agent",
  "coder-agent",
  "rework-coder",
  "auditor-agent",
  "spec-test-proposer",
  "spec-test-generator",
  "integration-fix-agent",
  "memory-maintenance-agent",
  "harness-evolution-agent",
  "evolution-scorer",
  "child-agent",
]);
export function emptyAgentWorkspace(): WorkbenchAgentWorkspace {
  return { selectedAgentId: "", agents: [] };
}

export function buildAgentWorkspace(input: {
  selectedTopic: WorkbenchTopicDetail | null;
  providerThreads?: StoredProviderThreadLink[];
  providerAttempts?: StoredProviderAttempt[];
  graphScopeId?: string;
}): WorkbenchAgentWorkspace {
  const agents = new Map<string, WorkbenchAgentWorkspaceAgent>();
  const scopedLinks = (input.providerThreads ?? []).filter((link) => input.graphScopeId && link.graphScopeId === input.graphScopeId);
  const attemptsById = new Map((input.providerAttempts ?? []).map((attempt) => [attempt.attemptId, attempt]));
  const surfaceByProviderThread = new Map(scopedLinks.map((link) => {
    const providerId = link.providerId;
    return [providerThreadKey(providerId, link.providerThreadId), link.roleId === "main-agent" ? "main-agent" : agentThreadSurfaceId(providerId, link.providerThreadId)] as const;
  }));
  for (const link of scopedLinks) {
    if (link.roleId === "main-agent" || !MODEL_ROLES.has(link.roleId)) continue;
    const attempt = link.attemptId ? attemptsById.get(link.attemptId) : undefined;
    if (!attemptMatchesLink(attempt, link, input.graphScopeId)) continue;
    const providerId = link.providerId;
    const id = agentThreadSurfaceId(providerId, link.providerThreadId);
    agents.set(id, agentSurface({
      id,
      roleId: link.roleId,
      providerId,
      providerThreadId: link.providerThreadId,
      providerDisplayName: link.displayName ?? undefined,
      parentThreadId: link.parentThreadId ?? undefined,
      parentAgentId: parentAgentId(providerId, link.parentThreadId, surfaceByProviderThread),
      runId: link.runId ?? undefined,
      agentTaskId: attempt.agentTaskId ?? undefined,
      status: attempt.status,
      summary: "真实 Agent 对话。",
      label: composeAgentDisplayLabel(link.roleId, link.displayName ?? undefined),
    }));
  }

  const ordered = numberDuplicateLabels([...agents.values()]);
  return { selectedAgentId: "", agents: ordered };
}

function agentSurface(input: {
  id: string;
  roleId: string;
  providerId: string;
  providerThreadId?: string;
  providerDisplayName?: string;
  parentThreadId?: string;
  parentAgentId: string;
  runId?: string;
  agentTaskId?: string;
  status: string;
  summary: string;
  label?: string;
}): WorkbenchAgentWorkspaceAgent {
  return {
    id: input.id,
    roleId: input.roleId,
    providerId: input.providerId,
    providerThreadId: input.providerThreadId,
    providerDisplayName: input.providerDisplayName,
    parentThreadId: input.parentThreadId,
    parentAgentId: input.parentAgentId,
    runId: input.runId,
    agentTaskId: input.agentTaskId,
    label: input.label ?? roleLabel(input.roleId),
    status: input.status,
    summary: input.summary,
    evidenceRefs: [],
    actions: [],
  };
}

function numberDuplicateLabels(agents: WorkbenchAgentWorkspaceAgent[]): WorkbenchAgentWorkspaceAgent[] {
  const bases = new Map(agents.map((agent) => [agent.id, baseAgentDisplayLabel(agent.label, agent.roleId)]));
  const totals = new Map<string, number>();
  for (const base of bases.values()) totals.set(base, (totals.get(base) ?? 0) + 1);
  const sorted = [...agents].sort((left, right) => left.id.localeCompare(right.id));
  const nextByBase = new Map<string, number>();
  const indexById = new Map<string, number>();
  for (const agent of sorted) {
    const base = bases.get(agent.id)!;
    const next = (nextByBase.get(base) ?? 0) + 1;
    nextByBase.set(base, next);
    indexById.set(agent.id, next);
  }
  return agents.map((agent) => {
    const base = bases.get(agent.id)!;
    if ((totals.get(base) ?? 0) < 2) return { ...agent, label: base };
    return { ...agent, label: `${base} ${indexById.get(agent.id) ?? 1}` };
  });
}

function roleLabel(roleId: string): string {
  return agentRoleDisplayName(roleId);
}

function providerThreadKey(providerId: string, providerThreadId: string): string {
  return `${providerId}\u0000${providerThreadId}`;
}

function parentAgentId(providerId: string, parentThreadId: string | null | undefined, surfaces: Map<string, string>): string {
  if (!parentThreadId) return "main-agent";
  return surfaces.get(providerThreadKey(providerId, parentThreadId)) ?? "main-agent";
}

function attemptMatchesLink(
  attempt: StoredProviderAttempt | undefined,
  link: StoredProviderThreadLink,
  graphScopeId: string | undefined,
): attempt is StoredProviderAttempt {
  return Boolean(attempt
    && attempt.conversationId === link.conversationId
    && attempt.providerId === link.providerId
    && attempt.roleId === link.roleId
    && attempt.graphScopeId === graphScopeId
    && attempt.nativeSessionId === link.providerThreadId);
}
