import type {
  ThreadStreamItem,
  TopicMessageEntry,
} from "../types.js";

export function threadItemFromTopicEntry(entry: TopicMessageEntry): ThreadStreamItem | null {
  if (entry.type === "user.message") {
    return { id: entry.id, kind: "user-message", label: "User", timestamp: entry.timestamp, body: entry.text, source: "chat", graphScopeId: entry.graphScopeId, contextRefs: entry.contextRefs, attachments: entry.attachments };
  }
  if (entry.type === "assistant.message") {
    return {
      id: entry.id, kind: "assistant-turn", label: "AI", timestamp: entry.timestamp,
      body: entry.text, source: "chat", artifact: entry.artifact, status: entry.status, graphScopeId: entry.graphScopeId, runId: entry.runId,
      threadId: entry.threadId, parentThreadId: entry.parentThreadId, turnId: entry.turnId,
      agentRoleId: entry.agentRoleId, agentTaskId: entry.agentTaskId,
      activity: entry.activity, blocks: entry.blocks, codexUserInput: entry.codexUserInput,
    };
  }
  if (entry.type === "orchestrator.plan") {
    return {
      id: entry.id, kind: "assistant-turn", label: "AI", timestamp: entry.timestamp,
      body: entry.text, source: "chat", artifact: entry.artifact, status: entry.status, graphScopeId: entry.graphScopeId, runId: entry.runId,
      threadId: entry.threadId, parentThreadId: entry.parentThreadId, turnId: entry.turnId,
      agentRoleId: entry.agentRoleId, agentTaskId: entry.agentTaskId,
      activity: entry.activity, blocks: entry.blocks,
    };
  }
  if (entry.type === "workflow.started" || entry.type === "workflow.completed" || entry.type === "workflow.failed") {
    return threadItemFromWorkflowEntry(entry);
  }
  if (entry.type === "intake.scan" || entry.type === "intake.iteration") {
    return { id: entry.id, kind: "intake-summary", label: entry.type === "intake.scan" ? "需求分析" : "当前需求理解", timestamp: entry.timestamp, body: entry.text, source: "intake", artifact: entry.artifact, runId: entry.runId, intake: entry.intake };
  }
  if (entry.type === "clarification.request" || entry.type === "clarification.answer" || entry.type === "clarification.skip") {
    return { id: entry.id, kind: "clarification", label: entry.type === "clarification.request" ? "需要确认" : "需求确认", timestamp: entry.timestamp, body: entry.text, source: "intake", runId: entry.runId, status: entry.clarification?.status, clarification: entry.clarification };
  }
  return null;
}
function threadItemFromWorkflowEntry(entry: TopicMessageEntry): ThreadStreamItem | null {
  if (entry.type === "workflow.started") return null;
  const body = entry.resultSummary?.trim() || entry.text?.trim() || entry.error?.trim();
  if (!body) return null;
  const failed = entry.type === "workflow.failed" || entry.status === "failed";
  return {
    id: `workflow:${entry.actionRunId ?? entry.id}`,
    kind: "workflow-summary",
    label: failed ? "执行未完成" : "执行结果",
    timestamp: entry.timestamp,
    body,
    source: "workflow",
    artifact: entry.artifact,
    runId: entry.runId,
    actionType: entry.actionType,
    actionRunId: entry.actionRunId,
    status: entry.status ?? (failed ? "failed" : "completed"),
    blocks: entry.blocks?.length ? entry.blocks : [{
      id: `workflow-result:${entry.actionRunId ?? entry.id}`,
      runId: entry.runId,
      sequence: 1,
      kind: failed ? "error" : "prose",
      timestamp: entry.timestamp ?? new Date().toISOString(),
      source: "workflow",
      title: failed ? "执行未完成" : "执行结果",
      text: body,
      artifactRef: entry.artifact,
      isError: failed,
    }],
  };
}
