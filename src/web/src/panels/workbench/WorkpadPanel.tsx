import { useState, type ReactElement } from "react";
import { workflowActionLabel } from "../../action-labels.js";
import { TaskQueuePanel } from "../TaskQueuePanel.js";
import {
  workflowActionPayloadFromScope,
  workflowActionPayloadFromTaskAction,
} from "../../workflow-actions.js";
import {
  codingPackageExecutionLabel,
  codingPackageSplitLabel,
  codingPackageStatusLabel,
  conversationLifecycleLabel,
  decompositionReadinessLabel,
  decompositionRecommendationLabel,
  humanStatus,
  readinessLabel,
  resultReviewStatusLabel,
  roleLabel,
  statusOrDash,
  sourceLabel,
  taskStatusLabel,
  userFacingText,
  userStatusLabel,
  workpadStateLabel,
  workpadStatusLabel,
} from "../../formatters.js";
import type {
  Approval,
  ClarificationRequest,
  WorkbenchCodingPackage,
  WorkbenchTaskNode,
  Workpad,
  WorkpadNextAction,
} from "../../types.js";
import { artifactName } from "./RunReplayPanel.js";

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
  return (
    <div className="parent-conversation" data-testid="workpad-view">
      <section className="parent-agent-card">
        <div>
          <span className={`workpad-state user-state ${workpad.userStatus ?? "later"}`}>{workpad.userStatusLabel ?? userStatusLabel(workpad.userStatus)}</span>
          <h2>{workpad.title}</h2>
          <p>{parentAgentNarrative(workpad)}</p>
        </div>
        <WorkpadActionButton
          action={workpad.nextAction}
          approval={approval}
          busy={busy}
          sanitizeInternal
          onWorkflowAction={onWorkflowAction}
          onConfirmApproval={onConfirmApproval}
        />
      </section>

      {workpad.pendingFeedback?.length ? (
        <section className="parent-agent-section">
          <h3>已记录的补充</h3>
          {workpad.pendingFeedback.slice(-3).map((feedback) => (
            <p key={feedback.id}>{feedback.text} <span className="muted-inline">本轮完成后会用于下一次调整。</span></p>
          ))}
        </section>
      ) : null}

      {workpad.planningArtifactBundle ? <PlanningNarrativeCard bundle={workpad.planningArtifactBundle} /> : null}
      {workpad.rolePipeline ? <RoleToolResultRows pipeline={workpad.rolePipeline} /> : null}
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

function PlanningNarrativeCard({ bundle }: { bundle: NonNullable<Workpad["planningArtifactBundle"]> }): ReactElement {
  const criteria = bundle.acceptanceCriteria.filter((item) => !/^\s*(AC-\d+|TBD)\s*$/i.test(item)).slice(0, 4);
  const tasks = bundle.tasks.filter((task) => task.title && !/^\s*TBD\s*$/i.test(task.title)).slice(0, 3);
  return (
    <section className="parent-agent-section" data-testid="planning-draft-card">
      <div className="parent-section-header">
        <h3>{bundle.status === "confirmed" ? "已确认方案" : "方案草案"}</h3>
        <span>{bundle.status === "confirmed" ? "准备执行" : "等待确认"}</span>
      </div>
      <p className="parent-agent-lead">我理解你要做的是：{parentSurfaceText(bundle.goal)}</p>
      {bundle.design ? <p>实现上，我会按现有代码结构处理：{userFacingText(stripInternalPlanningText(bundle.design))}</p> : null}
      {criteria.length > 0 ? (
        <div className="parent-chip-list">
          {criteria.map((item) => <span key={item}>{userFacingText(stripInternalPlanningText(item))}</span>)}
        </div>
      ) : null}
      {tasks.length > 0 ? (
        <div className="role-result-list">
          {tasks.map((task) => (
            <div className="role-result-row" key={task.id}>
              <strong>会处理</strong>
              <span>{userFacingText(stripInternalPlanningText(task.title))}</span>
            </div>
          ))}
        </div>
      ) : null}
      {bundle.openQuestions.length > 0 ? (
        <p className="parent-agent-note">还有 {bundle.openQuestions.length} 个点需要确认后再执行。</p>
      ) : null}
    </section>
  );
}

function RoleToolResultRows({ pipeline }: { pipeline: NonNullable<Workpad["rolePipeline"]> }): ReactElement {
  const rows = [
    ...pipeline.runs.map((run) => ({ id: `${run.roleId}:${run.runId ?? run.artifact ?? run.status}`, roleId: run.roleId, status: run.status, summary: run.summary, artifact: run.artifact })),
    ...pipeline.agentTasks.slice(-6).map((task) => ({ id: task.id, roleId: task.roleId, status: task.status, summary: task.resultSummary ?? task.summary, artifact: task.evidenceRefs[0] })),
  ];
  if (rows.length === 0) return <></>;
  return (
    <section className="parent-agent-section" data-testid="role-pipeline-summary">
      <div className="parent-section-header">
        <h3>执行过程</h3>
        <span>{humanStatus(pipeline.status)}</span>
      </div>
      <div className="role-result-list">
        {rows.map((row) => (
          <div className="role-result-row" key={row.id}>
            <strong>{roleLabel(row.roleId)}</strong>
            <span>{parentSurfaceText(row.summary)}</span>
            <small>{humanStatus(row.status)}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

function ResultReviewNarrative({ review }: { review: NonNullable<Workpad["resultReview"]> }): ReactElement {
  return (
    <section className={`parent-agent-section result-review ${review.status}`} data-testid="result-review-card">
      <div className="parent-section-header">
        <h3>结果</h3>
        <span>{resultReviewStatusLabel(review.status)}</span>
      </div>
      <p className="parent-agent-lead">{userFacingText(review.title)}</p>
      <p>{userFacingText(review.summary)}</p>
      {review.changedFiles.length > 0 ? (
        <div className="parent-chip-list">
          {review.changedFiles.slice(0, 6).map((file) => <span key={file}>{file}</span>)}
        </div>
      ) : null}
      <div className="role-result-list">
        <div className="role-result-row"><strong>验证</strong><span>{review.validation ? humanStatus(review.validation.status) : "未完成"}</span></div>
        <div className="role-result-row"><strong>审查</strong><span>{review.audit ? humanStatus(review.audit.status) : "未完成"}</span></div>
        <div className="role-result-row"><strong>下一步</strong><span>{userFacingText(review.applyReadiness.message ?? review.applyReadiness.label)}</span></div>
      </div>
      {review.audit?.notes.length ? <p className="parent-agent-note">注意事项：{userFacingText(review.audit.notes[0])}</p> : null}
    </section>
  );
}

function parentAgentNarrative(workpad: Workpad): string {
  if (workpad.resultReview) return "我已经整理了本轮实现结果、验证与审查证据。你可以查看摘要后决定是否应用到项目，或继续要求修改。";
  if (workpad.rolePipeline) return "我正在把这次需求交给内部角色执行，并会把实现、验证和审查结果汇总回这个对话。";
  if (workpad.planningArtifactBundle) return workpad.planningArtifactBundle.status === "confirmed"
    ? "方案已经确认，接下来会进入实现、验证和审查。"
    : "我先把需求整理成可执行方案。你可以继续补充要求，或确认后开始执行。";
  if (workpad.intake.currentUnderstanding) return "我会基于当前需求对话继续分析目标、约束和下一步。";
  return "描述你的需求后，我会先整理方案，再进入实现和验证。";
}

function stripInternalPlanningText(value: string): string {
  return value
    .replace(/\bT-\d+\s*[:：]?\s*/g, "")
    .replace(/\bAC-\d+\s*[:：]?\s*/g, "")
    .replace(/\blatest-bundle\.md\b/gi, "")
    .replace(/\bplanning-agent\b/gi, "主 agent")
    .replace(/\bAgentTask\b/gi, "执行记录")
    .replace(/\bTaskRepository\b/gi, "后台任务")
    .replace(/\bTBD\b/gi, "待确认")
    .replace(/^\s*[:：]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parentSurfaceText(value: string): string {
  return userFacingText(stripInternalPlanningText(value));
}

function WorkpadDiagnosticDetails({
  workpad,
  approvals,
  busy,
  onWorkflowAction,
  onConfirmApproval,
  onAnswerClarification,
  onSelectDecisionContext,
}: {
  workpad: Workpad;
  approvals: Approval[];
  busy: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onConfirmApproval: (approvalId: string) => void;
  onAnswerClarification: (clarificationId: string, answer: string) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
}): ReactElement {
  const approval = workpad.nextAction.approvalId ? approvals.find((item) => item.id === workpad.nextAction.approvalId) : undefined;
  const confirmedConstraints = workpad.intake.confirmedConstraints ?? [];
  const openQuestions = workpad.intake.openQuestions ?? [];
  const assumptions = workpad.intake.assumptions ?? [];
  const pendingClarifications = workpad.intake.pendingClarifications ?? [];
  return (
    <div className="workpad" data-testid="workpad-view">
      <section className="workpad-hero">
        <div>
          <span className={`workpad-state ${workpad.state}`}>{workpadStateLabel(workpad.state)}</span>
          <span className={`workpad-state user-state ${workpad.userStatus ?? "later"}`}>{workpad.userStatusLabel ?? userStatusLabel(workpad.userStatus)}</span>
          <h2>{workpad.title}</h2>
          <p>{workpad.subtitle}</p>
          {workpad.background && (workpad.background.runningCount + workpad.background.queuedCount + workpad.background.blockedCount + workpad.background.waitingDecisionCount) > 0 ? (
            <p className="workpad-background-summary" data-testid="workpad-background-summary">
              后台需求：{workpad.background.runningCount} 个处理中，{workpad.background.queuedCount} 个稍后处理，{workpad.background.blockedCount} 个需要修改或补证据，{workpad.background.waitingDecisionCount} 个等你确认
            </p>
          ) : null}
        </div>
        <WorkpadActionButton
          action={workpad.nextAction}
          approval={approval}
          busy={busy}
          onWorkflowAction={onWorkflowAction}
          onConfirmApproval={onConfirmApproval}
        />
      </section>

      {(workpad.pendingFeedback?.length || workpad.coderSelfTestSummary || workpad.postArchiveEvolutionCandidate) ? (
        <section className="workpad-section compact-section" data-testid="conversation-lifecycle">
          <div className="workpad-section-header">
            <h3>对话状态</h3>
            <span>{conversationLifecycleLabel(workpad.conversationLifecycle)}</span>
          </div>
          {workpad.pendingFeedback?.length ? (
            <div className="workpad-evidence-list">
              {workpad.pendingFeedback.map((feedback) => (
                <div className="workpad-evidence" key={feedback.id}>
                  <strong>已记录，将在下一轮生效</strong>
                  <span>{feedback.text}</span>
                </div>
              ))}
            </div>
          ) : null}
          {workpad.coderSelfTestSummary ? <p>{workpad.coderSelfTestSummary}</p> : null}
          {workpad.postArchiveEvolutionCandidate ? (
            <p>{workpad.postArchiveEvolutionCandidate.summary}</p>
          ) : null}
        </section>
      ) : null}

      {workpad.planningArtifactBundle ? (
        <section className="workpad-section" data-testid="planning-draft-card">
          <div className="workpad-section-header">
            <h3>{workpad.planningArtifactBundle.status === "confirmed" ? "已确认方案" : "方案草案"}</h3>
            <span>planning-agent</span>
          </div>
          <p className="workpad-goal">{workpad.planningArtifactBundle.goal}</p>
          <div className="workpad-chip-list">
            {workpad.planningArtifactBundle.acceptanceCriteria.slice(0, 5).map((item) => <span key={item}>{userFacingText(item)}</span>)}
          </div>
          <p>{workpad.planningArtifactBundle.design}</p>
          <div className="workpad-evidence-list">
            {workpad.planningArtifactBundle.tasks.map((task) => (
              <div className="workpad-evidence" key={task.id}>
                <strong>{task.id} {task.title}</strong>
                <span>{task.acIds.join(" · ")}</span>
              </div>
            ))}
          </div>
          {workpad.planningArtifactBundle.openQuestions.length > 0 ? (
            <ul className="workpad-issue-list">
              {workpad.planningArtifactBundle.openQuestions.map((item) => <li key={item}>{userFacingText(item)}</li>)}
            </ul>
          ) : null}
          {workpad.planningArtifactBundle.artifact ? <small className="artifact-link">查看证据：{artifactName(workpad.planningArtifactBundle.artifact)}</small> : null}
        </section>
      ) : null}

      {workpad.decompositionPlan ? (
        <section className="workpad-section" data-testid="decomposition-plan-card">
          <div className="workpad-section-header">
            <h3>拆分评估</h3>
            <span>{humanStatus(workpad.decompositionPlan.status)}</span>
          </div>
          <p className="workpad-goal">{decompositionRecommendationLabel(workpad.decompositionPlan.recommendation)}</p>
          <p>{userFacingText(workpad.decompositionPlan.rationale)}</p>
          <div className="workpad-chip-list">
            <span>{workpad.decompositionPlan.unitCount} 个候选单元</span>
            <span>{workpad.decompositionPlan.dependencyCount} 个依赖</span>
            <span>{workpad.decompositionPlan.openQuestionCount} 个待确认点</span>
          </div>
          <p>{userFacingText(workpad.decompositionPlan.riskSummary)}</p>
          {workpad.decompositionPlan.artifact ? <small className="artifact-link">查看证据：{artifactName(workpad.decompositionPlan.artifact)}</small> : null}
        </section>
      ) : null}

      {workpad.decompositionReadiness ? (
        <section className="workpad-section" data-testid="decomposition-readiness-card">
          <div className="workpad-section-header">
            <h3>执行边界</h3>
            <span>{humanStatus(workpad.decompositionReadiness.guardrailStatus)}</span>
          </div>
          <p className="workpad-goal">{decompositionReadinessLabel(workpad.decompositionReadiness.status)}</p>
          <div className="workpad-chip-list">
            <span>{workpad.decompositionReadiness.unitCount} 个单元</span>
            <span>{workpad.decompositionReadiness.schedulerEligible ? "可进入后续 proposal" : "不可直接调度"}</span>
            <span>{workflowActionLabel(workpad.decompositionReadiness.nextAllowedAction)}</span>
          </div>
          {workpad.decompositionReadiness.artifact ? <small className="artifact-link">查看证据：{artifactName(workpad.decompositionReadiness.artifact)}</small> : null}
        </section>
      ) : null}

      {workpad.taskQueueProposal ? (
        <section className="workpad-section" data-testid="taskqueue-proposal-card">
          <div className="workpad-section-header">
            <h3>TaskQueue 提案</h3>
            <span>{humanStatus(workpad.taskQueueProposal.status)}</span>
          </div>
          <p className="workpad-goal">{workpad.taskQueueProposal.queueMode === "sequential" ? "顺序执行候选" : workpad.taskQueueProposal.queueMode}</p>
          <div className="workpad-chip-list">
            <span>{workpad.taskQueueProposal.itemCount} 个任务</span>
            <span>{workpad.taskQueueProposal.dependencyCount} 个依赖</span>
            <span>{workpad.taskQueueProposal.conflictScopeCount} 个冲突范围</span>
          </div>
          {workpad.taskQueueProposal.artifact ? <small className="artifact-link">查看证据：{artifactName(workpad.taskQueueProposal.artifact)}</small> : null}
        </section>
      ) : null}

      {workpad.workflowGraphPlan ? (
        <section className="workpad-section" data-testid="workflow-graph-plan-card">
          <div className="workpad-section-header">
            <h3>执行图</h3>
            <span>{humanStatus(workpad.workflowGraphPlan.status)}</span>
          </div>
          <p className="workpad-goal">{workpad.workflowGraphPlan.graphMode === "sequential-v1" ? "顺序执行图 v1" : workpad.workflowGraphPlan.graphMode}</p>
          <div className="workpad-chip-list">
            <span>{workpad.workflowGraphPlan.nodeCount} 个节点</span>
            <span>{workpad.workflowGraphPlan.edgeCount} 条边</span>
            <span>{workpad.workflowGraphPlan.stageCount} 个阶段</span>
          </div>
          {workpad.workflowGraphPlan.artifact ? <small className="artifact-link">查看证据：{artifactName(workpad.workflowGraphPlan.artifact)}</small> : null}
        </section>
      ) : null}

      {workpad.rolePipeline ? (
        <section className="workpad-section" data-testid="role-pipeline-summary">
          <div className="workpad-section-header">
            <h3>角色流水线</h3>
            <span>{humanStatus(workpad.rolePipeline.status)}</span>
          </div>
          <div className="workpad-evidence-list">
            {workpad.rolePipeline.runs.map((run) => (
              <div className="workpad-evidence" key={`${run.roleId}:${run.runId ?? run.artifact ?? run.status}`}>
                <strong>{roleLabel(run.roleId)} · {humanStatus(run.status)}</strong>
                <span>{userFacingText(run.summary)}</span>
                {run.artifact ? <small className="artifact-link">查看证据：{artifactName(run.artifact)}</small> : null}
              </div>
            ))}
            {workpad.rolePipeline.agentTasks.slice(-6).map((task) => (
              <div className="workpad-evidence" key={task.id}>
                <strong>{roleLabel(task.roleId)} 任务 · {humanStatus(task.status)}</strong>
                <span>{userFacingText(task.resultSummary ?? task.summary)}</span>
                {task.evidenceRefs[0] ? <small className="artifact-link">查看证据：{artifactName(task.evidenceRefs[0])}</small> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {workpad.resultReview ? (
        <section className={`workpad-section result-review ${workpad.resultReview.status}`} data-testid="workpad-result-review-card">
          <div className="workpad-section-header">
            <h3>结果</h3>
            <span>{resultReviewStatusLabel(workpad.resultReview.status)}</span>
          </div>
          <p className="workpad-goal">{userFacingText(workpad.resultReview.title)}</p>
          <p>{userFacingText(workpad.resultReview.summary)}</p>
          {workpad.resultReview.changedFiles.length > 0 ? (
            <div className="workpad-chip-list" aria-label="Changed files">
              {workpad.resultReview.changedFiles.map((file) => <span key={file}>{file}</span>)}
            </div>
          ) : null}
          <div className="workpad-progress-grid">
            <WorkpadMetric label="验证" value={workpad.resultReview.validation ? humanStatus(workpad.resultReview.validation.status) : "未完成"} />
            <WorkpadMetric label="审查" value={workpad.resultReview.audit ? humanStatus(workpad.resultReview.audit.status) : "未完成"} />
            <WorkpadMetric label="应用状态" value={userFacingText(workpad.resultReview.applyReadiness.message ?? workpad.resultReview.applyReadiness.label)} />
          </div>
          {workpad.resultReview.audit?.notes.length ? (
            <ul className="workpad-issue-list">
              {workpad.resultReview.audit.notes.slice(0, 3).map((note) => <li key={note}>注意事项：{userFacingText(note)}</li>)}
            </ul>
          ) : null}
          {workpad.resultReview.applyReadiness.blockingIssues.length > 0 ? (
            <ul className="workpad-issue-list">
              {workpad.resultReview.applyReadiness.blockingIssues.slice(0, 3).map((issue) => <li key={issue}>{userFacingText(issue)}</li>)}
            </ul>
          ) : null}
          {workpad.resultReview.diffStat ? <pre className="result-diff-stat">{workpad.resultReview.diffStat}</pre> : null}
        </section>
      ) : null}

      {workpad.background?.items.length ? (
        <section className="workpad-section compact-section" data-testid="background-workpads">
          <div className="workpad-section-header">
            <h3>后台需求</h3>
            <span>{workpad.background.items.length}</span>
          </div>
          <div className="workpad-chip-list">
            {workpad.background.items.map((item) => (
              <span key={item.id}>{userFacingText(item.title)} · {item.userStatusLabel ?? workpadStatusLabel(item.runtimeStatus)}</span>
            ))}
          </div>
        </section>
      ) : null}

      {workpad.maintenance ? (
        <section className="workpad-section compact-section" data-testid="maintenance-summary">
          <div className="workpad-section-header">
            <h3>后台维护</h3>
            <span>{workpad.maintenance.closeoutCount ?? workpad.maintenance.ledgerCount}</span>
          </div>
          <p>{userFacingText(workpad.maintenance.note)}</p>
          <p className="panel-note">终态需求：{workpad.maintenance.closeoutCount ?? 0} · 待维护审查：{workpad.maintenance.unreviewedTerminalCount ?? 0}</p>
          {workpad.maintenance.latest ? (
            <div className="workpad-evidence">
              <strong>{userFacingText(workpad.maintenance.latest.eventType)}</strong>
              <span>{userFacingText(workpad.maintenance.latest.summary)}</span>
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="workpad-section">
        <div className="workpad-section-header">
          <h3>目标与当前理解</h3>
          <span>{sourceLabel(workpad.intake.source)}</span>
        </div>
        <p className="workpad-goal">{workpad.intake.goal}</p>
        <p>{workpad.intake.currentUnderstanding}</p>
        {confirmedConstraints.length > 0 ? (
          <div className="workpad-chip-list" aria-label="Confirmed constraints">
            {confirmedConstraints.map((constraint) => <span key={constraint}>{constraint}</span>)}
          </div>
        ) : null}
        {workpad.intake.relatedArtifacts.length > 0 ? (
          <div className="workpad-links">
            {workpad.intake.relatedArtifacts.map((artifact) => <span className="artifact-link" key={artifact}>查看证据：{artifactName(artifact)}</span>)}
          </div>
        ) : null}
      </section>

      {pendingClarifications.length > 0 ? (
        <section className="workpad-section">
          <div className="workpad-section-header">
            <h3>需要确认</h3>
            <span>{pendingClarifications.length}</span>
          </div>
          <div className="clarification-list">
            {pendingClarifications.map((clarification) => (
              <ClarificationCard
                key={clarification.id}
                clarification={clarification}
                busy={busy}
                onAnswer={onAnswerClarification}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section className="workpad-progress-grid" aria-label="需求进度">
        <WorkpadMetric label="需求说明" value={readinessLabel(workpad.progress.spec)} />
        <WorkpadMetric label="执行方案" value={readinessLabel(workpad.progress.plan)} />
        <WorkpadMetric label="任务" value={readinessLabel(workpad.progress.tasks)} />
        <WorkpadMetric label="验收 / 任务" value={`${workpad.progress.acCount} / ${workpad.progress.taskCount}`} />
        <WorkpadMetric label="执行" value={`${workpad.progress.runCount}${workpad.progress.latestRunStatus ? ` · ${humanStatus(workpad.progress.latestRunStatus)}` : ""}`} />
        <WorkpadMetric label="验证 / 审查" value={`${statusOrDash(workpad.progress.validationStatus)} / ${statusOrDash(workpad.progress.auditStatus)}`} />
      </section>

      {workpad.codingPackages.length > 0 ? (
        <section className="workpad-section">
          <div className="workpad-section-header">
            <h3>执行范围</h3>
            <span>{workpad.codingPackages.length} 个推荐执行单元</span>
          </div>
          <div className="coding-package-list">
            {workpad.codingPackages.map((item) => <CodingPackageCard key={item.id} item={item} />)}
          </div>
        </section>
      ) : null}

      {workpad.taskGraph.nodes.length > 0 ? (
        <section className="workpad-section">
          <div className="workpad-section-header">
            <h3>任务清单</h3>
            <span>{workpad.taskGraph.nodes.length} 个任务 · 来自已确认方案</span>
          </div>
          {workpad.taskQueue ? (
            <TaskQueuePanel
              queue={workpad.taskQueue}
              busy={busy}
              onWorkflowAction={onWorkflowAction}
              onSelectDecisionContext={onSelectDecisionContext}
              humanStatus={humanStatus}
              userFacingText={userFacingText}
            />
          ) : null}
          <div className="workpad-task-list">
            {workpad.taskGraph.nodes.map((task) => (
              <TaskGraphCard
                key={task.taskId}
                task={task}
                busy={busy}
                onWorkflowAction={onWorkflowAction}
                onSelectDecisionContext={onSelectDecisionContext}
              />
            ))}
          </div>
          {workpad.taskGraph.changeLevelEvidence.length > 0 ? (
            <div className="workpad-task-change-evidence">
              <strong>需求级证据</strong>
              {workpad.taskGraph.changeLevelEvidence.slice(0, 4).map((item) => (
                <span key={item.id}>{userFacingText(item.label)}{item.status ? ` · ${humanStatus(item.status)}` : ""}</span>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className="workpad-section">
        <div className="workpad-section-header">
          <h3>证据与决策</h3>
          <span>{workpad.evidence.length}</span>
        </div>
        {workpad.evidence.length === 0 ? <p className="panel-note">暂无执行、验证、审查或决策证据。</p> : null}
        <div className="workpad-evidence-list">
          {workpad.evidence.map((item) => (
            <div className="workpad-evidence" key={item.id}>
              <strong>{userFacingText(item.label)}</strong>
              <span>{sourceLabel(item.source)}{item.status ? ` · ${humanStatus(item.status)}` : ""}</span>
              {item.artifact ? <small className="artifact-link">查看证据：{artifactName(item.artifact)}</small> : null}
            </div>
          ))}
        </div>
      </section>

      {workpad.memoryIsolation ? (
        <section className="workpad-section" data-testid="memory-isolation">
          <div className="workpad-section-header">
            <h3>记忆边界</h3>
            <span>{workpad.memoryIsolation.currentChangeNamespace ?? "project"}</span>
          </div>
          <p>项目稳定记忆：{workpad.memoryIsolation.projectStableNamespace}</p>
          {workpad.memoryIsolation.runNamespaces.length > 0 ? <p>本需求运行证据：{workpad.memoryIsolation.runNamespaces.slice(0, 3).join("，")}</p> : null}
          {workpad.memoryIsolation.relatedWorkpads.length > 0 ? (
            <div className="workpad-links">
              {workpad.memoryIsolation.relatedWorkpads.map((item) => (
                <span className="artifact-link" key={item.changeId}>{userFacingText(item.title)} · {workpadStatusLabel(item.status)} · {item.factBoundary === "local-evidence-only" ? "局部证据" : "摘要可读"}</span>
              ))}
            </div>
          ) : null}
          <ul className="workpad-issue-list">
            {workpad.memoryIsolation.warnings.slice(0, 3).map((warning) => <li key={warning}>{userFacingText(warning)}</li>)}
          </ul>
        </section>
      ) : null}

      {(workpad.blockers.length > 0 || workpad.warnings.length > 0 || workpad.intake.missingInfo.length > 0 || openQuestions.length > 0 || assumptions.length > 0) ? (
        <section className="workpad-section">
          <div className="workpad-section-header">
            <h3>需要处理的问题</h3>
            <span>{workpad.blockers.length + workpad.warnings.length + workpad.intake.missingInfo.length + openQuestions.length + assumptions.length}</span>
          </div>
          <ul className="workpad-issue-list">
            {[...workpad.blockers, ...workpad.warnings, ...workpad.intake.missingInfo, ...openQuestions.map((item) => `待确认：${item}`), ...assumptions.map((item) => `假设：${item}`)].map((item, index) => <li key={`${item}:${index}`}>{userFacingText(item)}</li>)}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function CodingPackageCard({ item }: { item: WorkbenchCodingPackage }): ReactElement {
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
        <span>执行粒度：{codingPackageExecutionLabel(item.executionUnit)}</span>
        <span>分拆判断：{codingPackageSplitLabel(item.splitReadiness)}</span>
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
      <p className="panel-note">{item.splitRationale}</p>
      <p className="panel-note">{item.mergeRisk}</p>
      <p className="panel-note">5Y 只提供推荐执行单元；现有运行仍通过单任务或本地顺序执行入口触发，不提供执行单元级运行按钮。</p>
    </article>
  );
}

function TaskGraphCard({
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

function ClarificationCard({
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

function WorkpadActionButton({
  action,
  approval,
  busy,
  sanitizeInternal = false,
  onWorkflowAction,
  onConfirmApproval,
}: {
  action: WorkpadNextAction;
  approval?: Approval;
  busy: boolean;
  sanitizeInternal?: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onConfirmApproval: (approvalId: string) => void;
}): ReactElement {
  const disabled = busy || !action.enabled || action.kind === "none" || action.kind === "read-only";
  const format = sanitizeInternal ? parentSurfaceText : userFacingText;
  function run(): void {
    if (action.kind === "approval" && action.approvalId) {
      onConfirmApproval(action.approvalId);
      return;
    }
    if (action.kind === "workflow-action" && action.actionType) void onWorkflowAction(action.actionType, workflowActionPayloadFromScope(action));
  }
  return (
    <div className="workpad-next-action">
      <span>下一步</span>
      <strong>{format(approval?.action?.label ?? action.label)}</strong>
      <p>{format(action.description)}</p>
      <button className="primary-button" disabled={disabled} title={action.disabledReason} onClick={run}>
        {action.enabled ? "执行" : "不可执行"}
      </button>
    </div>
  );
}

function WorkpadMetric({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="workpad-metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
