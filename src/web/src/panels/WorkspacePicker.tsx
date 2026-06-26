import { useMemo, useState, type ReactElement } from "react";
import {
  Check,
  ChevronDown,
  Folder,
  FolderPlus,
  Search,
} from "lucide-react";
import { ProjectAddForm, ProjectCreateForm } from "./ProjectPanels.js";
import type { ProjectStatus } from "../types.js";

export function WorkspacePicker({
  projects,
  selectedProjectId,
  onOpenProject,
  onRefresh,
}: {
  projects: ProjectStatus[];
  selectedProjectId: string | null;
  onOpenProject: (projectId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}): ReactElement | null {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<"closed" | "add" | "new">("closed");
  const selectedProject = projects.find((item) => item.project?.id === selectedProjectId) ?? null;
  const normalizedQuery = query.trim().toLowerCase();
  const filteredProjects = useMemo(() => {
    if (!normalizedQuery) return projects;
    return projects.filter((item) => {
      const name = item.project?.name ?? item.path;
      return name.toLowerCase().includes(normalizedQuery) || item.path.toLowerCase().includes(normalizedQuery);
    });
  }, [normalizedQuery, projects]);

  if (!selectedProject?.project) return null;

  async function afterProjectAdded(projectId?: string): Promise<void> {
    await onRefresh();
    if (projectId) await onOpenProject(projectId);
    setMode("closed");
    setOpen(false);
    setQuery("");
  }

  async function selectProject(projectId: string): Promise<void> {
    await onOpenProject(projectId);
    setOpen(false);
    setMode("closed");
    setQuery("");
  }

  return (
    <div className="workspace-picker">
      <button
        type="button"
        className="home-chat-workspace-trigger"
        aria-label="选择项目"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        title={selectedProject.path}
      >
        <span>{selectedProject.project.name}</span>
        <ChevronDown size={16} aria-hidden />
      </button>

      {open ? (
        <div className="workspace-picker-popover" role="dialog" aria-label="项目选择器">
          <label className="workspace-picker-search">
            <Search size={15} aria-hidden />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索项目"
              aria-label="搜索项目"
              autoComplete="off"
            />
          </label>

          <div className="workspace-picker-list" role="list" aria-label="项目列表">
            {filteredProjects.length === 0 ? <div className="workspace-picker-empty">没有匹配的项目。</div> : null}
            {filteredProjects.map((item) => {
              const projectId = item.project?.id;
              const name = item.project?.name ?? item.path;
              const selected = projectId === selectedProjectId;
              return (
                <button
                  key={projectId ?? item.path}
                  type="button"
                  className="workspace-picker-item"
                  disabled={!projectId}
                  data-selected={selected ? "true" : undefined}
                  onClick={() => projectId ? void selectProject(projectId) : undefined}
                >
                  <Folder size={15} aria-hidden />
                  <span className="workspace-picker-item-main">
                    <strong>{name}</strong>
                    <small>{item.path}</small>
                  </span>
                  {selected ? <Check size={15} aria-hidden /> : null}
                </button>
              );
            })}
          </div>

          <div className="workspace-picker-actions">
            <button
              type="button"
              className={`workspace-picker-action ${mode === "add" ? "selected" : ""}`}
              onClick={() => setMode(mode === "add" ? "closed" : "add")}
            >
              <Folder size={15} aria-hidden />添加已有项目
            </button>
            <button
              type="button"
              className={`workspace-picker-action ${mode === "new" ? "selected" : ""}`}
              onClick={() => setMode(mode === "new" ? "closed" : "new")}
            >
              <FolderPlus size={15} aria-hidden />新建项目
            </button>
          </div>

          {mode === "add" ? <ProjectAddForm onDone={afterProjectAdded} /> : null}
          {mode === "new" ? <ProjectCreateForm onDone={afterProjectAdded} /> : null}
        </div>
      ) : null}
    </div>
  );
}
