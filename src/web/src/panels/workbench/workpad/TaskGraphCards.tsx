import { useState, type ReactElement } from "react";
import {
  codingPackageStatusLabel,
  humanStatus,
  taskStatusLabel,
  userFacingText,
} from "../../../formatters.js";
import { workflowActionPayloadFromTaskAction } from "../../../workflow-actions.js";
import type {
  ClarificationRequest,
  ProviderUserInputRequest,
  WorkbenchCodingPackage,
  WorkbenchTaskNode,
} from "../../../types.js";

export function CodingPackageCard({ item }: { item: WorkbenchCodingPackage }): ReactElement {
  const pendingText = item.taskIds.length > 0 ? item.taskIds.join(", ") : "无待执行任务";
  const completedText = item.completedTaskIds.length > 0 ? item.completedTaskIds.join(", ") : "无已完成任务上下文";
  return (
    <article className={`coding-package-card ${item.status}`} data-testid="coding-package-card">
      <div className="coding-package-header">
        <div>
          <strong>{item.title}</strong>
          <span>{item.summary}</span>
        </div>
        <span className={`task-status ${item.status}`}>{codingPackageStatusLabel(item.status)}</span>
      </div>
      <div className="coding-package-meta">
        <span>推荐角色：{item.recommendedRoleId}</span>
      </div>
      <div className="coding-package-grid">
        <div>
          <strong>待执行任务</strong>
          <p>{pendingText}</p>
        </div>
        <div>
          <strong>已完成上下文</strong>
          <p>{completedText}</p>
        </div>
      </div>
      <div className="coding-package-chips" aria-label="Coding package AC coverage">
        {item.acIds.map((acId) => (
          <span key={acId} className={item.missingEvidenceAcIds.includes(acId) ? "missing" : "covered"}>
            {acId}{item.missingEvidenceAcIds.includes(acId) ? " · 缺 evidence" : " · covered"}
          </span>
        ))}
      </div>
    </article>
  );
}

export function TaskGraphCard({
  task,
  busy,
  onWorkflowAction,
  onSelectDecisionContext,
}: {
  task: WorkbenchTaskNode;
  busy: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
}): ReactElement {
  const action = task.nextAction;
  const disabled = busy || !action.enabled || !action.actionType;
  const blockerContextId = task.status === "blocked" ? `task:${task.taskId}:blocked` : null;
  function runTask(): void {
    if (!action.actionType || disabled) return;
    void onWorkflowAction(action.actionType, workflowActionPayloadFromTaskAction(action, task.taskId));
  }
  return (
    <article className={`workpad-task ${task.status}`} data-testid={`taskgraph-node-${task.taskId}`}>
      <div className="workpad-task-header">
        <div>
          <strong>{task.taskId}</strong>
          <span>{userFacingText(task.title)}</span>
        </div>
        <span className={`task-status ${task.status}`}>{taskStatusLabel(task.status)}</span>
      </div>
      <small>{task.checked ? "已勾选" : "未勾选"} · {task.acIds.join(", ") || "未映射 AC"}</small>
      {task.taskRun ? (
        <div className="task-run-summary">
          <span>执行尝试 #{task.taskRun.attempt}</span>
          <strong>{humanStatus(task.taskRun.status)}</strong>
          <small>{task.taskRun.id}</small>
          {task.workerLease ? <small>执行会话 {humanStatus(task.workerLease.status)} · {task.workerLease.workerId}</small> : null}
        </div>
      ) : null}
      {task.latestEvidence.length > 0 ? (
        <div className="task-evidence-list">
          {task.latestEvidence.map((item) => (
            <span key={item.id}>{userFacingText(item.label)}{item.status ? ` · ${humanStatus(item.status)}` : ""}</span>
          ))}
        </div>
      ) : <small className="panel-note">暂无任务级 evidence。</small>}
      {task.blockers.length > 0 ? (
        <ul className="task-blockers">
          {task.blockers.map((blocker) => <li key={blocker}>{userFacingText(blocker)}</li>)}
        </ul>
      ) : null}
      {blockerContextId ? (
        <button className="context-link" type="button" onClick={() => onSelectDecisionContext(blockerContextId)}>
          查看当前决策
        </button>
      ) : null}
      <button
        className="secondary-button"
        type="button"
        disabled={disabled}
        title={action.disabledReason}
        onClick={runTask}
      >
        {userFacingText(action.label)}
      </button>
    </article>
  );
}

export function ClarificationCard({
  clarification,
  busy,
  onAnswer,
}: {
  clarification: ClarificationRequest;
  busy: boolean;
  onAnswer: (clarificationId: string, answer: string) => Promise<void>;
}): ReactElement {
  const [answer, setAnswer] = useState("");
  const firstQuestion = clarification.questions[0];
  const canSubmit = !busy && answer.trim().length > 0;
  async function submit(): Promise<void> {
    if (!canSubmit) return;
    await onAnswer(clarification.id, answer);
    setAnswer("");
  }
  return (
    <article className="clarification-card" data-testid="clarification-card">
      <div className="clarification-questions">
        {clarification.questions.map((question) => (
          <div key={question.id}>
            <strong>{question.header ?? "请确认"}</strong>
            <p>{question.question}</p>
            {question.options && question.options.length > 0 ? (
              <div className="clarification-options">
                {question.options.map((option) => (
                  <button
                    className="outline-button"
                    key={option.label}
                    type="button"
                    onClick={() => setAnswer(option.description ? `${option.label}：${option.description}` : option.label)}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
      <label>
        <span>回答</span>
        <textarea
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          placeholder={firstQuestion?.allowFreeform === false ? "选择一个选项后提交" : "补充你的约束或答案"}
          rows={3}
        />
      </label>
      <button className="primary-button" type="button" disabled={!canSubmit} onClick={() => void submit()}>
        提交回答
      </button>
    </article>
  );
}

export function ProviderUserInputRequestCard({
  request,
  busy,
  onAnswer,
}: {
  request: ProviderUserInputRequest;
  busy: boolean;
  onAnswer: (request: ProviderUserInputRequest, answers: Record<string, string | string[]>) => Promise<void>;
}): ReactElement {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const pending = request.status === "pending";
  const canSubmit = pending && !busy && (request.questions.length === 0 || request.questions.some((question) => (answers[question.id] ?? "").trim().length > 0));
  async function submit(): Promise<void> {
    if (!canSubmit) return;
    await onAnswer(request, answers);
    setAnswers({});
  }
  return (
    <article className="clarification-card provider-user-input-card" data-testid="provider-user-input-card">
      <div className="clarification-questions">
        {request.questions.map((question) => (
          <div key={question.id}>
            <strong>{question.header ?? "Agent 需要确认"}</strong>
            <p>{question.question}</p>
            {question.options && question.options.length > 0 ? (
              <div className="clarification-options">
                {question.options.map((option) => (
                  <button
                    className="outline-button"
                    key={option.label}
                    type="button"
                    disabled={!pending || busy}
                    onClick={() => setAnswers((current) => ({
                      ...current,
                      [question.id]: option.description ? `${option.label}：${option.description}` : option.label,
                    }))}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            ) : null}
            {pending ? <label>
              <span>回答</span>
              <textarea
                value={answers[question.id] ?? ""}
                onChange={(event) => setAnswers((current) => ({ ...current, [question.id]: event.target.value }))}
                placeholder={question.options?.length ? "选择一个选项，或补充说明" : "输入你的回答"}
                rows={3}
                disabled={!pending || busy}
              />
            </label> : request.answers?.[question.id] ? (
              <p className="clarification-answer">你的回答：{formatProviderAnswer(request.answers[question.id])}</p>
            ) : null}
          </div>
        ))}
      </div>
      <button className="primary-button" type="button" disabled={!canSubmit} onClick={() => void submit()}>
        {request.status === "submitted" ? "已提交" : request.status === "submitting" ? "正在提交" : "提交回答"}
      </button>
    </article>
  );
}

function formatProviderAnswer(answer: string | string[]): string {
  return Array.isArray(answer) ? answer.join("、") : answer;
}

export function WorkpadMetric({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="workpad-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
