import { useEffect, useMemo, useState, type ReactElement } from "react";
import { FileText, Folder, RefreshCw, Sparkles } from "lucide-react";
import { fetchJson, postJson } from "../api.js";
import type { SkillListItem, SkillRootListItem } from "../types.js";

export function SkillsSettingsView({
  projectId,
  onRefresh,
}: {
  projectId: string | null;
  onRefresh: () => Promise<void>;
}): ReactElement {
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [roots, setRoots] = useState<SkillRootListItem[]>([]);
  const [rootPath, setRootPath] = useState("");
  const [query, setQuery] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const filteredSkills = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return skills;
    return skills.filter((skill) => [
      skill.name,
      skill.skillId,
      skill.description,
      skill.sourcePath,
      skill.sourceKind,
    ].some((value) => value.toLowerCase().includes(normalized)));
  }, [query, skills]);
  const selectedSkill = skills.find((skill) => skill.skillId === selectedSkillId) ?? filteredSkills[0] ?? null;
  const selectedTarget = selectedSkill?.runtimeTargets.find((item) => item.provider === "codex");
  const selectedNative = selectedTarget?.status === "native";

  async function load(): Promise<void> {
    if (!projectId) {
      setSkills([]);
      setRoots([]);
      setSelectedSkillId(null);
      return;
    }
    const payload = await fetchJson<{ roots?: SkillRootListItem[]; skills?: SkillListItem[] }>(`/api/projects/${encodeURIComponent(projectId)}/skills`);
    const nextSkills = Array.isArray(payload.skills) ? payload.skills : [];
    setRoots(Array.isArray(payload.roots) ? payload.roots : []);
    setSkills(nextSkills);
    setSelectedSkillId((current) => current && nextSkills.some((skill) => skill.skillId === current) ? current : nextSkills[0]?.skillId ?? null);
  }

  useEffect(() => {
    load().catch((cause: unknown) => setMessage(cause instanceof Error ? cause.message : String(cause)));
  }, [projectId]);

  async function run(action: () => Promise<void>): Promise<void> {
    if (!projectId) return;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      await load();
      await onRefresh();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  if (!projectId) {
    return (
      <section className="settings-empty-state">
        <Sparkles size={24} />
        <h3>选择项目后管理技能</h3>
        <p>技能只影响 Codex 使用能力，不会自动执行项目操作。</p>
      </section>
    );
  }

  return (
    <section className="skills-settings-view" aria-label="技能设置">
      <aside className="skills-settings-browser">
        <header className="settings-section-header">
          <div>
            <h3>技能</h3>
            <p>{skills.length} 个可用 Skill</p>
          </div>
          <button className="outline-button" disabled={busy} onClick={() => run(async () => { await postJson(`/api/projects/${encodeURIComponent(projectId)}/skills`, {}); })}>
            <RefreshCw size={14} />刷新
          </button>
        </header>

        <input
          className="settings-search-input"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索 Skill"
          aria-label="搜索 Skill"
        />

        <details className="skill-source-manager">
          <summary>自定义 Skill 目录</summary>
          <div className="skill-root-form compact">
            <input
              value={rootPath}
              onChange={(event) => setRootPath(event.target.value)}
              placeholder="添加本机 Skill 文件夹"
              aria-label="Skill 根目录"
            />
            <button
              className="outline-button"
              disabled={busy || !rootPath.trim()}
              onClick={() => run(async () => {
                await postJson(`/api/projects/${encodeURIComponent(projectId)}/skill-roots`, { rootPath: rootPath.trim(), sourceKind: "custom" });
                setRootPath("");
              })}
            >添加</button>
          </div>

          <div className="skill-root-list" aria-label="已添加 Skill 目录">
            {roots.length === 0 ? <span>未添加自定义目录。</span> : roots.map((root) => (
              <span key={root.rootPath} title={root.rootPath}><Folder size={12} />{sourceKindLabel(root.sourceKind)}: {root.rootPath}</span>
            ))}
          </div>
        </details>

        <div className="skills-settings-list" role="list" aria-label="Skill 列表">
          {filteredSkills.length === 0 ? <p className="muted-copy">还没有扫描到 Skill。</p> : filteredSkills.map((skill) => {
            const target = skill.runtimeTargets.find((item) => item.provider === "codex");
            const active = selectedSkill?.skillId === skill.skillId;
            return (
              <button
                key={skill.skillId}
                type="button"
                className={`skills-settings-list-item ${active ? "selected" : ""}`}
                onClick={() => setSelectedSkillId(skill.skillId)}
              >
                <span className="skill-list-icon"><Sparkles size={14} /></span>
                <span className="skill-list-main">
                  <strong>{skill.name}</strong>
                  <small>{skill.description || "无描述"}</small>
                </span>
                <span className="skill-list-meta">
                  <span className="skill-source-badge">{sourceKindLabel(skill.sourceKind)}</span>
                  <span className={`skill-sync-state ${target?.status ?? "not-synced"}`}>{runtimeStatusLabel(target?.status)}</span>
                </span>
              </button>
            );
          })}
        </div>
      </aside>

      <section className="skills-settings-detail" aria-label="Skill 详情">
        {selectedSkill ? (
          <>
            <header className="settings-section-header">
              <div>
                <h3>{selectedSkill.name}</h3>
                <p>{selectedSkill.description || "无描述"}</p>
              </div>
              <div className="settings-inline-actions">
                {!selectedNative ? (
                  <button className="outline-button" disabled={busy} onClick={() => run(async () => { await postJson(`/api/projects/${encodeURIComponent(projectId)}/skills/codex-bridge/sync`, {}); })}>同步到 Codex</button>
                ) : null}
              </div>
            </header>
            <div className="settings-info-grid">
              <Info label="来源" value={sourceKindLabel(selectedSkill.sourceKind)} />
              <Info label="运行状态" value={runtimeStatusLabel(selectedTarget?.status)} />
              <Info label="路径" value={selectedSkill.sourcePath} />
            </div>
            <div className="skill-package-summary">
              <h4>包内容</h4>
              <p>{selectedNative ? "这个 Skill 来自 Codex，可直接选择使用。" : "同步后可供 Codex 使用；scripts 只作为 Skill 包内容保留，AHO 不直接执行。"}</p>
              <div className="skill-package-items">
                <span><FileText size={13} />SKILL.md</span>
                <span>references/</span>
                <span>examples/</span>
                <span>scripts/</span>
              </div>
            </div>
            {message ? <p className="diagnostic-errors">{message}</p> : null}
          </>
        ) : (
          <div className="settings-empty-state">
            <Sparkles size={24} />
            <h3>选择一个 Skill</h3>
            <p>添加 custom root 或刷新后，在左侧选择 Skill 查看详情。</p>
          </div>
        )}
      </section>
    </section>
  );
}

function Info({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="settings-info-item">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function runtimeStatusLabel(status: SkillListItem["runtimeTargets"][number]["status"] | undefined): string {
  if (status === "native") return "Codex 可用";
  if (status === "synced") return "已同步";
  if (status === "out-of-sync") return "需要重新同步";
  return "需要同步";
}

function sourceKindLabel(kind: string): string {
  if (kind === "system-aho") return "AHO 内置";
  if (kind === "global-codex") return "Codex";
  if (kind === "project-codex") return "项目";
  if (kind === "custom") return "自定义";
  if (kind === "managed") return "AHO";
  return kind;
}
