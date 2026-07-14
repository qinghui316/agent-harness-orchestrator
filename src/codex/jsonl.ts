export function extractFinalMessageFromCodexJsonl(output: string): string | null {
  const messages: string[] = [];
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const message = extractMessage(event);
      if (message) messages.push(message);
    } catch {
      // Codex may emit non-JSON diagnostic lines; keep them in raw artifacts only.
    }
  }
  return messages.length > 0 ? messages.join("\n\n") : null;
}

export type CodexJsonlStreamEvent =
  | { type: "status"; label: string; raw?: unknown }
  | { type: "turn_completed"; usage?: Record<string, unknown>; raw?: unknown }
  | { type: "text_delta"; delta: string; raw?: unknown }
  | { type: "tool_event"; phase: "started" | "updated" | "completed"; status: "processing" | "completed" | "failed"; id?: string; name?: string; command?: string; output?: string; exitCode?: number; isError?: boolean; raw?: unknown }
  | { type: "readable_event"; event: CodexReadableEvent; raw?: unknown }
  | { type: "usage"; usage: Record<string, unknown>; raw?: unknown }
  | { type: "error"; message: string; raw?: unknown }
  | { type: "raw"; line: string };

export type CodexReadableEventKind =
  | "status"
  | "reasoning-summary"
  | "command"
  | "file-change"
  | "mcp-tool"
  | "web-search"
  | "plan-update"
  | "tool-result"
  | "usage"
  | "error";

export interface CodexReadableEvent {
  itemId?: string;
  kind: CodexReadableEventKind;
  phase?: string;
  status?: "processing" | "completed" | "failed";
  title?: string;
  summary?: string;
  preview?: string;
  artifactRef?: string;
  command?: string;
  cwd?: string;
  exitCode?: number;
  isError?: boolean;
  truncated?: boolean;
}

export interface CodexJsonlStreamParser {
  feed(chunk: string): void;
  flush(): void;
}

export const readablePreviewMaxBytes = 2 * 1024;
export const readablePreviewMaxLines = 80;

export function createCodexJsonlStreamParser(onEvent: (event: CodexJsonlStreamEvent) => void): CodexJsonlStreamParser {
  let buffer = "";
  let previousAgentMessage = false;
  let previousAgentMessageEndedWithNewline = false;
  let errorEmitted = false;
  const toolIds = new Set<string>();

  function feed(chunk: string): void {
    buffer += chunk;
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (line) handleLine(line);
      newlineIndex = buffer.indexOf("\n");
    }
  }

  function flush(): void {
    const line = buffer.trim();
    buffer = "";
    if (line) handleLine(line);
  }

  function handleLine(line: string): void {
    let event: unknown;
    try {
      event = JSON.parse(line) as unknown;
    } catch {
      onEvent({ type: "raw", line });
      return;
    }
    if (!isRecord(event)) {
      onEvent({ type: "raw", line });
      return;
    }
    if (event.type === "error") {
      emitError(errorMessage(event.message ?? event.error, "Codex error"), event);
      return;
    }
    if (event.type === "turn.failed") {
      emitError(errorMessage(event.error ?? event.message, "Codex turn failed"), event);
      return;
    }
    if (event.type === "thread.started") {
      onEvent({ type: "status", label: "initializing", raw: event });
      return;
    }
    if (event.type === "turn.started") {
      previousAgentMessage = false;
      previousAgentMessageEndedWithNewline = false;
      onEvent({ type: "status", label: "running", raw: event });
      return;
    }
    if (event.type === "turn.completed") {
      if (isRecord(event.usage)) onEvent({ type: "usage", usage: event.usage, raw: event });
      onEvent({ type: "turn_completed", usage: isRecord(event.usage) ? event.usage : undefined, raw: event });
      return;
    }
    if ((event.type === "item.started" || event.type === "item.completed") && isRecord(event.item)) {
      const item = event.item;
      const parsed = readableEventFromItem(event.type, item);
      if (parsed) onEvent({ type: "readable_event", event: parsed, raw: event });
      if (normalizeItemType(item.type) === "commandexecution") {
        const id = typeof item.id === "string" ? item.id : undefined;
        const exitCode = numberField(item, "exit_code", "exitCode");
        const commandStatus = event.type === "item.started"
          ? "processing"
          : exitCode !== undefined
            ? exitCode === 0 ? "completed" : "failed"
            : item.status === "failed" ? "failed" : "completed";
        if (event.type === "item.started" && id && toolIds.has(id)) return;
        if (id) toolIds.add(id);
        previousAgentMessage = false;
        previousAgentMessageEndedWithNewline = false;
        onEvent({
          type: "tool_event",
          phase: event.type === "item.started" ? "started" : "completed",
          status: commandStatus,
          id,
          name: "Bash",
          command: typeof item.command === "string" ? item.command : undefined,
          output: stringField(item, "aggregated_output", "aggregatedOutput", "output"),
          exitCode,
          isError: exitCode !== undefined ? exitCode !== 0 : item.status === "failed",
          raw: event,
        });
        return;
      }
      if (event.type === "item.completed" && normalizeItemType(item.type) === "agentmessage" && typeof item.text === "string" && item.text.length > 0) {
        const text = item.text;
        const boundary = previousAgentMessage && !previousAgentMessageEndedWithNewline && !text.startsWith("\n") ? "\n" : "";
        onEvent({ type: "text_delta", delta: `${boundary}${text}`, raw: event });
        previousAgentMessage = true;
        previousAgentMessageEndedWithNewline = text.endsWith("\n");
        return;
      }
    }
    const message = extractMessage(event);
    if (message) {
      onEvent({ type: "text_delta", delta: message, raw: event });
      return;
    }
    onEvent({ type: "raw", line });
  }

  function emitError(message: string, raw: unknown): void {
    if (errorEmitted) return;
    errorEmitted = true;
    onEvent({ type: "error", message, raw });
  }

  return { feed, flush };
}

export function truncateReadablePreview(text: string | undefined): { preview?: string; truncated?: boolean } {
  if (!text) return {};
  const lines = text.split(/\r?\n/);
  let next = lines.slice(0, readablePreviewMaxLines).join("\n");
  let truncated = lines.length > readablePreviewMaxLines;
  while (Buffer.byteLength(next, "utf8") > readablePreviewMaxBytes) {
    next = next.slice(0, Math.max(0, next.length - 128));
    truncated = true;
  }
  if (truncated && next.length > 0) next = `${next.replace(/\s+$/u, "")}\n[truncated; see raw log]`;
  return { preview: next, truncated };
}

export function readableEventFromItem(eventType: unknown, item: Record<string, unknown>): CodexReadableEvent | null {
  const itemType = normalizeItemType(item.type);
  const itemId = typeof item.id === "string" ? item.id : undefined;
  const phase = eventType === "item.started" ? "started" : "completed";
  if (itemType === "commandexecution") {
    const output = stringField(item, "aggregated_output", "aggregatedOutput", "output");
    const exitCode = numberField(item, "exit_code", "exitCode");
    const status = phase === "started"
      ? "processing"
      : exitCode !== undefined
        ? exitCode === 0 ? "completed" : "failed"
        : item.status === "failed" ? "failed" : "completed";
    const preview = truncateReadablePreview(output);
    return {
      itemId,
      kind: "command",
      phase,
      status,
      title: phase === "started" ? "Command started" : exitCode === undefined || exitCode === 0 ? "Command completed" : "Command failed",
      summary: stringField(item, "command") ?? "Command execution",
      preview: preview.preview,
      truncated: preview.truncated,
      command: stringField(item, "command"),
      cwd: stringField(item, "cwd"),
      exitCode,
      isError: exitCode !== undefined ? exitCode !== 0 : item.status === "failed",
    };
  }
  if (itemType === "filechange") {
    const changes = Array.isArray(item.changes) ? item.changes.filter(isRecord) : [];
    const firstPath = changes.map((change) => stringField(change, "path")).find(Boolean) ?? stringField(item, "path", "file_path", "filePath");
    const kinds = Array.from(new Set(changes.map((change) => stringField(change, "kind")).filter((value): value is string => Boolean(value))));
    const diff = changes.map((change) => stringField(change, "diff")).filter((value): value is string => Boolean(value)).join("\n\n");
    const preview = truncateReadablePreview(diff);
    return {
      itemId,
      kind: "file-change",
      phase,
      title: "File change",
      summary: [firstPath, kinds.join(", "), changes.length > 1 ? `${changes.length} files` : ""].filter(Boolean).join(" · "),
      preview: preview.preview,
      truncated: preview.truncated,
    };
  }
  if (itemType === "mcptoolcall" || itemType === "dynamictoolcall" || itemType === "collabtoolcall") {
    const result = stringOrJson(item.result ?? item.error ?? item.contentItems);
    const preview = truncateReadablePreview(result);
    const tool = stringField(item, "tool", "name") ?? "tool";
    return {
      itemId,
      kind: "mcp-tool",
      phase: stringField(item, "status") ?? phase,
      title: stringField(item, "server") ? `${item.server}/${tool}` : tool,
      summary: stringOrJson(item.arguments ?? item.input),
      preview: preview.preview,
      truncated: preview.truncated,
      isError: Boolean(item.error) || item.status === "failed",
    };
  }
  if (itemType === "websearch") {
    const action = isRecord(item.action) ? item.action : undefined;
    return {
      itemId,
      kind: "web-search",
      phase: stringField(action ?? item, "type") ?? phase,
      title: "Web search",
      summary: stringField(item, "query") ?? stringOrJson(action),
    };
  }
  if (itemType === "plan" || itemType === "planupdate") {
    const text = stringField(item, "text", "summary", "content");
    const preview = truncateReadablePreview(text);
    return {
      itemId,
      kind: "plan-update",
      phase,
      title: "Plan update",
      summary: preview.preview ? undefined : "Plan updated.",
      preview: preview.preview,
      truncated: preview.truncated,
    };
  }
  if (itemType === "reasoning") {
    const summary = reasoningSummary(item);
    if (!summary) return null;
    const preview = truncateReadablePreview(summary);
    return {
      itemId,
      kind: "reasoning-summary",
      phase,
      title: "Reasoning summary",
      preview: preview.preview,
      truncated: preview.truncated,
    };
  }
  if (itemType === "toolresult") {
    const content = stringField(item, "content", "result") ?? stringOrJson(item);
    const preview = truncateReadablePreview(content);
    return {
      itemId,
      kind: "tool-result",
      phase,
      title: "Tool result",
      preview: preview.preview,
      truncated: preview.truncated,
      isError: Boolean(item.isError) || item.status === "failed",
    };
  }
  return null;
}

export function extractCodexSessionIdFromJsonl(output: string): string | null {
  for (const line of output.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const event = JSON.parse(line) as Record<string, unknown>;
      const sessionId = extractSessionId(event);
      if (sessionId) return sessionId;
    } catch {
      // Codex may emit non-JSON diagnostic lines; keep them in raw artifacts only.
    }
  }
  return null;
}

function extractSessionId(event: Record<string, unknown>): string | null {
  for (const key of ["session_id", "sessionId", "conversation_id", "conversationId", "thread_id", "threadId"]) {
    if (typeof event[key] === "string" && event[key]) return event[key] as string;
  }
  if (isRecord(event.session)) {
    for (const key of ["id", "session_id", "sessionId"]) {
      if (typeof event.session[key] === "string" && event.session[key]) return event.session[key] as string;
    }
  }
  if (isRecord(event.conversation) && typeof event.conversation.id === "string" && event.conversation.id) {
    return event.conversation.id;
  }
  return null;
}

function extractMessage(event: Record<string, unknown>): string | null {
  if (event.type === "item.completed" && isRecord(event.item)) {
    const item = event.item;
    if (normalizeItemType(item.type) === "agentmessage" && typeof item.text === "string") return item.text;
  }

  if (event.type === "message") {
    if (typeof event.content === "string") return event.content;
    if (Array.isArray(event.content)) {
      const parts = event.content
        .filter(isRecord)
        .filter((part) => part.type === "text" && typeof part.text === "string")
        .map((part) => part.text as string);
      if (parts.length > 0) return parts.join("");
    }
  }

  if (event.type === "output_text" && typeof event.text === "string") return event.text;
  if (event.type === "agent_message" && typeof event.text === "string") return event.text;

  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeItemType(value: unknown): string {
  return typeof value === "string" ? value.replace(/[_\-/]/g, "").toLowerCase() : "";
}

function stringField(object: Record<string, unknown> | undefined, ...keys: string[]): string | undefined {
  if (!object) return undefined;
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "string" && value) return value;
  }
  return undefined;
}

function numberField(object: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = object[key];
    if (typeof value === "number") return value;
  }
  return undefined;
}

function stringOrJson(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function reasoningSummary(item: Record<string, unknown>): string | undefined {
  const summary = item.summary;
  if (typeof summary === "string") return summary;
  if (Array.isArray(summary)) {
    const parts = summary
      .map((part) => {
        if (typeof part === "string") return part;
        if (isRecord(part)) return stringField(part, "text", "summary");
        return undefined;
      })
      .filter((part): part is string => Boolean(part));
    if (parts.length > 0) return parts.join("\n");
  }
  return stringField(item, "summary_text", "summaryText", "thinking_summary", "thinkingSummary");
}

function errorMessage(value: unknown, fallback: string): string {
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (isRecord(parsed)) return errorMessage(parsed, value);
    } catch {
      return value;
    }
    return value;
  }
  if (isRecord(value)) {
    if (typeof value.detail === "string" && value.detail) return value.detail;
    if (typeof value.message === "string" && value.message) return errorMessage(value.message, value.message);
    if (typeof value.error === "string" && value.error) return value.error;
    if (value.error) return errorMessage(value.error, fallback);
  }
  return fallback;
}
