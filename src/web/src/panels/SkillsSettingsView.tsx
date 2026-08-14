import { useEffect, useMemo, useRef, useState, type ReactElement } from "react";
import { FileText, Folder, RefreshCw, Sparkles } from "lucide-react";
import { fetchJson, postJson } from "../api.js";
import type { ProductMode, SkillListItem, SkillRootListItem } from "../types.js";

export function SkillsSettingsView({
  projectId,
  productMode,
  conversationId,
  providerId,
  onRefresh,
}: {
  projectId: string | null;
  productMode: ProductMode;
  conversationId: string | null;
  providerId: string | null;
  onRefresh: () => Promise<void>;
}): ReactElement {
  const [skills, setSkills] = useState<SkillListItem[]>([]);
  const [roots, setRoots] = useState<SkillRootListItem[]>([]);
  const [rootPath, setRootPath] = useState("");
  const [query, setQuery] = useState("");
  const [selectedSkillId, setSelectedSkillId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [catalogErrors, setCatalogErrors] = useState<Array<{ path: string; message: string }>>([]);
  const requestGenerationRef = useRef(0);
  const actionGenerationRef = useRef(0);
  const identityKey = skillSettingsIdentityKey(projectId, productMode, conversationId, providerId);
  const identityKeyRef = useRef(identityKey);
  identityKeyRef.current = identityKey;

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
  const selectedTarget = selectedSkill?.providerBindings[0];

  async function load(): Promise<void> {
    const generation = ++requestGenerationRef.current;
    const requestIdentityKey = identityKey;
    if (!projectId) {
      if (generation === requestGenerationRef.current && requestIdentityKey === identityKeyRef.current) {
        setSkills([]);
        setRoots([]);
        setSelectedSkillId(null);
        setCatalogErrors([]);
      }
      return;
    }
    const params = skillSearchParams(productMode, conversationId, providerId);
    const payload = await fetchJson<{ roots?: SkillRootListItem[]; skills?: SkillListItem[]; errors?: Array<{ path: string; message: string }> }>(`/api/projects/${encodeURIComponent(projectId)}/skills?${params.toString()}`);
    if (generation !== requestGenerationRef.current || requestIdentityKey !== identityKeyRef.current) return;
    const nextSkills = Array.isArray(payload.skills) ? payload.skills : [];
    setRoots(Array.isArray(payload.roots) ? payload.roots : []);
    setSkills(nextSkills);
    setCatalogErrors(Array.isArray(payload.errors) ? payload.errors : []);
    setSelectedSkillId((current) => current && nextSkills.some((skill) => skill.skillId === current) ? current : nextSkills[0]?.skillId ?? null);
  }

  useEffect(() => {
    const requestIdentityKey = identityKey;
    const requestGeneration = requestGenerationRef.current + 1;
    load().catch((cause: unknown) => {
      if (requestGeneration === requestGenerationRef.current && requestIdentityKey === identityKeyRef.current) {
        setMessage(cause instanceof Error ? cause.message : String(cause));
      }
    });
    return () => {
      requestGenerationRef.current += 1;
      actionGenerationRef.current += 1;
    };
  }, [projectId, productMode, conversationId, providerId]);

  async function run(action: () => Promise<void>): Promise<boolean> {
    if (!projectId) return false;
    const generation = ++actionGenerationRef.current;
    const actionIdentityKey = identityKey;
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (generation !== actionGenerationRef.current || actionIdentityKey !== identityKeyRef.current) return false;
      await load();
      if (generation !== actionGenerationRef.current || actionIdentityKey !== identityKeyRef.current) return false;
      await onRefresh();
      return generation === actionGenerationRef.current && actionIdentityKey === identityKeyRef.current;
    } catch (cause) {
      if (generation === actionGenerationRef.current && actionIdentityKey === identityKeyRef.current) {
        setMessage(cause instanceof Error ? cause.message : String(cause));
      }
      return false;
    } finally {
      if (generation === actionGenerationRef.current && actionIdentityKey === identityKeyRef.current) setBusy(false);
    }
  }

  if (!projectId) {
    return (
      <section className="settings-empty-state">
        <Sparkles size={24} />
        <h3>选择项目后管理技能</h3>
        <p>技能只影响 Agent Provider 的可用能力，不会自动执行项目操作。</p>
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
          <button className="outline-button" disabled={busy} onClick={() => run(async () => { await postJson(`/api/projects/${encodeURIComponent(projectId)}/skills`, skillRequestBody(productMode, conversationId, providerId)); })}>
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
              onClick={async () => {
                const added = await run(async () => {
                  await postJson(`/api/projects/${encodeURIComponent(projectId)}/skill-roots`, { rootPath: rootPath.trim(), sourceKind: "custom", ...skillRequestBody(productMode, conversationId, providerId) });
                });
                if (added) setRootPath("");
              }}
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
            const target = skill.providerBindings[0];
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
                  <span className={`skill-sync-state ${target?.status ?? "unavailable"}`}>{runtimeStatusLabel(target?.status, target?.bindingKind)}</span>
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
                {selectedSkill.required || selectedSkill.runtimeAssigned ? (
                  <span className="skill-runtime-assignment">由 AHO 运行时加载</span>
                ) : (
                  <label className="settings-toggle-row">
                    <input
                      type="checkbox"
                      checked={selectedSkill.providerEnabled}
                      disabled={busy || selectedSkill.sourceKind === "project-harness"}
                      onChange={(event) => run(async () => {
                        await postJson(`/api/projects/${encodeURIComponent(projectId)}/skills/${encodeURIComponent(selectedSkill.skillId)}/provider-enable`, { enabled: event.target.checked, ...skillRequestBody(productMode, conversationId, providerId) });
                      })}
                    />
                    <span>Provider 全局启用</span>
                  </label>
                )}
              </div>
            </header>
            <div className="settings-info-grid">
              <Info label="来源" value={sourceKindLabel(selectedSkill.sourceKind)} />
              <Info label="运行状态" value={runtimeStatusLabel(selectedTarget?.status, selectedTarget?.bindingKind)} />
              <Info label="作用域" value={scopeLabel(selectedSkill.scope)} />
              <Info label="路径" value={selectedSkill.sourcePath} />
            </div>
            <div className="skill-package-summary">
              <h4>包内容</h4>
              <p>这个 Skill 由当前 Agent Provider 从原始路径直接加载；AHO 不复制或改写 Skill 包内容。</p>
              <div className="skill-package-items">
                <span><FileText size={13} />SKILL.md</span>
                <span>references/</span>
                <span>examples/</span>
                <span>scripts/</span>
              </div>
            </div>
            {catalogErrors.map((error) => <p className="diagnostic-errors" key={`${error.path}:${error.message}`}>{error.path}: {error.message}</p>)}
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

function skillRequestBody(productMode: ProductMode, conversationId: string | null, providerId: string | null) {
  return {
    productMode,
    conversationId: conversationId ?? undefined,
    providerId: providerId ?? undefined,
  };
}

export function skillSettingsIdentityKey(
  projectId: string | null,
  productMode: ProductMode,
  conversationId: string | null,
  providerId: string | null,
): string {
  return [projectId ?? "", productMode, conversationId ?? "", providerId ?? ""].join("\0");
}

function skillSearchParams(productMode: ProductMode, conversationId: string | null, providerId: string | null): URLSearchParams {
  const params = new URLSearchParams({ productMode });
  if (conversationId) params.set("conversationId", conversationId);
  if (providerId) params.set("providerId", providerId);
  return params;
}

function Info({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="settings-info-item">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
    </div>
  );
}

function runtimeStatusLabel(status: SkillListItem["providerBindings"][number]["status"] | undefined, _bindingKind?: SkillListItem["providerBindings"][number]["bindingKind"]): string {
  if (status === "ready") return "Provider 原生可用";
  if (status === "disabled") return "Provider 已禁用";
  return "Provider 不可用";
}

function sourceKindLabel(kind: string): string {
  if (kind === "system-aho") return "AHO 内置";
  if (kind === "provider-native") return "Provider 原生";
  if (kind === "project-harness") return "项目 Harness";
  if (kind === "custom") return "自定义";
  return kind;
}

function scopeLabel(scope: SkillListItem["scope"]): string {
  if (scope === "repo") return "项目";
  if (scope === "user") return "用户";
  if (scope === "system") return "系统";
  return "管理员";
}
