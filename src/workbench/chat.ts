import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { detectCodexAppServerCapability, extractCodexAppServerCollabToolCall, extractCodexAppServerPlanText, getActiveCodexAppServerTurn, runCodexAppServerTurn, type CodexAppServerCollabToolCall } from "../codex/app-server.js";
import { resolveCodexEffectiveModel } from "../codex/model-settings.js";
import { createConcurrentChange } from "../change/manager.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { listRuns } from "../run/manager.js";
import type { ManagedProject, ResolvedMemory, RunMetadata } from "../types/index.js";
import { postTopicPlanMessage, runCodexChat } from "./codex-chat/bridge.js";
import { buildMainAgentExecutionContext } from "./codex-chat/context.js";
import { runWorkbenchWorkflowActionService } from "./actions/service.js";
import { artifactForActionResult, extractRunId, labelForAction, summarizeActionResult, workflowFailureMessage } from "./actions/results.js";
import { assertWorkflowActionScope, auditHighImpactWorkflowAction, workflowActionScopePayload, workflowActionTargetId } from "./actions/boundary.js";
import { dispatchWorkbenchWorkflowAction } from "./actions/dispatcher.js";
import { buildWorkbenchActionHandlers } from "./actions/handlers/index.js";
import { recordWorkbenchDecision } from "./decisions.js";
import { emitAssistantEvent } from "./live-events.js";
import { stripAccidentalPlanningDraftFromMainAgentText, stripProjectScopedChildAgentLeakFromMainAgentText } from "./main-agent-visible-text.js";
import { buildMainAgentPlanHandoffPromptContext, validatePlanHandoffIntent } from "./plan-handoff.js";
import { resolveTopicAttachments } from "./attachments.js";
import { resolveTopicFileReferences } from "./file-references.js";
import { createAssistantTranscriptCapture } from "./live-transcript.js";
import { getSingleActiveChangeId, resolveTopic } from "./topic-resolver.js";
import { readTopicRuntime } from "./topic-runtime.js";
import { appendTopicThreadEntry } from "./topic-thread.js";
import { collectAllTopicThreadEntries, fromStoredThreadMessage, readTopicThreadLog as readThreadLog } from "./thread-log.js";
import { WorkbenchStore, type StoredTopicMessage } from "./store.js";
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
export { appendTopicThreadEntry } from "./topic-thread.js";

const PROJECT_PLAN_SESSION_ROLE_ID = "plan-session";

export type {
  AssistantTurnActivity,
  AssistantTurnBlock,
  AssistantTurnBlockKind,
  OrchestrationPlanCard,
  SuggestedAction,
  TopicMessageInput,
  TopicMessageResult,
  TopicRoutingDecision,
  TopicRuntimeMetadata,
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

export async function createWorkbenchTopic(project: ManagedProject, input: { title: string; body?: string; contextRefs?: TopicMessageInput["contextRefs"]; attachmentIds?: string[] }): Promise<{ changeId: string; title: string; state: "active" }> {
  const resolved = await resolveTopicFileReferences(project, input.body ?? input.title, input.contextRefs);
  const attachments = await resolveTopicAttachments(project, input.attachmentIds);
  const body = resolved.text || defaultAttachmentMessage(attachments);
  const result = await createConcurrentChange(project, { title: input.title, body });
  await appendTopicThreadEntry(project, result.change.id, {
    type: "user.message",
    text: body,
    contextRefs: resolved.contextRefs.length > 0 ? resolved.contextRefs : undefined,
    attachments: attachments.length > 0 ? attachments : undefined,
  });
  return { changeId: result.change.id, title: result.change.title, state: "active" };
}

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
  const now = new Date().toISOString();
  const user: TopicThreadEntry = {
    id: `user:${conversationId}:${Date.now().toString(36)}`,
    type: "user.message",
    timestamp: now,
    conversationId,
    changeId: "",
    text: parsed.message,
    agentRoleId: parsed.mode === "plan" ? PROJECT_PLAN_SESSION_ROLE_ID : undefined,
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
  const assistant = parsed.mode === "plan"
    ? await runProjectScopedPlanAgentTurn(project, conversationId, parsed.message, live)
    : await runProjectScopedMainAgentTurn(project, conversationId, parsed.message, live, planHandoff);
  return { user: storedUser, assistant, run: null, codexSessionId: null, mode: parsed.mode, routingDecision: "same-topic", assistantMessage: assistant.text ?? "" };
}

export async function listConversationMessages(project: ManagedProject, conversationId: string): Promise<TopicThreadEntry[]> {
  const memory = await resolveProjectMemory(project);
  if (!memory.projectId) return [];
  const store = await WorkbenchStore.open(memory);
  try {
    return store.listConversationMessages(memory.projectId, conversationId).map(fromStoredThreadMessage);
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

export function buildProjectScopedMainAgentPrompt(userMessage: string, planHandoff?: ValidatedPlanHandoffIntent): string {
  return [
    "You are the main Agent for this project.",
    "Run as a short read-only parent conversation turn. Do not edit files, create working copies, apply changes, close work, or claim approval.",
    "Use the project root and project records as the source of truth. Read the project guidance and docs yourself when needed.",
    "Workbench conversation history is only interaction context; it is not workflow truth.",
    "You are the parent Agent. If the user explicitly asks for planning, or if planning is clearly the next useful step, you may use provider-native planning or collaboration tools when they are available.",
    "Prefer provider-native Plan Mode or child-Agent collaboration over writing a full plan in the parent reply.",
    "Do not write child-Agent output, child-Agent logs, implementation plans, acceptance lists, task lists, or internal runtime details as parent prose.",
    "Only native runtime tool/Plan/question events count as child-Agent or planning-session work; never simulate that work in text.",
    "If provider-native planning or collaboration is unavailable, say that plainly and continue as a normal parent conversation without fabricating child-Agent output.",
    "If the user asks to execute after a plan, continue as the main Agent: read project guidance, enabled skills, and docs, then use available tools according to the project rules. Do not assume Workbench will create Harness records or execute the plan for you.",
    "Do not expose internal product terms in the user-visible reply, including Harness, AGENTS.md, Change, active change, worktree, AC, tasks, TaskRun, WorkflowRun, queue, scheduler, bundle, close gate, validation, or audit.",
    "Use plain user-facing words instead, such as 项目记录, 项目说明, 当前任务, 工作副本, 验收点, 计划, 检查, 审查, or 完成前确认.",
    "When you produce a visible parent reply, keep it to 2-4 sentences in the user's language.",
    ...buildMainAgentPlanHandoffPromptContext(planHandoff),
    "",
    "User message:",
    userMessage,
  ].join("\n");
}

async function runProjectScopedMainAgentTurn(project: ManagedProject, conversationId: string, userMessage: string, live?: WorkbenchLiveSink, planHandoff?: ValidatedPlanHandoffIntent): Promise<TopicThreadEntry> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Project-scoped chat");
  if (!memory.projectId) throw new Error("Project id is required to run project-scoped chat.");
  const runId = buildProjectConversationRunId(conversationId);
  const directory = join(memory.workbenchRoot, "conversations", conversationId, "runs", runId);
  await mkdir(directory, { recursive: true });
  const capture = createAssistantTranscriptCapture(live);
  capture.sink.emit({ event: "run.started", data: { runId, conversationId, runtime: "codex-readonly", actionType: "chat.ask" } });
  capture.sink.emit({ event: "run.status", data: { runId, status: "connecting", label: "正在连接 Codex" } });
  const prompt = buildProjectScopedMainAgentPrompt(userMessage, planHandoff);
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
  let projectNativePlanText = "";
  const parentDeltaFilter = createProjectScopedParentDeltaFilter((delta) => capture.sink.emit({ event: "assistant.delta", data: { delta, runId } }));
  const result = await runCodexAppServerTurn({
    projectId: project.id,
    runtimeScopeId: conversationId,
    roleId: "main-agent",
    runId,
    cwd: project.path,
    prompt,
    sandboxPolicy: "read-only",
    paths: {
      events: join(directory, "app-server-events.jsonl"),
      stderr: join(directory, "app-server-stderr.log"),
      lastMessage: join(directory, "last-message.md"),
      session: join(directory, "agent-session.json"),
    },
    onTextDelta: (delta) => parentDeltaFilter.push(delta),
    onPlanDelta: (delta) => {
      if (!delta.trim()) return;
      projectNativePlanText += delta;
      forwardProjectPlanEvent(runId, "item/plan/delta", { itemId: "native-plan" }, projectNativePlanText, capture.sink);
    },
    onPlanUpdate: (text) => {
      if (!text.trim()) return;
      projectNativePlanText = text;
      forwardProjectPlanEvent(runId, "turn/plan/updated", { itemId: "native-plan" }, projectNativePlanText, capture.sink);
    },
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
          agentRoleId: PROJECT_PLAN_SESSION_ROLE_ID,
          questions: request.questions,
          status: "pending",
        },
      });
    },
    onError: (error) => capture.sink.emit({ event: "error", data: { runId, message: error instanceof Error ? error.message : String(error) } }),
    model: effectiveModel.model,
  });
  parentDeltaFilter.flush();
  const nativePlanText = projectNativePlanText.trim();
  const rawParentText = capture.text.trim()
    || (nativePlanText ? "" : stripProjectScopedPromptEcho(result.lastMessage, userMessage).trim())
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
  const planMessage = nativePlanText ? projectScopedPlanningMessage(conversationId, runId, nativePlanText) : null;
  const store = await WorkbenchStore.open(memory);
  try {
    if (planMessage) store.appendMessage(toConversationStoredMessage(memory.projectId, conversationId, planMessage));
    if (assistant) store.appendMessage(toConversationStoredMessage(memory.projectId, conversationId, assistant));
  } finally {
    store.close();
  }
  if (planMessage) live?.emit({ event: "assistant.message", data: planMessage });
  if (assistant) live?.emit({ event: "assistant.message", data: assistant });
  return assistant ?? planMessage ?? {
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

async function runProjectScopedPlanAgentTurn(project: ManagedProject, conversationId: string, userMessage: string, live?: WorkbenchLiveSink): Promise<TopicThreadEntry> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Project-scoped Plan Agent chat");
  if (!memory.projectId) throw new Error("Project id is required to run project-scoped Plan Agent chat.");
  const runId = buildProjectConversationRunId(conversationId);
  const directory = join(memory.workbenchRoot, "conversations", conversationId, "runs", runId);
  await mkdir(directory, { recursive: true });
  const capture = createAssistantTranscriptCapture(live);
  capture.sink.emit({ event: "run.started", data: { runId, conversationId, runtime: "codex-readonly", actionType: "orchestrator.plan", agentRoleId: PROJECT_PLAN_SESSION_ROLE_ID } });
  const prompt = buildProjectScopedPlanAgentPrompt(userMessage);
  await writeFile(join(directory, "prompt.md"), prompt, "utf8");
  const appServerCapabilities = await detectCodexAppServerCapability();
  if (!appServerCapabilities.available) {
    const message = appServerCapabilities.errors.join("; ") || "Codex app-server is unavailable.";
    capture.sink.emit({ event: "error", data: { runId, message } });
    throw new Error(message);
  }
  const effectiveModel = await resolveCodexEffectiveModel();
  let projectNativePlanText = "";
  const result = await runCodexAppServerTurn({
    projectId: project.id,
    runtimeScopeId: conversationId,
    roleId: PROJECT_PLAN_SESSION_ROLE_ID,
    runId,
    cwd: project.path,
    prompt,
    sandboxPolicy: "read-only",
    collaborationMode: "plan",
    paths: {
      events: join(directory, "app-server-events.jsonl"),
      stderr: join(directory, "stderr.log"),
      lastMessage: join(directory, "last-message.md"),
      session: join(directory, "agent-session.json"),
    },
    onTextDelta: (delta) => capture.sink.emit({ event: "assistant.delta", data: { delta, runId, agentRoleId: PROJECT_PLAN_SESSION_ROLE_ID } }),
    onPlanDelta: (delta) => {
      if (!delta.trim()) return;
      projectNativePlanText += delta;
      forwardProjectPlanEvent(runId, "item/plan/delta", { itemId: "native-plan" }, projectNativePlanText, capture.sink);
    },
    onPlanUpdate: (text) => {
      if (!text.trim()) return;
      projectNativePlanText = text;
      forwardProjectPlanEvent(runId, "turn/plan/updated", { itemId: "native-plan" }, projectNativePlanText, capture.sink);
    },
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
          agentRoleId: PROJECT_PLAN_SESSION_ROLE_ID,
          questions: request.questions,
          status: "pending",
        },
      });
    },
    onError: (error) => capture.sink.emit({ event: "error", data: { runId, message: error instanceof Error ? error.message : String(error) } }),
    model: effectiveModel.model,
  });
  const nativePlanText = projectNativePlanText.trim();
  const visibleText = nativePlanText || result.lastMessage.trim() || result.error || "";
  const assistant = projectScopedPlanningMessage(conversationId, runId, visibleText);
  const store = await WorkbenchStore.open(memory);
  try {
    store.appendMessage(toConversationStoredMessage(memory.projectId, conversationId, assistant));
  } finally {
    store.close();
  }
  live?.emit({ event: "assistant.message", data: assistant });
  return assistant;
}

function buildProjectScopedPlanAgentPrompt(userMessage: string): string {
  return [
    "You are the Plan Agent for this project.",
    "Use Codex Plan Mode. Talk with the user about the plan and ask questions when needed.",
    "Do not edit files, run commands, apply changes, close work, or create project workflow records.",
    "Read project guidance and docs yourself when you need them. Keep user-visible wording natural.",
    "If the user asks to execute, explain the next step briefly; actual execution must continue through the main Agent using project tools and rules.",
    "",
    "User message:",
    userMessage,
  ].join("\n");
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

function projectScopedPlanningMessage(conversationId: string, runId: string, planText: string): TopicThreadEntry {
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
    id: `assistant:${conversationId}:${runId}:plan-session`,
    type: "assistant.message",
    timestamp,
    conversationId,
    changeId: "",
    text: planText.trim(),
    runId,
    agentRoleId: PROJECT_PLAN_SESSION_ROLE_ID,
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
  const planText = extractCodexAppServerPlanText(method, params);
  if (planText) {
    forwardProjectPlanEvent(runId, method, params, planText, live);
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

function forwardProjectPlanEvent(runId: string, method: string, params: Record<string, unknown>, planText: string, live: WorkbenchLiveSink | undefined): void {
  const itemId = typeof params.itemId === "string"
    ? params.itemId
    : isRecord(params.item) && typeof params.item.id === "string"
      ? params.item.id
      : "native-plan";
  const phase = method === "item/plan/delta" ? "streaming" : "updated";
  emitAssistantEvent(live, {
    runId,
    itemId,
    agentRoleId: PROJECT_PLAN_SESSION_ROLE_ID,
    kind: "plan-update",
    phase,
    summary: boundedPreview(planText),
  });
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

export async function runInitialMainAgentTurn(project: ManagedProject, changeId: string, userMessage: string, live?: WorkbenchLiveSink): Promise<TopicThreadEntry> {
  const prompt = buildInitialMainAgentPrompt(userMessage);
  const capture = createAssistantTranscriptCapture(live);
  const chat = await runCodexChat(project, changeId, prompt, capture.sink);
  const assistantText = stripAccidentalPlanningDraftFromMainAgentText(chat.message.trim() || capture.text.trim());
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "main-agent-initial-turn",
    text: assistantText,
    runId: chat.run.id,
    artifact: chat.run.artifacts.lastMessage,
    activity: capture.activity,
    blocks: initialMainAgentBlocks(capture.blocks, chat.run.id, assistantText),
  });
  live?.emit({ event: "assistant.message", data: assistant });
  return assistant;
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

export async function readTopicThreadLog(memory: ResolvedMemory, changePath: string): Promise<TopicThreadEntry[]> {
  return readThreadLog(memory, changePath);
}

export async function postTopicMessage(project: ManagedProject, changeId: string, input: string | TopicMessageInput, live?: WorkbenchLiveSink): Promise<TopicMessageResult> {
  const parsed = await normalizeTopicMessageInput(project, input);
  if (parsed.mode === "plan") return postTopicPlanMessage(project, changeId, parsed.message, live, parsed.contextRefs, parsed.attachments);
  const existingMessages = await listTopicMessages(project, changeId);
  const planHandoff = validatePlanHandoffIntent(existingMessages, parsed.planHandoffIntent);
  const topicState = await getTopicLifecycleState(project, changeId);
  const runningRun = await findRunningRunForChange(project, changeId);
  if (planHandoff && topicState === "archive") {
    const error = new Error("Plan handoff cannot be submitted to an archived conversation.");
    error.name = "Conflict";
    throw error;
  }
  if (planHandoff && runningRun) {
    const error = new Error("Plan handoff cannot be submitted while a workflow run is active.");
    error.name = "Conflict";
    throw error;
  }
  if (topicState === "archive" && looksLikeImplementationRequest(parsed.message)) {
    const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: parsed.message, status: "follow-up-requested", contextRefs: parsed.contextRefs, attachments: parsed.attachments });
    live?.emit({ event: "topic.message", data: user });
    const followUp = await createWorkbenchTopic(project, {
      title: `后续：${parsed.message.split(/\r?\n/)[0].slice(0, 44)}`,
      body: [`Linked follow-up from archived demand ${changeId}.`, "", parsed.message].join("\n"),
      contextRefs: parsed.contextRefs,
      attachmentIds: parsed.attachments?.map((attachment) => attachment.id),
    });
    const assistant = await appendTopicThreadEntry(project, changeId, {
      type: "assistant.message",
      text: `这个需求对话已归档，不能继续承载新的实现工作。我已创建 linked follow-up 需求对话：${followUp.changeId}。`,
      status: "follow-up-created",
      artifact: followUp.changeId,
    });
    live?.emit({ event: "assistant.message", data: assistant });
    return { user, assistant, run: null, codexSessionId: null, mode: "chat", routingDecision: "new-topic-required", assistantMessage: assistant.text ?? "" };
  }
  if (runningRun) {
    const activeTurn = getActiveCodexAppServerTurn(changeId);
    if (activeTurn) {
      const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: parsed.message, status: "steering-sent", runId: activeTurn.runId, contextRefs: parsed.contextRefs, attachments: parsed.attachments });
      live?.emit({ event: "topic.message", data: user });
      await activeTurn.steer(parsed.message);
      const assistant = await appendTopicThreadEntry(project, changeId, {
        type: "assistant.message",
        text: "已发送给当前执行。",
        status: "steering-sent",
        runId: activeTurn.runId,
      });
      live?.emit({ event: "assistant.message", data: assistant });
      emitAssistantEvent(live, {
        runId: activeTurn.runId,
        kind: "status",
        phase: "steered",
        title: "已发送给当前执行",
        summary: "这条输入已通过 Codex app-server 发送给当前运行中的 turn。",
      });
      return { user, assistant, run: null, codexSessionId: null, mode: "chat", routingDecision: "same-topic", assistantMessage: assistant.text ?? "" };
    }
    const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: parsed.message, status: "pending-feedback", runId: runningRun.id, contextRefs: parsed.contextRefs, attachments: parsed.attachments });
    live?.emit({ event: "topic.message", data: user });
    const assistant = await appendTopicThreadEntry(project, changeId, {
      type: "assistant.message",
      text: "已记录，将在下一轮生效。",
      status: "pending-feedback",
      runId: runningRun.id,
    });
    live?.emit({ event: "assistant.message", data: assistant });
    return { user, assistant, run: null, codexSessionId: null, mode: "chat", routingDecision: "same-topic", assistantMessage: assistant.text ?? "" };
  }
  const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: parsed.message, contextRefs: parsed.contextRefs, attachments: parsed.attachments, planHandoff });
  live?.emit({ event: "topic.message", data: user });
  const capture = createAssistantTranscriptCapture(live);
  const chat = await runCodexChat(project, changeId, parsed.message, capture.sink, { attachments: parsed.attachments, planHandoff });
  const assistantText = stripAccidentalPlanningDraftFromMainAgentText(chat.message.trim() || capture.text.trim());
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    text: assistantText,
    runId: chat.run.id,
    artifact: chat.run.artifacts.lastMessage,
    activity: capture.activity,
    blocks: capture.blocks,
  });
  live?.emit({ event: "assistant.message", data: assistant });
  return { user, assistant, run: chat.run, codexSessionId: chat.codexSessionId, mode: "chat", routingDecision: "same-topic", assistantMessage: assistantText };
}

async function findRunningRunForChange(project: ManagedProject, changeId: string): Promise<RunMetadata | null> {
  const memory = await resolveProjectMemory(project);
  const runs = await listRuns(memory).catch(() => []);
  return runs.find((run) => run.changeId === changeId && (run.status === "created" || run.status === "running")) ?? null;
}

async function getTopicLifecycleState(project: ManagedProject, changeId: string): Promise<"active" | "archive"> {
  const { changePath } = await resolveTopic(project, changeId);
  if (changePath.includes("/archive/")) return "archive";
  return "active";
}

function looksLikeImplementationRequest(message: string): boolean {
  return /(新增|修改|实现|修复|继续做|继续改|执行|开发|补测试|改代码|apply|merge|implement|fix|code)/i.test(message);
}

export async function runWorkbenchWorkflowAction(project: ManagedProject, request: WorkbenchWorkflowActionRequest, live?: WorkbenchLiveSink): Promise<WorkbenchWorkflowActionResult> {
  return runWorkbenchWorkflowActionService(project, request, live, {
    resolveChangeId: resolveWorkflowActionChangeId,
    createTranscriptCapture: createAssistantTranscriptCapture,
    readThreadEntries: readWorkflowActionThreadEntries,
    appendThreadEntry: appendTopicThreadEntry,
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

async function resumeNativeGoalAfterAction(input: {
  project: ManagedProject;
  changeId: string;
  actionRunId: string;
  actionType: WorkbenchWorkflowActionRequest["actionType"];
  status: "completed" | "failed";
  result: unknown;
}): Promise<void> {
  const { memory, changePath } = await resolveTopic(input.project, input.changeId);
  const runtime = await readTopicRuntime(memory, changePath, input.changeId);
  if (runtime.codexCapabilityProfile !== "main-agent-goal-v1" || !runtime.codexSessionId) return;

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
  await runCodexChat(
    input.project,
    input.changeId,
    `Continue the current native Goal after ${input.actionType} ${input.status}.`,
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
  const entries = await collectAllTopicThreadEntries(memory);
  return entries.filter((entry) => entry.actionRunId === actionRunId);
}

async function executeWorkflowAction(project: ManagedProject, changeId: string, request: WorkbenchWorkflowActionRequest, live?: WorkbenchLiveSink): Promise<unknown> {
  assertWorkflowActionScope(request);
  await auditHighImpactWorkflowAction(project, changeId, request, live);
  return dispatchWorkbenchWorkflowAction(workflowActionHandlers, project, changeId, request, live);
}

const workflowActionHandlers = buildWorkbenchActionHandlers({
  postTopicMessage,
  findRunningRunForChange,
  continueTopicGoal: async (project, changeId, prompt, live) => runCodexChat(
    project,
    changeId,
    prompt?.trim() || "Continue the current accepted objective from the latest project evidence.",
    live,
    { goalMode: "start-or-resume" },
  ),
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
  if (mode !== "chat" && mode !== "plan") throw new Error("Message mode must be chat or plan.");
  if (mode === "plan" && typeof input !== "string" && input.planHandoffIntent) throw new Error("Plan handoff intent must use chat mode.");
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
