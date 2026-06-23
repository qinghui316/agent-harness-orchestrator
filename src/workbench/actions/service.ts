import type { ManagedProject } from "../../types/index.js";
import type {
  AssistantTurnActivity,
  AssistantTurnBlock,
  TopicThreadEntry,
  WorkbenchLiveSink,
  WorkbenchWorkflowActionRequest,
  WorkbenchWorkflowActionResult,
} from "../types.js";

interface AssistantTranscriptCapture {
  sink: WorkbenchLiveSink;
  text: string;
  activity: AssistantTurnActivity[];
  blocks: AssistantTurnBlock[];
}

export interface WorkbenchActionDecisionInput {
  id: string;
  changeId: string | null;
  decisionType: string;
  status: "completed" | "failed";
  label: string;
  summary: string;
  targetId: string | null;
  runId: string | null;
  artifact: string | null;
  actionId: string | null;
  payload: unknown;
  completedAt?: string | null;
}

export interface WorkbenchActionServiceDeps {
  resolveChangeId(project: ManagedProject, request: WorkbenchWorkflowActionRequest): Promise<string>;
  createTranscriptCapture(live: WorkbenchLiveSink | undefined): AssistantTranscriptCapture;
  readThreadEntries(project: ManagedProject, changeId: string): Promise<TopicThreadEntry[]>;
  appendThreadEntry(project: ManagedProject, changeId: string, input: Omit<TopicThreadEntry, "id" | "timestamp" | "changeId">): Promise<TopicThreadEntry>;
  execute(project: ManagedProject, changeId: string, request: WorkbenchWorkflowActionRequest, live?: WorkbenchLiveSink): Promise<unknown>;
  labelForAction(actionType: WorkbenchWorkflowActionRequest["actionType"]): string;
  extractRunId(result: unknown): string | undefined;
  failureMessage(actionType: WorkbenchWorkflowActionRequest["actionType"], result: unknown): string | null;
  summarizeResult(actionType: WorkbenchWorkflowActionRequest["actionType"], result: unknown): string;
  artifactForResult(result: unknown): string | null;
  targetId(request: WorkbenchWorkflowActionRequest, changeId: string, result?: unknown): string;
  scopePayload(request: WorkbenchWorkflowActionRequest, changeId: string, result?: unknown): Record<string, unknown>;
  recordDecision(project: ManagedProject, input: WorkbenchActionDecisionInput): Promise<void>;
}

export async function runWorkbenchWorkflowActionService(
  project: ManagedProject,
  request: WorkbenchWorkflowActionRequest,
  live: WorkbenchLiveSink | undefined,
  deps: WorkbenchActionServiceDeps,
): Promise<WorkbenchWorkflowActionResult> {
  const actionRunId = `action-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const changeId = await deps.resolveChangeId(project, request);
  if (!isConcurrentControlAction(request.actionType)) {
    const active = findActiveWorkflowAction(await deps.readThreadEntries(project, changeId));
    if (active) {
      const activeLabel = active.actionType
        ? deps.labelForAction(active.actionType as WorkbenchWorkflowActionRequest["actionType"])
        : "当前动作";
      const error = new Error(`当前已有执行正在进行（${activeLabel}）。请等待完成，或先停止当前执行后再确认下一步。`);
      error.name = "Conflict";
      throw error;
    }
  }
  const started = await deps.appendThreadEntry(project, changeId, { type: "workflow.started", actionRunId, actionType: request.actionType, status: "running" });
  live?.emit({ event: "topic.message", data: started });
  live?.emit({ event: "run.status", data: { actionRunId, status: "running", label: deps.labelForAction(request.actionType) } });
  const capture = deps.createTranscriptCapture(live);
  try {
    capture.sink.emit({ event: "run.status", data: { actionRunId, status: "running", label: deps.labelForAction(request.actionType) } });
    const result = await deps.execute(project, changeId, request, capture.sink);
    const runId = deps.extractRunId(result);
    const failureMessage = deps.failureMessage(request.actionType, result);
    const finalStatus = failureMessage ? "failed" : "completed";
    const resultSummary = failureMessage ?? deps.summarizeResult(request.actionType, result);
    capture.sink.emit({ event: "run.status", data: { runId, actionRunId, status: finalStatus, label: deps.labelForAction(request.actionType) } });
    const completed = await deps.appendThreadEntry(project, changeId, {
      type: failureMessage ? "workflow.failed" : "workflow.completed",
      actionRunId,
      actionType: request.actionType,
      status: finalStatus,
      runId,
      error: failureMessage ?? undefined,
      resultSummary,
      text: capture.text.trim() || undefined,
      activity: capture.activity,
      blocks: capture.blocks,
    });
    live?.emit({ event: "topic.message", data: completed });
    if (failureMessage) live?.emit({ event: "error", data: { message: failureMessage, runId, actionRunId } });
    await deps.recordDecision(project, {
      id: `workflow:${actionRunId}`,
      changeId,
      decisionType: request.actionType,
      status: finalStatus,
      label: deps.labelForAction(request.actionType),
      summary: resultSummary,
      targetId: deps.targetId(request, changeId, result),
      runId: runId ?? null,
      artifact: deps.artifactForResult(result),
      actionId: request.actionType,
      payload: { scope: deps.scopePayload(request, changeId, result), result },
      completedAt: new Date().toISOString(),
    });
    return { actionRunId, actionType: request.actionType, status: finalStatus, result, runId, error: failureMessage ?? undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const resultSummary = `${deps.labelForAction(request.actionType)}执行失败。请查看错误和证据后再决定是否重试或调整。`;
    capture.sink.emit({ event: "run.status", data: { actionRunId, status: "failed", label: deps.labelForAction(request.actionType) } });
    const failed = await deps.appendThreadEntry(project, changeId, {
      type: "workflow.failed",
      actionRunId,
      actionType: request.actionType,
      status: "failed",
      error: message,
      resultSummary,
      text: capture.text.trim() || undefined,
      activity: capture.activity,
      blocks: capture.blocks,
    });
    live?.emit({ event: "topic.message", data: failed });
    live?.emit({ event: "error", data: { message, actionRunId } });
    return { actionRunId, actionType: request.actionType, status: "failed", error: message };
  }
}

function isConcurrentControlAction(actionType: WorkbenchWorkflowActionRequest["actionType"]): boolean {
  return actionType === "conversation.steer" || actionType === "conversation.interrupt" || actionType === "role.pipeline.stop";
}

function findActiveWorkflowAction(entries: TopicThreadEntry[]): TopicThreadEntry | null {
  const active = new Map<string, TopicThreadEntry>();
  for (const entry of entries) {
    if (!entry.actionRunId) continue;
    if (entry.type === "workflow.started") {
      active.set(entry.actionRunId, entry);
      continue;
    }
    if (entry.type === "workflow.completed" || entry.type === "workflow.failed") {
      active.delete(entry.actionRunId);
    }
  }
  return active.values().next().value ?? null;
}
