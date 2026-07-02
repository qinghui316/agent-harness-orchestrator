import { useState, type ReactElement } from "react";
import { userFacingText, userStatusLabel } from "../../formatters.js";
import type { Approval, Workpad } from "../../types.js";
import {
  ResultReviewNarrative,
  RoleToolResultRows,
} from "./workpad/PlanningCards.js";
import { GoalLoopPrimarySummary } from "./workpad/GoalLoopCards.js";
import { ClarificationCard } from "./workpad/TaskGraphCards.js";
import { WorkpadActionButton } from "./workpad/WorkpadActionButton.js";
import { WorkpadDiagnosticDetails } from "./workpad/WorkpadDetails.js";
import { mainAgentExecutionForWorkpad } from "./workpad/main-agent-execution.js";
import { parentAgentNarrative } from "./workpad/surface-text.js";

export function WorkpadView(props: {
  workpad: Workpad;
  approvals: Approval[];
  busy: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onConfirmApproval: (approvalId: string) => void;
  onAnswerClarification: (clarificationId: string, answer: string) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
}): ReactElement {
  const { workpad, approvals, busy, onWorkflowAction, onConfirmApproval } = props;
  const [detailsOpen, setDetailsOpen] = useState(false);
  const approval = workpad.nextAction.approvalId ? approvals.find((item) => item.id === workpad.nextAction.approvalId) : undefined;
  const maintenanceNotice = workpad.maintenance?.status && workpad.maintenance.status !== "idle" ? workpad.maintenance : null;
  const mainAgentExecution = mainAgentExecutionForWorkpad(workpad);
  const hidePrimaryAction = Boolean(workpad.controlledSchedulerReconfirmation || (workpad.goalLoop && isControlledContinuationAction(workpad.nextAction.actionType)));
  return (
    <div className="parent-conversation" data-testid="workpad-view">
      <section className="parent-agent-card">
        <div>
          <span className={`workpad-state user-state ${workpad.userStatus ?? "later"}`}>{workpad.userStatusLabel ?? userStatusLabel(workpad.userStatus)}</span>
          <h2>{workpad.title}</h2>
          <p>{parentAgentNarrative(workpad)}</p>
        </div>
        {hidePrimaryAction ? null : (
          <WorkpadActionButton
            action={workpad.nextAction}
            approval={approval}
            busy={busy}
            sanitizeInternal
            onWorkflowAction={onWorkflowAction}
            onConfirmApproval={onConfirmApproval}
          />
        )}
      </section>

      {workpad.pendingFeedback?.length ? (
        <section className="parent-agent-section">
          <h3>已记录的补充</h3>
          {workpad.pendingFeedback.slice(-3).map((feedback) => (
            <p key={feedback.id}>{feedback.text} <span className="muted-inline">本轮完成后会用于下一次调整。</span></p>
          ))}
        </section>
      ) : null}

      {workpad.goalLoop ? (
        <GoalLoopPrimarySummary
          goalLoop={workpad.goalLoop}
          controlledSchedulerReconfirmation={workpad.controlledSchedulerReconfirmation}
        />
      ) : null}

      {mainAgentExecution ? <RoleToolResultRows pipeline={mainAgentExecution} /> : null}
      {workpad.resultReview ? <ResultReviewNarrative review={workpad.resultReview} /> : null}

      <section className="parent-agent-section">
        <h3>当前理解</h3>
        <p className="parent-agent-lead">{workpad.intake.goal}</p>
        <p>{workpad.intake.currentUnderstanding}</p>
        {workpad.intake.confirmedConstraints?.length ? (
          <div className="parent-chip-list">
            {workpad.intake.confirmedConstraints.slice(0, 4).map((constraint) => <span key={constraint}>{constraint}</span>)}
          </div>
        ) : null}
      </section>

      {workpad.intake.pendingClarifications?.length ? (
        <section className="parent-agent-section">
          <div className="parent-section-header">
            <h3>需要确认</h3>
            <span>{workpad.intake.pendingClarifications.length}</span>
          </div>
          <div className="clarification-list">
            {workpad.intake.pendingClarifications.map((clarification) => (
              <ClarificationCard
                key={clarification.id}
                clarification={clarification}
                busy={busy}
                onAnswer={props.onAnswerClarification}
              />
            ))}
          </div>
        </section>
      ) : null}

      {maintenanceNotice ? (
        <section className="parent-agent-section maintenance-nudge">
          <h3>后台维护</h3>
          <p>{userFacingText(maintenanceNotice.note)}</p>
        </section>
      ) : null}

      <details className="parent-details" open={detailsOpen}>
        <summary
          onClick={(event) => {
            event.preventDefault();
            setDetailsOpen((open) => !open);
          }}
        >
          查看详情与证据
        </summary>
        {detailsOpen ? <WorkpadDiagnosticDetails {...props} /> : null}
      </details>
    </div>
  );
}

function isControlledContinuationAction(actionType: string | undefined): boolean {
  return Boolean(actionType?.startsWith("planning.goal-loop.") || actionType?.startsWith("planning.scheduler."));
}
