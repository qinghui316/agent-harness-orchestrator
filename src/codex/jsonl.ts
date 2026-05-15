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
    if (item.type === "agent_message" && typeof item.text === "string") return item.text;
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
