import { Maximize2, Minus, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import type { AgentRelationGraph } from "../../types.js";
import {
  ORCHESTRATION_NODE_HEIGHT,
  ORCHESTRATION_NODE_WIDTH,
  layoutAgentOrchestrationGraph,
  type AgentOrchestrationLayoutNode,
} from "./agentOrchestrationLayout.js";

export function AgentOrchestrationMap({
  graph,
  selectedNodeId,
  onSelectNode,
}: {
  graph: AgentRelationGraph;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string) => void;
}): ReactElement {
  const layout = useMemo(() => layoutAgentOrchestrationGraph(graph), [graph]);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0, panX: 0, panY: 0 });

  const fitToView = useCallback(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const availableW = Math.max(1, viewport.clientWidth - 48);
    const availableH = Math.max(1, viewport.clientHeight - 48);
    const nextZoom = Math.min(1.25, Math.max(0.35, Math.min(availableW / layout.width, availableH / layout.height)));
    setZoom(nextZoom);
    setPan({
      x: Math.max(24, (viewport.clientWidth - layout.width * nextZoom) / 2),
      y: Math.max(24, (viewport.clientHeight - layout.height * nextZoom) / 2),
    });
  }, [layout.height, layout.width]);

  useEffect(() => {
    fitToView();
  }, [fitToView, layout.topologyKey]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => fitToView());
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [fitToView]);

  const handleMouseDown = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const target = event.target as HTMLElement;
    if (target.closest("[data-agent-orchestration-card]") || target.closest("[data-agent-orchestration-control]")) return;
    setDragging(true);
    dragStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
  }, [pan.x, pan.y]);

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setPan({
      x: dragStart.current.panX + event.clientX - dragStart.current.x,
      y: dragStart.current.panY + event.clientY - dragStart.current.y,
    });
  }, [dragging]);

  const handleMouseUp = useCallback(() => {
    setDragging(false);
  }, []);

  const adjustZoom = useCallback((delta: number) => {
    setZoom((current) => Math.min(1.8, Math.max(0.35, Number((current + delta).toFixed(2)))));
  }, []);

  return (
    <div
      className={`agent-graph-canvas agent-orchestration-canvas ${dragging ? "dragging" : ""}`}
      data-testid="agent-relation-graph"
      ref={viewportRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="agent-orchestration-controls" data-agent-orchestration-control>
        <button type="button" aria-label="放大编排图" data-testid="agent-orchestration-zoom-in" onClick={() => adjustZoom(0.12)}>
          <Plus size={15} />
        </button>
        <button type="button" aria-label="缩小编排图" data-testid="agent-orchestration-zoom-out" onClick={() => adjustZoom(-0.12)}>
          <Minus size={15} />
        </button>
        <button type="button" aria-label="适应画布" data-testid="agent-orchestration-fit" onClick={fitToView}>
          <Maximize2 size={15} />
        </button>
      </div>
      <div
        className="agent-orchestration-stage"
        data-testid="agent-orchestration-map"
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        <svg className="agent-orchestration-edges" width={layout.width} height={layout.height} role="presentation">
          <defs>
            <marker id="agent-edge-arrow" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
              <path d="M 0 0 L 8 4 L 0 8 z" />
            </marker>
          </defs>
          {layout.edges.map((edge) => (
            <path
              key={edge.id}
              d={edge.path}
              className="agent-orchestration-edge solid primary"
              markerEnd="url(#agent-edge-arrow)"
              data-testid="agent-orchestration-edge"
            />
          ))}
        </svg>
        <div className="agent-orchestration-nodes">
          {layout.nodes.map((node) => (
            <AgentOrchestrationCard
              key={node.id}
              node={node}
              selected={selectedNodeId === node.id}
              onSelectNode={onSelectNode}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function AgentOrchestrationCard({
  node,
  selected,
  onSelectNode,
}: {
  node: AgentOrchestrationLayoutNode;
  selected: boolean;
  onSelectNode: (nodeId: string) => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={`agent-orchestration-card ${node.status} agent ${selected ? "selected" : ""}`}
      style={{
        left: node.x,
        top: node.y,
        width: ORCHESTRATION_NODE_WIDTH,
        height: ORCHESTRATION_NODE_HEIGHT,
      }}
      onClick={() => onSelectNode(node.id)}
      data-agent-orchestration-card
      data-testid={node.kind === "main-agent" ? "agent-relation-node-main-agent" : `agent-relation-node-${node.roleId}`}
    >
      <span className={`agent-orchestration-status ${node.status}`} aria-label={node.status} />
      <span className="agent-orchestration-card-main">
        <strong>{node.label}</strong>
        {node.status === "waiting-user" ? <span>需要你回答</span> : null}
      </span>
    </button>
  );
}
