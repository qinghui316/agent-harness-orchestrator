import { getChangeStatusForChange } from "../../change/manager.js";
import { buildContextProjection } from "../../run/manager.js";
import type { ManagedProject, ResolvedMemory } from "../../types/index.js";
import { renderTopicAttachmentsForPrompt } from "../attachments.js";
import { renderTopicFileReferencesForPrompt } from "../file-references.js";
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
    context: [
      "# AHO Topic Chat",
      "",
      "You are answering inside the AHO Workbench Topic chat.",
      "This is ordinary read-only conversation. Do not edit files, create worktrees, apply changes, close changes, or claim approval.",
      "Use AHO artifacts as source of truth. Codex session memory is only runtime continuity.",
      "",
      buildContextProjection(status),
      ...(goalLoopSection ? ["", goalLoopSection.markdown] : []),
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
    context: [
      "# AHO Workbench Orchestrator Context",
      "",
      "You are planning inside a single AHO Topic.",
      "The Orchestrator plan card is an interaction projection. It is not canonical workflow truth.",
      "Do not mutate files or claim acceptance.",
      "",
      buildContextProjection(status),
      ...(goalLoopSection ? ["", goalLoopSection.markdown] : []),
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
