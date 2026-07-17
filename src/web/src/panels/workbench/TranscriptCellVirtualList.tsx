import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { calculateTranscriptVirtualRange } from "./TranscriptVirtualList.js";
import { estimateTranscriptCellHeight } from "./transcriptMeasurement.js";
import type { ParentAgentTranscriptCell } from "../../types.js";

const TRANSCRIPT_VIRTUALIZATION_THRESHOLD = 80;

export function TranscriptCellVirtualList({
  cells,
  scrollContainerRef,
  className,
  testId,
  emptyMessage,
  groupedByTurn = false,
  renderCell,
}: {
  cells: ParentAgentTranscriptCell[];
  scrollContainerRef?: RefObject<HTMLElement | null>;
  className: string;
  testId: string;
  emptyMessage: string;
  groupedByTurn?: boolean;
  renderCell: (cell: ParentAgentTranscriptCell, expanded: boolean, onToggleExpanded: () => void) => ReactNode;
}): ReactElement {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [expandedCells, setExpandedCells] = useState<Set<string>>(new Set());
  const virtualization = useTranscriptVirtualization({ cells, expandedCells, listRef, scrollContainerRef, groupedByTurn });

  return (
    <div ref={listRef} className={className} data-testid={testId}>
      {cells.length === 0 ? <div className="empty-state">{emptyMessage}</div> : null}
      {virtualization.topSpacer > 0 ? <div className="transcript-virtual-spacer" style={{ height: virtualization.topSpacer }} /> : null}
      {virtualization.visibleCells.map((cell, visibleIndex) => {
        const cellIndex = virtualization.start + visibleIndex;
        const previous = cellIndex > 0 ? cells[cellIndex - 1] : undefined;
        const boundaryClass = groupedByTurn
          ? sameProviderTurn(previous, cell) ? "transcript-same-turn" : "transcript-turn-boundary"
          : undefined;
        return (
          <div key={cell.id} data-transcript-cell-id={cell.id} className={boundaryClass}>
            {renderCell(cell, expandedCells.has(cell.id), () => {
                virtualization.forgetMeasurement(cell.id);
                setExpandedCells((current) => {
                  const next = new Set(current);
                  if (next.has(cell.id)) next.delete(cell.id);
                  else next.add(cell.id);
                  return next;
                });
              })}
          </div>
        );
      })}
      {virtualization.bottomSpacer > 0 ? <div className="transcript-virtual-spacer" style={{ height: virtualization.bottomSpacer }} /> : null}
    </div>
  );
}

function useTranscriptVirtualization({
  cells,
  expandedCells,
  listRef,
  scrollContainerRef,
  groupedByTurn,
}: {
  cells: ParentAgentTranscriptCell[];
  expandedCells: Set<string>;
  listRef: RefObject<HTMLDivElement | null>;
  scrollContainerRef?: RefObject<HTMLElement | null>;
  groupedByTurn: boolean;
}) {
  const [measuredCellHeights, setMeasuredCellHeights] = useState<Record<string, number>>({});
  const [scrollMetrics, setScrollMetrics] = useState({ scrollTop: 0, viewportHeight: 720, listWidth: 760 });
  const heights = useMemo(() => cells.map((cell, index) => (
    measuredCellHeights[cell.id] ?? estimateTranscriptCellHeight(cell, {
      expanded: expandedCells.has(cell.id),
      width: scrollMetrics.listWidth,
    })
  ) + (groupedByTurn && index > 0 ? sameProviderTurn(cells[index - 1], cell) ? 8 : 20 : 0)), [
    cells,
    expandedCells,
    groupedByTurn,
    measuredCellHeights,
    scrollMetrics.listWidth,
  ]);
  const range = useMemo(() => cells.length <= TRANSCRIPT_VIRTUALIZATION_THRESHOLD
    ? { start: 0, end: cells.length, topSpacer: 0, bottomSpacer: 0 }
    : calculateTranscriptVirtualRange({
      heights,
      scrollTop: scrollMetrics.scrollTop,
      viewportHeight: scrollMetrics.viewportHeight,
      overscan: 10,
    }), [cells.length, heights, scrollMetrics.scrollTop, scrollMetrics.viewportHeight]);
  const visibleCells = cells.slice(range.start, range.end);
  const visibleCellIds = visibleCells.map((cell) => cell.id).join("|");

  useEffect(() => {
    const currentIds = new Set(cells.map((cell) => cell.id));
    setMeasuredCellHeights((current) => {
      const entries = Object.entries(current).filter(([id]) => currentIds.has(id));
      return entries.length === Object.keys(current).length ? current : Object.fromEntries(entries);
    });
  }, [cells]);

  useEffect(() => {
    const root = listRef.current;
    if (!root || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      setMeasuredCellHeights((current) => {
        let changed = false;
        const next = { ...current };
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).dataset.transcriptCellId;
          const height = Math.ceil(entry.contentRect.height);
          if (id && height > 0 && next[id] !== height) {
            next[id] = height;
            changed = true;
          }
        }
        return changed ? next : current;
      });
    });
    root.querySelectorAll<HTMLElement>("[data-transcript-cell-id]").forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [listRef, visibleCellIds]);

  useEffect(() => {
    const resolvedNode = scrollContainerRef?.current ?? listRef.current?.parentElement;
    if (!resolvedNode) return;
    const node = resolvedNode;
    function updateMetrics(): void {
      setScrollMetrics({
        scrollTop: node.scrollTop,
        viewportHeight: node.clientHeight || 720,
        listWidth: Math.max(320, node.clientWidth - 80),
      });
    }
    updateMetrics();
    node.addEventListener("scroll", updateMetrics);
    window.addEventListener("resize", updateMetrics);
    return () => {
      node.removeEventListener("scroll", updateMetrics);
      window.removeEventListener("resize", updateMetrics);
    };
  }, [listRef, scrollContainerRef]);

  return {
    ...range,
    visibleCells,
    forgetMeasurement(cellId: string) {
      setMeasuredCellHeights((current) => {
        if (!(cellId in current)) return current;
        const next = { ...current };
        delete next[cellId];
        return next;
      });
    },
  };
}

function sameProviderTurn(previous: ParentAgentTranscriptCell | undefined, current: ParentAgentTranscriptCell): boolean {
  return Boolean(previous?.threadId && previous.turnId && current.threadId && current.turnId
    && previous.threadId === current.threadId
    && previous.turnId === current.turnId);
}
