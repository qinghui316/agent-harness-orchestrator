import { getChangeStatusForChange } from "../../change/manager.js";
import { captureAcceptedArtifactHashes, captureAutomationSourceState } from "../../automation-runtime/safety.js";
import {
  buildMainAgentResumeContinuationContext,
  detectMainAgentResumeContinuationIntent,
  renderMainAgentResumeContinuationPromptSection,
  renderMainAgentStrategyAdvicePromptSection,
  sanitizeMainAgentResumeGateScope,
  type MainAgentResumeContinuationContext,
  type MainAgentResumePointGateSnapshot,
} from "../../main-agent-orchestration/index.js";
import { buildContextProjection } from "../../run/manager.js";
import type { ManagedProject, ResolvedMemory } from "../../types/index.js";
import { renderTopicAttachmentsForPrompt } from "../attachments.js";
import { renderTopicFileReferencesForPrompt } from "../file-references.js";
import { getWorkbenchSnapshot } from "../manager.js";
import type { WorkbenchConfirmationQueueItem, WorkbenchDecisionAction } from "../read-model-types.js";
import type { TopicAttachment, TopicFileReference } from "../types.js";
import { resolveTopic } from "../topic-resolver.js";
import { readTopicThreadLog as readThreadLog } from "../thread-log.js";
import { buildVisibleGoalLoopMainAgentContextSection } from "./goal-loop-context.js";
import type { VisibleGoalLoopMainAgentContextSection } from "./goal-loop-context.js";

export interface GoalLoopControlledLoopStatePromptEvidence {
  state: string;
  phase12aLabel: string;
  currentLegalActionType?: string;
  loopAuthorized: false;
  fullParallelExecutorAuthorized: false;
  wholeWaveDispatchAuthorized: false;
  slotAllocatorAuthorized: false;
  sourceMutationAuthorized: false;
  applyAuthorized: false;
  closeAuthorized: false;
  harnessEvolutionAuthorized: false;
}

export interface MainAgentContextResult {
  context: string;
  goalLoopNextStepPacketId?: string;
  goalLoopControllerPolicyId?: string;
  goalLoopRoutingPosture?: string;
  goalLoopRoutingLabel?: string;
  goalLoopSchedulerExecutionMode?: string;
  goalLoopGuidedGateActionType?: string;
  goalLoopGuidedGateScope?: Record<string, string | string[]>;
  goalLoopControlledLoopState?: GoalLoopControlledLoopStatePromptEvidence;
  goalLoopSchedulerTerminalHandoff?: VisibleGoalLoopMainAgentContextSection["schedulerTerminalHandoff"];
  goalLoopControlledSchedulerNextCandidate?: VisibleGoalLoopMainAgentContextSection["controlledSchedulerNextCandidate"];
  goalLoopControlledSchedulerPostStepRouting?: VisibleGoalLoopMainAgentContextSection["controlledSchedulerPostStepRouting"];
  resumeContinuationContext?: MainAgentResumeContinuationContext;
}

export async function buildChatContext(
  project: ManagedProject,
  memory: ResolvedMemory,
  changeId: string,
  userMessage: string,
): Promise<MainAgentContextResult> {
  const status = await getChangeStatusForChange(project, changeId);
  const { changePath } = await resolveTopic(project, changeId);
  const recentMessages = (await readThreadLog(memory, changePath)).slice(-12);
  const referencedFiles = topicFileReferencesFromRecentMessages(recentMessages);
  const attachments = topicAttachmentsFromRecentMessages(recentMessages);
  const goalLoopSection = await buildVisibleGoalLoopMainAgentContextSection(project, memory, changePath, changeId);
  const attachmentContext = await renderTopicAttachmentsForPrompt(project, attachments);
  const resumeContinuationContext = await buildPromptResumeContinuationContext(project, memory, changePath, changeId, userMessage);
  const resumeContinuationPrompt = renderMainAgentResumeContinuationPromptSection(resumeContinuationContext);
  const strategyAdvicePrompt = renderMainAgentStrategyAdvicePromptSection();
  return {
    goalLoopNextStepPacketId: goalLoopSection?.goalLoopNextStepPacketId,
    goalLoopControllerPolicyId: goalLoopSection?.goalLoopControllerPolicyId,
    goalLoopRoutingPosture: goalLoopSection?.routingPosture,
    goalLoopRoutingLabel: goalLoopSection?.routingLabel,
    goalLoopSchedulerExecutionMode: goalLoopSection?.schedulerExecutionMode,
    goalLoopGuidedGateActionType: goalLoopSection?.guidedGateActionType,
    goalLoopGuidedGateScope: goalLoopSection?.guidedGateScope,
    goalLoopControlledLoopState: buildControlledLoopStatePromptEvidence(goalLoopSection),
    goalLoopSchedulerTerminalHandoff: goalLoopSection?.schedulerTerminalHandoff,
    goalLoopControlledSchedulerNextCandidate: goalLoopSection?.controlledSchedulerNextCandidate,
    goalLoopControlledSchedulerPostStepRouting: goalLoopSection?.controlledSchedulerPostStepRouting,
    resumeContinuationContext,
    context: [
      "# AHO Topic Chat",
      "",
      "You are answering inside the AHO Workbench Topic chat.",
      "This is ordinary read-only conversation. Do not edit files, create worktrees, apply changes, close changes, or claim approval.",
      "Use AHO artifacts as source of truth. Codex session memory is only runtime continuity.",
      "",
      buildContextProjection(status),
      ...(goalLoopSection ? ["", goalLoopSection.markdown] : []),
      ...(resumeContinuationPrompt.length > 0 ? ["", ...resumeContinuationPrompt] : []),
      "",
      ...strategyAdvicePrompt,
      ...(referencedFiles.length > 0 ? ["", ...renderTopicFileReferencesForPrompt(referencedFiles), ""] : []),
      ...(attachmentContext.length > 0 ? ["", ...attachmentContext, ""] : []),
      "## Recent Topic Messages",
      "",
      ...recentMessages.map((entry) => `- ${entry.type}: ${entry.text ?? entry.actionType ?? entry.status ?? ""}`),
      "",
      "## Current User Message",
      "",
      userMessage,
    ].join("\n"),
  };
}

export async function buildOrchestratorContext(
  project: ManagedProject,
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  userMessage: string,
): Promise<MainAgentContextResult> {
  const status = await getChangeStatusForChange(project, changeId);
  const recentMessages = (await readThreadLog(memory, changePath)).slice(-16);
  const referencedFiles = topicFileReferencesFromRecentMessages(recentMessages);
  const attachments = topicAttachmentsFromRecentMessages(recentMessages);
  const goalLoopSection = await buildVisibleGoalLoopMainAgentContextSection(project, memory, changePath, changeId);
  const attachmentContext = await renderTopicAttachmentsForPrompt(project, attachments);
  const resumeContinuationContext = await buildPromptResumeContinuationContext(project, memory, changePath, changeId, userMessage);
  const resumeContinuationPrompt = renderMainAgentResumeContinuationPromptSection(resumeContinuationContext);
  const strategyAdvicePrompt = renderMainAgentStrategyAdvicePromptSection();
  return {
    goalLoopNextStepPacketId: goalLoopSection?.goalLoopNextStepPacketId,
    goalLoopControllerPolicyId: goalLoopSection?.goalLoopControllerPolicyId,
    goalLoopRoutingPosture: goalLoopSection?.routingPosture,
    goalLoopRoutingLabel: goalLoopSection?.routingLabel,
    goalLoopSchedulerExecutionMode: goalLoopSection?.schedulerExecutionMode,
    goalLoopGuidedGateActionType: goalLoopSection?.guidedGateActionType,
    goalLoopGuidedGateScope: goalLoopSection?.guidedGateScope,
    goalLoopControlledLoopState: buildControlledLoopStatePromptEvidence(goalLoopSection),
    goalLoopSchedulerTerminalHandoff: goalLoopSection?.schedulerTerminalHandoff,
    goalLoopControlledSchedulerNextCandidate: goalLoopSection?.controlledSchedulerNextCandidate,
    goalLoopControlledSchedulerPostStepRouting: goalLoopSection?.controlledSchedulerPostStepRouting,
    resumeContinuationContext,
    context: [
      "# AHO Workbench Orchestrator Context",
      "",
      "You are planning inside a single AHO Topic.",
      "The Orchestrator plan card is an interaction projection. It is not canonical workflow truth.",
      "Do not mutate files or claim acceptance.",
      "",
      buildContextProjection(status),
      ...(goalLoopSection ? ["", goalLoopSection.markdown] : []),
      ...(resumeContinuationPrompt.length > 0 ? ["", ...resumeContinuationPrompt] : []),
      "",
      ...strategyAdvicePrompt,
      ...(referencedFiles.length > 0 ? ["", ...renderTopicFileReferencesForPrompt(referencedFiles), ""] : []),
      ...(attachmentContext.length > 0 ? ["", ...attachmentContext, ""] : []),
      "## Current Topic",
      "",
      `- Change ID: ${changeId}`,
      `- Active Changes: ${status.activeChanges.map((item) => item.name).join(", ") || "none"}`,
      "",
      "## Recent Topic Messages",
      "",
      ...recentMessages.map((entry) => `- ${entry.type}: ${entry.text ?? entry.actionType ?? entry.status ?? ""}`),
      "",
      "## Routing Policy",
      "",
      "- If the request is unrelated to this Topic, return routingDecision new-topic-required.",
      "- If routing is uncertain, return routingDecision clarify.",
      "- Otherwise return same-topic and suggest the next safe workflow action.",
      "",
      "## Current User Message",
      "",
      userMessage,
    ].join("\n"),
  };
}

function topicFileReferencesFromRecentMessages(messages: Awaited<ReturnType<typeof readThreadLog>>): TopicFileReference[] {
  const refs: TopicFileReference[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    for (const ref of message.contextRefs ?? []) {
      if (seen.has(ref.relativePath)) continue;
      seen.add(ref.relativePath);
      refs.push(ref);
    }
  }
  return refs;
}

function topicAttachmentsFromRecentMessages(messages: Awaited<ReturnType<typeof readThreadLog>>): TopicAttachment[] {
  const attachments: TopicAttachment[] = [];
  const seen = new Set<string>();
  for (const message of messages) {
    for (const attachment of message.attachments ?? []) {
      if (seen.has(attachment.id)) continue;
      seen.add(attachment.id);
      attachments.push(attachment);
    }
  }
  return attachments;
}

function buildControlledLoopStatePromptEvidence(
  section: VisibleGoalLoopMainAgentContextSection | null,
): GoalLoopControlledLoopStatePromptEvidence | undefined {
  if (!section) return undefined;
  const state = section.controlledLoopState;
  return {
    state: state.state,
    phase12aLabel: state.phase12aLabel,
    currentLegalActionType: state.currentLegalActionType,
    loopAuthorized: state.loopAuthorized,
    fullParallelExecutorAuthorized: state.fullParallelExecutorAuthorized,
    wholeWaveDispatchAuthorized: state.wholeWaveDispatchAuthorized,
    slotAllocatorAuthorized: state.slotAllocatorAuthorized,
    sourceMutationAuthorized: state.sourceMutationAuthorized,
    applyAuthorized: state.applyAuthorized,
    closeAuthorized: state.closeAuthorized,
    harnessEvolutionAuthorized: state.harnessEvolutionAuthorized,
  };
}

async function buildPromptResumeContinuationContext(
  project: ManagedProject,
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  userMessage: string,
): Promise<MainAgentResumeContinuationContext> {
  const continuationIntent = detectMainAgentResumeContinuationIntent(userMessage);
  if (!continuationIntent.requested) {
    return buildMainAgentResumeContinuationContext(memory, {
      projectId: project.id,
      changeId,
      changePath,
      continuationIntent,
      currentEvidence: { changeId },
    });
  }
  const [snapshot, sourceState, acceptedArtifactHashes] = await Promise.all([
    getWorkbenchSnapshot({ project, path: project.path }, { topicId: changeId }).catch(() => null),
    captureAutomationSourceState(memory),
    captureAcceptedArtifactHashes(memory, changePath),
  ]);
  const primary = snapshot?.right.confirmationQueue.primary ?? null;
  const currentGate = primary ? resumeGateFromPrimary(primary, changeId) : null;
  return buildMainAgentResumeContinuationContext(memory, {
    projectId: project.id,
    changeId,
    changePath,
    continuationIntent,
    currentEvidence: {
      changeId,
      gate: currentGate,
      acceptedArtifactHashes: { ...acceptedArtifactHashes },
      sourceState: { ...sourceState },
      runtimePolicy: {
        automationMode: "full-access",
        authorizationAuthority: "human-confirmed-scoped-automation-authorization",
      },
    },
    candidateLanes: ["scoped-local-automation"],
    priority: {
      hasConcreteCurrentGate: Boolean(currentGate && currentGate.kind !== "none"),
    },
  });
}

function resumeGateFromPrimary(
  primary: WorkbenchConfirmationQueueItem,
  changeId: string,
): MainAgentResumePointGateSnapshot | null {
  const action = chooseResumePrimaryAction(primary.actions);
  if (!action) return null;
  const rawScope = { ...action } as Record<string, unknown>;
  const targetIds = collectResumeTargetIds(rawScope);
  if (action.kind === "approval" && action.action) {
    return {
      kind: "approval-action",
      approvalActionId: action.action.actionId,
      changeId: action.changeId ?? primary.changeId ?? changeId,
      targetIds,
      scope: sanitizeMainAgentResumeGateScope({
        ...rawScope,
        primaryId: primary.id,
        resultId: primary.resultId,
        runId: primary.runId,
        artifact: primary.evidenceRefs[0] ?? action.artifact,
      }),
    };
  }
  if (action.kind === "workflow-action" && action.actionType) {
    return {
      kind: "workflow-action",
      actionType: action.actionType,
      changeId: action.changeId ?? primary.changeId ?? changeId,
      targetIds,
      scope: sanitizeMainAgentResumeGateScope({
        ...rawScope,
        primaryId: primary.id,
      }),
    };
  }
  return null;
}

function chooseResumePrimaryAction(actions: WorkbenchDecisionAction[]): WorkbenchDecisionAction | undefined {
  return actions.find((action) => action.enabled && action.kind === "workflow-action" && action.actionType)
    ?? actions.find((action) => action.enabled && action.kind === "approval" && action.action);
}

function collectResumeTargetIds(scope: Record<string, unknown>): string[] {
  const values = new Set<string>();
  for (const [key, value] of Object.entries(scope)) {
    if (key === "changeId" || key === "actionType" || key === "actionId" || key === "kind") continue;
    if (typeof value === "string" && /(?:Id|Ids|Artifact|Hash)$/.test(key)) values.add(value);
    if (Array.isArray(value) && /(?:Id|Ids)$/.test(key)) {
      for (const item of value) {
        if (typeof item === "string") values.add(item);
      }
    }
  }
  return [...values].sort();
}
