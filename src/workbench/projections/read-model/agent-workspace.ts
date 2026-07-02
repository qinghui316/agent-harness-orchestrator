import type { WorkbenchAgentTaskSummary, WorkbenchAgentWorkspace, WorkbenchAgentWorkspaceAgent, WorkbenchDecisionAction, WorkbenchPlanningArtifactBundle, WorkbenchRoleRunSummary, WorkbenchTopicDetail, WorkbenchWorkpad } from "../../read-model-types.js";
import type { ParentAgentTranscript, ParentAgentTranscriptCell } from "../../parent-agent-transcript.js";

const KNOWN_ROLE_ORDER = ["main-agent", "planning-agent", "coder-agent", "validator", "auditor-agent", "rework-coder"];

export function emptyAgentWorkspace(): WorkbenchAgentWorkspace {
  return {
    selectedAgentId: "main-agent",
    agents: [mainAgentWorkspace(null)],
  };
}

export function buildAgentWorkspace(input: {
  selectedTopic: WorkbenchTopicDetail | null;
  workpad: WorkbenchWorkpad;
}): WorkbenchAgentWorkspace {
  const agents = new Map<string, WorkbenchAgentWorkspaceAgent>();
  agents.set("main-agent", mainAgentWorkspace(input.selectedTopic));
  agents.set("planning-agent", planningAgentWorkspace(input.selectedTopic, input.workpad));

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
  const selectedAgentId = input.workpad.planningArtifactBundle || input.workpad.nextAction.actionType === "planning.generate" || input.workpad.nextAction.actionType === "planning.confirm-execution"
    ? "planning-agent"
    : orderedAgents.find((agent) => agent.status === "running")?.id ?? "main-agent";
  return { selectedAgentId, agents: orderedAgents };
}

function mainAgentWorkspace(topic: WorkbenchTopicDetail | null): WorkbenchAgentWorkspaceAgent {
  return {
    id: "main-agent",
    roleId: "main-agent",
    label: "主 Agent",
    status: topic?.state === "active" ? "active" : topic?.state ?? "idle",
    summary: topic ? "主 Agent 负责理解需求、委派子 Agent，并在收到结果后决定下一步。" : "选择需求后查看主 Agent 状态。",
    inputSummary: topic?.title,
    outputSummary: "主 Agent 的完整对话显示在中间主对话区。",
    transcript: transcript("main-agent", [
      processCell("main-agent:location", "主对话", "主 Agent 对话保留在中间区域；右侧用于查看子 Agent 工作区和证据。", "active", "main-agent"),
    ]),
    evidenceRefs: [],
    actions: [],
  };
}

function planningAgentWorkspace(topic: WorkbenchTopicDetail | null, workpad: WorkbenchWorkpad): WorkbenchAgentWorkspaceAgent {
  const bundle = workpad.planningArtifactBundle;
  const cells: ParentAgentTranscriptCell[] = [];
  const actions: WorkbenchDecisionAction[] = [];

  if (!bundle) {
    cells.push(processCell("planning-agent:empty", "planning-agent", "还没有方案草案。主 Agent 可以委派 planning-agent 生成一份可审阅方案。", "waiting-user", "planning-agent"));
    if (topic?.state === "active" && workpad.nextAction.actionType === "planning.generate" && workpad.nextAction.enabled) {
      actions.push({
        ...workpad.nextAction,
        id: `agent-workspace:planning.generate:${topic.id}`,
        label: "让 planning-agent 生成方案",
        kind: "workflow-action",
        actionType: "planning.generate",
        changeId: topic.id,
        enabled: true,
        requiresConfirmation: false,
      });
    }
  } else {
    cells.push(processCell(
      `planning-agent:${bundle.id}:status`,
      bundle.status === "confirmed" ? "方案已实施" : "planning-agent 返回方案",
      bundle.status === "confirmed" ? "方案已经保存为正式计划记录。" : "方案草案已准备好，可以继续反馈修改或实施。",
      bundle.status,
      "planning-agent",
      bundle.proposedPlanRunId,
    ));
    cells.push({
      id: `planning-agent:${bundle.id}:plan`,
      kind: "assistant-message",
      source: bundle.proposedPlanRunId ? "codex-runtime" : "aho-orchestration",
      agentRoleId: "planning-agent",
      runId: bundle.proposedPlanRunId,
      timestamp: bundle.updatedAt,
      text: planningBundleText(bundle),
      status: bundle.status,
      evidenceRefs: bundle.artifact ? [{ label: "方案草案", ref: bundle.artifact, kind: "artifact" }] : undefined,
    });
    if (bundle.artifact) {
      cells.push({
        id: `planning-agent:${bundle.id}:evidence`,
        kind: "evidence-row",
        source: "workflow-evidence",
        agentRoleId: "planning-agent",
        timestamp: bundle.updatedAt,
        title: "方案材料",
        text: "方案草案和后续正式计划记录都以 Harness artifact 为准。",
        status: bundle.status,
        evidenceRefs: [{ label: "方案草案", ref: bundle.artifact, kind: "artifact" }],
      });
    }
    if (topic?.state === "active" && bundle.status === "draft") {
      const reviseSource = workpad.nextAction.actionType === "planning.revise" ? workpad.nextAction : undefined;
      const confirmSource = workpad.nextAction.actionType === "planning.confirm-execution" ? workpad.nextAction : undefined;
      actions.push({
        ...reviseSource,
        id: `agent-workspace:planning.revise:${topic.id}:${bundle.id}`,
        label: "让 planning-agent 修改方案",
        kind: "workflow-action",
        actionType: "planning.revise",
        changeId: topic.id,
        planningBundleId: bundle.id,
        enabled: true,
        requiresConfirmation: false,
      }, {
        ...confirmSource,
        id: `agent-workspace:planning.confirm-execution:${topic.id}:${bundle.id}`,
        label: "实施此计划",
        kind: "workflow-action",
        actionType: "planning.confirm-execution",
        changeId: topic.id,
        planningBundleId: bundle.id,
        enabled: true,
        requiresConfirmation: true,
      });
    }
  }

  return {
    id: "planning-agent",
    roleId: "planning-agent",
    label: "planning-agent",
    status: bundle?.status ?? (workpad.nextAction.actionType === "planning.generate" ? "waiting-user" : "idle"),
    summary: bundle ? (bundle.status === "confirmed" ? "方案已实施，主 Agent 可以继续推进执行边界。" : "方案草案等待反馈或实施。") : "等待生成方案草案。",
    inputSummary: topic?.title,
    outputSummary: bundle?.goal,
    transcript: transcript("planning-agent", cells),
    evidenceRefs: bundle?.artifact ? [{ label: "方案草案", ref: bundle.artifact, kind: "artifact" }] : [],
    actions,
    planningBundle: bundle,
  };
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

function planningBundleText(bundle: WorkbenchPlanningArtifactBundle): string {
  if (bundle.proposedPlanMd?.trim()) return bundle.proposedPlanMd.trim();
  const sections = [
    `目标\n${bundle.goal}`,
    bundle.constraints.length ? `约束\n${bundle.constraints.map((item) => `- ${item}`).join("\n")}` : "",
    bundle.acceptanceCriteria.length ? `验收标准\n${bundle.acceptanceCriteria.map((item) => `- ${item}`).join("\n")}` : "",
    bundle.design ? `实现方案\n${bundle.design}` : "",
    bundle.tasks.length ? `任务\n${bundle.tasks.map((task) => `- ${task.id}: ${task.title}`).join("\n")}` : "",
    bundle.risks.length ? `风险\n${bundle.risks.map((item) => `- ${item}`).join("\n")}` : "",
    bundle.openQuestions.length ? `待确认\n${bundle.openQuestions.map((item) => `- ${item}`).join("\n")}` : "",
  ].filter(Boolean);
  return sections.join("\n\n");
}

function roleLabel(roleId: string): string {
  if (roleId === "main-agent") return "主 Agent";
  if (roleId === "planning-agent") return "planning-agent";
  if (roleId === "coder-agent" || roleId === "coder") return "coder-agent";
  if (roleId === "validator") return "validator";
  if (roleId === "auditor-agent" || roleId === "auditor") return "auditor-agent";
  if (roleId === "rework-coder") return "rework-coder";
  return roleId;
}
