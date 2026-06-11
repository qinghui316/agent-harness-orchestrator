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
