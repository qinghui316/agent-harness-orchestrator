import { useState, type ReactElement } from "react";
import { Check, FileText, X } from "lucide-react";
import { confirmationKindLabel, decisionKindLabel, formatTime, userFacingText, userStatusLabel } from "../../formatters.js";
import type { ConfirmationQueue, ConfirmationQueueItem, DecisionAction, DecisionContext, DecisionInspector } from "../../types.js";
import { artifactName } from "./RunReplayPanel.js";
import { ControlledSchedulerRoutingPosture } from "./ControlledSchedulerRoutingPosture.js";

export function DecisionInspectorPane({
  inspector,
  confirmationQueue,
  automationMode,
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
  automationMode?: "request-approval" | "full-access";
  confirming: string | null;
  busy: boolean;
  error: string | null;
  onConfirmingChange: (id: string | null) => void;
  onExecuteAction: (action: DecisionAction, context: DecisionContext) => Promise<void>;
  onFeedback: (context: DecisionContext, action: DecisionAction, feedback: string) => Promise<void>;
  onSelectContext: (id: string | null) => void;
}): ReactElement {
  const effectiveAutomationMode = automationMode ?? "request-approval";
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
          automationMode={effectiveAutomationMode}
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
              automationMode={effectiveAutomationMode}
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
  automationMode,
  onConfirmingChange,
  onExecuteAction,
  onFeedback,
}: {
  item: ConfirmationQueueItem;
  confirming: string | null;
  busy: boolean;
  automationMode: "request-approval" | "full-access";
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
      automationMode={automationMode}
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
    mainAgentLoopProjection: item.mainAgentLoopProjection,
    controlledSchedulerNextCandidate: item.controlledSchedulerNextCandidate,
    controlledSchedulerReconfirmation: item.controlledSchedulerReconfirmation,
    severity: item.status === "failed" ? "blocking" : "info",
    changeId: item.changeId ?? item.conversationId,
    runId: item.runId,
    targetId: item.worktreeId ?? item.applyCheckId ?? item.resultId,
    planningBundleId: item.planningBundleId,
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
  automationMode,
  onConfirmingChange,
  onExecuteAction,
  onFeedback,
}: {
  context: DecisionContext;
  confirming: string | null;
  busy: boolean;
  automationMode: "request-approval" | "full-access";
  onConfirmingChange: (id: string | null) => void;
  onExecuteAction: (action: DecisionAction, context: DecisionContext) => Promise<void>;
  onFeedback: (context: DecisionContext, action: DecisionAction, feedback: string) => Promise<void>;
}): ReactElement {
  const [feedbackActionId, setFeedbackActionId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("");
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const feedbackAction = context.actions.find((action) => action.id === feedbackActionId);
  const primaryAutomationAction = chooseScopedAutomationAction(context.actions);
  const planningConfirmationAction = context.actions.find(isPlanningConfirmationAction);
  const scopedAutomationAvailable = Boolean(primaryAutomationAction);
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
      {context.mainAgentLoopProjection?.status === "recommend-existing-gate" ? (
        <div className="decision-explainer muted" aria-label="Main agent loop projection">
          <strong>主 Agent 判断</strong>
          <p>{userFacingText(context.mainAgentLoopProjection.reason || context.mainAgentLoopProjection.summary)}</p>
        </div>
      ) : null}
      {context.controlledSchedulerNextCandidate ? (
        <div className="decision-explainer" aria-label="Controlled scheduler next candidate">
          <strong>{userFacingText(context.controlledSchedulerNextCandidate.label)}</strong>
          <p>{userFacingText(context.controlledSchedulerNextCandidate.body)}</p>
          <p className="muted-inline">
            {context.controlledSchedulerNextCandidate.readinessEvidencePrepared ? "当前步骤检查已准备好。" : "当前步骤检查还需要复核。"}
            {" "}
            {context.controlledSchedulerNextCandidate.humanConfirmationStillRequired ? "继续前仍需要你确认这个步骤。" : "等待新的证据。"}
          </p>
          {context.controlledSchedulerNextCandidate.routingPosture ? (
            <ControlledSchedulerRoutingPosture posture={context.controlledSchedulerNextCandidate.routingPosture} />
          ) : null}
        </div>
      ) : null}
      {context.controlledSchedulerReconfirmation ? (
        <div className="decision-explainer" aria-label="Controlled scheduler reconfirmation">
          <strong>{userFacingText(context.controlledSchedulerReconfirmation.label)}</strong>
          <p>{userFacingText(context.controlledSchedulerReconfirmation.body)}</p>
          <dl className="approval-fields compact">
            {context.controlledSchedulerReconfirmation.lastStoppedStepLabel ? (
              <div><dt>上一步</dt><dd>{userFacingText(context.controlledSchedulerReconfirmation.lastStoppedStepLabel)}</dd></div>
            ) : null}
            <div><dt>当前确认</dt><dd>{userFacingText(context.controlledSchedulerReconfirmation.currentStepLabel)}</dd></div>
            <div><dt>检查状态</dt><dd>{userFacingText(context.controlledSchedulerReconfirmation.freshnessLabel)}</dd></div>
            {context.controlledSchedulerReconfirmation.stopPosture ? (
              <div><dt>停止原因</dt><dd>{userFacingText(context.controlledSchedulerReconfirmation.stopPosture.stopReasonLabel)}</dd></div>
            ) : null}
          </dl>
          {context.controlledSchedulerReconfirmation.stopPosture ? (
            <p className="muted-inline">{userFacingText(context.controlledSchedulerReconfirmation.stopPosture.body)}</p>
          ) : null}
          <p className="muted-inline">{userFacingText(context.controlledSchedulerReconfirmation.boundary)}</p>
          {context.controlledSchedulerReconfirmation.evidenceRefs.length ? (
            <div className="workpad-links" aria-label="Controlled scheduler reconfirmation evidence refs">
              {context.controlledSchedulerReconfirmation.evidenceRefs.slice(0, 4).map((artifact) => (
                <span className="artifact-link" key={artifact}>查看证据：{artifactName(artifact)}</span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
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
          const effectiveAction = action === planningConfirmationAction
            ? postPlanAutomationConfirmationActionFrom(action, automationMode)
            : action === primaryAutomationAction && scopedAutomationAvailable && (automationMode === "full-access" || isScopedAutomationConfirming(confirming, action))
              ? scopedAutomationActionFrom(action, context)
              : action;
          const disabled = actionBusy || !effectiveAction.enabled;
          const title = action.disabledReason ?? (actionBusy ? "当前已有动作正在执行。" : undefined);
          if (action.kind === "feedback") {
            return <button key={action.id} className="outline-button" disabled={disabled} title={title} onClick={() => setFeedbackActionId(action.id)}><FileText size={15} />{userFacingText(action.label)}</button>;
          }
          if (action.kind === "evidence") {
            return <button key={action.id} className="outline-button" disabled={disabled} title={title} onClick={() => void executeAction(action)}><FileText size={15} />{userFacingText(action.label)}</button>;
          }
          if (action.kind !== "approval" && action.kind !== "workflow-action" && action.kind !== "abandon") return null;
          return confirming === effectiveAction.id ? (
            <span className="confirm-inline" key={action.id}>
              <button className="primary-button" disabled={disabled} title={title} onClick={() => void executeAction(effectiveAction)}><Check size={15} />确认</button>
              <button className="outline-button" disabled={actionBusy} onClick={() => onConfirmingChange(null)}><X size={15} />取消</button>
            </span>
          ) : (
            <button key={action.id} className="primary-button" disabled={disabled} title={title} onClick={() => effectiveAction.requiresConfirmation ? onConfirmingChange(effectiveAction.id) : void executeAction(effectiveAction)}><Check size={15} />{userFacingText(effectiveAction.label)}</button>
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

function scopedAutomationActionFrom(action: DecisionAction, context: DecisionContext): DecisionAction {
  if (!action.actionType && !isScopedAutomationAllowedApprovalActionId(action.action?.actionId)) return action;
  return {
    ...action,
    id: `automation:${action.id}`,
    label: "自动推进",
    kind: "workflow-action",
    actionType: "planning.automation.scoped-auto.run",
    automationMode: "full-access",
    automationCurrentGateActionType: action.actionType,
    automationCurrentGateApprovalActionId: isScopedAutomationAllowedApprovalActionId(action.action?.actionId) ? action.action?.actionId : undefined,
    automationCurrentGateTargetId: context.targetId,
    automationCurrentGateRunId: context.runId,
    automationCurrentGateArtifact: context.artifact,
    changeId: action.changeId ?? context.changeId,
    maxSteps: action.maxSteps ?? 10,
    requiresConfirmation: true,
  };
}

function postPlanAutomationConfirmationActionFrom(action: DecisionAction, mode: "request-approval" | "full-access"): DecisionAction {
  return {
    ...action,
    id: postPlanAutomationConfirmationActionId(action, mode),
    label: action.label,
    postPlanAutomationMode: mode,
    requiresConfirmation: true,
  };
}

function isPlanningConfirmationAction(action: DecisionAction): boolean {
  return action.kind === "workflow-action" && action.actionType === "planning.confirm-execution";
}

function postPlanAutomationConfirmationActionId(action: DecisionAction, mode: "request-approval" | "full-access"): string {
  return `post-plan-automation:${mode}:${action.id}`;
}

function isScopedAutomationConfirming(confirming: string | null, action: DecisionAction): boolean {
  return confirming === `automation:${action.id}`;
}

function isScopedAutomationAllowedAction(action: DecisionAction): boolean {
  if (isTerminalHumanGateActionType(action.goalLoopCurrentGateActionType)) return false;
  const actionType = action.actionType;
  if (action.kind === "approval") {
    return isScopedAutomationAllowedApprovalActionId(action.action?.actionId) && action.automationEligible === true;
  }
  return action.kind === "workflow-action" && (actionType === "planning.decompose"
    || actionType === "planning.decomposition.confirm"
    || actionType === "planning.decomposition.assess-readiness"
    || actionType === "planning.goal-loop.evaluate"
    || actionType === "planning.goal-loop.controller.refresh"
    || actionType === "planning.goal-loop.gate-readiness.prepare"
    || actionType === "code.run"
    || actionType === "validate.run"
    || actionType === "audit.run"
    || actionType === "result.refresh-rework"
    || actionType === "result.refresh-status"
    || actionType === "result.revalidate"
    || actionType === "result.reaudit"
    || actionType === "landing.prepare"
    || actionType === "planning.goal-loop.controlled-continue.run");
}

function isTerminalHumanGateActionType(actionType: string | undefined): boolean {
  return actionType === "planning.scheduler.integration-check.run"
    || actionType === "apply-check.apply"
    || actionType === "apply-check.discard"
    || actionType === "harness-evolve.apply"
    || actionType === "harness-evolve.mark-complete"
    || actionType === "landing-queue.merge-next"
    || actionType === "remote-landing.merge"
    || actionType === "pr-draft.create"
    || actionType === "pr-feedback.update-draft"
    || actionType === "pr-review.submit"
    || actionType === "pr-review.reply-submit"
    || actionType === "pr-review.thread-resolve";
}

function isScopedAutomationAllowedApprovalActionId(actionId: string | undefined): actionId is "audit.accept" | "result.apply" | "change.close" {
  return actionId === "audit.accept" || actionId === "result.apply" || actionId === "change.close";
}

function chooseScopedAutomationAction(actions: DecisionAction[]): DecisionAction | undefined {
  const candidates = actions
    .map((action, index) => ({ action, index, priority: scopedAutomationActionPriority(action) }))
    .filter((item) => item.priority >= 0);
  candidates.sort((left, right) => right.priority - left.priority || left.index - right.index);
  return candidates[0]?.action;
}

function scopedAutomationActionPriority(action: DecisionAction): number {
  if (!isScopedAutomationAllowedAction(action)) return -1;
  switch (action.actionType) {
    case "planning.goal-loop.controlled-continue.run":
      return 400;
    case "planning.goal-loop.gate-readiness.prepare":
      return 300;
    case "planning.goal-loop.controller.refresh":
      return 200;
    case "planning.goal-loop.evaluate":
      return 100;
    default:
      return 0;
  }
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
