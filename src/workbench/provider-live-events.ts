import type { ProviderRealtimeEvent } from "../provider-runtime/index.js";
import { agentThreadSurfaceId } from "../provider-runtime/agent-surface-id.js";
import type { WorkbenchAssistantEvent, WorkbenchLiveIdentity, WorkbenchLiveSink, WorkbenchLiveToolEvent } from "./types.js";

export function forwardProviderRealtimeEvent(
  realtime: ProviderRealtimeEvent,
  sink: WorkbenchLiveSink | undefined,
  context: Partial<WorkbenchLiveIdentity> = {},
): void {
  if (!sink) return;
  const identity = { ...workbenchIdentity(realtime), ...context };
  const stream = realtime.streamEvent;
  if (stream.type === "status") {
    sink.emit({ event: "run.status", data: { ...identity, status: stream.label, label: statusLabel(stream.label) } });
    return;
  }
  if (stream.type === "text_delta") {
    sink.emit({ event: "assistant.delta", data: { ...identity, delta: stream.delta } });
    return;
  }
  if (stream.type === "tool_event") {
    const tool: WorkbenchLiveToolEvent = {
      ...identity,
      runId: realtime.runId,
      itemId: stream.id,
      phase: stream.phase,
      name: stream.name,
      command: stream.command,
      outputTail: stream.output,
      exitCode: stream.exitCode,
      isError: stream.isError,
      status: stream.status,
    };
    sink.emit({ event: "tool.event", data: tool });
    return;
  }
  if (stream.type === "readable_event") {
    const readable: WorkbenchAssistantEvent = {
      ...stream.event,
      ...identity,
      runId: realtime.runId,
      itemId: stream.event.itemId,
      timestamp: new Date().toISOString(),
    };
    sink.emit({ event: "assistant.event", data: readable });
    return;
  }
  if (stream.type === "usage") {
    sink.emit({ event: "usage", data: { ...identity, usage: stream.usage } });
    return;
  }
  if (stream.type === "turn_completed") {
    if (stream.usage) sink.emit({ event: "usage", data: { ...identity, usage: stream.usage } });
    sink.emit({ event: "run.status", data: { ...identity, status: "completed" } });
    return;
  }
  if (stream.type === "error") {
    sink.emit({ event: "error", data: { ...identity, runId: realtime.runId, message: stream.message } });
    sink.emit({ event: "run.status", data: { ...identity, status: "failed", label: "需要处理" } });
  }
}

function workbenchIdentity(event: ProviderRealtimeEvent): WorkbenchLiveIdentity & { runId: string } {
  return {
    projectId: event.projectId,
    conversationId: event.conversationId,
    changeId: event.changeId,
    runId: event.runId,
    providerId: event.providerId,
    attemptId: event.attemptId,
    sessionId: event.sessionId,
    threadId: event.threadId,
    parentThreadId: event.parentThreadId,
    turnId: event.turnId,
    itemId: event.itemId,
    agentRoleId: event.roleId,
    agentTaskId: event.agentTaskId,
    agentSurfaceId: agentThreadSurfaceId(event.providerId, event.threadId),
    agentDisplayName: event.displayName,
    targetAgentSurfaceId: event.targetAgentSurfaceId,
    targetAgentDisplayName: event.targetAgentDisplayName,
  };
}

function statusLabel(status: string): string {
  if (status === "thinking") return "正在思考";
  if (status === "replying") return "正在回复";
  if (status === "waiting-user") return "等待你回答";
  return status;
}
