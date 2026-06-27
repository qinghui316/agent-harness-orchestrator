import type { ReactElement } from "react";
import { Bot, Sparkles } from "lucide-react";
import { composerExecutionModeLabel, type ComposerExecutionMode } from "./composer-session.js";

export function ComposerControls({
  modelLabel,
  onOpenModelSettings,
  mode,
  onModeChange,
  enabledSkillCount = 0,
  onOpenSkillsSettings,
}: {
  modelLabel: string;
  onOpenModelSettings?: () => void;
  mode: ComposerExecutionMode;
  onModeChange: (mode: ComposerExecutionMode) => void;
  enabledSkillCount?: number;
  onOpenSkillsSettings?: () => void;
}): ReactElement {
  return (
    <div className="composer-control-strip" aria-label="Composer execution controls">
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
      <div className="composer-execution-mode-toggle" role="group" aria-label="执行模式">
        <button
          type="button"
          className={mode === "request-approval" ? "selected" : ""}
          aria-pressed={mode === "request-approval"}
          title="计划仍需确认；确认后每一步都让你批准。"
          onClick={() => onModeChange("request-approval")}
        >
          {composerExecutionModeLabel("request-approval")}
        </button>
        <button
          type="button"
          className={mode === "full-access" ? "selected" : ""}
          aria-pressed={mode === "full-access"}
          title="计划仍需确认；确认后自动推进本地步骤，直到需要你决定。"
          onClick={() => onModeChange("full-access")}
        >
          {composerExecutionModeLabel("full-access")}
        </button>
      </div>
      {enabledSkillCount > 0 ? (
        <button
          type="button"
          className="composer-skill-indicator"
          onClick={onOpenSkillsSettings}
          title="打开技能设置"
          aria-label={`已启用 ${enabledSkillCount} 个技能`}
        >
          <Sparkles size={13} />技能 {enabledSkillCount}
        </button>
      ) : null}
    </div>
  );
}
