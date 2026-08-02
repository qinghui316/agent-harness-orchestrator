import { existsSync } from "node:fs";
import { readdir, realpath } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import type {
  ProjectHarnessHandle,
  ProjectHarnessDiscoveryPolicy,
  ProjectHarnessSkillBinding,
  ProviderSkillBinding,
  ProviderSkillInput,
} from "./contracts.js";
import { projectRelativePath } from "./contracts.js";
import { fingerprintProjectHarnessContent } from "./fingerprint.js";
import { readProjectHarnessManifest } from "./manifest.js";
import { assertPhysicalDirectory } from "./path-safety.js";

interface DiscoveredPath {
  providerId: string;
  discoveryPath: string;
  targetPath: string;
}

export interface ProjectHarnessDiscovery {
  handle: ProjectHarnessHandle;
  binding: ProjectHarnessSkillBinding;
  providerInput: ProviderSkillInput;
}

export function assertRequiredProjectHarnessBindings(
  discovery: ProjectHarnessDiscovery,
  policy: ProjectHarnessDiscoveryPolicy,
): void {
  const requiredProviders = policy.routes.filter((route) => route.required).map((route) => route.providerId);
  const invalidProviders = requiredProviders.filter((providerId) => {
    const binding = discovery.binding.providers.find((candidate) => candidate.providerId === providerId);
    return binding?.status !== "ready" || binding.sameTarget !== true;
  });
  if (invalidProviders.length > 0) {
    throw new Error(
      `Project Harness required discovery links must be ready and target the same physical Skill: ${invalidProviders.join(", ")}.`,
    );
  }
}

export async function discoverProjectHarness(
  projectRoot: string,
  policy: ProjectHarnessDiscoveryPolicy,
): Promise<ProjectHarnessDiscovery | null> {
  assertDiscoveryPolicy(policy);
  const candidates = (await Promise.all(policy.routes.map((route) => discoverProviderPaths(
    projectRoot,
    route.providerId,
    route.relativeRoot,
  )))).flat();
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
  const providers = providerBindings(projectRoot, manifest.skill_name, skillRoot, group, policy);
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
  policy: ProjectHarnessDiscoveryPolicy,
): ProviderSkillBinding[] {
  return policy.routes.map(({ providerId, relativeRoot }) => {
    const discoveryPath = join(projectRoot, relativeRoot, skillName);
    const item = discovered.find((candidate) => candidate.providerId === providerId);
    return {
      providerId,
      discoveryPath,
      status: item ? "ready" : "missing",
      sameTarget: Boolean(item && normalizeForIdentity(item.targetPath) === normalizeForIdentity(skillRoot)),
    };
  });
}

function assertDiscoveryPolicy(policy: ProjectHarnessDiscoveryPolicy): void {
  if (policy.routes.length === 0) throw new Error("Project Harness discovery policy requires at least one route.");
  const ids = new Set<string>();
  for (const route of policy.routes) {
    if (!route.providerId.trim()) throw new Error("Project Harness discovery route requires providerId.");
    if (ids.has(route.providerId)) throw new Error(`Duplicate project Harness discovery provider: ${route.providerId}.`);
    projectRelativePath(route.relativeRoot);
    ids.add(route.providerId);
  }
}

function normalizeForIdentity(path: string): string {
  const normalized = resolve(path);
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}
