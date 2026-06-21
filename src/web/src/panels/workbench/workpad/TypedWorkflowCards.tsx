import type { ReactElement } from "react";
import { workflowActionLabel } from "../../../action-labels.js";
import {
  decompositionReadinessLabel,
  decompositionRecommendationLabel,
  humanStatus,
  userFacingText,
} from "../../../formatters.js";
import type { Workpad } from "../../../types.js";
import { artifactName } from "../RunReplayPanel.js";

export function PlanningArtifactBundleCard({ bundle }: { bundle: NonNullable<Workpad["planningArtifactBundle"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="planning-draft-card">
      <div className="workpad-section-header">
        <h3>{bundle.status === "confirmed" ? "已确认方案" : "方案草案"}</h3>
        <span>planning-agent</span>
      </div>
      <p className="workpad-goal">{bundle.goal}</p>
      <div className="workpad-chip-list">
        {bundle.acceptanceCriteria.slice(0, 5).map((item) => <span key={item}>{userFacingText(item)}</span>)}
      </div>
      <p>{bundle.design}</p>
      <div className="workpad-evidence-list">
        {bundle.tasks.map((task) => (
          <div className="workpad-evidence" key={task.id}>
            <strong>{task.id} {task.title}</strong>
            <span>{task.acIds.join(" · ")}</span>
          </div>
        ))}
      </div>
      {bundle.openQuestions.length > 0 ? (
        <ul className="workpad-issue-list">
          {bundle.openQuestions.map((item) => <li key={item}>{userFacingText(item)}</li>)}
        </ul>
      ) : null}
      {bundle.artifact ? <small className="artifact-link">查看证据：{artifactName(bundle.artifact)}</small> : null}
    </section>
  );
}

export function DecompositionPlanCard({ plan }: { plan: NonNullable<Workpad["decompositionPlan"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="decomposition-plan-card">
      <div className="workpad-section-header">
        <h3>拆分评估</h3>
        <span>{humanStatus(plan.status)}</span>
      </div>
      <p className="workpad-goal">{decompositionRecommendationLabel(plan.recommendation)}</p>
      <p>{userFacingText(plan.rationale)}</p>
      <div className="workpad-chip-list">
        <span>{plan.unitCount} 个候选单元</span>
        <span>{plan.dependencyCount} 个依赖</span>
        <span>{plan.openQuestionCount} 个待确认点</span>
      </div>
      <p>{userFacingText(plan.riskSummary)}</p>
      {plan.artifact ? <small className="artifact-link">查看证据：{artifactName(plan.artifact)}</small> : null}
    </section>
  );
}

export function DecompositionReadinessCard({ readiness }: { readiness: NonNullable<Workpad["decompositionReadiness"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="decomposition-readiness-card">
      <div className="workpad-section-header">
        <h3>执行边界</h3>
        <span>{humanStatus(readiness.guardrailStatus)}</span>
      </div>
      <p className="workpad-goal">{decompositionReadinessLabel(readiness.status)}</p>
      <div className="workpad-chip-list">
        <span>{readiness.unitCount} 个单元</span>
        <span>{readiness.schedulerEligible ? (readiness.nextAllowedAction === "scheduler.contract" ? "可编译调度合同" : "可进入后续 proposal") : "不可直接调度"}</span>
        <span>{workflowActionLabel(readiness.nextAllowedAction)}</span>
      </div>
      {readiness.artifact ? <small className="artifact-link">查看证据：{artifactName(readiness.artifact)}</small> : null}
    </section>
  );
}

export function TaskQueueProposalCard({ proposal }: { proposal: NonNullable<Workpad["taskQueueProposal"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="taskqueue-proposal-card">
      <div className="workpad-section-header">
        <h3>TaskQueue 提案</h3>
        <span>{humanStatus(proposal.status)}</span>
      </div>
      <p className="workpad-goal">{proposal.queueMode === "sequential" ? "顺序执行候选" : proposal.queueMode}</p>
      <div className="workpad-chip-list">
        <span>{proposal.itemCount} 个任务</span>
        <span>{proposal.dependencyCount} 个依赖</span>
        <span>{proposal.conflictScopeCount} 个冲突范围</span>
      </div>
      {proposal.artifact ? <small className="artifact-link">查看证据：{artifactName(proposal.artifact)}</small> : null}
    </section>
  );
}

export function WorkflowGraphPlanCard({ graph }: { graph: NonNullable<Workpad["workflowGraphPlan"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="workflow-graph-plan-card">
      <div className="workpad-section-header">
        <h3>执行图</h3>
        <span>{humanStatus(graph.status)}</span>
      </div>
      <p className="workpad-goal">{graph.graphMode === "sequential-v1" ? "顺序执行图 v1" : graph.graphMode}</p>
      <div className="workpad-chip-list">
        <span>{graph.nodeCount} 个节点</span>
        <span>{graph.edgeCount} 条边</span>
        <span>{graph.stageCount} 个阶段</span>
      </div>
      {graph.artifact ? <small className="artifact-link">查看证据：{artifactName(graph.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerContractCard({ contract }: { contract: NonNullable<Workpad["schedulerContract"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-contract-card">
      <div className="workpad-section-header">
        <h3>Scheduler Contract</h3>
        <span>{humanStatus(contract.status)}</span>
      </div>
      <p className="workpad-goal">{contract.schedulerMode === "parallel-readiness-v1" ? "并行调度合同 v1（不启动执行）" : contract.schedulerMode}</p>
      <div className="workpad-chip-list">
        <span>{contract.nodeCount} 个节点</span>
        <span>{contract.waveCount} 个 wave</span>
        <span>{contract.dependencyCount} 条依赖</span>
        <span>{contract.conflictCount} 个冲突范围</span>
      </div>
      {contract.artifact ? <small className="artifact-link">查看证据：{artifactName(contract.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerDispatchDryRunCard({ dryRun }: { dryRun: NonNullable<Workpad["schedulerDispatchDryRun"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-dispatch-dry-run-card">
      <div className="workpad-section-header">
        <h3>调度预演</h3>
        <span>{humanStatus(dryRun.status)}</span>
      </div>
      <p className="workpad-goal">dispatch / reconcile dry-run（不启动执行）</p>
      <div className="workpad-chip-list">
        <span>{dryRun.waveCount} 个 wave</span>
        <span>{dryRun.nodeCount} 个节点</span>
        <span>最大并发候选 {dryRun.estimatedMaxWaveWidth}</span>
        <span>{dryRun.blockedCount} 个阻塞</span>
        <span>{dryRun.prerequisiteCount} 个前置条件</span>
      </div>
      {dryRun.artifact ? <small className="artifact-link">查看证据：{artifactName(dryRun.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerWorkerSessionPlanCard({ plan }: { plan: NonNullable<Workpad["schedulerWorkerSessionPlan"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-worker-session-plan-card">
      <div className="workpad-section-header">
        <h3>Worker Session Plan</h3>
        <span>{humanStatus(plan.status)}</span>
      </div>
      <p className="workpad-goal">worker session / workspace / permission / event / recovery contract（不启动执行）</p>
      <div className="workpad-chip-list">
        <span>{plan.plannedWorkerCount} 个 worker</span>
        <span>{plan.stageCount} 个阶段</span>
        <span>{plan.blockedCount} 个阻塞</span>
        <span>{plan.warningCount} 个 warning</span>
        <span>恢复键 {plan.recoveryKeyCoverage === "complete" ? "完整" : "部分"}</span>
      </div>
      {plan.artifact ? <small className="artifact-link">查看证据：{artifactName(plan.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerClaimReconcilePlanCard({ plan }: { plan: NonNullable<Workpad["schedulerClaimReconcilePlan"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-claim-reconcile-plan-card">
      <div className="workpad-section-header">
        <h3>Claim / Reconcile Plan</h3>
        <span>{humanStatus(plan.status)}</span>
      </div>
      <p className="workpad-goal">claim eligibility / source lock / slot demand / reconcile checkpoint contract（不启动执行）</p>
      <div className="workpad-chip-list">
        <span>{plan.waveCount} 个 wave</span>
        <span>{plan.claimIntentCount} 个 claim intent</span>
        <span>最大计划宽度 {plan.maxPlannedWaveWidth}</span>
        <span>{plan.blockedCount} 个阻塞</span>
        <span>恢复覆盖 {plan.recoveryKeyCoverage === "complete" ? "完整" : "部分"}</span>
      </div>
      {plan.artifact ? <small className="artifact-link">查看证据：{artifactName(plan.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerLaunchPreflightCard({ preflight }: { preflight: NonNullable<Workpad["schedulerLaunchPreflight"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-launch-preflight-card">
      <div className="workpad-section-header">
        <h3>Launch Preflight</h3>
        <span>{humanStatus(preflight.status)}</span>
      </div>
      <p className="workpad-goal">启动前检查合同（不授权、不启动执行）</p>
      <div className="workpad-chip-list">
        <span>{preflight.claimIntentCount} 个 claim intent</span>
        <span>计划槽位 {preflight.plannedSlotDemand}</span>
        <span>最大计划宽度 {preflight.maxPlannedWaveWidth}</span>
        <span>{preflight.blockedCount} 个阻塞</span>
        <span>{preflight.humanGateRequired ? "需要 human gate" : "human gate 未要求"}</span>
      </div>
      {preflight.artifact ? <small className="artifact-link">查看证据：{artifactName(preflight.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerRunCard({ run }: { run: NonNullable<Workpad["schedulerRun"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-run-card">
      <div className="workpad-section-header">
        <h3>SchedulerRun</h3>
        <span>{humanStatus(run.status)}</span>
      </div>
      <p className="workpad-goal">调度运行记录壳（不启动并行执行）</p>
      <div className="workpad-chip-list">
        <span>{run.claimIntentCount} 个 claim intent</span>
        <span>计划槽位 {run.plannedSlotDemand}</span>
        <span>最大计划宽度 {run.maxPlannedWaveWidth}</span>
        <span>{run.blockedCount} 个阻塞</span>
        <span>{run.journalEventCount} 条 journal event</span>
        <span>{run.futureHumanGateRequired ? "未来仍需 human gate" : "human gate 未要求"}</span>
      </div>
      {run.artifact ? <small className="artifact-link">查看证据：{artifactName(run.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerRuntimeCard({ runtime }: { runtime: NonNullable<Workpad["schedulerRuntime"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-runtime-card">
      <div className="workpad-section-header">
        <h3>Scheduler Runtime 壳</h3>
        <span>{humanStatus(runtime.status)}</span>
      </div>
      <p className="workpad-goal">runtime sidecar / journal shell（不启动并行执行）</p>
      <div className="workpad-chip-list">
        <span>{runtime.waveCount} 个 wave</span>
        <span>{runtime.claimIntentCount} 个 claim intent</span>
        <span>计划槽位 {runtime.plannedSlotDemand}</span>
        <span>最大计划宽度 {runtime.maxPlannedWaveWidth}</span>
        <span>{runtime.blockedCount} 个阻塞</span>
        <span>{runtime.lastReconcileSnapshotId ? "已有 reconcile snapshot" : "尚未 reconcile"}</span>
      </div>
      {runtime.artifact ? <small className="artifact-link">查看证据：{artifactName(runtime.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerControlledStepEvidenceCard({ step }: { step: NonNullable<Workpad["schedulerControlledStepEvidence"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-controlled-step-evidence-card">
      <div className="workpad-section-header">
        <h3>受控步骤运行证据</h3>
        <span>{humanStatus(step.status)}</span>
      </div>
      <p className="workpad-goal">已执行一个用户确认的 Scheduler 步骤，并在完成后停止</p>
      <p className="workpad-note">只读 runtime evidence；不授权自动循环、批量派发、slot 分配、source apply、close、merge、远端落地或 Harness evolution。</p>
      <div className="workpad-chip-list">
        <span>执行：{step.executedActionType}</span>
        <span>后续状态：{step.postStepStatus}</span>
        {step.nextCandidateActionType ? <span>下一候选：{step.nextCandidateActionType}</span> : null}
        <span>{step.humanConfirmationStillRequired ? "继续仍需确认" : "等待证据"}</span>
        <span>{step.needsReevaluation ? "需要复核" : "已刷新"}</span>
        {controlledStepResultChips(step.controlledStepResultSummary).map((chip) => (
          <span key={chip}>{chip}</span>
        ))}
      </div>
      {step.controlledLoopTurnRouteSummary ? (
        <div className="workpad-evidence-list">
          <div className="workpad-evidence">
            <strong>受控路线</strong>
            <span>{controlledLoopTurnRouteLabel(step.controlledLoopTurnRouteSummary.routePosture)}</span>
          </div>
          <div className="workpad-evidence">
            <strong>执行结果</strong>
            <span>{controlledLoopTurnResultText(step.controlledLoopTurnRouteSummary)}</span>
          </div>
          <div className="workpad-evidence">
            <strong>下一确认</strong>
            <span>{step.controlledLoopTurnRouteSummary.nextCandidateActionType ? workflowActionLabel(step.controlledLoopTurnRouteSummary.nextCandidateActionType) : "等待新的证据"}</span>
          </div>
        </div>
      ) : null}
      {step.controlledLoopTick ? (
        <div className="workpad-evidence-list" data-testid="scheduler-controlled-loop-tick-summary">
          <div className="workpad-evidence">
            <strong>受控 tick</strong>
            <span>{controlledLoopTickPhaseText(step.controlledLoopTick)}</span>
          </div>
          <div className="workpad-evidence">
            <strong>停止原因</strong>
            <span>{controlledLoopTickStopText(step.controlledLoopTick)}</span>
          </div>
          <div className="workpad-evidence">
            <strong>权限边界</strong>
            <span>不授权自动循环、批量派发或 source 变更</span>
          </div>
        </div>
      ) : null}
      {step.controlledLoopStopSummary ? (
        <div className="workpad-evidence-list" data-testid="scheduler-controlled-loop-stop-summary">
          <div className="workpad-evidence">
            <strong>停止位置</strong>
            <span>{controlledLoopStopPositionText(step.controlledLoopStopSummary)}</span>
          </div>
          <div className="workpad-evidence">
            <strong>下一确认</strong>
            <span>{step.controlledLoopStopSummary.nextGateActionType ? workflowActionLabel(step.controlledLoopStopSummary.nextGateActionType) : "等待新的证据"}</span>
          </div>
          <div className="workpad-evidence">
            <strong>停止原因</strong>
            <span>{userFacingText(step.controlledLoopStopSummary.userFacingReason)}</span>
          </div>
          <div className="workpad-evidence">
            <strong>继续边界</strong>
            <span>只能通过右侧确认区继续；不会自动循环、批量派发、应用源码、关闭需求或远端落地</span>
          </div>
        </div>
      ) : null}
      {step.controlledLoopContinuationReadiness ? (
        <div className="workpad-evidence-list" data-testid="scheduler-controlled-loop-continuation-readiness">
          <div className="workpad-evidence">
            <strong>继续状态</strong>
            <span>{controlledLoopContinuationReadinessStatusText(step.controlledLoopContinuationReadiness)}</span>
          </div>
          <div className="workpad-evidence">
            <strong>下一确认</strong>
            <span>{step.controlledLoopContinuationReadiness.nextCandidateActionType ? workflowActionLabel(step.controlledLoopContinuationReadiness.nextCandidateActionType) : "等待新的证据"}</span>
          </div>
          <div className="workpad-evidence">
            <strong>继续边界</strong>
            <span>仍需右侧确认区单独确认；不会自动循环、批量派发、应用源码、关闭需求或远端落地</span>
          </div>
        </div>
      ) : null}
      {step.controlledLoopIteration ? (
        <div className="workpad-evidence-list" data-testid="scheduler-controlled-loop-iteration-summary">
          <div className="workpad-evidence">
            <strong>受控迭代</strong>
            <span>{controlledLoopIterationStatusText(step.controlledLoopIteration)}</span>
          </div>
          <div className="workpad-evidence">
            <strong>迭代阶段</strong>
            <span>{controlledLoopIterationPhaseText(step.controlledLoopIteration)}</span>
          </div>
          <div className="workpad-evidence">
            <strong>迭代边界</strong>
            <span>只汇总本次人工确认步骤；下一步仍需既有确认门和 ToolPolicy 路径</span>
          </div>
        </div>
      ) : null}
      {step.controlledLoopBoundaryResult ? (
        <div className="workpad-evidence-list" data-testid="scheduler-controlled-loop-boundary-result">
          <div className="workpad-evidence">
            <strong>循环边界</strong>
            <span>{controlledLoopBoundaryResultText(step.controlledLoopBoundaryResult)}</span>
          </div>
          <div className="workpad-evidence">
            <strong>下一确认</strong>
            <span>{step.controlledLoopBoundaryResult.nextGateActionType ? workflowActionLabel(step.controlledLoopBoundaryResult.nextGateActionType) : "等待新的证据"}</span>
          </div>
          <div className="workpad-evidence">
            <strong>继续要求</strong>
            <span>继续前必须重新读取 fresh Goal Loop、当前确认门、ToolPolicy 和人工确认状态</span>
          </div>
        </div>
      ) : null}
      {step.controlledLoopRuntimeBoundary ? (
        <div className="workpad-evidence-list" data-testid="scheduler-controlled-loop-runtime-boundary">
          <div className="workpad-evidence">
            <strong>运行边界证据</strong>
            <span>{controlledLoopRuntimeBoundaryText(step.controlledLoopRuntimeBoundary)}</span>
          </div>
          <div className="workpad-evidence">
            <strong>下一确认</strong>
            <span>{step.controlledLoopRuntimeBoundary.nextGateActionType ? workflowActionLabel(step.controlledLoopRuntimeBoundary.nextGateActionType) : "等待新的证据"}</span>
          </div>
          <div className="workpad-evidence">
            <strong>证据性质</strong>
            <span>这是上一轮受控步骤 evidence summary；继续前必须重新读取 fresh Goal Loop、当前确认门、ToolPolicy 和人工确认状态</span>
          </div>
        </div>
      ) : null}
      {step.warning ? <p className="workpad-note">{step.warning}</p> : null}
      {step.artifact ? <small className="artifact-link">查看证据：{artifactName(step.artifact)}</small> : null}
    </section>
  );
}

type ControlledLoopTurnRouteSummary = NonNullable<NonNullable<Workpad["schedulerControlledStepEvidence"]>["controlledLoopTurnRouteSummary"]>;
type ControlledLoopTickSummary = NonNullable<NonNullable<Workpad["schedulerControlledStepEvidence"]>["controlledLoopTick"]>;
type ControlledLoopContinuationReadiness = NonNullable<NonNullable<Workpad["schedulerControlledStepEvidence"]>["controlledLoopContinuationReadiness"]>;
type ControlledLoopIterationSummary = NonNullable<NonNullable<Workpad["schedulerControlledStepEvidence"]>["controlledLoopIteration"]>;
type ControlledLoopStopSummary = NonNullable<NonNullable<Workpad["schedulerControlledStepEvidence"]>["controlledLoopStopSummary"]>;
type ControlledLoopBoundaryResult = NonNullable<NonNullable<Workpad["schedulerControlledStepEvidence"]>["controlledLoopBoundaryResult"]>;
type ControlledLoopRuntimeBoundary = NonNullable<NonNullable<Workpad["schedulerControlledStepEvidence"]>["controlledLoopRuntimeBoundary"]>;

function controlledLoopTickPhaseText(tick: ControlledLoopTickSummary): string {
  return [
    `观察 ${tick.observe.status}`,
    `检查 ${tick.chooseCheck.status}`,
    `派发 ${tick.dispatch.status}`,
    `复核 ${tick.reconcile.status}`,
  ].join(" / ");
}

function controlledLoopTickStopText(tick: ControlledLoopTickSummary): string {
  return `${controlledLoopTurnRouteLabel(tick.routeStop.routePosture)}：${tick.routeStop.stopReason}`;
}

function controlledLoopContinuationStatusLabel(status: ControlledLoopContinuationReadiness["status"]): string {
  switch (status) {
    case "ready-for-human-gate":
      return "下一步已准备好，但必须再次人工确认";
    case "needs-review":
      return "下一步需要复核当前证据";
    case "quality-routing":
      return "当前应先处理质量 / rework 证据";
    case "integration-barrier":
      return "当前停在 IntegrationCheck barrier";
    case "terminal-handoff":
      return "当前停在终态 handoff";
    case "waiting":
      return "等待新的证据";
  }
}

function controlledLoopContinuationReadinessStatusText(readiness: ControlledLoopContinuationReadiness): string {
  return controlledLoopContinuationStatusLabel(readiness.status);
}

function controlledLoopStopPositionText(summary: ControlledLoopStopSummary): string {
  const posture = controlledLoopTurnRouteLabel(summary.routePosture);
  const readiness = controlledLoopContinuationStatusLabel(summary.continuationReadinessStatus);
  return `${posture} / ${readiness}`;
}

function controlledLoopIterationStatusText(iteration: ControlledLoopIterationSummary): string {
  const route = controlledLoopTurnRouteLabel(iteration.routePosture);
  const readiness = controlledLoopContinuationStatusLabel(iteration.continuationReadinessStatus);
  return `${iteration.status === "completed" ? "已完成一次受控迭代" : "已完成一次受控迭代但需复核"} / ${route} / ${readiness}`;
}

function controlledLoopIterationPhaseText(iteration: ControlledLoopIterationSummary): string {
  return [
    `观察 ${iteration.observeStatus}`,
    `检查 ${iteration.chooseCheckStatus}`,
    `派发 ${iteration.dispatchStatus}`,
    `复核 ${iteration.reconcileStatus}`,
  ].join(" / ");
}

function controlledLoopBoundaryResultText(result: ControlledLoopBoundaryResult): string {
  return [
    controlledLoopTurnRouteLabel(result.boundaryPosture),
    result.continuationReadinessStatus,
    result.futureContinuationRequiresFreshEvidence ? "需重新取证" : "等待证据",
  ].join(" / ");
}

function controlledLoopRuntimeBoundaryText(boundary: ControlledLoopRuntimeBoundary): string {
  return [
    controlledLoopTurnRouteLabel(boundary.stopPosture),
    boundary.continuationReadinessStatus,
    boundary.priorTurnEvidence ? "上一轮证据" : "等待证据",
    boundary.freshEvidenceRequiredBeforeContinuation ? "继续前需 fresh evidence" : "等待证据",
  ].join(" / ");
}

function controlledLoopTurnRouteLabel(posture: ControlledLoopTurnRouteSummary["routePosture"]): string {
  switch (posture) {
    case "awaiting-human-gate":
      return "已停在下一次人工确认";
    case "recommending-gate":
      return "已给出下一步候选，仍需检查";
    case "quality-routing":
      return "已停在质量 / rework 路由";
    case "integration-barrier":
      return "已停在 IntegrationCheck barrier";
    case "terminal-handoff":
      return "已停在终态 handoff";
    case "waiting":
      return "等待新的证据";
  }
}

function controlledLoopTurnResultText(route: ControlledLoopTurnRouteSummary): string {
  const parts = [
    route.resultKind,
    route.resultId,
    route.resultStatus,
  ].filter(Boolean);
  return parts.length ? parts.join(" / ") : "无可展示结果";
}

function controlledStepResultChips(summary: NonNullable<Workpad["schedulerControlledStepEvidence"]>["controlledStepResultSummary"]): string[] {
  if (!summary) return [];
  return Object.entries(summary)
    .filter(([key]) => key !== "resultArtifact")
    .slice(0, 4)
    .map(([key, value]) => `${controlledStepResultLabel(key)}：${controlledStepResultValue(value)}`);
}

function controlledStepResultLabel(key: string): string {
  if (key === "resultKind") return "产物";
  return key
    .replace(/^scheduler/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\bId\b/g, "ID")
    .replace(/\bStatus\b/g, "状态")
    .trim();
}

function controlledStepResultValue(value: string | number | boolean | string[] | null): string {
  if (Array.isArray(value)) return value.join(", ");
  if (value === null) return "none";
  return String(value);
}

export function SchedulerReconcileSnapshotCard({ snapshot }: { snapshot: NonNullable<Workpad["schedulerReconcileSnapshot"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-reconcile-snapshot-card">
      <div className="workpad-section-header">
        <h3>Reconcile Snapshot</h3>
        <span>{humanStatus(snapshot.status)}</span>
      </div>
      <p className="workpad-goal">只读 reconcile snapshot（不 claim、不占 slot、不启动 worker）</p>
      <div className="workpad-chip-list">
        <span>{snapshot.waveCount} 个 wave</span>
        <span>{snapshot.claimIntentCount} 个 claim intent</span>
        <span>计划槽位 {snapshot.plannedSlotDemand}</span>
        <span>最大计划宽度 {snapshot.maxPlannedWaveWidth}</span>
        <span>{snapshot.blockedCount} 个阻塞</span>
        <span>{snapshot.warningCount} 个 warning</span>
      </div>
      {snapshot.artifact ? <small className="artifact-link">查看证据：{artifactName(snapshot.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerClaimReservationCard({ reservation }: { reservation: NonNullable<Workpad["schedulerClaimReservation"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-claim-reservation-card">
      <div className="workpad-section-header">
        <h3>Claim Reservation</h3>
        <span>{humanStatus(reservation.status)}</span>
      </div>
      <p className="workpad-goal">runtime claim reservation evidence（不创建 lease、slot、worker 或 TaskRun）</p>
      <div className="workpad-chip-list">
        <span>Wave {reservation.waveIndex + 1}</span>
        <span>{reservation.reservedCount} 个 reserved</span>
        <span>{reservation.blockedCount} 个 blocked</span>
        <span>{reservation.sourceLockCount} 个 source lock</span>
        <span>{reservation.supersedesReservationId ? "取代旧 reservation" : "首个 reservation"}</span>
      </div>
      {reservation.artifact ? <small className="artifact-link">查看证据：{artifactName(reservation.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerWorkerStartCard({ start }: { start: NonNullable<Workpad["schedulerWorkerStart"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-worker-start-card">
      <div className="workpad-section-header">
        <h3>第一个 worker</h3>
        <span>{humanStatus(start.status)}</span>
      </div>
      <p className="workpad-goal">{start.nodeId} / {start.unitId} / coder stage</p>
      <div className="workpad-chip-list">
        <span>TaskRun {start.taskRunId}</span>
        <span>WorkerLease {start.workerLeaseId}</span>
        {start.worktreeId ? <span>worktree {start.worktreeId}</span> : null}
        {start.runId ? <span>code run {start.runId}</span> : null}
      </div>
      {start.artifact ? <small className="artifact-link">查看证据：{artifactName(start.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerWorkerResultCard({ result }: { result: NonNullable<Workpad["schedulerWorkerResult"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-worker-result-card">
      <div className="workpad-section-header">
        <h3>第一个 worker 结果</h3>
        <span>{humanStatus(result.status)}</span>
      </div>
      <p className="workpad-goal">{result.nodeId} / {result.unitId} / coder result evidence</p>
      <div className="workpad-chip-list">
        <span>TaskRun {result.taskRunStatus}</span>
        <span>WorkerLease {result.workerLeaseStatus}</span>
        {result.worktreeId ? <span>worktree {result.worktreeId}</span> : null}
        {result.runId ? <span>code run {result.runStatus ?? result.runId}</span> : null}
      </div>
      {result.artifact ? <small className="artifact-link">查看证据：{artifactName(result.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerWorkerValidationCard({ validation }: { validation: NonNullable<Workpad["schedulerWorkerValidation"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-worker-validation-card">
      <div className="workpad-section-header">
        <h3>第一个 worker 验证</h3>
        <span>{humanStatus(validation.status)}</span>
      </div>
      <p className="workpad-goal">{validation.nodeId} / {validation.unitId} / validation evidence</p>
      <div className="workpad-chip-list">
        <span>TaskRun {validation.taskRunStatus}</span>
        <span>worktree {validation.worktreeId}</span>
        <span>code run {validation.codeRunId}</span>
        <span>validation run {validation.validationRunId}</span>
      </div>
      {validation.artifact ? <small className="artifact-link">查看证据：{artifactName(validation.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerWorkerAuditCard({ audit }: { audit: NonNullable<Workpad["schedulerWorkerAudit"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-worker-audit-card">
      <div className="workpad-section-header">
        <h3>第一个 worker 审计</h3>
        <span>{humanStatus(audit.status)}</span>
      </div>
      <p className="workpad-goal">{audit.nodeId} / {audit.unitId} / audit evidence</p>
      <div className="workpad-chip-list">
        <span>TaskRun {audit.taskRunStatus}</span>
        <span>worktree {audit.worktreeId}</span>
        <span>validation run {audit.validationRunId}</span>
        <span>audit run {audit.auditRunId}</span>
      </div>
      {audit.artifact ? <small className="artifact-link">查看证据：{artifactName(audit.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerWorkerReworkPlanCard({ plan }: { plan: NonNullable<Workpad["schedulerWorkerReworkPlan"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-worker-rework-plan-card">
      <div className="workpad-section-header">
        <h3>第一个 worker rework 计划</h3>
        <span>{humanStatus(plan.blockingSource)}</span>
      </div>
      <p className="workpad-goal">{plan.nodeId} / {plan.unitId} / bounded rework plan</p>
      <div className="workpad-chip-list">
        <span>TaskRun {plan.taskRunStatus}</span>
        <span>worktree {plan.targetWorktreeId}</span>
        <span>future gate {plan.futureCodeGateMode}</span>
      </div>
      <p className="workpad-note">{plan.reworkReason}</p>
      {plan.artifact ? <small className="artifact-link">查看证据：{artifactName(plan.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerWorkerReworkStartCard({ start }: { start: NonNullable<Workpad["schedulerWorkerReworkStart"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-worker-rework-start-card">
      <div className="workpad-section-header">
        <h3>第一个 worker rework</h3>
        <span>{humanStatus(start.status)}</span>
      </div>
      <p className="workpad-goal">{start.nodeId} / {start.unitId} / same-worktree rework</p>
      <div className="workpad-chip-list">
        <span>worktree {start.worktreeId}</span>
        <span>rework TaskRun {start.reworkTaskRunId}</span>
        <span>rework lease {start.reworkWorkerLeaseId}</span>
        {start.reworkRunId ? <span>rework run {start.reworkRunId}</span> : null}
      </div>
      {start.artifact ? <small className="artifact-link">查看证据：{artifactName(start.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerWorkerReworkResultCard({ result }: { result: NonNullable<Workpad["schedulerWorkerReworkResult"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-worker-rework-result-card">
      <div className="workpad-section-header">
        <h3>第一个 worker rework 结果</h3>
        <span>{humanStatus(result.status)}</span>
      </div>
      <p className="workpad-goal">{result.nodeId} / {result.unitId} / rework result evidence</p>
      <div className="workpad-chip-list">
        <span>TaskRun {result.taskRunStatus}</span>
        <span>lease {result.workerLeaseStatus}</span>
        <span>worktree {result.worktreeId}</span>
        {result.reworkRunId ? <span>rework run {result.reworkRunId}</span> : null}
      </div>
      {result.failureReason ? <p className="workpad-note">{result.failureReason}</p> : null}
      {result.artifact ? <small className="artifact-link">查看证据：{artifactName(result.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerWorkerReworkValidationCard({ validation }: { validation: NonNullable<Workpad["schedulerWorkerReworkValidation"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-worker-rework-validation-card">
      <div className="workpad-section-header">
        <h3>第一个 worker rework 验证</h3>
        <span>{humanStatus(validation.status)}</span>
      </div>
      <p className="workpad-goal">{validation.nodeId} / {validation.unitId} / rework validation evidence</p>
      <div className="workpad-chip-list">
        <span>TaskRun {validation.taskRunStatus}</span>
        <span>worktree {validation.worktreeId}</span>
        <span>rework run {validation.reworkRunId}</span>
        <span>validation run {validation.validationRunId}</span>
      </div>
      {validation.failureReason ? <p className="workpad-note">{validation.failureReason}</p> : null}
      {validation.artifact ? <small className="artifact-link">查看证据：{artifactName(validation.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerWorkerReworkAuditCard({ audit }: { audit: NonNullable<Workpad["schedulerWorkerReworkAudit"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-worker-rework-audit-card">
      <div className="workpad-section-header">
        <h3>第一个 worker rework 审计</h3>
        <span>{humanStatus(audit.status)}</span>
      </div>
      <p className="workpad-goal">{audit.nodeId} / {audit.unitId} / rework audit evidence</p>
      <div className="workpad-chip-list">
        <span>TaskRun {audit.taskRunStatus}</span>
        <span>worktree {audit.worktreeId}</span>
        <span>validation run {audit.validationRunId}</span>
        <span>audit run {audit.auditRunId}</span>
      </div>
      {audit.failureReason ? <p className="workpad-note">{audit.failureReason}</p> : null}
      {audit.artifact ? <small className="artifact-link">查看证据：{artifactName(audit.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerIntegrationCandidateCard({ candidate }: { candidate: NonNullable<Workpad["schedulerIntegrationCandidate"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-integration-candidate-card">
      <div className="workpad-section-header">
        <h3>Integration 候选</h3>
        <span>{humanStatus(candidate.status)}</span>
      </div>
      <p className="workpad-goal">scheduler worker 输出已接回 apply readiness gate（不运行 IntegrationCheck）</p>
      <div className="workpad-chip-list">
        <span>{candidate.readyCount} 个 ready target</span>
        <span>{candidate.blockedCount} 个 blocked output</span>
        <span>{candidate.readyWorktreeIds.length ? `ready: ${candidate.readyWorktreeIds.join(", ")}` : "ready: none"}</span>
      </div>
      {candidate.waitingReason ? <p>{candidate.waitingReason}</p> : null}
      {candidate.artifact ? <small className="artifact-link">查看证据：{artifactName(candidate.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerIntegrationCheckHandoffCard({ handoff }: { handoff: NonNullable<Workpad["schedulerIntegrationCheckHandoff"]> }): ReactElement {
  const currentStatus = handoff.currentIntegrationCheckStatus ?? handoff.integrationCheckStatus;
  return (
    <section className="workpad-section" data-testid="scheduler-integration-check-handoff-card">
      <div className="workpad-section-header">
        <h3>Scheduler IntegrationCheck</h3>
        <span>{humanStatus(currentStatus)}</span>
      </div>
      <p className="workpad-goal">scheduler ready targets 已显式交给现有 IntegrationCheck（不 apply、不 merge）</p>
      <div className="workpad-chip-list">
        <span>{handoff.readyCount} 个 ready target</span>
        <span>IntegrationCheck {handoff.integrationCheckId}</span>
        <span>当前状态 {currentStatus}</span>
        <span>{handoff.readyWorktreeIds.join(", ")}</span>
      </div>
      {handoff.artifact ? <small className="artifact-link">查看证据：{artifactName(handoff.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerIntegrationOutcomeCard({ outcome }: { outcome: NonNullable<Workpad["schedulerIntegrationOutcome"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-integration-outcome-card">
      <div className="workpad-section-header">
        <h3>Scheduler Integration 结果</h3>
        <span>{humanStatus(outcome.status)}</span>
      </div>
      <p className="workpad-goal">现有 IntegrationCheck 结果已回写为 scheduler-owned evidence（不执行 apply/discard）</p>
      <div className="workpad-chip-list">
        <span>IntegrationCheck {outcome.integrationCheckId}</span>
        <span>{outcome.readyCount} 个 ready target</span>
        <span>{outcome.resultTargetCount} 个 result target</span>
      </div>
      <p>{outcome.outcomeReason}</p>
      {outcome.appliedAt ? <small>Applied at {outcome.appliedAt}</small> : null}
      {outcome.artifact ? <small className="artifact-link">查看证据：{artifactName(outcome.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerRunCompletionCard({ completion }: { completion: NonNullable<Workpad["schedulerRunCompletion"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-run-completion-card">
      <div className="workpad-section-header">
        <h3>SchedulerRun 完成状态</h3>
        <span>{humanStatus(completion.status)}</span>
      </div>
      <p className="workpad-goal">SchedulerRun 已记录 terminal completion；source mutation、landing、PR、merge 仍走既有独立 gate</p>
      <p className="workpad-note">只读 terminal evidence；不授权 scheduler loop、full executor、whole-wave dispatch、slot allocation、source mutation、apply、close、PR、landing、merge 或 Harness evolution。</p>
      <div className="workpad-chip-list">
        <span>Outcome {completion.outcomeStatus}</span>
        <span>IntegrationCheck {completion.integrationCheckId}</span>
        <span>{completion.readyCount} 个 ready target</span>
        <span>{completion.resultTargetCount} 个 result target</span>
      </div>
      <p>{completion.outcomeReason}</p>
      {completion.artifact ? <small className="artifact-link">查看证据：{artifactName(completion.artifact)}</small> : null}
    </section>
  );
}

export function SchedulerRunBlockedCloseoutCard({ closeout }: { closeout: NonNullable<Workpad["schedulerRunBlockedCloseout"]> }): ReactElement {
  return (
    <section className="workpad-section" data-testid="scheduler-run-closeout-card">
      <div className="workpad-section-header">
        <h3>SchedulerRun 结束记录</h3>
        <span>{humanStatus(closeout.status)}</span>
      </div>
      <p className="workpad-goal">SchedulerRun 已记录 blocked/exhausted closeout；不会启动执行或修改 source</p>
      <p className="workpad-note">只读 closeout evidence；不授权 scheduler loop、full executor、whole-wave dispatch、slot allocation、worker start、worktree、run、child Change、source mutation、apply、close、merge 或 Harness evolution。</p>
      <div className="workpad-chip-list">
        <span>{closeout.readyCount} 个 ready target</span>
        <span>{closeout.blockedCount} 个 blocked output</span>
        <span>{closeout.blockedReasons.length} 个阻塞原因</span>
        <span>{closeout.unstartedReservedIntentIds.length} 个未启动 intent</span>
        <span>{closeout.sourceMutated ? "source mutated" : "source 未修改"}</span>
      </div>
      <p>{closeout.closeoutReason}</p>
      {closeout.readyWorktreeIds.length ? <p className="workpad-note">ready: {closeout.readyWorktreeIds.join(", ")}</p> : null}
      {closeout.artifact ? <small className="artifact-link">查看证据：{artifactName(closeout.artifact)}</small> : null}
    </section>
  );
}
