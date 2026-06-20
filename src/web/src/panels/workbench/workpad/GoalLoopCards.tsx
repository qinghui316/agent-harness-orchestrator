import type { ReactElement } from "react";
import { userFacingText } from "../../../formatters.js";
import { workflowActionLabel } from "../../../action-labels.js";
import type { Workpad } from "../../../types.js";
import { artifactName } from "../RunReplayPanel.js";

export function GoalLoopPrimarySummary({ goalLoop }: { goalLoop: NonNullable<Workpad["goalLoop"]> }): ReactElement {
  const schedulerMode = goalLoop.schedulerExecutionMode;
  const schedulerLoopSnapshot = goalLoop.schedulerLoopEvidenceSnapshot;
  const controlledLoopState = goalLoop.controlledLoopState;
  const currentActionType = controlledLoopState?.currentLegalActionType
    ?? schedulerLoopSnapshot?.currentLegalActionType
    ?? schedulerMode?.currentGate?.actionType
    ?? goalLoop.recommendedActionType;
  const posture = controlledLoopState?.state ?? schedulerLoopSnapshot?.posture ?? schedulerMode?.mode ?? goalLoop.recommendationState ?? goalLoop.continuationState;
  return (
    <section className="parent-agent-section" data-testid="controlled-loop-primary-surface">
      <div className="parent-section-header">
        <h3>受控继续</h3>
        <span>{controlledLoopPostureLabel(posture)}</span>
      </div>
      <p className="parent-agent-lead">当前证据已经整理出一个可确认的下一步，但这里只做说明，不会自动执行。</p>
      <div className="parent-chip-list">
        <span>下一步确认点：{primaryWorkpadActionLabel(currentActionType)}</span>
        <span>{goalLoop.humanGateRequired ? "需要你确认" : "等待新的证据"}</span>
        <span>{goalLoop.parallelEligible ? "低冲突，可评估并行" : "需要顺序推进"}</span>
      </div>
      <p>
        右侧确认区仍是唯一执行入口。确认后也只推进一个已存在步骤；后续执行、应用、关闭或远端操作仍会停下等待新的确认。
      </p>
      <p className="muted-inline">更完整的证据和边界说明在下方详情区。</p>
    </section>
  );
}

export function GoalLoopEvidenceCard({ goalLoop }: { goalLoop: NonNullable<Workpad["goalLoop"]> }): ReactElement {
  const schedulerMode = goalLoop.schedulerExecutionMode;
  const schedulerLoopSnapshot = goalLoop.schedulerLoopEvidenceSnapshot;
  const controlledLoopState = goalLoop.controlledLoopState;
  const currentActionType = controlledLoopState?.currentLegalActionType
    ?? schedulerLoopSnapshot?.currentLegalActionType
    ?? schedulerMode?.currentGate?.actionType
    ?? goalLoop.recommendedActionType;
  const nextGateLabel = currentActionType ? workflowActionLabel(currentActionType) : null;
  const posture = controlledLoopState?.state ?? schedulerLoopSnapshot?.posture ?? schedulerMode?.mode ?? goalLoop.recommendationState ?? goalLoop.continuationState;
  const artifacts = [
    goalLoop.markdownArtifact ?? goalLoop.artifact,
    goalLoop.nextStepPacketMarkdownArtifact ?? goalLoop.nextStepPacketArtifact,
    goalLoop.controllerMarkdownArtifact ?? goalLoop.controllerArtifact,
    goalLoop.gateReadinessPreflightMarkdownArtifact ?? goalLoop.gateReadinessPreflightArtifact,
  ].filter((artifact): artifact is string => Boolean(artifact));

  return (
    <section className="workpad-section compact-section" data-testid="goal-loop-evidence-card">
      <div className="workpad-section-header">
        <h3>受控继续建议</h3>
        <span>{controlledLoopPostureLabel(posture)}</span>
      </div>
      <p className="workpad-goal">{replaceActionIds(goalLoop.summary)}</p>
      <p className="workpad-note">{controlledLoopBoundaryText()}</p>
      <div className="workpad-chip-list">
        <span>{conflictLabel(goalLoop.conflictLevel)}</span>
        <span>{routingLabel(goalLoop.routingLabel ?? goalLoop.routingPosture)}</span>
        <span>{goalLoop.parallelEligible ? "可并行评估" : "需要顺序推进"}</span>
        {schedulerMode ? <span>{schedulerModeLabel(schedulerMode.mode)}</span> : null}
        <span>{goalLoop.humanGateRequired ? "需要你确认" : "当前没有人工确认标记"}</span>
      </div>
      {nextGateLabel ? (
        <div className="workpad-evidence-list" aria-label="Controlled continuation posture">
          <div className="workpad-evidence">
            <strong>下一步确认点</strong>
            <span>{nextGateLabel}</span>
          </div>
          <div className="workpad-evidence">
            <strong>当前姿态</strong>
            <span>{controlledLoopPostureDescription(posture)}</span>
          </div>
          <div className="workpad-evidence">
            <strong>受控边界</strong>
            <span>只允许你确认一个已存在的具体步骤；确认后仍会停下等待新的证据和下一次确认。</span>
          </div>
        </div>
      ) : null}
      {goalLoop.controlledSchedulerNextCandidate ? (
        <div className="workpad-evidence-list" aria-label="Controlled scheduler next candidate">
          <div className="workpad-evidence">
            <strong>{goalLoop.controlledSchedulerNextCandidate.label}</strong>
            <span>{goalLoop.controlledSchedulerNextCandidate.body}</span>
          </div>
          <div className="workpad-evidence">
            <strong>确认状态</strong>
            <span>{goalLoop.controlledSchedulerNextCandidate.humanConfirmationStillRequired ? "继续前仍需要你再次确认。" : "等待新的证据。"}</span>
          </div>
          <div className="workpad-evidence">
            <strong>检查状态</strong>
            <span>{goalLoop.controlledSchedulerNextCandidate.readinessEvidencePrepared ? "当前步骤检查已准备好。" : "当前步骤检查还需要复核。"}</span>
          </div>
        </div>
      ) : null}
      {schedulerMode ? (
        <div className="workpad-evidence-list" aria-label="Scheduler execution mode">
          <div className="workpad-evidence">
            <strong>调度能力边界</strong>
            <span>{schedulerModeSummary(schedulerMode.mode)}</span>
          </div>
          {schedulerMode.currentGate ? (
            <div className="workpad-evidence">
              <strong>单独确认</strong>
              <span>{workflowActionLabel(schedulerMode.currentGate.actionType)}</span>
            </div>
          ) : null}
          {schedulerMode.futureLoopRequirements.map((requirement) => (
            <div className="workpad-evidence" key={requirement}>
              <strong>以后开放前还需要</strong>
              <span>{futureLoopRequirementText(requirement)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {controlledLoopState ? (
        <div className="workpad-evidence-list" aria-label="Controlled loop state evidence">
          <div className="workpad-evidence">
            <strong>受控循环状态</strong>
            <span>{controlledLoopPostureDescription(controlledLoopState.state)}</span>
          </div>
          <div className="workpad-evidence">
            <strong>设计映射</strong>
            <span>{controlledLoopDesignLabel(controlledLoopState.state)}</span>
          </div>
          {controlledLoopState.currentLegalActionType ? (
            <div className="workpad-evidence">
              <strong>当前合法步骤</strong>
              <span>{workflowActionLabel(controlledLoopState.currentLegalActionType)}</span>
            </div>
          ) : null}
          <div className="workpad-evidence">
            <strong>尚未开放</strong>
            <span>{futureOnlyStateText(controlledLoopState.futureOnlyStates)}</span>
          </div>
        </div>
      ) : null}
      {schedulerLoopSnapshot ? (
        <div className="workpad-evidence-list" aria-label="Scheduler loop evidence snapshot">
          <div className="workpad-evidence">
            <strong>调度证据快照</strong>
            <span>这是只读决策证据，不会直接执行调度。</span>
          </div>
          <div className="workpad-evidence">
            <strong>判断结果</strong>
            <span>{decisionKindLabel(schedulerLoopSnapshot.decisionKind)}</span>
          </div>
          {schedulerLoopSnapshot.currentLegalActionType ? (
            <div className="workpad-evidence">
              <strong>快照中的当前步骤</strong>
              <span>{workflowActionLabel(schedulerLoopSnapshot.currentLegalActionType)}</span>
            </div>
          ) : null}
          <div className="workpad-evidence">
            <strong>权限边界</strong>
            <span>{controlledLoopBoundaryText()}</span>
          </div>
        </div>
      ) : null}
      {goalLoop.recommendedActionReason ? <p>{replaceActionIds(goalLoop.recommendedActionReason)}</p> : null}
      {goalLoop.conflictReasons.length ? (
        <div className="workpad-evidence-list" aria-label="Goal Loop conflict reasons">
          {goalLoop.conflictReasons.map((reason) => (
            <div className="workpad-evidence" key={reason}>
              <strong>冲突判断</strong>
              <span>{replaceActionIds(reason)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {artifacts.length ? (
        <div className="workpad-links">
          {artifacts.slice(0, 4).map((artifact) => <span className="artifact-link" key={artifact}>查看证据：{artifactName(artifact)}</span>)}
        </div>
      ) : null}
    </section>
  );
}

function primaryWorkpadActionLabel(actionType: string | undefined): string {
  if (!actionType) return "等待新的证据";
  const label = workflowActionLabel(actionType);
  if (!containsPrimarySurfaceInternalTerms(label) && !looksLikeRawActionId(label)) return userFacingText(label);
  if (actionType === "planning.scheduler.plan.prepare" || actionType === "planning.scheduler.run.prepare") return "确认启动已准备好的执行计划";
  if (actionType === "planning.scheduler.worker.start-first" || actionType === "planning.scheduler.worker.start-next") return "继续执行下一个任务";
  if (
    actionType === "planning.scheduler.worker.reconcile-result"
    || actionType === "planning.scheduler.worker.validate-first"
    || actionType === "planning.scheduler.worker.audit-first"
    || actionType === "planning.scheduler.worker.rework-reconcile-result"
    || actionType === "planning.scheduler.worker.rework-validate-first"
    || actionType === "planning.scheduler.worker.rework-audit-first"
  ) {
    return "检查当前结果";
  }
  if (actionType === "planning.scheduler.worker.rework-plan.compile" || actionType === "planning.scheduler.worker.rework-start-first") {
    return "处理当前阻塞";
  }
  if (
    actionType === "planning.scheduler.integration-candidate.compile"
    || actionType === "planning.scheduler.integration-check.run"
    || actionType === "planning.scheduler.integration-outcome.reconcile"
  ) {
    return "检查组合结果";
  }
  if (actionType === "planning.scheduler.run.complete") return "完成本轮执行记录";
  if (actionType === "planning.scheduler.run.close-blocked") return "标记当前无法继续";
  return "继续当前受控步骤";
}

function containsPrimarySurfaceInternalTerms(value: string): boolean {
  return /\b(Goal Loop|Scheduler|Worker|Workpad|Change|TaskQueue|TaskRun|AgentTask|Harness|IntegrationCheck|SchedulerRun)\b/i.test(value)
    || /worker|scheduler/i.test(value);
}

function looksLikeRawActionId(value: string): boolean {
  return /\b[a-z]+(?:\.[a-z0-9-]+){2,}\b/i.test(value);
}

function replaceActionIds(value: string): string {
  return userFacingText(value)
    .replace("Goal Loop recommends the current scoped worker gate.", "当前证据建议继续一个受控任务步骤。")
    .replace("The first worker-start gate is scoped and current.", "当前第一个任务启动步骤的范围有效。")
    .replace(
      /Recommended action (planning\.scheduler\.[a-z0-9.-]+) is limited to the existing scoped first worker-start gate\./g,
      (_, actionType: string) => `建议的“${workflowActionLabel(actionType)}”只限于当前已限定范围的第一个任务启动步骤。`,
    )
    .replace(/\bplanning\.scheduler\.[a-z0-9.-]+\b/g, (actionType) => workflowActionLabel(actionType));
}

function controlledLoopBoundaryText(): string {
  return "只读建议；不会授权自动循环、整批派发、资源槽分配、源码修改、应用、关闭或 Harness evolution。具体执行仍需要单独确认对应步骤。";
}

function conflictLabel(level: string): string {
  if (level === "low") return "低冲突";
  if (level === "medium") return "中等冲突";
  if (level === "high") return "高冲突";
  return `冲突等级：${userFacingText(level)}`;
}

function routingLabel(value: string | undefined): string {
  if (!value) return "调度建议";
  if (value === "Single scoped worker gate") return "单个任务确认点";
  return userFacingText(value);
}

function schedulerModeLabel(mode: string): string {
  if (mode === "single-gate-staged") return "单步受控";
  if (mode === "terminal-human-close-gate") return "等待完成确认";
  if (mode === "blocked-or-waiting") return "暂时不能继续";
  if (mode === "waiting-for-evidence") return "等待证据";
  return userFacingText(mode);
}

function schedulerModeSummary(mode: string): string {
  if (mode === "single-gate-staged") return "当前调度仍是单步受控能力，不是自动循环或完整并行执行器。";
  if (mode === "terminal-human-close-gate") return "当前已经到达人工完成门禁，需要你决定是否应用或关闭。";
  if (mode === "blocked-or-waiting") return "当前证据不足或存在阻塞，不能直接继续调度。";
  if (mode === "waiting-for-evidence") return "当前还在等待足够证据，暂时不能推荐下一步。";
  return userFacingText(mode);
}

function controlledLoopPostureLabel(posture: string | undefined): string {
  if (posture === "awaiting-human-gate") return "等待你确认";
  if (posture === "recommending-gate") return "已找到下一步";
  if (posture === "waiting") return "等待证据";
  if (posture === "quality-routing") return "需要处理结果";
  if (posture === "integration-barrier") return "需要组合检查";
  if (posture === "terminal-handoff") return "等待最终门禁";
  return "只读建议";
}

function controlledLoopPostureDescription(posture: string | undefined): string {
  if (posture === "awaiting-human-gate") return "下一步可以继续一个已存在的受控步骤，但必须先由你确认。";
  if (posture === "recommending-gate") return "系统已经根据证据找到一个候选步骤，仍需要确认后才能执行。";
  if (posture === "waiting") return "当前证据还不够，应该先等待或补充证据。";
  if (posture === "quality-routing") return "当前结果需要验证、审查、返工或补充证据后再继续。";
  if (posture === "integration-barrier") return "当前必须先完成组合检查，不能直接应用或合并。";
  if (posture === "terminal-handoff") return "当前已经到达人工应用、关闭或交接门禁。";
  return "这是只读建议，不会直接执行。";
}

function controlledLoopDesignLabel(state: string): string {
  if (state === "awaiting-human-gate") return "映射为一个已存在步骤的人工确认点。";
  if (state === "recommending-gate") return "映射为下一步建议，还未获得执行授权。";
  if (state === "quality-routing") return "映射为质量路由，需要先处理当前结果。";
  if (state === "integration-barrier") return "映射为组合检查屏障。";
  if (state === "terminal-handoff") return "映射为最终人工交接。";
  return "映射为只读证据状态。";
}

function futureOnlyStateText(states: string[]): string {
  if (!states.length) return "当前没有额外的未来状态声明。";
  const labels = states.map((state) => {
    if (state === "dispatching-approved-scope") return "自动派发已批准范围";
    if (state === "reconciling") return "自动回收并整合执行结果";
    return userFacingText(state);
  });
  return `${labels.join("、")} 仍只是未来设计，不是当前权限。`;
}

function futureLoopRequirementText(requirement: string): string {
  if (requirement === "accepted architecture decision for a real scheduler loop or full parallel executor") {
    return "需要先有已接受的真实调度循环或完整并行执行器架构决策。";
  }
  if (requirement === "IntegrationCheck before any source apply path") {
    return "任何源码应用路径之前都必须先完成 IntegrationCheck。";
  }
  return replaceActionIds(requirement);
}

function decisionKindLabel(decisionKind: string): string {
  if (decisionKind === "current-gate-ready") return "当前有一个可确认的受控步骤。";
  if (decisionKind === "waiting-for-evidence") return "还在等待证据。";
  if (decisionKind === "blocked") return "当前存在阻塞。";
  return userFacingText(decisionKind);
}
