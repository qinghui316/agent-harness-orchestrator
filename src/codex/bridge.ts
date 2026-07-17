import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { hashText, listAgentRoles, syncAgentCatalog } from "../agent/catalog.js";
import { resolveCodexHome } from "./home.js";
import { writeJsonFile } from "../fs/json.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import { copySkillToBridge, hashSkillDirectory, isRuntimeAssignedSkill, listSkills, type EnabledSkillRecord, type SkillListItem } from "../skill/catalog.js";
import type { ManagedProject, RunSkillRecord } from "../types/index.js";
import { openWorkbenchDatabase } from "../workbench/persistence/open-workbench-database.js";

export const AHO_BRIDGE_VERSION = "1.0";

export interface CodexBridgePaths {
  root: string;
  pluginJson: string;
  skillsRoot: string;
  agentsRoot: string;
  commandsRoot: string;
}

export interface CodexBridgeStatus {
  paths: CodexBridgePaths;
  installed: boolean;
  discoverable: boolean;
  manifestValid: boolean;
  state: "missing" | "installed" | "out-of-sync" | "not-discoverable";
  diagnostics: string[];
  project?: {
    id: string;
    enabledSkills: number;
    outOfSync: string[];
  };
}

export interface CodexBridgeInstallResult {
  paths: CodexBridgePaths;
  created: string[];
  manifest: string;
}

export interface CodexBridgeSyncResult {
  status: CodexBridgeStatus;
  synced: Array<{
    skillId: string;
    materializedSkillId: string;
    contentHash: string;
    materializedHash: string;
    path: string;
  }>;
  syncedAgents: Array<{
    roleId: string;
    contentHash: string;
    materializedHash: string;
    path: string;
  }>;
}

export interface CodexNativeSkillBinding {
  skillId: string;
  sourcePath: string;
  contentHash: string;
  scope: "project" | "global";
}

export function getCodexBridgePaths(): CodexBridgePaths {
  const codexHome = resolveCodexHome();
  const root = join(codexHome, "plugins", "aho-managed");
  return {
    root,
    pluginJson: join(root, "plugin.json"),
    skillsRoot: join(root, "skills"),
    agentsRoot: join(root, "agents"),
    commandsRoot: join(root, "commands"),
  };
}

export async function getCodexBridgeStatus(project?: ManagedProject): Promise<CodexBridgeStatus> {
  const paths = getCodexBridgePaths();
  const diagnostics: string[] = [];
  const installed = existsSync(paths.root) && existsSync(paths.pluginJson);
  let manifestValid = false;
  if (existsSync(paths.pluginJson)) {
    try {
      const raw = JSON.parse(await readFile(paths.pluginJson, "utf8")) as Record<string, unknown>;
      manifestValid = raw.name === "aho-managed" && raw.namespace === "aho";
      if (!manifestValid) diagnostics.push("Bridge plugin.json exists but is not the AHO-managed manifest.");
    } catch (error) {
      diagnostics.push(`Bridge plugin.json is not valid JSON: ${(error as Error).message}`);
    }
  } else {
    diagnostics.push("Bridge plugin.json is missing.");
  }
  const discoverable = installed && manifestValid && existsSync(paths.skillsRoot);
  if (installed && !discoverable) diagnostics.push("Bridge directory exists but expected plugin layout is incomplete.");

  let projectStatus: CodexBridgeStatus["project"];
  if (project) {
    const skills = await bindCodexSkillCatalog(project);
    const enabled = skills.filter((item) => item.enabledProject || item.enabledTopics.length > 0);
    const outOfSync: string[] = [];
    for (const skill of enabled) {
      if (skill.providerBindings[0]?.status !== "ready") outOfSync.push(skill.skillId);
    }
    projectStatus = { id: project.id, enabledSkills: enabled.length, outOfSync };
    if (outOfSync.length > 0) diagnostics.push(`Project has ${outOfSync.length} enabled skill(s) out of sync.`);
  }

  const state: CodexBridgeStatus["state"] =
    !installed ? "missing" :
      !discoverable ? "not-discoverable" :
        projectStatus && projectStatus.outOfSync.length > 0 ? "out-of-sync" :
          "installed";
  return { paths, installed, discoverable, manifestValid, state, diagnostics, project: projectStatus };
}

export async function bindCodexSkillCatalog(project: ManagedProject, skillsInput?: SkillListItem[]): Promise<SkillListItem[]> {
  const skills = skillsInput ?? await listSkills(project);
  const nativeSkills = await listNativeCodexSkills(project);
  const memory = await resolveProjectMemory(project);
  const store = await openWorkbenchDatabase(memory);
  try {
    const bound = skills.map((skill) => {
      const sync = store.skills.readBridgeSync(project.id, skill.skillId);
      const ready = Boolean(sync && existsSync(sync.materializedPath) && sync.sourceHash === skill.contentHash);
      return {
        ...skill,
        providerBindings: [{
          providerId: "codex",
          bindingKind: "materialized" as const,
          status: ready ? "ready" as const : sync ? "stale" as const : "unavailable" as const,
          contentHash: skill.contentHash,
        }],
      };
    });
    const known = new Set(bound.map((skill) => skill.skillId));
    return [
      ...bound,
      ...nativeSkills.filter((skill) => !known.has(skill.skillId)).map((skill): SkillListItem => ({
        skillId: skill.skillId,
        name: skill.skillId,
        description: "Provider-native Skill.",
        sourcePath: skill.sourcePath,
        sourceKind: "provider-native",
        contentHash: skill.contentHash,
        compatibility: { requiredCapabilities: ["skill.native-load"] },
        providerBindings: [{ providerId: "codex", bindingKind: "native", status: "ready", contentHash: skill.contentHash }],
        enabledProject: false,
        enabledTopics: [],
        disabledTopics: [],
      })),
    ];
  } finally {
    store.close();
  }
}

export async function bindCodexEnabledSkills(
  project: ManagedProject,
  records: EnabledSkillRecord[],
): Promise<{ records: RunSkillRecord[]; warnings: string[] }> {
  const memory = await resolveProjectMemory(project);
  const store = await openWorkbenchDatabase(memory);
  try {
    const warnings: string[] = [];
    const bound = records.map((record): RunSkillRecord => {
      const sync = store.skills.readBridgeSync(project.id, record.id);
      if (!sync || !existsSync(sync.materializedPath) || sync.sourceHash !== record.contentHash) {
        warnings.push(`Skill ${record.id} is not synced to the Codex bridge.`);
      }
      return {
        id: record.id,
        providerId: "codex",
        sourceKind: record.sourceKind,
        sourceHash: record.contentHash,
        materializationMode: "aho-managed",
        materializedHash: sync?.materializedHash ?? null,
        bridge: sync ? "codex:aho-managed" : undefined,
        version: sync?.bridgeVersion,
      };
    });
    return { records: bound, warnings };
  } finally {
    store.close();
  }
}

export async function listNativeCodexSkills(project?: ManagedProject): Promise<CodexNativeSkillBinding[]> {
  const roots: Array<{ path: string; scope: CodexNativeSkillBinding["scope"] }> = [
    { path: join(resolveCodexHome(), "skills"), scope: "global" },
  ];
  if (project) roots.unshift({ path: join(project.path, ".codex", "skills"), scope: "project" });
  const bindings: CodexNativeSkillBinding[] = [];
  for (const root of roots) {
    if (!existsSync(root.path)) continue;
    for (const entry of await readdir(root.path, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const sourcePath = join(root.path, entry.name);
      if (!existsSync(join(sourcePath, "SKILL.md"))) continue;
      bindings.push({
        skillId: basename(sourcePath),
        sourcePath,
        contentHash: await hashSkillDirectory(sourcePath),
        scope: root.scope,
      });
    }
  }
  return bindings.sort((a, b) => a.skillId.localeCompare(b.skillId) || a.scope.localeCompare(b.scope));
}

export async function installCodexBridge(): Promise<CodexBridgeInstallResult> {
  const paths = getCodexBridgePaths();
  const created: string[] = [];
  for (const path of [paths.root, paths.skillsRoot, paths.agentsRoot, paths.commandsRoot]) {
    if (!existsSync(path)) created.push(path);
    await mkdir(path, { recursive: true });
  }
  await writeJsonFile(paths.pluginJson, buildManifest());
  return { paths, created, manifest: paths.pluginJson };
}

export async function syncCodexBridge(project: ManagedProject): Promise<CodexBridgeSyncResult> {
  await installCodexBridge();
  const paths = getCodexBridgePaths();
  const memory = await resolveProjectMemory(project);
  const store = await openWorkbenchDatabase(memory);
  const synced: CodexBridgeSyncResult["synced"] = [];
  const syncedAgents: CodexBridgeSyncResult["syncedAgents"] = [];
  try {
    await syncAgentCatalog(project);
    const skills = await listSkills(project);
    const enablements = store.skills.listSkillEnablement(project.id);
    const enabledIds = new Set(enablements.filter((item) => item.enabled && !isRuntimeAssignedSkill(item.skillId)).map((item) => item.skillId));
    const desiredManagedDirs = new Set(skills
      .filter((item) => enabledIds.has(item.skillId))
      .map((item) => `${project.id}__${item.skillId}`));
    for (const entry of await readdir(paths.skillsRoot, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith(`${project.id}__`) && !desiredManagedDirs.has(entry.name)) {
        await rm(join(paths.skillsRoot, entry.name), { recursive: true, force: true });
      }
    }
    for (const skill of skills.filter((item) => enabledIds.has(item.skillId))) {
      const materializedSkillId = `${project.id}__${skill.skillId}`;
      const target = join(paths.skillsRoot, materializedSkillId);
      await copySkillToBridge(skill.sourcePath, target, materializedSkillId);
      const materializedHash = await hashSkillDirectory(target);
      store.skills.upsertBridgeSync({
        projectId: project.id,
        skillId: skill.skillId,
        sourceHash: skill.contentHash,
        materializedPath: target,
        materializedHash,
        bridgeVersion: AHO_BRIDGE_VERSION,
        syncedAt: new Date().toISOString(),
      });
      synced.push({
        skillId: skill.skillId,
        materializedSkillId,
        contentHash: skill.contentHash,
        materializedHash,
        path: target,
      });
    }
    for (const agent of await listAgentRoles(project)) {
      const target = join(paths.agentsRoot, `${agent.roleId}.md`);
      const content = [
        "---",
        `name: ${agent.roleId}`,
        `description: ${agent.description.replace(/\r?\n/g, " ")}`,
        "---",
        "",
        agent.markdown,
      ].join("\n");
      await writeFile(target, content, "utf8");
      const materializedHash = hashText(content);
      syncedAgents.push({
        roleId: agent.roleId,
        contentHash: agent.contentHash,
        materializedHash,
        path: target,
      });
    }
    for (const retiredRoleId of ["coder", "auditor", "validator", "merge-reviewer-agent"]) {
      await rm(join(paths.agentsRoot, `${retiredRoleId}.md`), { force: true });
    }
    await writeJsonFile(paths.pluginJson, buildManifest(await listSkillDirs(paths.skillsRoot), await listAgentFiles(paths.agentsRoot)));
  } finally {
    store.close();
  }
  return { status: await getCodexBridgeStatus(project), synced, syncedAgents };
}

function buildManifest(skillIds: string[] = [], agentIds: string[] = []): Record<string, unknown> {
  return {
    name: "aho-managed",
    namespace: "aho",
    version: AHO_BRIDGE_VERSION,
    description: "AHO-managed Codex runtime bridge. Generated by Agent Harness Orchestrator.",
    skills: skillIds.map((id) => ({ id, path: `skills/${id}/SKILL.md` })),
    agents: agentIds.map((id) => ({ id, path: `agents/${id}.md` })),
    commands: [],
  };
}

async function listSkillDirs(skillsRoot: string): Promise<string[]> {
  if (!existsSync(skillsRoot)) return [];
  const entries = await readdir(skillsRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory() && existsSync(join(skillsRoot, entry.name, "SKILL.md"))).map((entry) => entry.name).sort();
}

async function listAgentFiles(agentsRoot: string): Promise<string[]> {
  if (!existsSync(agentsRoot)) return [];
  const entries = await readdir(agentsRoot, { withFileTypes: true });
  return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).map((entry) => entry.name.slice(0, -3)).sort();
}
