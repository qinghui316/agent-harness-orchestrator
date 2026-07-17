import { Bot, ChevronLeft, FileText, Send, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { AgentTranscriptPane, TranscriptMarkdownLite } from "./TranscriptReadingSurface.js";
import type { AgentWorkspace, AgentWorkspaceAgent, ParentAgentTranscript, TextDocumentResource, WorkspaceResourceTab, WorkspaceResourceTarget } from "../../types.js";

export function projectFileResourceTabs(tabs: WorkspaceResourceTab[]): WorkspaceResourceTab[] {
  return tabs.filter((tab) => tab.target.kind === "project-file");
}

export function workspaceResourceRequestScope(projectId: string, conversationId: string, target: WorkspaceResourceTarget): string {
  return target.kind === "project-file" ? `project:${projectId}` : `conversation:${projectId}:${conversationId}`;
}

export function ResourceWorkspacePanel({
  workspace,
  agentTranscripts,
  conversationId,
  tabs,
  selectedResourceId,
  documents,
  loadingResourceIds,
  resourceErrors,
  onSelectResource,
  onCloseResource,
  onBack,
  onSendAgentMessage,
  onLoadEarlierAgentTranscript,
  providerDisplayName,
  modelLabel,
  onOpenModelSettings,
}: {
  workspace: AgentWorkspace;
  agentTranscripts: Record<string, ParentAgentTranscript>;
  conversationId: string;
  tabs: WorkspaceResourceTab[];
  selectedResourceId: string | null;
  documents: Record<string, TextDocumentResource>;
  loadingResourceIds: string[];
  resourceErrors: Record<string, string>;
  onSelectResource: (resourceId: string) => void;
  onCloseResource: (resourceId: string) => void;
  onBack: () => void;
  onSendAgentMessage: (agent: AgentWorkspaceAgent, message: string) => Promise<void>;
  onLoadEarlierAgentTranscript: (agentSurfaceId: string, cursor: string) => Promise<void>;
  providerDisplayName?: string;
  modelLabel: string;
  onOpenModelSettings?: () => void;
}): ReactElement {
  const [agentDrafts, setAgentDrafts] = useState<Record<string, string>>({});
  const [pendingAgentMessages, setPendingAgentMessages] = useState<Record<string, string>>({});
  const availableTabs = tabs.filter((tab) => {
    const target = tab.target;
    return target.kind !== "agent" || workspace.agents.some((agent) => (
      agent.id === target.agentSurfaceId && agent.id !== "main-agent" && agent.roleId !== "main-agent"
    ));
  });
  const selectedTab = availableTabs.find((tab) => tab.resourceId === selectedResourceId) ?? availableTabs[0] ?? null;
  const selectedTarget = selectedTab?.target;
  const selectedAgent = selectedTarget?.kind === "agent"
    ? workspace.agents.find((agent) => agent.id === selectedTarget.agentSurfaceId) ?? null
    : null;
  const lastAgentIdRef = useRef<string | null>(null);
  if (selectedAgent) lastAgentIdRef.current = selectedAgent.id;
  const mountedAgent = selectedAgent ?? workspace.agents.find((agent) => agent.id === lastAgentIdRef.current) ?? null;
  const selectedDocument = selectedTab && selectedTab.target.kind !== "agent" ? documents[selectedTab.resourceId] ?? null : null;
  const mountedAgentTranscript = mountedAgent ? agentTranscripts[mountedAgent.id] : undefined;
  const cells = (mountedAgentTranscript?.cells ?? []).filter((cell) => cell.kind !== "detail-only");
  const mountedAgentKey = mountedAgent ? agentDraftKey(conversationId, mountedAgent.id) : null;
  useEffect(() => {
    const retainedKeys = new Set(availableTabs.flatMap((tab) => tab.target.kind === "agent"
      ? [agentDraftKey(conversationId, tab.target.agentSurfaceId)]
      : []));
    setAgentDrafts((current) => retainKeys(current, retainedKeys));
    setPendingAgentMessages((current) => retainKeys(current, retainedKeys));
  }, [conversationId, tabs]);
  return (
    <div className="agent-workspace-panel resource-workspace-panel" data-testid="agent-workspace-panel" data-resource-workspace="true">
      <div className="agent-workspace-tabbar">
        <button type="button" className="agent-workspace-back" data-testid="right-tool-back" aria-label="返回工具列表" onClick={onBack}>
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <div className="agent-workspace-tabs" role="tablist" aria-label="已打开的资源">
          {availableTabs.map((tab) => {
            const target = tab.target;
            const agent = target.kind === "agent" ? workspace.agents.find((candidate) => candidate.id === target.agentSurfaceId) : null;
            const document = target.kind === "agent" ? null : documents[tab.resourceId];
            const label = agent?.label ?? document?.title ?? (target.kind === "document" ? "实现计划" : target.kind === "project-file" ? fileName(target.relativePath) : "资源");
            return (
              <div key={tab.resourceId} className={`agent-workspace-tab${tab.resourceId === selectedTab?.resourceId ? " selected" : ""}`} role="presentation">
                <button type="button" role="tab" aria-label={`打开 ${label}`} aria-selected={tab.resourceId === selectedTab?.resourceId} onClick={() => onSelectResource(tab.resourceId)}>
                  {agent ? <span className={`agent-tab-status ${agent.status}`} aria-hidden="true" /> : <FileText size={13} aria-hidden="true" />}
                  <span>{label}</span>
                </button>
                <button type="button" className="agent-workspace-tab-close" title={`关闭 ${label}`} aria-label={`关闭 ${label}`} onClick={() => onCloseResource(tab.resourceId)}>
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
      {mountedAgent ? <section className="agent-workspace-surface" hidden={!selectedAgent}>
        <div className="agent-workspace-transcript-region">
          <AgentTranscriptPane key={`${conversationId}:${mountedAgent.id}`} cells={cells} emptyMessage={mountedAgentTranscript?.emptyMessage} testId="agent-workspace-transcript" />
          {mountedAgentTranscript?.paging?.hasMoreBefore && mountedAgentTranscript.paging.nextBeforeCursor ? (
            <button
              type="button"
              className="transcript-load-earlier"
              onClick={() => void onLoadEarlierAgentTranscript(mountedAgent.id, mountedAgentTranscript.paging!.nextBeforeCursor!)}
            >加载更早消息</button>
          ) : null}
        </div>
        <AgentWorkspaceComposer
          agent={mountedAgent}
          value={mountedAgentKey ? agentDrafts[mountedAgentKey] ?? "" : ""}
          pending={mountedAgentKey ? pendingAgentMessages[mountedAgentKey] ?? null : null}
          onValueChange={(value) => {
            if (!mountedAgentKey) return;
            setAgentDrafts((current) => ({ ...current, [mountedAgentKey]: value }));
          }}
          onRestoreValue={(value) => {
            if (!mountedAgentKey) return;
            setAgentDrafts((current) => current[mountedAgentKey]
              ? current
              : { ...current, [mountedAgentKey]: value });
          }}
          onPendingChange={(pending, expectedPendingId) => {
            if (!mountedAgentKey) return;
            setPendingAgentMessages((current) => {
              if (pending) return { ...current, [mountedAgentKey]: pending };
              if (expectedPendingId && current[mountedAgentKey] !== expectedPendingId) return current;
              return withoutKey(current, mountedAgentKey);
            });
          }}
          providerDisplayName={mountedAgent.providerDisplayName ?? providerDisplayName}
          modelLabel={modelLabel}
          onOpenModelSettings={onOpenModelSettings}
          onSendAgentMessage={onSendAgentMessage}
        />
      </section> : null}
      {selectedTab && selectedTab.target.kind !== "agent" ? (
        <DocumentReadingSurface
          resource={selectedDocument}
          loading={loadingResourceIds.includes(selectedTab.resourceId)}
          error={resourceErrors[selectedTab.resourceId]}
        />
      ) : !mountedAgent ? <div className="agent-workspace-empty"><Bot size={20} /><span>从对话或 Agent 图中打开一个 Agent。</span></div> : null}
    </div>
  );
}

function DocumentReadingSurface({ resource, loading, error }: { resource: TextDocumentResource | null; loading: boolean; error?: string }): ReactElement {
  if (loading && !resource) return <div className="resource-document-state" role="status">正在打开...</div>;
  if (error && !resource) return <div className="resource-document-state error" role="alert">{error}</div>;
  if (!resource) return <div className="resource-document-state">文档不可用。</div>;
  return (
    <section className="resource-document-surface" data-testid="resource-document-surface" aria-label={resource.title}>
      <header className="resource-document-header">
        <FileText size={16} aria-hidden="true" />
        <span>{resource.title}</span>
        <small>只读</small>
      </header>
      <div className={`resource-document-content ${resource.language}`}>
        {resource.language === "markdown"
          ? <TranscriptMarkdownLite text={resource.content} idPrefix={`resource:${resource.resourceId}`} />
          : <pre>{resource.content}</pre>}
      </div>
    </section>
  );
}

function AgentWorkspaceRuntimeStrip({ providerDisplayName = "Agent Provider", modelLabel, onOpenModelSettings }: {
  providerDisplayName?: string;
  modelLabel: string;
  onOpenModelSettings?: () => void;
}): ReactElement {
  return (
    <div className="composer-control-strip agent-workspace-control-strip" aria-label="Agent runtime controls">
      <span className="composer-engine-label"><Bot size={14} />{providerDisplayName}</span>
      <span className="composer-control-divider" aria-hidden="true">/</span>
      {onOpenModelSettings ? (
        <button type="button" className="composer-model-label composer-model-button" aria-label={`选择模型，当前模型：${modelLabel}`} onClick={onOpenModelSettings}>{modelLabel}</button>
      ) : <span className="composer-model-label" aria-label={`当前模型：${modelLabel}`}>{modelLabel}</span>}
    </div>
  );
}

function AgentWorkspaceComposer({ agent, value, pending, onValueChange, onRestoreValue, onPendingChange, providerDisplayName, modelLabel, onOpenModelSettings, onSendAgentMessage }: {
  agent: AgentWorkspaceAgent;
  value: string;
  pending: string | null;
  onValueChange: (value: string) => void;
  onRestoreValue: (value: string) => void;
  onPendingChange: (pending: string | null, expectedPendingId?: string) => void;
  providerDisplayName?: string;
  modelLabel: string;
  onOpenModelSettings?: () => void;
  onSendAgentMessage: (agent: AgentWorkspaceAgent, message: string) => Promise<void>;
}): ReactElement {
  const text = value.trim();
  const canInteract = agent.roleId === "planning-agent";
  const submitDisabled = pending !== null || !canInteract || !text;
  async function submit(): Promise<void> {
    if (submitDisabled) return;
    const message = text;
    const pendingId = `agent-message:${agent.id}:${Date.now()}`;
    onPendingChange(pendingId);
    onValueChange("");
    const releasePending = globalThis.setTimeout(() => {
      onPendingChange(null, pendingId);
    }, 1200);
    try {
      await onSendAgentMessage(agent, message);
    } catch (error) {
      onRestoreValue(message);
      throw error;
    } finally {
      globalThis.clearTimeout(releasePending);
      onPendingChange(null, pendingId);
    }
  }
  return (
    <div className="topic-composer agent-workspace-composer" data-testid="agent-workspace-composer" aria-label={`${agent.label} 输入框`}>
      <AgentWorkspaceRuntimeStrip providerDisplayName={providerDisplayName} modelLabel={modelLabel} onOpenModelSettings={onOpenModelSettings} />
      <textarea value={value} onChange={(event) => onValueChange(event.target.value)} placeholder="给当前 Agent 发送反馈" disabled={pending !== null || !canInteract} />
      <div className="composer-toolbar">
        <span className="composer-spacer" />
        <button type="button" className={`composer-send ${pending ? "running" : ""}`} disabled={submitDisabled} title="发送给当前 Agent" onClick={() => void submit()}><Send size={16} /></button>
      </div>
    </div>
  );
}

function agentDraftKey(conversationId: string, agentSurfaceId: string): string {
  return `${conversationId}\u0000${agentSurfaceId}`;
}

function retainKeys(values: Record<string, string>, retained: Set<string>): Record<string, string> {
  const entries = Object.entries(values).filter(([key]) => retained.has(key));
  return entries.length === Object.keys(values).length ? values : Object.fromEntries(entries);
}

function withoutKey(values: Record<string, string>, key: string): Record<string, string> {
  if (!(key in values)) return values;
  const next = { ...values };
  delete next[key];
  return next;
}

function fileName(relativePath: string): string {
  return relativePath.split("/").at(-1) ?? relativePath;
}
