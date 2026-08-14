import { createHash, randomUUID } from "node:crypto";
import { assertAgentTurnMode, assertProductMode, type AgentTurnMode, type ProductMode } from "../provider-runtime/index.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { readProjectHarnessChangeContext } from "../project-harness/change.js";
import { resolveProjectRuntimeState, type ProjectRuntimeState } from "../project-runtime/coordinator.js";
import type { ManagedProject } from "../types/index.js";
import { resolveTopicAttachments } from "./attachments.js";
import { resolveTopicFileReferences } from "./file-references.js";
import { validatePlanHandoffIntent } from "./plan-handoff.js";
import { hasPlanningExecutionEvidence } from "../project-runtime/planning-publication.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import { fromStoredThreadMessage } from "./conversation-thread-log.js";
import { CanonicalTimelineDelivery, publishCommittedCanonicalTimelineRow } from "./canonical-timeline-delivery.js";
import { toCanonicalTimelineMessage } from "./canonical-timeline-message.js";
import { resolveProviderSwitchWorkflowResumeRequest, type ProviderSwitchResult } from "./provider-switch.js";
import { resolveConversationId } from "./conversation-identity.js";
import { runWorkbenchWorkflowAction } from "./workflow-conversation-bridge.js";
import type { NewConversationSkillOverride, TopicAttachment, TopicMessageInput, TopicMessageResult, TopicThreadEntry, ValidatedPlanHandoffIntent, WorkbenchLiveSink } from "./types.js";
import { publishAgentSurfacesInvalidated, publishProjectLiveEvent } from "./project-live-events.js";
import type { WorkbenchDatabase } from "./persistence/database.js";
import type { StoredConversation, StoredTopicMessage } from "./persistence/contracts.js";
import { createConversationGraphScopeId } from "./conversation-graph-scope.js";
import type { ConversationTurnRoutingPort } from "./conversation-turn-contract.js";

export type { ConversationTurnRoutingPort } from "./conversation-turn-contract.js";

export async function createWorkbenchConversation(
  project: ManagedProject,
  input: {
    body?: string;
    contextRefs?: TopicMessageInput["contextRefs"];
    attachmentIds?: string[];
    providerId?: string;
    productMode: ProductMode;
    clientRequestId: string;
    skillOverrides?: NewConversationSkillOverride[];
    agentTurnMode?: AgentTurnMode;
  },
  live?: WorkbenchLiveSink,
  options: { runMainAgent?: boolean; turnRouter?: ConversationTurnRoutingPort; runtimeStateResolver?: (project: ManagedProject) => Promise<ProjectRuntimeState> } = {},
): Promise<{
  conversationId: string;
  title: string;
  state: "active" | "archive";
  productMode: ProductMode;
  clientRequestId: string;
  replayed: boolean;
  selectedProviderId: string;
  agentTurnMode: AgentTurnMode | null;
}> {
  const productMode = assertProductMode(input.productMode);
  const agentTurnMode = normalizeRequestedAgentTurnMode(productMode, input.agentTurnMode);
  const clientRequestId = normalizeClientRequestId(input.clientRequestId);
  const skillOverrides = normalizeSkillOverrides(input.skillOverrides);
  const resolved = await resolveTopicFileReferences(project, input.body ?? "", input.contextRefs);
  const attachments = await resolveTopicAttachments(project, input.attachmentIds);
  const title = deriveConversationTitle(resolved.text, attachments.length > 0);
  const body = resolved.text || defaultAttachmentMessage(attachments);
  const now = new Date().toISOString();
  const conversationId = `conv-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const graphScopeId = createConversationGraphScopeId(conversationId);
  const turnRouter = options.turnRouter;
  if (options.runMainAgent !== false) requireComposedTurnRouter(turnRouter);
  const selectedProviderId = turnRouter?.resolveProviderId(project, input.providerId)
    ?? resolvePersistenceOnlyProviderId(project, input.providerId);
  const requestHash = stableConversationCreateRequestHash({
    productMode,
    body,
    contextRefs: resolved.contextRefs,
    attachmentIds: attachments.map((attachment) => attachment.id),
    providerId: selectedProviderId,
    skillOverrides,
    agentTurnMode,
  });
  const persistence = await openProjectConversationDatabase(
    project,
    options.runtimeStateResolver ?? turnRouter?.resolveRuntimeState,
    options.runMainAgent === false && !turnRouter,
  );
  const database = persistence.database;
  let creation: ReturnType<WorkbenchDatabase["unitOfWork"]["createConversationFromFirstSend"]>;
  let pendingAdmission: Awaited<ReturnType<ConversationTurnRoutingPort["admit"]>> | null = null;
  try {
    const existing = database.conversations.readConversationByClientCreateRequestId(persistence.projectId, clientRequestId);
    if (existing) {
      const legacyRequestHash = stableConversationCreateRequestHashV1({
        productMode,
        body,
        contextRefs: resolved.contextRefs,
        attachmentIds: attachments.map((attachment) => attachment.id),
        providerId: selectedProviderId,
        skillOverrides,
      });
      const requestMatches = existing.clientCreateRequestHash === requestHash
        || (existing.agentTurnMode === agentTurnMode && existing.clientCreateRequestHash === legacyRequestHash);
      if (existing.productMode !== productMode || !requestMatches) {
        const error = new Error("clientRequestId was already used for a different Conversation request.");
        error.name = "Conflict";
        throw error;
      }
      creation = { conversation: existing, message: null, replayed: true };
    } else {
      const admission = options.runMainAgent === false
        ? null
        : await turnRouter!.admit({
          project,
          productMode,
          conversationId,
          providerId: selectedProviderId,
          agentTurnMode,
          attachments,
        });
    creation = database.unitOfWork.createConversationFromFirstSend({
      conversation: {
      projectId: persistence.projectId,
      conversationId,
      productMode,
      agentTurnMode,
      clientCreateRequestId: clientRequestId,
      clientCreateRequestHash: requestHash,
      title,
      state: "active",
      boundChangeId: null,
      currentGraphScopeId: graphScopeId,
      selectedProviderId,
      completedTurnSequence: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      },
      message: toCanonicalTimelineMessage(persistence.projectId, conversationId, {
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
        agentTurnMode: agentTurnMode ?? undefined,
      }),
      skillOverrides,
    });
      if (admission && !creation.replayed) pendingAdmission = admission;
    }
  } finally {
    database.close();
  }
  const committed = creation.conversation;
  live?.emit({
    event: "topic.created",
    data: {
      projectId: persistence.projectId,
      productMode: committed.productMode,
      conversationId: committed.conversationId,
      clientRequestId,
      replayed: creation.replayed,
      topic: {
        id: committed.conversationId,
        conversationId: committed.conversationId,
        title: committed.title,
        state: committed.state,
        selectedProviderId: committed.selectedProviderId,
        productMode: committed.productMode,
        agentTurnMode: committed.agentTurnMode,
      },
    },
  });
  if (creation.message) publishCommittedCanonicalTimelineRow(live, creation.message, committed.productMode);
  if (!creation.replayed && options.runMainAgent !== false) {
    if (!creation.message) throw new Error("Committed first send is missing its canonical Timeline message.");
    if (!turnRouter) throw new Error("Workbench Conversation turn routing is not composed for Provider execution.");
    await turnRouter.route({
      project,
      conversation: committed,
      committedMessage: creation.message,
      attachments,
      providerId: committed.selectedProviderId,
      live,
      admission: pendingAdmission!,
    }, productMode);
  }
  return {
    conversationId: committed.conversationId,
    title: committed.title,
    state: committed.state,
    productMode: committed.productMode,
    clientRequestId,
    replayed: creation.replayed,
    selectedProviderId: committed.selectedProviderId,
    agentTurnMode: committed.agentTurnMode,
  };
}

export async function updateWorkbenchConversationTitle(
  project: ManagedProject,
  conversationId: string,
  input: { title: string },
  options: { runtimeStateResolver?: (project: ManagedProject) => Promise<ProjectRuntimeState> } = {},
): Promise<{ id: string; productMode: ProductMode; title: string; state: string; updatedAt: string; selectedProviderId?: string }> {
  const persistence = await openProjectConversationDatabase(project, options.runtimeStateResolver, true);
  const title = normalizeConversationTitle(input.title);
  const updatedAt = new Date().toISOString();
  const database = persistence.database;
  try {
    const conversation = database.conversations.updateConversationTitle(persistence.projectId, conversationId, title, updatedAt);
    const projection = {
      id: conversation.conversationId,
      productMode: conversation.productMode,
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
  options: { turnRouter?: ConversationTurnRoutingPort; runtimeStateResolver?: (project: ManagedProject) => Promise<ProjectRuntimeState> } = {},
): Promise<TopicMessageResult> {
  const turnRouter = options.turnRouter;
  requireComposedTurnRouter(turnRouter);
  const identity = await resolveStoredConversationIdentity(project, conversationId, options.runtimeStateResolver ?? turnRouter.resolveRuntimeState);
  conversationId = identity.conversationId;
  const requestedMode = typeof input === "string" ? undefined : input.productMode;
  turnRouter.assertRequestedMode(identity.conversation, requestedMode);
  const parsed = await normalizeTopicMessageInput(project, input);
  const runtimeState = identity.runtimeState;
  if (identity.conversation.productMode === "agent" && parsed.planHandoffIntent) {
    const error = new Error("Agent mode does not accept AHO child feedback or planning handoffs.");
    error.name = "Conflict";
    throw error;
  }
  if (parsed.agentSurfaceId) {
    if (identity.conversation.productMode === "agent") {
      if (parsed.contextRefs?.length || parsed.attachments?.length || parsed.planHandoffIntent || parsed.providerId) {
        const error = new Error("Native child follow-up supports plain text only and cannot switch Providers or carry Main context.");
        error.name = "BadRequest";
        throw error;
      }
      if (!turnRouter?.runAgentNativeChildFollowup) throw new Error("Workbench Agent child routing is not composed.");
      return turnRouter.runAgentNativeChildFollowup({
        project,
        conversationId,
        agentSurfaceId: parsed.agentSurfaceId,
        message: parsed.message,
        live,
      });
    }
    if (runtimeState.state === "onboarding") {
      const error = new Error("Project Harness onboarding accepts Main conversation text and attachments only.");
      error.name = "Conflict";
      throw error;
    }
    if (runtimeState.state === "repair-required") {
      throw new Error("Project Harness requires repair before planning or source execution.");
    }
    if (parsed.contextRefs?.length || parsed.attachments?.length || parsed.planHandoffIntent || parsed.providerId) {
      const error = new Error("Child Agent feedback supports text only and cannot switch providers or carry Main planning context.");
      error.name = "BadRequest";
      throw error;
    }
    if (!turnRouter?.runExactChildAgentTurn) throw new Error("Workbench Harness child routing is not composed.");
    return turnRouter.runExactChildAgentTurn({ project, conversationId, agentSurfaceId: parsed.agentSurfaceId, message: parsed.message, live });
  }
  if (identity.conversation.productMode === "harness" && runtimeState.state === "onboarding"
    && (parsed.planHandoffIntent || parsed.providerId)) {
    const error = new Error("Project Harness onboarding accepts Main conversation text and attachments only.");
    error.name = "Conflict";
    throw error;
  }
  if (identity.conversation.productMode === "harness" && runtimeState.state === "repair-required") {
    throw new Error("Project Harness requires repair before planning or source execution.");
  }
  let providerSwitch: ProviderSwitchResult | null = null;
  if (parsed.providerId && identity.conversation.productMode === "harness" && runtimeState.state === "ready") {
    if (!turnRouter.switchProviderAtSafePoint) {
      throw new Error("Workbench Provider switching is not composed.");
    }
    providerSwitch = await turnRouter.switchProviderAtSafePoint({
      project,
      resolution: runtimeState.resolution,
      conversationId,
      targetProviderId: parsed.providerId,
    });
  }
  if (parsed.providerId && identity.conversation.productMode === "agent") {
    if (parsed.providerId !== identity.conversation.selectedProviderId) {
      const error = new Error("Direct Agent provider switching is not supported in this increment.");
      error.name = "Conflict";
      throw error;
    }
  }
  const agentTurnMode = normalizeRequestedAgentTurnMode(
    identity.conversation.productMode,
    parsed.agentTurnMode ?? identity.conversation.agentTurnMode ?? undefined,
  );
  const admission = await turnRouter.admit({
    project,
    productMode: identity.conversation.productMode,
    conversationId,
    providerId: identity.conversation.selectedProviderId,
    agentTurnMode,
    attachments: parsed.attachments ?? [],
  });
  const committed = await commitTopLevelConversationMessage(identity, { ...parsed, agentTurnMode: agentTurnMode ?? undefined }, turnRouter, live);
  const result = await turnRouter.route({
    project,
    conversation: committed.conversation,
    committedMessage: committed.message,
    attachments: parsed.attachments ?? [],
    providerId: committed.conversation.selectedProviderId,
    live,
    harnessHandoff: committed.planHandoff,
    admission,
  }, requestedMode);
  if (providerSwitch && parsed.providerSwitchIntent === "resume-workflow") {
    if (runtimeState.state !== "ready") {
      throw new Error("Provider workflow continuation requires a ready project Harness.");
    }
    const request = await resolveProviderSwitchWorkflowResumeRequest({
      project,
      resolution: runtimeState.resolution,
      conversationId,
      switchResult: providerSwitch,
    });
    if (request) {
      await runWorkbenchWorkflowAction(project, request, live, {
        postConversationMessage: (ownerProject, ownerConversationId, ownerInput, ownerLive) => postConversationMessage(
          ownerProject,
          ownerConversationId,
          ownerInput,
          ownerLive,
          { turnRouter },
        ),
        continueMainAgentTurn: turnRouter.continueMainAgentTurn,
      });
    }
  }
  return result;
}

export async function listConversationMessages(project: ManagedProject, conversationId: string): Promise<TopicThreadEntry[]> {
  const persistence = await openProjectConversationDatabase(project, undefined, true);
  if (!persistence.projectId) return [];
  if (persistence.runtimeState.state === "ready") conversationId = await resolveConversationId(project, conversationId);
  const database = persistence.database;
  try {
    return database.timeline.listConversationMessages(persistence.projectId, conversationId).map(fromStoredThreadMessage);
  } finally {
    database.close();
  }
}

async function openProjectConversationDatabase(
  project: ManagedProject,
  runtimeStateResolver: ((project: ManagedProject) => Promise<ProjectRuntimeState>) | undefined,
  allowUncomposedPersistence = false,
): Promise<{
  projectId: string;
  database: WorkbenchDatabase;
  runtimeState: ProjectRuntimeState;
}> {
  if (!runtimeStateResolver) {
    if (!allowUncomposedPersistence) throw new Error("Workbench Conversation runtime state is not composed.");
    runtimeStateResolver = (selectedProject) => resolveProjectRuntimeState(selectedProject, {
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });
  }
  const runtimeState = await runtimeStateResolver(project);
  const paths = runtimeState.state === "onboarding" ? runtimeState.paths : runtimeState.resolution.paths;
  return {
    projectId: paths.projectId,
    database: await openProjectRuntimeWorkbenchDatabase(paths),
    runtimeState,
  };
}

function requireComposedTurnRouter(turnRouter: ConversationTurnRoutingPort | undefined): asserts turnRouter is ConversationTurnRoutingPort & {
  resolveProviderId: NonNullable<ConversationTurnRoutingPort["resolveProviderId"]>;
  resolveRuntimeState: NonNullable<ConversationTurnRoutingPort["resolveRuntimeState"]>;
} {
  if (!turnRouter) throw new Error("Workbench Conversation turn routing is not composed for Provider execution.");
  if (!turnRouter.resolveProviderId || !turnRouter.resolveRuntimeState) {
    throw new Error("Workbench Conversation Provider/runtime composition is incomplete.");
  }
}

function resolvePersistenceOnlyProviderId(project: ManagedProject, requestedProviderId?: string): string {
  const providerId = requestedProviderId?.trim() || project.defaultProviderId?.trim();
  // This branch exists only for runMainAgent:false persistence fixtures. Any
  // execution path is rejected above unless the server-composed Router owns
  // Provider validation and runtime identity.
  if (!providerId) throw new Error("Persistence-only Conversation creation requires a Provider identity.");
  return providerId;
}

async function normalizeTopicMessageInput(project: ManagedProject, input: string | TopicMessageInput): Promise<Required<Pick<TopicMessageInput, "mode" | "message">> & { contextRefs?: TopicMessageInput["contextRefs"]; attachments?: TopicAttachment[]; planHandoffIntent?: TopicMessageInput["planHandoffIntent"]; providerId?: string; providerSwitchIntent: "resume-workflow" | "conversation-only"; agentSurfaceId?: string; agentTurnMode?: AgentTurnMode }> {
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
    agentTurnMode: typeof input === "string" || input.agentTurnMode === undefined
      ? undefined
      : assertAgentTurnMode(input.agentTurnMode),
  };
}

function defaultAttachmentMessage(attachments: TopicAttachment[]): string {
  if (attachments.length === 0) return "";
  const imageCount = attachments.filter((attachment) => attachment.kind === "image").length;
  const textCount = attachments.filter((attachment) => attachment.kind === "text").length;
  if (imageCount > 0 && textCount === 0) return "Please inspect the attached image first, describe what you see, and ask a clarifying question if the requested outcome is unclear.";
  if (textCount > 0 && imageCount === 0) return "Please use the attached file content as message-scoped context for this request.";
  return "Please use the attached images and files as message-scoped context for this request.";
}

async function resolveStoredConversationIdentity(
  project: ManagedProject,
  requestedConversationId: string,
  runtimeStateResolver?: (project: ManagedProject) => Promise<ProjectRuntimeState>,
): Promise<{ conversationId: string; conversation: StoredConversation; runtimeState: ProjectRuntimeState }> {
  const persistence = await openProjectConversationDatabase(project, runtimeStateResolver);
  let conversationId = requestedConversationId;
  try {
    let conversation = persistence.database.conversations.readConversation(
      persistence.projectId,
      conversationId,
    );
    if (!conversation && persistence.runtimeState.state === "ready") {
      conversationId = await resolveConversationId(project, requestedConversationId);
      conversation = persistence.database.conversations.readConversation(
        persistence.projectId,
        conversationId,
      );
    }
    if (!conversation) {
      const error = new Error(`Conversation not found: ${requestedConversationId}.`);
      error.name = "NotFound";
      throw error;
    }
    return {
      conversationId: conversation.conversationId,
      conversation,
      runtimeState: persistence.runtimeState,
    };
  } finally {
    persistence.database.close();
  }
}

async function commitTopLevelConversationMessage(
  identity: Awaited<ReturnType<typeof resolveStoredConversationIdentity>>,
  parsed: Awaited<ReturnType<typeof normalizeTopicMessageInput>>,
  turnRouter: ConversationTurnRoutingPort,
  live?: WorkbenchLiveSink,
): Promise<{
  conversation: StoredConversation;
  message: StoredTopicMessage;
  planHandoff?: ValidatedPlanHandoffIntent;
}> {
  const { runtimeState } = identity;
  const paths = runtimeState.state === "onboarding" ? runtimeState.paths : runtimeState.resolution.paths;
  const projectId = identity.conversation.projectId;
  const conversationId = identity.conversationId;
  const database = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    const conversation = database.conversations.readConversation(projectId, conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}.`);
    turnRouter.assertRequestedMode(conversation, identity.conversation.productMode);
    const delivery = new CanonicalTimelineDelivery(database, conversation.productMode, live);
    const now = new Date().toISOString();
    let planHandoff: ValidatedPlanHandoffIntent | undefined;
    let graphScopeId = conversation.currentGraphScopeId ?? createConversationGraphScopeId(conversationId);
    if (conversation.productMode === "harness" && runtimeState.state === "ready") {
      planHandoff = validatePlanHandoffIntent(
        database.timeline.listConversationMessages(projectId, conversationId).map(fromStoredThreadMessage),
        parsed.planHandoffIntent,
      );
      const supersedingExecutedChange = Boolean(planHandoff?.kind === "revise-plan"
        && conversation.boundChangeId
        && await hasPlanningExecutionEvidence({
          projectId,
          projectRoot: runtimeState.resolution.projectRoot,
          runsRoot: runtimeState.resolution.paths.runsRoot,
          workbenchRoot: runtimeState.resolution.paths.workbenchRoot,
          worktreeMetadataRoot: runtimeState.resolution.paths.worktreeMetadataRoot,
        }, conversation.boundChangeId));
      const completedBoundChange = Boolean(!planHandoff && conversation.boundChangeId
        && await readProjectHarnessChangeContext(
          runtimeState.resolution.harness.skillRoot,
          conversation.boundChangeId,
          false,
        ).then((context) => context.evidence_state !== "active").catch(() => true));
      const terminalGraphScope = Boolean(conversation.currentGraphScopeId
        && database.conversations.isConversationGraphScopeTerminal(projectId, conversation.currentGraphScopeId));
      graphScopeId = !completedBoundChange && !supersedingExecutedChange && !terminalGraphScope && conversation.currentGraphScopeId
        ? conversation.currentGraphScopeId
        : createConversationGraphScopeId(conversationId);
    }
    if (graphScopeId !== conversation.currentGraphScopeId) {
      delivery.publishCommittedMany(database.unitOfWork.startConversationGraphScope(projectId, conversationId, graphScopeId, now));
      publishAgentSurfacesInvalidated(projectId, { conversationId, graphScopeId, reason: "scope-changed" });
    }
    const user: TopicThreadEntry = {
      id: `user:${conversationId}:${Date.now().toString(36)}`,
      type: "user.message",
      timestamp: now,
      conversationId,
      graphScopeId,
      changeId: "",
      completedTurnSequence: conversation.completedTurnSequence + 1,
      text: parsed.message,
      contextRefs: parsed.contextRefs,
      attachments: parsed.attachments,
      planHandoff,
      agentTurnMode: parsed.agentTurnMode,
    };
    const userWrite = toCanonicalTimelineMessage(projectId, conversationId, user);
    if (conversation.productMode === "agent") {
      const committedUser = database.unitOfWork.commitAgentConversationMessage({
        projectId,
        conversationId,
        expectedAgentTurnMode: conversation.agentTurnMode ?? "default",
        agentTurnMode: parsed.agentTurnMode ?? conversation.agentTurnMode ?? "default",
        updatedAt: now,
        message: userWrite,
      });
      delivery.publishCommitted(committedUser);
    } else {
      delivery.append(userWrite);
    }
    const proposalStatus = planHandoff?.kind === "revise-plan"
      ? "revision-requested"
      : planHandoff?.kind === "skip-plan" ? "skipped" : null;
    if (proposalStatus && planHandoff) {
      delivery.publishCommitted(database.interactions.updatePlanningMessageStatus(
        projectId,
        conversationId,
        planHandoff.sourceArtifact,
        proposalStatus,
      ));
      publishAgentSurfacesInvalidated(projectId, { conversationId, graphScopeId, reason: "interaction-updated" });
    }
    const committedConversation = database.conversations.readConversation(projectId, conversationId);
    const committedMessage = database.timeline.readMessage(projectId, conversationId, user.id);
    if (!committedConversation || !committedMessage) {
      throw new Error("Committed Conversation Turn could not be reloaded.");
    }
    return { conversation: committedConversation, message: committedMessage, planHandoff };
  } finally {
    database.close();
  }
}

function normalizeClientRequestId(value: string): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized || normalized.length > 128 || !/^[A-Za-z0-9._:-]+$/.test(normalized)) {
    const error = new Error("clientRequestId must be 1 to 128 URL-safe characters.");
    error.name = "BadRequest";
    throw error;
  }
  return normalized;
}

function normalizeSkillOverrides(value: NewConversationSkillOverride[] | undefined): NewConversationSkillOverride[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    const error = new Error("skillOverrides must be an array.");
    error.name = "BadRequest";
    throw error;
  }
  const normalized = new Map<string, boolean>();
  for (const item of value) {
    const skillId = typeof item?.skillId === "string" ? item.skillId.trim() : "";
    if (!skillId || typeof item?.enabled !== "boolean" || normalized.has(skillId)) {
      const error = new Error("skillOverrides must contain unique non-empty skillId values and boolean enabled values.");
      error.name = "BadRequest";
      throw error;
    }
    normalized.set(skillId, item.enabled);
  }
  return [...normalized]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([skillId, enabled]) => ({ skillId, enabled }));
}

function stableConversationCreateRequestHash(input: {
  productMode: ProductMode;
  body: string;
  contextRefs: TopicMessageInput["contextRefs"];
  attachmentIds: string[];
  providerId: string;
  skillOverrides: NewConversationSkillOverride[];
  agentTurnMode: AgentTurnMode | null;
}): string {
  return createHash("sha256").update(JSON.stringify({
    version: 2,
    productMode: input.productMode,
    body: input.body,
    contextRefs: input.contextRefs ?? [],
    attachmentIds: input.attachmentIds,
    providerId: input.providerId,
    skillOverrides: input.skillOverrides,
    agentTurnMode: input.agentTurnMode,
  })).digest("hex");
}

function stableConversationCreateRequestHashV1(input: Omit<Parameters<typeof stableConversationCreateRequestHash>[0], "agentTurnMode">): string {
  return createHash("sha256").update(JSON.stringify({
    version: 1,
    productMode: input.productMode,
    body: input.body,
    contextRefs: input.contextRefs ?? [],
    attachmentIds: input.attachmentIds,
    providerId: input.providerId,
    skillOverrides: input.skillOverrides,
  })).digest("hex");
}

function normalizeRequestedAgentTurnMode(productMode: ProductMode, value: AgentTurnMode | undefined): AgentTurnMode | null {
  if (productMode === "harness") {
    if (value !== undefined) {
      const error = new Error("Harness requests cannot carry agentTurnMode.");
      error.name = "Conflict";
      throw error;
    }
    return null;
  }
  if (value === undefined) return "default";
  try {
    return assertAgentTurnMode(value);
  } catch (cause) {
    const error = cause instanceof Error ? cause : new Error(String(cause));
    error.name = "BadRequest";
    throw error;
  }
}
