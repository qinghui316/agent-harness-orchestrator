import type { ManagedProject } from "../../../types/index.js";
import type { ParentAgentTranscript } from "../../parent-agent-transcript.js";
import type {
  DemandAgentRunGraph,
  DemandAgentRunGraphEdge,
  DemandAgentRunGraphNode,
  DemandAgentRunGraphNodeKind,
  DemandAgentRunGraphNodeStatus,
  WorkbenchAgentWorkspaceAgent,
  WorkbenchConfirmationQueue,
  WorkbenchTopicDetail,
  WorkbenchWorkpad,
} from "../../read-model-types.js";

export function emptyAgentRunGraph(): DemandAgentRunGraph {
  return {
    title: "Agent 关系",
    summary: "真实 Agent 开始工作后，会在这里显示父子关系。",
    lanes: agentGraphLanes(),
    nodes: [],
    edges: [],
  };
}

export function emptyParentAgentTranscript(): ParentAgentTranscript {
  return {
    title: "需求对话",
    cells: [],
    items: [],
    emptyMessage: "打开对话后会加载运行时 transcript。",
  };
}

export function shellWorkbenchWorkpad(workpad: WorkbenchWorkpad): WorkbenchWorkpad {
  return { ...workpad, maintenance: undefined };
}

export function buildDemandAgentRunGraph(input: {
  project: ManagedProject | null;
  selectedTopic: WorkbenchTopicDetail | null;
  workpad: WorkbenchWorkpad;
  confirmationQueue: WorkbenchConfirmationQueue;
  agents?: WorkbenchAgentWorkspaceAgent[];
}): DemandAgentRunGraph {
  const { project, selectedTopic } = input;
  if (!selectedTopic) return emptyAgentRunGraph();
  const targetBase = {
    projectId: project?.id ?? null,
    conversationId: selectedTopic.kind === "conversation" ? selectedTopic.id : undefined,
    changeId: selectedTopic.boundChangeId ?? (selectedTopic.kind === "change" ? selectedTopic.id : undefined),
  };
  const main: DemandAgentRunGraphNode = {
    id: "main-agent",
    kind: "main-agent",
    lane: "main",
    label: "主 Agent",
    roleId: "main-agent",
    status: graphStatus(input.workpad.conversationLifecycle),
    summary: "",
    reason: "",
    target: { ...targetBase, roleId: "main-agent", agentSurfaceId: "main-agent" },
    visualKind: "agent",
    evidenceRefs: [],
    attempts: [],
  };
  const agents = (input.agents ?? []).filter((agent) => agent.roleId !== "main-agent" && agent.roleId !== "validator");
  const nodes = [main, ...agents.map((agent): DemandAgentRunGraphNode => ({
    id: agent.id,
    kind: graphKind(agent.roleId),
    lane: "roles",
    label: agent.label,
    roleId: agent.roleId,
    status: graphStatus(agent.status),
    summary: "",
    reason: "",
    target: {
      ...targetBase,
      roleId: agent.roleId,
      agentSurfaceId: agent.id,
      providerThreadId: agent.providerThreadId,
      parentThreadId: agent.parentThreadId,
      runId: agent.runId,
    },
    visualKind: "agent",
    evidenceRefs: [],
    attempts: [],
  }))];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: DemandAgentRunGraphEdge[] = agents.map((agent) => {
    const parentSurface = agent.parentThreadId ? `thread:${agent.parentThreadId}` : "main-agent";
    const from = nodeIds.has(parentSurface) ? parentSurface : "main-agent";
    return {
      id: `agent-edge:${from}:${agent.id}`,
      from,
      to: agent.id,
      kind: "delegates",
      label: "",
      edgeStyle: "solid",
      edgeRole: "primary",
    };
  });
  return {
    conversationId: targetBase.conversationId ?? selectedTopic.id,
    changeId: targetBase.changeId,
    title: "Agent 关系",
    summary: agents.length ? `${agents.length + 1} 个真实 Agent` : "当前只有主 Agent",
    lanes: agentGraphLanes(),
    nodes,
    edges,
    updatedAt: selectedTopic.updatedAt,
  };
}

function agentGraphLanes(): DemandAgentRunGraph["lanes"] {
  return [
    { id: "main", label: "主 Agent", description: "当前需求对话" },
    { id: "roles", label: "子 Agent", description: "真实创建的 Agent" },
  ];
}

function graphKind(roleId: string): DemandAgentRunGraphNodeKind {
  if (roleId === "planning-agent") return "planning-agent";
  if (roleId === "coder-agent") return "coder-agent";
  if (roleId === "rework-coder") return "rework-coder";
  if (roleId === "auditor-agent") return "auditor-agent";
  if (roleId === "memory-maintenance-agent") return "documentation-agent";
  if (roleId === "harness-evolution-agent") return "evolution-agent";
  if (roleId === "evolution-scorer") return "evolution-scorer";
  return "delegate-task";
}

function graphStatus(status: string): DemandAgentRunGraphNodeStatus {
  const normalized = status.toLowerCase();
  if (normalized.includes("running") || normalized.includes("claimed")) return "running";
  if (normalized.includes("queue") || normalized.includes("pending")) return "queued";
  if (normalized.includes("complete") || normalized.includes("pass") || normalized.includes("approve")) return "completed";
  if (normalized.includes("wait") || normalized.includes("user")) return "waiting-user";
  if (normalized.includes("block") || normalized.includes("change")) return "needs-change";
  if (normalized.includes("fail") || normalized.includes("error")) return "failed";
  if (normalized.includes("cancel") || normalized.includes("skip")) return "skipped";
  return "idle";
}
