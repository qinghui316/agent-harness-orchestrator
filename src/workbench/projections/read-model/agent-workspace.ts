import type { WorkbenchAgentTaskSummary, WorkbenchAgentWorkspace, WorkbenchAgentWorkspaceAgent, WorkbenchRoleRunSummary, WorkbenchTopicDetail, WorkbenchWorkpad } from "../../read-model-types.js";
import { buildAgentScopedTranscriptCells, type ParentAgentTranscript, type ParentAgentTranscriptCell } from "../../parent-agent-transcript.js";

const KNOWN_ROLE_ORDER = ["planning-agent", "coder-agent", "validator", "auditor-agent", "rework-coder"];

export function emptyAgentWorkspace(): WorkbenchAgentWorkspace {
  return {
    selectedAgentId: "planning-agent",
    agents: [],
  };
}

export function buildAgentWorkspace(input: {
  selectedTopic: WorkbenchTopicDetail | null;
  workpad: WorkbenchWorkpad;
}): WorkbenchAgentWorkspace {
  const agents = new Map<string, WorkbenchAgentWorkspaceAgent>();
  const hasPlanningAgent = hasRealPlanningAgentEvidence(input.selectedTopic);
  const planningAgent = hasPlanningAgent ? planningAgentWorkspace(input.selectedTopic) : null;
  if (planningAgent) agents.set("planning-agent", planningAgent);

  const execution = input.workpad.mainAgentExecution;
  if (execution) {
    for (const roleId of rolesFromExecution(execution.runs, execution.agentTasks)) {
      if (roleId === "planning-agent" || roleId === "main-agent") continue;
      agents.set(roleId, roleWorkspace(roleId, execution.runs, execution.agentTasks));
    }
  }

  const orderedAgents = [
    ...KNOWN_ROLE_ORDER.map((roleId) => agents.get(roleId)).filter((agent): agent is WorkbenchAgentWorkspaceAgent => Boolean(agent)),
    ...[...agents.values()].filter((agent) => !KNOWN_ROLE_ORDER.includes(agent.id)),
  ];
  const selectedAgentId = orderedAgents.find((agent) => agent.status === "running")?.id ?? orderedAgents[0]?.id ?? "planning-agent";
  return { selectedAgentId, agents: orderedAgents };
}

function planningAgentWorkspace(topic: WorkbenchTopicDetail | null): WorkbenchAgentWorkspaceAgent | null {
  const persistedCells = topic ? buildAgentScopedTranscriptCells(topic.threadItems, "planning-agent") : [];
  const cells: ParentAgentTranscriptCell[] = [...persistedCells];
  if (cells.length === 0) return null;

  return {
    id: "planning-agent",
    roleId: "planning-agent",
    label: "Plan Agent",
    status: cells.some((cell) => cell.status === "running") ? "running" : "completed",
    summary: "真实计划子 Agent 对话。",
    inputSummary: topic?.title,
    transcript: transcript("planning-agent", cells),
    evidenceRefs: [],
    actions: [],
  };
}

function hasRealPlanningAgentEvidence(topic: WorkbenchTopicDetail | null): boolean {
  const persistedCells = topic ? buildAgentScopedTranscriptCells(topic.threadItems, "planning-agent") : [];
  return persistedCells.length > 0;
}

function roleWorkspace(roleId: string, runs: WorkbenchRoleRunSummary[], tasks: WorkbenchAgentTaskSummary[]): WorkbenchAgentWorkspaceAgent {
  const roleRuns = runs.filter((run) => run.roleId === roleId);
  const roleTasks = tasks.filter((task) => task.roleId === roleId);
  const cells: ParentAgentTranscriptCell[] = [];
  for (const run of roleRuns) {
    cells.push(processCell(`role:${roleId}:run:${run.runId ?? run.artifact ?? run.summary}`, roleLabel(roleId), run.summary, run.status, roleId, run.runId, run.artifact));
  }
  for (const task of roleTasks) {
    cells.push(processCell(`role:${roleId}:task:${task.id}`, roleLabel(roleId), task.resultSummary ?? task.summary, task.status, roleId, task.runId, task.evidenceRefs[0]));
  }
  if (cells.length === 0) cells.push(processCell(`role:${roleId}:empty`, roleLabel(roleId), "暂无该 Agent 的运行记录。", "idle", roleId));
  const latestTask = roleTasks.at(-1);
  const latestRun = roleRuns.at(-1);
  return {
    id: roleId,
    roleId,
    label: roleLabel(roleId),
    status: latestTask?.status ?? latestRun?.status ?? "idle",
    summary: latestTask?.resultSummary ?? latestTask?.summary ?? latestRun?.summary ?? "暂无运行记录。",
    inputSummary: latestTask?.summary,
    outputSummary: latestTask?.resultSummary ?? latestRun?.summary,
    transcript: transcript(roleId, cells),
    evidenceRefs: [
      ...roleRuns.flatMap((run) => run.artifact ? [{ label: roleLabel(roleId), ref: run.artifact, kind: "artifact" as const }] : []),
      ...roleTasks.flatMap((task) => task.evidenceRefs.map((ref) => ({ label: roleLabel(roleId), ref, kind: "artifact" as const }))),
    ],
    actions: [],
  };
}

function rolesFromExecution(runs: WorkbenchRoleRunSummary[], tasks: WorkbenchAgentTaskSummary[]): string[] {
  return [...new Set([...runs.map((run) => run.roleId), ...tasks.map((task) => task.roleId)])];
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
  const visibleTitle = normalizeAgentWorkspacePlanningText(title);
  const visibleText = normalizeAgentWorkspacePlanningText(text);
  return {
    id,
    kind: "process-row",
    source: "aho-orchestration",
    agentRoleId: roleId,
    runId,
    title: visibleTitle,
    text: visibleText,
    status,
    evidenceRefs: artifactRef ? [{ label: visibleTitle, ref: artifactRef, kind: "artifact" }] : undefined,
  };
}

function normalizeAgentWorkspacePlanningText(value: string): string {
  return value
    .replace(/\bPlanning draft generated for user review\./g, "计划已生成，等待审阅。")
    .replace(/\bPlanning draft revised for user review\./g, "计划已按反馈更新。")
    .replace(/\bPlanning draft generated\b/g, "计划已生成")
    .replace(/\bPlanning draft revised\b/g, "计划已修改")
    .replace(/\bPlanning confirmed\b/g, "计划已确认")
    .replace(/\bplanning-agent returned reviewable plan text\./g, "planning-agent 已返回可审阅计划。")
    .replace(/\bPlanning records were saved after user confirmation\./g, "方案已保存；当前不会直接修改文件。");
}

function roleLabel(roleId: string): string {
  if (roleId === "main-agent") return "主 Agent";
  if (roleId === "planning-agent") return "Plan Agent";
  if (roleId === "coder-agent" || roleId === "coder") return "coder-agent";
  if (roleId === "validator") return "validator";
  if (roleId === "auditor-agent" || roleId === "auditor") return "auditor-agent";
  if (roleId === "rework-coder") return "rework-coder";
  return roleId;
}
