import type { ReactElement } from "react";
import { TaskQueuePanel } from "../../TaskQueuePanel.js";
import {
  conversationLifecycleLabel,
  humanStatus,
  readinessLabel,
  resultReviewStatusLabel,
  roleLabel,
  statusOrDash,
  sourceLabel,
  userFacingText,
  userStatusLabel,
  workpadStateLabel,
  workpadStatusLabel,
} from "../../../formatters.js";
import type { Approval, Workpad } from "../../../types.js";
import { artifactName } from "../RunReplayPanel.js";
import { ControlledSchedulerReconfirmationCard, ControlledSchedulerStepReceiptCard, ControlledSchedulerStepTraceCard, GoalLoopEvidenceCard } from "./GoalLoopCards.js";
import {
  ClarificationCard,
  CodingPackageCard,
  TaskGraphCard,
  WorkpadMetric,
} from "./TaskGraphCards.js";
import {
  DecompositionPlanCard,
  DecompositionReadinessCard,
  PlanningArtifactBundleCard,
  SchedulerClaimReservationCard,
  SchedulerClaimReconcilePlanCard,
  SchedulerContractCard,
  SchedulerDispatchDryRunCard,
  SchedulerLaunchPreflightCard,
  SchedulerReconcileSnapshotCard,
  SchedulerRuntimeCard,
  SchedulerIntegrationCandidateCard,
  SchedulerIntegrationCheckHandoffCard,
  SchedulerIntegrationOutcomeCard,
  SchedulerRunCompletionCard,
  SchedulerRunBlockedCloseoutCard,
  SchedulerRunCard,
  SchedulerWorkerResultCard,
  SchedulerWorkerSessionPlanCard,
  SchedulerWorkerStartCard,
  SchedulerWorkerAuditCard,
  SchedulerWorkerReworkPlanCard,
  SchedulerWorkerReworkAuditCard,
  SchedulerWorkerReworkResultCard,
  SchedulerWorkerReworkValidationCard,
  SchedulerWorkerReworkStartCard,
  SchedulerWorkerValidationCard,
  TaskQueueProposalCard,
  WorkflowGraphPlanCard,
} from "./TypedWorkflowCards.js";
import { WorkpadActionButton } from "./WorkpadActionButton.js";

export function WorkpadDiagnosticDetails({
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
  const hideHeroAction = Boolean(workpad.controlledSchedulerReconfirmation);
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
        {hideHeroAction ? null : (
          <WorkpadActionButton
            action={workpad.nextAction}
            approval={approval}
            busy={busy}
            onWorkflowAction={onWorkflowAction}
            onConfirmApproval={onConfirmApproval}
          />
        )}
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

      {workpad.planningArtifactBundle ? <PlanningArtifactBundleCard bundle={workpad.planningArtifactBundle} /> : null}
      {workpad.decompositionPlan ? <DecompositionPlanCard plan={workpad.decompositionPlan} /> : null}
      {workpad.decompositionReadiness ? <DecompositionReadinessCard readiness={workpad.decompositionReadiness} /> : null}
      {workpad.taskQueueProposal ? <TaskQueueProposalCard proposal={workpad.taskQueueProposal} /> : null}
      {workpad.workflowGraphPlan ? <WorkflowGraphPlanCard graph={workpad.workflowGraphPlan} /> : null}
      {workpad.schedulerContract ? <SchedulerContractCard contract={workpad.schedulerContract} /> : null}
      {workpad.schedulerDispatchDryRun ? <SchedulerDispatchDryRunCard dryRun={workpad.schedulerDispatchDryRun} /> : null}
      {workpad.schedulerWorkerSessionPlan ? <SchedulerWorkerSessionPlanCard plan={workpad.schedulerWorkerSessionPlan} /> : null}
      {workpad.schedulerClaimReconcilePlan ? <SchedulerClaimReconcilePlanCard plan={workpad.schedulerClaimReconcilePlan} /> : null}
      {workpad.schedulerLaunchPreflight ? <SchedulerLaunchPreflightCard preflight={workpad.schedulerLaunchPreflight} /> : null}
      {workpad.schedulerRun ? <SchedulerRunCard run={workpad.schedulerRun} /> : null}
      {workpad.schedulerRuntime ? <SchedulerRuntimeCard runtime={workpad.schedulerRuntime} /> : null}
      {workpad.schedulerReconcileSnapshot ? <SchedulerReconcileSnapshotCard snapshot={workpad.schedulerReconcileSnapshot} /> : null}
      {workpad.schedulerClaimReservation ? <SchedulerClaimReservationCard reservation={workpad.schedulerClaimReservation} /> : null}
      {workpad.schedulerWorkerStart ? <SchedulerWorkerStartCard start={workpad.schedulerWorkerStart} /> : null}
      {workpad.schedulerWorkerResult ? <SchedulerWorkerResultCard result={workpad.schedulerWorkerResult} /> : null}
      {workpad.schedulerWorkerValidation ? <SchedulerWorkerValidationCard validation={workpad.schedulerWorkerValidation} /> : null}
      {workpad.schedulerWorkerAudit ? <SchedulerWorkerAuditCard audit={workpad.schedulerWorkerAudit} /> : null}
      {workpad.schedulerWorkerReworkPlan ? <SchedulerWorkerReworkPlanCard plan={workpad.schedulerWorkerReworkPlan} /> : null}
      {workpad.schedulerWorkerReworkStart ? <SchedulerWorkerReworkStartCard start={workpad.schedulerWorkerReworkStart} /> : null}
      {workpad.schedulerWorkerReworkResult ? <SchedulerWorkerReworkResultCard result={workpad.schedulerWorkerReworkResult} /> : null}
      {workpad.schedulerWorkerReworkValidation ? <SchedulerWorkerReworkValidationCard validation={workpad.schedulerWorkerReworkValidation} /> : null}
      {workpad.schedulerWorkerReworkAudit ? <SchedulerWorkerReworkAuditCard audit={workpad.schedulerWorkerReworkAudit} /> : null}
      {workpad.schedulerWorkerPaths?.length ? (
        <section className="workpad-section compact-section" data-testid="scheduler-worker-paths">
          <div className="workpad-section-header">
            <h3>Scheduler worker paths</h3>
            <span>{workpad.schedulerWorkerPaths.length} paths</span>
          </div>
          <div className="workpad-evidence-list">
            {workpad.schedulerWorkerPaths.map((path) => (
              <div className="workpad-evidence" key={path.start.id}>
                <strong>{path.start.nodeId} · {path.start.unitId}</strong>
                <span>{path.status}{path.terminal ? " · terminal" : " · active"}</span>
                <small>intent {path.start.reservationIntentId}</small>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      {workpad.schedulerIntegrationCandidate ? <SchedulerIntegrationCandidateCard candidate={workpad.schedulerIntegrationCandidate} /> : null}
      {workpad.schedulerIntegrationCheckHandoff ? <SchedulerIntegrationCheckHandoffCard handoff={workpad.schedulerIntegrationCheckHandoff} /> : null}
      {workpad.schedulerIntegrationOutcome ? <SchedulerIntegrationOutcomeCard outcome={workpad.schedulerIntegrationOutcome} /> : null}
      {workpad.schedulerRunCompletion ? <SchedulerRunCompletionCard completion={workpad.schedulerRunCompletion} /> : null}
      {workpad.schedulerRunBlockedCloseout ? <SchedulerRunBlockedCloseoutCard closeout={workpad.schedulerRunBlockedCloseout} /> : null}
      {workpad.goalLoop ? <GoalLoopEvidenceCard goalLoop={workpad.goalLoop} /> : null}
      {workpad.controlledSchedulerReconfirmation ? <ControlledSchedulerReconfirmationCard reconfirmation={workpad.controlledSchedulerReconfirmation} /> : null}
      {workpad.controlledSchedulerStepReceipt ? <ControlledSchedulerStepReceiptCard receipt={workpad.controlledSchedulerStepReceipt} /> : null}
      {workpad.controlledSchedulerStepTrace ? <ControlledSchedulerStepTraceCard trace={workpad.controlledSchedulerStepTrace} /> : null}

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
          <p className="panel-note">终态需求：{workpad.maintenance.closeoutCount ?? 0} · 待维护审查：{workpad.maintenance.unreviewedTerminalCount ?? 0} · 生命周期决议：{workpad.maintenance.resolutionCount ?? 0} · canonical 提案：{workpad.maintenance.proposalCount ?? 0} · patch 提案：{workpad.maintenance.patchProposalCount ?? 0} · 应用结果：{workpad.maintenance.applicationResultCount ?? 0}</p>
          {workpad.maintenance.latestPatchProposal ? (
            <p className="panel-note">
              <strong>{userFacingText(workpad.maintenance.latestPatchProposal.status)}</strong>
              <span>{userFacingText(workpad.maintenance.latestPatchProposal.summary)}</span>
            </p>
          ) : null}
          {workpad.maintenance.latestProposal ? (
            <p className="panel-note">
              <strong>{userFacingText(workpad.maintenance.latestProposal.status)}</strong>
              <span>{userFacingText(workpad.maintenance.latestProposal.summary)}</span>
            </p>
          ) : null}
          {workpad.maintenance.latestResolution ? (
            <div className="workpad-evidence">
              <strong>{userFacingText(workpad.maintenance.latestResolution.outcome)}</strong>
              <span>{userFacingText(workpad.maintenance.latestResolution.rationale)}</span>
            </div>
          ) : null}
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
