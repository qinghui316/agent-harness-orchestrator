import type { ManagedProject } from "../../types/index.js";
import type {
  AssistantTurnActivity,
  AssistantTurnBlock,
  TopicThreadEntry,
  WorkbenchLiveSink,
  WorkbenchWorkflowActionRequest,
  WorkbenchWorkflowActionResult,
} from "../types.js";
import type { ChildTranscriptCapture } from "../live-transcript.js";
import { isMainAgentExecutionStopAction } from "../../workflow-actions/main-agent-execution.js";
import type { ConversationTimelineWriter } from "../conversation-thread.js";
import { agentThreadSurfaceId } from "../../provider-runtime/agent-surface-id.js";

interface AssistantTranscriptCapture {
  sink: WorkbenchLiveSink;
  text: string;
  activity: AssistantTurnActivity[];
  blocks: AssistantTurnBlock[];
  childCaptures: Map<string, ChildTranscriptCapture>;
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
  createTranscriptCapture(
    live: WorkbenchLiveSink | undefined,
    persistBeforeEmit?: (capture: AssistantTranscriptCapture) => boolean,
  ): AssistantTranscriptCapture;
  openTimelineWriter(project: ManagedProject, changeId: string, live?: WorkbenchLiveSink): Promise<ConversationTimelineWriter>;
  readThreadEntries(project: ManagedProject, changeId: string): Promise<TopicThreadEntry[]>;
  execute(project: ManagedProject, changeId: string, request: WorkbenchWorkflowActionRequest, live?: WorkbenchLiveSink): Promise<unknown>;
  labelForAction(actionType: WorkbenchWorkflowActionRequest["actionType"]): string;
  extractRunId(result: unknown): string | undefined;
  failureMessage(actionType: WorkbenchWorkflowActionRequest["actionType"], result: unknown): string | null;
  summarizeResult(actionType: WorkbenchWorkflowActionRequest["actionType"], result: unknown): string;
  artifactForResult(result: unknown): string | null;
  targetId(request: WorkbenchWorkflowActionRequest, changeId: string, result?: unknown): string;
  scopePayload(request: WorkbenchWorkflowActionRequest, changeId: string, result?: unknown): Record<string, unknown>;
  recordDecision(project: ManagedProject, input: WorkbenchActionDecisionInput): Promise<void>;
  resumeGoalAfterAction?(input: {
    project: ManagedProject;
    changeId: string;
    actionRunId: string;
    actionType: WorkbenchWorkflowActionRequest["actionType"];
    status: "completed" | "failed";
    result: unknown;
  }): Promise<void>;
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
  const writer = await deps.openTimelineWriter(project, changeId, live);
  const timelineId = `workflow:${actionRunId}`;
  const startedAt = new Date().toISOString();
  let canonicalPersistenceError: Error | null = null;
  try {
    writer.upsert({
      id: timelineId,
      type: "workflow.started",
      timestamp: startedAt,
      changeId,
      actionRunId,
      actionType: request.actionType,
      status: "running",
    });
  } catch (error) {
    writer.close();
    throw error;
  }
  live?.emit({ event: "run.status", data: { actionRunId, status: "running", label: deps.labelForAction(request.actionType) } });
  let capture: AssistantTranscriptCapture;
  try {
    capture = deps.createTranscriptCapture(live, (snapshot) => {
      try {
        persistActionCapture(writer, {
          timelineId,
          startedAt,
          changeId,
          actionRunId,
          actionType: request.actionType,
          capture: snapshot,
        });
        return true;
      } catch (error) {
        canonicalPersistenceError = error instanceof Error ? error : new Error(String(error));
        return false;
      }
    });
  } catch (error) {
    writer.close();
    throw error;
  }
  try {
    capture.sink.emit({ event: "run.status", data: { actionRunId, status: "running", label: deps.labelForAction(request.actionType) } });
    const result = await deps.execute(project, changeId, request, capture.sink);
    if (canonicalPersistenceError) throw canonicalPersistenceError;
    const runId = deps.extractRunId(result);
    const failureMessage = deps.failureMessage(request.actionType, result);
    const finalStatus = failureMessage ? "failed" : "completed";
    const resultSummary = failureMessage ?? deps.summarizeResult(request.actionType, result);
    capture.sink.emit({ event: "run.status", data: { runId, actionRunId, status: finalStatus, label: deps.labelForAction(request.actionType) } });
    if (canonicalPersistenceError) throw canonicalPersistenceError;
    persistActionCapture(writer, {
      timelineId,
      startedAt,
      changeId,
      actionRunId,
      actionType: request.actionType,
      capture,
      statusOverride: finalStatus,
    });
    writer.upsert({
      id: timelineId,
      type: failureMessage ? "workflow.failed" : "workflow.completed",
      timestamp: startedAt,
      changeId,
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
    await resumeGoalAfterAction(deps, capture, {
      project,
      changeId,
      actionRunId,
      actionType: request.actionType,
      status: finalStatus,
      result,
    });
    return { actionRunId, actionType: request.actionType, status: finalStatus, result, runId, error: failureMessage ?? undefined };
  } catch (error) {
    if (canonicalPersistenceError) throw canonicalPersistenceError;
    const message = error instanceof Error ? error.message : String(error);
    const resultSummary = `${deps.labelForAction(request.actionType)}执行失败。请查看错误和证据后再决定是否重试或调整。`;
    capture.sink.emit({ event: "run.status", data: { actionRunId, status: "failed", label: deps.labelForAction(request.actionType) } });
    if (canonicalPersistenceError) throw canonicalPersistenceError;
    persistActionCapture(writer, {
      timelineId,
      startedAt,
      changeId,
      actionRunId,
      actionType: request.actionType,
      capture,
      statusOverride: "failed",
    });
    writer.upsert({
      id: timelineId,
      type: "workflow.failed",
      timestamp: startedAt,
      changeId,
      actionRunId,
      actionType: request.actionType,
      status: "failed",
      error: message,
      resultSummary,
      text: capture.text.trim() || undefined,
      activity: capture.activity,
      blocks: capture.blocks,
    });
    live?.emit({ event: "error", data: { message, actionRunId } });
    await resumeGoalAfterAction(deps, capture, {
      project,
      changeId,
      actionRunId,
      actionType: request.actionType,
      status: "failed",
      result: { error: message },
    });
    return { actionRunId, actionType: request.actionType, status: "failed", error: message };
  } finally {
    writer.close();
  }
}

function persistActionCapture(
  writer: ConversationTimelineWriter,
  input: {
    timelineId: string;
    startedAt: string;
    changeId: string;
    actionRunId: string;
    actionType: WorkbenchWorkflowActionRequest["actionType"];
    capture: AssistantTranscriptCapture;
    statusOverride?: "running" | "completed" | "failed";
  },
): void {
  const status = input.statusOverride ?? actionCaptureStatus(input.capture);
  writer.upsert({
    id: input.timelineId,
    type: status === "failed" ? "workflow.failed" : status === "completed" ? "workflow.completed" : "workflow.started",
    timestamp: input.startedAt,
    changeId: input.changeId,
    actionRunId: input.actionRunId,
    actionType: input.actionType,
    status,
    text: input.capture.text.trim() || undefined,
    activity: input.capture.activity,
    blocks: input.capture.blocks,
  });
  const childCaptures = [...input.capture.childCaptures.values()]
    .filter((child) => child.blocks.length > 0 || child.activity.length > 0)
    .sort((left, right) => childCaptureTimestamp(left).localeCompare(childCaptureTimestamp(right)));
  for (const child of childCaptures) {
    if (!child.canonicalId || !child.providerId || !child.threadId || !child.turnId) continue;
    writer.upsert({
      id: `assistant:${input.actionRunId}:${child.canonicalId}:process`,
      type: "assistant.message",
      timestamp: childCaptureTimestamp(child) || input.startedAt,
      changeId: input.changeId,
      actionRunId: input.actionRunId,
      status: childCaptureStatus(child, status === "failed" ? "failed" : "completed"),
      runId: child.runId ?? input.actionRunId,
      agentSurfaceId: agentThreadSurfaceId(child.providerId, child.threadId),
      threadId: child.threadId,
      parentThreadId: child.parentThreadId,
      turnId: child.turnId,
      agentRoleId: child.roleId,
      activity: child.activity,
      blocks: child.blocks,
    });
  }
}

function actionCaptureStatus(capture: AssistantTranscriptCapture): "running" | "completed" | "failed" {
  const terminal = [...capture.activity].reverse().find((activity) => activity.kind === "status");
  if (terminal?.kind !== "status") return "running";
  if (terminal.label === "completed") return "completed";
  if (terminal.label === "failed" || terminal.label === "blocked") return "failed";
  return "running";
}

function childCaptureTimestamp(capture: ChildTranscriptCapture): string {
  return capture.blocks[0]?.timestamp ?? capture.activity[0]?.timestamp ?? "";
}

function childCaptureStatus(capture: ChildTranscriptCapture, fallbackStatus: "completed" | "failed"): string {
  const terminal = [...capture.activity].reverse().find((activity) => activity.kind === "status");
  if (terminal?.kind !== "status") return fallbackStatus;
  if (terminal.label === "completed") return "completed";
  if (terminal.label === "failed" || terminal.label === "blocked") return "failed";
  return fallbackStatus;
}

async function resumeGoalAfterAction(
  deps: WorkbenchActionServiceDeps,
  capture: AssistantTranscriptCapture,
  input: Parameters<NonNullable<WorkbenchActionServiceDeps["resumeGoalAfterAction"]>>[0],
): Promise<void> {
  if (!deps.resumeGoalAfterAction || !shouldResumeGoalAfterAction(input.actionType)) return;
  try {
    await deps.resumeGoalAfterAction(input);
  } catch (error) {
    capture.sink.emit({
      event: "error",
      data: { message: `Workflow action finished, but native Goal resume failed: ${error instanceof Error ? error.message : String(error)}` },
    });
  }
}

function shouldResumeGoalAfterAction(actionType: WorkbenchWorkflowActionRequest["actionType"]): boolean {
  return actionType !== "chat.ask"
    && actionType !== "conversation.steer"
    && actionType !== "conversation.interrupt"
    && actionType !== "conversation.continue"
    && !isMainAgentExecutionStopAction(actionType);
}

function isConcurrentControlAction(actionType: WorkbenchWorkflowActionRequest["actionType"]): boolean {
  return actionType === "conversation.steer" || actionType === "conversation.interrupt" || isMainAgentExecutionStopAction(actionType);
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
