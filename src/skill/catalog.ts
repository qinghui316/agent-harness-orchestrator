import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, relative, sep } from "node:path";
import { resolveExistingDirectory, slugify } from "../fs/path.js";
import type { ProviderSkillInput } from "../project-harness/contracts.js";
import type {
  ProviderNativeSkill,
  ProviderSkillCatalogError,
  ProviderSkillCatalogSnapshot,
  ProviderSkillScope,
} from "../provider-runtime/contracts.js";
import type { ProjectRuntimePaths } from "../project-runtime/paths.js";
import { getSystemSkillsRoot } from "../template-source/paths.js";
import { openProjectRuntimeWorkbenchDatabase } from "../workbench/persistence/open-workbench-database.js";
import type { StoredSkillEnablement, StoredSkillRoot } from "../workbench/persistence/contracts.js";
import { canonicalPathIdentity, sameSkillPath, skillPathIdentity } from "./path-identity.js";

export type SkillSourceKind = "custom" | "system-aho" | "provider-native" | "project-harness";

export interface SkillCompatibility {
  requiredCapabilities: string[];
}

export interface SkillProviderBinding {
  providerId: string;
  bindingKind: "native";
  status: "ready" | "disabled";
  contentHash: string;
  scope: ProviderSkillScope;
}

export interface SkillListItem {
  skillId: string;
  name: string;
  description: string;
  sourcePath: string;
  sourceKind: SkillSourceKind;
  scope: ProviderSkillScope;
  contentHash: string;
  compatibility: SkillCompatibility;
  providerBindings: SkillProviderBinding[];
  providerEnabled: boolean;
  required: boolean;
  runtimeAssigned: boolean;
  enabledProject: boolean;
  enabledTopics: string[];
  disabledTopics: string[];
}

export interface SkillRootListItem {
  rootPath: string;
  sourceKind: "custom";
  updatedAt: string;
}

export interface SkillCatalogResult {
  roots: SkillRootListItem[];
  skills: SkillListItem[];
  errors: ProviderSkillCatalogError[];
}

export interface EnabledSkillContext {
  inputs: ProviderSkillInput[];
  promptSection: string;
  warnings: string[];
}

export interface SkillCatalogState {
  roots: readonly StoredSkillRoot[];
  enablements: readonly StoredSkillEnablement[];
}

export async function addSkillRoot(
  paths: ProjectRuntimePaths,
  rootPathInput: string,
): Promise<SkillRootListItem[]> {
  const rootPath = await resolveExistingDirectory(rootPathInput);
  const store = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    store.skills.upsertSkillRoot({
      projectId: paths.projectId,
      rootPath,
      sourceKind: "custom",
      updatedAt: new Date().toISOString(),
    });
    return store.skills.listSkillRoots(paths.projectId).map(mapSkillRoot);
  } finally {
    store.close();
  }
}

export async function listSkillRoots(paths: ProjectRuntimePaths): Promise<SkillRootListItem[]> {
  const store = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    return store.skills.listSkillRoots(paths.projectId).map(mapSkillRoot);
  } finally {
    store.close();
  }
}

export async function listSkills(
  paths: ProjectRuntimePaths,
  snapshot: ProviderSkillCatalogSnapshot,
  requiredInputs: readonly ProviderSkillInput[] = [],
): Promise<SkillCatalogResult> {
  assertSnapshotIdentity(paths, snapshot);
  assertRequiredInputsDiscovered(snapshot, requiredInputs);
  const store = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    return buildSkillCatalog(snapshot, {
      roots: store.skills.listSkillRoots(paths.projectId),
      enablements: store.skills.listSkillEnablement(paths.projectId),
    }, requiredInputs, requiredInputs);
  } finally {
    store.close();
  }
}

export function buildSkillCatalog(
  snapshot: ProviderSkillCatalogSnapshot,
  state: SkillCatalogState,
  identityInputs: readonly ProviderSkillInput[] = [],
  requiredInputs: readonly ProviderSkillInput[] = [],
): SkillCatalogResult {
  const roots = state.roots.map(mapSkillRoot);
  const skills = decorateSkills(snapshot, roots, identityInputs, requiredInputs).map((skill) => ({
    ...skill,
    enabledProject: state.enablements.some((item) =>
      item.skillId === skill.skillId && item.scope === "project" && item.enabled),
    enabledTopics: state.enablements
      .filter((item) => item.skillId === skill.skillId && item.scope === "topic" && item.enabled && item.changeId)
      .map((item) => item.changeId as string)
      .sort(),
    disabledTopics: state.enablements
      .filter((item) => item.skillId === skill.skillId && item.scope === "topic" && !item.enabled && item.changeId)
      .map((item) => item.changeId as string)
      .sort(),
  }));
  return { roots, skills, errors: snapshot.errors };
}

export async function setSkillEnabled(
  paths: ProjectRuntimePaths,
  snapshot: ProviderSkillCatalogSnapshot,
  skillIdInput: string,
  options: { topic?: string; enabled: boolean },
  requiredInputs: readonly ProviderSkillInput[] = [],
): Promise<SkillCatalogResult> {
  const skillId = slugify(skillIdInput);
  const catalog = await listSkills(paths, snapshot, requiredInputs);
  const skill = catalog.skills.find((item) => item.skillId === skillId);
  if (!skill) throw new Error(`Unknown native Skill: ${skillId}`);
  if (skill.required || skill.runtimeAssigned) {
    throw new Error(`Skill ${skillId} is assigned by the Runtime and cannot be changed as a project or Conversation selection.`);
  }
  const store = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    store.skills.setSkillEnablement({
      projectId: paths.projectId,
      changeId: options.topic ?? null,
      skillId,
      scope: options.topic ? "topic" : "project",
      enabled: options.enabled,
      updatedAt: new Date().toISOString(),
    });
  } finally {
    store.close();
  }
  return listSkills(paths, snapshot, requiredInputs);
}

export async function getEnabledSkillContext(
  paths: ProjectRuntimePaths,
  snapshot: ProviderSkillCatalogSnapshot,
  changeId: string | undefined,
  requiredInputs: readonly ProviderSkillInput[] = [],
): Promise<EnabledSkillContext> {
  const catalog = await listSkills(paths, snapshot, requiredInputs);
  const inputs = new Map<string, ProviderSkillInput>();
  for (const input of requiredInputs) inputs.set(inputIdentity(input), input);
  const warnings = catalog.errors.map((error) => `${error.path}: ${error.message}`);
  for (const skill of catalog.skills) {
    if (skill.required || skill.runtimeAssigned) continue;
    const selected = changeId
      ? !skill.disabledTopics.includes(changeId) && (skill.enabledProject || skill.enabledTopics.includes(changeId))
      : skill.enabledProject;
    if (!selected) continue;
    if (!skill.providerEnabled) {
      warnings.push(`Selected Skill ${skill.skillId} is disabled in the Provider configuration.`);
      continue;
    }
    const input: ProviderSkillInput = {
      id: skill.name,
      path: skill.sourcePath,
      contentHash: skill.contentHash,
      source: skill.sourceKind === "system-aho" ? "aho-system" : "provider-native",
      required: false,
    };
    inputs.set(inputIdentity(input), input);
  }
  const records = [...inputs.values()].sort((left, right) => left.id.localeCompare(right.id) || left.path.localeCompare(right.path));
  return {
    inputs: records,
    warnings,
    promptSection: records.length > 0
      ? [
        "# Native Skill Inputs",
        "",
        "These provider-native Skill inputs are available for this turn. They do not replace project Harness evidence or authorize workflow transitions.",
        "",
        ...records.map((record) => `- $${record.id}: source=${record.source}; contentHash=${record.contentHash}; required=${record.required}`),
      ].join("\n")
      : "",
  };
}

export function isRuntimeAssignedSkill(skillId: string): boolean {
  return skillId === "aho-main-orchestration" || skillId === "aho-harness-engineering";
}

function decorateSkills(
  snapshot: ProviderSkillCatalogSnapshot,
  roots: readonly SkillRootListItem[],
  identityInputs: readonly ProviderSkillInput[],
  requiredInputs: readonly ProviderSkillInput[],
): Array<Omit<SkillListItem, "enabledProject" | "enabledTopics" | "disabledTopics">> {
  const discoveredSkills = deduplicateProviderSkills(snapshot.skills);
  const baseIds = discoveredSkills.map((skill) => slugify(skill.name));
  return discoveredSkills.map((skill, index) => {
    const baseId = baseIds[index];
    const skillId = baseIds.filter((candidate) => candidate === baseId).length === 1
      ? baseId
      : `${baseId}-${hashText(canonicalPathIdentity(skill.path)).slice(0, 8)}`;
    const identityInput = identityInputs.find((input) =>
      input.id === skill.name
      && input.contentHash === skill.contentHash
      && sameSkillPath(input.path, skill.path));
    const requiredInput = requiredInputs.find((input) =>
      input.id === skill.name
      && input.contentHash === skill.contentHash
      && sameSkillPath(input.path, skill.path));
    const sourceKind = sourceKindFor(skill, roots, identityInput);
    const required = requiredInput?.required === true;
    const runtimeAssigned = isRuntimeAssignedSkill(skillId);
    return {
      skillId,
      name: skill.name,
      description: skill.description,
      sourcePath: skill.path,
      sourceKind,
      scope: skill.scope,
      contentHash: skill.contentHash,
      compatibility: { requiredCapabilities: ["skill.native-load"] },
      providerBindings: [{
        providerId: snapshot.providerId,
        bindingKind: "native" as const,
        status: skill.enabled ? "ready" as const : "disabled" as const,
        contentHash: skill.contentHash,
        scope: skill.scope,
      }],
      providerEnabled: skill.enabled,
      required,
      runtimeAssigned,
    };
  }).sort((left, right) => left.name.localeCompare(right.name) || left.skillId.localeCompare(right.skillId));
}

function sourceKindFor(
  skill: ProviderNativeSkill,
  roots: readonly SkillRootListItem[],
  requiredInput: ProviderSkillInput | undefined,
): SkillSourceKind {
  if (requiredInput?.source === "project-harness") return "project-harness";
  const skillRoot = skillRootForPath(skill.path);
  if (isInside(getSystemSkillsRoot(), skillRoot)) return "system-aho";
  if (roots.some((root) => isInside(root.rootPath, skillRoot))) return "custom";
  return "provider-native";
}

function mapSkillRoot(root: StoredSkillRoot): SkillRootListItem {
  if (root.sourceKind !== "custom") throw new Error(`Unsupported native Skill root kind: ${root.sourceKind}`);
  return { rootPath: root.rootPath, sourceKind: "custom", updatedAt: root.updatedAt };
}

function assertSnapshotIdentity(paths: ProjectRuntimePaths, snapshot: ProviderSkillCatalogSnapshot): void {
  if (!snapshot.projectPath || !existsSync(snapshot.projectPath)) {
    throw new Error(`Provider Skill catalog project path is unavailable: ${snapshot.projectPath}`);
  }
  if (!paths.projectId.trim()) throw new Error("Project Runtime paths require a project id.");
}

function assertRequiredInputsDiscovered(
  snapshot: ProviderSkillCatalogSnapshot,
  requiredInputs: readonly ProviderSkillInput[],
): void {
  const identities = new Set<string>();
  for (const input of requiredInputs) {
    const identity = inputIdentity(input);
    if (identities.has(identity)) throw new Error(`Duplicate required Skill input: ${input.id}`);
    identities.add(identity);

    const discoveredSkills = deduplicateProviderSkills(snapshot.skills);
    const sameName = discoveredSkills.filter((skill) => skill.name === input.id);
    const sameLocation = discoveredSkills.filter((skill) => sameSkillPath(skill.path, input.path));
    const matching = sameName.filter((skill) => sameSkillPath(skill.path, input.path));
    if (matching.length === 0) {
      if (sameName.length > 0 || sameLocation.length > 0) {
        throw new Error(`Required Skill ${input.id} does not match the Provider-discovered path identity.`);
      }
      throw new Error(`Required Skill ${input.id} was not discovered by Provider ${snapshot.providerId}.`);
    }
    if (matching.length !== 1) {
      throw new Error(`Required Skill ${input.id} has an ambiguous Provider discovery identity.`);
    }
    const discovered = matching[0]!;
    if (discovered.contentHash !== input.contentHash) {
      throw new Error(`Required Skill ${input.id} content identity does not match Provider discovery.`);
    }
    if (!discovered.enabled) {
      throw new Error(`Required Skill ${input.id} is disabled in the Provider configuration.`);
    }
  }
}

function skillRootForPath(path: string): string {
  return path.toLowerCase().endsWith("skill.md") ? dirname(path) : path;
}

function inputIdentity(input: ProviderSkillInput): string {
  return `${input.id}\0${skillPathIdentity(input.path)}`;
}

function isInside(root: string, candidate: string): boolean {
  const normalizedRoot = canonicalPathIdentity(root);
  const normalizedCandidate = canonicalPathIdentity(candidate);
  const rel = relative(normalizedRoot, normalizedCandidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

function deduplicateProviderSkills(skills: readonly ProviderNativeSkill[]): ProviderNativeSkill[] {
  return [...new Map(skills.map((skill) => [
    [
      skill.name,
      skillPathIdentity(skill.path),
      skill.contentHash,
      skill.scope,
      skill.enabled ? "enabled" : "disabled",
    ].join("\0"),
    skill,
  ])).values()];
}

function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
