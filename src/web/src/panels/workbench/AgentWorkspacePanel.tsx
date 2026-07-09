import { Bot, Send } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";
import { humanStatus } from "../../formatters.js";
import { parentTranscriptCellsFromLiveThreadItem, parentTranscriptCellsFromLiveTurn } from "../../liveTranscript.js";
import { AgentTranscriptPane } from "./TranscriptReadingSurface.js";
import { ClarificationCard } from "./workpad/TaskGraphCards.js";
import type { AgentWorkspace, AgentWorkspaceAgent, LiveAssistantTurn, ParentAgentTranscriptCell, ThreadStreamItem } from "../../types.js";

export function AgentWorkspacePanel({
  workspace,
  selectedAgentId,
  liveItems,
  liveTurns,
  busy,
  onSelectAgent,
  onAnswerClarification,
  onSendAgentMessage,
  modelLabel,
  onOpenModelSettings,
}: {
  workspace: AgentWorkspace;
  selectedAgentId: string | null;
  liveItems: ThreadStreamItem[];
  liveTurns: LiveAssistantTurn[];
  busy: boolean;
  onSelectAgent: (agentId: string) => void;
  onAnswerClarification: (clarificationId: string, answer: string) => Promise<void>;
  onSendAgentMessage: (agent: AgentWorkspaceAgent, message: string) => Promise<void>;
  modelLabel: string;
  onOpenModelSettings?: () => void;
}): ReactElement {
  const childAgents = workspace.agents.filter((agent) => agent.id !== "main-agent" && agent.roleId !== "main-agent");
  const selected = childAgents.find((agent) => agent.id === selectedAgentId)
    ?? childAgents.find((agent) => agent.id === workspace.selectedAgentId)
    ?? childAgents[0]
    ?? emptyAgent();
  const [optimisticUserCells, setOptimisticUserCells] = useState<ParentAgentTranscriptCell[]>([]);
  const liveUserCells = useMemo(() => liveItems
    .filter((item) => item.kind === "user-message" && isScopedToAgent(item.agentRoleId, selected))
    .flatMap(parentTranscriptCellsFromLiveThreadItem), [liveItems, selected.id, selected.roleId]);
  const liveCells = useMemo(() => liveTurns
    .filter((turn) => turn.agentRoleId === selected.roleId || turn.agentRoleId === selected.id)
    .flatMap(parentTranscriptCellsFromLiveTurn), [liveTurns, selected.id, selected.roleId]);
  const persistedCells = (selected.transcript.cells ?? []).filter((cell) => cell.kind !== "detail-only");
  const authoritativeCells = [...persistedCells, ...liveUserCells, ...liveCells];
  const visibleOptimisticUserCells = optimisticUserCells.filter((cell) => (
    isScopedToAgent(cell.agentRoleId, selected)
    && !authoritativeCells.some((existing) => sameUserMessageCell(existing, cell))
  ));
  const cells = [...persistedCells, ...liveUserCells, ...visibleOptimisticUserCells, ...liveCells];
  function appendOptimisticUserMessage(agent: AgentWorkspaceAgent, message: string): void {
    const timestamp = new Date().toISOString();
    setOptimisticUserCells((current) => [
      ...current,
      {
        id: `optimistic-agent-user:${agent.id}:${timestamp}`,
        kind: "user-message",
        source: "user",
        timestamp,
        agentRoleId: agent.roleId,
        text: message,
      },
    ]);
  }
  return (
    <div className="agent-workspace-panel" data-testid="agent-workspace-panel">
      <div className="agent-workspace-agent-list" aria-label="Agent 列表">
        {childAgents.map((agent) => (
          <button
            type="button"
            key={agent.id}
            className={`agent-workspace-agent-chip${agent.id === selected.id ? " selected" : ""}`}
            onClick={() => onSelectAgent(agent.id)}
          >
            <Bot size={15} aria-hidden="true" />
            <span>{agent.label}</span>
            <small>{humanStatus(agent.status)}</small>
          </button>
        ))}
      </div>
      <section className="agent-workspace-card">
        <header className="agent-workspace-header">
          <div>
            <h3>{selected.label}</h3>
          </div>
          <span className={`agent-workspace-status ${selected.status}`}>{humanStatus(selected.status)}</span>
        </header>
        <div className="agent-workspace-transcript-region">
          <AgentTranscriptPane cells={cells} emptyMessage={selected.transcript.emptyMessage} testId="agent-workspace-transcript" />
          <AgentClarifications agent={selected} busy={busy} onAnswer={onAnswerClarification} />
        </div>
        <AgentWorkspaceComposer
          agent={selected}
          modelLabel={modelLabel}
          onOpenModelSettings={onOpenModelSettings}
          onOptimisticUserMessage={appendOptimisticUserMessage}
        onSendAgentMessage={onSendAgentMessage}
      />
      </section>
    </div>
  );
}

function AgentWorkspaceRuntimeStrip({
  modelLabel,
  onOpenModelSettings,
}: {
  modelLabel: string;
  onOpenModelSettings?: () => void;
}): ReactElement {
  return (
    <div className="composer-control-strip agent-workspace-control-strip" aria-label="Agent runtime controls">
      <span className="composer-engine-label"><Bot size={14} />Codex</span>
      <span className="composer-control-divider" aria-hidden="true">/</span>
      {onOpenModelSettings ? (
        <button
          type="button"
          className="composer-model-label composer-model-button"
          aria-label={`选择模型，当前模型：${modelLabel}`}
          onClick={onOpenModelSettings}
        >
          {modelLabel}
        </button>
      ) : (
        <span className="composer-model-label" aria-label={`当前模型：${modelLabel}`}>{modelLabel}</span>
      )}
    </div>
  );
}

function AgentClarifications({
  agent,
  busy,
  onAnswer,
}: {
  agent: AgentWorkspaceAgent;
  busy: boolean;
  onAnswer: (clarificationId: string, answer: string) => Promise<void>;
}): ReactElement {
  const clarifications = agent.clarifications?.filter((item) => item.status === "pending") ?? [];
  if (clarifications.length === 0) return <></>;
  return (
    <section className="agent-workspace-clarifications" data-testid="agent-workspace-clarifications" aria-label="当前 Agent 需要确认">
      <div className="conversation-clarification-header">
        <span>需要确认</span>
        <strong>{clarifications.length}</strong>
      </div>
      <div className="clarification-list">
        {clarifications.map((clarification) => (
          <ClarificationCard key={clarification.id} clarification={clarification} busy={busy} onAnswer={onAnswer} />
        ))}
      </div>
    </section>
  );
}

function AgentWorkspaceComposer({
  agent,
  modelLabel,
  onOpenModelSettings,
  onOptimisticUserMessage,
  onSendAgentMessage,
}: {
  agent: AgentWorkspaceAgent;
  modelLabel: string;
  onOpenModelSettings?: () => void;
  onOptimisticUserMessage: (agent: AgentWorkspaceAgent, message: string) => void;
  onSendAgentMessage: (agent: AgentWorkspaceAgent, message: string) => Promise<void>;
}): ReactElement {
  const [value, setValue] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const actionBusy = pending !== null;
  const text = value.trim();
  const canInteract = agent.id === "plan-session" || agent.id === "planning-agent";
  const submitDisabled = actionBusy || !canInteract || !text;
  async function submit(): Promise<void> {
    if (submitDisabled) return;
    const message = text;
    const pendingId = `agent-message:${agent.id}:${Date.now()}`;
    setPending(pendingId);
    setValue("");
    onOptimisticUserMessage(agent, message);
    const releasePending = globalThis.setTimeout(() => {
      setPending((current) => current === pendingId ? null : current);
    }, 1200);
    try {
      await onSendAgentMessage(agent, message);
    } catch (error) {
      setValue((current) => current || message);
      throw error;
    } finally {
      globalThis.clearTimeout(releasePending);
      setPending((current) => current === pendingId ? null : current);
    }
  }
  return (
    <div className="topic-composer agent-workspace-composer" data-testid="agent-workspace-composer" aria-label={`${agent.label} 输入框`}>
      <AgentWorkspaceRuntimeStrip modelLabel={modelLabel} onOpenModelSettings={onOpenModelSettings} />
      <textarea
        value={value}
        onChange={(event) => setValue(event.target.value)}
        placeholder="给当前 Agent 发送反馈"
        disabled={actionBusy || !canInteract}
      />
      <div className="composer-toolbar">
        {pending ? <span className="composer-pill subtle">正在发送</span> : null}
        <span className="composer-spacer" />
        <button
          type="button"
          className={`composer-send ${pending ? "running" : ""}`}
          disabled={submitDisabled}
          title="发送给当前 Agent"
          onClick={() => void submit()}
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}

function isScopedToAgent(agentRoleId: string | undefined, agent: AgentWorkspaceAgent): boolean {
  return agentRoleId === agent.roleId || agentRoleId === agent.id;
}

function sameUserMessageCell(left: ParentAgentTranscriptCell, right: ParentAgentTranscriptCell): boolean {
  return left.kind === "user-message"
    && right.kind === "user-message"
    && left.agentRoleId === right.agentRoleId
    && left.text.trim() === right.text.trim();
}

function emptyAgent(): AgentWorkspaceAgent {
  return {
    id: "empty-agent-workspace",
    roleId: "empty-agent-workspace",
    label: "暂无会话",
    status: "idle",
    summary: "暂无可显示的 Agent 对话。",
    transcript: { title: "暂无会话", cells: [], items: [], emptyMessage: "暂无会话内容。" },
    evidenceRefs: [],
    actions: [],
  };
}
