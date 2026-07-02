import { Bot, Check, FileText, RefreshCw } from "lucide-react";
import { useMemo, useState, type ReactElement } from "react";
import { workflowActionPayloadFromScope } from "../../workflow-actions.js";
import { humanStatus, userFacingText } from "../../formatters.js";
import { parentTranscriptCellsFromLiveTurn } from "../../liveTranscript.js";
import { AgentTranscriptPane } from "./TranscriptReadingSurface.js";
import { artifactName } from "./RunReplayPanel.js";
import type { AgentWorkspace, AgentWorkspaceAgent, DecisionAction, LiveAssistantTurn } from "../../types.js";

export function AgentWorkspacePanel({
  workspace,
  selectedAgentId,
  liveTurns,
  automationMode,
  busy,
  onSelectAgent,
  onWorkflowAction,
}: {
  workspace: AgentWorkspace;
  selectedAgentId: string | null;
  liveTurns: LiveAssistantTurn[];
  automationMode: "request-approval" | "full-access";
  busy: boolean;
  onSelectAgent: (agentId: string) => void;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
}): ReactElement {
  const selected = workspace.agents.find((agent) => agent.id === selectedAgentId)
    ?? workspace.agents.find((agent) => agent.id === workspace.selectedAgentId)
    ?? workspace.agents[0]
    ?? emptyAgent();
  const liveCells = useMemo(() => liveTurns
    .filter((turn) => turn.agentRoleId === selected.roleId || turn.agentRoleId === selected.id)
    .flatMap(parentTranscriptCellsFromLiveTurn), [liveTurns, selected.id, selected.roleId]);
  const cells = [...(selected.transcript.cells ?? []).filter((cell) => cell.kind !== "detail-only"), ...liveCells];
  return (
    <div className="agent-workspace-panel" data-testid="agent-workspace-panel">
      <div className="agent-workspace-agent-list" aria-label="Agent 列表">
        {workspace.agents.map((agent) => (
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
            <p className="eyebrow">Agent 工作区</p>
            <h3>{selected.label}</h3>
            <p>{userFacingText(selected.summary)}</p>
          </div>
          <span className={`agent-workspace-status ${selected.status}`}>{humanStatus(selected.status)}</span>
        </header>
        <AgentWorkspaceSummaries agent={selected} />
        <AgentPlanningActions
          agent={selected}
          automationMode={automationMode}
          busy={busy}
          onWorkflowAction={onWorkflowAction}
        />
        <AgentTranscriptPane cells={cells} emptyMessage={selected.transcript.emptyMessage} testId="agent-workspace-transcript" />
        {selected.evidenceRefs.length ? (
          <div className="agent-workspace-evidence" aria-label="Agent 证据">
            {selected.evidenceRefs.slice(0, 5).map((ref) => (
              <span key={`${ref.kind}:${ref.ref}`}>{ref.label}: {artifactName(ref.ref)}</span>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function AgentWorkspaceSummaries({ agent }: { agent: AgentWorkspaceAgent }): ReactElement {
  if (!agent.inputSummary && !agent.outputSummary) return <></>;
  return (
    <dl className="agent-workspace-summaries">
      {agent.inputSummary ? <div><dt>输入</dt><dd>{userFacingText(agent.inputSummary)}</dd></div> : null}
      {agent.outputSummary ? <div><dt>输出</dt><dd>{userFacingText(agent.outputSummary)}</dd></div> : null}
    </dl>
  );
}

function AgentPlanningActions({
  agent,
  automationMode,
  busy,
  onWorkflowAction,
}: {
  agent: AgentWorkspaceAgent;
  automationMode: "request-approval" | "full-access";
  busy: boolean;
  onWorkflowAction: (actionType: string, options?: Record<string, unknown>) => Promise<void>;
}): ReactElement {
  const [feedback, setFeedback] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const generateAction = agent.actions.find((action) => action.actionType === "planning.generate");
  const reviseAction = agent.actions.find((action) => action.actionType === "planning.revise");
  const implementAction = agent.actions.find((action) => action.actionType === "planning.confirm-execution");
  const actionBusy = busy || pending !== null;
  async function runAction(action: DecisionAction, extra: Record<string, unknown> = {}): Promise<void> {
    if (!action.actionType || !action.enabled || actionBusy) return;
    setPending(action.id);
    try {
      await onWorkflowAction(action.actionType, {
        ...workflowActionPayloadFromScope(action),
        ...extra,
      });
      setFeedback("");
      setConfirming(null);
    } finally {
      setPending(null);
    }
  }
  if (!generateAction && !reviseAction && !implementAction) return <></>;
  return (
    <div className="agent-workspace-actions" data-testid="agent-workspace-actions">
      {generateAction ? (
        <button
          type="button"
          className="primary-button"
          disabled={actionBusy}
          onClick={() => void runAction(generateAction, feedback.trim() ? { prompt: feedback.trim() } : {})}
        >
          <FileText size={15} />{userFacingText(generateAction.label)}
        </button>
      ) : null}
      {reviseAction ? (
        <label className="agent-workspace-feedback">
          <span>给 planning-agent 的修改意见</span>
          <textarea
            value={feedback}
            onChange={(event) => setFeedback(event.target.value)}
            rows={4}
            placeholder="写下需要调整的目标、范围、验收标准或实现方式"
            disabled={actionBusy}
          />
          <button
            type="button"
            className="outline-button"
            disabled={actionBusy || !feedback.trim()}
            onClick={() => void runAction(reviseAction, { feedback: feedback.trim(), prompt: feedback.trim() })}
          >
            <RefreshCw size={15} />{userFacingText(reviseAction.label)}
          </button>
        </label>
      ) : null}
      {implementAction ? confirming === implementAction.id ? (
        <span className="confirm-inline">
          <button
            type="button"
            className="primary-button"
            disabled={actionBusy}
            onClick={() => void runAction(implementAction, { postPlanAutomationMode: automationMode })}
          >
            <Check size={15} />确认实施
          </button>
          <button type="button" className="outline-button" disabled={actionBusy} onClick={() => setConfirming(null)}>取消</button>
        </span>
      ) : (
        <button
          type="button"
          className="primary-button"
          disabled={actionBusy}
          onClick={() => setConfirming(implementAction.id)}
        >
          <Check size={15} />{userFacingText(implementAction.label)}
        </button>
      ) : null}
    </div>
  );
}

function emptyAgent(): AgentWorkspaceAgent {
  return {
    id: "main-agent",
    roleId: "main-agent",
    label: "主 Agent",
    status: "idle",
    summary: "暂无 Agent 工作区。",
    transcript: { title: "主 Agent", cells: [], items: [], emptyMessage: "暂无 Agent 消息。" },
    evidenceRefs: [],
    actions: [],
  };
}
