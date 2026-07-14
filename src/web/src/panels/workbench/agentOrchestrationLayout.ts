import type {
  DemandAgentRunGraph,
  DemandAgentRunGraphEdge,
  DemandAgentRunGraphNode,
  DemandAgentRunGraphStage,
  DemandAgentRunGraphVisualKind,
} from "../../types.js";

export const ORCHESTRATION_NODE_WIDTH = 200;
export const ORCHESTRATION_NODE_HEIGHT = 56;
export const ORCHESTRATION_GAP_X = 54;
export const ORCHESTRATION_GAP_Y = 72;
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
  topologyKey: string;
  nodes: AgentOrchestrationLayoutNode[];
  edges: AgentOrchestrationLayoutEdge[];
}

export function layoutAgentOrchestrationGraph(graph: DemandAgentRunGraph): AgentOrchestrationLayout {
  const topologyKey = graphTopologyKey(graph);
  if (graph.nodes.length === 0) {
    return { width: 760, height: 460, topologyKey, nodes: [], edges: [] };
  }

  const sortedNodes = [...graph.nodes].sort(compareNodes);
  const nodeIds = new Set(sortedNodes.map((node) => node.id));
  const root = sortedNodes.find((node) => node.kind === "main-agent") ?? sortedNodes[0];
  const parentByChild = new Map<string, string>();
  for (const edge of [...graph.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.from === edge.to || parentByChild.has(edge.to)) continue;
    parentByChild.set(edge.to, edge.from);
  }

  const depths = new Map<string, number>([[root.id, 0]]);
  propagateDepths(sortedNodes, parentByChild, depths);
  for (const node of sortedNodes) {
    if (depths.has(node.id)) continue;
    depths.set(node.id, 1);
    propagateDepths(sortedNodes, parentByChild, depths);
  }

  const rows = new Map<number, AgentOrchestrationLayoutNode[]>();
  for (const node of sortedNodes) {
    const depth = depths.get(node.id) ?? 1;
    const row = rows.get(depth) ?? [];
    row.push({
      ...node,
      stage: node.stage ?? stageForNode(node),
      visualKind: node.visualKind ?? visualKindForNode(node),
      x: 0,
      y: 0,
    });
    rows.set(depth, row);
  }

  const orderedRows = [...rows.entries()].sort(([a], [b]) => a - b);
  const maxRowWidth = Math.max(...orderedRows.map(([, row]) => row.length * ORCHESTRATION_NODE_WIDTH + Math.max(0, row.length - 1) * ORCHESTRATION_GAP_X));
  const layoutNodes: AgentOrchestrationLayoutNode[] = [];
  for (const [depth, row] of orderedRows) {
    row.sort(compareNodes);
    const rowWidth = row.length * ORCHESTRATION_NODE_WIDTH + Math.max(0, row.length - 1) * ORCHESTRATION_GAP_X;
    const startX = ORCHESTRATION_PADDING + (maxRowWidth - rowWidth) / 2;
    row.forEach((node, index) => {
      node.x = startX + index * (ORCHESTRATION_NODE_WIDTH + ORCHESTRATION_GAP_X);
      node.y = ORCHESTRATION_PADDING + depth * (ORCHESTRATION_NODE_HEIGHT + ORCHESTRATION_GAP_Y);
      layoutNodes.push(node);
    });
  }

  const width = Math.ceil(maxRowWidth + ORCHESTRATION_PADDING * 2);
  const maxDepth = Math.max(...depths.values());
  const height = Math.ceil((maxDepth + 1) * ORCHESTRATION_NODE_HEIGHT + maxDepth * ORCHESTRATION_GAP_Y + ORCHESTRATION_PADDING * 2);
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

  return { width, height, topologyKey, nodes: layoutNodes, edges: layoutEdges };
}

export function stageForNode(node: Pick<DemandAgentRunGraphNode, "kind" | "lane">): DemandAgentRunGraphStage {
  if (node.lane === "maintenance") return "maintenance";
  if (node.kind === "main-agent") return "demand";
  if (node.kind === "planning-agent") return "planning";
  if (node.kind === "auditor-agent") return "review";
  return "execution";
}

export function visualKindForNode(node: Pick<DemandAgentRunGraphNode, "kind">): DemandAgentRunGraphVisualKind {
  if (["main-agent", "planning-agent", "coder-agent", "rework-coder", "auditor-agent", "delegate-task", "documentation-agent", "evolution-agent", "evolution-scorer"].includes(node.kind)) return "agent";
  return "default";
}

function propagateDepths(nodes: DemandAgentRunGraphNode[], parentByChild: Map<string, string>, depths: Map<string, number>): void {
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const node of nodes) {
      if (depths.has(node.id)) continue;
      const parent = parentByChild.get(node.id);
      const parentDepth = parent ? depths.get(parent) : undefined;
      if (parentDepth === undefined) continue;
      depths.set(node.id, parentDepth + 1);
      changed = true;
    }
    if (!changed) break;
  }
}

function compareNodes(a: DemandAgentRunGraphNode, b: DemandAgentRunGraphNode): number {
  if (a.kind === "main-agent" && b.kind !== "main-agent") return -1;
  if (b.kind === "main-agent" && a.kind !== "main-agent") return 1;
  return a.id.localeCompare(b.id);
}

function graphTopologyKey(graph: DemandAgentRunGraph): string {
  return `${graph.nodes.map((node) => node.id).sort().join("|")}::${graph.edges.map((edge) => `${edge.from}>${edge.to}`).sort().join("|")}`;
}

function edgePath(from: AgentOrchestrationLayoutNode, to: AgentOrchestrationLayoutNode, edge: DemandAgentRunGraphEdge): string {
  const fromX = from.x + ORCHESTRATION_NODE_WIDTH / 2;
  const fromY = from.y + ORCHESTRATION_NODE_HEIGHT;
  const toX = to.x + ORCHESTRATION_NODE_WIDTH / 2;
  const toY = to.y;
  if (edge.edgeStyle === "loop" || edge.edgeRole === "rework" || toY <= fromY) {
    const side = Math.max(from.x, to.x) + ORCHESTRATION_NODE_WIDTH + 34;
    return `M ${fromX} ${fromY} C ${side} ${fromY + 22}, ${side} ${toY - 22}, ${toX} ${toY}`;
  }
  const midY = fromY + Math.max(32, (toY - fromY) / 2);
  return `M ${fromX} ${fromY} V ${midY} H ${toX} V ${toY}`;
}
