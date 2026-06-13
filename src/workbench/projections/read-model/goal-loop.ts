import {
  readLatestGoalLoopContinuationBrief,
  readLatestGoalLoopDecision,
  readLatestGoalLoopIteration,
} from "../../../goal-loop/manager.js";
import type { ResolvedMemory } from "../../../types/index.js";
import type { WorkbenchGoalLoopSummary } from "../../read-model-types.js";

export async function readLatestGoalLoopSummary(
  memory: ResolvedMemory,
  changePath: string,
): Promise<WorkbenchGoalLoopSummary | null> {
  try {
    const [decision, iteration, brief] = await Promise.all([
      readLatestGoalLoopDecision(memory, changePath),
      readLatestGoalLoopIteration(memory, changePath),
      readLatestGoalLoopContinuationBrief(memory, changePath),
    ]);
    if (brief.sourceGoalLoopDecisionId !== decision.id) return null;
    if (brief.sourceGoalLoopIterationId !== iteration.id) return null;
    if (iteration.goalLoopDecisionId !== decision.id) return null;
    if (brief.changeId !== decision.changeId || iteration.changeId !== decision.changeId) return null;
    if (brief.executionStarted !== false || iteration.executionStarted !== false || decision.executionStarted !== false) return null;
    return {
      id: brief.id,
      changeId: brief.changeId,
      goalLoopDecisionId: decision.id,
      goalLoopIterationId: iteration.id,
      iterationOrdinal: brief.iterationOrdinal,
      decisionKind: brief.decisionKind,
      continuationVerdict: brief.continuationVerdict,
      continuationState: brief.continuationState,
      summary: brief.summary,
      recommendedActionType: brief.recommendedAction?.actionType,
      recommendedActionReason: brief.recommendedAction?.reason,
      humanGateRequired: brief.humanGateRequired,
      conflictLevel: brief.conflictAssessment.level,
      parallelEligible: brief.conflictAssessment.parallelEligible,
      completionStatus: brief.completionAudit.status,
      resumePreconditionCount: brief.resumePreconditions.length,
      sourceEvidenceCount: brief.sourceEvidenceRefs.length,
      stalenessInstruction: brief.stalenessInstruction,
      artifact: brief.artifact,
      markdownArtifact: brief.markdownArtifact,
      updatedAt: brief.updatedAt,
      executionStarted: false,
    };
  } catch {
    return null;
  }
}
