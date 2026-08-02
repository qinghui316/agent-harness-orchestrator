import { existsSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { defaultProviderRegistry } from "../provider-runtime/index.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { ensureProjectRuntime } from "../harness/init.js";
import { readProjectMarker } from "../project/marker.js";
import { resolveProjectRuntimeState, type ProjectRuntimeState } from "../project-runtime/coordinator.js";
import type { ManagedProject } from "../types/index.js";
import { resolveTopicAttachments } from "./attachments.js";
import { resolveTopicFileReferences } from "./file-references.js";
import { validatePlanHandoffIntent } from "./plan-handoff.js";
import { hasPlanningExecutionEvidence } from "../change/manager.js";
import { openWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import type { StoredTopicMessage } from "./persistence/contracts.js";
import { fromStoredThreadMessage } from "./conversation-thread-log.js";
import { CanonicalTimelineDelivery, publishCommittedCanonicalTimelineRow } from "./canonical-timeline-delivery.js";
import { toCanonicalTimelineMessage } from "./canonical-timeline-message.js";
import { resolveProviderSwitchWorkflowResumeRequest, switchConversationProviderAtSafePoint, type ProviderSwitchResult } from "./provider-switch.js";
import { runProjectScopedMainAgentTurn } from "./main-agent-turn-coordinator.js";
import { resolveConversationId } from "./conversation-identity.js";
import { runWorkbenchWorkflowAction } from "./workflow-conversation-bridge.js";
import type { TopicAttachment, TopicMessageInput, TopicMessageResult, TopicThreadEntry, ValidatedPlanHandoffIntent, WorkbenchLiveSink } from "./types.js";
import { publishAgentSurfacesInvalidated, publishProjectLiveEvent } from "./project-live-events.js";
import { runExactChildAgentTurn } from "./provider-child-turn-coordinator.js";
import { runProjectHarnessOnboardingTurn } from "./project-harness-onboarding-turn.js";
import type { WorkbenchDatabase } from "./persistence/database.js";
import type { ResolvedMemory } from "../types/index.js";

export async function createWorkbenchConversation(
  project: ManagedProject,
  input: { body?: string; contextRefs?: TopicMessageInput["contextRefs"]; attachmentIds?: string[]; providerId?: string },
  live?: WorkbenchLiveSink,
  options: { runMainAgent?: boolean } = {},
): Promise<{ conversationId: string; title: string; state: "active" }> {
  const persistence = await openProjectConversationDatabase(project);
  if (persistence.memory) assertWritableMemory(persistence.memory, "Workbench conversation");
  const resolved = await resolveTopicFileReferences(project, input.body ?? "", input.contextRefs);
  const attachments = await resolveTopicAttachments(project, input.attachmentIds);
  const title = deriveConversationTitle(resolved.text, attachments.length > 0);
  const body = resolved.text || defaultAttachmentMessage(attachments);
  const now = new Date().toISOString();
  const conversationId = `conv-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const graphScopeId = createGraphScopeId(conversationId);
  const selectedProviderId = input.providerId
    ? defaultProviderRegistry.get(input.providerId).id
    : project.defaultProviderId
      ? defaultProviderRegistry.get(project.defaultProviderId).id
      : defaultProviderRegistry.requireOnly().id;
  const database = persistence.database;
  let storedUserRow: StoredTopicMessage;
  try {
    storedUserRow = database.unitOfWork.createConversationWithInitialMessage({
      projectId: persistence.projectId,
      conversationId,
      title,
      state: "active",
      boundChangeId: null,
      currentGraphScopeId: graphScopeId,
      selectedProviderId,
      completedTurnSequence: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }, toCanonicalTimelineMessage(persistence.projectId, conversationId, {
      id: `user:${conversationId}:1`,
      type: "user.message",
      timestamp: now,
      conversationId,
      graphScopeId,
      changeId: "",
      completedTurnSequence: 1,
      text: body,
      contextRefs: resolved.contextRefs.length > 0 ? resolved.contextRefs : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    }));
  } finally {
    database.close();
  }
  live?.emit({ event: "topic.created", data: { topic: { id: conversationId, conversationId, title, state: "active", selectedProviderId } } });
  publishCommittedCanonicalTimelineRow(live, storedUserRow);
  if (options.runMainAgent !== false) {
    if (persistence.runtimeState?.state === "onboarding") {
      await runProjectHarnessOnboardingTurn(project, persistence.runtimeState, conversationId, body, live);
    } else {
      await runProjectScopedMainAgentTurn(project, conversationId, body, live, undefined, { graphScopeId });
    }
  }
  return { conversationId, title, state: "active" };
}

export async function updateWorkbenchConversationTitle(
  project: ManagedProject,
  conversationId: string,
  input: { title: string },
): Promise<{ id: string; title: string; state: string; updatedAt: string; selectedProviderId?: string }> {
  const persistence = await openProjectConversationDatabase(project);
  if (persistence.memory) assertWritableMemory(persistence.memory, "Workbench conversation title");
  const title = normalizeConversationTitle(input.title);
  const updatedAt = new Date().toISOString();
  const database = persistence.database;
  try {
    const conversation = database.conversations.updateConversationTitle(persistence.projectId, conversationId, title, updatedAt);
    const projection = {
      id: conversation.conversationId,
      title: conversation.title,
      state: conversation.state,
      updatedAt: conversation.updatedAt,
      selectedProviderId: conversation.selectedProviderId,
    };
    publishProjectLiveEvent(persistence.projectId, { event: "topic.updated", data: { conversation: projection } });
    return projection;
  } finally {
    database.close();
  }
}

export function deriveConversationTitle(text: string, hasAttachments = false): string {
  const normalized = text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/^\s*(?:(?:#{1,6}|>|[-+*]|\d+[.)])\s+)+/, "").trim())
    .find(Boolean)
    ?.replace(/\s+/g, " ")
    .trim() ?? "";
  if (!normalized) {
    if (hasAttachments) return "附件需求";
    const error = new Error("Demand conversation text or attachment is required.");
    error.name = "BadRequest";
    throw error;
  }
  return Array.from(normalized).slice(0, 48).join("");
}

export function normalizeConversationTitle(value: string): string {
  const title = value.replace(/\s+/g, " ").trim();
  const length = Array.from(title).length;
  if (length < 1 || length > 80) {
    const error = new Error("Conversation title must contain 1 to 80 characters.");
    error.name = "BadRequest";
    throw error;
  }
  return title;
}

export async function postConversationMessage(
  project: ManagedProject,
  conversationId: string,
  input: string | TopicMessageInput,
  live?: WorkbenchLiveSink,
): Promise<TopicMessageResult> {
  const parsed = await normalizeTopicMessageInput(project, input);
  if (!await readProjectMarker(project.path)) {
    const runtimeState = await resolveProjectRuntimeState(project);
    if (runtimeState.state === "onboarding") {
      return postProjectHarnessOnboardingMessage(project, runtimeState, conversationId, parsed, live);
    }
    if (runtimeState.state === "repair-required") {
      throw new Error("Project Harness requires repair before planning or source execution.");
    }
    throw new Error("Skill-native project runtime consumers are not fully migrated yet; refusing to create legacy Harness state.");
  }
  const memory = await ensureProjectRuntime(project);
  assertWritableMemory(memory, "Workbench conversation");
  if (!memory.projectId) throw new Error("Project id is required to post a conversation message.");
  conversationId = await resolveConversationId(project, conversationId);
  if (parsed.agentSurfaceId) {
    if (parsed.contextRefs?.length || parsed.attachments?.length || parsed.planHandoffIntent || parsed.providerId) {
      const error = new Error("Child Agent feedback supports text only and cannot switch providers or carry Main planning context.");
      error.name = "BadRequest";
      throw error;
    }
    return runExactChildAgentTurn({ project, conversationId, agentSurfaceId: parsed.agentSurfaceId, message: parsed.message, live });
  }
  let providerSwitch: ProviderSwitchResult | null = null;
  if (parsed.providerId) providerSwitch = await switchConversationProviderAtSafePoint({ project, memory, conversationId, targetProviderId: parsed.providerId });
  const now = new Date().toISOString();
  let user: TopicThreadEntry = {
    id: `user:${conversationId}:${Date.now().toString(36)}`,
    type: "user.message",
    timestamp: now,
    conversationId,
    changeId: "",
    text: parsed.message,
    contextRefs: parsed.contextRefs,
    attachments: parsed.attachments,
  };
  let planHandoff: ValidatedPlanHandoffIntent | undefined;
  let storedUser: TopicThreadEntry = user;
  const database = await openWorkbenchDatabase(memory);
  try {
    const delivery = new CanonicalTimelineDelivery(database, live);
    const conversation = database.conversations.readConversation(memory.projectId, conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}.`);
    planHandoff = validatePlanHandoffIntent(
      database.timeline.listConversationMessages(memory.projectId, conversationId).map(fromStoredThreadMessage),
      parsed.planHandoffIntent,
    );
    const supersedingExecutedChange = Boolean(planHandoff?.kind === "revise-plan"
      && conversation.boundChangeId
      && await hasPlanningExecutionEvidence(memory, conversation.boundChangeId));
    const completedBoundChange = Boolean(!planHandoff && conversation.boundChangeId
      && !existsSync(join(memory.changesRoot, "active", conversation.boundChangeId)));
    const terminalGraphScope = Boolean(conversation.currentGraphScopeId
      && database.conversations.isConversationGraphScopeTerminal(memory.projectId, conversation.currentGraphScopeId));
    const graphScopeId = !completedBoundChange && !supersedingExecutedChange && !terminalGraphScope && conversation.currentGraphScopeId
      ? conversation.currentGraphScopeId
      : createGraphScopeId(conversationId);
    if (graphScopeId !== conversation.currentGraphScopeId) {
      delivery.publishCommittedMany(database.unitOfWork.startConversationGraphScope(memory.projectId, conversationId, graphScopeId, now));
      publishAgentSurfacesInvalidated(memory.projectId, { conversationId, graphScopeId, reason: "scope-changed" });
    }
    user = { ...user, graphScopeId, completedTurnSequence: conversation.completedTurnSequence + 1 };
    storedUser = { ...user, planHandoff };
    delivery.append(toCanonicalTimelineMessage(memory.projectId, conversationId, storedUser));
    const proposalStatus = planHandoff?.kind === "revise-plan"
      ? "revision-requested"
      : planHandoff?.kind === "skip-plan" ? "skipped" : null;
    if (proposalStatus && planHandoff) {
      delivery.publishCommitted(database.interactions.updatePlanningMessageStatus(memory.projectId, conversationId, planHandoff.sourceArtifact, proposalStatus));
      publishAgentSurfacesInvalidated(memory.projectId, { conversationId, graphScopeId, reason: "interaction-updated" });
    }
  } finally {
    database.close();
  }
  const assistant = await runProjectScopedMainAgentTurn(project, conversationId, parsed.message, live, planHandoff, { graphScopeId: storedUser.graphScopeId });
  if (providerSwitch && parsed.providerSwitchIntent === "resume-workflow") {
    const request = await resolveProviderSwitchWorkflowResumeRequest({ project, memory, conversationId, switchResult: providerSwitch });
    if (request) {
      await runWorkbenchWorkflowAction(project, request, live, {
        postConversationMessage,
        continueMainAgentTurn: runProjectScopedMainAgentTurn,
      });
    }
  }
  return { user: storedUser, assistant, run: null, providerSessionId: null, mode: "chat", assistantMessage: assistant.text ?? "" };
}

export async function listConversationMessages(project: ManagedProject, conversationId: string): Promise<TopicThreadEntry[]> {
  const persistence = await openProjectConversationDatabase(project, false);
  if (!persistence.projectId) return [];
  if (persistence.memory) conversationId = await resolveConversationId(project, conversationId);
  const database = persistence.database;
  try {
    return database.timeline.listConversationMessages(persistence.projectId, conversationId).map(fromStoredThreadMessage);
  } finally {
    database.close();
  }
}

async function openProjectConversationDatabase(
  project: ManagedProject,
  initializeLegacy = true,
): Promise<{
  projectId: string;
  database: WorkbenchDatabase;
  memory: ResolvedMemory | null;
  runtimeState: ProjectRuntimeState | null;
}> {
  if (await readProjectMarker(project.path)) {
    const memory = initializeLegacy ? await ensureProjectRuntime(project) : await resolveProjectMemory(project);
    if (!memory.projectId) throw new Error("Project id is required for Workbench conversation storage.");
    return {
      projectId: memory.projectId,
      database: await openWorkbenchDatabase(memory),
      memory,
      runtimeState: null,
    };
  }
  const runtimeState = await resolveProjectRuntimeState(project);
  const paths = runtimeState.state === "onboarding" ? runtimeState.paths : runtimeState.resolution.paths;
  return {
    projectId: runtimeState.project.id,
    database: await openProjectRuntimeWorkbenchDatabase(paths),
    memory: null,
    runtimeState,
  };
}

async function postProjectHarnessOnboardingMessage(
  project: ManagedProject,
  runtimeState: Extract<ProjectRuntimeState, { state: "onboarding" }>,
  conversationId: string,
  parsed: Awaited<ReturnType<typeof normalizeTopicMessageInput>>,
  live?: WorkbenchLiveSink,
): Promise<TopicMessageResult> {
  if (parsed.agentSurfaceId || parsed.planHandoffIntent || parsed.providerId) {
    const error = new Error("Project Harness onboarding accepts Main conversation text and attachments only.");
    error.name = "Conflict";
    throw error;
  }
  const database = await openProjectRuntimeWorkbenchDatabase(runtimeState.paths);
  const now = new Date().toISOString();
  const conversation = database.conversations.readConversation(project.id, conversationId);
  if (!conversation) {
    database.close();
    throw new Error(`Conversation not found: ${conversationId}.`);
  }
  const user: TopicThreadEntry = {
    id: `user:${conversationId}:${Date.now().toString(36)}`,
    type: "user.message",
    timestamp: now,
    conversationId,
    graphScopeId: conversation.currentGraphScopeId ?? undefined,
    changeId: "",
    completedTurnSequence: conversation.completedTurnSequence + 1,
    text: parsed.message,
    contextRefs: parsed.contextRefs,
    attachments: parsed.attachments,
  };
  let stored: StoredTopicMessage;
  try {
    stored = database.timeline.appendMessage(toCanonicalTimelineMessage(project.id, conversationId, user));
  } finally {
    database.close();
  }
  publishCommittedCanonicalTimelineRow(live, stored);
  const assistant = await runProjectHarnessOnboardingTurn(project, runtimeState, conversationId, parsed.message, live);
  return { user, assistant, run: null, providerSessionId: null, mode: "chat", assistantMessage: assistant.text ?? "" };
}

async function normalizeTopicMessageInput(project: ManagedProject, input: string | TopicMessageInput): Promise<Required<Pick<TopicMessageInput, "mode" | "message">> & { contextRefs?: TopicMessageInput["contextRefs"]; attachments?: TopicAttachment[]; planHandoffIntent?: TopicMessageInput["planHandoffIntent"]; providerId?: string; providerSwitchIntent: "resume-workflow" | "conversation-only"; agentSurfaceId?: string }> {
  const mode = typeof input === "string" ? "chat" : input.mode ?? "chat";
  const message = typeof input === "string" ? input : input.message ?? input.text ?? "";
  if (mode !== "chat") throw new Error("Message mode must be chat; planning is delegated by the Main Agent to a real child.");
  const attachments = await resolveTopicAttachments(project, typeof input === "string" ? [] : input.attachmentIds);
  if (!message.trim() && attachments.length === 0) throw new Error("Message text is required.");
  const resolved = await resolveTopicFileReferences(project, message, typeof input === "string" ? [] : input.contextRefs);
  const resolvedMessage = resolved.text.trim() || defaultAttachmentMessage(attachments);
  if (!resolvedMessage.trim()) throw new Error("Message text is required.");
  return {
    mode,
    message: resolvedMessage,
    contextRefs: resolved.contextRefs.length > 0 ? resolved.contextRefs : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
    planHandoffIntent: typeof input === "string" ? undefined : input.planHandoffIntent,
    providerId: typeof input === "string" ? undefined : input.providerId,
    providerSwitchIntent: typeof input === "string" ? "conversation-only" : input.providerSwitchIntent ?? (input.providerId ? "resume-workflow" : "conversation-only"),
    agentSurfaceId: typeof input === "string" ? undefined : input.agentSurfaceId?.trim() || undefined,
  };
}

function createGraphScopeId(conversationId: string): string {
  return `graph:${conversationId}:${Date.now().toString(36)}:${randomUUID().slice(0, 8)}`;
}

function defaultAttachmentMessage(attachments: TopicAttachment[]): string {
  if (attachments.length === 0) return "";
  const imageCount = attachments.filter((attachment) => attachment.kind === "image").length;
  const textCount = attachments.filter((attachment) => attachment.kind === "text").length;
  if (imageCount > 0 && textCount === 0) return "Please inspect the attached image first, describe what you see, and ask a clarifying question if the requested outcome is unclear.";
  if (textCount > 0 && imageCount === 0) return "Please use the attached file content as message-scoped context for this request.";
  return "Please use the attached images and files as message-scoped context for this request.";
}
