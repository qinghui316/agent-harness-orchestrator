import { agentThreadSurfaceId } from "../provider-runtime/agent-surface-id.js";
import type { StoredTopicMessageWrite } from "./persistence/contracts.js";
import type { AssistantTranscriptCapture, ChildTranscriptCapture, MainTranscriptCapture } from "./live-transcript.js";
import { toCanonicalTimelineMessage } from "./canonical-timeline-message.js";
import type { TopicThreadEntry } from "./types.js";

export function buildCanonicalCaptureWrites(input: {
  projectId: string;
  conversationId: string;
  graphScopeId: string;
  runId: string;
  providerId: string;
  attemptId: string;
  mainTimelineId: string;
  mainSessionId: string | null;
  snapshot: AssistantTranscriptCapture;
}): StoredTopicMessageWrite[] {
  const writes: StoredTopicMessageWrite[] = [];
  if (input.snapshot.mainCaptures.size === 0) {
    const lineage = [...input.snapshot.blocks].reverse().find((block) => block.kind !== "usage" && (block.threadId || block.turnId));
    const threadId = lineage?.threadId ?? input.mainSessionId ?? undefined;
    if (threadId && lineage?.turnId) {
      writes.push(toCanonicalTimelineMessage(input.projectId, input.conversationId, {
        id: input.mainTimelineId,
        type: "assistant.message",
        timestamp: input.snapshot.blocks[0]?.timestamp ?? input.snapshot.activity[0]?.timestamp ?? new Date().toISOString(),
        conversationId: input.conversationId,
        graphScopeId: input.graphScopeId,
        changeId: "",
        text: input.snapshot.text || undefined,
        status: "running",
        runId: input.runId,
        providerId: input.providerId,
        sessionId: threadId,
        attemptId: input.attemptId,
        threadId,
        turnId: lineage.turnId,
        activity: input.snapshot.activity,
        blocks: input.snapshot.blocks,
      }));
    }
  } else {
    for (const main of input.snapshot.mainCaptures.values()) {
      writes.push(toCanonicalTimelineMessage(input.projectId, input.conversationId, {
        id: `assistant:${input.conversationId}:${input.providerId}:${input.runId}:${main.canonicalId}`,
        type: "assistant.message",
        timestamp: main.blocks[0]?.timestamp ?? main.activity[0]?.timestamp ?? new Date().toISOString(),
        conversationId: input.conversationId,
        graphScopeId: input.graphScopeId,
        changeId: "",
        text: main.text || undefined,
        status: mainCaptureTimelineStatus(main),
        runId: input.runId,
        providerId: input.providerId,
        sessionId: main.threadId ?? input.mainSessionId ?? undefined,
        attemptId: input.attemptId,
        threadId: main.threadId ?? input.mainSessionId ?? undefined,
        turnId: main.turnId,
        activity: main.activity,
        blocks: main.blocks,
      }));
    }
  }
  for (const child of input.snapshot.childCaptures.values()) {
    const entry = childProcessMessage({
      conversationId: input.conversationId,
      graphScopeId: input.graphScopeId,
      runId: input.runId,
      roleId: child.roleId,
      childThreadId: child.threadId,
      parentThreadId: child.parentThreadId ?? input.mainSessionId ?? "",
      providerId: input.providerId,
      capture: child,
    });
    if (!entry) continue;
    entry.providerId = input.providerId;
    entry.sessionId = child.threadId;
    entry.attemptId = child.attemptId;
    entry.agentSurfaceId = agentThreadSurfaceId(input.providerId, child.threadId);
    entry.status = childCaptureTimelineStatus(child);
    writes.push(toCanonicalTimelineMessage(input.projectId, input.conversationId, entry));
  }
  return writes;
}

export function childProcessMessage(input: {
  conversationId: string;
  graphScopeId: string;
  runId: string;
  roleId: string;
  childThreadId: string;
  parentThreadId: string;
  providerId: string;
  capture: ChildTranscriptCapture | undefined;
}): TopicThreadEntry | null {
  const capture = input.capture;
  if (!capture || (capture.blocks.length === 0 && capture.activity.length === 0)) return null;
  const timestamp = capture.blocks[0]?.timestamp ?? capture.activity[0]?.timestamp ?? new Date().toISOString();
  return {
    id: childProcessMessageId(input.conversationId, input.providerId, input.runId, capture),
    type: "assistant.message",
    timestamp,
    conversationId: input.conversationId,
    graphScopeId: input.graphScopeId,
    changeId: "",
    runId: input.runId,
    providerId: input.providerId,
    threadId: input.childThreadId,
    parentThreadId: input.parentThreadId,
    turnId: capture.turnId,
    agentRoleId: input.roleId,
    activity: capture.activity,
    blocks: capture.blocks,
    document: capture.blocks.find((block) => block.document)?.document,
    artifact: capture.blocks.find((block) => block.document)?.document?.proposalArtifact,
  };
}

export function childProcessMessageId(conversationId: string, providerId: string, runId: string, capture: ChildTranscriptCapture): string {
  return `assistant:${conversationId}:${providerId}:${runId}:${capture.canonicalId}:process`;
}

export function childInitialInputMessage(input: {
  conversationId: string;
  graphScopeId: string;
  runId: string;
  providerId: string;
  attemptId: string;
  roleId: string;
  threadId: string;
  parentThreadId: string;
  turnId: string;
  itemId: string;
  text: string;
}): TopicThreadEntry {
  return {
    id: `user:${input.providerId}:${input.attemptId}:${input.threadId}:${input.turnId}:${input.itemId}`,
    type: "user.message",
    timestamp: new Date().toISOString(),
    conversationId: input.conversationId,
    graphScopeId: input.graphScopeId,
    changeId: "",
    runId: input.runId,
    providerId: input.providerId,
    attemptId: input.attemptId,
    threadId: input.threadId,
    parentThreadId: input.parentThreadId,
    turnId: input.turnId,
    itemId: input.itemId,
    agentRoleId: input.roleId,
    initialThreadInput: true,
    text: input.text,
  };
}

export function providerChildAttemptId(parentAttemptId: string, childThreadId: string): string {
  return `${parentAttemptId}:child:${childThreadId}`;
}

export function childCaptureTimelineStatus(capture: ChildTranscriptCapture): string {
  const status = [...capture.activity].reverse().find((item) => item.kind === "status")?.label;
  return status === "completed" || status === "failed" || status === "blocked" ? status : "running";
}

function mainCaptureTimelineStatus(capture: MainTranscriptCapture): string {
  const status = [...capture.activity].reverse().find((item) => item.kind === "status")?.label;
  return status === "completed" || status === "failed" || status === "blocked" || status === "cancelled" ? status : "running";
}
