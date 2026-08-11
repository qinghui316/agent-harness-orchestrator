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
import {
  canonicalPathIdentity,
  legacySkillPathIdentity,
  lexicalSkillEntryPathIdentity,
  resolveSkillPathIdentity,
  skillPathIdentity,
} from "./path-identity.js";

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

export interface SkillResolutionCatalogItem extends SkillListItem {
  selectionSkillIds: string[];
  canonicalSourcePath: string | null;
  sourcePathIdentity: string;
  catalogConflict: string | null;
  pathDiagnostic: { code: string; message: string } | null;
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

export interface SkillResolutionCatalogResult {
  roots: SkillRootListItem[];
  skills: SkillResolutionCatalogItem[];
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
  const internal = buildSkillResolutionCatalog(snapshot, state, identityInputs, requiredInputs);
  return {
    roots: internal.roots,
    skills: internal.skills.map(toPublicSkillListItem),
    errors: internal.errors,
  };
}

export function buildSkillResolutionCatalog(
  snapshot: ProviderSkillCatalogSnapshot,
  state: SkillCatalogState,
  identityInputs: readonly ProviderSkillInput[] = [],
  requiredInputs: readonly ProviderSkillInput[] = [],
): SkillResolutionCatalogResult {
  const roots = state.roots.map(mapSkillRoot);
  const skills = decorateSkills(snapshot, roots, identityInputs, requiredInputs).map((skill) => {
    const projectSelection = effectiveEnablement(skill, state.enablements, "project", null);
    const topicSelections = [...new Set(state.enablements
      .filter((item) => item.scope === "topic" && item.changeId
        && skill.selectionSkillIds.includes(item.skillId))
      .map((item) => item.changeId as string))]
      .sort()
      .map((topic) => effectiveEnablement(skill, state.enablements, "topic", topic))
      .filter((item): item is StoredSkillEnablement => item !== null);
    return {
      ...skill,
      enabledProject: projectSelection?.enabled === true,
      enabledTopics: topicSelections.filter((item) => item.enabled).map((item) => item.changeId as string),
      disabledTopics: topicSelections.filter((item) => !item.enabled).map((item) => item.changeId as string),
    };
  });
  return { roots, skills, errors: snapshot.errors };
}

export async function setSkillEnabled(
  paths: ProjectRuntimePaths,
  snapshot: ProviderSkillCatalogSnapshot,
  skillIdInput: string,
  options: { topic?: string; enabled: boolean },
  requiredInputs: readonly ProviderSkillInput[] = [],
): Promise<SkillCatalogResult> {
  assertSnapshotIdentity(paths, snapshot);
  assertRequiredInputsDiscovered(snapshot, requiredInputs);
  const skillId = slugify(skillIdInput);
  const store = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    const catalog = buildSkillResolutionCatalog(snapshot, {
      roots: store.skills.listSkillRoots(paths.projectId),
      enablements: store.skills.listSkillEnablement(paths.projectId),
    }, requiredInputs, requiredInputs);
    const matches = catalog.skills.filter((item) => item.selectionSkillIds.includes(skillId));
    if (matches.length === 0) throw new Error(`Unknown native Skill: ${skillId}`);
    if (matches.length !== 1) throw new Error(`Ambiguous native Skill identity: ${skillId}`);
    const skill = matches[0]!;
    if (skill.required || skill.runtimeAssigned) {
      throw new Error(`Skill ${skillId} is assigned by the Runtime and cannot be changed as a project or Conversation selection.`);
    }
    store.skills.setSkillEnablement({
      projectId: paths.projectId,
      changeId: options.topic ?? null,
      skillId: skill.skillId,
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
  assertSnapshotIdentity(paths, snapshot);
  assertRequiredInputsDiscovered(snapshot, requiredInputs);
  const store = await openProjectRuntimeWorkbenchDatabase(paths);
  let catalog: SkillResolutionCatalogResult;
  try {
    catalog = buildSkillResolutionCatalog(snapshot, {
      roots: store.skills.listSkillRoots(paths.projectId),
      enablements: store.skills.listSkillEnablement(paths.projectId),
    }, requiredInputs, requiredInputs);
  } finally {
    store.close();
  }
  const inputs = new Map<string, ProviderSkillInput>();
  for (const input of requiredInputs) {
    const item = catalog.skills.find((skill) =>
      skill.required
      && skill.name === input.id
      && skill.contentHash === input.contentHash);
    if (!item?.canonicalSourcePath) {
      throw new Error(`Required Skill ${input.id} has no validated physical source identity.`);
    }
    const canonicalInput = { ...input, path: item.canonicalSourcePath };
    inputs.set(inputIdentity(canonicalInput), canonicalInput);
  }
  const warnings = catalog.errors.map((error) => `${error.path}: ${error.message}`);
  for (const skill of catalog.skills) {
    if (skill.required || skill.runtimeAssigned) continue;
    const selected = changeId
      ? !skill.disabledTopics.includes(changeId) && (skill.enabledProject || skill.enabledTopics.includes(changeId))
      : skill.enabledProject;
    if (!selected) continue;
    if (skill.catalogConflict) {
      warnings.push(skill.catalogConflict);
      continue;
    }
    if (skill.pathDiagnostic || !skill.canonicalSourcePath) {
      warnings.push(skill.pathDiagnostic?.message ?? `Selected Skill ${skill.skillId} path is unavailable.`);
      continue;
    }
    if (!skill.providerEnabled) {
      warnings.push(`Selected Skill ${skill.skillId} is disabled in the Provider configuration.`);
      continue;
    }
    const input: ProviderSkillInput = {
      id: skill.name,
      path: skill.canonicalSourcePath,
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
): Array<Omit<SkillResolutionCatalogItem, "enabledProject" | "enabledTopics" | "disabledTopics">> {
  const groups = normalizeProviderSkills(snapshot.skills);
  return groups.map((group) => {
    const skill = group.representative;
    const baseId = slugify(skill.name);
    const sameNameGroupCount = groups.filter(
      (candidate) => slugify(candidate.representative.name) === baseId,
    ).length;
    const skillId = sameNameGroupCount === 1
      ? baseId
      : `${baseId}-${hashText(group.pathIdentity).slice(0, 8)}`;
    const legacyIds = group.aliasPaths.flatMap((path) => [
      `${baseId}-${hashText(legacySkillPathIdentity(path)).slice(0, 8)}`,
      ...(sameNameGroupCount === 1 ? [baseId] : []),
    ]);
    const selectionSkillIds = [...new Set([skillId, ...legacyIds])].sort();
    const identityInput = identityInputs.find((input) =>
      input.id === skill.name
      && input.contentHash === skill.contentHash
      && skillPathIdentity(input.path) === group.pathIdentity);
    const requiredInput = requiredInputs.find((input) =>
      input.id === skill.name
      && input.contentHash === skill.contentHash
      && skillPathIdentity(input.path) === group.pathIdentity);
    const sourceKind = sourceKindFor(skill, group.canonicalPath, roots, identityInput);
    const required = requiredInput?.required === true;
    const runtimeAssigned = isRuntimeAssignedSkill(skillId);
    return {
      skillId,
      selectionSkillIds,
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
      canonicalSourcePath: group.canonicalPath,
      sourcePathIdentity: group.pathIdentity,
      catalogConflict: group.metadataConflict,
      pathDiagnostic: group.pathDiagnostic,
    };
  }).sort((left, right) => left.name.localeCompare(right.name) || left.skillId.localeCompare(right.skillId));
}

function sourceKindFor(
  skill: ProviderNativeSkill,
  canonicalSourcePath: string | null,
  roots: readonly SkillRootListItem[],
  requiredInput: ProviderSkillInput | undefined,
): SkillSourceKind {
  if (requiredInput?.source === "project-harness") return "project-harness";
  const skillRoot = skillRootForPath(canonicalSourcePath ?? skill.path);
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
  const groups = normalizeProviderSkills(snapshot.skills);
  for (const input of requiredInputs) {
    const identity = inputIdentity(input);
    if (identities.has(identity)) throw new Error(`Duplicate required Skill input: ${input.id}`);
    identities.add(identity);

    const inputPathIdentity = skillPathIdentity(input.path);
    const sameName = groups.filter((group) => group.representative.name === input.id);
    const sameLocation = groups.filter((group) => group.pathIdentity === inputPathIdentity);
    const matching = sameName.filter((group) => group.pathIdentity === inputPathIdentity);
    if (matching.length === 0) {
      if (sameName.length > 0 || sameLocation.length > 0) {
        throw new Error(`Required Skill ${input.id} does not match the Provider-discovered path identity.`);
      }
      throw new Error(`Required Skill ${input.id} was not discovered by Provider ${snapshot.providerId}.`);
    }
    if (matching.length !== 1) {
      throw new Error(`Required Skill ${input.id} has an ambiguous Provider discovery identity.`);
    }
    const group = matching[0]!;
    if (group.metadataConflict) throw new Error(`Required Skill ${input.id} has conflicting Provider metadata.`);
    const discovered = group.representative;
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

function toPublicSkillListItem(skill: SkillResolutionCatalogItem): SkillListItem {
  return {
    skillId: skill.skillId,
    name: skill.name,
    description: skill.description,
    sourcePath: skill.sourcePath,
    sourceKind: skill.sourceKind,
    scope: skill.scope,
    contentHash: skill.contentHash,
    compatibility: skill.compatibility,
    providerBindings: skill.providerBindings,
    providerEnabled: skill.providerEnabled,
    required: skill.required,
    runtimeAssigned: skill.runtimeAssigned,
    enabledProject: skill.enabledProject,
    enabledTopics: skill.enabledTopics,
    disabledTopics: skill.disabledTopics,
  };
}

function effectiveEnablement(
  skill: Pick<SkillResolutionCatalogItem, "skillId" | "selectionSkillIds">,
  enablements: readonly StoredSkillEnablement[],
  scope: StoredSkillEnablement["scope"],
  changeId: string | null,
): StoredSkillEnablement | null {
  const matches = enablements.filter((item) =>
    item.scope === scope
    && item.changeId === changeId
    && skill.selectionSkillIds.includes(item.skillId));
  return [...matches].sort((left, right) => {
    const canonicalOrder = Number(right.skillId === skill.skillId) - Number(left.skillId === skill.skillId);
    return canonicalOrder
      || right.updatedAt.localeCompare(left.updatedAt)
      || left.skillId.localeCompare(right.skillId);
  })[0] ?? null;
}

function isInside(root: string, candidate: string): boolean {
  const normalizedRoot = canonicalPathIdentity(root);
  const normalizedCandidate = canonicalPathIdentity(candidate);
  const rel = relative(normalizedRoot, normalizedCandidate);
  return rel === "" || (rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel));
}

interface ProviderSkillIdentityGroup {
  representative: ProviderNativeSkill;
  aliasPaths: string[];
  pathIdentity: string;
  canonicalPath: string | null;
  metadataConflict: string | null;
  pathDiagnostic: { code: string; message: string } | null;
}

interface BoundProviderSkill {
  skill: ProviderNativeSkill;
  pathIdentity: string;
  canonicalPath: string | null;
  pathDiagnostic: { code: string; message: string } | null;
}

function normalizeProviderSkills(skills: readonly ProviderNativeSkill[]): ProviderSkillIdentityGroup[] {
  const grouped = new Map<string, BoundProviderSkill[]>();
  for (const skill of skills) {
    const resolved = resolveSkillPathIdentity(skill.path);
    const bound: BoundProviderSkill = resolved.ok
      ? {
        skill,
        pathIdentity: resolved.value.identity,
        canonicalPath: resolved.value.canonicalPath,
        pathDiagnostic: null,
      }
      : {
        skill,
        pathIdentity: lexicalSkillEntryPathIdentity(skill.path),
        canonicalPath: null,
        pathDiagnostic: { code: resolved.code, message: resolved.message },
      };
    const key = skill.name + "\0" + bound.pathIdentity;
    grouped.set(key, [...(grouped.get(key) ?? []), bound]);
  }
  return [...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, records]) => {
    const ordered = [...records].sort((left, right) =>
      metadataSignature(left.skill).localeCompare(metadataSignature(right.skill))
      || legacySkillPathIdentity(left.skill.path).localeCompare(legacySkillPathIdentity(right.skill.path)));
    const representative = ordered[0]!;
    const signatures = new Set(ordered.map((record) => metadataSignature(record.skill)));
    const invalid = ordered.find((record) => record.pathDiagnostic);
    return {
      representative: representative.skill,
      aliasPaths: [...new Set(ordered.map((record) => record.skill.path))].sort((left, right) =>
        legacySkillPathIdentity(left).localeCompare(legacySkillPathIdentity(right))),
      pathIdentity: representative.pathIdentity,
      canonicalPath: representative.canonicalPath,
      metadataConflict: signatures.size > 1
        ? `Skill ${representative.skill.name} has conflicting Provider metadata for one physical identity.`
        : null,
      pathDiagnostic: invalid?.pathDiagnostic ?? null,
    };
  });
}

function metadataSignature(skill: ProviderNativeSkill): string {
  return stableJson({
    contentHash: skill.contentHash,
    description: skill.description,
    dependencies: skill.dependencies ?? null,
    enabled: skill.enabled,
    interface: skill.interface ?? null,
    scope: skill.scope,
  });
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function hashText(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
