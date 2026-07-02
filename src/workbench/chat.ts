import { existsSync } from "node:fs";
import { join } from "node:path";
import { getActiveCodexAppServerTurn } from "../codex/app-server.js";
import { createConcurrentChange } from "../change/manager.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { listRuns } from "../run/manager.js";
import type { ManagedProject, ResolvedMemory, RunMetadata } from "../types/index.js";
import { postTopicPlanMessage, runCodexChat } from "./codex-chat/bridge.js";
import { runWorkbenchWorkflowActionService } from "./actions/service.js";
import { artifactForActionResult, extractRunId, labelForAction, summarizeActionResult, workflowFailureMessage } from "./actions/results.js";
import { assertWorkflowActionScope, auditHighImpactWorkflowAction, workflowActionScopePayload, workflowActionTargetId } from "./actions/boundary.js";
import { dispatchWorkbenchWorkflowAction } from "./actions/dispatcher.js";
import { buildWorkbenchActionHandlers } from "./actions/handlers/index.js";
import { generatePlanningDraft } from "./actions/handlers/planning.js";
import { recordWorkbenchDecision } from "./decisions.js";
import { emitAssistantEvent } from "./live-events.js";
import { stripAccidentalPlanningDraftFromMainAgentText } from "./main-agent-visible-text.js";
import { resolveTopicAttachments } from "./attachments.js";
import { resolveTopicFileReferences } from "./file-references.js";
import { createAssistantTranscriptCapture } from "./live-transcript.js";
import { getSingleActiveChangeId, resolveTopic } from "./topic-resolver.js";
import { appendTopicThreadEntry } from "./topic-thread.js";
import { collectAllTopicThreadEntries, readTopicThreadLog as readThreadLog } from "./thread-log.js";
import type {
  AssistantTurnBlock,
  TopicAttachment,
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
export type {
  AssistantTurnActivity,
  AssistantTurnBlock,
  AssistantTurnBlockKind,
  OrchestrationPlanCard,
  PlanningArtifactBundle,
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

export function buildInitialMainAgentPrompt(userMessage: string): string {
  return [
    "这是 AHO 需求对话的第一轮主 Agent 回复。",
    "你在主对话中直接回复用户，语气像一个正常开发助理。",
    "用 2-4 句话说明：你理解的用户目标；当前不会修改文件或启动实现；下一步是先确认真实需求和验收方式，或等待用户确认后再进入规划。",
    "不要使用项目内部对象名、英文阶段名、技术状态码或实现细节术语。",
    "不要说已经启动任何子 Agent、规划角色、编码角色、验证角色或审查角色。",
    "不要生成方案草案、任务清单或验收标准；不要执行代码；不要声称已经获得确认。",
    "如果用户明确要求你解释内部机制，才可以使用内部术语。",
    "",
    "用户原始需求：",
    userMessage,
  ].join("\n");
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

export async function runInitialPlanningAgentDelegationIfNeeded(
  project: ManagedProject,
  changeId: string,
  userMessage: string,
  live?: WorkbenchLiveSink,
): Promise<boolean> {
  if (!shouldAutoDelegateInitialPlanningAgent(userMessage)) return false;
  const { memory, changePath } = await resolveTopic(project, changeId);
  const thread = await readThreadLog(memory, changePath);
  const alreadyDelegated = thread.some((entry) =>
    entry.agentRoleId === "planning-agent"
    || entry.actionType === "planning.generate"
    || entry.status === "main-agent-delegated-planning-agent"
  );
  if (alreadyDelegated) return false;
  const delegation = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "main-agent-delegated-planning-agent",
    text: "我会让 planning-agent 根据刚才确认的目标整理一份可审阅方案；方案在右侧 Agent 工作区中完善，确认实施前不会进入代码执行。",
    blocks: [{
      id: `main-agent:${changeId}:delegate-planning-agent`,
      sequence: 1,
      kind: "status",
      timestamp: new Date().toISOString(),
      source: "aho",
      status: "agent-task-created",
      title: "委派 planning-agent",
      text: "主 Agent 已委派 planning-agent 整理可审阅方案。",
    }],
  });
  live?.emit({ event: "assistant.message", data: delegation });
  await generatePlanningDraft(project, changeId, undefined, live, false);
  return true;
}

export function shouldAutoDelegateInitialPlanningAgent(userMessage: string): boolean {
  const text = userMessage.trim();
  if (!text) return false;
  if (/(不要|别|先不|暂不).{0,12}(生成|写|创建|整理|输出).{0,8}(方案|计划|规划|清单|任务)/i.test(text)) return false;
  if (/(不要|别|先不|暂不).{0,12}(planning-agent|规划|计划)/i.test(text)) return false;
  if (/(只|仅).{0,8}(回复|确认|理解|说明|解释)/i.test(text) && /(不要|别|不需要).{0,12}(方案|计划|规划|清单)/i.test(text)) return false;
  return true;
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
  const topicState = await getTopicLifecycleState(project, changeId);
  const runningRun = await findRunningRunForChange(project, changeId);
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
  const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: parsed.message, contextRefs: parsed.contextRefs, attachments: parsed.attachments });
  live?.emit({ event: "topic.message", data: user });
  const capture = createAssistantTranscriptCapture(live);
  const chat = await runCodexChat(project, changeId, parsed.message, capture.sink, { attachments: parsed.attachments });
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
  });
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
});

async function normalizeTopicMessageInput(project: ManagedProject, input: string | TopicMessageInput): Promise<Required<Pick<TopicMessageInput, "mode" | "message">> & { contextRefs?: TopicMessageInput["contextRefs"]; attachments?: TopicAttachment[] }> {
  const mode = typeof input === "string" ? "chat" : input.mode ?? "chat";
  const message = typeof input === "string" ? input : input.message ?? input.text ?? "";
  if (mode !== "chat" && mode !== "plan") throw new Error("Message mode must be chat or plan.");
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
