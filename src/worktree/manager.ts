import { existsSync } from "node:fs";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { writeJsonFile } from "../fs/json.js";
import { getAhoHome, shortHash, slugify } from "../fs/path.js";
import { getGitBranch, getGitCommit, getGitStatusShort, git, hasGitCommits, isGitDirty } from "../project/git.js";
import type { ManagedProject, ResolvedMemory, WorktreeMetadata, WorktreeStatus } from "../types/index.js";

const worktreeMetadataSchema = z.object({
  version: z.literal("1.0"),
  worktreeId: z.string(),
  projectId: z.string(),
  changeId: z.string(),
  runId: z.string().optional(),
  branchName: z.string(),
  baseRef: z.string(),
  baseCommit: z.string(),
  createdFromDirtyProject: z.boolean(),
  createdAt: z.string(),
  status: z.enum(["active", "applied"]),
  checkoutPath: z.string(),
  appliedAt: z.string().optional(),
  applyRunId: z.string().optional(),
  appliedCommit: z.string().optional(),
  worktreeDiffHash: z.string().optional(),
});

export interface WorktreeCreateOptions {
  baseRef?: string;
  runId?: string;
}

export interface WorktreeCreateResult {
  metadata: WorktreeMetadata;
  status: WorktreeStatus;
  metadataPath: string;
  warnings: string[];
}

export interface WorktreeRemoveResult {
  removed: WorktreeMetadata;
  checkoutRemoved: boolean;
}

export interface WorktreeAppliedUpdate {
  applyRunId: string;
  worktreeDiffHash: string;
  appliedCommit?: string;
}

export function getGlobalWorktreeCheckoutRoot(projectId: string): string {
  return join(getAhoHome(), "worktrees", projectId, "checkouts");
}

export async function createWorktree(
  project: ManagedProject,
  memory: ResolvedMemory,
  changeId: string,
  options: WorktreeCreateOptions = {},
): Promise<WorktreeCreateResult> {
  if (!memory.projectId) {
    throw new Error("Cannot create worktree without a resolved project id.");
  }
  if (!(await hasGitCommits(project.path))) {
    throw new Error("Cannot create worktree: project Git repository has no commits. Create an initial commit first.");
  }

  const baseRef = await resolveBaseRef(project.path, options.baseRef);
  const baseCommit = await getGitCommit(project.path, baseRef);
  if (!baseCommit) {
    throw new Error(`Cannot create worktree: base ref does not resolve to a commit: ${baseRef}.`);
  }

  const sourceDirty = (await isGitDirty(project.path)) === true;
  const worktreeId = buildWorktreeId(changeId);
  const branchName = `aho/${slugify(changeId)}/${worktreeId}`;
  const checkoutPath = join(getGlobalWorktreeCheckoutRoot(memory.projectId), worktreeId);

  if (existsSync(checkoutPath)) {
    throw new Error(`Worktree checkout already exists: ${checkoutPath}.`);
  }

  await mkdir(getGlobalWorktreeCheckoutRoot(memory.projectId), { recursive: true });
  await mkdir(memory.worktreeMetadataRoot, { recursive: true });
  await git(project.path, ["worktree", "prune"]);
  await git(project.path, ["worktree", "add", "-b", branchName, checkoutPath, baseRef]);

  const metadata: WorktreeMetadata = {
    version: "1.0",
    worktreeId,
    projectId: memory.projectId,
    changeId,
    runId: options.runId,
    branchName,
    baseRef,
    baseCommit,
    createdFromDirtyProject: sourceDirty,
    createdAt: new Date().toISOString(),
    status: "active",
    checkoutPath,
  };

  const metadataPath = getWorktreeMetadataPath(memory, worktreeId);
  await writeJsonFile(metadataPath, metadata);
  await writeWorktreeIndex(memory);
  const status = await getWorktreeStatus(memory, worktreeId);
  const warnings = sourceDirty
    ? ["Source project has uncommitted changes; they were not copied into the new worktree."]
    : [];
  return { metadata, status, metadataPath, warnings };
}

export async function listWorktreeStatuses(memory: ResolvedMemory): Promise<WorktreeStatus[]> {
  const metadata = await listWorktreeMetadata(memory);
  const statuses = await Promise.all(metadata.map((item) => statusFromMetadata(item)));
  return statuses.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listWorktreeMetadata(memory: ResolvedMemory): Promise<WorktreeMetadata[]> {
  if (!existsSync(memory.worktreeMetadataRoot)) return [];
  const entries = await readdir(memory.worktreeMetadataRoot, { withFileTypes: true });
  const metadata: WorktreeMetadata[] = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    metadata.push(await readWorktreeMetadata(memory, entry.name.replace(/\.json$/, "")));
  }
  return metadata;
}

export async function getWorktreeStatus(memory: ResolvedMemory, worktreeId: string): Promise<WorktreeStatus> {
  return statusFromMetadata(await readWorktreeMetadata(memory, worktreeId));
}

export async function listWorktreesForChange(memory: ResolvedMemory, changeId: string): Promise<WorktreeStatus[]> {
  return (await listWorktreeStatuses(memory)).filter((item) => item.changeId === changeId);
}

export async function removeWorktree(memory: ResolvedMemory, worktreeId: string, force = false): Promise<WorktreeRemoveResult> {
  const metadata = await readWorktreeMetadata(memory, worktreeId);
  const status = await statusFromMetadata(metadata);
  if (status.dirty && metadata.status !== "applied" && !force) {
    throw new Error(`Cannot remove dirty worktree ${worktreeId}. Use --force to discard the checkout.`);
  }

  let checkoutRemoved = false;
  if (status.exists) {
    const args = ["worktree", "remove"];
    if (force) args.push("--force");
    args.push(metadata.checkoutPath);
    await git(memory.projectRoot, args);
    checkoutRemoved = true;
  }

  await rm(getWorktreeMetadataPath(memory, worktreeId), { force: true });
  await git(memory.projectRoot, ["worktree", "prune"]).catch(() => "");
  await writeWorktreeIndex(memory);
  return { removed: metadata, checkoutRemoved };
}

export async function markWorktreeApplied(memory: ResolvedMemory, worktreeId: string, update: WorktreeAppliedUpdate): Promise<WorktreeMetadata> {
  const metadata = await readWorktreeMetadata(memory, worktreeId);
  const applied: WorktreeMetadata = {
    ...metadata,
    status: "applied",
    appliedAt: new Date().toISOString(),
    applyRunId: update.applyRunId,
    appliedCommit: update.appliedCommit,
    worktreeDiffHash: update.worktreeDiffHash,
  };
  await writeJsonFile(getWorktreeMetadataPath(memory, worktreeId), applied);
  await writeWorktreeIndex(memory);
  return applied;
}

export function getWorktreeMetadataPath(memory: ResolvedMemory, worktreeId: string): string {
  return join(memory.worktreeMetadataRoot, `${worktreeId}.json`);
}

export async function writeWorktreeIndex(memory: ResolvedMemory): Promise<void> {
  const metadata = await listWorktreeMetadata(memory);
  await writeJsonFile(memory.worktreeIndexPath, {
    generatedAt: new Date().toISOString(),
    worktrees: metadata.map((item) => ({
      worktreeId: item.worktreeId,
      changeId: item.changeId,
      runId: item.runId,
      branchName: item.branchName,
      checkoutPath: item.checkoutPath,
      createdAt: item.createdAt,
      status: item.status,
    })),
  });
}

async function readWorktreeMetadata(memory: ResolvedMemory, worktreeId: string): Promise<WorktreeMetadata> {
  const raw = await import("node:fs/promises").then(({ readFile }) => readFile(getWorktreeMetadataPath(memory, worktreeId), "utf8"));
  const parsed: unknown = JSON.parse(raw);
  return worktreeMetadataSchema.parse(parsed);
}

async function statusFromMetadata(metadata: WorktreeMetadata): Promise<WorktreeStatus> {
  const exists = existsSync(metadata.checkoutPath);
  if (!exists) {
    return { ...metadata, exists: false, branch: null, headCommit: null, dirty: null, diffSummary: [] };
  }
  const [branch, headCommit, diffSummary] = await Promise.all([
    getGitBranch(metadata.checkoutPath),
    getGitCommit(metadata.checkoutPath),
    getGitStatusShort(metadata.checkoutPath).catch(() => []),
  ]);
  return {
    ...metadata,
    exists: true,
    branch,
    headCommit,
    dirty: diffSummary.length > 0,
    diffSummary,
  };
}

async function resolveBaseRef(projectPath: string, explicitBaseRef?: string): Promise<string> {
  if (explicitBaseRef?.trim()) return explicitBaseRef.trim();
  const branch = await getGitBranch(projectPath);
  if (!branch) {
    throw new Error("Cannot create worktree from detached HEAD without --base <ref>.");
  }
  return branch;
}

function buildWorktreeId(changeId: string): string {
  const stamp = compactLocalTimestamp();
  const hash = shortHash(`${Date.now()}\0${Math.random()}\0${changeId}`).slice(0, 6);
  return `wt-${stamp}-${hash}`;
}

function compactLocalTimestamp(date = new Date()): string {
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    "-",
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join("");
}

function pad(value: number): string {
  return value.toString().padStart(2, "0");
}
