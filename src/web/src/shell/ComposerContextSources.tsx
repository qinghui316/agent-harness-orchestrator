import { File, Folder, ImageIcon, Paperclip, Sparkles, X } from "lucide-react";
import { useEffect, useRef, type ReactElement } from "react";
import type { SkillListItem, TopicAttachment, TopicFileReference } from "../types.js";

export type ComposerContextKind = "skills" | "files" | "attachments";

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

export function ComposerContextSourcesPopover({
  kind,
  skills = [],
  activeSkillIds = [],
  selectedFileRefs = [],
  attachments = [],
  onToggleSkill,
  onSelectedFileRefsChange,
  onRemoveAttachment,
  onClose,
}: {
  kind: ComposerContextKind | null;
  skills?: SkillListItem[];
  activeSkillIds?: string[];
  selectedFileRefs?: TopicFileReference[];
  attachments?: ComposerContextAttachment[];
  onToggleSkill?: (skillId: string) => void | Promise<void>;
  onSelectedFileRefsChange?: (refs: TopicFileReference[]) => void;
  onRemoveAttachment?: (id: string) => void | Promise<void>;
  onClose?: () => void;
}): ReactElement | null {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const activeSkills = activeSkillIds.map((skillId) => skills.find((skill) => skill.skillId === skillId) ?? fallbackSkill(skillId));
  const activeCount = kind === "skills" ? activeSkills.length : kind === "files" ? selectedFileRefs.length : kind === "attachments" ? attachments.length : 0;

  useEffect(() => {
    if (!kind) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose?.();
    };
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (popoverRef.current?.contains(target)) return;
      if ((target as Element).closest?.(".composer-context-chip")) return;
      onClose?.();
    };
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("pointerdown", handlePointerDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("pointerdown", handlePointerDown);
    };
  }, [kind, onClose]);

  if (!kind || activeCount === 0) return null;
  return (
    <div
      ref={popoverRef}
      className="composer-context-popover"
      aria-label={contextKindAriaLabel(kind)}
      data-testid="composer-context-popover"
    >
      {kind === "skills" ? (
        <section className="composer-context-group">
          <header>
            <strong><Sparkles size={13} />技能 {activeSkills.length}</strong>
          </header>
          <div className="composer-context-list">
            {activeSkills.map((skill) => (
              <ContextRow
                key={skill.skillId}
                icon={<Sparkles size={14} />}
                title={skill.name}
                detail={sourceKindLabel(skill.sourceKind)}
                actionLabel={`移除技能 ${skill.name}`}
                onRemove={onToggleSkill ? () => void onToggleSkill(skill.skillId) : undefined}
              />
            ))}
          </div>
        </section>
      ) : null}
      {kind === "files" ? (
        <section className="composer-context-group">
          <header><strong><File size={13} />文件 {selectedFileRefs.length}</strong></header>
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
      {kind === "attachments" ? (
        <section className="composer-context-group">
          <header><strong><Paperclip size={13} />附件 {attachments.length}</strong></header>
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
    scope: "user",
    contentHash: "",
    compatibility: { requiredCapabilities: [] },
    enabledProject: false,
    enabledTopics: [],
    disabledTopics: [],
    providerBindings: [],
    providerEnabled: true,
    required: false,
    runtimeAssigned: false,
  };
}

function sourceKindLabel(kind: SkillListItem["sourceKind"]): string {
  if (kind === "system-aho") return "AHO 内置";
  if (kind === "provider-native") return "服务原生技能";
  if (kind === "project-harness") return "项目 Harness";
  return "自定义技能";
}

function contextKindAriaLabel(kind: ComposerContextKind): string {
  if (kind === "skills") return "本次发送的技能上下文";
  if (kind === "files") return "本次发送的文件上下文";
  return "本次发送的附件上下文";
}

function formatContextSize(size: number): string {
  if (size >= 1024 * 1024) return `${(size / 1024 / 1024).toFixed(1)} MB`;
  if (size >= 1024) return `${Math.ceil(size / 1024)} KB`;
  return `${size} B`;
}
