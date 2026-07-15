import type { StoredProviderThreadLink } from "../../store.js";
import type { WorkbenchAgentWorkspace, WorkbenchAgentWorkspaceAgent, WorkbenchRoleRunSummary, WorkbenchTopicDetail, WorkbenchWorkpad } from "../../read-model-types.js";
import { buildAgentScopedTranscriptCells, type ParentAgentTranscript, type ParentAgentTranscriptCell } from "../../parent-agent-transcript.js";
import { agentRoleDisplayName, baseAgentDisplayLabel, composeAgentDisplayLabel } from "../../../agent-display-label.js";

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
  for (const link of input.providerThreads ?? []) {
    if (!input.graphScopeId || link.graphScopeId !== input.graphScopeId) continue;
    if (link.roleId === "main-agent" || !MODEL_ROLES.has(link.roleId)) continue;
    const id = `thread:${link.providerThreadId}`;
    const cells = input.selectedTopic ? buildAgentScopedTranscriptCells(input.selectedTopic.threadItems, {
      agentRoleId: link.roleId,
      threadId: link.providerThreadId,
    }) : [];
    agents.set(id, agentSurface({
      id,
      roleId: link.roleId,
      providerThreadId: link.providerThreadId,
      providerDisplayName: link.displayName ?? undefined,
      parentThreadId: link.parentThreadId ?? undefined,
      runId: link.runId ?? undefined,
      status: cells.some((cell) => cell.status === "running") ? "running" : "completed",
      cells,
      summary: cells.at(-1)?.text ?? "真实 Agent 对话。",
      label: composeAgentDisplayLabel(link.roleId, link.displayName ?? undefined),
    }));
    providerAgentIds.set(providerTaskKey(link.conversationId, link.roleId), id);
  }

  for (const item of input.selectedTopic?.threadItems ?? []) {
    if (!input.graphScopeId || item.graphScopeId !== input.graphScopeId) continue;
    const roleId = item.agentRoleId;
    if (!roleId || roleId === "main-agent" || !MODEL_ROLES.has(roleId)) continue;
    const id = item.threadId ? `thread:${item.threadId}` : item.runId ? `run:${item.runId}` : null;
    if (!id || agents.has(id)) continue;
    const cells = buildAgentScopedTranscriptCells(input.selectedTopic!.threadItems, {
      agentRoleId: roleId,
      ...(item.threadId ? { threadId: item.threadId } : { runId: item.runId }),
    });
    agents.set(id, agentSurface({
      id,
      roleId,
      providerThreadId: item.threadId,
      parentThreadId: item.parentThreadId,
      runId: item.runId,
      status: cells.some((cell) => cell.status === "running") ? "running" : "completed",
      cells,
      summary: cells.at(-1)?.text ?? "真实 Agent 对话。",
    }));
  }

  const execution = input.includeExecution ? input.workpad.mainAgentExecution : undefined;
  if (execution) {
    for (const run of execution.runs) {
      if (!MODEL_ROLES.has(run.roleId) || run.roleId === "planning-agent") continue;
      const id = run.runId ? `run:${run.runId}` : `run:${run.roleId}:${stablePart(run.artifact ?? run.summary)}`;
      agents.set(id, runSurface(id, run));
    }
    for (const task of execution.agentTasks) {
      const taskRoleId = normalizedRoleId(task.roleId);
      if (!MODEL_ROLES.has(taskRoleId) || taskRoleId === "planning-agent") continue;
      const providerAgentId = providerAgentIds.get(providerTaskKey(task.conversationId, taskRoleId));
      const providerAgent = providerAgentId
        ? agents.get(providerAgentId)
        : task.runId
          ? [...agents.values()].find((agent) => agent.runId === task.runId)
          : undefined;
      const id = providerAgent?.id ?? (task.runId ? `run:${task.runId}` : `task:${task.id}`);
      const existing = agents.get(id);
      const cell = processCell(`task:${task.id}`, roleLabel(taskRoleId), task.resultSummary ?? task.summary, task.status, taskRoleId, task.runId, task.evidenceRefs[0]);
      agents.set(id, existing ? {
        ...existing,
        status: task.status,
        summary: task.resultSummary ?? task.summary,
        transcript: transcript(task.roleId, [...(existing.transcript.cells ?? []), cell]),
      } : agentSurface({
        id,
        roleId: taskRoleId,
        runId: task.runId,
        status: task.status,
        cells: [cell],
        summary: task.resultSummary ?? task.summary,
      }));
    }
  }

  const ordered = numberDuplicateLabels([...agents.values()]);
  return { selectedAgentId: "", agents: ordered };
}

function runSurface(id: string, run: WorkbenchRoleRunSummary): WorkbenchAgentWorkspaceAgent {
  return agentSurface({
    id,
    roleId: run.roleId,
    runId: run.runId,
    status: run.status,
    summary: run.summary,
    cells: [processCell(`run:${id}`, roleLabel(run.roleId), run.summary, run.status, run.roleId, run.runId, run.artifact)],
  });
}

function agentSurface(input: {
  id: string;
  roleId: string;
  providerThreadId?: string;
  providerDisplayName?: string;
  parentThreadId?: string;
  runId?: string;
  status: string;
  summary: string;
  cells: ParentAgentTranscriptCell[];
  label?: string;
}): WorkbenchAgentWorkspaceAgent {
  return {
    id: input.id,
    roleId: input.roleId,
    providerThreadId: input.providerThreadId,
    providerDisplayName: input.providerDisplayName,
    parentThreadId: input.parentThreadId,
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
      derived: cell.source !== "codex-runtime" && cell.source !== "user",
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

function providerTaskKey(conversationId: string, roleId: string): string {
  return `${conversationId}:${normalizedRoleId(roleId)}`;
}

function stablePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9]+/g, "-").slice(0, 48) || "agent";
}
