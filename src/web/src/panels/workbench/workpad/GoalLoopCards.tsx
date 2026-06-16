import type { ReactElement } from "react";
import { humanStatus, userFacingText } from "../../../formatters.js";
import type { Workpad } from "../../../types.js";
import { artifactName } from "../RunReplayPanel.js";

export function GoalLoopEvidenceCard({ goalLoop }: { goalLoop: NonNullable<Workpad["goalLoop"]> }): ReactElement {
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
        <span>{goalLoop.humanGateRequired ? "Human gate required" : "No human gate flag"}</span>
        {goalLoop.recommendedActionType ? <span>{goalLoop.recommendedActionType}</span> : null}
      </div>
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
