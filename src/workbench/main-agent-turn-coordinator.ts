import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { auditHarness } from "../harness/audit.js";
import { readAgentCatalog } from "../agent/catalog.js";
import { defaultProviderRegistry, type ProviderTurnResult } from "../provider-runtime/index.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { agentThreadSurfaceId } from "../provider-runtime/agent-surface-id.js";
import { assertWritableMemory } from "../memory/resolver.js";
import { ensureProjectRuntime } from "../harness/init.js";
import { writeJsonFile } from "../fs/json.js";
import { getGitCommit, getGitStatusShort } from "../project/git.js";
import { readProjectMarker } from "../project/marker.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import { assertChangeFinalizationReady, closeChangeForFinalization } from "../change/manager.js";
import { getSystemSkillsRoot } from "../template-source/paths.js";
import { runSchedulerReadySetInitialization } from "../workflow-runtime/scheduler.js";
import {
  claimTransitionExecution,
  issueLocalExecutionAuthorization,
  markTransitionExecutionStarted,
  readExecutionAuthorization,
} from "../workflow-runtime/execution-authorization.js";
import type { LocalExecutionAuthorization, ManagedProject, ResolvedMemory } from "../types/index.js";
import { buildMainAgentExecutionContext } from "./main-agent-context.js";
import { childTranscriptCapturesForThread, createAssistantTranscriptCapture } from "./live-transcript.js";
import { forwardProviderRealtimeEvent } from "./provider-live-events.js";
import { resolveTopic } from "./topic-resolver.js";
import { openWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import { publishAgentSurfacesInvalidated } from "./project-live-events.js";
import type { WorkbenchDatabase } from "./persistence/database.js";
import { type StoredTopicMessage } from "./persistence/contracts.js";
import type { CanonicalTimelineEnvelope } from "./canonical-timeline-contract.js";
import { CanonicalTimelineDelivery, publishCanonicalTimelineEnvelope, publishCommittedCanonicalTimelineRow } from "./canonical-timeline-delivery.js";
import { toCanonicalTimelineMessage } from "./canonical-timeline-message.js";
import {
  buildCanonicalCaptureWrites as buildCaptureWrites,
  childCaptureTimelineStatus as captureChildStatus,
  childProcessMessage as buildChildProcessMessage,
} from "./provider-capture-persistence.js";
import { ProviderChildLifecycleOwner } from "./provider-child-lifecycle-owner.js";
import { listClosableChildAgents, runExactChildAgentClose } from "./provider-child-turn-coordinator.js";
import { persistProviderUserInputRequest, providerUserInputRequestKey } from "./provider-input-lifecycle.js";
import { runWorkbenchWorkflowAction as runWorkflowConversationAction } from "./workflow-conversation-bridge.js";
import { assembleSharedConversationContext } from "./shared-conversation-context.js";
import { buildConversationInteractionQueue } from "./conversation-interactions.js";
import { acceptCurrentConversationPlanningPackage, readPlannerChildProposal } from "./planning/planner-child-proposal.js";
import { finalizePlanningChild, PLANNING_AGENT_ROLE_ID } from "./planning-child-lifecycle.js";
import { runProjectHarnessOnboardingTurn } from "./project-harness-onboarding-turn.js";
import type {
  AssistantTurnBlock,
  ValidatedPlanHandoffIntent,
  TopicThreadEntry,
  WorkbenchLiveSink,
} from "./types.js";
export function buildProjectScopedMainAgentPrompt(userMessage: string): string {
  return userMessage;
}

export async function runProjectScopedMainAgentTurn(
  project: ManagedProject,
  conversationId: string,
  userMessage: string,
  live?: WorkbenchLiveSink,
  planHandoff?: ValidatedPlanHandoffIntent,
  options: { goalResume?: { deliveryKey: string; contextText: string }; graphScopeId?: string } = {},
): Promise<TopicThreadEntry> {
  if (!await readProjectMarker(project.path)) {
    const runtimeState = await resolveProjectRuntimeState(project, {
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
    });
    if (runtimeState.state === "onboarding") {
      return runProjectHarnessOnboardingTurn(project, runtimeState, conversationId, userMessage, live);
    }
    if (runtimeState.state === "repair-required") {
      throw new Error("Project Harness requires repair before planning or source execution.");
    }
    throw new Error("Skill-native project runtime consumers are not fully migrated yet; refusing to create legacy Harness state.");
  }
  const memory = await ensureProjectRuntime(project);
  assertWritableMemory(memory, "Project-scoped chat");
  if (!memory.projectId) throw new Error("Project id is required to run project-scoped chat.");
  const agentCatalog = await readAgentCatalog(memory);
  const graphScopeId = options.graphScopeId ?? await currentConversationGraphScope(memory, conversationId);
  const runId = buildProjectConversationRunId(conversationId);
  const directory = join(memory.workbenchRoot, "conversations", conversationId, "runs", runId);
  let mainTimelineId = `assistant:${conversationId}:pending:${runId}:main`;
  let canonicalStore: WorkbenchDatabase | null = null;
  let canonicalDelivery: CanonicalTimelineDelivery | null = null;
  let canonicalPersistenceError: Error | null = null;
  let providerId = "";
  let attemptId = "";
  let mainSessionId: string | null = null;
  let completedTurnSequence = 0;
  let boundChangeId: string | null = null;
  let expectedResumeAttemptId: string | null = null;
  const persistedProviderInputRequests = new Map<string, Promise<CanonicalTimelineEnvelope>>();
  const providerInputRequestKeys = new Map<string, string>();
  const pendingProviderInputResolutions = new Set<Promise<void>>();
  const flushProviderInputLifecycle = async (): Promise<void> => {
    await Promise.allSettled([
      ...persistedProviderInputRequests.values(),
      ...pendingProviderInputResolutions,
    ]);
  };
  const terminalCommittedRows: StoredTopicMessage[] = [];
  const publishTerminalRows = (): number => {
    const count = terminalCommittedRows.length;
    for (const row of terminalCommittedRows.splice(0)) {
      publishCommittedCanonicalTimelineRow(live, row);
    }
    return count;
  };
  await mkdir(directory, { recursive: true });
  const capture = createAssistantTranscriptCapture(live, (snapshot) => {
    if (!canonicalDelivery) return true;
    try {
      const writes = buildCaptureWrites({
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
      for (const write of writes) canonicalDelivery.upsert(write);
      return true;
    } catch (error) {
      canonicalPersistenceError = error instanceof Error ? error : new Error(String(error));
      return false;
    }
  });
  const emitInteractionUpdate = async (sink: WorkbenchLiveSink | undefined = capture.sink): Promise<void> => {
    sink?.emit({ event: "conversation.interactions.updated", data: await buildConversationInteractionQueue(memory, conversationId, graphScopeId) });
    publishAgentSurfacesInvalidated(memory.projectId!, { conversationId, graphScopeId, reason: "interaction-updated" });
  };
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
  let planDocumentCreated = false;
  let acceptedPlanning: Awaited<ReturnType<typeof acceptCurrentConversationPlanningPackage>> | null = null;
  const sessionStore = await openWorkbenchDatabase(memory);
  try {
    const conversation = sessionStore.conversations.readConversation(memory.projectId, conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}.`);
    providerId = conversation.selectedProviderId;
    completedTurnSequence = conversation.completedTurnSequence;
    boundChangeId = conversation?.boundChangeId ?? null;
    const binding = sessionStore.providerAttempts.readConversationProviderBinding(memory.projectId, conversationId, providerId);
    mainSessionId = binding?.nativeSessionId ?? null;
    const resumePoint = sessionStore.providerAttempts.readLatestProviderResumePoint(memory.projectId, conversationId);
    expectedResumeAttemptId = resumePoint
      && resumePoint.targetProviderId === providerId
      && resumePoint.graphScopeId === graphScopeId
      && resumePoint.changeId === boundChangeId
      ? `attempt-${resumePoint.resumePointId}`
      : null;
  } finally {
    sessionStore.close();
  }
  const closableChildAgents = mainSessionId
    ? await listClosableChildAgents({ project, conversationId, graphScopeId, parentThreadId: mainSessionId })
    : [];
  if (closableChildAgents.length > 0) {
    additionalContext["aho.agent-control"] = {
      kind: "application",
      value: JSON.stringify({
        closeTool: "aho_close_agent",
        agents: closableChildAgents,
        rule: "Only call aho_close_agent when the user explicitly asks to close one listed Agent. Do not substitute interrupt_agent.",
      }),
    };
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
  const attemptStore = await openWorkbenchDatabase(memory);
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
      attemptStore.providerAttempts.completeProviderAttempt(memory.projectId, stale.attemptId, "interrupted", stale.nativeSessionId, attemptStartedAt);
    }
    if (queuedResumeAttempt) {
      attemptStore.providerAttempts.startQueuedProviderAttempt(memory.projectId, attemptId, {
        capabilitySnapshot,
        handoffHash: handoff.hash,
        deliveredThroughCompletedTurn: completedTurnSequence,
        model: attemptRecord.model,
        updatedAt: attemptStartedAt,
      });
    } else {
      attemptStore.providerAttempts.createProviderAttempt(attemptRecord);
    }
  } finally {
    attemptStore.close();
  }
  publishAgentSurfacesInvalidated(memory.projectId, { conversationId, graphScopeId, reason: "attempt-updated" });
  canonicalStore = await openWorkbenchDatabase(memory);
  canonicalDelivery = new CanonicalTimelineDelivery(canonicalStore, live);
  if (mainSessionId) {
    canonicalStore.providerAttempts.bindProviderAttemptThread(memory.projectId, {
      attemptId,
      threadId: mainSessionId,
      parentThreadId: null,
      parentAgentSurfaceId: null,
    }, attemptStartedAt);
    publishAgentSurfacesInvalidated(memory.projectId, { conversationId, graphScopeId, reason: "thread-bound" });
  }
  let liveMainThreadId: string | null = mainSessionId;
  const childLifecycleOwner = new ProviderChildLifecycleOwner({
    database: canonicalStore,
    delivery: canonicalDelivery,
    catalog: agentCatalog,
    projectId: memory.projectId,
    conversationId,
    graphScopeId,
    changeId: boundChangeId,
    runId,
    parentAttemptId: attemptId,
    providerId,
    capabilitySnapshot,
    model: capabilitySnapshot.effectiveModel ? { providerId, modelId: capabilitySnapshot.effectiveModel } : null,
    parentHandoffHash: handoff.hash,
    deliveredThroughCompletedTurn: completedTurnSequence,
    onInvalidated: () => publishAgentSurfacesInvalidated(memory.projectId!, { conversationId, graphScopeId, reason: "attempt-updated" }),
  });
  const commitFailedProviderTurn = (database: WorkbenchDatabase, nativeSessionId: string | null): void => {
    const failedAt = new Date().toISOString();
    const timelineMessages = buildCaptureWrites({
      projectId: memory.projectId!,
      conversationId,
      graphScopeId,
      runId,
      providerId,
      attemptId,
      mainTimelineId,
      mainSessionId: nativeSessionId ?? mainSessionId,
      snapshot: capture,
    }).map((message) => {
      const terminalStatus = message.agentSurfaceId === "main-agent" || message.status === "running" ? "failed" : message.status;
      if (terminalStatus === message.status) return message;
      let raw: Record<string, unknown> = {};
      try { raw = JSON.parse(message.rawJson) as Record<string, unknown>; } catch { /* Keep diagnostic content bounded. */ }
      return { ...message, status: terminalStatus, rawJson: JSON.stringify({ ...raw, status: terminalStatus }) };
    });
    const terminal = database.unitOfWork.commitProviderTurnTerminal({
      projectId: memory.projectId!,
      conversationId,
      runId,
      mainAttemptId: attemptId,
      mainStatus: "failed",
      mainNativeSessionId: nativeSessionId,
      childAttempts: childLifecycleOwner.terminalAttempts("failed"),
      expectedCompletedTurnSequence: completedTurnSequence,
      advanceCompletedTurn: false,
      binding: {
        projectId: memory.projectId!,
        conversationId,
        providerId,
        nativeSessionId: nativeSessionId ?? mainSessionId,
        preferredModel: capabilitySnapshot.effectiveModel ? { providerId, modelId: capabilitySnapshot.effectiveModel } : null,
        lastUsedAt: failedAt,
        bindingStatus: "stale",
      },
      updatedAt: failedAt,
      timelineMessages,
    });
    publishAgentSurfacesInvalidated(memory.projectId!, { conversationId, graphScopeId, reason: "attempt-updated" });
    terminalCommittedRows.push(...terminal.timelineRows);
    terminalCommittedRows.push(...terminal.interactionRows);
  };
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
      {
        name: "aho_close_agent",
        description: "Permanently close one currently registered Agent after the user explicitly requests it. Use the exact Agent Surface id supplied by AHO for the current turn; never substitute interrupt_agent.",
        inputSchema: {
          type: "object",
          properties: {
            agentSurfaceId: { type: "string" },
          },
          required: ["agentSurfaceId"],
          additionalProperties: false,
        },
      },
    ],
    onToolCall: async (call) => {
      if (call.tool === "aho_close_agent") {
        const keys = Object.keys(call.arguments);
        const targetSurfaceId = call.arguments.agentSurfaceId;
        if (keys.length !== 1
          || typeof targetSurfaceId !== "string"
          || !closableChildAgents.some((agent) => agent.agentSurfaceId === targetSurfaceId)) {
          return { contentItems: [{ type: "inputText", text: "The selected Agent is not an exact current registered Agent target." }], success: false };
        }
        const closed = await runExactChildAgentClose({
          project,
          conversationId,
          graphScopeId,
          parentThreadId: call.threadId,
          agentSurfaceId: targetSurfaceId,
          onLifecycleEvent: (event) => { childLifecycleOwner.onLifecycle(event); },
        });
        return {
          contentItems: [{
            type: "inputText",
            text: `Closed ${closed.displayName ?? closed.roleId} through the Provider-native Child close path. The historical Agent workspace is now read-only.`,
          }],
          success: true,
        };
      }
      if (Object.keys(call.arguments).length > 0) {
        return { contentItems: [{ type: "inputText", text: "AHO conversation tools do not accept caller-selected targets." }], success: false };
      }
      if (call.tool === "aho_accept_current_plan" && planHandoff?.kind === "execute-plan") {
        const acceptedProposal = await readPlannerChildProposal(planHandoff.sourceArtifact);
        const accepted = await acceptCurrentConversationPlanningPackage(project, conversationId, planHandoff.sourceArtifact);
        canonicalDelivery?.publishCommittedMany(accepted.timelineRows);
        acceptedPlanning = accepted;
        boundChangeId = accepted.changeId;
        const acceptedStore = await openWorkbenchDatabase(memory);
        try {
          const row = acceptedStore.interactions.updatePlanningMessageStatus(memory.projectId!, conversationId, planHandoff.sourceArtifact, "accepted");
          new CanonicalTimelineDelivery(acceptedStore, capture.sink).publishCommitted(row);
        } finally {
          acceptedStore.close();
        }
        acceptedPlanMarker = {
          ...projectScopedPlanningStatusMessage(conversationId, graphScopeId, runId, `Accepted proposal ${accepted.proposalId}.`, acceptedProposal.childThreadId, providerId!),
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
      if (event.roleId === "main-agent" && !event.parentThreadId && event.threadId && liveMainThreadId !== event.threadId) {
        canonicalStore!.providerAttempts.bindProviderAttemptThread(memory.projectId!, {
          attemptId,
          threadId: event.threadId,
          parentThreadId: null,
          parentAgentSurfaceId: null,
          displayName: event.displayName,
        }, new Date().toISOString());
        liveMainThreadId = event.threadId;
        publishAgentSurfacesInvalidated(memory.projectId!, { conversationId, graphScopeId, reason: "thread-bound" });
      }
      const registeredChild = event.parentThreadId
        ? childLifecycleOwner.registeredForThread(event.threadId)
        : null;
      const canonicalEvent = registeredChild
        ? { ...event, roleId: registeredChild.roleId, attemptId: registeredChild.attemptId }
        : event;
      forwardProviderRealtimeEvent(canonicalEvent, capture.sink, { graphScopeId });
    },
    onChildLifecycleEvent: (event) => {
      const child = childLifecycleOwner.onLifecycle(event);
      if (!child) return;
      capture.updateTargetAgent(
        agentThreadSurfaceId(providerId!, child.threadId),
        child.roleId,
        child.displayName,
        child.status,
      );
    },
    onChildThreadResult: (child) => {
      const registered = childLifecycleOwner.onResult(child);
      if (!registered) return;
      capture.updateTargetAgent(
        agentThreadSurfaceId(providerId!, registered.threadId),
        registered.roleId,
        child.displayName ?? registered.displayName,
        registered.status,
      );
    },
    onUserInputRequest: (request) => {
      const requestKey = providerUserInputRequestKey(runId, request);
      providerInputRequestKeys.set(request.requestId, requestKey);
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
        ...(request.expiresAt ? { expiresAt: request.expiresAt } : {}),
        status: "pending" as const,
      };
      const persistence = persistProviderUserInputRequest(memory, record, (envelope) => publishCanonicalTimelineEnvelope(live, envelope));
      persistedProviderInputRequests.set(request.requestId, persistence);
      void persistence
        .then(async () => {
          await emitInteractionUpdate();
        })
        .catch((cause) => {
          capture.sink.emit({ event: "error", data: { runId, graphScopeId, message: cause instanceof Error ? cause.message : String(cause) } });
        });
    },
    onUserInputResolved: (resolution) => {
      const persistence = persistedProviderInputRequests.get(resolution.requestId);
      const resolutionWork = (async () => {
        if (persistence) await persistence;
        const requestKey = providerInputRequestKeys.get(resolution.requestId);
        if (!requestKey) return;
        const resolutionStore = await openWorkbenchDatabase(memory);
        let row: StoredTopicMessage | null = null;
        try {
          const current = resolutionStore.interactions.readProviderUserInputRequest(memory.projectId!, conversationId, requestKey);
          if (!current || current.status !== "pending") return;
          const transition = resolutionStore.interactions.transitionProviderUserInputRequest(
            memory.projectId!,
            conversationId,
            requestKey,
            "pending",
            "submitted",
            {
              skippedQuestionIds: current.questions.map((question) => question.id),
              disposition: "skipped",
            },
            new Date().toISOString(),
          );
          row = transition.row;
        } finally {
          resolutionStore.close();
        }
        if (row) publishCommittedCanonicalTimelineRow(capture.sink, row);
        await emitInteractionUpdate();
      })().catch((cause) => {
        capture.sink.emit({ event: "error", data: { runId, graphScopeId, message: cause instanceof Error ? cause.message : String(cause) } });
      });
      pendingProviderInputResolutions.add(resolutionWork);
      void resolutionWork.finally(() => pendingProviderInputResolutions.delete(resolutionWork));
    },
    onError: (error) => capture.sink.emit({ event: "error", data: { runId, message: error instanceof Error ? error.message : String(error) } }),
    model: capabilitySnapshot.effectiveModel ? { providerId: providerId!, modelId: capabilitySnapshot.effectiveModel } : null,
    });
  } catch (error) {
    canonicalStore?.close();
    canonicalStore = null;
    canonicalDelivery = null;
    await flushProviderInputLifecycle();
    const failedAttemptStore = await openWorkbenchDatabase(memory);
    try {
      commitFailedProviderTurn(failedAttemptStore, null);
    } finally {
      failedAttemptStore.close();
    }
    if (publishTerminalRows() > 0) {
      await emitInteractionUpdate();
    }
    throw error;
  }
  if (canonicalPersistenceError) {
    canonicalStore.close();
    canonicalStore = null;
    canonicalDelivery = null;
    await flushProviderInputLifecycle();
    const failedAttemptStore = await openWorkbenchDatabase(memory);
    try {
      commitFailedProviderTurn(failedAttemptStore, result.session?.sessionId ?? null);
    } finally {
      failedAttemptStore.close();
    }
    if (publishTerminalRows() > 0) {
      await emitInteractionUpdate();
    }
    throw canonicalPersistenceError;
  }
  const plannerChildren = result.childThreads.filter((child) =>
    childLifecycleOwner.registeredForThread(child.threadId)?.roleId === PLANNING_AGENT_ROLE_ID);
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
  const assistantText = capture.text.trim();
  const latestMainCapture = [...capture.mainCaptures.values()].at(-1);
  if (latestMainCapture) {
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
  await writeFile(join(directory, "last-message.md"), rawParentText.trim(), "utf8");
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
    blocks: capture.blocks,
  } : null;
  let latestChildMessage: TopicThreadEntry | null = null;
  let planReferenceMarker: TopicThreadEntry | null = null;
  if (!canonicalStore) throw new Error("Canonical conversation store closed before turn completion.");
  const store = canonicalStore;
  try {
    if (result.session) store.providerAttempts.bindProviderAttemptThread(memory.projectId, {
      attemptId,
      threadId: result.session.sessionId,
      parentThreadId: null,
      parentAgentSurfaceId: null,
    }, new Date().toISOString());
    if (result.session) publishAgentSurfacesInvalidated(memory.projectId, { conversationId, graphScopeId, reason: "thread-bound" });
    for (const child of result.childThreads) {
      const registeredChild = childLifecycleOwner.onResult(child);
      if (!registeredChild) continue;
      const childRoleId = registeredChild.roleId;
      const isPlannerChild = childRoleId === PLANNING_AGENT_ROLE_ID;
      capture.updateTargetAgent(
        agentThreadSurfaceId(providerId, child.threadId),
        childRoleId,
        child.displayName,
        child.status === "failed" ? "failed" : "completed",
      );
      const terminalChildCaptures = childTranscriptCapturesForThread(capture.childCaptures, child.threadId);
      for (const childCapture of terminalChildCaptures) {
        childCapture.roleId = childRoleId;
        childCapture.displayName = child.displayName ?? childCapture.displayName;
      }
      for (const childCapture of terminalChildCaptures) {
        const childProcessMessage = buildChildProcessMessage({
          conversationId,
          graphScopeId,
          runId,
          roleId: childRoleId,
          childThreadId: child.threadId,
          parentThreadId: child.parentThreadId,
          providerId: providerId!,
          capture: childCapture,
        });
        if (childProcessMessage) {
          childProcessMessage.providerId = providerId;
          childProcessMessage.sessionId = child.threadId;
          childProcessMessage.attemptId = registeredChild.attemptId;
          childProcessMessage.agentSurfaceId = agentThreadSurfaceId(providerId!, child.threadId);
          childProcessMessage.status = captureChildStatus(childCapture);
          latestChildMessage = childProcessMessage;
        }
      }
      if (!isPlannerChild) continue;
      try {
        const planning = await finalizePlanningChild({
          directory,
          projectId: memory.projectId,
          conversationId,
          runId,
          providerId: providerId!,
          mainAttemptId: attemptId,
          childAttemptId: registeredChild.attemptId,
          parentTurnId: assistant?.turnId ?? result.turnId ?? undefined,
          referenceSequence: (assistant?.blocks?.at(-1)?.sequence ?? 0) + 1,
          child,
          captures: terminalChildCaptures,
        });
        planDocumentCreated = true;
        const planReferenceBlock = planning.referenceBlock;
        const latestMainCapture = [...capture.mainCaptures.values()].at(-1);
        if (latestMainCapture) {
          latestMainCapture.blocks.push(planReferenceBlock);
        } else if (assistant) {
          assistant.blocks = [...(assistant.blocks ?? []), planReferenceBlock];
          assistant.threadId ??= result.session?.sessionId;
          assistant.turnId ??= result.turnId ?? undefined;
        } else {
          planReferenceMarker = {
            id: `assistant:${conversationId}:${providerId}:${runId}:document-reference:${planning.documentId}`,
            type: "assistant.message",
            timestamp: planReferenceBlock.timestamp,
            conversationId,
            graphScopeId,
            changeId: "",
            runId,
            providerId,
            threadId: result.session?.sessionId,
            turnId: result.turnId ?? undefined,
            blocks: [planReferenceBlock],
          };
        }
      } catch (cause) {
        capture.sink.emit({ event: "error", data: { runId, message: cause instanceof Error ? cause.message : String(cause) } });
      }
    }
    const terminalTimelineMessages = buildCaptureWrites({
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
    if (acceptedPlanMarker) terminalTimelineMessages.push(toCanonicalTimelineMessage(memory.projectId, conversationId, acceptedPlanMarker, completedTurnSequence + 1));
    if (planReferenceMarker) terminalTimelineMessages.push(toCanonicalTimelineMessage(memory.projectId, conversationId, planReferenceMarker, completedTurnSequence + 1));
    if (assistant && capture.mainCaptures.size === 0) {
      terminalTimelineMessages.push(toCanonicalTimelineMessage(memory.projectId, conversationId, assistant, completedTurnSequence + 1));
    }
    await flushProviderInputLifecycle();
    const terminalAt = new Date().toISOString();
    const uniqueTerminalMessages = [...new Map(terminalTimelineMessages.map((message) => [message.id, message])).values()];
    const terminalCommit = store.unitOfWork.commitProviderTurnTerminal({
      projectId: memory.projectId,
      conversationId,
      runId,
      mainAttemptId: attemptId,
      mainStatus: result.status,
      mainNativeSessionId: result.session?.sessionId ?? null,
      childAttempts: childLifecycleOwner.terminalAttempts(result.status === "interrupted" ? "interrupted" : "failed"),
      expectedCompletedTurnSequence: completedTurnSequence,
      advanceCompletedTurn: result.status === "completed",
      binding: {
        projectId: memory.projectId,
        conversationId,
        providerId,
        nativeSessionId: result.session?.sessionId ?? mainSessionId,
        preferredModel: capabilitySnapshot.effectiveModel ? { providerId, modelId: capabilitySnapshot.effectiveModel } : null,
        lastUsedAt: terminalAt,
        bindingStatus: result.status === "failed" ? "stale" : "ready",
      },
      updatedAt: terminalAt,
      timelineMessages: uniqueTerminalMessages,
    });
    publishAgentSurfacesInvalidated(memory.projectId, { conversationId, graphScopeId, reason: "attempt-updated" });
    terminalCommittedRows.push(...terminalCommit.timelineRows);
    terminalCommittedRows.push(...terminalCommit.interactionRows);
    completedTurnSequence = terminalCommit.completedTurnSequence;
  } catch (error) {
    try {
      commitFailedProviderTurn(store, result.session?.sessionId ?? null);
    } catch {
      // Preserve the original canonical persistence error.
    }
    if (publishTerminalRows() > 0) {
      await emitInteractionUpdate();
    }
    throw error;
  } finally {
    store.close();
    canonicalStore = null;
    canonicalDelivery = null;
  }
  if (publishTerminalRows() > 0) {
    await emitInteractionUpdate();
  }
  if (planDocumentCreated) {
    await emitInteractionUpdate(live);
  }
  if (postRunInvariantError) throw postRunInvariantError;
  const autoAcceptedPlanning = acceptedPlanning as Awaited<ReturnType<typeof acceptCurrentConversationPlanningPackage>> | null;
  if (autoAcceptedPlanning
    && issuedAuthorization?.mode === "scoped-auto"
    && autoAcceptedPlanning.workflowGraphPlan.graphMode === "sequential-v1") {
    await runWorkflowConversationAction(project, {
      actionType: "workflow.run.start",
      changeId: autoAcceptedPlanning.changeId,
      workflowGraphPlanId: autoAcceptedPlanning.workflowGraphPlan.id,
    }, live, { continueMainAgentTurn: runProjectScopedMainAgentTurn });
  }
  if (result.objective?.status === "complete") {
    const terminalStore = await openWorkbenchDatabase(memory);
    let terminalizedInteractionCount = 0;
    try {
      const rows = terminalStore.unitOfWork.terminalizeConversationGraphScope(
        memory.projectId,
        conversationId,
        graphScopeId,
        new Date().toISOString(),
      );
      publishAgentSurfacesInvalidated(memory.projectId!, { conversationId, graphScopeId, reason: "scope-changed" });
      terminalizedInteractionCount = rows.length;
      new CanonicalTimelineDelivery(terminalStore, live).publishCommittedMany(rows);
    } finally {
      terminalStore.close();
    }
    if (terminalizedInteractionCount > 0) {
      await emitInteractionUpdate();
    }
  }
  return assistant ?? planReferenceMarker ?? latestChildMessage ?? {
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

function projectScopedPlanningStatusMessage(conversationId: string, graphScopeId: string, runId: string, text: string, childThreadId: string, providerId: string): TopicThreadEntry {
  const timestamp = new Date().toISOString();
  const block: AssistantTurnBlock = {
    id: `planning-status:${providerId}:${runId}:${childThreadId}`,
    runId,
    sequence: 1,
    kind: "status",
    timestamp,
    source: "aho",
    status: "completed",
    title: "计划状态",
    text: text.trim(),
  };
  return {
    id: `assistant:${conversationId}:${providerId}:${runId}:planning-status:${childThreadId}`,
    type: "assistant.message",
    timestamp,
    conversationId,
    graphScopeId,
    changeId: "",
    text: text.trim(),
    runId,
    providerId,
    threadId: childThreadId,
    agentSurfaceId: agentThreadSurfaceId(providerId, childThreadId),
    agentRoleId: PLANNING_AGENT_ROLE_ID,
    blocks: [block],
  };
}

async function readProviderAttempts(memory: ResolvedMemory, conversationId: string) {
  if (!memory.projectId) return [];
  const store = await openWorkbenchDatabase(memory);
  try {
    return store.providerAttempts.listProviderAttempts(memory.projectId, conversationId);
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

async function currentConversationGraphScope(memory: ResolvedMemory, conversationId: string): Promise<string> {
  if (!memory.projectId) throw new Error("Project id is required to resolve graph scope.");
  const store = await openWorkbenchDatabase(memory);
  try {
    const graphScopeId = store.conversations.readConversation(memory.projectId, conversationId)?.currentGraphScopeId;
    if (!graphScopeId) throw new Error("The current conversation has no Agent graph scope.");
    return graphScopeId;
  } finally {
    store.close();
  }
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
