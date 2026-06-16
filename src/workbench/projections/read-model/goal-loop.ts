import {
  isGoalLoopNextStepPacketFresh,
  readLatestGoalLoopContinuationBrief,
  readLatestGoalLoopControllerPolicy,
  readLatestGoalLoopDecision,
  readLatestGoalLoopGateReadinessPreflight,
  readLatestGoalLoopIteration,
  readLatestGoalLoopNextStepPacket,
} from "../../../goal-loop/manager.js";
import type { ResolvedMemory } from "../../../types/index.js";
import type { WorkbenchGoalLoopSummary } from "../../read-model-types.js";

export async function readLatestGoalLoopSummary(
  memory: ResolvedMemory,
  changePath: string,
): Promise<WorkbenchGoalLoopSummary | null> {
  try {
    const [decision, iteration, brief, packet] = await Promise.all([
      readLatestGoalLoopDecision(memory, changePath),
      readLatestGoalLoopIteration(memory, changePath),
      readLatestGoalLoopContinuationBrief(memory, changePath),
      readLatestGoalLoopNextStepPacket(memory, changePath),
    ]);
    if (brief.sourceGoalLoopDecisionId !== decision.id) return null;
    if (brief.sourceGoalLoopIterationId !== iteration.id) return null;
    if (iteration.goalLoopDecisionId !== decision.id) return null;
    if (brief.changeId !== decision.changeId || iteration.changeId !== decision.changeId) return null;
    if (packet.sourceGoalLoopDecisionId !== decision.id) return null;
    if (packet.sourceGoalLoopIterationId !== iteration.id) return null;
    if (packet.sourceGoalLoopContinuationBriefId !== brief.id) return null;
    if (packet.changeId !== decision.changeId) return null;
    if (brief.executionStarted !== false || iteration.executionStarted !== false || decision.executionStarted !== false || packet.executionStarted !== false) return null;
    if (!(await isGoalLoopNextStepPacketFresh(memory, changePath, packet))) return null;
    const controllerPolicy = await readLatestGoalLoopControllerPolicy(memory, changePath).catch(() => null);
    const validControllerPolicy = controllerPolicy
      && controllerPolicy.changeId === decision.changeId
      && controllerPolicy.sourceGoalLoopDecisionId === decision.id
      && controllerPolicy.sourceGoalLoopIterationId === iteration.id
      && controllerPolicy.sourceGoalLoopContinuationBriefId === brief.id
      && controllerPolicy.sourceGoalLoopNextStepPacketId === packet.id
      && controllerPolicy.executionStarted === false
      ? controllerPolicy
      : null;
    const preflight = await readLatestGoalLoopGateReadinessPreflight(memory, changePath).catch(() => null);
    const validPreflight = preflight
      && validControllerPolicy
      && preflight.changeId === decision.changeId
      && preflight.sourceGoalLoopDecisionId === decision.id
      && preflight.sourceGoalLoopIterationId === iteration.id
      && preflight.sourceGoalLoopContinuationBriefId === brief.id
      && preflight.sourceGoalLoopNextStepPacketId === packet.id
      && preflight.sourceGoalLoopControllerPolicyId === validControllerPolicy.id
      && preflight.executionStarted === false
      && preflight.concreteGateInvoked === false
      ? preflight
      : null;
    return {
      id: brief.id,
      changeId: brief.changeId,
      goalLoopDecisionId: decision.id,
      goalLoopIterationId: iteration.id,
      goalLoopNextStepPacketId: packet.id,
      iterationOrdinal: brief.iterationOrdinal,
      decisionKind: brief.decisionKind,
      continuationVerdict: brief.continuationVerdict,
      continuationState: brief.continuationState,
      recommendationState: packet.recommendationState,
      summary: brief.summary,
      recommendedActionType: brief.recommendedAction?.actionType,
      recommendedActionScope: packet.recommendedAction?.scope,
      recommendedActionReason: brief.recommendedAction?.reason,
      separateGateRequired: packet.separateGateRequired,
      humanGateRequired: brief.humanGateRequired,
      conflictLevel: brief.conflictAssessment.level,
      parallelEligible: brief.conflictAssessment.parallelEligible,
      conflictReasons: [...brief.conflictAssessment.reasons],
      completionStatus: brief.completionAudit.status,
      resumePreconditionCount: brief.resumePreconditions.length,
      revalidationChecklistCount: packet.revalidationChecklist.length,
      sourceEvidenceCount: brief.sourceEvidenceRefs.length,
      stalenessInstruction: brief.stalenessInstruction,
      artifact: brief.artifact,
      markdownArtifact: brief.markdownArtifact,
      nextStepPacketArtifact: packet.artifact,
      nextStepPacketMarkdownArtifact: packet.markdownArtifact,
      controllerPolicyId: validControllerPolicy?.id,
      controllerVerdict: validControllerPolicy?.verdict,
      controllerGateStatus: validControllerPolicy?.gateStatus,
      controllerSummary: validControllerPolicy?.summary,
      controllerArtifact: validControllerPolicy?.artifact,
      controllerMarkdownArtifact: validControllerPolicy?.markdownArtifact,
      gateReadinessPreflightId: validPreflight?.id,
      gateReadinessPreflightArtifact: validPreflight?.artifact,
      gateReadinessPreflightMarkdownArtifact: validPreflight?.markdownArtifact,
      updatedAt: brief.updatedAt,
      executionStarted: false,
    };
  } catch {
    return null;
  }
}
