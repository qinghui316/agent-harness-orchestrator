import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { detectCodexAppServerCapability, extractCodexAppServerCollabToolCall, runCodexAppServerTurn, type CodexAppServerCollabToolCall } from "../codex/app-server.js";
import { resolveCodexEffectiveModel } from "../codex/model-settings.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
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
import { buildMainAgentExecutionContext } from "./codex-chat/context.js";
import { runWorkbenchWorkflowActionService } from "./actions/service.js";
import { artifactForActionResult, extractRunId, labelForAction, summarizeActionResult, workflowFailureMessage } from "./actions/results.js";
import { assertWorkflowActionScope, auditHighImpactWorkflowAction, workflowActionScopePayload, workflowActionTargetId } from "./actions/boundary.js";
import { dispatchWorkbenchWorkflowAction } from "./actions/dispatcher.js";
import { buildWorkbenchActionHandlers } from "./actions/handlers/index.js";
import { recordWorkbenchDecision } from "./decisions.js";
import { stripProjectScopedChildAgentLeakFromMainAgentText } from "./main-agent-visible-text.js";
import { buildMainAgentPlanHandoffPromptContext, validatePlanHandoffIntent } from "./plan-handoff.js";
import { resolveTopicAttachments } from "./attachments.js";
import { resolveTopicFileReferences } from "./file-references.js";
import { createAssistantTranscriptCapture } from "./live-transcript.js";
import { getSingleActiveChangeId, resolveTopic } from "./topic-resolver.js";
import { appendConversationThreadEntry } from "./conversation-thread.js";
import { collectAllConversationThreadEntries, fromStoredThreadMessage, readConversationThread as readThreadLog } from "./conversation-thread-log.js";
import { WorkbenchStore, type StoredTopicMessage } from "./store.js";
import { acceptCurrentConversationPlanningPackage, writePlannerChildProposal } from "./planning/planner-child-proposal.js";
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
  input: { title: string; body?: string; contextRefs?: TopicMessageInput["contextRefs"]; attachmentIds?: string[] },
  live?: WorkbenchLiveSink,
  options: { runMainAgent?: boolean } = {},
): Promise<{ conversationId: string; title: string; state: "active" }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Workbench conversation");
  if (!memory.projectId) throw new Error("Project id is required to create a conversation.");
  const resolved = await resolveTopicFileReferences(project, input.body ?? input.title, input.contextRefs);
  const attachments = await resolveTopicAttachments(project, input.attachmentIds);
  const body = resolved.text || defaultAttachmentMessage(attachments);
  const now = new Date().toISOString();
  const conversationId = `conv-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  const store = await WorkbenchStore.open(memory);
  try {
    store.createConversation({
      projectId: memory.projectId,
      conversationId,
      title: input.title,
      state: "active",
      boundChangeId: null,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    store.appendMessage(toConversationStoredMessage(memory.projectId, conversationId, {
      id: `user:${conversationId}:1`,
      type: "user.message",
      timestamp: now,
      conversationId,
      changeId: "",
      text: body,
      contextRefs: resolved.contextRefs.length > 0 ? resolved.contextRefs : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    }));
  } finally {
    store.close();
  }
  live?.emit({
    event: "topic.created",
    data: { topic: { id: conversationId, conversationId, title: input.title, state: "active" } },
  });
  live?.emit({
    event: "topic.message",
    data: {
      id: `user:${conversationId}:1`,
      type: "user.message",
      timestamp: now,
      conversationId,
      changeId: "",
      text: body,
      contextRefs: resolved.contextRefs.length > 0 ? resolved.contextRefs : undefined,
      attachments: attachments.length > 0 ? attachments : undefined,
    },
  });
  if (options.runMainAgent !== false) {
    await runProjectScopedMainAgentTurn(project, conversationId, body, live);
  }
  return { conversationId, title: input.title, state: "active" };
}

export async function postConversationMessage(project: ManagedProject, conversationId: string, input: string | TopicMessageInput, live?: WorkbenchLiveSink): Promise<TopicMessageResult> {
  const parsed = await normalizeTopicMessageInput(project, input);
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Workbench conversation");
  if (!memory.projectId) throw new Error("Project id is required to post a conversation message.");
  conversationId = await resolveConversationId(project, conversationId);
  const now = new Date().toISOString();
  const user: TopicThreadEntry = {
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
    if (!store.readConversation(memory.projectId, conversationId)) throw new Error(`Conversation not found: ${conversationId}.`);
    const existingMessages = store.listConversationMessages(memory.projectId, conversationId).map(fromStoredThreadMessage);
    planHandoff = validatePlanHandoffIntent(existingMessages, parsed.planHandoffIntent);
    storedUser = { ...user, planHandoff };
    store.appendMessage(toConversationStoredMessage(memory.projectId, conversationId, storedUser));
  } finally {
    store.close();
  }
  live?.emit({ event: "topic.message", data: storedUser });
  const assistant = await runProjectScopedMainAgentTurn(project, conversationId, parsed.message, live, planHandoff);
  return { user: storedUser, assistant, run: null, codexSessionId: null, mode: "chat", assistantMessage: assistant.text ?? "" };
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

export function buildInitialMainAgentPrompt(userMessage: string): string {
  return [
    "这是 AHO 需求对话的第一轮主 Agent 回复。",
    "你在主对话中直接回复用户，语气像一个正常开发助理。",
    "用 2-4 句话说明：你理解的用户目标；当前不会修改文件或启动实现；下一步是先确认真实需求和验收方式，或等待用户确认后再进入规划。",
    "不要使用项目内部对象名、英文阶段名、技术状态码或实现细节术语。",
    "不要说已经启动任何子 Agent、规划角色、编码角色、验证角色或审查角色。",
    "不要生成完整计划、任务清单或验收标准；不要执行代码；不要声称已经获得确认。",
    "如果用户明确要求你解释内部机制，才可以使用内部术语。",
    "",
    "用户原始需求：",
    userMessage,
  ].join("\n");
}

export function buildProjectScopedMainAgentPrompt(
  userMessage: string,
  planHandoff?: ValidatedPlanHandoffIntent,
  workflowAuthoringContext = "",
): string {
  return [
    "You are the main Agent for this project.",
    "Load and follow $aho-main-orchestration. It is the only Main-Agent scheduling guide for this turn.",
    "Use project records as truth and conversation history only as interaction context.",
    "Keep visible replies concise and in the user's language; explain internal terms only when the user asks about the mechanism.",
    ...buildMainAgentPlanHandoffPromptContext(planHandoff),
    ...(workflowAuthoringContext ? ["", workflowAuthoringContext] : []),
    "",
    "User message:",
    userMessage,
  ].join("\n");
}

async function runProjectScopedMainAgentTurn(
  project: ManagedProject,
  conversationId: string,
  userMessage: string,
  live?: WorkbenchLiveSink,
  planHandoff?: ValidatedPlanHandoffIntent,
  options: { goalResume?: { deliveryKey: string; contextText: string } } = {},
): Promise<TopicThreadEntry> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Project-scoped chat");
  if (!memory.projectId) throw new Error("Project id is required to run project-scoped chat.");
  const runId = buildProjectConversationRunId(conversationId);
  const directory = join(memory.workbenchRoot, "conversations", conversationId, "runs", runId);
  await mkdir(directory, { recursive: true });
  const capture = createAssistantTranscriptCapture(live);
  capture.sink.emit({ event: "run.started", data: { runId, conversationId, runtime: "codex-readonly", actionType: "chat.ask" } });
  capture.sink.emit({ event: "run.status", data: { runId, status: "connecting", label: "正在连接 Codex" } });
  const proposalDirectory = join(directory, "planner-proposal");
  await mkdir(proposalDirectory, { recursive: true });
  const workflowAuthoringSkillPath = join(getSystemSkillsRoot(), "aho-workflow-authoring", "SKILL.md");
  const mainOrchestrationSkillPath = join(getSystemSkillsRoot(), "aho-main-orchestration", "SKILL.md");
  if (!existsSync(workflowAuthoringSkillPath) || !existsSync(mainOrchestrationSkillPath)) throw new Error("Required Main/Workflow system Skill is unavailable.");
  const planningTransport = [
    "$aho-workflow-authoring is attached as a native Codex Skill input for this turn; load it on demand and do not paste its body into Main or child prompts.",
    `When planning is requested, create exactly one real planning child and instruct it to write spec.md, plan.md, tasks.md, and optional notes.md directly under: ${proposalDirectory}`,
    "Treat those files as an immutable proposal. Do not repair or rewrite them after the child completes; AHO will parse and validate the files as written.",
  ].join("\n");
  const prompt = buildProjectScopedMainAgentPrompt(userMessage, planHandoff, planningTransport);
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
  const appServerCapabilities = await detectCodexAppServerCapability();
  if (!appServerCapabilities.available) {
    const message = appServerCapabilities.errors.length > 0
      ? `Codex app-server 不可用：${appServerCapabilities.errors.join("; ")}`
      : "Codex app-server 不可用。";
    live?.emit({ event: "error", data: { runId, message } });
    throw new Error(message);
  }
  const effectiveModel = await resolveCodexEffectiveModel();
  let mainThreadId: string | null = null;
  let boundChangeId: string | null = null;
  let acceptedPlanMarker: TopicThreadEntry | null = null;
  let acceptedPlanning: Awaited<ReturnType<typeof acceptCurrentConversationPlanningPackage>> | null = null;
  const sessionStore = await WorkbenchStore.open(memory);
  try {
    const conversation = sessionStore.readConversation(memory.projectId, conversationId);
    boundChangeId = conversation?.boundChangeId ?? null;
    const link = sessionStore.readProviderThread(memory.projectId, conversationId, "main-agent");
    mainThreadId = link?.capabilityProfile === "main-agent-goal-v1"
      ? link.providerThreadId
      : null;
  } finally {
    sessionStore.close();
  }
  const parentDeltaFilter = createProjectScopedParentDeltaFilter((delta) => capture.sink.emit({ event: "assistant.delta", data: { delta, runId } }));
  const result = await runCodexAppServerTurn({
    projectId: project.id,
    runtimeScopeId: conversationId,
    roleId: "main-agent",
    runId,
    cwd: project.path,
    prompt,
    sandboxPolicy: "workspace-write",
    writableRoots: [proposalDirectory],
    skillInputs: [
      { name: "aho-main-orchestration", path: mainOrchestrationSkillPath },
      { name: "aho-workflow-authoring", path: workflowAuthoringSkillPath },
    ],
    existingThreadId: mainThreadId,
    goalSession: true,
    goalResume: options.goalResume ?? planHandoffResume,
    dynamicTools: [
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
    onDynamicToolCall: async (call) => {
      if (Object.keys(call.arguments).length > 0) {
        return { contentItems: [{ type: "inputText", text: "AHO conversation tools do not accept caller-selected targets." }], success: false };
      }
      if (call.tool === "aho_accept_current_plan" && planHandoff?.kind === "execute-plan") {
        const accepted = await acceptCurrentConversationPlanningPackage(project, conversationId, planHandoff.sourceArtifact);
        acceptedPlanning = accepted;
        boundChangeId = accepted.changeId;
        acceptedPlanMarker = {
          ...projectScopedPlanningMessage(conversationId, runId, `Accepted proposal ${accepted.proposalId}.`, PROJECT_PLANNING_AGENT_ROLE_ID),
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
      events: join(directory, "app-server-events.jsonl"),
      stderr: join(directory, "app-server-stderr.log"),
      lastMessage: join(directory, "last-message.md"),
      session: join(directory, "agent-session.json"),
    },
    onTextDelta: (delta) => parentDeltaFilter.push(delta),
    onNotification: (notification) => forwardProjectAppServerNotification(runId, notification, capture.sink),
    onUserInputRequest: (request) => {
      capture.sink.emit({
        event: "codex.userInput.requested",
        data: {
          requestId: request.requestId,
          threadId: request.threadId,
          turnId: request.turnId,
          itemId: request.itemId,
          runId,
          conversationId,
          agentRoleId: request.roleId !== "main-agent" ? request.roleId : undefined,
          questions: request.questions,
          status: "pending",
        },
      });
    },
    onError: (error) => capture.sink.emit({ event: "error", data: { runId, message: error instanceof Error ? error.message : String(error) } }),
    model: effectiveModel.model,
  });
  const explicitlyIdentifiedPlannerChildren = result.childThreads.filter((child) => child.prompt?.includes("planner-proposal") || child.prompt?.includes("spec.md"));
  const plannerChildren = explicitlyIdentifiedPlannerChildren.length > 0
    ? explicitlyIdentifiedPlannerChildren
    : result.childThreads.length === 1
      ? result.childThreads
      : [];
  if (result.childThreads.length > 0 && plannerChildren.length !== 1) {
    throw new Error("Main Agent planning requires exactly one identifiable real planner child.");
  }
  if ((plannerChildren.length > 0 || planHandoff?.kind === "execute-plan") && !result.goal) {
    throw new Error("Main Agent planning and execution handoff requires a native Goal on the provider thread.");
  }
  let issuedAuthorization: LocalExecutionAuthorization | null = null;
  if (acceptedPlanning) {
    issuedAuthorization = await issueAcceptedPlanningAuthorization(project, memory, conversationId, result, acceptedPlanning, planHandoff);
  }
  parentDeltaFilter.flush();
  const rawParentText = capture.text.trim()
    || stripProjectScopedPromptEcho(result.lastMessage, userMessage).trim()
    || result.error
    || "";
  const assistantText = cleanUserVisibleAgentText(stripProjectScopedChildAgentLeakFromMainAgentText(rawParentText)).trim();
  await writeFile(join(directory, "last-message.md"), assistantText, "utf8");
  const assistant: TopicThreadEntry | null = assistantText ? {
    id: `assistant:${conversationId}:${Date.now().toString(36)}`,
    type: "assistant.message",
    timestamp: new Date().toISOString(),
    conversationId,
    changeId: "",
    text: assistantText,
    runId,
    artifact: `workbench/conversations/${conversationId}/runs/${runId}/last-message.md`,
    activity: capture.activity,
    blocks: capture.blocks.length > 0 ? capture.blocks : initialMainAgentBlocks([], runId, assistantText),
  } : null;
  const planMessages: TopicThreadEntry[] = [];
  const store = await WorkbenchStore.open(memory);
  try {
    if (result.threadId) store.writeProviderThread({
      projectId: memory.projectId,
      conversationId,
      providerThreadId: result.threadId,
      roleId: "main-agent",
      parentThreadId: null,
      changeId: boundChangeId,
      capabilityProfile: "main-agent-goal-v1",
      updatedAt: new Date().toISOString(),
    });
    for (const child of result.childThreads) {
      const isPlannerChild = plannerChildren.some((planner) => planner.threadId === child.threadId);
      store.writeProviderThread({
        projectId: memory.projectId,
        conversationId,
        providerThreadId: child.threadId,
        roleId: isPlannerChild ? PROJECT_PLANNING_AGENT_ROLE_ID : "child-agent",
        parentThreadId: child.parentThreadId,
        changeId: boundChangeId,
        capabilityProfile: isPlannerChild ? "planner-child-v1" : "provider-child-v1",
        updatedAt: new Date().toISOString(),
      });
      if (!isPlannerChild) continue;
      let message: TopicThreadEntry;
      try {
        const proposalChanges = new Set(child.changedFiles.map((path) => path.replaceAll("\\", "/")));
        for (const required of ["spec.md", "plan.md", "tasks.md"]) {
          if (![...proposalChanges].some((path) => path.endsWith(`/planner-proposal/${required}`) || path === required)) {
            throw new Error(`Planner child did not author ${required} in its native file-change evidence.`);
          }
        }
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
          runId,
          `${proposal.planMd.trim()}\n\nProposal hash: ${proposal.hash}\nLineage: ${proposal.parentThreadId} -> ${proposal.childThreadId}`,
          PROJECT_PLANNING_AGENT_ROLE_ID,
          proposal.artifact,
          child.threadId,
        );
      } catch (cause) {
        message = {
          ...projectScopedPlanningMessage(conversationId, runId, child.finalText || "Plan child did not return a valid proposal.", PROJECT_PLANNING_AGENT_ROLE_ID, undefined, child.threadId),
          status: "planner-proposal-invalid",
        };
        capture.sink.emit({ event: "error", data: { runId, message: cause instanceof Error ? cause.message : String(cause) } });
      }
      planMessages.push(message);
      store.appendMessage(toConversationStoredMessage(memory.projectId, conversationId, message));
    }
    if (acceptedPlanMarker) store.appendMessage(toConversationStoredMessage(memory.projectId, conversationId, acceptedPlanMarker));
    if (assistant) store.appendMessage(toConversationStoredMessage(memory.projectId, conversationId, assistant));
  } finally {
    store.close();
  }
  for (const planMessage of planMessages) live?.emit({ event: "assistant.message", data: planMessage });
  if (assistant) live?.emit({ event: "assistant.message", data: assistant });
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
  return assistant ?? planMessages.at(-1) ?? {
    id: `assistant:${conversationId}:${runId}:empty`,
    type: "assistant.message",
    timestamp: new Date().toISOString(),
    conversationId,
    changeId: "",
    text: "",
    runId,
    blocks: [],
  };
}

function createProjectScopedParentDeltaFilter(emit: (delta: string) => void): { push(delta: string): void; flush(): void } {
  let pending = "";
  function drain(completedOnly: boolean): void {
    for (;;) {
      const match = pending.match(/[。！？\n]/);
      if (!match) break;
      const end = (match.index ?? 0) + match[0].length;
      const segment = pending.slice(0, end);
      pending = pending.slice(end);
      if (segmentSurvivesProjectScopedLeakFilter(segment)) emit(segment);
    }
    if (!completedOnly && pending.trim()) {
      if (segmentSurvivesProjectScopedLeakFilter(pending)) emit(pending);
      pending = "";
    }
  }
  return {
    push(delta: string): void {
      if (!delta) return;
      pending += delta;
      drain(true);
    },
    flush(): void {
      drain(false);
    },
  };
}

function segmentSurvivesProjectScopedLeakFilter(segment: string): boolean {
  const trimmed = segment.trim();
  if (!trimmed) return false;
  return stripProjectScopedChildAgentLeakFromMainAgentText(trimmed) === trimmed;
}

function projectScopedPlanningMessage(conversationId: string, runId: string, planText: string, roleId = PROJECT_PLANNING_AGENT_ROLE_ID, artifact?: string, childThreadId = "child"): TopicThreadEntry {
  const timestamp = new Date().toISOString();
  const block: AssistantTurnBlock = {
    id: `native-plan:${runId}`,
    runId,
    sequence: 1,
    kind: "prose",
    timestamp,
    source: "codex",
    text: planText.trim(),
  };
  return {
    id: `assistant:${conversationId}:${runId}:planning-agent:${childThreadId}`,
    type: "assistant.message",
    timestamp,
    conversationId,
    changeId: "",
    text: planText.trim(),
    runId,
    agentRoleId: roleId,
    artifact,
    blocks: [block],
  };
}

function cleanUserVisibleAgentText(message: string): string {
  return message
    .replace(/\bAGENTS\.md\b/gi, "项目说明")
    .replace(/\bHarness\b/gi, "项目记录")
    .replace(/\bactive\s+change\b/gi, "当前任务")
    .replace(/\bChange\b/g, "任务")
    .replace(/\bworktree\b/gi, "工作副本")
    .replace(/\bTaskRun\b/g, "任务运行")
    .replace(/\bWorkflowRun\b/g, "流程运行")
    .replace(/\bclose\s+gate\b/gi, "完成前确认")
    .replace(/\bvalidation\b/gi, "检查")
    .replace(/\baudit\b/gi, "审查")
    .replace(/\bbundle\b/gi, "计划记录")
    .replace(/\bqueue\b/gi, "队列")
    .replace(/\bscheduler\b/gi, "调度流程")
    .replace(/\bAC-\d+\b/g, "验收点")
    .replace(/\bT-\d+\b/g, "任务项")
    .replace(/\bTBD\b/g, "待确认");
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

function forwardProjectAppServerNotification(runId: string, notification: unknown, live: WorkbenchLiveSink | undefined): void {
  if (!isRecord(notification)) return;
  const method = typeof notification.method === "string" ? notification.method : "";
  const params = isRecord(notification.params) ? notification.params : {};
  const collabToolCall = extractCodexAppServerCollabToolCall(method, params);
  if (collabToolCall) {
    forwardProjectCollabToolCall(runId, collabToolCall, live);
    return;
  }
  if (method === "turn/completed") {
    live?.emit({ event: "run.status", data: { runId, status: "completed" } });
    return;
  }
  if (method === "turn/failed") {
    const message = typeof params.error === "string" ? params.error : "Codex app-server turn failed.";
    live?.emit({ event: "error", data: { runId, message } });
  }
}

function forwardProjectCollabToolCall(runId: string, call: CodexAppServerCollabToolCall, live: WorkbenchLiveSink | undefined): void {
  const status = call.status ?? "running";
  const promptPreview = call.prompt ? boundedPreview(call.prompt) : undefined;
  live?.emit({
    event: "tool.event",
    data: {
      runId,
      itemId: call.itemId,
      phase: status === "completed" || status === "succeeded" ? "completed" : "started",
      name: call.tool,
      outputTail: promptPreview,
      status,
    },
  });
}

function boundedPreview(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 500 ? `${normalized.slice(0, 497)}...` : normalized;
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
    source: "codex",
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
    readThreadEntries: readWorkflowActionThreadEntries,
    appendThreadEntry: appendConversationThreadEntry,
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
  result: Awaited<ReturnType<typeof runCodexAppServerTurn>>,
  accepted: Awaited<ReturnType<typeof acceptCurrentConversationPlanningPackage>>,
  handoff: ValidatedPlanHandoffIntent | null | undefined,
): Promise<LocalExecutionAuthorization | null> {
  if (!result.threadId || !result.goal || handoff?.kind !== "execute-plan") {
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
    providerThreadId: result.threadId,
    goalIdentityHash: hashJson({ objective: result.goal.objective, createdAt: result.goal.createdAt }),
    mode: handoff.executionMode ?? "scoped-auto",
    acceptedPlanId: accepted.proposalId,
    acceptedPlanHash: accepted.proposalHash,
    graphId: accepted.workflowGraphPlan.id,
    graphHash,
    artifactManifestHash,
    sourceHead,
    sourceStateHash: hashJson(sourceStatus),
    providerScopeHash: hashJson({ projectId: project.id, conversationId, threadId: result.threadId }),
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
    const link = store.readProviderThread(memory.projectId, conversationId, "main-agent");
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

function toConversationStoredMessage(projectId: string, conversationId: string, entry: TopicThreadEntry): Omit<StoredTopicMessage, "position"> {
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
    artifact: entry.artifact ?? null,
    error: entry.error ?? null,
    rawJson: JSON.stringify(entry),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function normalizeTopicMessageInput(project: ManagedProject, input: string | TopicMessageInput): Promise<Required<Pick<TopicMessageInput, "mode" | "message">> & { contextRefs?: TopicMessageInput["contextRefs"]; attachments?: TopicAttachment[]; planHandoffIntent?: TopicMessageInput["planHandoffIntent"] }> {
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
