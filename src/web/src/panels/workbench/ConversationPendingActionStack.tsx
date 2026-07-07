import { Check, Clipboard, Send, SquarePen, X } from "lucide-react";
import { useState, type KeyboardEvent, type ReactElement } from "react";
import { CodexUserInputRequestCard } from "./workpad/TaskGraphCards.js";
import type { CodexUserInputRequest, PlanHandoffCandidate, PlanHandoffIntentKind } from "../../types.js";

export function ConversationPendingActionStack({
  codexUserInputRequests,
  planHandoffCandidate,
  busy,
  onAnswerCodexUserInput,
  onPlanHandoff,
  onCancelPlanHandoff,
}: {
  codexUserInputRequests: CodexUserInputRequest[];
  planHandoffCandidate: PlanHandoffCandidate | null;
  busy: boolean;
  onAnswerCodexUserInput: (request: CodexUserInputRequest, answers: Record<string, string | string[]>) => Promise<void>;
  onPlanHandoff: (candidate: PlanHandoffCandidate, kind: PlanHandoffIntentKind, feedback?: string) => Promise<void>;
  onCancelPlanHandoff: (candidate: PlanHandoffCandidate) => Promise<void>;
}): ReactElement | null {
  const pendingCodexUserInputRequests = codexUserInputRequests.filter((request) => request.status === "pending");
  if (!planHandoffCandidate && pendingCodexUserInputRequests.length === 0) return null;
  return (
    <section className="conversation-pending-action-stack" data-testid="conversation-pending-action-stack" aria-label="待处理操作">
      {planHandoffCandidate ? (
        <PlanHandoffPendingAction
          candidate={planHandoffCandidate}
          busy={busy}
          onPlanHandoff={onPlanHandoff}
          onCancelPlanHandoff={onCancelPlanHandoff}
        />
      ) : null}
      {pendingCodexUserInputRequests.length ? (
        <div className="conversation-pending-card" data-testid="conversation-pending-codex-user-input">
          <div className="conversation-pending-header">
            <span>Codex 需要确认</span>
            <strong>{pendingCodexUserInputRequests.length}</strong>
          </div>
          <div className="conversation-pending-list">
            {pendingCodexUserInputRequests.map((request) => (
              <CodexUserInputRequestCard
                key={request.requestId}
                request={request}
                busy={busy}
                onAnswer={onAnswerCodexUserInput}
              />
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function PlanHandoffPendingAction({
  candidate,
  busy,
  onPlanHandoff,
  onCancelPlanHandoff,
}: {
  candidate: PlanHandoffCandidate;
  busy: boolean;
  onPlanHandoff: (candidate: PlanHandoffCandidate, kind: PlanHandoffIntentKind, feedback?: string) => Promise<void>;
  onCancelPlanHandoff: (candidate: PlanHandoffCandidate) => Promise<void>;
}): ReactElement {
  const [feedback, setFeedback] = useState("");
  const [pending, setPending] = useState<PlanHandoffIntentKind | "cancel" | null>(null);
  async function submit(kind: PlanHandoffIntentKind): Promise<void> {
    if (busy || pending) return;
    const trimmed = feedback.trim();
    if (kind === "revise-plan" && !trimmed) return;
    setPending(kind);
    try {
      await onPlanHandoff(candidate, kind, kind === "revise-plan" ? trimmed : undefined);
      if (kind === "revise-plan") setFeedback("");
    } finally {
      setPending(null);
    }
  }
  async function cancel(): Promise<void> {
    if (busy || pending) return;
    setPending("cancel");
    try {
      await onCancelPlanHandoff(candidate);
    } finally {
      setPending(null);
    }
  }
  function submitFeedbackFromKeyboard(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    void submit("revise-plan");
  }
  return (
    <div className="conversation-pending-card plan-handoff-pending-card" data-testid="plan-handoff-pending-card">
      <div className="conversation-pending-header">
        <span className="conversation-pending-title">
          <Clipboard size={15} aria-hidden="true" />
          计划已准备
        </span>
        <strong>{candidate.title}</strong>
      </div>
      <div className="conversation-pending-actions">
        <button
          type="button"
          className="conversation-pending-button conversation-pending-primary"
          disabled={busy || pending !== null}
          onClick={() => void submit("execute-plan")}
        >
          <Check size={15} aria-hidden="true" />
          <span>{pending === "execute-plan" ? "正在提交" : "执行"}</span>
        </button>
        <button
          type="button"
          className="conversation-pending-button conversation-pending-secondary"
          disabled={busy || pending !== null}
          onClick={() => void cancel()}
        >
          <X size={15} aria-hidden="true" />
          <span>{pending === "cancel" ? "正在取消" : "取消"}</span>
        </button>
      </div>
      <div className="conversation-pending-feedback">
        <label htmlFor="plan-handoff-feedback">
          <SquarePen size={15} aria-hidden="true" />
          <span>提出意见再修改计划</span>
        </label>
        <div className="conversation-pending-feedback-row">
          <textarea
            id="plan-handoff-feedback"
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            onKeyDown={submitFeedbackFromKeyboard}
            placeholder="输入你希望 Plan Agent 修改的地方"
            disabled={busy || pending !== null}
          />
          <button
            type="button"
            className="conversation-pending-button conversation-pending-feedback-submit"
            disabled={busy || pending !== null || !feedback.trim()}
            onClick={() => void submit("revise-plan")}
          >
            <Send size={15} aria-hidden="true" />
            <span>{pending === "revise-plan" ? "正在提交" : "提交修改意见"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
