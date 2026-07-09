import { truncateReadablePreview, type CodexJsonlStreamEvent } from "../../codex/jsonl.js";

export interface WorkflowRuntimeAssistantEvent {
  runId: string;
  kind?: string;
  phase?: string;
  title?: string;
  summary?: string;
  artifactRef?: string;
  isError?: boolean;
  [key: string]: unknown;
}

export interface WorkflowRuntimeLiveSink {
  emit(event: unknown): void;
  isClosed?(): boolean;
}

export function emitAssistantEvent(live: WorkflowRuntimeLiveSink | undefined, event: WorkflowRuntimeAssistantEvent): void {
  live?.emit({ event: "assistant.event", data: event });
}

export function emitDelegatedRoleReturn(live: WorkflowRuntimeLiveSink | undefined, changeId: string, roleId: string, status: string, summary: string, artifactRef?: string): void {
  emitAssistantEvent(live, {
    runId: changeId,
    kind: "tool-result",
    phase: `delegateTask.${status}`,
    title: `${roleId} 返回结果`,
    summary,
    artifactRef,
    isError: status !== "completed",
  });
}

export function forwardCodexStreamEvent(runId: string, event: CodexJsonlStreamEvent, live: WorkflowRuntimeLiveSink | undefined): void {
  if (!live) return;
  if (event.type === "readable_event") {
    emitAssistantEvent(live, { ...event.event, runId });
    return;
  }
  if (event.type === "text_delta") {
    live.emit({ event: "assistant.delta", data: { delta: event.delta, runId } });
    return;
  }
  if (event.type === "status") {
    live.emit({ event: "run.status", data: { runId, status: event.label } });
    return;
  }
  if (event.type === "usage") {
    live.emit({ event: "usage", data: { runId, usage: event.usage } });
    emitAssistantEvent(live, {
      runId,
      kind: "usage",
      phase: "completed",
      title: "Usage recorded",
      summary: formatUsageSummary(event.usage),
    });
    return;
  }
  if (event.type === "error") {
    live.emit({ event: "error", data: { runId, message: event.message } });
    emitAssistantEvent(live, { runId, kind: "error", phase: "failed", title: "Codex error", summary: event.message, isError: true });
    return;
  }
  if (event.type === "tool_event") {
    const preview = truncateReadablePreview(event.output);
    live.emit({
      event: "tool.event",
      data: {
        runId,
        itemId: event.id,
        phase: event.phase,
        name: event.name,
        command: event.command,
        outputTail: preview.preview,
        isError: event.isError,
      },
    });
  }
}

export function emitValidationAssistantEvents(live: WorkflowRuntimeLiveSink | undefined, runId: string, result: unknown): void {
  if (!isRecord(result) || !isRecord(result.validation)) return;
  const status = typeof result.validation.status === "string" ? result.validation.status : "unknown";
  const summary = typeof result.validation.summary === "string" ? result.validation.summary : `Validation ${status}.`;
  const artifacts = isRecord(result.validation.artifacts) ? result.validation.artifacts : {};
  const artifactRef = typeof artifacts.validation === "string" ? artifacts.validation : undefined;
  emitAssistantEvent(live, {
    runId,
    kind: status === "passed" ? "tool-result" : "error",
    phase: "validation",
    title: status === "passed" ? "Validation passed" : "Validation did not pass",
    summary,
    artifactRef,
    isError: status !== "passed",
  });
}

export function emitAuditAssistantEvent(live: WorkflowRuntimeLiveSink | undefined, runId: string, result: unknown): void {
  if (!isRecord(result) || !isRecord(result.audit)) return;
  const audit = result.audit;
  const status = typeof audit.status === "string" ? audit.status : "unknown";
  const summary = typeof audit.summary === "string" ? audit.summary : `Audit ${status}.`;
  const artifacts = isRecord(audit.artifacts) ? audit.artifacts : {};
  const artifactRef = typeof artifacts.auditMarkdown === "string" ? artifacts.auditMarkdown : typeof artifacts.audit === "string" ? artifacts.audit : undefined;
  const accepted = status === "approved" || status === "approved-with-notes";
  emitAssistantEvent(live, {
    runId,
    kind: accepted ? "tool-result" : "error",
    phase: "audit",
    title: accepted ? "Audit approved" : "Audit did not approve",
    summary,
    artifactRef,
    isError: !accepted,
  });
}

function formatUsageSummary(usage: Record<string, unknown>): string {
  const input = typeof usage.input_tokens === "number" ? usage.input_tokens : typeof usage.prompt_tokens === "number" ? usage.prompt_tokens : undefined;
  const output = typeof usage.output_tokens === "number" ? usage.output_tokens : typeof usage.completion_tokens === "number" ? usage.completion_tokens : undefined;
  if (input === undefined && output === undefined) return "Token usage recorded.";
  return `Input ${input ?? "?"}, output ${output ?? "?"} tokens.`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
