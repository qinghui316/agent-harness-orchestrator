import { FileDiff, RefreshCw } from "lucide-react";
import { useEffect, useState, type ReactElement } from "react";
import { fetchJson } from "../../api.js";
import type { ProjectGitDiffResult, ProjectGitDiffSection } from "../../types.js";

export function GitDiffViewer({
  projectId,
  selectedPath,
}: {
  projectId: string | null;
  selectedPath: string | null;
}): ReactElement {
  const [diff, setDiff] = useState<ProjectGitDiffResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDiff(): Promise<void> {
    if (!projectId || !selectedPath) return;
    setLoading(true);
    setError(null);
    try {
      setDiff(await fetchJson<ProjectGitDiffResult>(`/api/projects/${encodeURIComponent(projectId)}/git/diff?path=${encodeURIComponent(selectedPath)}`));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setDiff(null);
    void loadDiff();
  }, [projectId, selectedPath]);

  return (
    <section className="git-diff-viewer" data-testid="git-diff-viewer" aria-label="Git Diff">
      <header className="git-diff-header">
        <div>
          <p className="eyebrow">Git Diff</p>
          <h2>{selectedPath ?? "选择一个变更文件"}</h2>
          <p>{selectedPath ? "只读查看当前项目里的 Git patch。" : "在右侧 Git 面板选择文件后，这里会显示大尺寸 diff。"}</p>
        </div>
        <button type="button" className="icon-button" aria-label="刷新 diff" disabled={!selectedPath} onClick={() => void loadDiff()}>
          <RefreshCw size={16} aria-hidden="true" />
        </button>
      </header>
      {error ? <div className="project-files-error">{error}</div> : null}
      {loading ? <div className="git-diff-empty">正在读取 diff...</div> : null}
      {!loading && !selectedPath ? (
        <div className="git-diff-empty">
          <FileDiff size={28} aria-hidden="true" />
          <strong>从右侧 Git 面板选择文件</strong>
          <span>这里不会执行 stage、commit、push 或其他 Git 写操作。</span>
        </div>
      ) : null}
      {!loading && selectedPath && diff && diff.status !== "text" && diff.status !== "too-large" ? (
        <div className="git-diff-empty">
          <strong>{diff.name}</strong>
          <span>{diff.message ?? "此文件没有可显示的文本 diff。"}</span>
        </div>
      ) : null}
      {!loading && diff && (diff.status === "text" || diff.status === "too-large") ? (
        <div className="git-diff-content">
          {diff.message ? <div className="project-files-note">{diff.message}</div> : null}
          <div className="git-diff-stats">+{diff.additions ?? 0} -{diff.deletions ?? 0}</div>
          {diff.sections.map((section) => <DiffSection key={`${section.kind}:${diff.relativePath}`} section={section} />)}
        </div>
      ) : null}
    </section>
  );
}

function DiffSection({ section }: { section: ProjectGitDiffSection }): ReactElement {
  return (
    <section className="git-diff-section">
      <h3>{section.label}{section.truncated ? " · 已截断" : ""}</h3>
      <pre>
        {section.patch.split(/\n/).map((line, index) => (
          <span key={`${section.kind}:${index}`} className={diffLineClass(line)}>
            {line || " "}
          </span>
        ))}
      </pre>
    </section>
  );
}

function diffLineClass(line: string): string {
  if (line.startsWith("+++") || line.startsWith("---")) return "diff-line meta";
  if (line.startsWith("@@")) return "diff-line hunk";
  if (line.startsWith("+")) return "diff-line addition";
  if (line.startsWith("-")) return "diff-line deletion";
  if (line.startsWith("diff --git") || line.startsWith("index ")) return "diff-line meta";
  return "diff-line context";
}
