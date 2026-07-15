import { getChangeStatusForChange } from "../change/manager.js";
import { buildContextProjection } from "../run/manager.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";
import { renderTopicAttachmentsForPrompt } from "./attachments.js";
import { renderTopicFileReferencesForPrompt } from "./file-references.js";
import { getWorkbenchSnapshot } from "./manager.js";
import type { TopicAttachment, TopicFileReference } from "./types.js";
import { resolveTopic } from "./topic-resolver.js";
import { readConversationThread as readThreadLog } from "./conversation-thread-log.js";

export interface MainAgentContextResult {
  context: string;
}

export async function buildMainAgentExecutionContext(
  project: ManagedProject,
  memory: ResolvedMemory,
  changeId: string,
  reason: string,
): Promise<string> {
  const [chat, snapshot] = await Promise.all([
    buildChatContext(project, memory, changeId, reason),
    getWorkbenchSnapshot({ project, path: project.path }, { topicId: changeId }),
  ]);
  const workpad = snapshot.center.workpad;
  const primary = snapshot.right.confirmationQueue.primary;
  return [
    chat.context,
    "",
    "## Canonical Execution Checkpoint",
    "",
    `- Change: ${changeId}`,
    `- User status: ${workpad.userStatus}`,
    `- Current action: ${workpad.nextAction.actionType ?? "none"}`,
    `- Current action enabled: ${workpad.nextAction.enabled ? "yes" : "no"}`,
    `- Human confirmation pending: ${primary ? "yes" : "no"}`,
    primary ? `- Confirmation summary: ${primary.summary}` : "- Confirmation summary: none",
    "",
    "This checkpoint is read-only. Do not infer permission from it and do not execute the action yourself.",
  ].join("\n");
}

export async function buildChatContext(
  project: ManagedProject,
  memory: ResolvedMemory,
  changeId: string,
  userMessage: string,
): Promise<MainAgentContextResult> {
  const { changePath } = await resolveTopic(project, changeId);
  return buildContext(project, memory, changePath, changeId, userMessage);
}

async function buildContext(
  project: ManagedProject,
  memory: ResolvedMemory,
  changePath: string,
  changeId: string,
  userMessage: string,
): Promise<MainAgentContextResult> {
  const status = await getChangeStatusForChange(project, changeId);
  const recentMessages = (await readThreadLog(memory, changePath)).slice(-12);
  const referencedFiles = topicFileReferencesFromRecentMessages(recentMessages);
  const attachments = topicAttachmentsFromRecentMessages(recentMessages);
  const attachmentContext = await renderTopicAttachmentsForPrompt(project, attachments);
  return {
    context: [
      "# AHO Conversation Context",
      "",
      "You are answering inside the AHO Workbench conversation.",
      "Use accepted Harness artifacts and current evidence as source of truth. Provider thread memory is runtime continuity, not project memory or execution authority.",
      "Do not mutate files, execute a workflow action, or claim approval from this read-only context.",
      "",
      buildContextProjection(status),
      ...(referencedFiles.length > 0 ? ["", ...renderTopicFileReferencesForPrompt(referencedFiles)] : []),
      ...(attachmentContext.length > 0 ? ["", ...attachmentContext] : []),
      "",
      "## Current Topic",
      "",
      `- Change ID: ${changeId}`,
      `- Active Changes: ${status.activeChanges.map((item) => item.name).join(", ") || "none"}`,
      "",
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

