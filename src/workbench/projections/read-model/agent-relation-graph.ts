import type { ManagedProject } from "../../../types/index.js";
import type { ParentAgentTranscript } from "../../parent-agent-transcript.js";
import type {
  AgentRelationGraph,
  AgentRelationGraphEdge,
  AgentRelationGraphNode,
  AgentRelationGraphNodeStatus,
  WorkbenchAgentWorkspaceAgent,
  WorkbenchConfirmationQueue,
  WorkbenchTopicDetail,
  WorkbenchWorkpad,
} from "../../read-model-types.js";

const USER_AGENT_ROLES = new Set([
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

export function emptyAgentRelationGraph(): AgentRelationGraph {
  return {
    title: "Agent 关系",
    summary: "真实 Agent 开始工作后，会在这里显示父子关系。",
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
  return {
    ...workpad,
    maintenance: undefined,
    intake: { ...workpad.intake, pendingClarifications: [] },
  };
}

export function buildAgentRelationGraph(input: {
  project: ManagedProject | null;
  selectedTopic: WorkbenchTopicDetail | null;
  workpad: WorkbenchWorkpad;
  confirmationQueue: WorkbenchConfirmationQueue;
  agents?: WorkbenchAgentWorkspaceAgent[];
  graphScopeId?: string;
  scopeChangeId?: string;
  mainNeedsInput?: boolean;
  waitingAgentSurfaceIds?: Set<string>;
}): AgentRelationGraph {
  const { project, selectedTopic } = input;
  if (!selectedTopic) return emptyAgentRelationGraph();
  const targetBase = {
    projectId: project?.id ?? null,
    conversationId: selectedTopic.kind === "conversation" ? selectedTopic.id : undefined,
    changeId: input.scopeChangeId,
  };
  const main: AgentRelationGraphNode = {
    id: "main-agent",
    kind: "main-agent",
    label: "主 Agent",
    roleId: "main-agent",
    status: input.mainNeedsInput ? "waiting-user" : graphStatus(input.workpad.conversationLifecycle),
    summary: "",
    target: { ...targetBase, agentSurfaceId: "main-agent" },
  };
  const agents = (input.agents ?? []).filter((agent) => USER_AGENT_ROLES.has(agent.roleId));
  const nodes = [main, ...agents.map((agent): AgentRelationGraphNode => ({
    id: agent.id,
    kind: "agent",
    label: agent.label,
    roleId: agent.roleId,
    providerId: agent.providerId,
    providerThreadId: agent.providerThreadId,
    parentAgentId: agent.parentAgentId,
    status: input.waitingAgentSurfaceIds?.has(agent.id) ? "waiting-user" : graphStatus(agent.status),
    summary: "",
    target: {
      ...targetBase,
      agentSurfaceId: agent.id,
    },
  }))];
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges: AgentRelationGraphEdge[] = agents.map((agent) => {
    const from = nodeIds.has(agent.parentAgentId) ? agent.parentAgentId : "main-agent";
    return {
      id: `agent-edge:${from}:${agent.id}`,
      from,
      to: agent.id,
      kind: "parent-child",
    };
  });
  return {
    graphScopeId: input.graphScopeId,
    conversationId: targetBase.conversationId ?? selectedTopic.id,
    changeId: targetBase.changeId,
    title: "Agent 关系",
    summary: agents.length ? `${agents.length + 1} 个真实 Agent` : "当前只有主 Agent",
    nodes,
    edges,
    updatedAt: selectedTopic.updatedAt,
  };
}

function graphStatus(status: string): AgentRelationGraphNodeStatus {
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
