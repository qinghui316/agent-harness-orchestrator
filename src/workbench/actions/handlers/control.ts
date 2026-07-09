import { getActiveCodexAppServerTurn } from "../../../codex/app-server.js";
import { requestRunStop } from "../../../run/control.js";
import type { ManagedProject, RunMetadata } from "../../../types/index.js";
import { emitAssistantEvent } from "../../live-events.js";
import { appendTopicThreadEntry } from "../../topic-thread.js";
import type { WorkbenchLiveSink } from "../../types.js";

export interface ConversationControlDeps {
  findRunningRunForChange(project: ManagedProject, changeId: string): Promise<RunMetadata | null>;
}

export async function stopRunningPipeline(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  deps: ConversationControlDeps,
): Promise<unknown> {
  const runningRun = await deps.findRunningRunForChange(project, changeId);
  if (!runningRun) {
    const message = prompt?.trim()
      ? "当前执行已经结束，这条输入会作为完成后的修改反馈处理。"
      : "当前没有正在执行的本地 run。";
    const assistant = await appendTopicThreadEntry(project, changeId, { type: "assistant.message", status: "stop-not-needed", text: message });
    live?.emit({ event: "assistant.message", data: assistant });
    return { status: "already-completed", message };
  }
  requestRunStop(runningRun.id, prompt?.trim() || "User requested stop from the main conversation.");
  const user = prompt?.trim()
    ? await appendTopicThreadEntry(project, changeId, { type: "user.message", text: prompt.trim(), status: "stop-and-continue", runId: runningRun.id })
    : null;
  if (user) live?.emit({ event: "topic.message", data: user });
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "stop-requested",
    runId: runningRun.id,
    text: "已请求停止当前本地执行。停止证据会保留，随后会基于你的新指令进入下一轮方案或修改。",
  });
  live?.emit({ event: "assistant.message", data: assistant });
  emitAssistantEvent(live, {
    runId: runningRun.id,
    kind: "status",
    phase: "stopping",
    title: "Stop requested",
    summary: "AHO requested local runner termination; this is not Codex app-server resume.",
  });
  return { status: "stop-requested", runId: runningRun.id };
}

export async function steerConversation(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  deps: ConversationControlDeps,
): Promise<unknown> {
  const message = prompt?.trim();
  if (!message) throw new Error("conversation.steer requires prompt.");
  const activeTurn = getActiveCodexAppServerTurn(changeId);
  if (!activeTurn) {
    const runningRun = await deps.findRunningRunForChange(project, changeId);
    const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: message, status: "pending-feedback", runId: runningRun?.id });
    live?.emit({ event: "topic.message", data: user });
    const assistant = await appendTopicThreadEntry(project, changeId, {
      type: "assistant.message",
      status: "pending-feedback",
      runId: runningRun?.id,
      text: "当前运行时不支持实时引导，已记录，将在下一轮生效。",
    });
    live?.emit({ event: "assistant.message", data: assistant });
    return { status: "pending-feedback", realtime: false };
  }
  const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: message, status: "steering-sent", runId: activeTurn.runId });
  live?.emit({ event: "topic.message", data: user });
  await activeTurn.steer(message);
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "steering-sent",
    runId: activeTurn.runId,
    text: "已发送给当前执行。",
  });
  live?.emit({ event: "assistant.message", data: assistant });
  emitAssistantEvent(live, {
    runId: activeTurn.runId,
    kind: "status",
    phase: "steered",
    title: "已发送给当前执行",
    summary: "这条输入已通过 Codex app-server 发送给当前运行中的 turn。",
  });
  return { status: "steered", realtime: true, runId: activeTurn.runId, roleId: activeTurn.roleId };
}

export async function interruptConversation(
  project: ManagedProject,
  changeId: string,
  prompt: string | undefined,
  live: WorkbenchLiveSink | undefined,
  deps: ConversationControlDeps,
): Promise<unknown> {
  const activeTurn = getActiveCodexAppServerTurn(changeId);
  if (!activeTurn) {
    return stopRunningPipeline(project, changeId, prompt, live, deps);
  }
  const message = prompt?.trim();
  if (message) {
    const user = await appendTopicThreadEntry(project, changeId, { type: "user.message", text: message, status: "interrupt-requested", runId: activeTurn.runId });
    live?.emit({ event: "topic.message", data: user });
  }
  await activeTurn.interrupt(message || "User requested interrupt from the main conversation.");
  const assistant = await appendTopicThreadEntry(project, changeId, {
    type: "assistant.message",
    status: "interrupt-requested",
    runId: activeTurn.runId,
    text: "已请求停止当前执行。停止证据会保留，你可以继续用自然语言说明下一步。",
  });
  live?.emit({ event: "assistant.message", data: assistant });
  emitAssistantEvent(live, {
    runId: activeTurn.runId,
    kind: "status",
    phase: "interrupt-requested",
    title: "已请求停止当前执行",
    summary: "AHO sent turn/interrupt to the active Codex app-server turn.",
    isError: true,
  });
  return { status: "interrupt-requested", realtime: true, runId: activeTurn.runId, roleId: activeTurn.roleId };
}
