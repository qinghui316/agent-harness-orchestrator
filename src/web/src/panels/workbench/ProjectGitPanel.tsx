import { ChevronDown, ChevronRight, FileText, GitBranch, Link2, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent, type PointerEvent, type ReactElement } from "react";
import { fetchJson } from "../../api.js";
import type { ProjectGitFileStatus, ProjectGitStatusResult, TopicFileReference } from "../../types.js";
import { GitDiffViewer } from "./GitDiffViewer.js";

export function ProjectGitPanel({
  projectId,
  selectedPath,
  selectedRefs,
  onSelectedPathChange,
  onSelectedRefsChange,
}: {
  projectId: string | null;
  selectedPath: string | null;
  selectedRefs: TopicFileReference[];
  onSelectedPathChange: (relativePath: string) => void;
  onSelectedRefsChange: (refs: TopicFileReference[]) => void;
}): ReactElement {
  const [status, setStatus] = useState<ProjectGitStatusResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<ProjectGitFileStatus["group"]>>(new Set());

  async function loadStatus(): Promise<void> {
    if (!projectId) return;
    setLoading(true);
    setError(null);
    try {
      setStatus(await fetchJson<ProjectGitStatusResult>(`/api/projects/${encodeURIComponent(projectId)}/git/status`));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function insertReference(file: ProjectGitFileStatus): void {
    if (selectedRefs.some((item) => item.relativePath === file.relativePath)) return;
    onSelectedRefsChange([...selectedRefs, {
      relativePath: file.relativePath,
      name: file.name,
      kind: "file",
      source: "composer",
    }]);
  }

  function openGitRowFromEvent(target: EventTarget | null): void {
    if (!(target instanceof HTMLElement)) return;
    if (target.closest("[data-git-ref-button]")) return;
    const row = target.closest<HTMLElement>("[data-git-file-path]");
    const relativePath = row?.dataset.gitFilePath;
    if (!relativePath) return;
    onSelectedPathChange(relativePath);
  }

  function handleGitRowPointerDown(event: PointerEvent<HTMLElement>): void {
    openGitRowFromEvent(event.target);
  }

  function handleGitRowMouseDown(event: MouseEvent<HTMLElement>): void {
    if ((event.target as HTMLElement | null)?.closest("[data-git-ref-button]")) return;
    openGitRowFromEvent(event.target);
  }

  useEffect(() => {
    void loadStatus();
  }, [projectId]);

  const dirtyCount = useMemo(() => (status?.staged.length ?? 0) + (status?.unstaged.length ?? 0) + (status?.untracked.length ?? 0), [status]);
  const hasChanges = Boolean(status && dirtyCount > 0);

  function toggleGroup(group: ProjectGitFileStatus["group"]): void {
    setCollapsedGroups((current) => {
      const next = new Set(current);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }

  if (!projectId) {
    return <div className="project-git-panel empty-state" data-testid="project-git-panel">选择项目后可查看 Git 状态。</div>;
  }

  return (
    <section
      className="project-git-panel"
      data-testid="project-git-panel"
      aria-label="Git 状态"
      onPointerDownCapture={handleGitRowPointerDown}
      onMouseDownCapture={handleGitRowMouseDown}
    >
      <header className="project-git-header">
        <div>
          <strong>Git</strong>
          <small>{status?.isGitRepository ? `${dirtyCount} 个变更` : "只读状态"}</small>
        </div>
        <button type="button" className="icon-button" aria-label="刷新 Git 状态" data-testid="project-git-refresh" onClick={() => void loadStatus()}>
          <RefreshCw size={15} aria-hidden="true" />
        </button>
      </header>

      {error ? <div className="project-files-error">{error}</div> : null}
      {loading ? <div className="project-files-empty">正在读取 Git 状态...</div> : null}
      {!loading && status && !status.isGitRepository ? (
        <div className="project-git-empty">{status.message ?? "当前项目不是 Git 仓库。"}</div>
      ) : null}
      {!loading && status?.isGitRepository ? (
        <>
          <div className="project-git-summary">
            <span><GitBranch size={14} aria-hidden="true" />{status.branch ?? "未命名分支"}</span>
            <span className={status.dirty ? "dirty" : "clean"}>{status.dirty ? "有变更" : "干净"}</span>
            <span className="diff-stats">+{status.totalAdditions} -{status.totalDeletions}</span>
          </div>
          {!hasChanges ? <div className="project-git-empty compact">当前工作区没有 Git 变更。</div> : null}
          <GitFileGroup
            title="已暂存"
            group="staged"
            files={status.staged}
            collapsed={collapsedGroups.has("staged")}
            onToggle={() => toggleGroup("staged")}
            selectedPath={selectedPath}
            onSelectedPathChange={onSelectedPathChange}
            onInsertReference={insertReference}
          />
          <GitFileGroup
            title="未暂存"
            group="unstaged"
            files={status.unstaged}
            collapsed={collapsedGroups.has("unstaged")}
            onToggle={() => toggleGroup("unstaged")}
            selectedPath={selectedPath}
            onSelectedPathChange={onSelectedPathChange}
            onInsertReference={insertReference}
          />
          <GitFileGroup
            title="未跟踪"
            group="untracked"
            files={status.untracked}
            collapsed={collapsedGroups.has("untracked")}
            onToggle={() => toggleGroup("untracked")}
            selectedPath={selectedPath}
            onSelectedPathChange={onSelectedPathChange}
            onInsertReference={insertReference}
          />
          <GitDiffViewer projectId={projectId} selectedPath={selectedPath} variant="rail" />
        </>
      ) : null}
    </section>
  );
}

function GitFileGroup({
  title,
  group,
  files,
  collapsed,
  onToggle,
  selectedPath,
  onSelectedPathChange,
  onInsertReference,
}: {
  title: string;
  group: ProjectGitFileStatus["group"];
  files: ProjectGitFileStatus[];
  collapsed: boolean;
  onToggle: () => void;
  selectedPath: string | null;
  onSelectedPathChange: (relativePath: string) => void;
  onInsertReference: (file: ProjectGitFileStatus) => void;
}): ReactElement {
  if (files.length === 0) return <></>;
  return (
    <section className="project-git-group" data-git-group={group}>
      <button type="button" className="project-git-group-header" onClick={onToggle} aria-expanded={!collapsed}>
        <span>
          {collapsed ? <ChevronRight size={13} aria-hidden="true" /> : <ChevronDown size={13} aria-hidden="true" />}
          {title}
        </span>
        <small>{files.length}</small>
      </button>
      {!collapsed ? files.map((file) => (
        <GitFileRow
          key={`${file.group}:${file.relativePath}`}
          file={file}
          selected={selectedPath === file.relativePath}
          onSelect={() => onSelectedPathChange(file.relativePath)}
          onInsertReference={() => onInsertReference(file)}
        />
      )) : null}
    </section>
  );
}

function GitFileRow({
  file,
  selected,
  onSelect,
  onInsertReference,
}: {
  file: ProjectGitFileStatus;
  selected: boolean;
  onSelect: () => void;
  onInsertReference: () => void;
}): ReactElement {
  const pathParts = splitPath(file.relativePath);
  const counts = formatCounts(file);
  return (
    <div
      className={`project-git-row ${selected ? "selected" : ""}`}
      data-git-file-path={file.relativePath}
      data-git-status={statusSymbol(file)}
      title={file.relativePath}
    >
      <button type="button" className="project-git-file-button" aria-label={file.relativePath} onClick={onSelect}>
        <span className={`project-git-status ${statusClass(file)}`}>{statusSymbol(file)}</span>
        <span className="project-git-file-icon" aria-hidden="true">
          <FileText size={14} />
        </span>
        <span className="project-git-file-text">
          <span className="project-git-file-name">{pathParts.name}</span>
          {pathParts.dir ? <span className="project-git-file-dir">{pathParts.dir}</span> : null}
        </span>
        {counts ? <span className="project-git-counts">{counts}</span> : null}
      </button>
      <button
        type="button"
        className="project-git-ref-button"
        data-git-ref-button
        aria-label={`引用 ${file.relativePath} 到输入框`}
        title="引用到输入框"
        onClick={onInsertReference}
      >
        <Link2 size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

function splitPath(path: string): { name: string; dir: string } {
  const parts = path.replace(/\\/g, "/").split("/").filter(Boolean);
  if (parts.length === 0) return { name: path, dir: "" };
  return {
    name: parts[parts.length - 1] ?? path,
    dir: parts.length > 1 ? parts.slice(0, -1).join("/") : "",
  };
}

function statusSymbol(file: ProjectGitFileStatus): string {
  if (file.indexStatus === "?" || file.worktreeStatus === "?") return "?";
  if (file.indexStatus === "A" || file.worktreeStatus === "A") return "A";
  if (file.indexStatus === "D" || file.worktreeStatus === "D") return "D";
  if (file.indexStatus === "R" || file.worktreeStatus === "R") return "R";
  if (file.indexStatus === "T" || file.worktreeStatus === "T") return "T";
  return "U";
}

function statusClass(file: ProjectGitFileStatus): string {
  const symbol = statusSymbol(file);
  if (symbol === "A" || symbol === "?") return "added";
  if (symbol === "D") return "deleted";
  if (symbol === "R") return "renamed";
  return "modified";
}

function formatCounts(file: ProjectGitFileStatus): string | null {
  const additions = file.additions ?? 0;
  const deletions = file.deletions ?? 0;
  if (additions === 0 && deletions === 0) return null;
  return `+${additions} / -${deletions}`;
}
