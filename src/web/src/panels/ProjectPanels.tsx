import { useState, type ReactElement } from "react";
import { Folder, Plus, ShieldCheck } from "lucide-react";
import { postJson } from "../api.js";
import type { FolderDialogResult, ProjectStatus, Snapshot } from "../types.js";

export function ProjectDetailsPanel({ project, snapshot, selected, onOpen, onRefresh }: { project: ProjectStatus; snapshot: Snapshot | undefined; selected: boolean; onOpen: () => void; onRefresh: () => void }): ReactElement {
  const memoryReady = snapshot?.memory.harnessReady ?? project.memory?.harnessReady ?? project.harness.readiness === "ready";
  const memoryMode = snapshot?.memory.memoryMode ?? project.memory?.memoryMode;
  const memoryIssue = project.managed && memoryMode === "external-local" && project.memory?.memoryAvailable === false
    ? "项目历史不可用"
    : null;
  return (
    <div className="project-details-panel">
      <InfoRow label="仓库" value={snapshot?.left.repo?.branch ?? (project.isGitRepo ? "已准备" : "未检测到 Git")} />
      <InfoRow label="项目状态" value={memoryIssue ?? (memoryReady ? "已准备" : "需要准备")} />
      <InfoRow label="运行环境" value={project.codexTrust?.trusted ? "Codex 已可用" : "需要确认 Codex"} />
      <InfoRow label="Codex" value={project.codexTrust?.trusted ? "项目已信任" : "需要确认信任"} />
      {!project.codexTrust?.trusted ? <CodexTrustButton project={project} onDone={onRefresh} /> : null}
      {project.project && !memoryReady && !memoryIssue ? <ProjectPrepareButton projectId={project.project.id} onDone={async () => onRefresh()} /> : null}
      {!selected && memoryReady ? <button className="project-detail-action" onClick={onOpen}>打开项目</button> : null}
      <button className="project-detail-action" onClick={onRefresh}>刷新项目</button>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="info-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function ProjectAddForm({ onDone }: { onDone: (projectId?: string) => Promise<void> }): ReactElement {
  const [path, setPath] = useState("");
  const [name, setName] = useState("");
  const [manual, setManual] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(selectedPath = path): Promise<void> {
    const response = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: selectedPath, name: name || undefined, confirm: true }),
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json() as { project: { id: string } };
    setMessage("项目已添加。");
    await onDone(result.project.id);
  }
  async function chooseFolder(): Promise<void> {
    setMessage(null);
    const result = await postJson<FolderDialogResult>("/api/dialog/open-folder", {});
    if (result.path) {
      setPath(result.path);
      await submit(result.path);
      return;
    }
    if (result.supported === false) {
      setManual(true);
      setMessage("当前系统无法打开文件夹选择器，请手动输入路径。");
      return;
    }
    if (result.canceled) {
      setMessage("已取消选择。");
      return;
    }
    setManual(true);
    setMessage(result.error ?? "无法打开文件夹选择器，请手动输入路径。");
  }
  return (
    <form className="project-form" onSubmit={(event) => { event.preventDefault(); void submit().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause))); }}>
      <button type="button" className="primary-button" onClick={() => void chooseFolder().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause)))}><Folder size={15} />打开文件夹</button>
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="项目名称，可选" />
      <button type="button" className="text-button" onClick={() => setManual(!manual)}>{manual ? "收起路径输入" : "输入路径"}</button>
      {manual ? (
        <>
          <input value={path} onChange={(event) => setPath(event.target.value)} placeholder="项目路径，例如 E:\\work\\my-app" />
          <button className="outline-button"><Plus size={15} />添加项目</button>
        </>
      ) : null}
      {message ? <small>{message}</small> : null}
    </form>
  );
}

export function ProjectCreateForm({ onDone }: { onDone: (projectId?: string) => Promise<void> }): ReactElement {
  const [parentPath, setParentPath] = useState("");
  const [name, setName] = useState("");
  const [git, setGit] = useState(true);
  const [readme, setReadme] = useState(true);
  const [initialCommit, setInitialCommit] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  async function submit(): Promise<void> {
    const response = await fetch("/api/projects/new", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ parentPath, name, git, readme, initialCommit, confirm: true }),
    });
    if (!response.ok) throw new Error(await response.text());
    const result = await response.json() as { project: { id: string } };
    setMessage("新项目已创建并注册。");
    await onDone(result.project.id);
  }
  async function chooseParent(): Promise<void> {
    setMessage(null);
    const result = await postJson<FolderDialogResult>("/api/dialog/open-folder", {});
    if (result.path) {
      setParentPath(result.path);
      return;
    }
    if (result.supported === false) {
      setMessage("当前系统无法打开文件夹选择器，请手动输入父目录。");
      return;
    }
    if (result.canceled) {
      setMessage("已取消选择。");
      return;
    }
    setMessage(result.error ?? "无法打开文件夹选择器，请手动输入父目录。");
  }
  return (
    <form className="project-form" onSubmit={(event) => { event.preventDefault(); void submit().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause))); }}>
      <button type="button" className="outline-button" onClick={() => void chooseParent().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause)))}><Folder size={15} />选择位置</button>
      <input value={parentPath} onChange={(event) => setParentPath(event.target.value)} placeholder="保存位置，例如 E:\\work" />
      <input value={name} onChange={(event) => setName(event.target.value)} placeholder="项目名" />
      <label><input type="checkbox" checked={git} onChange={(event) => setGit(event.target.checked)} /> 初始化 Git</label>
      <label><input type="checkbox" checked={readme} onChange={(event) => setReadme(event.target.checked)} /> 创建 README</label>
      <label><input type="checkbox" checked={initialCommit} onChange={(event) => setInitialCommit(event.target.checked)} /> 创建初始提交</label>
      <button className="primary-button"><Plus size={15} />新建项目</button>
      {message ? <small>{message}</small> : null}
    </form>
  );
}

export function ProjectPrepareButton({ projectId, onDone }: { projectId: string; onDone: () => Promise<void> }): ReactElement {
  const [message, setMessage] = useState<string | null>(null);
  async function init(): Promise<void> {
    const response = await fetch(`/api/projects/${encodeURIComponent(projectId)}/harness/init`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ memoryMode: "external-local", confirm: true }),
    });
    if (!response.ok) throw new Error(await response.text());
    setMessage("项目已准备。");
    await onDone();
  }
  return (
    <>
      <button className="secondary-button" onClick={() => void init().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause)))}>准备项目</button>
      {message ? <small>{message}</small> : null}
    </>
  );
}

export const HarnessInitButton = ProjectPrepareButton;

export function CodexTrustButton({ project, onDone }: { project: ProjectStatus; onDone: () => void }): ReactElement | null {
  const [message, setMessage] = useState<string | null>(project.codexTrust?.reason ?? null);
  if (!project.project) return null;
  async function trust(): Promise<void> {
    const response = await fetch(`/api/projects/${encodeURIComponent(project.project!.id)}/codex/trust`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }),
    });
    if (!response.ok) throw new Error(await response.text());
    setMessage(`已写入 ${project.codexTrust?.configPath ?? "Codex config.toml"}`);
    onDone();
  }
  return (
    <div className="project-trust-action">
      <button className="project-detail-action" onClick={() => void trust().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause)))}>
        <ShieldCheck size={15} />信任 Codex 项目
      </button>
      {message ? <small>{message}</small> : null}
    </div>
  );
}
