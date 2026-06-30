import { File, Folder, ImageIcon, Paperclip, Sparkles, X } from "lucide-react";
import type { ReactElement } from "react";
import type { SkillListItem, TopicAttachment, TopicFileReference } from "../types.js";

export type ComposerContextAttachment = Pick<TopicAttachment, "id" | "fileName" | "kind" | "size"> & {
  runtimeMode?: TopicAttachment["runtimeMode"];
  previewUrl?: string;
};

export type ComposerContextSummary = {
  skillCount: number;
  fileCount: number;
  attachmentCount: number;
  totalCount: number;
};

export function buildComposerContextSummary(input: {
  skills?: SkillListItem[];
  activeSkillIds?: string[];
  selectedFileRefs?: TopicFileReference[];
  attachments?: ComposerContextAttachment[];
}): ComposerContextSummary {
  const activeSkillIds = input.activeSkillIds ?? [];
  return {
    skillCount: activeSkillIds.length,
    fileCount: input.selectedFileRefs?.length ?? 0,
    attachmentCount: input.attachments?.length ?? 0,
    totalCount: activeSkillIds.length + (input.selectedFileRefs?.length ?? 0) + (input.attachments?.length ?? 0),
  };
}

export function ComposerContextSourcesPanel({
  skills = [],
  activeSkillIds = [],
  selectedFileRefs = [],
  attachments = [],
  onToggleSkill,
  onSelectedFileRefsChange,
  onRemoveAttachment,
  onOpenSkillsSettings,
}: {
  skills?: SkillListItem[];
  activeSkillIds?: string[];
  selectedFileRefs?: TopicFileReference[];
  attachments?: ComposerContextAttachment[];
  onToggleSkill?: (skillId: string) => void | Promise<void>;
  onSelectedFileRefsChange?: (refs: TopicFileReference[]) => void;
  onRemoveAttachment?: (id: string) => void | Promise<void>;
  onOpenSkillsSettings?: () => void;
}): ReactElement | null {
  const activeSkills = activeSkillIds.map((skillId) => skills.find((skill) => skill.skillId === skillId) ?? fallbackSkill(skillId));
  if (activeSkills.length === 0 && selectedFileRefs.length === 0 && attachments.length === 0) return null;
  return (
    <div className="composer-context-panel" aria-label="本次发送的上下文来源" data-testid="composer-context-panel">
      {activeSkills.length > 0 ? (
        <section className="composer-context-group">
          <header>
            <strong><Sparkles size={13} />技能</strong>
            {onOpenSkillsSettings ? <button type="button" onClick={onOpenSkillsSettings}>管理</button> : null}
          </header>
          <div className="composer-context-list">
            {activeSkills.map((skill) => (
              <ContextRow
                key={skill.skillId}
                icon={<Sparkles size={14} />}
                title={skill.name}
                detail={skill.description || sourceKindLabel(skill.sourceKind)}
                actionLabel={`移除技能 ${skill.name}`}
                onRemove={onToggleSkill ? () => void onToggleSkill(skill.skillId) : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}
      {selectedFileRefs.length > 0 ? (
        <section className="composer-context-group">
          <header><strong><File size={13} />文件</strong></header>
          <div className="composer-context-list">
            {selectedFileRefs.map((ref) => (
              <ContextRow
                key={ref.relativePath}
                icon={ref.kind === "directory" ? <Folder size={14} /> : <File size={14} />}
                title={ref.name}
                detail={ref.relativePath}
                actionLabel={`移除文件引用 ${ref.name}`}
                onRemove={onSelectedFileRefsChange ? () => onSelectedFileRefsChange(selectedFileRefs.filter((item) => item.relativePath !== ref.relativePath)) : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}
      {attachments.length > 0 ? (
        <section className="composer-context-group">
          <header><strong><Paperclip size={13} />附件</strong></header>
          <div className="composer-context-list">
            {attachments.map((attachment) => (
              <ContextRow
                key={attachment.id}
                icon={attachment.kind === "image" ? <ImageIcon size={14} /> : <Paperclip size={14} />}
                title={attachment.fileName}
                detail={`${attachment.kind === "image" ? "图片" : attachment.kind === "text" ? "文本" : "附件"} · ${formatContextSize(attachment.size)}`}
                actionLabel={`移除附件 ${attachment.fileName}`}
                onRemove={onRemoveAttachment ? () => void onRemoveAttachment(attachment.id) : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function SentMessageContextSummary({
  contextRefs = [],
  attachments = [],
}: {
  contextRefs?: TopicFileReference[];
  attachments?: ComposerContextAttachment[];
}): ReactElement | null {
  if (contextRefs.length === 0 && attachments.length === 0) return null;
  return (
    <div className="sent-context-summary" aria-label="已发送上下文">
      {contextRefs.length > 0 ? <span><File size={12} />文件 {contextRefs.length}</span> : null}
      {attachments.length > 0 ? <span><Paperclip size={12} />附件 {attachments.length}</span> : null}
    </div>
  );
}

function ContextRow({
  icon,
  title,
  detail,
  actionLabel,
  onRemove,
}: {
  icon: ReactElement;
  title: string;
  detail: string;
  actionLabel: string;
  onRemove?: () => void;
}): ReactElement {
  return (
    <div className="composer-context-row">
      <span className="composer-context-row-icon" aria-hidden="true">{icon}</span>
      <span className="composer-context-row-text">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      {onRemove ? (
        <button type="button" aria-label={actionLabel} onClick={onRemove}>
          <X size={13} />
        </button>
      ) : null}
    </div>
  );
}

function fallbackSkill(skillId: string): SkillListItem {
  return {
    skillId,
    name: skillId,
    description: "",
    sourcePath: "",
    sourceKind: "custom",
    sourceHash: "",
    enabledProject: false,
    enabledTopics: [],
    disabledTopics: [],
    runtimeTargets: [],
  };
}

function sourceKindLabel(kind: SkillListItem["sourceKind"]): string {
  if (kind === "global-codex") return "Codex 原生可用";
  if (kind === "system-aho") return "AHO 内置";
  if (kind === "project-codex") return "项目 Skill";
  return "自定义 Skill";
}

function formatContextSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${size} B`;
}
