import type { StoredProviderThreadLink } from "../../store.js";
import type { WorkbenchAgentWorkspace, WorkbenchAgentWorkspaceAgent, WorkbenchTopicDetail, WorkbenchWorkpad } from "../../read-model-types.js";
import { buildAgentScopedTranscriptCells, type ParentAgentTranscript, type ParentAgentTranscriptCell } from "../../parent-agent-transcript.js";
import { agentRoleDisplayName, baseAgentDisplayLabel, composeAgentDisplayLabel } from "../../../agent-display-label.js";
import { agentThreadSurfaceId } from "../../../provider-runtime/agent-surface-id.js";

const MODEL_ROLES = new Set([
  "planning-agent",
  "coder-agent",
  "rework-coder",
  "auditor-agent",
  "spec-test-proposer",
  "spec-test-generator",
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
  workpad: WorkbenchWorkpad;
  providerThreads?: StoredProviderThreadLink[];
  graphScopeId?: string;
  includeExecution?: boolean;
}): WorkbenchAgentWorkspace {
  const agents = new Map<string, WorkbenchAgentWorkspaceAgent>();
  const providerAgentIds = new Map<string, string>();
  const scopedLinks = (input.providerThreads ?? []).filter((link) => input.graphScopeId && link.graphScopeId === input.graphScopeId);
  const surfaceByProviderThread = new Map(scopedLinks.map((link) => {
    const providerId = link.providerId;
    return [providerThreadKey(providerId, link.providerThreadId), link.roleId === "main-agent" ? "main-agent" : agentThreadSurfaceId(providerId, link.providerThreadId)] as const;
  }));
  const scopedItems = (input.selectedTopic?.threadItems ?? []).filter((item) => input.graphScopeId && item.graphScopeId === input.graphScopeId);
  for (const item of scopedItems) {
    if (!item.threadId || !item.agentRoleId) continue;
    const providerId = providerIdOf(item);
    if (!providerId) continue;
    surfaceByProviderThread.set(
      providerThreadKey(providerId, item.threadId),
      item.agentRoleId === "main-agent" ? "main-agent" : agentThreadSurfaceId(providerId, item.threadId),
    );
  }
  for (const link of scopedLinks) {
    if (link.roleId === "main-agent" || !MODEL_ROLES.has(link.roleId)) continue;
    const providerId = link.providerId;
    const id = agentThreadSurfaceId(providerId, link.providerThreadId);
    const cells = input.selectedTopic ? buildAgentScopedTranscriptCells(input.selectedTopic.threadItems, {
      agentRoleId: link.roleId,
      threadId: link.providerThreadId,
    }) : [];
    agents.set(id, agentSurface({
      id,
      roleId: link.roleId,
      providerId,
      providerThreadId: link.providerThreadId,
      providerDisplayName: link.displayName ?? undefined,
      parentThreadId: link.parentThreadId ?? undefined,
      parentAgentId: parentAgentId(providerId, link.parentThreadId, surfaceByProviderThread),
      runId: link.runId ?? undefined,
      status: cells.some((cell) => cell.status === "running") || (cells.length === 0 && Boolean(link.runId)) ? "running" : "completed",
      cells,
      summary: cells.at(-1)?.text ?? "真实 Agent 对话。",
      label: composeAgentDisplayLabel(link.roleId, link.displayName ?? undefined),
    }));
    providerAgentIds.set(providerTaskKey(providerId, link.conversationId, link.roleId), id);
  }

  for (const item of scopedItems) {
    const roleId = item.agentRoleId;
    if (!roleId || roleId === "main-agent" || !MODEL_ROLES.has(roleId)) continue;
    if (!item.threadId) continue;
    const providerId = providerIdOf(item);
    if (!providerId) continue;
    const id = agentThreadSurfaceId(providerId, item.threadId);
    if (!id || agents.has(id)) continue;
    const cells = buildAgentScopedTranscriptCells(input.selectedTopic!.threadItems, {
      agentRoleId: roleId,
      ...(item.threadId ? { threadId: item.threadId } : { runId: item.runId }),
    });
    agents.set(id, agentSurface({
      id,
      roleId,
      providerId,
      providerThreadId: item.threadId,
      parentThreadId: item.parentThreadId,
      parentAgentId: parentAgentId(providerId, item.parentThreadId, surfaceByProviderThread),
      runId: item.runId,
      status: cells.some((cell) => cell.status === "running") ? "running" : "completed",
      cells,
      summary: cells.at(-1)?.text ?? "真实 Agent 对话。",
    }));
  }

  const execution = input.includeExecution ? input.workpad.mainAgentExecution : undefined;
  if (execution) {
    for (const task of execution.agentTasks) {
      const taskRoleId = normalizedRoleId(task.roleId);
      if (!MODEL_ROLES.has(taskRoleId) || taskRoleId === "planning-agent") continue;
      const taskProviderId = providerIdOf(task);
      const providerAgentId = (taskProviderId ? providerAgentIds.get(providerTaskKey(taskProviderId, task.conversationId, taskRoleId)) : undefined)
        ?? uniqueAgentForRole(agents, taskRoleId, task.runId);
      const providerAgent = providerAgentId ? agents.get(providerAgentId) : undefined;
      if (!providerAgent) continue;
      const id = providerAgent.id;
      const existing = agents.get(id);
      const cell = processCell(`task:${task.id}`, roleLabel(taskRoleId), task.resultSummary ?? task.summary, task.status, taskRoleId, task.runId, task.evidenceRefs[0]);
      agents.set(id, existing ? {
        ...existing,
        status: task.status,
        summary: task.resultSummary ?? task.summary,
        transcript: transcript(task.roleId, [...(existing.transcript.cells ?? []), cell]),
      } : providerAgent);
    }
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
  status: string;
  summary: string;
  cells: ParentAgentTranscriptCell[];
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
    label: input.label ?? roleLabel(input.roleId),
    status: input.status,
    summary: input.summary,
    transcript: transcript(input.roleId, input.cells),
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

function transcript(roleId: string, cells: ParentAgentTranscriptCell[]): ParentAgentTranscript {
  return {
    title: roleLabel(roleId),
    cells,
    items: cells.map((cell) => ({
      id: `agent-workspace:item:${cell.id}`,
      actor: cell.kind === "user-message" ? "user" : "parent-agent",
      timestamp: cell.timestamp,
      derived: cell.source !== "provider-runtime" && cell.source !== "user",
      blocks: [{
        id: `agent-workspace:block:${cell.id}`,
        kind: cell.kind === "assistant-message" || cell.kind === "user-message" ? "prose" : cell.kind === "process-row" ? "process" : "evidence",
        source: cell.source,
        title: cell.title,
        text: cell.text,
        status: cell.status,
        evidenceRefs: cell.evidenceRefs,
        isError: cell.isError,
      }],
    })),
    emptyMessage: "暂无 Agent 消息。",
  };
}

function processCell(id: string, title: string, text: string, status: string, roleId: string, runId?: string, artifactRef?: string): ParentAgentTranscriptCell {
  return {
    id,
    kind: "process-row",
    source: "aho-orchestration",
    agentRoleId: roleId,
    runId,
    title,
    text,
    status,
    evidenceRefs: artifactRef ? [{ label: title, ref: artifactRef, kind: "artifact" }] : undefined,
  };
}

function roleLabel(roleId: string): string {
  return agentRoleDisplayName(roleId);
}

function normalizedRoleId(roleId: string): string {
  if (roleId.startsWith("memory-maintenance-agent:")) return "memory-maintenance-agent";
  if (roleId.startsWith("harness-evolution-agent:")) return "harness-evolution-agent";
  return roleId;
}

function providerIdOf(value: object): string | null {
  const providerId = "providerId" in value && typeof value.providerId === "string" ? value.providerId.trim() : "";
  return providerId || null;
}

function providerThreadKey(providerId: string, providerThreadId: string): string {
  return `${providerId}\u0000${providerThreadId}`;
}

function parentAgentId(providerId: string, parentThreadId: string | null | undefined, surfaces: Map<string, string>): string {
  if (!parentThreadId) return "main-agent";
  return surfaces.get(providerThreadKey(providerId, parentThreadId)) ?? "main-agent";
}

function providerTaskKey(providerId: string, conversationId: string, roleId: string): string {
  return `${providerId}\u0000${conversationId}\u0000${normalizedRoleId(roleId)}`;
}

function uniqueAgentForRole(agents: Map<string, WorkbenchAgentWorkspaceAgent>, roleId: string, runId?: string): string | undefined {
  const roleAgents = [...agents.values()].filter((agent) => agent.roleId === roleId);
  const runMatch = runId ? roleAgents.find((agent) => agent.runId === runId) : undefined;
  if (runMatch) return runMatch.id;
  const matches = roleAgents;
  return matches.length === 1 ? matches[0]?.id : undefined;
}
