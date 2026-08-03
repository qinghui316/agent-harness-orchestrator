import { createHash, randomBytes } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { parseJsonText, writeJsonFile } from "../fs/json.js";
import { getGitBranch, getGitCommit, git, isGitRepo } from "../project/git.js";
import { assertPhysicalDirectory, resolveWithinPhysicalRoot } from "./path-safety.js";

export type ProjectHarnessRepositoryMode = "single_lane" | "multi_lane";
export type ProjectHarnessBaselineRelation =
  | "equal"
  | "canonical_advanced"
  | "worktree_behind"
  | "diverged"
  | "unavailable"
  | "not_applicable";

export interface ProjectHarnessRegistryContext {
  projectId: string;
  projectRoot: string;
  skillRoot: string;
  mode: ProjectHarnessRepositoryMode;
  branch: string | null;
  headCommit: string | null;
  lane?: ProjectHarnessLaneIdentity;
}

export async function resolveProjectHarnessRegistryContext(input: {
  projectId: string;
  projectRoot: string;
  skillRoot: string;
}): Promise<ProjectHarnessRegistryContext> {
  const repository = await isGitRepo(input.projectRoot);
  return {
    ...input,
    mode: repository ? "multi_lane" : "single_lane",
    branch: repository ? await getGitBranch(input.projectRoot) : null,
    headCommit: repository ? await getGitCommit(input.projectRoot) : null,
  };
}

export type ProjectHarnessLaneIdentity =
  | { kind: "repository" }
  | { kind: "conversation"; conversationId: string; graphScopeId: string };

export interface ProjectHarnessLaneRecord {
  schema_version: "2.0";
  lane_id: string;
  kind: "repository" | "conversation";
  repository_lane_id: string;
  branch: string | null;
  head_commit: string | null;
  conversation_id: string | null;
  graph_scope_id: string | null;
  active_change_id: string | null;
  status: "active" | "idle";
  updated_at: string;
}

export interface ProjectHarnessBaselineRecord {
  schema_version: "1.0";
  canonical_branch: string | null;
  canonical_commit: string | null;
  updated_at: string;
}

export interface GitAncestryProbe {
  isRepository(projectRoot: string): Promise<boolean>;
  resolveCommit(projectRoot: string, reference: string): Promise<string | null>;
  isAncestor(projectRoot: string, ancestor: string, descendant: string): Promise<boolean>;
}

const laneSchema = z.object({
  schema_version: z.literal("2.0"),
  lane_id: z.string().min(1),
  kind: z.enum(["repository", "conversation"]),
  repository_lane_id: z.string().min(1),
  branch: z.string().nullable(),
  head_commit: z.string().nullable(),
  conversation_id: z.string().min(1).nullable(),
  graph_scope_id: z.string().min(1).nullable(),
  active_change_id: z.string().nullable(),
  status: z.enum(["active", "idle"]),
  updated_at: z.string().min(1),
}).strict().superRefine((value, context) => {
  const logical = value.kind === "conversation";
  if (logical && (!value.conversation_id || !value.graph_scope_id)) {
    context.addIssue({ code: "custom", message: "Conversation Lane requires conversation_id and graph_scope_id." });
  }
  if (!logical && (value.conversation_id !== null || value.graph_scope_id !== null)) {
    context.addIssue({ code: "custom", message: "Repository Lane must not carry conversation identity." });
  }
  if ((value.active_change_id === null) !== (value.status === "idle")) {
    context.addIssue({ code: "custom", message: "Lane status must match active_change_id." });
  }
});

const legacyRepositoryLaneSchema = z.object({
  schema_version: z.literal("1.0"),
  lane_id: z.string().min(1),
  branch: z.string().nullable(),
  head_commit: z.string().nullable(),
  active_change_id: z.string().nullable(),
  status: z.enum(["active", "idle"]),
  updated_at: z.string().min(1),
}).strict().superRefine((value, context) => {
  if ((value.active_change_id === null) !== (value.status === "idle")) {
    context.addIssue({ code: "custom", message: "Lane status must match active_change_id." });
  }
});

const baselineSchema = z.object({
  schema_version: z.literal("1.0"),
  canonical_branch: z.string().nullable(),
  canonical_commit: z.string().nullable(),
  updated_at: z.string().min(1),
}).strict();

export function canonicalProjectHarnessId(value: string, label = "identifier"): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${label} must be a non-empty identifier.`);
  const raw = value.trim();
  if (raw.includes("/") || raw.includes("\\") || raw.includes("\0") || raw === "." || raw === "..") {
    throw new Error(`${label} must not contain path separators or traversal segments: ${value}.`);
  }
  if (!/[A-Za-z0-9]/.test(raw)) throw new Error(`${label} must contain at least one letter or digit: ${value}.`);
  const canonical = raw.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  if (!canonical || canonical.length > 120) throw new Error(`${label} exceeds the canonical identifier boundary.`);
  return canonical;
}

export function normalizeRegistryClaim(value: string): string {
  if (typeof value !== "string") throw new Error("Registry paths must be strings.");
  const normalized = value.trim().replace(/\\/g, "/");
  if (!normalized || normalized.includes("\0") || normalized.startsWith("/") || /^[A-Za-z]:/.test(normalized)) {
    throw new Error(`Registry paths must be non-empty project-relative paths: ${value}.`);
  }
  const segments = normalized.split("/").filter((segment) => segment !== "" && segment !== ".");
  if (segments.includes("..") || segments.length === 0) {
    throw new Error(`Registry paths must not traverse outside the project: ${value}.`);
  }
  return segments.join("/");
}

export function registryClaimsOverlap(left: string, right: string): boolean {
  const normalizedLeft = normalizeRegistryClaim(left);
  const normalizedRight = normalizeRegistryClaim(right);
  return normalizedLeft === normalizedRight
    || normalizedLeft.startsWith(`${normalizedRight}/`)
    || normalizedRight.startsWith(`${normalizedLeft}/`);
}

export function projectHarnessLaneId(context: ProjectHarnessRegistryContext): string {
  canonicalProjectHarnessId(context.projectId, "Project id");
  if (context.lane?.kind === "conversation") {
    const conversationId = validatedLogicalLanePart(context.lane.conversationId, "Conversation id");
    const graphScopeId = validatedLogicalLanePart(context.lane.graphScopeId, "Graph scope id");
    const repositoryLaneId = projectHarnessRepositoryLaneId(context, true);
    return `lane-${createHash("sha256")
      .update(JSON.stringify([context.projectId, repositoryLaneId, "conversation", conversationId, graphScopeId]))
      .digest("hex")
      .slice(0, 10)}`;
  }
  return projectHarnessRepositoryLaneId(context, false);
}

export function projectHarnessConversationLane(
  conversationId: string,
  graphScopeId: string,
): ProjectHarnessLaneIdentity {
  return {
    kind: "conversation",
    conversationId: validatedLogicalLanePart(conversationId, "Conversation id"),
    graphScopeId: validatedLogicalLanePart(graphScopeId, "Graph scope id"),
  };
}

export async function ensureProjectHarnessLane(
  context: ProjectHarnessRegistryContext,
  activeChangeId?: string | null,
): Promise<ProjectHarnessLaneRecord> {
  const laneId = projectHarnessLaneId(context);
  const root = await registryRoot(context.skillRoot, true);
  const path = await resolveWithinPhysicalRoot(root, `lanes/${laneId}.json`, "project Harness Lane");
  let current: ProjectHarnessLaneRecord | null = null;
  if (existsSync(path)) current = laneSchema.parse(parseJsonText(await readFile(path, "utf8"), path));
  const resolvedActive = activeChangeId === undefined ? current?.active_change_id ?? null : activeChangeId;
  if (resolvedActive) canonicalProjectHarnessId(resolvedActive, "Active Change id");
  const value: ProjectHarnessLaneRecord = {
    schema_version: "2.0",
    lane_id: laneId,
    kind: context.lane?.kind === "conversation" ? "conversation" : "repository",
    repository_lane_id: projectHarnessRepositoryLaneId(context, context.lane?.kind === "conversation"),
    branch: context.branch,
    head_commit: context.headCommit,
    conversation_id: context.lane?.kind === "conversation" ? context.lane.conversationId : null,
    graph_scope_id: context.lane?.kind === "conversation" ? context.lane.graphScopeId : null,
    active_change_id: resolvedActive,
    status: resolvedActive ? "active" : "idle",
    updated_at: new Date().toISOString(),
  };
  await writeJsonFile(path, value);
  return value;
}

function projectHarnessRepositoryLaneId(
  context: ProjectHarnessRegistryContext,
  allowBranchlessLogicalLane: boolean,
): string {
  if (context.mode === "single_lane" || (allowBranchlessLogicalLane && !context.branch)) return "lane-single";
  if (!context.branch) throw new Error("Structured Change work requires a named Git branch.");
  return `lane-${createHash("sha256").update(`${context.projectId}:${context.branch}`).digest("hex").slice(0, 10)}`;
}

function validatedLogicalLanePart(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.includes("\0") || normalized.includes("/") || normalized.includes("\\")) {
    throw new Error(`${label} must be a non-empty opaque identifier without path separators.`);
  }
  return normalized;
}

export async function readProjectHarnessLane(
  context: ProjectHarnessRegistryContext,
): Promise<ProjectHarnessLaneRecord | null> {
  const laneId = projectHarnessLaneId(context);
  const root = await registryRoot(context.skillRoot, false);
  if (!existsSync(root)) return null;
  const path = await resolveWithinPhysicalRoot(root, `lanes/${laneId}.json`, "project Harness Lane");
  if (!existsSync(path)) return null;
  const value = laneSchema.parse(parseJsonText(await readFile(path, "utf8"), path));
  if (value.lane_id !== laneId) throw new Error(`Lane record id does not match its filename: ${laneId}.json`);
  return value;
}

export async function restoreProjectHarnessLane(
  context: ProjectHarnessRegistryContext,
  snapshot: ProjectHarnessLaneRecord | null,
): Promise<void> {
  const laneId = projectHarnessLaneId(context);
  const root = await registryRoot(context.skillRoot, true);
  const path = await resolveWithinPhysicalRoot(root, `lanes/${laneId}.json`, "project Harness Lane");
  const current = existsSync(path)
    ? laneSchema.parse(parseJsonText(await readFile(path, "utf8"), path))
    : null;
  if (current && current.lane_id !== laneId) {
    throw new Error("Refusing to restore a Lane whose current record has another identity.");
  }
  if (snapshot === null) {
    if (current?.active_change_id) {
      throw new Error("Refusing to remove a Lane that still owns an active Change.");
    }
    await rm(path, { force: true });
    return;
  }
  const restored = laneSchema.parse(snapshot);
  if (restored.lane_id !== laneId) {
    throw new Error("Refusing to restore a Lane snapshot with another identity.");
  }
  await writeJsonFile(path, restored);
}

export async function migratePreservedProjectHarnessLaneState(skillRoot: string): Promise<{
  migrated: string[];
  current: string[];
}> {
  const registry = await registryRoot(skillRoot, false);
  if (!existsSync(registry)) return { migrated: [], current: [] };
  const root = await resolveWithinPhysicalRoot(registry, "lanes", "project Harness Lanes");
  if (!existsSync(root)) return { migrated: [], current: [] };
  await assertPhysicalDirectory(root, "project Harness Lanes");
  const migrated: string[] = [];
  const current: string[] = [];
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith(".json")) {
      throw new Error(`Project Harness Lane migration found an unsupported entry: ${entry.name}.`);
    }
    const path = await resolveWithinPhysicalRoot(root, entry.name, "project Harness Lane");
    const raw = parseJsonText(await readFile(path, "utf8"), path);
    if (typeof raw !== "object" || raw === null || !("schema_version" in raw)) {
      throw new Error(`Project Harness Lane has no supported schema: ${entry.name}.`);
    }
    if (raw.schema_version === "2.0") {
      const value = laneSchema.parse(raw);
      assertLaneFilename(entry.name, value.lane_id);
      current.push(value.lane_id);
      continue;
    }
    const legacy = legacyRepositoryLaneSchema.parse(raw);
    assertLaneFilename(entry.name, legacy.lane_id);
    const value: ProjectHarnessLaneRecord = {
      schema_version: "2.0",
      lane_id: legacy.lane_id,
      kind: "repository",
      repository_lane_id: legacy.lane_id,
      branch: legacy.branch,
      head_commit: legacy.head_commit,
      conversation_id: null,
      graph_scope_id: null,
      active_change_id: legacy.active_change_id,
      status: legacy.status,
      updated_at: legacy.updated_at,
    };
    await writeJsonFile(path, laneSchema.parse(value));
    migrated.push(value.lane_id);
  }
  return { migrated, current };
}

function assertLaneFilename(filename: string, laneId: string): void {
  if (filename !== `${laneId}.json`) {
    throw new Error(`Lane record id does not match its filename: ${filename}.`);
  }
}

export async function readProjectHarnessBaseline(skillRoot: string): Promise<ProjectHarnessBaselineRecord | null> {
  const root = await registryRoot(skillRoot, false);
  if (!existsSync(root)) return null;
  const path = await resolveWithinPhysicalRoot(root, "baseline.json", "project Harness baseline");
  if (!existsSync(path)) return null;
  return baselineSchema.parse(parseJsonText(await readFile(path, "utf8"), path));
}

export async function writeProjectHarnessBaseline(
  skillRoot: string,
  value: ProjectHarnessBaselineRecord,
): Promise<void> {
  const root = await registryRoot(skillRoot, true);
  const path = await resolveWithinPhysicalRoot(root, "baseline.json", "project Harness baseline");
  await writeJsonFile(path, baselineSchema.parse(value));
}

export async function readBoundProjectHarnessRecords<T extends Record<string, unknown>>(
  skillRoot: string,
  collection: "changes" | "contracts" | "lanes" | "baseline-events" | "integrations",
  idField: keyof T & string,
): Promise<T[]> {
  const root = await registryRoot(skillRoot, false);
  if (!existsSync(root)) return [];
  const directory = await resolveWithinPhysicalRoot(root, collection, `project Harness ${collection}`);
  if (!existsSync(directory)) return [];
  const info = await assertPhysicalDirectory(directory, `project Harness ${collection}`);
  const result: T[] = [];
  for (const entry of (await readdir(info, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink()) throw new Error(`${collection} contains a link or Junction: ${entry.name}.`);
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const stem = entry.name.slice(0, -5);
    if (canonicalProjectHarnessId(stem, `${collection} record filename`) !== stem) {
      throw new Error(`Non-canonical ${collection} record filename: ${entry.name}.`);
    }
    const path = await resolveWithinPhysicalRoot(directory, entry.name, `project Harness ${collection} record`);
    const value = parseJsonText(await readFile(path, "utf8"), path);
    if (!value || typeof value !== "object" || Array.isArray(value) || (value as Record<string, unknown>)[idField] !== stem) {
      throw new Error(`${collection} record id does not match its filename: ${entry.name}.`);
    }
    result.push(value as T);
  }
  return result;
}

export async function createExclusiveRegistryRecord(
  skillRoot: string,
  collection: "changes" | "contracts" | "integrations",
  id: string,
  value: unknown,
): Promise<string> {
  const identifier = canonicalProjectHarnessId(id, `${collection} record id`);
  const root = await registryRoot(skillRoot, true);
  const directory = await resolveWithinPhysicalRoot(root, collection, `project Harness ${collection}`);
  await mkdir(directory, { recursive: true });
  const path = await resolveWithinPhysicalRoot(directory, `${identifier}.json`, `project Harness ${collection} record`);
  const handle = await open(path, "wx");
  try {
    await handle.writeFile(`${JSON.stringify(value, null, 2)}\n`, "utf8");
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(path, { force: true });
    throw error;
  }
  await handle.close();
  return path;
}

export async function withRegistryClaimLock<T>(
  skillRoot: string,
  laneId: string,
  action: () => Promise<T>,
): Promise<T> {
  const identifier = canonicalProjectHarnessId(laneId, "Lane id");
  const root = await registryRoot(skillRoot, true);
  const locks = await resolveWithinPhysicalRoot(root, "locks", "project Harness Registry locks");
  await mkdir(locks, { recursive: true });
  const lock = await resolveWithinPhysicalRoot(locks, `change-claim-${identifier}`, "project Harness Change claim lock");
  const token = randomBytes(16).toString("hex");
  try {
    await mkdir(lock);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new Error(`Lane Change claim is already in progress: ${laneId}.`);
    throw error;
  }
  const owner = join(lock, "owner.json");
  await writeJsonFile(owner, { schema_version: "1.0", lane_id: laneId, token });
  let result: T | undefined;
  let actionError: unknown;
  try {
    result = await action();
  } catch (error) {
    actionError = error;
  }
  let cleanupError: unknown;
  try {
    const current = parseJsonText(await readFile(owner, "utf8"), owner) as { token?: string };
    if (current.token === token) await rm(lock, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") cleanupError = error;
  }
  if (actionError !== undefined) throw actionError;
  if (cleanupError !== undefined) throw cleanupError;
  return result as T;
}

export async function classifyProjectHarnessBaselineRelation(
  projectRoot: string,
  recordedCommit: string | null,
  canonicalCommit: string | null,
  probe: GitAncestryProbe = defaultGitAncestryProbe,
): Promise<ProjectHarnessBaselineRelation> {
  if (!await probe.isRepository(projectRoot)) return "not_applicable";
  if (!recordedCommit || !canonicalCommit) return "unavailable";
  try {
    const recorded = await probe.resolveCommit(projectRoot, recordedCommit);
    const canonical = await probe.resolveCommit(projectRoot, canonicalCommit);
    if (!recorded || !canonical) return "unavailable";
    if (recorded === canonical) return "equal";
    if (await probe.isAncestor(projectRoot, recorded, canonical)) return "canonical_advanced";
    if (await probe.isAncestor(projectRoot, canonical, recorded)) return "worktree_behind";
    return "diverged";
  } catch {
    return "unavailable";
  }
}

const defaultGitAncestryProbe: GitAncestryProbe = {
  isRepository: isGitRepo,
  async resolveCommit(projectRoot, reference) {
    try {
      return await git(projectRoot, ["rev-parse", "--verify", `${reference}^{commit}`]);
    } catch {
      return null;
    }
  },
  async isAncestor(projectRoot, ancestor, descendant) {
    try {
      await git(projectRoot, ["merge-base", "--is-ancestor", ancestor, descendant]);
      return true;
    } catch {
      return false;
    }
  },
};

async function registryRoot(skillRoot: string, create: boolean): Promise<string> {
  const physical = await assertPhysicalDirectory(skillRoot, "project Harness Skill");
  const root = await resolveWithinPhysicalRoot(physical, "state/registry", "project Harness Registry");
  if (create) await mkdir(root, { recursive: true });
  return root;
}
