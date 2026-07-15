import { Bot, ChevronLeft, Send, X } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";
import { coalesceMainLiveTurns, parentTranscriptCellsFromLiveThreadItem, parentTranscriptCellsFromLiveTurn, reconcileTimelineCells } from "../../liveTranscript.js";
import { AgentTranscriptPane } from "./TranscriptReadingSurface.js";
import { ClarificationCard } from "./workpad/TaskGraphCards.js";
import type { AgentWorkspace, AgentWorkspaceAgent, CodexUserInputRequest, LiveAssistantTurn, ParentAgentTranscriptCell, ThreadStreamItem } from "../../types.js";

export function AgentWorkspacePanel({
  workspace,
  selectedAgentId,
  openAgentIds,
  liveItems,
  liveTurns,
  busy,
  onSelectAgent,
  onCloseAgent,
  onBack,
  onAnswerClarification,
  onAnswerCodexUserInput,
  onSendAgentMessage,
  modelLabel,
  onOpenModelSettings,
}: {
  workspace: AgentWorkspace;
  selectedAgentId: string | null;
  openAgentIds: string[];
  liveItems: ThreadStreamItem[];
  liveTurns: LiveAssistantTurn[];
  busy: boolean;
  onSelectAgent: (agentId: string) => void;
  onCloseAgent: (agentId: string) => void;
  onBack: () => void;
  onAnswerClarification: (clarificationId: string, answer: string) => Promise<void>;
  onAnswerCodexUserInput: (request: CodexUserInputRequest, answers: Record<string, string | string[]>) => Promise<void>;
  onSendAgentMessage: (agent: AgentWorkspaceAgent, message: string) => Promise<void>;
  modelLabel: string;
  onOpenModelSettings?: () => void;
}): ReactElement {
  const childAgents = workspace.agents.filter((agent) => openAgentIds.includes(agent.id) && agent.id !== "main-agent" && agent.roleId !== "main-agent");
  const selected = childAgents.find((agent) => agent.id === selectedAgentId) ?? childAgents[0] ?? null;
  const [optimisticUserCells, setOptimisticUserCells] = useState<ParentAgentTranscriptCell[]>([]);
  const liveUserCells = useMemo(() => liveItems
    .filter((item) => selected && (item.kind === "user-message" || Boolean(item.codexUserInput)) && isScopedToAgent(item.agentRoleId, selected))
    .flatMap(parentTranscriptCellsFromLiveThreadItem), [liveItems, selected]);
  const liveCells = useMemo(() => coalesceMainLiveTurns(liveTurns
    .filter((turn) => selected && (turn.agentSurfaceId === selected.id || turn.threadId === selected.providerThreadId || (!turn.agentSurfaceId && turn.runId === selected.runId))))
    .flatMap(parentTranscriptCellsFromLiveTurn), [liveTurns, selected]);
  const persistedCells = (selected?.transcript.cells ?? []).filter((cell) => cell.kind !== "detail-only");
  const persistedAndLiveUserCells = reconcileTimelineCells(persistedCells, liveUserCells);
  const authoritativeCells = reconcileTimelineCells(persistedAndLiveUserCells, liveCells);
  const visibleOptimisticUserCells = optimisticUserCells.filter((cell) => (
    selected && isScopedToAgent(cell.agentRoleId, selected)
    && !authoritativeCells.some((existing) => sameUserMessageCell(existing, cell))
  ));
  const cells = reconcileTimelineCells([...persistedAndLiveUserCells, ...visibleOptimisticUserCells], liveCells);
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
      <div className="agent-workspace-tabbar">
        <button type="button" className="agent-workspace-back" data-testid="right-tool-back" aria-label="返回工具列表" onClick={onBack}>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <div className="agent-workspace-tabs" role="tablist" aria-label="已打开的 Agent">
          {childAgents.map((agent) => (
            <div key={agent.id} className={`agent-workspace-tab${agent.id === selected?.id ? " selected" : ""}`} role="presentation">
              <button type="button" role="tab" aria-label={`打开 ${agent.label}`} aria-selected={agent.id === selected?.id} onClick={() => onSelectAgent(agent.id)}>
                <span className={`agent-tab-status ${agent.status}`} aria-hidden="true" />
                <span>{agent.label}</span>
              </button>
              <button type="button" className="agent-workspace-tab-close" title={`关闭 ${agent.label}`} aria-label={`关闭 ${agent.label}`} onClick={() => onCloseAgent(agent.id)}>
                <X size={13} />
              </button>
            </div>
          ))}
        </div>
      </div>
      {selected ? <section className="agent-workspace-surface">
        <div className="agent-workspace-transcript-region">
          <AgentTranscriptPane
            cells={cells}
            emptyMessage={selected.transcript.emptyMessage}
            testId="agent-workspace-transcript"
            busy={busy}
            onAnswerCodexUserInput={onAnswerCodexUserInput}
          />
          <AgentClarifications agent={selected} busy={busy} onAnswer={onAnswerClarification} />
        </div>
        <AgentWorkspaceComposer
          agent={selected}
          modelLabel={modelLabel}
          onOpenModelSettings={onOpenModelSettings}
          onOptimisticUserMessage={appendOptimisticUserMessage}
        onSendAgentMessage={onSendAgentMessage}
      />
      </section> : <div className="agent-workspace-empty"><Bot size={20} /><span>从对话或 Agent 图中打开一个 Agent。</span></div>}
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
  const canInteract = agent.roleId === "planning-agent";
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
