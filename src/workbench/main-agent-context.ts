import { listProjectHarnessChanges } from "../project-harness/change.js";
import type { ProjectRuntimeResolution } from "../project-runtime/context.js";
import type { ManagedProject } from "../types/index.js";
import { renderTopicAttachmentsForPrompt } from "./attachments.js";
import { buildConversationInteractionQueue } from "./conversation-interactions.js";
import { renderTopicFileReferencesForPrompt } from "./file-references.js";
import type { TopicAttachment, TopicFileReference } from "./types.js";
import { resolveProjectHarnessTopic } from "./topic-resolver.js";
import { readConversationThread as readThreadLog } from "./conversation-thread-log.js";

export interface MainAgentContextResult {
  context: string;
}

export async function buildMainAgentExecutionContext(
  project: ManagedProject,
  resolution: ProjectRuntimeResolution,
  conversationId: string,
  graphScopeId: string,
  changeId: string,
  reason: string,
): Promise<string> {
  const chat = await buildChatContext(project, resolution, changeId, reason);
  const interactions = await buildConversationInteractionQueue(
    resolution.paths,
    conversationId,
    graphScopeId,
  );
  return [
    chat.context,
    "",
    "## Canonical Execution Checkpoint",
    "",
    `- Change: ${changeId}`,
    `- Pending human interactions: ${interactions.items.length}`,
    "- Automatic runtime action: none",
    "",
    "This checkpoint is read-only. Do not infer permission from it and do not execute an action yourself.",
  ].join("\n");
}

export async function buildChatContext(
  project: ManagedProject,
  resolution: ProjectRuntimeResolution,
  changeId: string,
  userMessage: string,
): Promise<MainAgentContextResult> {
  const topic = await resolveProjectHarnessTopic(resolution, changeId);
  const [changes, recentMessages] = await Promise.all([
    listProjectHarnessChanges(resolution.harness.skillRoot),
    readThreadLog(resolution.paths, changeId).then((messages) => messages.slice(-12)),
  ]);
  const referencedFiles = topicFileReferencesFromRecentMessages(recentMessages);
  const attachments = topicAttachmentsFromRecentMessages(recentMessages);
  const attachmentContext = await renderTopicAttachmentsForPrompt(project, attachments);
  const activeChanges = changes
    .filter((change) => change.status === "planning" || change.status === "active")
    .map((change) => change.change_id);
  return {
    context: [
      "# AHO Conversation Context",
      "",
      "You are answering inside the AHO Workbench conversation.",
      "Use accepted project Harness artifacts and current evidence as source of truth. Provider thread memory is runtime continuity, not project knowledge or execution authority.",
      "Do not mutate files, execute a workflow action, or claim approval from this read-only context.",
      "",
      "## Current Change",
      "",
      `- Change ID: ${changeId}`,
      `- Change status: ${topic.change.status}`,
      `- Evidence state: ${topic.evidenceState}`,
      `- Active Changes: ${activeChanges.join(", ") || "none"}`,
      ...(referencedFiles.length > 0 ? ["", ...renderTopicFileReferencesForPrompt(referencedFiles)] : []),
      ...(attachmentContext.length > 0 ? ["", ...attachmentContext] : []),
      "",
      "## Recent Conversation Messages",
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
