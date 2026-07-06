import type { ReactElement } from "react";
import {
  CircleCheck,
  Code2,
  FileText,
  ShieldCheck,
  Upload,
  UserRound,
} from "lucide-react";
import {
  formatTime,
  threadLabel,
  threadTone,
} from "../formatters.js";
import type {
  LiveAssistantTurn,
  ThreadStreamItem,
  TopicMessageEntry,
} from "../types.js";
import {
  AssistantActivity,
  AssistantEvidenceBlocks,
  AssistantTurnBlocks,
  LiveAssistantTurnView,
  PlanCardView,
  artifactName,
} from "./assistant-rendering.js";

export function ThreadStreamView({
  items,
  liveTurns,
  busy,
  onAction,
  onSelectDecisionContext,
}: {
  items: ThreadStreamItem[];
  liveTurns: LiveAssistantTurn[];
  busy: boolean;
  onAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
  onSelectDecisionContext: (contextId: string) => void;
}): ReactElement {
  if (items.length === 0 && liveTurns.length === 0) return <div className="empty-state">暂无对话内容。</div>;
  return (
    <div className="timeline">
      {items.map((item) => (
        <div className={`timeline-item ${threadTone(item)}`} key={item.id}>
          <div className="timeline-icon">{threadIcon(item)}</div>
          <div>
            <strong>{threadLabel(item)}</strong>
            {item.blocks && item.blocks.length > 0 ? (
              <AssistantTurnBlocks blocks={item.blocks} actions={item.actions ?? []} busy={busy} onAction={onAction} completed={item.status !== "running"} />
            ) : (
              <>
                <p>{item.body ?? item.label} {item.status ? `· ${item.status}` : ""}</p>
                {item.activity && item.activity.length > 0 ? <AssistantActivity events={item.activity} /> : null}
                {item.evidence && item.evidence.length > 0 ? <AssistantEvidenceBlocks evidence={item.evidence} /> : null}
                {item.planCard ? <PlanCardView planCard={item.planCard} actions={item.actions ?? []} busy={busy} onAction={onAction} /> : null}
              </>
            )}
            {item.artifact && !(item.blocks && item.blocks.some((block) => block.artifactRef === item.artifact)) ? <small className="artifact-link">查看证据：{artifactName(item.artifact)}</small> : null}
            {item.kind === "decision" ? (
              <button className="context-link" type="button" onClick={() => onSelectDecisionContext(`decision:${item.id}`)}>
                在右侧查看决策
              </button>
            ) : null}
          </div>
          <time>{formatTime(item.timestamp)}</time>
        </div>
      ))}
      {liveTurns.map((turn) => <LiveAssistantTurnView key={turn.id} turn={turn} />)}
    </div>
  );
}

export function threadItemFromTopicEntry(entry: TopicMessageEntry): ThreadStreamItem | null {
  if (entry.type === "user.message") {
    return { id: `live:${entry.id}`, kind: "user-message", label: "User", timestamp: entry.timestamp, body: entry.text, source: "chat", contextRefs: entry.contextRefs, attachments: entry.attachments };
  }
  if (entry.type === "assistant.message") {
    return { id: `live:${entry.id}`, kind: "assistant-turn", label: "AI", timestamp: entry.timestamp, body: entry.text, source: "chat", artifact: entry.artifact, runId: entry.runId, agentRoleId: entry.agentRoleId, agentTaskId: entry.agentTaskId, activity: entry.activity, blocks: entry.blocks };
  }
  if (entry.type === "orchestrator.plan") {
    return { id: `live:${entry.id}`, kind: "assistant-turn", label: "Orchestrator plan", timestamp: entry.timestamp, body: entry.text, source: "chat", artifact: entry.artifact, runId: entry.runId, agentRoleId: entry.agentRoleId, agentTaskId: entry.agentTaskId, planCard: entry.planCard, activity: entry.activity, blocks: entry.blocks };
  }
  if (entry.type === "workflow.started" || entry.type === "workflow.completed" || entry.type === "workflow.failed") {
    return threadItemFromWorkflowEntry(entry);
  }
  if (entry.type === "intake.scan" || entry.type === "intake.iteration") {
    return { id: `live:${entry.id}`, kind: "intake-summary", label: entry.type === "intake.scan" ? "需求分析" : "当前需求理解", timestamp: entry.timestamp, body: entry.text, source: "intake", artifact: entry.artifact, runId: entry.runId, intake: entry.intake };
  }
  if (entry.type === "clarification.request" || entry.type === "clarification.answer" || entry.type === "clarification.skip") {
    return { id: `live:${entry.id}`, kind: "clarification", label: entry.type === "clarification.request" ? "需要确认" : "需求确认", timestamp: entry.timestamp, body: entry.text, source: "intake", runId: entry.runId, status: entry.clarification?.status, clarification: entry.clarification };
  }
  return null;
}

function threadItemFromWorkflowEntry(entry: TopicMessageEntry): ThreadStreamItem | null {
  if (entry.type === "workflow.started") return null;
  const body = entry.resultSummary?.trim() || entry.text?.trim() || entry.error?.trim();
  if (!body) return null;
  const failed = entry.type === "workflow.failed" || entry.status === "failed";
  return {
    id: `live:workflow:${entry.actionRunId ?? entry.id}`,
    kind: "assistant-turn",
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
      id: `live-workflow-result:${entry.actionRunId ?? entry.id}`,
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

function threadIcon(item: ThreadStreamItem): ReactElement {
  if (item.kind === "user-message" || item.kind === "change-state") return <UserRound size={16} />;
  if (item.kind === "assistant-turn" || item.kind === "assistant-message" || item.kind === "plan-card") return <FileText size={16} />;
  if (item.source === "workflow") return <Code2 size={16} />;
  if (item.source === "decision") return <Upload size={16} />;
  if (item.source === "audit") return <ShieldCheck size={16} />;
  return <CircleCheck size={16} />;
}
