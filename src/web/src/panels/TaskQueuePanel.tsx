import type { ReactElement } from "react";
import { workflowActionPayloadFromScope } from "../workflow-actions.js";

type QueueActionScope = {
  actionType?: string;
  enabled: boolean;
  label: string;
  disabledReason?: string;
  changeId?: string;
  proposalId?: string;
  decompositionPlanId?: string;
  readinessManifestId?: string;
  taskQueueProposalId?: string;
  workflowGraphPlanId?: string;
  workflowRunId?: string;
  queueRunId?: string;
  taskIds?: string[];
  taskRunId?: string;
  worktreeId?: string;
  worktreeIds?: string[];
  applyCheckId?: string;
  landingPackageId?: string;
  remoteLandingResultId?: string;
};

type QueueSummary = {
  id: string;
  status: string;
  currentTaskId?: string;
  pausedReason?: string;
  blockedReason?: string;
  failureReason?: string;
  completedCount: number;
  totalCount: number;
  nextAction?: QueueActionScope;
  items: Array<{ id: string; order: number; taskId: string; status: string }>;
};

export function TaskQueuePanel({
  queue,
  busy,
  onWorkflowAction,
  onSelectDecisionContext,
  humanStatus,
  userFacingText,
}: {
  queue: QueueSummary;
  busy: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
  humanStatus: (value: string) => string;
  userFacingText: (value: string) => string;
}): ReactElement {
  const action = queue.nextAction;
  const disabled = busy || !action?.enabled || !action.actionType;
  const blockerContextId = ["blocked", "failed"].includes(queue.status) ? `queue:${queue.id}:blocked` : null;
  const showQueueAction = action && !["blocked", "failed"].includes(queue.status);
  const runningCopy = queue.status === "running"
    ? `当前任务 ${queue.currentTaskId ?? "待确定"}`
    : queue.status === "paused"
      ? userFacingText(queue.pausedReason ?? "任务已暂停，等待继续。")
      : queue.status === "blocked"
        ? userFacingText(queue.blockedReason ?? "任务暂停，需要修改或补证据。")
        : queue.status === "failed"
          ? userFacingText(queue.failureReason ?? "任务执行未通过。")
          : queue.status === "completed"
            ? "队列已完成，等待查看 evidence 与后续人工 gate。"
            : "本地顺序执行已确认任务。";
  function runQueueAction(): void {
    if (!action?.actionType || disabled) return;
    void onWorkflowAction(action.actionType, workflowActionPayloadFromScope(action));
  }
  return (
    <div className={`task-queue-panel ${queue.status}`} data-testid="task-queue-panel">
      <div className="task-queue-summary">
        <div>
          <strong>本地顺序执行</strong>
          <span>{humanStatus(queue.status)} · {queue.completedCount}/{queue.totalCount}</span>
        </div>
        {showQueueAction ? (
          <button
            className="secondary-button"
            type="button"
            disabled={disabled}
            title={action.disabledReason}
            onClick={runQueueAction}
          >
            {userFacingText(action.label)}
          </button>
        ) : null}
      </div>
      <p>{runningCopy}</p>
      {blockerContextId ? (
        <button className="context-link" type="button" onClick={() => onSelectDecisionContext(blockerContextId)}>
          查看当前决策
        </button>
      ) : null}
      {queue.items.length > 0 ? (
        <div className="task-queue-items" aria-label="Task queue items">
          {queue.items.map((item) => (
            <span key={item.id} className={`task-queue-item ${item.status}`}>
              {item.order}. {item.taskId} · {humanStatus(item.status)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
