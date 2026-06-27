import type { ReactElement } from "react";
import { Send, X } from "lucide-react";
import { workflowActionLabel } from "../action-labels.js";
import type { WorkpadRuntimeStatus } from "../types.js";
import { ComposerControls } from "./ComposerControls.js";
import type { ComposerExecutionMode } from "./composer-session.js";

export function TopicComposer({
  value,
  onChange,
  mode: _mode,
  onModeChange: _onModeChange,
  automationMode,
  onAutomationModeChange,
  modelLabel,
  enabledSkillCount,
  onOpenSkillsSettings,
  busy: _busy,
  disabledReason,
  onSend,
  onStopAndContinue,
  onNewWorkpad: _onNewWorkpad,
  onRunCode: _onRunCode,
  actionRunning,
  canRunCode: _canRunCode,
  currentWorkpadStatus,
}: {
  value: string;
  onChange: (value: string) => void;
  mode: "chat" | "plan";
  onModeChange: (mode: "chat" | "plan") => void;
  automationMode: ComposerExecutionMode;
  onAutomationModeChange: (mode: ComposerExecutionMode) => void;
  modelLabel: string;
  enabledSkillCount?: number;
  onOpenSkillsSettings?: () => void;
  busy: boolean;
  disabledReason?: string;
  onSend: () => Promise<void>;
  onStopAndContinue?: () => Promise<void>;
  onNewWorkpad?: () => Promise<void>;
  onRunCode?: () => Promise<void>;
  actionRunning: string | null;
  canRunCode: boolean;
  currentWorkpadStatus?: WorkpadRuntimeStatus;
}): ReactElement {
  const runningConversation = Boolean(actionRunning) || currentWorkpadStatus === "running";
  const canStop = runningConversation && Boolean(onStopAndContinue) && !value.trim();
  const canSend = Boolean(value.trim());
  const sendDisabled = Boolean(disabledReason) || (!canSend && !canStop);
  const buttonTitle = canStop ? "停止当前执行" : runningConversation ? "发送给当前执行" : "发送";
  const buttonIcon = canStop ? <X size={16} /> : <Send size={16} />;
  function submit(): void {
    if (canStop) void onStopAndContinue?.();
    else void onSend();
  }
  return (
    <div className="topic-composer" aria-label="需求对话输入框">
      <ComposerControls
        modelLabel={modelLabel}
        mode={automationMode}
        onModeChange={onAutomationModeChange}
        enabledSkillCount={enabledSkillCount}
        onOpenSkillsSettings={onOpenSkillsSettings}
      />
        <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={Boolean(disabledReason)}
        placeholder={disabledReason ?? (runningConversation ? "补充要求；支持实时引导时会发送给当前执行" : "输入问题或下一步需求")}
      />
      <div className="composer-toolbar">
        {disabledReason ? <span className="composer-pill">只读</span> : null}
        {runningConversation ? <span className="composer-pill subtle">{value.trim() ? "会发送给当前执行" : "可停止当前执行"}</span> : null}
        <span className="composer-spacer" />
        {actionRunning ? <span className="composer-pill subtle">正在运行：{workflowActionLabel(actionRunning)}</span> : null}
        <button
          className={`composer-send ${actionRunning ? "running" : ""}`}
          disabled={sendDisabled}
          title={buttonTitle}
          onClick={submit}
        >
          {buttonIcon}
        </button>
      </div>
    </div>
  );
}
