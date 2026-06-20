import { appendSchedulerTerminalHandoffContext, buildGoalLoopMainAgentContextSection, stripGoalLoopControllerPolicyContext } from "../../goal-loop/manager.js";
import type { GoalLoopCloseGateHandoff } from "../../goal-loop/close-handoff.js";
import type { GoalLoopControlledLoopStateContext } from "../../goal-loop/scheduler-loop-context.js";
import type { GoalLoopSchedulerTerminalHandoffContext } from "../../goal-loop/main-agent-context.js";
import type { ManagedProject, ResolvedMemory } from "../../types/index.js";
import type { WorkbenchControlledSchedulerNextCandidate, WorkbenchWorkpad } from "../read-model-types.js";
import { getWorkbenchWorkpadProjection } from "../projections/read-model/implementation.js";

export interface ControlledSchedulerNextCandidatePromptEvidence {
  authority: "non-executing-controlled-scheduler-next-candidate-prompt-evidence";
  status: WorkbenchControlledSchedulerNextCandidate["status"];
  label: string;
  body: string;
  actionLabel: string;
  readinessEvidencePrepared: boolean;
  humanConfirmationStillRequired: boolean;
  evidenceRefs: string[];
  executionStarted: false;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export interface VisibleGoalLoopMainAgentContextSection {
  goalLoopNextStepPacketId: string;
  goalLoopControllerPolicyId?: string;
  routingPosture: string;
  routingLabel: string;
  schedulerExecutionMode: string;
  guidedGateActionType?: string;
  guidedGateScope?: Record<string, string | string[]>;
  closeGateHandoff?: GoalLoopCloseGateHandoff;
  controlledLoopState: GoalLoopControlledLoopStateContext;
  schedulerTerminalHandoff?: GoalLoopSchedulerTerminalHandoffContext;
  controlledSchedulerNextCandidate?: ControlledSchedulerNextCandidatePromptEvidence;
  markdown: string;
}

export async function buildVisibleGoalLoopMainAgentContextSection(
  project: ManagedProject,
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
): Promise<VisibleGoalLoopMainAgentContextSection | null> {
  const section = await buildGoalLoopMainAgentContextSection(memory, changePath, changeId);
  if (!section) return null;
  const workpad = await getWorkbenchWorkpadProjection({ project, path: project.path }, changeId).catch(() => null);
  if (workpad?.goalLoop?.goalLoopNextStepPacketId !== section.goalLoopNextStepPacketId) return null;
  let visibleSection: VisibleGoalLoopMainAgentContextSection = section;
  if (section.goalLoopControllerPolicyId && workpad.goalLoop.controllerPolicyId !== section.goalLoopControllerPolicyId) {
    visibleSection = stripGoalLoopControllerPolicyContext(section);
  }
  if (workpad.goalLoop.closeGateHandoff) {
    const closeGateHandoff = workpad.goalLoop.closeGateHandoff;
    visibleSection = {
      ...visibleSection,
      closeGateHandoff,
      markdown: appendCloseGateHandoffContext(visibleSection.markdown, closeGateHandoff),
    };
  }
  const schedulerTerminalHandoff = buildSchedulerTerminalHandoffContext(workpad, visibleSection);
  const controlledSchedulerNextCandidate = buildControlledSchedulerNextCandidatePromptEvidence(workpad, visibleSection.goalLoopNextStepPacketId);
  if (schedulerTerminalHandoff) {
    return {
      ...visibleSection,
      schedulerTerminalHandoff,
      controlledSchedulerNextCandidate,
      markdown: appendSchedulerTerminalHandoffContext(visibleSection.markdown, schedulerTerminalHandoff),
    };
  }
  return {
    ...visibleSection,
    controlledSchedulerNextCandidate,
  };
}

function appendCloseGateHandoffContext(
  markdown: string,
  handoff: NonNullable<VisibleGoalLoopMainAgentContextSection["closeGateHandoff"]>,
): string {
  return [
    markdown.trimEnd(),
    "",
    "### Human Close Gate Handoff",
    `- Existing approval: ${handoff.closeApprovalId}`,
    `- Close action: ${handoff.closeActionId}`,
    "- Authority: explanatory Goal Loop evidence only; the Change close/archive transition still requires the existing human close gate.",
    `- Reason: ${handoff.reason}`,
  ].join("\n");
}

export function buildSchedulerTerminalHandoffContext(
  workpad: WorkbenchWorkpad,
  section: VisibleGoalLoopMainAgentContextSection,
): GoalLoopSchedulerTerminalHandoffContext | undefined {
  const goalLoop = workpad.goalLoop;
  const completion = workpad.schedulerRunCompletion;
  if (
    completion
    && goalLoop
    && completion.changeId === goalLoop.changeId
    && completion.schedulerRunId
    && (goalLoop.completionStatus === "ready-for-human-close-gate" || section.controlledLoopState.state === "terminal-handoff")
  ) {
    return {
      authority: "non-executing-scheduler-terminal-handoff-prompt-evidence",
      kind: "completion",
      id: completion.id,
      changeId: completion.changeId,
      schedulerRunId: completion.schedulerRunId,
      status: completion.status,
      reason: completion.outcomeReason,
      artifact: completion.markdownArtifact ?? completion.artifact,
      readyCount: completion.readyCount,
      resultTargetCount: completion.resultTargetCount,
      integrationCheckStatus: completion.integrationCheckStatus,
      outcomeStatus: completion.outcomeStatus,
      ...terminalFalseAuthority(),
    };
  }

  const closeout = workpad.schedulerRunBlockedCloseout;
  if (
    closeout
    && goalLoop
    && closeout.changeId === goalLoop.changeId
    && closeout.schedulerRunId
    && goalLoop.completionStatus === "blocked"
  ) {
    return {
      authority: "non-executing-scheduler-terminal-handoff-prompt-evidence",
      kind: "blocked-closeout",
      id: closeout.id,
      changeId: closeout.changeId,
      schedulerRunId: closeout.schedulerRunId,
      status: closeout.status,
      reason: closeout.closeoutReason,
      artifact: closeout.markdownArtifact ?? closeout.artifact,
      readyCount: closeout.readyCount,
      blockedCount: closeout.blockedCount,
      blockedReason: closeout.reason,
      ...terminalFalseAuthority(),
    };
  }

  return undefined;
}

function terminalFalseAuthority(): Pick<
  GoalLoopSchedulerTerminalHandoffContext,
  | "loopAuthorized"
  | "fullParallelExecutorAuthorized"
  | "wholeWaveDispatchAuthorized"
  | "slotAllocatorAuthorized"
  | "sourceMutationAuthorized"
  | "applyAuthorized"
  | "closeAuthorized"
  | "harnessEvolutionAuthorized"
> {
  return {
    loopAuthorized: false,
    fullParallelExecutorAuthorized: false,
    wholeWaveDispatchAuthorized: false,
    slotAllocatorAuthorized: false,
    sourceMutationAuthorized: false,
    applyAuthorized: false,
    closeAuthorized: false,
    harnessEvolutionAuthorized: false,
  };
}

export function buildControlledSchedulerNextCandidatePromptEvidence(
  workpad: WorkbenchWorkpad,
  goalLoopNextStepPacketId: string,
): ControlledSchedulerNextCandidatePromptEvidence | undefined {
  if (workpad.goalLoop?.goalLoopNextStepPacketId !== goalLoopNextStepPacketId) return undefined;
  const candidate = workpad.goalLoop?.controlledSchedulerNextCandidate;
  if (!candidate) return undefined;
  return {
    authority: "non-executing-controlled-scheduler-next-candidate-prompt-evidence",
    status: candidate.status,
    label: candidate.label,
    body: candidate.body,
    actionLabel: candidate.actionLabel,
    readinessEvidencePrepared: candidate.readinessEvidencePrepared,
    humanConfirmationStillRequired: candidate.humanConfirmationStillRequired,
    evidenceRefs: [...candidate.evidenceRefs],
    executionStarted: false,
    loopAuthorized: false,
    fullParallelExecutorAuthorized: false,
    wholeWaveDispatchAuthorized: false,
    slotAllocatorAuthorized: false,
    sourceMutationAuthorized: false,
    applyAuthorized: false,
    closeAuthorized: false,
    harnessEvolutionAuthorized: false,
  };
}
