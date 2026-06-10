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
