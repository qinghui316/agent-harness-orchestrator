import { existsSync } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type {
  ProjectHarnessHandle,
  ProjectHarnessSkillBinding,
  ProviderSkillBinding,
  ProviderSkillInput,
} from "./contracts.js";
import { fingerprintProjectHarnessContent } from "./fingerprint.js";
import { readProjectHarnessManifest } from "./manifest.js";
import { assertPhysicalDirectory } from "./path-safety.js";

interface DiscoveredPath {
  providerId: "codex" | "claude";
  discoveryPath: string;
  targetPath: string;
}

export interface ProjectHarnessDiscovery {
  handle: ProjectHarnessHandle;
  binding: ProjectHarnessSkillBinding;
  providerInput: ProviderSkillInput;
}

export async function discoverProjectHarness(projectRoot: string): Promise<ProjectHarnessDiscovery | null> {
  const candidates = [
    ...await discoverProviderPaths(projectRoot, "codex", join(".agents", "skills")),
    ...await discoverProviderPaths(projectRoot, "claude", join(".claude", "skills")),
  ];
  if (candidates.length === 0) return null;

  const targets = new Map<string, DiscoveredPath[]>();
  for (const candidate of candidates) {
    const key = normalizeForIdentity(candidate.targetPath);
    const group = targets.get(key) ?? [];
    group.push(candidate);
    targets.set(key, group);
  }
  if (targets.size !== 1) {
    throw new Error(`Project Harness discovery is ambiguous: ${[...targets.values()].flat().map((item) => item.discoveryPath).join(", ")}`);
  }

  const group = [...targets.values()][0];
  const skillRoot = await assertPhysicalDirectory(group[0].targetPath, "canonical project Harness");
  const manifest = await readProjectHarnessManifest(skillRoot);
  if (manifest.skill_name !== basename(skillRoot)) {
    throw new Error(`Project Harness manifest skill_name does not match its physical directory: ${skillRoot}`);
  }
  for (const candidate of group) {
    if (basename(candidate.discoveryPath) !== manifest.skill_name) {
      throw new Error(`Project Harness discovery name does not match manifest skill_name: ${candidate.discoveryPath}`);
    }
  }

  const contentFingerprint = await fingerprintProjectHarnessContent(skillRoot);
  const handle: ProjectHarnessHandle = {
    projectId: manifest.project_id,
    skillName: manifest.skill_name,
    skillRevision: manifest.skill_revision,
    skillRoot,
    contentFingerprint,
  };
  const providers = providerBindings(projectRoot, manifest.skill_name, skillRoot, group);
  return {
    handle,
    binding: {
      projectId: handle.projectId,
      skillName: handle.skillName,
      sourcePath: skillRoot,
      contentFingerprint,
      providers,
    },
    providerInput: {
      id: handle.skillName,
      path: skillRoot,
      contentHash: contentFingerprint,
      source: "project-harness",
      required: true,
    },
  };
}

async function discoverProviderPaths(
  projectRoot: string,
  providerId: DiscoveredPath["providerId"],
  relativeRoot: string,
): Promise<DiscoveredPath[]> {
  const root = resolve(projectRoot, relativeRoot);
  if (!existsSync(root)) return [];
  const found: DiscoveredPath[] = [];
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const discoveryPath = join(root, entry.name);
    if (!entry.isDirectory() && !entry.isSymbolicLink()) continue;
    const manifestPath = join(discoveryPath, "state", "manifest.json");
    if (!existsSync(manifestPath) || !existsSync(join(discoveryPath, "SKILL.md"))) continue;
    found.push({ providerId, discoveryPath, targetPath: await realpath(discoveryPath) });
  }
  return found;
}

function providerBindings(
  projectRoot: string,
  skillName: string,
  skillRoot: string,
  discovered: DiscoveredPath[],
): ProviderSkillBinding[] {
  return ([
    ["codex", join(projectRoot, ".agents", "skills", skillName)],
    ["claude", join(projectRoot, ".claude", "skills", skillName)],
  ] as const).map(([providerId, discoveryPath]) => {
    const item = discovered.find((candidate) => candidate.providerId === providerId);
    return {
      providerId,
      discoveryPath,
      status: item ? "ready" : "missing",
      sameTarget: Boolean(item && normalizeForIdentity(item.targetPath) === normalizeForIdentity(skillRoot)),
    };
  });
}

function normalizeForIdentity(path: string): string {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
