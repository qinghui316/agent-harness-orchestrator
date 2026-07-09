import { appendSchedulerTerminalHandoffContext, buildGoalLoopMainAgentContextSection, stripGoalLoopControllerPolicyContext } from "../../goal-loop/manager.js";
import type { GoalLoopCloseGateHandoff } from "../../goal-loop/close-handoff.js";
import type { GoalLoopControlledLoopStateContext } from "../../goal-loop/scheduler-loop-context.js";
import type { GoalLoopSchedulerTerminalHandoffContext } from "../../goal-loop/main-agent-context.js";
import type { ManagedProject, ResolvedMemory } from "../../types/index.js";
import type { WorkbenchThreadActionType } from "../../workflow-actions/registry.js";
import type { WorkbenchControlledSchedulerNextCandidate, WorkbenchWorkpad } from "../read-model-types.js";
import { getWorkbenchWorkpadProjection } from "../projections/read-model/implementation.js";

export interface ControlledSchedulerNextCandidatePromptEvidence {
  authority: "non-executing-controlled-scheduler-next-candidate-prompt-evidence";
  status: WorkbenchControlledSchedulerNextCandidate["status"];
  label: string;
  body: string;
  actionLabel: string;
  stopPosture?: WorkbenchControlledSchedulerNextCandidate["stopPosture"];
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

export interface ControlledSchedulerPostStepRoutingPromptEvidence {
  authority: "non-executing-controlled-scheduler-post-step-routing-prompt-evidence";
  status: "ready-for-current-gate";
  routeFamily: string;
  ownerModule: string;
  existingGateActionType: WorkbenchThreadActionType;
  continuationReadinessStatus: string;
  resultKind?: string;
  resultId?: string;
  resultStatus?: string;
  reason: string;
  readinessEvidencePrepared: true;
  freshEvidenceRequiredBeforeContinuation: true;
  freshCurrentGateRequiredBeforeContinuation: true;
  humanGateRequired: boolean;
  humanConfirmationStillRequired: true;
  evidenceRefs: string[];
  executionStarted: false;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  mergeAuthorized: false;
  remoteLandingAuthorized: false;
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
  controlledSchedulerPostStepRouting?: ControlledSchedulerPostStepRoutingPromptEvidence;
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
  const controlledSchedulerPostStepRouting = buildControlledSchedulerPostStepRoutingPromptEvidence(workpad, visibleSection.goalLoopNextStepPacketId);
  const controlledSchedulerMarkdown = appendControlledSchedulerPostStepRoutingContext(
    appendControlledSchedulerStopPostureContext(visibleSection.markdown, controlledSchedulerNextCandidate?.stopPosture),
    controlledSchedulerPostStepRouting,
  );
  visibleSection = controlledSchedulerMarkdown === visibleSection.markdown ? visibleSection : {
    ...visibleSection,
    markdown: controlledSchedulerMarkdown,
  };
  if (schedulerTerminalHandoff) {
    return {
      ...visibleSection,
      schedulerTerminalHandoff,
      controlledSchedulerNextCandidate,
      controlledSchedulerPostStepRouting,
      markdown: appendSchedulerTerminalHandoffContext(visibleSection.markdown, schedulerTerminalHandoff),
    };
  }
  return {
    ...visibleSection,
    controlledSchedulerNextCandidate,
    controlledSchedulerPostStepRouting,
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
  const stopPosture = workpad.controlledSchedulerReconfirmation?.status === "aligned"
    ? workpad.controlledSchedulerReconfirmation.stopPosture
    : undefined;
  return {
    authority: "non-executing-controlled-scheduler-next-candidate-prompt-evidence",
    status: candidate.status,
    label: candidate.label,
    body: candidate.body,
    actionLabel: candidate.actionLabel,
    stopPosture,
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

export function buildControlledSchedulerPostStepRoutingPromptEvidence(
  workpad: WorkbenchWorkpad,
  goalLoopNextStepPacketId: string,
): ControlledSchedulerPostStepRoutingPromptEvidence | undefined {
  const goalLoop = workpad.goalLoop;
  if (goalLoop?.goalLoopNextStepPacketId !== goalLoopNextStepPacketId) return undefined;
  const step = workpad.schedulerControlledStepEvidence;
  const routing = step?.controlledLoopPostStepRoutingDecision;
  if (!step || !routing) return undefined;
  if (step.changeId !== goalLoop.changeId) return undefined;
  if (step.controlledLoopContinuationDecision?.status !== "ready-for-human-gate") return undefined;
  if (routing.continuationReadinessStatus !== "ready-for-human-gate") return undefined;
  if (routing.needsReevaluation) return undefined;
  const existingGateActionType = routing.existingGateActionType;
  if (!existingGateActionType) return undefined;
  if (!isCurrentWorkflowGate(workpad, existingGateActionType, step.changeId)) return undefined;
  return {
    authority: "non-executing-controlled-scheduler-post-step-routing-prompt-evidence",
    status: "ready-for-current-gate",
    routeFamily: routing.routeFamily,
    ownerModule: routing.ownerModule,
    existingGateActionType,
    continuationReadinessStatus: routing.continuationReadinessStatus,
    resultKind: routing.resultKind,
    resultId: routing.resultId,
    resultStatus: routing.resultStatus,
    reason: routing.reason,
    readinessEvidencePrepared: true,
    freshEvidenceRequiredBeforeContinuation: true,
    freshCurrentGateRequiredBeforeContinuation: true,
    humanGateRequired: routing.humanGateRequired,
    humanConfirmationStillRequired: true,
    evidenceRefs: [...routing.evidenceRefs],
    executionStarted: false,
    loopAuthorized: false,
    fullParallelExecutorAuthorized: false,
    wholeWaveDispatchAuthorized: false,
    slotAllocatorAuthorized: false,
    sourceMutationAuthorized: false,
    applyAuthorized: false,
    closeAuthorized: false,
    mergeAuthorized: false,
    remoteLandingAuthorized: false,
    harnessEvolutionAuthorized: false,
  };
}

function isCurrentWorkflowGate(
  workpad: WorkbenchWorkpad,
  actionType: string,
  changeId: string,
): actionType is WorkbenchThreadActionType {
  const nextAction = workpad.nextAction;
  return nextAction.kind === "workflow-action"
    && nextAction.enabled === true
    && nextAction.requiresConfirmation === true
    && nextAction.actionType === actionType
    && (!nextAction.changeId || nextAction.changeId === changeId);
}

function appendControlledSchedulerStopPostureContext(
  markdown: string,
  stopPosture: ControlledSchedulerNextCandidatePromptEvidence["stopPosture"],
): string {
  if (!stopPosture) return markdown;
  return [
    markdown.trimEnd(),
    "",
    "### Controlled Scheduler Stop Resume Handoff",
    "",
    "This stop posture is main-Agent prompt context only. It is a read-only summary of the latest controlled Scheduler stop that still matches the visible human gate.",
    "It must not authorize a scheduler loop, worker start, wave dispatch, slot allocation, source mutation, apply, close, merge, PR, landing, or Harness evolution.",
    "",
    `- Stop posture: ${stopPosture.label}`,
    `- Executed step: ${stopPosture.executedStepLabel}`,
    `- Stop reason: ${stopPosture.stopReasonLabel}`,
    `- Current continuation gate: ${stopPosture.nextStepLabel}`,
    `- Readiness: ${stopPosture.readinessLabel}`,
    `- Human confirmation still required: ${stopPosture.humanConfirmationStillRequired ? "yes" : "no"}`,
    "",
    "#### Stop Posture Forbidden Authority",
    "",
    `- loopAuthorized: ${stopPosture.loopAuthorized ? "true" : "false"}`,
    `- fullParallelExecutorAuthorized: ${stopPosture.fullParallelExecutorAuthorized ? "true" : "false"}`,
    `- wholeWaveDispatchAuthorized: ${stopPosture.wholeWaveDispatchAuthorized ? "true" : "false"}`,
    `- slotAllocatorAuthorized: ${stopPosture.slotAllocatorAuthorized ? "true" : "false"}`,
    `- sourceMutationAuthorized: ${stopPosture.sourceMutationAuthorized ? "true" : "false"}`,
    `- applyAuthorized: ${stopPosture.applyAuthorized ? "true" : "false"}`,
    `- closeAuthorized: ${stopPosture.closeAuthorized ? "true" : "false"}`,
    `- mergeAuthorized: ${stopPosture.mergeAuthorized ? "true" : "false"}`,
    `- remoteLandingAuthorized: ${stopPosture.remoteLandingAuthorized ? "true" : "false"}`,
    `- harnessEvolutionAuthorized: ${stopPosture.harnessEvolutionAuthorized ? "true" : "false"}`,
  ].join("\n");
}

function appendControlledSchedulerPostStepRoutingContext(
  markdown: string,
  routing: ControlledSchedulerPostStepRoutingPromptEvidence | undefined,
): string {
  if (!routing) return markdown;
  return [
    markdown.trimEnd(),
    "",
    "### Controlled Scheduler Post-Step Routing",
    "",
    "This post-step routing decision is main-Agent prompt context only. It is compact prior-turn evidence from the latest Workpad-visible controlled Scheduler step.",
    "It names the existing owner/gate for the next continuation, but the current gate must still be freshly revalidated, ToolPolicy-checked, and human confirmed before any transition.",
    "It must not authorize a scheduler loop, worker start, wave dispatch, slot allocation, source mutation, apply, close, merge, PR, landing, or Harness evolution.",
    "",
    `- Route family: ${routing.routeFamily}`,
    `- Owner module: ${routing.ownerModule}`,
    `- Existing gate: ${routing.existingGateActionType}`,
    `- Continuation readiness: ${routing.continuationReadinessStatus}`,
    `- Human gate required: ${routing.humanGateRequired ? "yes" : "no"}`,
    `- Fresh evidence required before continuation: ${routing.freshEvidenceRequiredBeforeContinuation ? "yes" : "no"}`,
    `- Reason: ${routing.reason}`,
    ...(routing.resultKind ? [`- Result kind: ${routing.resultKind}`] : []),
    ...(routing.resultId ? [`- Result id: ${routing.resultId}`] : []),
    ...(routing.resultStatus ? [`- Result status: ${routing.resultStatus}`] : []),
    "",
    "#### Post-Step Routing Forbidden Authority",
    "",
    `- executionStarted: ${routing.executionStarted ? "true" : "false"}`,
    `- loopAuthorized: ${routing.loopAuthorized ? "true" : "false"}`,
    `- fullParallelExecutorAuthorized: ${routing.fullParallelExecutorAuthorized ? "true" : "false"}`,
    `- wholeWaveDispatchAuthorized: ${routing.wholeWaveDispatchAuthorized ? "true" : "false"}`,
    `- slotAllocatorAuthorized: ${routing.slotAllocatorAuthorized ? "true" : "false"}`,
    `- sourceMutationAuthorized: ${routing.sourceMutationAuthorized ? "true" : "false"}`,
    `- applyAuthorized: ${routing.applyAuthorized ? "true" : "false"}`,
    `- closeAuthorized: ${routing.closeAuthorized ? "true" : "false"}`,
    `- mergeAuthorized: ${routing.mergeAuthorized ? "true" : "false"}`,
    `- remoteLandingAuthorized: ${routing.remoteLandingAuthorized ? "true" : "false"}`,
    `- harnessEvolutionAuthorized: ${routing.harnessEvolutionAuthorized ? "true" : "false"}`,
  ].join("\n");
}
