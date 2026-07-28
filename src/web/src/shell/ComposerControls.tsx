import type { ReactElement } from "react";
import { Bot, File, Paperclip, Sparkles } from "lucide-react";
import type { ComposerContextKind, ComposerContextSummary } from "./ComposerContextSources.js";

export function ComposerControls({
  providerDisplayName = "AI 服务",
  modelLabel,
  onOpenModelSettings,
  enabledSkillCount = 0,
  contextSummary,
  openContextKind = null,
  onToggleContextKind,
  providerOptions = [],
  selectedProviderId,
  onSelectProvider,
}: {
  providerDisplayName?: string;
  modelLabel: string;
  onOpenModelSettings?: () => void;
  enabledSkillCount?: number;
  contextSummary?: ComposerContextSummary;
  openContextKind?: ComposerContextKind | null;
  onToggleContextKind?: (kind: ComposerContextKind) => void;
  providerOptions?: Array<{ id: string; label: string }>;
  selectedProviderId?: string;
  onSelectProvider?: (providerId: string) => void;
}): ReactElement {
  const summary = contextSummary ?? { skillCount: enabledSkillCount, fileCount: 0, attachmentCount: 0, totalCount: enabledSkillCount };
  return (
    <div className="composer-control-strip" aria-label="Composer execution controls">
      {providerOptions.length > 1 ? (
        <label className="composer-provider-select">
          <Bot size={14} aria-hidden="true" />
          <span className="sr-only">选择 AI 服务</span>
          <select value={selectedProviderId ?? ""} onChange={(event) => onSelectProvider?.(event.target.value)} aria-label="选择 AI 服务">
            {!selectedProviderId ? <option value="" disabled>选择 AI 服务</option> : null}
            {providerOptions.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
          </select>
        </label>
      ) : <span className="composer-engine-label"><Bot size={14} />{providerDisplayName}</span>}
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
      {summary.totalCount > 0 ? (
        <div className="composer-context-chip-group" aria-label="本次发送上下文">
          {summary.skillCount > 0 ? <ContextChip kind="skills" icon={<Sparkles size={13} />} label={`技能 ${summary.skillCount}`} expanded={openContextKind === "skills"} onClick={onToggleContextKind} /> : null}
          {summary.fileCount > 0 ? <ContextChip kind="files" icon={<File size={13} />} label={`文件 ${summary.fileCount}`} expanded={openContextKind === "files"} onClick={onToggleContextKind} /> : null}
          {summary.attachmentCount > 0 ? <ContextChip kind="attachments" icon={<Paperclip size={13} />} label={`附件 ${summary.attachmentCount}`} expanded={openContextKind === "attachments"} onClick={onToggleContextKind} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function ContextChip({
  kind,
  icon,
  label,
  expanded,
  onClick,
}: {
  kind: ComposerContextKind;
  icon: ReactElement;
  label: string;
  expanded: boolean;
  onClick?: (kind: ComposerContextKind) => void;
}): ReactElement {
  return (
    <button
      type="button"
      className={`composer-context-chip ${expanded ? "selected" : ""}`}
      aria-expanded={expanded}
      onClick={() => onClick?.(kind)}
    >
      {icon}{label}
    </button>
  );
}
