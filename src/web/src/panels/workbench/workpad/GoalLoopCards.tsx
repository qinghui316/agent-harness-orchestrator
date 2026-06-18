import type { ReactElement } from "react";
import { humanStatus, userFacingText } from "../../../formatters.js";
import type { Workpad } from "../../../types.js";
import { artifactName } from "../RunReplayPanel.js";

export function GoalLoopEvidenceCard({ goalLoop }: { goalLoop: NonNullable<Workpad["goalLoop"]> }): ReactElement {
  const schedulerMode = goalLoop.schedulerExecutionMode;
  const schedulerLoopSnapshot = goalLoop.schedulerLoopEvidenceSnapshot;
  const controlledLoopState = goalLoop.controlledLoopState;
  const artifacts = [
    goalLoop.markdownArtifact ?? goalLoop.artifact,
    goalLoop.nextStepPacketMarkdownArtifact ?? goalLoop.nextStepPacketArtifact,
    goalLoop.controllerMarkdownArtifact ?? goalLoop.controllerArtifact,
    goalLoop.gateReadinessPreflightMarkdownArtifact ?? goalLoop.gateReadinessPreflightArtifact,
  ].filter((artifact): artifact is string => Boolean(artifact));

  return (
    <section className="workpad-section compact-section" data-testid="goal-loop-evidence-card">
      <div className="workpad-section-header">
        <h3>Goal Loop guidance</h3>
        <span>{humanStatus(goalLoop.recommendationState ?? goalLoop.continuationState ?? "evidence")}</span>
      </div>
      <p className="workpad-goal">{userFacingText(goalLoop.summary)}</p>
      <p className="workpad-note">Read-only evidence; the concrete Harness gate still requires its own confirmation.</p>
      <div className="workpad-chip-list">
        <span>Conflict {goalLoop.conflictLevel}</span>
        <span>{goalLoop.routingLabel ?? goalLoop.routingPosture ?? "Routing evidence"}</span>
        <span>{goalLoop.parallelEligible ? "Parallel eligible" : "Sequential or gated"}</span>
        {schedulerMode ? <span>Scheduler mode {humanStatus(schedulerMode.mode)}</span> : null}
        {schedulerMode ? <span>Loop authorized: {schedulerMode.loopAuthorized ? "true" : "false"}</span> : null}
        {schedulerMode ? <span>Full executor: {schedulerMode.fullParallelExecutorAuthorized ? "true" : "false"}</span> : null}
        {schedulerMode ? <span>Whole wave: {schedulerMode.wholeWaveDispatchAuthorized ? "true" : "false"}</span> : null}
        {schedulerMode ? <span>Slot allocator: {schedulerMode.slotAllocatorAuthorized ? "true" : "false"}</span> : null}
        {controlledLoopState ? <span>Controlled state {humanStatus(controlledLoopState.state)}</span> : null}
        {schedulerLoopSnapshot ? <span>Snapshot posture {humanStatus(schedulerLoopSnapshot.posture)}</span> : null}
        <span>{goalLoop.humanGateRequired ? "Human gate required" : "No human gate flag"}</span>
        {goalLoop.recommendedActionType ? <span>{goalLoop.recommendedActionType}</span> : null}
      </div>
      {schedulerMode ? (
        <div className="workpad-evidence-list" aria-label="Scheduler execution mode">
          <div className="workpad-evidence">
            <strong>Scheduler execution mode</strong>
            <span>{userFacingText(schedulerMode.summary)}</span>
          </div>
          {schedulerMode.currentGate ? (
            <div className="workpad-evidence">
              <strong>Separate gate</strong>
              <span>{schedulerMode.currentGate.actionType}</span>
            </div>
          ) : null}
          {schedulerMode.futureLoopRequirements.map((requirement) => (
            <div className="workpad-evidence" key={requirement}>
              <strong>Future loop requirement</strong>
              <span>{userFacingText(requirement)}</span>
            </div>
          ))}
        </div>
      ) : null}
      {controlledLoopState ? (
        <div className="workpad-evidence-list" aria-label="Controlled loop state evidence">
          <div className="workpad-evidence">
            <strong>Controlled loop state</strong>
            <span>{userFacingText(controlledLoopState.summary)}</span>
          </div>
          <div className="workpad-evidence">
            <strong>Phase 12A mapping</strong>
            <span>{controlledLoopState.phase12aLabel}</span>
          </div>
          {controlledLoopState.currentLegalActionType ? (
            <div className="workpad-evidence">
              <strong>Controlled legal gate</strong>
              <span>{controlledLoopState.currentLegalActionType}</span>
            </div>
          ) : null}
          <div className="workpad-evidence">
            <strong>Future-only states</strong>
            <span>{controlledLoopState.futureOnlyStates.join(", ")}</span>
          </div>
          <div className="workpad-evidence">
            <strong>Controlled loop forbidden authority</strong>
            <span>
              loop={String(controlledLoopState.loopAuthorized)}, fullExecutor={String(controlledLoopState.fullParallelExecutorAuthorized)}, wholeWave={String(controlledLoopState.wholeWaveDispatchAuthorized)}, slots={String(controlledLoopState.slotAllocatorAuthorized)}
            </span>
          </div>
          <div className="workpad-evidence">
            <strong>Controlled source authority</strong>
            <span>
              source={String(controlledLoopState.sourceMutationAuthorized)}, apply={String(controlledLoopState.applyAuthorized)}, close={String(controlledLoopState.closeAuthorized)}, harnessEvolution={String(controlledLoopState.harnessEvolutionAuthorized)}
            </span>
          </div>
        </div>
      ) : null}
      {schedulerLoopSnapshot ? (
        <div className="workpad-evidence-list" aria-label="Scheduler loop evidence snapshot">
          <div className="workpad-evidence">
            <strong>Scheduler loop snapshot</strong>
            <span>Read-only decision evidence; it does not authorize scheduler execution.</span>
          </div>
          <div className="workpad-evidence">
            <strong>Snapshot decision</strong>
            <span>{schedulerLoopSnapshot.decisionKind}</span>
          </div>
          {schedulerLoopSnapshot.currentLegalActionType ? (
            <div className="workpad-evidence">
              <strong>Snapshot legal gate</strong>
              <span>{schedulerLoopSnapshot.currentLegalActionType}</span>
            </div>
          ) : null}
          <div className="workpad-evidence">
            <strong>Snapshot forbidden authority</strong>
            <span>
              loop={String(schedulerLoopSnapshot.loopAuthorized)}, fullExecutor={String(schedulerLoopSnapshot.fullParallelExecutorAuthorized)}, wholeWave={String(schedulerLoopSnapshot.wholeWaveDispatchAuthorized)}, slots={String(schedulerLoopSnapshot.slotAllocatorAuthorized)}
            </span>
          </div>
          <div className="workpad-evidence">
            <strong>Snapshot source authority</strong>
            <span>
              source={String(schedulerLoopSnapshot.sourceMutationAuthorized)}, apply={String(schedulerLoopSnapshot.applyAuthorized)}, close={String(schedulerLoopSnapshot.closeAuthorized)}, harnessEvolution={String(schedulerLoopSnapshot.harnessEvolutionAuthorized)}
            </span>
          </div>
        </div>
      ) : null}
      {goalLoop.recommendedActionReason ? <p>{userFacingText(goalLoop.recommendedActionReason)}</p> : null}
      {goalLoop.conflictReasons.length ? (
        <div className="workpad-evidence-list" aria-label="Goal Loop conflict reasons">
          {goalLoop.conflictReasons.map((reason) => (
            <div className="workpad-evidence" key={reason}>
              <strong>Conflict reason</strong>
              <span>{userFacingText(reason)}</span>
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
