import { FileDiff, GitBranch, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState, type MouseEvent, type PointerEvent, type ReactElement } from "react";
import { fetchJson } from "../../api.js";
import type { ProjectGitFileStatus, ProjectGitStatusResult, TopicFileReference } from "../../types.js";

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
          <GitFileGroup
            title="已暂存"
            files={status.staged}
            selectedPath={selectedPath}
            onSelectedPathChange={onSelectedPathChange}
            onInsertReference={insertReference}
          />
          <GitFileGroup
            title="未暂存"
            files={status.unstaged}
            selectedPath={selectedPath}
            onSelectedPathChange={onSelectedPathChange}
            onInsertReference={insertReference}
          />
          <GitFileGroup
            title="未跟踪"
            files={status.untracked}
            selectedPath={selectedPath}
            onSelectedPathChange={onSelectedPathChange}
            onInsertReference={insertReference}
          />
        </>
      ) : null}
    </section>
  );
}

function GitFileGroup({
  title,
  files,
  selectedPath,
  onSelectedPathChange,
  onInsertReference,
}: {
  title: string;
  files: ProjectGitFileStatus[];
  selectedPath: string | null;
  onSelectedPathChange: (relativePath: string) => void;
  onInsertReference: (file: ProjectGitFileStatus) => void;
}): ReactElement {
  return (
    <section className="project-git-group">
      <h4>{title} <span>{files.length}</span></h4>
      {files.length === 0 ? <div className="project-files-empty">没有文件。</div> : null}
      {files.map((file) => (
        <div
          className={`project-git-row ${selectedPath === file.relativePath ? "selected" : ""}`}
          data-git-file-path={file.relativePath}
          key={`${file.group}:${file.relativePath}`}
        >
          <button type="button" onClick={() => onSelectedPathChange(file.relativePath)}>
            <FileDiff size={15} aria-hidden="true" />
            <span>{file.relativePath}</span>
            <small>{file.statusLabel}</small>
          </button>
          <button type="button" className="project-git-ref-button" data-git-ref-button onClick={() => onInsertReference(file)}>
            引用
          </button>
        </div>
      ))}
    </section>
  );
}
