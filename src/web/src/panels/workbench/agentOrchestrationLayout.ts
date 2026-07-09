import type {
  DemandAgentRunGraph,
  DemandAgentRunGraphEdge,
  DemandAgentRunGraphNode,
  DemandAgentRunGraphStage,
  DemandAgentRunGraphVisualKind,
} from "../../types.js";

export const ORCHESTRATION_NODE_WIDTH = 220;
export const ORCHESTRATION_NODE_HEIGHT = 108;
export const ORCHESTRATION_GAP_X = 54;
export const ORCHESTRATION_GAP_Y = 94;
export const ORCHESTRATION_PADDING = 72;

export type AgentOrchestrationLayoutNode = DemandAgentRunGraphNode & {
  x: number;
  y: number;
  stage: DemandAgentRunGraphStage;
  visualKind: DemandAgentRunGraphVisualKind;
};

export type AgentOrchestrationLayoutEdge = DemandAgentRunGraphEdge & {
  path: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

export interface AgentOrchestrationLayout {
  width: number;
  height: number;
  nodes: AgentOrchestrationLayoutNode[];
  edges: AgentOrchestrationLayoutEdge[];
}

const stageOrder: DemandAgentRunGraphStage[] = [
  "demand",
  "planning",
  "execution",
  "validation",
  "review",
  "integration",
  "landing",
  "terminal",
  "maintenance",
];

const stageRank = new Map(stageOrder.map((stage, index) => [stage, index] as const));

export function layoutAgentOrchestrationGraph(graph: DemandAgentRunGraph): AgentOrchestrationLayout {
  if (graph.nodes.length === 0) {
    return { width: 760, height: 460, nodes: [], edges: [] };
  }

  const order = graphNodeOrder(graph);
  const nodesByStage = new Map<DemandAgentRunGraphStage, AgentOrchestrationLayoutNode[]>();
  for (const node of graph.nodes) {
    const stage = node.stage ?? stageForNode(node);
    const visualKind = node.visualKind ?? visualKindForNode(node);
    const bucket = nodesByStage.get(stage) ?? [];
    bucket.push({ ...node, stage, visualKind, x: 0, y: 0 });
    nodesByStage.set(stage, bucket);
  }

  const activeStages = stageOrder.filter((stage) => (nodesByStage.get(stage)?.length ?? 0) > 0);
  let maxRowWidth = ORCHESTRATION_NODE_WIDTH;
  const layoutNodes: AgentOrchestrationLayoutNode[] = [];

  activeStages.forEach((stage, rowIndex) => {
    const row = [...(nodesByStage.get(stage) ?? [])].sort((a, b) => {
      const orderA = order.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const orderB = order.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (orderA !== orderB) return orderA - orderB;
      return a.id.localeCompare(b.id);
    });
    const rowWidth = row.length * ORCHESTRATION_NODE_WIDTH + Math.max(0, row.length - 1) * ORCHESTRATION_GAP_X;
    maxRowWidth = Math.max(maxRowWidth, rowWidth);
    const startX = ORCHESTRATION_PADDING + (maxRowWidth - rowWidth) / 2;
    const y = ORCHESTRATION_PADDING + rowIndex * (ORCHESTRATION_NODE_HEIGHT + ORCHESTRATION_GAP_Y);
    row.forEach((node, index) => {
      node.x = startX + index * (ORCHESTRATION_NODE_WIDTH + ORCHESTRATION_GAP_X);
      node.y = y;
      layoutNodes.push(node);
    });
  });

  const width = Math.ceil(maxRowWidth + ORCHESTRATION_PADDING * 2);
  const height = Math.ceil(activeStages.length * ORCHESTRATION_NODE_HEIGHT + Math.max(0, activeStages.length - 1) * ORCHESTRATION_GAP_Y + ORCHESTRATION_PADDING * 2);
  const nodeById = new Map(layoutNodes.map((node) => [node.id, node] as const));
  const layoutEdges = graph.edges.flatMap((edge): AgentOrchestrationLayoutEdge[] => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    if (!from || !to) return [];
    const fromX = from.x + ORCHESTRATION_NODE_WIDTH / 2;
    const fromY = from.y + ORCHESTRATION_NODE_HEIGHT;
    const toX = to.x + ORCHESTRATION_NODE_WIDTH / 2;
    const toY = to.y;
    return [{ ...edge, fromX, fromY, toX, toY, path: edgePath(from, to, edge) }];
  });

  return { width, height, nodes: layoutNodes, edges: layoutEdges };
}

export function stageForNode(node: Pick<DemandAgentRunGraphNode, "kind" | "lane">): DemandAgentRunGraphStage {
  if (node.lane === "maintenance") return "maintenance";
  if (node.kind === "main-agent") return "demand";
  if (node.kind === "planning-agent") return "planning";
  if (["coder-agent", "rework-coder", "delegate-task", "tool-policy-gate", "scheduler-worker"].includes(node.kind)) return "execution";
  if (node.kind === "validator" || node.kind === "boundary-audit") return "validation";
  if (node.kind === "auditor-agent" || node.kind === "result-review") return "review";
  if (["integration-check", "integration-fix-agent", "scheduler-integration-candidate", "scheduler-completion"].includes(node.kind)) return "integration";
  if (["merge-reviewer-agent", "pr-draft-adapter", "pr-feedback-sweep", "pr-review-handoff", "remote-landing", "post-merge-sync", "remote-branch-cleanup"].includes(node.kind)) return "landing";
  if (node.kind === "terminal-gate" || node.kind === "memory-closeout") return "terminal";
  return "execution";
}

export function visualKindForNode(node: Pick<DemandAgentRunGraphNode, "kind">): DemandAgentRunGraphVisualKind {
  if (["main-agent", "planning-agent", "coder-agent", "rework-coder", "auditor-agent"].includes(node.kind)) return "agent";
  if (node.kind === "scheduler-worker") return "worker";
  if (["validator", "tool-policy-gate", "boundary-audit"].includes(node.kind)) return "tool";
  if (["result-review", "integration-check", "integration-fix-agent", "scheduler-integration-candidate", "scheduler-completion", "merge-reviewer-agent"].includes(node.kind)) return "review";
  if (node.kind === "terminal-gate" || node.kind === "memory-closeout") return "terminal";
  if (node.kind.includes("pr") || node.kind.includes("remote") || node.kind.includes("merge")) return "gate";
  return "default";
}

function graphNodeOrder(graph: DemandAgentRunGraph): Map<string, number> {
  const rank = new Map(graph.nodes.map((node, index) => [node.id, index] as const));
  for (const edge of graph.edges) {
    const fromRank = rank.get(edge.from);
    const toRank = rank.get(edge.to);
    if (fromRank === undefined || toRank === undefined) continue;
    if (fromRank + 0.1 < toRank) continue;
    rank.set(edge.to, fromRank + 0.1);
  }
  return rank;
}

function edgePath(from: AgentOrchestrationLayoutNode, to: AgentOrchestrationLayoutNode, edge: DemandAgentRunGraphEdge): string {
  const fromX = from.x + ORCHESTRATION_NODE_WIDTH / 2;
  const fromY = from.y + ORCHESTRATION_NODE_HEIGHT;
  const toX = to.x + ORCHESTRATION_NODE_WIDTH / 2;
  const toY = to.y;
  const isBackEdge = (stageRank.get(to.stage) ?? 0) <= (stageRank.get(from.stage) ?? 0);
  if (edge.edgeStyle === "loop" || edge.edgeRole === "rework" || isBackEdge) {
    const side = Math.max(from.x, to.x) + ORCHESTRATION_NODE_WIDTH + 34;
    return `M ${fromX} ${fromY} C ${side} ${fromY + 22}, ${side} ${toY - 22}, ${toX} ${toY}`;
  }
  const midY = fromY + Math.max(32, (toY - fromY) / 2);
  return `M ${fromX} ${fromY} V ${midY} H ${toX} V ${toY}`;
}
