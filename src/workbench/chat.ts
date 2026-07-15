import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { auditHarness } from "../harness/audit.js";
import { defaultProviderRegistry, type ProviderOperationProfile, type ProviderTurnResult } from "../provider-runtime/index.js";
import { agentThreadSurfaceId } from "../provider-runtime/agent-surface-id.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { ensureProjectRuntime } from "../harness/init.js";
import { writeJsonFile } from "../fs/json.js";
import { listRuns } from "../run/manager.js";
import { getGitCommit, getGitStatusShort } from "../project/git.js";
import { assertChangeFinalizationReady, closeChangeForFinalization } from "../change/manager.js";
import { getSystemSkillsRoot } from "../template-source/paths.js";
import { runSchedulerReadySetInitialization } from "../workflow-runtime/scheduler.js";
import {
  claimTransitionExecution,
  issueLocalExecutionAuthorization,
  markTransitionExecutionStarted,
  readExecutionAuthorization,
} from "../workflow-runtime/execution-authorization.js";
import type { LocalExecutionAuthorization, ManagedProject, ResolvedMemory, RunMetadata } from "../types/index.js";
import { buildMainAgentExecutionContext } from "./main-agent-context.js";
import { runWorkbenchWorkflowActionService } from "./actions/service.js";
import { artifactForActionResult, extractRunId, labelForAction, summarizeActionResult, workflowFailureMessage } from "./actions/results.js";
import { assertWorkflowActionScope, auditHighImpactWorkflowAction, workflowActionScopePayload, workflowActionTargetId } from "./actions/boundary.js";
import { dispatchWorkbenchWorkflowAction } from "./actions/dispatcher.js";
import { buildWorkbenchActionHandlers } from "./actions/handlers/index.js";
import { recordWorkbenchDecision } from "./decisions.js";
import { validatePlanHandoffIntent } from "./plan-handoff.js";
import { resolveTopicAttachments } from "./attachments.js";
import { resolveTopicFileReferences } from "./file-references.js";
import { childTranscriptCapturesForThread, createAssistantTranscriptCapture, type AssistantTranscriptCapture, type ChildTranscriptCapture, type MainTranscriptCapture } from "./live-transcript.js";
import { forwardProviderRealtimeEvent } from "./provider-live-events.js";
import { getSingleActiveChangeId, resolveTopic } from "./topic-resolver.js";
import { openConversationTimelineWriter } from "./conversation-thread.js";
import { collectAllConversationThreadEntries, fromStoredThreadMessage, readConversationThread as readThreadLog } from "./conversation-thread-log.js";
import { WorkbenchStore, type StoredTopicMessage } from "./store.js";
import { assembleSharedConversationContext } from "./shared-conversation-context.js";
import { resolveProviderSwitchWorkflowResumeRequest, switchConversationProviderAtSafePoint, type ProviderSwitchResult } from "./provider-switch.js";
import { canonicalTranscriptCellsFromThreadItem, type ParentAgentTranscriptCell } from "./parent-agent-transcript.js";
import { acceptCurrentConversationPlanningPackage, readPlannerChildProposal, writePlannerChildProposal } from "./planning/planner-child-proposal.js";
import { hasPlanningExecutionEvidence } from "../change/manager.js";
import type {
  AssistantTurnBlock,
  TopicAttachment,
  ValidatedPlanHandoffIntent,
  TopicMessageInput,
  TopicMessageResult,
  TopicThreadEntry,
  WorkbenchLiveSink,
  WorkbenchWorkflowActionRequest,
  WorkbenchWorkflowActionResult,
  WorkbenchWorkflowActionType,
} from "./types.js";
export { recordWorkbenchDecision } from "./decisions.js";
export { appendConversationThreadEntry } from "./conversation-thread.js";

const PROJECT_PLANNING_AGENT_ROLE_ID = "planning-agent";

export type {
  AssistantTurnActivity,
  AssistantTurnBlock,
  AssistantTurnBlockKind,
  TopicMessageInput,
  TopicMessageResult,
  TopicThreadEntry,
  WorkbenchAssistantEvent,
  WorkbenchLiveEvent,
  WorkbenchLiveSink,
  WorkbenchLiveToolEvent,
  WorkbenchMessageMode,
  WorkbenchWorkflowActionRequest,
  WorkbenchWorkflowActionResult,
  WorkbenchWorkflowActionType,
} from "./types.js";

const PROJECT_SCOPED_WORKFLOW_ACTIONS = new Set<WorkbenchWorkflowActionType>([
  "demand.worker.start-available",
  "demand.worker.reconcile",
  "orchestrator.pump",
]);

export async function createWorkbenchConversation(
  project: ManagedProject,
  input: { title: string; body?: string; contextRefs?: TopicMessageInput["contextRefs"]; attachmentIds?: string[]; providerId?: string },
  live?: WorkbenchLiveSink,
  options: { runMainAgent?: boolean } = {},
): Promise<{ conversationId: string; title: string; state: "active" }> {
  const memory = await ensureProjectRuntime(project);
  assertWritableMemory(memory, "Workbench conversation");
  if (!memory.projectId) throw new Error("Project id is required to create a conversation.");
  const resolved = await resolveTopicFileReferences(project, input.body ?? input.title, input.contextRefs);
  const attachments = await resolveTopicAttachments(project, input.attachmentIds);
  const body = resolved.text || defaultAttachmentMessage(attachments);
  const now = new Date().toISOString();
  const conversationId = `conv-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const graphScopeId = createGraphScopeId(conversationId);
  const selectedProviderId = input.providerId
    ? defaultProviderRegistry.get(input.providerId).id
    : project.defaultProviderId
    ? defaultProviderRegistry.get(project.defaultProviderId).id
    : defaultProviderRegistry.requireOnly().id;
  const store = await WorkbenchStore.open(memory);
  try {
    store.createConversation({
      projectId: memory.projectId,
      conversationId,
      title: input.title,
      state: "active",
      boundChangeId: null,
      currentGraphScopeId: graphScopeId,
      selectedProviderId,
      completedTurnSequence: 0,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    store.appendMessage(toConversationStoredMessage(memory.projectId, conversationId, {
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
    store.close();
  }
  live?.emit({
    event: "topic.created",
    data: { topic: { id: conversationId, conversationId, title: input.title, state: "active", selectedProviderId } },
  });
  const userEntry: TopicThreadEntry = {
      id: `user:${conversationId}:1`,
      type: "user.message",
      timestamp: now,
      conversationId,
      graphScopeId,
      changeId: "",
      text: body,
      contextRefs: resolved.contextRefs.length > 0 ? resolved.contextRefs : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    };
  live?.emit({ event: "timeline.patch", data: canonicalTimelinePatchForEntry(userEntry) });
  if (options.runMainAgent !== false) {
    await runProjectScopedMainAgentTurn(project, conversationId, body, live, undefined, { graphScopeId });
  }
  return { conversationId, title: input.title, state: "active" };
}

export async function postConversationMessage(project: ManagedProject, conversationId: string, input: string | TopicMessageInput, live?: WorkbenchLiveSink): Promise<TopicMessageResult> {
  const parsed = await normalizeTopicMessageInput(project, input);
  const memory = await ensureProjectRuntime(project);
  assertWritableMemory(memory, "Workbench conversation");
  if (!memory.projectId) throw new Error("Project id is required to post a conversation message.");
  conversationId = await resolveConversationId(project, conversationId);
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
  const store = await WorkbenchStore.open(memory);
  try {
    const conversation = store.readConversation(memory.projectId, conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}.`);
    const existingMessages = store.listConversationMessages(memory.projectId, conversationId).map(fromStoredThreadMessage);
    planHandoff = validatePlanHandoffIntent(existingMessages, parsed.planHandoffIntent);
    const supersedingExecutedChange = Boolean(
      planHandoff?.kind === "revise-plan"
      && conversation.boundChangeId
      && await hasPlanningExecutionEvidence(memory, conversation.boundChangeId),
    );
    const completedBoundChange = Boolean(
      !planHandoff
      && conversation.boundChangeId
      && !existsSync(join(memory.changesRoot, "active", conversation.boundChangeId)),
    );
    const terminalGraphScope = Boolean(
      conversation.currentGraphScopeId
      && store.isConversationGraphScopeTerminal(memory.projectId, conversation.currentGraphScopeId),
    );
    const graphScopeId = !completedBoundChange && !supersedingExecutedChange && !terminalGraphScope && conversation.currentGraphScopeId
      ? conversation.currentGraphScopeId
      : createGraphScopeId(conversationId);
    if (graphScopeId !== conversation.currentGraphScopeId) {
      store.startConversationGraphScope(memory.projectId, conversationId, graphScopeId, now);
    }
    user = { ...user, graphScopeId, completedTurnSequence: conversation.completedTurnSequence + 1 };
    storedUser = { ...user, planHandoff };
    store.appendMessage(toConversationStoredMessage(memory.projectId, conversationId, storedUser));
    if (planHandoff) {
      const proposalStatus = planHandoff.kind === "revise-plan"
          ? "revision-requested"
          : planHandoff.kind === "cancel-plan"
            ? "cancelled"
            : null;
      if (proposalStatus) store.updatePlanningMessageStatus(memory.projectId, conversationId, planHandoff.sourceArtifact, proposalStatus);
      if (planHandoff.kind === "cancel-plan") {
        store.markConversationGraphScopeTerminal(memory.projectId, conversationId, graphScopeId, now);
      }
    }
  } finally {
    store.close();
  }
  live?.emit({ event: "timeline.patch", data: canonicalTimelinePatchForEntry(storedUser) });
  const assistant = await runProjectScopedMainAgentTurn(project, conversationId, parsed.message, live, planHandoff, { graphScopeId: storedUser.graphScopeId });
  if (providerSwitch && parsed.providerSwitchIntent === "resume-workflow") {
    const resumeRequest = await resolveProviderSwitchWorkflowResumeRequest({ project, memory, conversationId, switchResult: providerSwitch });
    if (resumeRequest) await runWorkbenchWorkflowAction(project, resumeRequest, live);
  }
  return { user: storedUser, assistant, run: null, providerSessionId: null, mode: "chat", assistantMessage: assistant.text ?? "" };
}

export async function listConversationMessages(project: ManagedProject, conversationId: string): Promise<TopicThreadEntry[]> {
  const memory = await resolveProjectMemory(project);
  if (!memory.projectId) return [];
  conversationId = await resolveConversationId(project, conversationId);
  const store = await WorkbenchStore.open(memory);
  try {
    return store.listConversationMessages(memory.projectId, conversationId).map(fromStoredThreadMessage);
  } finally {
    store.close();
  }
}

export async function resolveConversationId(project: ManagedProject, targetId: string): Promise<string> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Workbench conversation resolution");
  if (!memory.projectId) throw new Error("Project id is required to resolve a conversation.");
  const store = await WorkbenchStore.open(memory);
  try {
    const conversation = store.readConversation(memory.projectId, targetId)
      ?? store.readConversationByChangeId(memory.projectId, targetId);
    if (!conversation) throw new Error(`Conversation not found: ${targetId}.`);
    return conversation.conversationId;
  } finally {
    store.close();
  }
}

export function buildProjectScopedMainAgentPrompt(userMessage: string): string {
  return userMessage;
}

async function runProjectScopedMainAgentTurn(
  project: ManagedProject,
  conversationId: string,
  userMessage: string,
  live?: WorkbenchLiveSink,
  planHandoff?: ValidatedPlanHandoffIntent,
  options: { goalResume?: { deliveryKey: string; contextText: string }; graphScopeId?: string } = {},
): Promise<TopicThreadEntry> {
  const memory = await ensureProjectRuntime(project);
  assertWritableMemory(memory, "Project-scoped chat");
  if (!memory.projectId) throw new Error("Project id is required to run project-scoped chat.");
  const graphScopeId = options.graphScopeId ?? await currentConversationGraphScope(memory, conversationId);
  const runId = buildProjectConversationRunId(conversationId);
  const directory = join(memory.workbenchRoot, "conversations", conversationId, "runs", runId);
  let mainTimelineId = `assistant:${conversationId}:pending:${runId}:main`;
  const canonicalMessageIds = new Set<string>();
  let canonicalStore: WorkbenchStore | null = null;
  let canonicalPersistenceError: Error | null = null;
  let providerId = "";
  let attemptId = "";
  let mainSessionId: string | null = null;
  let completedTurnSequence = 0;
  let boundChangeId: string | null = null;
  let expectedResumeAttemptId: string | null = null;
  await mkdir(directory, { recursive: true });
  const capture = createAssistantTranscriptCapture(live, (snapshot) => {
    if (!canonicalStore) return true;
    try {
      const patches = persistCanonicalCapture({
        store: canonicalStore,
        messageIds: canonicalMessageIds,
        projectId: memory.projectId!,
        conversationId,
        graphScopeId,
        runId,
        providerId,
        attemptId,
        mainTimelineId,
        mainSessionId,
        snapshot,
      });
      for (const patch of patches) live?.emit({ event: "timeline.patch", data: patch });
      return true;
    } catch (error) {
      canonicalPersistenceError = error instanceof Error ? error : new Error(String(error));
      return false;
    }
  });
  const proposalDirectory = join(directory, "planner-proposal");
  await mkdir(proposalDirectory, { recursive: true });
  const mainOrchestrationSkillPath = join(getSystemSkillsRoot(), "aho-main-orchestration", "SKILL.md");
  const harnessEngineeringSkillPath = join(getSystemSkillsRoot(), "aho-harness-engineering", "SKILL.md");
  if (!existsSync(mainOrchestrationSkillPath)) throw new Error("原生 Main Skill 不可用：未找到 aho-main-orchestration。");
  const harnessAudit = await auditHarness(project.path);
  const onboarding = harnessAudit.readiness !== "ready";
  if (onboarding && !existsSync(harnessEngineeringSkillPath)) throw new Error("原生 Harness Skill 不可用：未找到 aho-harness-engineering。");
  const prompt = buildProjectScopedMainAgentPrompt(userMessage);
  const additionalContext: Record<string, { kind: "untrusted" | "application"; value: string }> = {
    "aho.project": {
      kind: "application",
      value: JSON.stringify({ projectRoot: project.path, memoryRoot: memory.memoryRoot, memoryMode: memory.mode }),
    },
    "aho.proposal-workspace": {
      kind: "application",
      value: JSON.stringify({ path: proposalDirectory, files: ["spec.md", "plan.md", "tasks.md", "notes.md"] }),
    },
    ...(onboarding ? {
      "aho.harness-onboarding": {
        kind: "application" as const,
        value: JSON.stringify({ mode: "onboard", harnessReadiness: harnessAudit.readiness }),
      },
    } : {}),
    ...(planHandoff ? {
      "aho.plan-handoff": {
        kind: "application" as const,
        value: JSON.stringify({
          kind: planHandoff.kind,
          executionMode: planHandoff.executionMode,
          sourceRunId: planHandoff.sourceRunId,
          sourceArtifact: planHandoff.sourceArtifact,
          feedback: planHandoff.feedback ?? null,
          planText: planHandoff.planText,
        }),
      },
    } : {}),
  };
  const planHandoffResume = planHandoff ? {
    deliveryKey: `plan-handoff:${createHash("sha256").update(JSON.stringify({
      conversationId,
      kind: planHandoff.kind,
      executionMode: planHandoff.executionMode ?? "scoped-auto",
      sourceRunId: planHandoff.sourceRunId,
      sourceArtifact: planHandoff.sourceArtifact,
      feedback: planHandoff.feedback ?? null,
    })).digest("hex")}`,
    contextText: prompt,
  } : undefined;
  await writeFile(join(directory, "prompt.md"), prompt, "utf8");
  let acceptedPlanMarker: TopicThreadEntry | null = null;
  let acceptedPlanning: Awaited<ReturnType<typeof acceptCurrentConversationPlanningPackage>> | null = null;
  const sessionStore = await WorkbenchStore.open(memory);
  try {
    const conversation = sessionStore.readConversation(memory.projectId, conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}.`);
    providerId = conversation.selectedProviderId;
    completedTurnSequence = conversation.completedTurnSequence;
    boundChangeId = conversation?.boundChangeId ?? null;
    const binding = sessionStore.readConversationProviderBinding(memory.projectId, conversationId, providerId);
    mainSessionId = binding?.nativeSessionId ?? null;
    const resumePoint = sessionStore.readLatestProviderResumePoint(memory.projectId, conversationId);
    expectedResumeAttemptId = resumePoint
      && resumePoint.targetProviderId === providerId
      && resumePoint.graphScopeId === graphScopeId
      && resumePoint.changeId === boundChangeId
      ? `attempt-${resumePoint.resumePointId}`
      : null;
  } finally {
    sessionStore.close();
  }
  const handoff = await assembleSharedConversationContext({
    project,
    memory,
    conversationId,
    providerId: providerId!,
    currentUserMessage: userMessage,
  });
  Object.assign(additionalContext, handoff.context);
  mainTimelineId = `assistant:${conversationId}:${providerId}:${runId}:main`;
  const providerAttempts = await readProviderAttempts(memory, conversationId);
  const queuedResumeAttempt = attemptStoreCandidate(
    providerAttempts,
    providerId!,
    graphScopeId,
    boundChangeId,
    expectedResumeAttemptId,
  );
  attemptId = queuedResumeAttempt?.attemptId ?? `attempt-${randomUUID()}`;
  capture.sink.emit({ event: "run.started", data: { runId, conversationId, graphScopeId, providerId, attemptId, actionType: "chat.ask" } });
  capture.sink.emit({ event: "run.status", data: { runId, conversationId, graphScopeId, providerId, attemptId, status: "connecting", label: "正在连接 Agent" } });
  const resolvedProvider = await defaultProviderRegistry.requireProfiles(providerId!, ["main"], project, project.path);
  const provider = resolvedProvider.descriptor;
  const capabilitySnapshot = resolvedProvider.snapshot;
  const attemptStartedAt = new Date().toISOString();
  const attemptStore = await WorkbenchStore.open(memory);
  try {
    const attemptRecord = {
      projectId: memory.projectId,
      conversationId,
      attemptId,
      graphScopeId,
      changeId: boundChangeId,
      agentTaskId: null,
      roleId: "main-agent",
      operationProfile: "main",
      providerId: providerId!,
      nativeSessionId: mainSessionId,
      model: capabilitySnapshot.effectiveModel ? { providerId: providerId!, modelId: capabilitySnapshot.effectiveModel } : null,
      capabilitySnapshot,
      handoffHash: handoff.hash,
      deliveredThroughCompletedTurn: completedTurnSequence,
      worktreeId: null,
      status: "running",
      createdAt: attemptStartedAt,
      updatedAt: attemptStartedAt,
    } as const;
    for (const stale of providerAttempts.filter((candidate) =>
      candidate.status === "queued"
      && candidate.attemptId !== queuedResumeAttempt?.attemptId
      && candidate.providerId === providerId
      && candidate.roleId === "main-agent"
      && candidate.operationProfile === "main")) {
      attemptStore.completeProviderAttempt(memory.projectId, stale.attemptId, "interrupted", stale.nativeSessionId, attemptStartedAt);
    }
    if (queuedResumeAttempt) {
      attemptStore.startQueuedProviderAttempt(memory.projectId, attemptId, {
        capabilitySnapshot,
        handoffHash: handoff.hash,
        deliveredThroughCompletedTurn: completedTurnSequence,
        model: attemptRecord.model,
        updatedAt: attemptStartedAt,
      });
    } else {
      attemptStore.createProviderAttempt(attemptRecord);
    }
  } finally {
    attemptStore.close();
  }
  canonicalStore = await WorkbenchStore.open(memory);
  const liveChildAttemptIds = new Set<string>();
  const registerLiveChildAttempt = (event: import("../provider-runtime/index.js").ProviderRealtimeEvent): void => {
    if (!canonicalStore || !event.threadId || event.roleId === "main-agent" || !event.parentThreadId) return;
    const childAttemptId = providerChildAttemptId(attemptId, event.threadId);
    if (liveChildAttemptIds.has(childAttemptId)) return;
    const childRoleId = event.roleId;
    const childProfile = providerOperationProfileForChildRole(childRoleId);
    if (!childProfile) return;
    canonicalStore.createProviderAttempt({
      projectId: memory.projectId!,
      conversationId,
      attemptId: childAttemptId,
      graphScopeId,
      changeId: boundChangeId,
      agentTaskId: null,
      roleId: childRoleId,
      operationProfile: childProfile,
      providerId: providerId!,
      nativeSessionId: event.threadId,
      model: capabilitySnapshot.effectiveModel ? { providerId: providerId!, modelId: capabilitySnapshot.effectiveModel } : null,
      capabilitySnapshot,
      handoffHash: createHash("sha256").update(JSON.stringify({ parentHandoffHash: handoff.hash, parentAttemptId: attemptId, parentThreadId: event.parentThreadId, childThreadId: event.threadId, roleId: childRoleId })).digest("hex"),
      deliveredThroughCompletedTurn: completedTurnSequence,
      worktreeId: null,
      status: "running",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    canonicalStore.writeProviderThread({
      projectId: memory.projectId!,
      conversationId,
      providerId: providerId!,
      providerThreadId: event.threadId,
      roleId: childRoleId,
      parentThreadId: event.parentThreadId,
      changeId: boundChangeId,
      graphScopeId,
      capabilityProfile: `${childProfile}-child-live-v1`,
      displayName: event.displayName,
      runId,
      updatedAt: new Date().toISOString(),
    });
    liveChildAttemptIds.add(childAttemptId);
  };
  persistCanonicalCapture({
    store: canonicalStore,
    messageIds: canonicalMessageIds,
    projectId: memory.projectId,
    conversationId,
    graphScopeId,
    runId,
    providerId,
    attemptId,
    mainTimelineId,
    mainSessionId,
    snapshot: capture,
  });
  let result: ProviderTurnResult;
  try {
    result = await provider.conversation.runTurn({
    providerId: providerId!,
    operationProfile: "main",
    attemptId,
    projectId: project.id,
    conversationId,
    runtimeScopeId: conversationId,
    roleId: "main-agent",
    runId,
    cwd: project.path,
    prompt,
    sandboxPolicy: "workspace-write",
    writableRoots: onboarding ? [project.path, memory.memoryRoot, proposalDirectory] : [proposalDirectory],
    runtimeWorkspaceRoots: [project.path, memory.memoryRoot, proposalDirectory],
    additionalContext,
    nativeSkillRoots: [getSystemSkillsRoot()],
    requiredNativeSkills: ["aho-main-orchestration", ...(onboarding ? ["aho-harness-engineering"] : [])],
    skillInputs: [
      { name: "aho-main-orchestration", path: mainOrchestrationSkillPath },
      ...(onboarding ? [{ name: "aho-harness-engineering", path: harnessEngineeringSkillPath }] : []),
    ],
    existingSession: mainSessionId ? { providerId: providerId!, sessionId: mainSessionId } : null,
    objectiveSession: true,
    objectiveResume: options.goalResume ?? planHandoffResume,
    tools: [
      {
        name: "aho_goal_yield",
        description: "Yield the current native Goal at the current AHO human gate. This tool never executes an action.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        name: "aho_accept_current_plan",
        description: "Accept the exact current user-confirmed planner-child proposal into Change artifacts and a WorkflowGraphPlan. This never starts execution.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
      },
      {
        name: "aho_finalize_current_change",
        description: "Declare the current authorized Change complete. AHO revalidates terminal evidence and closes it; this tool accepts no target or authority arguments.",
        inputSchema: { type: "object", properties: {}, additionalProperties: false },
      },
    ],
    onToolCall: async (call) => {
      if (Object.keys(call.arguments).length > 0) {
        return { contentItems: [{ type: "inputText", text: "AHO conversation tools do not accept caller-selected targets." }], success: false };
      }
      if (call.tool === "aho_accept_current_plan" && planHandoff?.kind === "execute-plan") {
        const acceptedProposal = await readPlannerChildProposal(planHandoff.sourceArtifact);
        const accepted = await acceptCurrentConversationPlanningPackage(project, conversationId, planHandoff.sourceArtifact);
        acceptedPlanning = accepted;
        boundChangeId = accepted.changeId;
        const acceptedStore = await WorkbenchStore.open(memory);
        try {
          acceptedStore.updatePlanningMessageStatus(memory.projectId!, conversationId, planHandoff.sourceArtifact, "accepted");
        } finally {
          acceptedStore.close();
        }
        acceptedPlanMarker = {
          ...projectScopedPlanningMessage(conversationId, graphScopeId, runId, `Accepted proposal ${accepted.proposalId}.`, PROJECT_PLANNING_AGENT_ROLE_ID, undefined, acceptedProposal.childThreadId, providerId!),
          status: "accepted",
        };
        if (accepted.workflowGraphPlan.graphMode === "ready-set-v1") {
          const acceptedTopic = await resolveTopic(project, accepted.changeId);
          await runSchedulerReadySetInitialization(acceptedTopic.memory, acceptedTopic.changePath, accepted.workflowGraphPlan);
        }
        return {
          contentItems: [{
            type: "inputText",
            text: `Accepted planning package ${accepted.proposalId} for Change ${accepted.changeId}. Compiled WorkflowGraphPlan ${accepted.workflowGraphPlan.id}. No execution leaf was started.`,
          }],
          success: true,
        };
      }
      if (call.tool === "aho_finalize_current_change") {
        if (!boundChangeId) {
          return { contentItems: [{ type: "inputText", text: "No active Change is bound to this Main Agent conversation." }], success: false };
        }
        await assertChangeFinalizationReady(memory, boundChangeId);
        const finalizeRequest = await createFinalizeRequest(memory, {
          changeId: boundChangeId,
          conversationId,
          providerThreadId: call.threadId,
          turnId: call.turnId,
        });
        const authorization = await readExecutionAuthorization(memory, finalizeRequest.authorizationId);
        const claim = await claimTransitionExecution(memory, {
          authorizationId: authorization.id,
          authorizationEpoch: finalizeRequest.authorizationEpoch,
          transition: "change.finalize",
          targetId: finalizeRequest.changeId,
          manifestHash: finalizeRequest.manifestHash,
          snapshot: authorizationSnapshot(authorization),
          claimedBy: "change-finalization",
          claimTtlMs: 10 * 60_000,
        });
        await markTransitionExecutionStarted(memory, claim.operationId, claim.claimToken, claim.fencingToken);
        const closed = await closeChangeForFinalization(project, {
          changeId: finalizeRequest.changeId,
          requestId: finalizeRequest.id,
          authorizationId: finalizeRequest.authorizationId,
          authorizationEpoch: finalizeRequest.authorizationEpoch,
          conversationId: finalizeRequest.conversationId,
          providerThreadId: finalizeRequest.providerThreadId,
          goalIdentityHash: finalizeRequest.goalIdentityHash,
          operationId: claim.operationId,
          claimToken: claim.claimToken,
          fencingToken: claim.fencingToken,
        });
        return {
          contentItems: [{ type: "inputText", text: `Change closed durably. Close receipt: ${closed.receiptPath ?? closed.archivePath}. The native Goal may now be completed.` }],
          success: true,
        };
      }
      if (call.tool !== "aho_goal_yield") {
        return { contentItems: [{ type: "inputText", text: "The requested AHO conversation tool is not available in this turn." }], success: false };
      }
      const context = boundChangeId
        ? await buildMainAgentExecutionContext(project, memory, boundChangeId, "Native Goal yielded for the current gate.")
        : "No accepted Change or executable workflow gate exists yet. Wait for plan review or further user input.";
      return { contentItems: [{ type: "inputText", text: context }], success: true, yieldAfterResponse: true };
    },
    paths: {
      events: join(directory, "provider-events.jsonl"),
      stderr: join(directory, "app-server-stderr.log"),
      lastMessage: join(directory, "last-message.md"),
      session: join(directory, "provider-session.json"),
    },
    onRealtimeEvent: (event) => {
      registerLiveChildAttempt(event);
      forwardProviderRealtimeEvent(event, capture.sink, { graphScopeId });
    },
    onUserInputRequest: (request) => {
      const requestKey = providerUserInputRequestKey(runId, request);
      const record = {
        providerId: request.providerId,
        attemptId: request.attemptId,
        requestKey,
        requestId: request.requestId,
        threadId: request.threadId,
        turnId: request.turnId,
        itemId: request.itemId,
        runId,
        runtimeScopeId: conversationId,
        conversationId,
        graphScopeId,
        changeId: boundChangeId ?? undefined,
        agentRoleId: request.roleId !== "main-agent" ? request.roleId : undefined,
        questions: request.questions,
        status: "pending" as const,
      };
      void persistProviderUserInputRequest(memory, record)
        .then((entry) => {
          live?.emit({ event: "timeline.patch", data: canonicalTimelinePatchForEntry(entry) });
          capture.sink.emit({ event: "provider.userInput.requested", data: record });
        })
        .catch((cause) => {
          capture.sink.emit({ event: "error", data: { runId, graphScopeId, message: cause instanceof Error ? cause.message : String(cause) } });
        });
    },
    onError: (error) => capture.sink.emit({ event: "error", data: { runId, message: error instanceof Error ? error.message : String(error) } }),
    model: capabilitySnapshot.effectiveModel ? { providerId: providerId!, modelId: capabilitySnapshot.effectiveModel } : null,
    });
  } catch (error) {
    canonicalStore?.close();
    canonicalStore = null;
    const failedAttemptStore = await WorkbenchStore.open(memory);
    try {
      failedAttemptStore.completeProviderAttempt(memory.projectId, attemptId, "failed", null, new Date().toISOString());
      for (const childAttemptId of liveChildAttemptIds) {
        failedAttemptStore.completeProviderAttempt(memory.projectId, childAttemptId, "failed", null, new Date().toISOString());
      }
    } finally {
      failedAttemptStore.close();
    }
    throw error;
  }
  if (canonicalPersistenceError) {
    canonicalStore.close();
    canonicalStore = null;
    const failedAttemptStore = await WorkbenchStore.open(memory);
    try {
      failedAttemptStore.completeProviderAttempt(memory.projectId, attemptId, "failed", result.session?.sessionId ?? null, new Date().toISOString());
      for (const childAttemptId of liveChildAttemptIds) {
        failedAttemptStore.completeProviderAttempt(memory.projectId, childAttemptId, "failed", null, new Date().toISOString());
      }
    } finally {
      failedAttemptStore.close();
    }
    throw canonicalPersistenceError;
  }
  const proposalFileEvidence = (child: typeof result.childThreads[number]): boolean => child.changedFiles.some((path) => {
    const normalized = path.replaceAll("\\", "/");
    return normalized.endsWith("/planner-proposal/spec.md")
      || normalized.endsWith("/planner-proposal/plan.md")
      || normalized.endsWith("/planner-proposal/tasks.md");
  });
  const childrenWithProposalEvidence = result.childThreads.filter(proposalFileEvidence);
  const plannerChildren = childrenWithProposalEvidence.length > 0
    ? childrenWithProposalEvidence
    : result.childThreads.length === 1
      ? result.childThreads
      : [];
  const postRunInvariantError = result.childThreads.length > 0 && plannerChildren.length !== 1
    ? new Error("Main Agent planning requires exactly one identifiable real planner child.")
    : (plannerChildren.length > 0 || planHandoff?.kind === "execute-plan") && !result.objective
      ? new Error("Main Agent planning and execution handoff requires a native Goal on the provider thread.")
      : null;
  if (postRunInvariantError) {
    capture.sink.emit({ event: "error", data: { runId, message: postRunInvariantError.message } });
  }
  let issuedAuthorization: LocalExecutionAuthorization | null = null;
  if (acceptedPlanning && !postRunInvariantError) {
    issuedAuthorization = await issueAcceptedPlanningAuthorization(project, memory, conversationId, result, acceptedPlanning, planHandoff);
  }
  const rawParentText = capture.text.trim()
    || stripProjectScopedPromptEcho(result.lastMessage, userMessage).trim()
    || result.error
    || "";
  const assistantText = rawParentText.trim();
  const latestMainCapture = [...capture.mainCaptures.values()].at(-1);
  if (latestMainCapture) {
    latestMainCapture.threadId ??= result.session?.sessionId ?? mainSessionId ?? undefined;
    latestMainCapture.turnId ??= result.turnId ?? undefined;
    if (!latestMainCapture.text && assistantText) {
      latestMainCapture.text = assistantText;
      if (!latestMainCapture.blocks.some((block) => block.kind === "prose")) {
        latestMainCapture.blocks.push({
          id: `prose:${providerId}:${attemptId}:${runId}:${latestMainCapture.threadId ?? "main"}:${latestMainCapture.turnId ?? "turn"}:final`,
          providerId,
          attemptId,
          runId,
          threadId: latestMainCapture.threadId,
          turnId: latestMainCapture.turnId,
          itemId: `final:${latestMainCapture.turnId ?? "turn"}`,
          sequence: (latestMainCapture.blocks.at(-1)?.sequence ?? 0) + 1,
          kind: "prose",
          timestamp: new Date().toISOString(),
          source: "provider",
          text: assistantText,
          status: result.status,
        });
      }
    }
    const hasTerminal = latestMainCapture.activity.some((item) => item.kind === "status"
      && (item.label === "completed" || item.label === "failed" || item.label === "blocked" || item.label === "cancelled"));
    if (!hasTerminal) {
      latestMainCapture.activity.push({
        kind: "status",
        label: result.status === "interrupted" ? "cancelled" : result.status,
        timestamp: new Date().toISOString(),
      });
    }
  }
  await writeFile(join(directory, "last-message.md"), assistantText, "utf8");
  const assistantLineageBlock = [...capture.blocks].reverse().find((block) => block.kind !== "usage" && (block.threadId || block.turnId));
  const assistant: TopicThreadEntry | null = assistantText || capture.blocks.length > 0 || capture.activity.length > 0 ? {
    id: mainTimelineId,
    type: "assistant.message",
    timestamp: new Date().toISOString(),
    conversationId,
    graphScopeId,
    changeId: "",
    text: assistantText || undefined,
    runId,
    providerId,
    sessionId: result.session?.sessionId,
    attemptId,
    threadId: result.session?.sessionId ?? assistantLineageBlock?.threadId,
    turnId: assistantLineageBlock?.turnId,
    artifact: `workbench/conversations/${conversationId}/runs/${runId}/last-message.md`,
    activity: capture.activity,
    blocks: capture.blocks.length > 0 ? capture.blocks : initialMainAgentBlocks([], runId, assistantText),
  } : null;
  const planMessages: TopicThreadEntry[] = [];
  let planReadyMarker: TopicThreadEntry | null = null;
  if (!canonicalStore) throw new Error("Canonical conversation store closed before turn completion.");
  const store = canonicalStore;
  const completedChildAttemptIds = new Set<string>();
  try {
    if (result.session) store.writeProviderThread({
      projectId: memory.projectId,
      conversationId,
      providerId,
      providerThreadId: result.session.sessionId,
      roleId: "main-agent",
      parentThreadId: null,
      changeId: boundChangeId,
      graphScopeId,
      capabilityProfile: "main-agent-goal-v1",
      updatedAt: new Date().toISOString(),
    });
    for (const child of result.childThreads) {
      const isPlannerChild = plannerChildren.some((planner) => planner.threadId === child.threadId);
      const childRoleId = isPlannerChild ? PROJECT_PLANNING_AGENT_ROLE_ID : "child-agent";
      if (isPlannerChild) {
        const childAttemptId = providerChildAttemptId(attemptId, child.threadId);
        const childHandoffHash = createHash("sha256").update(JSON.stringify({
          parentHandoffHash: handoff.hash,
          parentAttemptId: attemptId,
          parentThreadId: child.parentThreadId,
          childThreadId: child.threadId,
          roleId: childRoleId,
        })).digest("hex");
        const childAttempt = {
          projectId: memory.projectId,
          conversationId,
          attemptId: childAttemptId,
          graphScopeId,
          changeId: boundChangeId,
          agentTaskId: null,
          roleId: childRoleId,
          operationProfile: "planning",
          providerId,
          nativeSessionId: child.threadId,
          model: capabilitySnapshot.effectiveModel ? { providerId, modelId: capabilitySnapshot.effectiveModel } : null,
          capabilitySnapshot,
          handoffHash: childHandoffHash,
          deliveredThroughCompletedTurn: completedTurnSequence,
          worktreeId: null,
          status: "completed" as const,
          createdAt: attemptStartedAt,
          updatedAt: new Date().toISOString(),
        };
        if (liveChildAttemptIds.has(childAttemptId)) {
          store.completeProviderAttempt(memory.projectId, childAttemptId, "completed", child.threadId, childAttempt.updatedAt);
        } else {
          store.createProviderAttempt(childAttempt);
        }
        completedChildAttemptIds.add(childAttemptId);
      }
      store.writeProviderThread({
        projectId: memory.projectId,
        conversationId,
        providerId,
        providerThreadId: child.threadId,
        roleId: childRoleId,
        parentThreadId: child.parentThreadId,
        changeId: boundChangeId,
        graphScopeId,
        capabilityProfile: isPlannerChild ? "planner-child-v1" : "provider-child-v1",
        displayName: child.displayName,
        updatedAt: new Date().toISOString(),
      });
      for (const childCapture of childTranscriptCapturesForThread(capture.childCaptures, child.threadId)) {
        const childProcessMessage = projectScopedChildProcessMessage(
          conversationId,
          graphScopeId,
          runId,
          childRoleId,
          child.threadId,
          child.parentThreadId,
          providerId!,
          childCapture,
        );
        if (childProcessMessage) {
          childProcessMessage.providerId = providerId;
          childProcessMessage.sessionId = child.threadId;
          childProcessMessage.attemptId = isPlannerChild ? providerChildAttemptId(attemptId, child.threadId) : attemptId;
          childProcessMessage.status = childCaptureTimelineStatus(childCapture);
          planMessages.push(childProcessMessage);
          upsertCanonicalMessage(store, canonicalMessageIds, toConversationStoredMessage(memory.projectId, conversationId, childProcessMessage, completedTurnSequence + 1));
        }
      }
      if (!isPlannerChild) continue;
      let message: TopicThreadEntry;
      try {
        const proposal = await writePlannerChildProposal({
          directory,
          projectId: memory.projectId,
          conversationId,
          runId,
          parentThreadId: child.parentThreadId,
          childThreadId: child.threadId,
        });
        message = projectScopedPlanningMessage(
          conversationId,
          graphScopeId,
          runId,
          `${proposal.planMd.trim()}\n\nProposal hash: ${proposal.hash}\nLineage: ${proposal.parentThreadId} -> ${proposal.childThreadId}`,
          PROJECT_PLANNING_AGENT_ROLE_ID,
          proposal.artifact,
          child.threadId,
          providerId!,
        );
        const planReadyBlock: AssistantTurnBlock = {
          id: `plan-ready:${providerId}:${proposal.id}`,
          providerId,
          attemptId,
          runId,
          threadId: result.session?.sessionId,
          turnId: assistant?.turnId ?? result.turnId ?? undefined,
          sequence: (assistant?.blocks?.at(-1)?.sequence ?? 0) + 1,
          kind: "tool-result",
          timestamp: new Date().toISOString(),
          source: "aho",
          status: "completed",
          title: "计划已准备",
          text: "Plan Agent 已完成可确认的实现计划。",
          artifactRef: proposal.artifact,
          targetAgentSurfaceId: agentThreadSurfaceId(providerId, child.threadId),
        };
        if (assistant) {
          assistant.blocks = [...(assistant.blocks ?? []), planReadyBlock];
          if (!assistant.text) assistant.text = "Plan Agent 已完成可确认的实现计划。";
          assistant.threadId ??= result.session?.sessionId;
          assistant.turnId ??= result.turnId ?? undefined;
          const latestMainCapture = [...capture.mainCaptures.values()].at(-1);
          if (latestMainCapture) {
            latestMainCapture.blocks.push(planReadyBlock);
            if (!latestMainCapture.text) latestMainCapture.text = "Plan Agent 已完成可确认的实现计划。";
          }
        } else {
          planReadyMarker = {
            id: `assistant:${conversationId}:${providerId}:${runId}:plan-ready:${proposal.id}`,
            type: "assistant.message",
            timestamp: planReadyBlock.timestamp,
            conversationId,
            graphScopeId,
            changeId: "",
            text: "Plan Agent 已完成可确认的实现计划。",
            runId,
            providerId,
            threadId: result.session?.sessionId,
            turnId: result.turnId ?? undefined,
            blocks: [planReadyBlock],
          };
        }
      } catch (cause) {
        message = {
          ...projectScopedPlanningMessage(conversationId, graphScopeId, runId, child.finalText || "Plan child did not return a valid proposal.", PROJECT_PLANNING_AGENT_ROLE_ID, undefined, child.threadId, providerId!),
          status: "planner-proposal-invalid",
        };
        capture.sink.emit({ event: "error", data: { runId, message: cause instanceof Error ? cause.message : String(cause) } });
      }
      planMessages.push(message);
      message.providerId = providerId;
      message.sessionId = child.threadId;
      message.attemptId = providerChildAttemptId(attemptId, child.threadId);
      upsertCanonicalMessage(store, canonicalMessageIds, toConversationStoredMessage(memory.projectId, conversationId, message, completedTurnSequence + 1));
    }
    persistCanonicalCapture({
      store,
      messageIds: canonicalMessageIds,
      projectId: memory.projectId,
      conversationId,
      graphScopeId,
      runId,
      providerId,
      attemptId,
      mainTimelineId,
      mainSessionId: result.session?.sessionId ?? mainSessionId,
      snapshot: capture,
    });
    if (acceptedPlanMarker) upsertCanonicalMessage(store, canonicalMessageIds, toConversationStoredMessage(memory.projectId, conversationId, acceptedPlanMarker, completedTurnSequence + 1));
    if (planReadyMarker) upsertCanonicalMessage(store, canonicalMessageIds, toConversationStoredMessage(memory.projectId, conversationId, planReadyMarker, completedTurnSequence + 1));
    if (assistant && capture.mainCaptures.size === 0) {
      upsertCanonicalMessage(store, canonicalMessageIds, toConversationStoredMessage(memory.projectId, conversationId, assistant, completedTurnSequence + 1));
    }
    for (const childAttemptId of liveChildAttemptIds) {
      if (!completedChildAttemptIds.has(childAttemptId)) {
        store.completeProviderAttempt(
          memory.projectId,
          childAttemptId,
          result.status === "interrupted" ? "interrupted" : "failed",
          null,
          new Date().toISOString(),
        );
      }
    }
    store.completeProviderAttempt(memory.projectId, attemptId, result.status, result.session?.sessionId ?? null, new Date().toISOString());
    if (result.status === "completed") {
      completedTurnSequence = store.advanceCompletedTurnSequence(memory.projectId, conversationId, completedTurnSequence, new Date().toISOString());
    }
    store.writeConversationProviderBinding({
      projectId: memory.projectId,
      conversationId,
      providerId,
      nativeSessionId: result.session?.sessionId ?? mainSessionId,
      lastDeliveredCompletedTurn: completedTurnSequence,
      preferredModel: capabilitySnapshot.effectiveModel ? { providerId, modelId: capabilitySnapshot.effectiveModel } : null,
      lastUsedAt: new Date().toISOString(),
      bindingStatus: result.status === "failed" ? "stale" : "ready",
    });
  } catch (error) {
    const failedAt = new Date().toISOString();
    for (const childAttemptId of liveChildAttemptIds) {
      try {
        store.completeProviderAttempt(memory.projectId, childAttemptId, "failed", null, failedAt);
      } catch {
        // Preserve the original canonical persistence error.
      }
    }
    try {
      store.completeProviderAttempt(memory.projectId, attemptId, "failed", result.session?.sessionId ?? null, failedAt);
    } catch {
      // Preserve the original canonical persistence error.
    }
    throw error;
  } finally {
    store.close();
    canonicalStore = null;
  }
  for (const planMessage of planMessages) live?.emit({ event: "timeline.patch", data: canonicalTimelinePatchForEntry(planMessage) });
  if (planReadyMarker) live?.emit({ event: "timeline.patch", data: canonicalTimelinePatchForEntry(planReadyMarker) });
  if (assistant && capture.mainCaptures.size === 0) live?.emit({ event: "timeline.patch", data: canonicalTimelinePatchForEntry(assistant) });
  if (postRunInvariantError) throw postRunInvariantError;
  const autoAcceptedPlanning = acceptedPlanning as Awaited<ReturnType<typeof acceptCurrentConversationPlanningPackage>> | null;
  if (autoAcceptedPlanning
    && issuedAuthorization?.mode === "scoped-auto"
    && autoAcceptedPlanning.workflowGraphPlan.graphMode === "sequential-v1") {
    await runWorkbenchWorkflowAction(project, {
      actionType: "workflow.run.start",
      changeId: autoAcceptedPlanning.changeId,
      workflowGraphPlanId: autoAcceptedPlanning.workflowGraphPlan.id,
    }, live);
  }
  if (result.objective?.status === "complete") {
    const terminalStore = await WorkbenchStore.open(memory);
    try {
      terminalStore.markConversationGraphScopeTerminal(memory.projectId, conversationId, graphScopeId, new Date().toISOString());
    } finally {
      terminalStore.close();
    }
  }
  return assistant ?? planReadyMarker ?? planMessages.at(-1) ?? {
    id: `assistant:${conversationId}:${runId}:empty`,
    type: "assistant.message",
    timestamp: new Date().toISOString(),
    conversationId,
    graphScopeId,
    changeId: "",
    text: "",
    runId,
    blocks: [],
  };
}

function projectScopedPlanningMessage(conversationId: string, graphScopeId: string, runId: string, planText: string, roleId = PROJECT_PLANNING_AGENT_ROLE_ID, artifact?: string, childThreadId = "child", providerId?: string): TopicThreadEntry {
  const timestamp = new Date().toISOString();
  const block: AssistantTurnBlock = {
    id: `native-plan:${runId}`,
    runId,
    sequence: 1,
    kind: "prose",
    timestamp,
    source: "provider",
    text: planText.trim(),
  };
  return {
    id: `assistant:${conversationId}:${providerId ?? "provider"}:${runId}:planning-agent:${childThreadId}`,
    type: "assistant.message",
    timestamp,
    conversationId,
    changeId: "",
    text: planText.trim(),
    runId,
    providerId,
    threadId: childThreadId,
    agentRoleId: roleId,
    artifact,
    blocks: [block],
  };
}

async function readProviderAttempts(memory: ResolvedMemory, conversationId: string) {
  if (!memory.projectId) return [];
  const store = await WorkbenchStore.open(memory);
  try {
    return store.listProviderAttempts(memory.projectId, conversationId);
  } finally {
    store.close();
  }
}

function attemptStoreCandidate(
  attempts: Awaited<ReturnType<typeof readProviderAttempts>>,
  providerId: string,
  graphScopeId: string,
  changeId: string | null,
  expectedAttemptId: string | null,
) {
  if (!expectedAttemptId) return undefined;
  return [...attempts].reverse().find((attempt) =>
    attempt.status === "queued"
    && attempt.attemptId === expectedAttemptId
    && attempt.providerId === providerId
    && attempt.roleId === "main-agent"
    && attempt.operationProfile === "main"
    && attempt.graphScopeId === graphScopeId
    && attempt.changeId === changeId);
}

function providerChildAttemptId(parentAttemptId: string, childThreadId: string): string {
  return `${parentAttemptId}:child:${childThreadId}`;
}

function providerOperationProfileForChildRole(roleId: string | undefined): ProviderOperationProfile | null {
  if (roleId === PROJECT_PLANNING_AGENT_ROLE_ID) return "planning";
  if (roleId === "coder-agent" || roleId === "rework-coder" || roleId === "spec-test-generator") return "coder";
  if (roleId === "auditor-agent" || roleId === "spec-test-proposer") return "auditor";
  if (roleId === "memory-maintenance-agent") return "maintenance";
  if (roleId === "harness-evolution-agent") return "evolution";
  if (roleId === "evolution-scorer") return "evolution-scorer";
  return null;
}

interface CanonicalTimelinePatch {
  conversationId: string;
  graphScopeId?: string;
  messageId: string;
  agentSurfaceId: string;
  providerId?: string;
  roleId?: string;
  threadId?: string;
  parentThreadId?: string;
  status?: string;
  cells: ParentAgentTranscriptCell[];
}

function persistCanonicalCapture(input: {
  store: WorkbenchStore;
  messageIds: Set<string>;
  projectId: string;
  conversationId: string;
  graphScopeId: string;
  runId: string;
  providerId: string;
  attemptId: string;
  mainTimelineId: string;
  mainSessionId: string | null;
  snapshot: AssistantTranscriptCapture;
}): CanonicalTimelinePatch[] {
  const patches: CanonicalTimelinePatch[] = [];
  if (input.snapshot.mainCaptures.size === 0) {
    const mainLineage = [...input.snapshot.blocks].reverse().find((block) => block.kind !== "usage" && (block.threadId || block.turnId));
    const mainEntry: TopicThreadEntry = {
      id: input.mainTimelineId,
      type: "assistant.message",
      timestamp: input.snapshot.blocks[0]?.timestamp ?? input.snapshot.activity[0]?.timestamp ?? new Date().toISOString(),
      conversationId: input.conversationId,
      graphScopeId: input.graphScopeId,
      changeId: "",
      text: input.snapshot.text || undefined,
      status: "running",
      runId: input.runId,
      providerId: input.providerId,
      sessionId: input.mainSessionId ?? mainLineage?.threadId,
      attemptId: input.attemptId,
      threadId: mainLineage?.threadId ?? input.mainSessionId ?? undefined,
      turnId: mainLineage?.turnId,
      activity: input.snapshot.activity,
      blocks: input.snapshot.blocks,
    };
    upsertCanonicalMessage(
      input.store,
      input.messageIds,
      toConversationStoredMessage(input.projectId, input.conversationId, mainEntry),
    );
    patches.push(canonicalTimelinePatchForEntry(mainEntry));
  } else {
    for (const main of input.snapshot.mainCaptures.values()) {
      const mainEntry: TopicThreadEntry = {
        id: `assistant:${input.conversationId}:${input.providerId}:${input.runId}:${main.canonicalId}`,
        type: "assistant.message",
        timestamp: main.blocks[0]?.timestamp ?? main.activity[0]?.timestamp ?? new Date().toISOString(),
        conversationId: input.conversationId,
        graphScopeId: input.graphScopeId,
        changeId: "",
        text: main.text || undefined,
        status: mainCaptureTimelineStatus(main),
        runId: input.runId,
        providerId: input.providerId,
        sessionId: main.threadId ?? input.mainSessionId ?? undefined,
        attemptId: input.attemptId,
        threadId: main.threadId ?? input.mainSessionId ?? undefined,
        turnId: main.turnId,
        activity: main.activity,
        blocks: main.blocks,
      };
      upsertCanonicalMessage(
        input.store,
        input.messageIds,
        toConversationStoredMessage(input.projectId, input.conversationId, mainEntry),
      );
      patches.push(canonicalTimelinePatchForEntry(mainEntry));
    }
  }

  for (const child of input.snapshot.childCaptures.values()) {
    const childEntry = projectScopedChildProcessMessage(
      input.conversationId,
      input.graphScopeId,
      input.runId,
      child.roleId,
      child.threadId,
      child.parentThreadId ?? input.mainSessionId ?? "",
      input.providerId,
      child,
    );
    if (!childEntry) continue;
    childEntry.providerId = input.providerId;
    childEntry.sessionId = child.threadId;
    childEntry.attemptId = child.roleId === PROJECT_PLANNING_AGENT_ROLE_ID
      ? providerChildAttemptId(input.attemptId, child.threadId)
      : input.attemptId;
    childEntry.status = childCaptureTimelineStatus(child);
    upsertCanonicalMessage(
      input.store,
      input.messageIds,
      toConversationStoredMessage(input.projectId, input.conversationId, childEntry),
    );
    patches.push(canonicalTimelinePatchForEntry(childEntry));
  }
  return patches;
}

function canonicalTimelinePatchForEntry(entry: TopicThreadEntry): CanonicalTimelinePatch {
  const child = Boolean(entry.agentRoleId && entry.agentRoleId !== "main-agent" && entry.threadId && entry.providerId);
  return {
    conversationId: entry.conversationId ?? "",
    graphScopeId: entry.graphScopeId,
    messageId: entry.id,
    agentSurfaceId: child ? agentThreadSurfaceId(entry.providerId!, entry.threadId!) : "main-agent",
    providerId: entry.providerId,
    roleId: child ? entry.agentRoleId : "main-agent",
    threadId: entry.threadId,
    parentThreadId: entry.parentThreadId,
    status: entry.status,
    cells: canonicalTranscriptCellsFromThreadItem({
      ...entry,
      kind: entry.type === "user.message" ? "user-message" : "assistant-turn",
      label: entry.text ?? entry.type,
      body: entry.text,
    }, child ? { forceAgentRoleId: entry.agentRoleId } : { parentVisible: true }),
  };
}

function childCaptureTimelineStatus(capture: ChildTranscriptCapture): string {
  const status = [...capture.activity].reverse().find((item) => item.kind === "status")?.label;
  return status === "completed" || status === "failed" || status === "blocked" ? status : "running";
}

function mainCaptureTimelineStatus(capture: MainTranscriptCapture): string {
  const status = [...capture.activity].reverse().find((item) => item.kind === "status")?.label;
  return status === "completed" || status === "failed" || status === "blocked" || status === "cancelled" ? status : "running";
}

function upsertCanonicalMessage(
  store: WorkbenchStore,
  messageIds: Set<string>,
  message: Omit<StoredTopicMessage, "position">,
): void {
  if (messageIds.has(message.id)) {
    store.updateMessage(message);
    return;
  }
  store.appendMessage(message);
  messageIds.add(message.id);
}

function stripProjectScopedPromptEcho(message: string, userMessage: string): string {
  const trimmed = message.trim();
  if (!trimmed) return "";
  const userMarker = `User message:\n${userMessage}`;
  const markerIndex = trimmed.indexOf(userMarker);
  if (markerIndex >= 0) {
    return trimmed.slice(markerIndex + userMarker.length).trim();
  }
  return trimmed
    .replace(/^You are the main Agent for this project\.[\s\S]*?User message:\s*/i, "")
    .trim();
}

function buildProjectConversationRunId(conversationId: string): string {
  return `chat-${conversationId}-${Date.now().toString(36)}`;
}

function createGraphScopeId(conversationId: string): string {
  return `graph:${conversationId}:${Date.now().toString(36)}:${randomUUID().slice(0, 8)}`;
}

async function currentConversationGraphScope(memory: ResolvedMemory, conversationId: string): Promise<string> {
  if (!memory.projectId) throw new Error("Project id is required to resolve graph scope.");
  const store = await WorkbenchStore.open(memory);
  try {
    const graphScopeId = store.readConversation(memory.projectId, conversationId)?.currentGraphScopeId;
    if (!graphScopeId) throw new Error("The current conversation has no Agent graph scope.");
    return graphScopeId;
  } finally {
    store.close();
  }
}

function initialMainAgentBlocks(blocks: AssistantTurnBlock[], runId: string, assistantText: string): AssistantTurnBlock[] {
  if (blocks.length > 0) return blocks;
  const text = assistantText.trim();
  if (!text) return blocks;
  return [{
    id: `${runId}:initial-main-agent`,
    runId,
    sequence: 1,
    kind: "prose",
    timestamp: new Date().toISOString(),
    source: "provider",
    text,
  }];
}

export async function listTopicMessages(project: ManagedProject, changeId: string): Promise<TopicThreadEntry[]> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  return readThreadLog(memory, changePath);
}

export async function readConversationThread(memory: ResolvedMemory, changePath: string): Promise<TopicThreadEntry[]> {
  return readThreadLog(memory, changePath);
}

async function findRunningRunForChange(project: ManagedProject, changeId: string): Promise<RunMetadata | null> {
  const memory = await resolveProjectMemory(project);
  const runs = await listRuns(memory).catch(() => []);
  return runs.find((run) => run.changeId === changeId && (run.status === "created" || run.status === "running")) ?? null;
}

export async function runWorkbenchWorkflowAction(project: ManagedProject, request: WorkbenchWorkflowActionRequest, live?: WorkbenchLiveSink): Promise<WorkbenchWorkflowActionResult> {
  if (request.actionType === "chat.ask") {
    if (!request.changeId) throw new Error("chat.ask requires a conversationId.");
    if (!request.prompt) throw new Error("chat.ask requires prompt.");
    const result = await postConversationMessage(project, request.changeId, request.prompt, live);
    return {
      actionRunId: `chat-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      actionType: request.actionType,
      status: "completed",
      result,
      runId: result.run?.id,
    };
  }
  return runWorkbenchWorkflowActionService(project, request, live, {
    resolveChangeId: resolveWorkflowActionChangeId,
    createTranscriptCapture: createAssistantTranscriptCapture,
    openTimelineWriter: openConversationTimelineWriter,
    readThreadEntries: readWorkflowActionThreadEntries,
    execute: executeWorkflowAction,
    labelForAction,
    extractRunId,
    failureMessage: workflowFailureMessage,
    summarizeResult: summarizeActionResult,
    artifactForResult: artifactForActionResult,
    targetId: workflowActionTargetId,
    scopePayload: workflowActionScopePayload,
    recordDecision: recordWorkbenchDecision,
    resumeGoalAfterAction: resumeNativeGoalAfterAction,
  });
}

function projectScopedChildProcessMessage(
  conversationId: string,
  graphScopeId: string,
  runId: string,
  roleId: string,
  childThreadId: string,
  parentThreadId: string,
  providerId: string,
  capture: ChildTranscriptCapture | undefined,
): TopicThreadEntry | null {
  if (!capture || (capture.blocks.length === 0 && capture.activity.length === 0)) return null;
  const timestamp = capture.blocks[0]?.timestamp ?? capture.activity[0]?.timestamp ?? new Date().toISOString();
  return {
    id: `assistant:${conversationId}:${providerId}:${runId}:${capture.canonicalId ?? `${roleId}:${childThreadId}:${capture.turnId ?? "turn"}`}:process`,
    type: "assistant.message",
    timestamp,
    conversationId,
    graphScopeId,
    changeId: "",
    runId,
    providerId,
    threadId: childThreadId,
    parentThreadId,
    turnId: capture.turnId,
    agentRoleId: roleId,
    activity: capture.activity,
    blocks: capture.blocks,
  };
}

async function createFinalizeRequest(
  memory: ResolvedMemory,
  input: { changeId: string; conversationId: string; providerThreadId: string; turnId: string },
) {
  const intentPath = join(memory.changesRoot, "active", input.changeId, "planning", "execution-authorization-intent.json");
  const intent = JSON.parse(await readFile(intentPath, "utf8")) as { status?: unknown; authorizationId?: unknown };
  if (intent.status !== "issued" || typeof intent.authorizationId !== "string") {
    throw new Error("Current Change has no issued local execution authorization.");
  }
  const authorization = await readExecutionAuthorization(memory, intent.authorizationId);
  const finalizeTarget = authorization.targets.find((target) => target.transition === "change.finalize" && target.targetId === input.changeId);
  if (authorization.status !== "active"
    || authorization.changeId !== input.changeId
    || authorization.conversationId !== input.conversationId
    || authorization.providerThreadId !== input.providerThreadId
    || !finalizeTarget) {
    throw new Error("FinalizeRequest is outside the current execution authorization scope.");
  }
  const id = `finalize-${createHash("sha256").update(`${authorization.id}:${authorization.epoch}:${input.turnId}`).digest("hex")}`;
  const artifact = join(memory.changesRoot, "active", input.changeId, "finalization", "requests", `${id}.json`);
  const request = {
    version: "1.0" as const,
    id,
    changeId: input.changeId,
    conversationId: input.conversationId,
    providerThreadId: input.providerThreadId,
    turnId: input.turnId,
    authorizationId: authorization.id,
    authorizationEpoch: authorization.epoch,
    manifestHash: finalizeTarget.manifestHash,
    goalIdentityHash: authorization.goalIdentityHash,
    status: "requested" as const,
    createdAt: new Date().toISOString(),
    artifact,
  };
  await writeJsonFile(artifact, request);
  return request;
}

function authorizationSnapshot(authorization: Awaited<ReturnType<typeof readExecutionAuthorization>>) {
  return {
    acceptedPlanHash: authorization.acceptedPlanHash,
    graphHash: authorization.graphHash,
    artifactManifestHash: authorization.artifactManifestHash,
    sourceHead: authorization.sourceHead,
    sourceStateHash: authorization.sourceStateHash,
    permissionProfileHash: authorization.permissionProfileHash,
    providerScopeHash: authorization.providerScopeHash,
    policyHash: authorization.policyHash,
  };
}

async function issueAcceptedPlanningAuthorization(
  project: ManagedProject,
  memory: ResolvedMemory,
  conversationId: string,
  result: ProviderTurnResult,
  accepted: Awaited<ReturnType<typeof acceptCurrentConversationPlanningPackage>>,
  handoff: ValidatedPlanHandoffIntent | null | undefined,
): Promise<LocalExecutionAuthorization | null> {
  if (!result.session || !result.objective || handoff?.kind !== "execute-plan") {
    throw new Error("Accepted planning authorization requires the current Main thread, native Goal, and execute intent.");
  }
  const sourceHead = await getGitCommit(project.path);
  const intentPath = join(memory.memoryRoot, accepted.authorizationIntentArtifact);
  if (!sourceHead) {
    await writeJsonFile(intentPath, {
      version: "1.0",
      status: "blocked",
      changeId: accepted.changeId,
      conversationId,
      proposalId: accepted.proposalId,
      proposalHash: accepted.proposalHash,
      graphId: accepted.workflowGraphPlan.id,
      authorizationId: null,
      reason: "Execution authorization requires a Git source commit.",
      updatedAt: new Date().toISOString(),
    });
    return null;
  }
  const sourceStatus = await getGitStatusShort(project.path);
  const graphHash = hashJson(accepted.workflowGraphPlan);
  const artifactManifestHash = hashJson(accepted.workflowGraphPlan.sourceArtifactHashes);
  const targets = accepted.workflowGraphPlan.nodes.map((node) => ({
    transition: "workflow.node.execute",
    targetId: node.id,
    manifestHash: hashJson({ graphHash, node }),
  }));
  targets.push({
    transition: "change.finalize",
    targetId: accepted.changeId,
    manifestHash: hashJson({ graphHash, changeId: accepted.changeId, kind: "finalize" }),
  });
  const now = new Date();
  const authorization = await issueLocalExecutionAuthorization(memory, {
    projectId: memory.projectId,
    changeId: accepted.changeId,
    conversationId,
    providerThreadId: result.session.sessionId,
    goalIdentityHash: hashJson({ objective: result.objective.objective, createdAt: result.objective.createdAt }),
    mode: handoff.executionMode ?? "scoped-auto",
    acceptedPlanId: accepted.proposalId,
    acceptedPlanHash: accepted.proposalHash,
    graphId: accepted.workflowGraphPlan.id,
    graphHash,
    artifactManifestHash,
    sourceHead,
    sourceStateHash: hashJson(sourceStatus),
    providerScopeHash: hashJson({ projectId: project.id, conversationId, providerId: result.providerId, sessionId: result.session.sessionId }),
    permissionProfileHash: hashJson({ approvalPolicy: "never", sandbox: "runtime-owned-scoped-write", network: false }),
    policyHash: hashJson("local-execution-authorization-policy-v1"),
    targets,
    budget: {
      maxCompletedOperations: Math.max(16, accepted.workflowGraphPlan.nodes.length * 8 + 8),
      maxReworks: 1,
      maxChangedFiles: 100,
      maxChangedBytes: 10 * 1024 * 1024,
    },
    userDecision: {
      decisionId: `execute-plan:${handoff.sourceRunId}`,
      actorId: "workbench-user",
      decidedAt: now.toISOString(),
    },
    issuedAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  });
  await writeJsonFile(intentPath, {
    version: "1.0",
    status: "issued",
    changeId: accepted.changeId,
    conversationId,
    proposalId: accepted.proposalId,
    proposalHash: accepted.proposalHash,
    graphId: accepted.workflowGraphPlan.id,
    authorizationId: authorization.id,
    reason: null,
    updatedAt: new Date().toISOString(),
  });
  return authorization;
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export async function resumeNativeGoalAfterAction(input: {
  project: ManagedProject;
  changeId: string;
  actionRunId: string;
  actionType: WorkbenchWorkflowActionRequest["actionType"] | "result.apply";
  status: "completed" | "failed";
  result: unknown;
}): Promise<void> {
  const { memory, changePath } = await resolveTopic(input.project, input.changeId);
  const conversationId = await resolveConversationId(input.project, input.changeId);
  if (!memory.projectId) return;
  const store = await WorkbenchStore.open(memory);
  try {
    const conversation = store.readConversation(memory.projectId, conversationId);
    const link = conversation ? store.readProviderThread(memory.projectId, conversationId, conversation.selectedProviderId, "main-agent") : null;
    if (link?.capabilityProfile !== "main-agent-goal-v1") return;
  } finally {
    store.close();
  }

  const entries = await readThreadLog(memory, changePath);
  const actionStartedIndex = entries.findIndex((entry) => entry.actionRunId === input.actionRunId && entry.type === "workflow.started");
  if (actionStartedIndex >= 0 && entries.slice(actionStartedIndex + 1).some((entry) => entry.actionType === "conversation.interrupt" && entry.type === "workflow.started")) return;

  const context = await buildMainAgentExecutionContext(
    input.project,
    memory,
    input.changeId,
    `Workflow action ${input.actionType} ${input.status}.`,
  );
  const evidenceHash = createHash("sha256").update(stableJson(input.result)).digest("hex");
  await runProjectScopedMainAgentTurn(
    input.project,
    conversationId,
    `Continue the current native Goal after ${input.actionType} ${input.status}.`,
    undefined,
    undefined,
    {
      goalResume: {
        deliveryKey: `${input.actionRunId}:${evidenceHash}`,
        contextText: [
          context,
          "",
          "Canonical action evidence:",
          JSON.stringify({
            actionRunId: input.actionRunId,
            actionType: input.actionType,
            status: input.status,
            evidenceHash,
            result: input.result,
          }, null, 2),
          "",
          "Read this evidence and autonomously decide whether to continue the accepted workflow, request a Plan revision, wait for user confirmation, or complete the current Goal.",
        ].join("\n"),
      },
    },
  );
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function readWorkflowActionThreadEntries(project: ManagedProject, changeId: string): Promise<TopicThreadEntry[]> {
  const { memory, changePath } = await resolveTopic(project, changeId);
  return readThreadLog(memory, changePath);
}

async function resolveWorkflowActionChangeId(project: ManagedProject, request: WorkbenchWorkflowActionRequest): Promise<string> {
  if (request.changeId) return request.changeId;
  if (PROJECT_SCOPED_WORKFLOW_ACTIONS.has(request.actionType)) return getSingleActiveChangeId(project);
  throw new Error(`${request.actionType} requires changeId.`);
}

export async function getWorkbenchActionEvents(project: ManagedProject, actionRunId: string): Promise<TopicThreadEntry[]> {
  const memory = await resolveProjectMemory(project);
  if (!existsSync(join(memory.changesRoot, "active"))) return [];
  const entries = await collectAllConversationThreadEntries(memory);
  return entries.filter((entry) => entry.actionRunId === actionRunId);
}

async function executeWorkflowAction(project: ManagedProject, changeId: string, request: WorkbenchWorkflowActionRequest, live?: WorkbenchLiveSink): Promise<unknown> {
  assertWorkflowActionScope(request);
  const conversationId = await resolveConversationId(project, changeId);
  await auditHighImpactWorkflowAction(project, conversationId, changeId, request, live);
  return dispatchWorkbenchWorkflowAction(workflowActionHandlers, project, changeId, request, live);
}

const workflowActionHandlers = buildWorkbenchActionHandlers({
  postConversationMessage,
  findRunningRunForChange,
  continueTopicGoal: async (project, changeId, prompt, live) => {
    const conversationId = await resolveConversationId(project, changeId);
    const continuation = prompt?.trim() || "Continue the current accepted objective from the latest project evidence.";
    const actionRunId = [...await readWorkflowActionThreadEntries(project, changeId)]
      .reverse()
      .find((entry) => entry.type === "workflow.started" && entry.actionType === "conversation.continue" && entry.status === "running")
      ?.actionRunId;
    if (!actionRunId) throw new Error("Explicit Goal continuation requires the current Workbench action identity.");
    return runProjectScopedMainAgentTurn(project, conversationId, continuation, live, undefined, {
      goalResume: {
        deliveryKey: `conversation-continue:${actionRunId}`,
        contextText: `The user explicitly requested continuation of the current native Goal.\n\n${continuation}`,
      },
    });
  },
});

function toConversationStoredMessage(
  projectId: string,
  conversationId: string,
  entry: TopicThreadEntry,
  completedTurnSequence = entry.completedTurnSequence,
): Omit<StoredTopicMessage, "position"> {
  return {
    id: entry.id,
    projectId,
    conversationId,
    changeId: entry.changeId,
    type: entry.type,
    timestamp: entry.timestamp,
    text: entry.text ?? null,
    actionRunId: entry.actionRunId ?? null,
    actionType: entry.actionType ?? null,
    status: entry.status ?? null,
    runId: entry.runId ?? null,
    providerId: entry.providerId ?? null,
    threadId: entry.threadId ?? null,
    turnId: entry.turnId ?? null,
    itemId: entry.itemId ?? null,
    artifact: entry.artifact ?? null,
    error: entry.error ?? null,
    rawJson: JSON.stringify({ ...entry, ...(completedTurnSequence === undefined ? {} : { completedTurnSequence }) }),
  };
}

async function normalizeTopicMessageInput(project: ManagedProject, input: string | TopicMessageInput): Promise<Required<Pick<TopicMessageInput, "mode" | "message">> & { contextRefs?: TopicMessageInput["contextRefs"]; attachments?: TopicAttachment[]; planHandoffIntent?: TopicMessageInput["planHandoffIntent"]; providerId?: string; providerSwitchIntent: "resume-workflow" | "conversation-only" }> {
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

async function persistProviderUserInputRequest(
  memory: ResolvedMemory,
  request: import("./types.js").WorkbenchProviderUserInputRequest,
): Promise<TopicThreadEntry> {
  if (!memory.projectId || !request.conversationId) throw new Error("Provider user input requires a project conversation.");
  const entry: TopicThreadEntry = {
    id: `provider-user-input:${request.requestKey}`,
    type: "assistant.message",
    timestamp: new Date().toISOString(),
    conversationId: request.conversationId,
    graphScopeId: request.graphScopeId,
    changeId: request.changeId ?? "",
    runId: request.runId,
    providerId: request.providerId,
    attemptId: request.attemptId,
    sessionId: request.threadId,
    threadId: request.threadId,
    turnId: request.turnId,
    agentRoleId: request.agentRoleId,
    status: request.status,
    providerUserInput: request,
  };
  const store = await WorkbenchStore.open(memory);
  try {
    store.appendMessage(toConversationStoredMessage(memory.projectId, request.conversationId, entry));
  } finally {
    store.close();
  }
  return entry;
}

function providerUserInputRequestKey(
  runId: string,
  request: Pick<import("../provider-runtime/index.js").ProviderUserInputRequest, "requestId" | "threadId" | "turnId" | "itemId">,
): string {
  return [runId, request.threadId ?? "main", request.turnId ?? "turn", request.itemId ?? "item", request.requestId]
    .map((part) => encodeURIComponent(part))
    .join(":");
}
