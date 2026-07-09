import { useState, type ReactElement } from "react";
import { Check, FileText, X } from "lucide-react";
import { confirmationKindLabel, decisionKindLabel, formatTime, userFacingText, userStatusLabel } from "../../formatters.js";
import type { ConfirmationQueue, ConfirmationQueueItem, DecisionAction, DecisionContext, DecisionInspector } from "../../types.js";
import { artifactName } from "./RunReplayPanel.js";

export function DecisionInspectorPane({
  inspector,
  confirmationQueue,
  confirming,
  busy,
  error,
  onConfirmingChange,
  onExecuteAction,
  onFeedback,
  onSelectContext,
}: {
  inspector: DecisionInspector;
  confirmationQueue: ConfirmationQueue;
  confirming: string | null;
  busy: boolean;
  error: string | null;
  onConfirmingChange: (id: string | null) => void;
  onExecuteAction: (action: DecisionAction, context: DecisionContext) => Promise<void>;
  onFeedback: (context: DecisionContext, action: DecisionAction, feedback: string) => Promise<void>;
  onSelectContext: (id: string | null) => void;
}): ReactElement {
  const primaryQueueItem = confirmationQueue.primary;
  return (
    <>
      <div className="approval-header">
        <h2>需要你确认</h2>
        <span>{primaryQueueItem ? 1 : 0}</span>
      </div>
      {error ? <div className="error-box">{error}</div> : null}
      {!primaryQueueItem ? (
        <div className="approval-empty">
          <h3>暂无需要确认</h3>
          <p>执行过程、证据和后台维护不会堆在这里；只有需要你做决定的事项会出现。</p>
        </div>
      ) : (
        <ConfirmationQueueCard
          item={primaryQueueItem}
          confirming={confirming}
          busy={busy}
          onConfirmingChange={onConfirmingChange}
          onExecuteAction={onExecuteAction}
          onFeedback={onFeedback}
        />
      )}
      {confirmationQueue.otherDemands.length > 0 ? (
        <section className="decision-related">
          <div className="approval-header compact">
            <h2>其他需求等你确认</h2>
            <span>{confirmationQueue.otherDemands.length}</span>
          </div>
          {confirmationQueue.otherDemands.map((item) => (
            <button className="decision-row" key={item.id} onClick={() => item.changeId ? onSelectContext(`confirm:${item.changeId}`) : undefined}>
              <strong>{userFacingText(item.whyNeedsConfirmation)}</strong>
              <span>{confirmationKindLabel(item.kind)} · {userFacingText(item.summary)}</span>
            </button>
          ))}
        </section>
      ) : null}
      {confirmationQueue.maintenance.length > 0 ? (
        <section className="decision-related">
          <div className="approval-header compact">
            <h2>后台维护确认</h2>
            <span>{confirmationQueue.maintenance.length}</span>
          </div>
          {confirmationQueue.maintenance.map((item) => (
            <ConfirmationQueueCard
              key={item.id}
              item={item}
              confirming={confirming}
              busy={busy}
              onConfirmingChange={onConfirmingChange}
              onExecuteAction={onExecuteAction}
              onFeedback={onFeedback}
            />
          ))}
        </section>
      ) : null}
      <DecisionContextHistory contexts={inspector.history} onSelectContext={onSelectContext} />
    </>
  );
}

function ConfirmationQueueCard({
  item,
  confirming,
  busy,
  onConfirmingChange,
  onExecuteAction,
  onFeedback,
}: {
  item: ConfirmationQueueItem;
  confirming: string | null;
  busy: boolean;
  onConfirmingChange: (id: string | null) => void;
  onExecuteAction: (action: DecisionAction, context: DecisionContext) => Promise<void>;
  onFeedback: (context: DecisionContext, action: DecisionAction, feedback: string) => Promise<void>;
}): ReactElement {
  const context = confirmationItemToDecisionContext(item);
  return (
    <DecisionContextCard
      context={context}
      confirming={confirming}
      busy={busy}
      onConfirmingChange={onConfirmingChange}
      onExecuteAction={onExecuteAction}
      onFeedback={onFeedback}
    />
  );
}

function confirmationItemToDecisionContext(item: ConfirmationQueueItem): DecisionContext {
  return {
    id: item.id,
    kind: item.kind,
    title: item.whyNeedsConfirmation,
    summary: item.summary,
    resultSummary: item.summary,
    recommendation: item.confirmEffect,
    explanation: item.riskSummary,
    severity: item.status === "failed" ? "blocking" : "info",
    changeId: item.changeId ?? item.conversationId,
    runId: item.runId,
    targetId: item.worktreeId ?? item.applyCheckId ?? item.resultId,
    artifact: item.evidenceRefs[0],
    evidenceRefs: item.evidenceRefs,
    actions: item.actions,
    userStatus: "waiting-confirmation",
  };
}

function DecisionContextCard({
  context,
  confirming,
  busy,
  onConfirmingChange,
  onExecuteAction,
  onFeedback,
}: {
  context: DecisionContext;
  confirming: string | null;
  busy: boolean;
  onConfirmingChange: (id: string | null) => void;
  onExecuteAction: (action: DecisionAction, context: DecisionContext) => Promise<void>;
  onFeedback: (context: DecisionContext, action: DecisionAction, feedback: string) => Promise<void>;
}): ReactElement {
  const [feedbackActionId, setFeedbackActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const feedbackAction = context.actions.find((action) => action.id === feedbackActionId);
  const actionBusy = busy || pendingActionId !== null;
  async function executeAction(action: DecisionAction): Promise<void> {
    if (!action.enabled || actionBusy) return;
    setPendingActionId(action.id);
    try {
      await onExecuteAction(action, context);
      onConfirmingChange(null);
    } finally {
      setPendingActionId(null);
    }
  }
  async function submitFeedback(): Promise<void> {
    if (!feedbackAction || !feedback.trim()) return;
    await onFeedback(context, feedbackAction, feedback);
    setFeedback("");
    setFeedbackActionId(null);
  }
  return (
    <article className={`approval-card decision-primary ${context.severity}`} data-testid="decision-inspector-primary">
      <div className="approval-meta">
        <span>当前需要你决定</span>
        <small>{context.userStatus ? userStatusLabel(context.userStatus) : decisionKindLabel(context.kind)}</small>
      </div>
      <h3>{userFacingText(context.title)}</h3>
      <div className="decision-explainer">
        <strong>结果摘要</strong>
        <p>{userFacingText(context.resultSummary ?? context.summary)}</p>
      </div>
      <div className="decision-explainer">
        <strong>推荐动作</strong>
        <p>{userFacingText(context.recommendation ?? "查看证据后选择同意、要求修改或放弃。")}</p>
      </div>
      <div className="decision-explainer muted">
        <strong>说明</strong>
        <p>{userFacingText(context.explanation ?? "内部运行状态只作为证据和恢复信息，不是用户主决策语言。")}</p>
      </div>
      <dl className="approval-fields">
        <div><dt>变更</dt><dd>{context.changeId ?? "-"}</dd></div>
        {context.taskId ? <div><dt>任务</dt><dd>{context.taskId}</dd></div> : null}
        {context.queueRunId ? <div><dt>队列</dt><dd>{context.queueRunId}</dd></div> : null}
        {context.taskRunId ? <div><dt>执行尝试</dt><dd>{context.taskRunId}</dd></div> : null}
        {context.runId ? <div><dt>运行证据</dt><dd>{context.runId}</dd></div> : null}
      </dl>
      {context.evidenceRefs?.length ? (
        <div className="workpad-links" aria-label="Decision evidence refs">
          {context.evidenceRefs.slice(0, 4).map((artifact) => (
            <span className="artifact-link" key={artifact}>查看证据：{artifactName(artifact)}</span>
          ))}
        </div>
      ) : null}
      <div className="approval-actions">
        {context.actions.map((action) => {
          const disabled = actionBusy || !action.enabled;
          const title = action.disabledReason ?? (actionBusy ? "当前已有动作正在执行。" : undefined);
          if (action.kind === "feedback") {
            return <button key={action.id} className="outline-button" disabled={disabled} title={title} onClick={() => setFeedbackActionId(action.id)}><FileText size={15} />{userFacingText(action.label)}</button>;
          }
          if (action.kind === "evidence") {
            return <button key={action.id} className="outline-button" disabled={disabled} title={title} onClick={() => void executeAction(action)}><FileText size={15} />{userFacingText(action.label)}</button>;
          }
          if (action.kind !== "approval" && action.kind !== "workflow-action" && action.kind !== "abandon") return null;
          return confirming === action.id ? (
            <span className="confirm-inline" key={action.id}>
              <button className="primary-button" disabled={disabled} title={title} onClick={() => void executeAction(action)}><Check size={15} />确认</button>
              <button className="outline-button" disabled={actionBusy} onClick={() => onConfirmingChange(null)}><X size={15} />取消</button>
            </span>
          ) : (
            <button key={action.id} className="primary-button" disabled={disabled} title={title} onClick={() => action.requiresConfirmation ? onConfirmingChange(action.id) : void executeAction(action)}><Check size={15} />{userFacingText(action.label)}</button>
          );
        })}
      </div>
      {feedbackAction ? (
        <div className="decision-feedback" data-testid="decision-feedback-editor">
          <label>
            <span>{userFacingText(context.rework?.label ?? feedbackAction.label)}</span>
            <textarea
              value={feedback}
              onChange={(event) => setFeedback(event.target.value)}
              placeholder={context.rework?.placeholder ?? "写下需要修改的地方"}
              rows={4}
            />
          </label>
          <div className="approval-actions">
            <button className="primary-button" disabled={!feedback.trim()} onClick={() => void submitFeedback()}>提交反馈</button>
            <button className="outline-button" onClick={() => { setFeedback(""); setFeedbackActionId(null); }}>取消</button>
          </div>
        </div>
      ) : null}
    </article>
  );
}

function DecisionContextHistory({ contexts, onSelectContext }: { contexts: DecisionContext[]; onSelectContext: (id: string) => void }): ReactElement {
  return (
    <section className="decision-history">
      <div className="approval-header compact">
        <h2>历史</h2>
        <span>{contexts.length}</span>
      </div>
      {contexts.length === 0 ? <div className="approval-empty"><h3>暂无历史决策</h3><p>接受、要求修改或完成的动作会保留在这里。</p></div> : null}
      <details className="decision-history-details" open={false}>
        <summary>查看历史决策</summary>
        {contexts.map((context) => (
          <button className="decision-row" key={context.id} onClick={() => onSelectContext(context.id)}>
            <strong>{userFacingText(context.title)}</strong>
            <span>{decisionKindLabel(context.kind)} · {context.timestamp ? formatTime(context.timestamp) : userFacingText(context.severity)}</span>
          </button>
        ))}
      </details>
    </section>
  );
}
