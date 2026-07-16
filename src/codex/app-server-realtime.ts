import { readableEventFromItem, type CodexJsonlStreamEvent } from "./jsonl.js";

export interface CodexAppServerRealtimeIdentity {
  projectId: string;
  conversationId?: string;
  changeId?: string;
  runId: string;
  threadId: string;
  parentThreadId?: string;
  turnId?: string;
  itemId?: string;
  roleId: string;
  agentTaskId?: string;
  displayName?: string;
  targetThreadId?: string;
  targetAgentDisplayName?: string;
}

export interface CodexAppServerRealtimeEvent extends CodexAppServerRealtimeIdentity {
  streamEvent: CodexJsonlStreamEvent;
  method: string;
}

export function normalizeCodexAppServerNotification(
  method: string,
  params: Record<string, unknown>,
  identity: CodexAppServerRealtimeIdentity,
): CodexAppServerRealtimeEvent[] {
  if (!identity.threadId || !identity.turnId) return [];
  const item = record(params.item) ?? params;
  const itemId = stringValue(item.id ?? params.itemId ?? params.item_id) ?? identity.itemId;
  const receiverThreadId = firstString(item.receiverThreadIds ?? item.receiver_thread_ids ?? item.agentThreadId ?? item.agent_thread_id);
  const scoped = {
    ...identity,
    ...(itemId ? { itemId } : {}),
    ...(receiverThreadId ? {
      targetThreadId: identity.targetThreadId ?? receiverThreadId,
      targetAgentDisplayName: identity.targetAgentDisplayName ?? "子 Agent",
    } : {}),
  };
  const normalizedMethod = method.toLowerCase();

  if (normalizedMethod === "turn/started") {
    return [event(scoped, method, { type: "status", label: "thinking", raw: params })];
  }
  if (normalizedMethod === "turn/completed") {
    const usage = record(params.usage);
    return [event(scoped, method, { type: "turn_completed", ...(usage ? { usage } : {}), raw: params })];
  }
  if (normalizedMethod === "turn/failed" || normalizedMethod === "error") {
    return [event(scoped, method, { type: "error", message: errorText(params), raw: params })];
  }
  if (normalizedMethod.includes("tokenusage") || normalizedMethod.includes("token_usage")) {
    const usage = record(params.usage) ?? params;
    return [event(scoped, method, { type: "usage", usage, raw: params })];
  }

  const assistantDelta = assistantTextDelta(normalizedMethod, params);
  if (assistantDelta) {
    if (!itemId) return [];
    return [event(scoped, method, { type: "text_delta", delta: assistantDelta, raw: params })];
  }
  const reasoningSummaryDelta = visibleReasoningSummaryDelta(normalizedMethod, params);
  if (reasoningSummaryDelta) {
    if (!itemId) return [];
    return [event(scoped, method, {
      type: "readable_event",
      event: {
        itemId,
        kind: "reasoning-summary",
        phase: "updated",
        title: "Reasoning summary",
        preview: reasoningSummaryDelta,
      },
      raw: params,
    })];
  }

  if (isItemLifecycle(normalizedMethod)) {
    if (!itemId) return [];
    const phase = normalizedMethod.endsWith("started") ? "started" : normalizedMethod.endsWith("updated") ? "updated" : "completed";
    const itemType = normalizeItemType(item.type ?? item.kind);
    const childLifecycleKind = stringValue(item.kind)?.toLowerCase();
    const lifecycleStatus = childLifecycleKind === "started"
      ? "processing"
      : phase !== "completed"
      ? "processing"
      : item.status === "failed" ? "failed" : "completed";
    if ((itemType === "collabtoolcall" || itemType === "collabagenttoolcall" || itemType === "subagentactivity") && receiverThreadId) {
      return [event(scoped, method, {
        type: "readable_event",
        event: {
          itemId,
          kind: "tool-result",
          phase,
          status: lifecycleStatus,
          title: scoped.targetAgentDisplayName ?? "Child Agent",
        },
        raw: params,
      })];
    }
    const readable = readableEventFromItem(phase === "started" ? "item.started" : "item.completed", item);
    const exitCode = numberValue(item.exitCode ?? item.exit_code);
    const commandStatus = phase !== "completed"
      ? "processing"
      : exitCode !== undefined
        ? exitCode === 0 ? "completed" : "failed"
        : item.status === "failed" ? "failed" : "completed";
    const events: CodexAppServerRealtimeEvent[] = [];
    if (readable) events.push(event(scoped, method, {
      type: "readable_event",
      event: {
        ...readable,
        ...(phase === "updated" ? { phase } : {}),
        ...(readable.kind === "command" ? { status: commandStatus } : {}),
      },
      raw: params,
    }));
    if (itemType === "commandexecution") {
      const output = stringValue(item.aggregatedOutput ?? item.aggregated_output ?? item.output);
      events.push(event(scoped, method, {
        type: "tool_event",
        phase,
        status: commandStatus,
        id: itemId,
        name: "command",
        command: stringValue(item.command),
        output,
        exitCode,
        isError: exitCode !== undefined ? exitCode !== 0 : item.status === "failed",
        raw: params,
      }));
    }
    return events;
  }

  return [];
}

function event(identity: CodexAppServerRealtimeIdentity, method: string, streamEvent: CodexJsonlStreamEvent): CodexAppServerRealtimeEvent {
  return { ...identity, method, streamEvent };
}

function assistantTextDelta(method: string, params: Record<string, unknown>): string | undefined {
  if (!method.includes("agentmessage") && !method.includes("assistant") && !method.includes("outputtext")) return undefined;
  if (!method.includes("delta")) return undefined;
  return stringValue(params.delta ?? params.text);
}

function visibleReasoningSummaryDelta(method: string, params: Record<string, unknown>): string | undefined {
  if (!method.includes("reasoning")) return undefined;
  if (!method.includes("summary")) return undefined;
  return stringValue(params.delta ?? params.text ?? params.summary);
}

function isItemLifecycle(method: string): boolean {
  return method === "item/started" || method === "item/completed" || method === "item/updated";
}

function errorText(params: Record<string, unknown>): string {
  const error = record(params.error);
  return stringValue(error?.message ?? params.message ?? params.error) ?? "Codex turn failed";
}

function normalizeItemType(value: unknown): string {
  return typeof value === "string" ? value.replace(/[_\-/]/g, "").toLowerCase() : "";
}

function record(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null ? value as Record<string, unknown> : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function firstString(value: unknown): string | undefined {
  if (typeof value === "string" && value) return value;
  if (Array.isArray(value)) return value.find((item): item is string => typeof item === "string" && Boolean(item));
  return undefined;
}
