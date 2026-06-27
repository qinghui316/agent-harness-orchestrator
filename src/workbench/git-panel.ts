import { lstat, realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { git, gitText } from "../project/git.js";
import type { ManagedProject } from "../types/index.js";

export type ProjectGitFileGroup = "staged" | "unstaged" | "untracked";
export type ProjectGitDiffStatus = "text" | "binary" | "too-large" | "not-found" | "not-git-repository" | "no-diff";

export interface ProjectGitFileStatus {
  relativePath: string;
  name: string;
  group: ProjectGitFileGroup;
  indexStatus: string;
  worktreeStatus: string;
  statusLabel: string;
  additions?: number;
  deletions?: number;
}

export interface ProjectGitStatusResult {
  isGitRepository: boolean;
  branch: string | null;
  dirty: boolean;
  staged: ProjectGitFileStatus[];
  unstaged: ProjectGitFileStatus[];
  untracked: ProjectGitFileStatus[];
  totalAdditions: number;
  totalDeletions: number;
  message?: string;
}

export interface ProjectGitDiffSection {
  label: string;
  kind: "staged" | "unstaged";
  patch: string;
  truncated: boolean;
}

export interface ProjectGitDiffResult {
  relativePath: string;
  name: string;
  status: ProjectGitDiffStatus;
  sections: ProjectGitDiffSection[];
  additions?: number;
  deletions?: number;
  message?: string;
}

const MAX_DIFF_BYTES = 240 * 1024;
const MAX_DIFF_LINES = 2400;

export async function getProjectGitStatus(project: ManagedProject): Promise<ProjectGitStatusResult> {
  const root = await safeProjectRoot(project);
  const repoRoot = await getGitRoot(root);
  if (!repoRoot) {
    return emptyStatus("当前项目不是 Git 仓库。");
  }
  if ((await realpath(repoRoot)) !== root) {
    return emptyStatus("当前项目路径不是 Git 根目录。请打开仓库根目录后查看 Git 状态。");
  }

  const branch = await git(root, ["branch", "--show-current"]).catch(() => null);
  const porcelain = await gitText(root, ["status", "--porcelain=v1", "--untracked-files=all"]).catch(() => "");
  const stagedStats = await readNumstat(root, ["diff", "--cached", "--numstat"]);
  const unstagedStats = await readNumstat(root, ["diff", "--numstat"]);
  const staged: ProjectGitFileStatus[] = [];
  const unstaged: ProjectGitFileStatus[] = [];
  const untracked: ProjectGitFileStatus[] = [];

  for (const rawLine of porcelain.split(/\r?\n/).filter(Boolean)) {
    const parsed = parsePorcelainLine(rawLine);
    if (!parsed) continue;
    const safePath = await normalizeGitProjectPath(root, parsed.path).catch(() => null);
    if (!safePath) continue;
    if (parsed.indexStatus !== " " && parsed.indexStatus !== "?") {
      staged.push(buildFileStatus(safePath, "staged", parsed.indexStatus, parsed.worktreeStatus, stagedStats.get(safePath)));
    }
    if (parsed.worktreeStatus !== " " && parsed.worktreeStatus !== "?") {
      unstaged.push(buildFileStatus(safePath, "unstaged", parsed.indexStatus, parsed.worktreeStatus, unstagedStats.get(safePath)));
    }
    if (parsed.indexStatus === "?" && parsed.worktreeStatus === "?") {
      untracked.push(buildFileStatus(safePath, "untracked", parsed.indexStatus, parsed.worktreeStatus));
    }
  }

  const totals = [...staged, ...unstaged].reduce((sum, file) => ({
    additions: sum.additions + (file.additions ?? 0),
    deletions: sum.deletions + (file.deletions ?? 0),
  }), { additions: 0, deletions: 0 });

  return {
    isGitRepository: true,
    branch: branch || null,
    dirty: staged.length + unstaged.length + untracked.length > 0,
    staged: sortFiles(staged),
    unstaged: sortFiles(unstaged),
    untracked: sortFiles(untracked),
    totalAdditions: totals.additions,
    totalDeletions: totals.deletions,
  };
}

export async function getProjectGitDiff(project: ManagedProject, requestedPath: string): Promise<ProjectGitDiffResult> {
  const root = await safeProjectRoot(project);
  const repoRoot = await getGitRoot(root);
  const relativePath = normalizeRelativePath(requestedPath);
  const name = basename(relativePath) || relativePath || "diff";
  if (!repoRoot || (await realpath(repoRoot)) !== root) {
    return { relativePath, name, status: "not-git-repository", sections: [], message: "当前项目不是可读取的 Git 根目录。" };
  }
  const safePath = await normalizeGitProjectPath(root, relativePath).catch(() => null);
  if (!safePath) {
    return { relativePath, name, status: "not-found", sections: [], message: "文件不在当前项目安全范围内。" };
  }

  const status = await getProjectGitStatus(project);
  const knownPaths = new Set([
    ...status.staged.map((file) => file.relativePath),
    ...status.unstaged.map((file) => file.relativePath),
    ...status.untracked.map((file) => file.relativePath),
  ]);
  if (!knownPaths.has(safePath)) {
    return { relativePath: safePath, name: basename(safePath), status: "not-found", sections: [], message: "此文件不是当前 Git 变更列表的一部分。" };
  }
  const sections = [
    await readPatchSection(root, safePath, "staged"),
    await readPatchSection(root, safePath, "unstaged"),
  ].filter((section): section is ProjectGitDiffSection => Boolean(section));

  if (sections.some((section) => section.patch.includes("GIT binary patch") || /Binary files .* differ/.test(section.patch))) {
    return { relativePath: safePath, name: basename(safePath), status: "binary", sections: [], message: "二进制 diff 不支持文本预览。" };
  }
  if (sections.length === 0) {
    return { relativePath: safePath, name: basename(safePath), status: "no-diff", sections: [], message: "此文件没有可展示的文本 patch。未跟踪文件可通过文件面板预览并引用。" };
  }

  const tooLarge = sections.some((section) => section.patch.length > MAX_DIFF_BYTES);
  const numstat = await readNumstat(root, ["diff", "--numstat", "--", safePath]);
  const stagedNumstat = await readNumstat(root, ["diff", "--cached", "--numstat", "--", safePath]);
  const combined = combineStats(numstat.get(safePath), stagedNumstat.get(safePath));
  return {
    relativePath: safePath,
    name: basename(safePath),
    status: tooLarge ? "too-large" : "text",
    sections: sections.map((section) => clampPatchSection(section)),
    additions: combined?.additions,
    deletions: combined?.deletions,
    message: tooLarge ? "Diff 较大，仅显示开头部分。" : undefined,
  };
}

async function safeProjectRoot(project: ManagedProject): Promise<string> {
  return realpath(resolve(project.path));
}

async function getGitRoot(root: string): Promise<string | null> {
  try {
    return await git(root, ["rev-parse", "--show-toplevel"]);
  } catch {
    return null;
  }
}

function emptyStatus(message: string): ProjectGitStatusResult {
  return {
    isGitRepository: false,
    branch: null,
    dirty: false,
    staged: [],
    unstaged: [],
    untracked: [],
    totalAdditions: 0,
    totalDeletions: 0,
    message,
  };
}

function parsePorcelainLine(line: string): { indexStatus: string; worktreeStatus: string; path: string } | null {
  if (line.length < 4) return null;
  const indexStatus = line[0] ?? " ";
  const worktreeStatus = line[1] ?? " ";
  const rawPath = line.slice(3).trim();
  const renamed = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() ?? rawPath : rawPath;
  return { indexStatus, worktreeStatus, path: unquoteGitPath(renamed) };
}

function unquoteGitPath(value: string): string {
  return value.replace(/^"|"$/g, "").replace(/\\"/g, "\"").replace(/\\/g, "/");
}

async function normalizeGitProjectPath(root: string, value: string): Promise<string | null> {
  const normalized = normalizeRelativePath(value);
  if (!normalized || isUnsafePath(normalized)) return null;
  const absolutePath = resolve(root, normalized);
  if (!isInside(root, absolutePath)) return null;
  const entry = await lstat(absolutePath).catch(() => null);
  if (entry?.isSymbolicLink()) return null;
  const resolved = entry ? await realpath(absolutePath).catch(() => absolutePath) : absolutePath;
  if (!isInside(root, resolved)) return null;
  const relativePath = relative(root, resolved).split(sep).join("/");
  return relativePath && !relativePath.startsWith("..") ? relativePath : null;
}

function normalizeRelativePath(value: string): string {
  return value.trim().replace(/\\/g, "/").replace(/^\/+/, "");
}

function isUnsafePath(value: string): boolean {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith("/") || value.includes("\0") || value.split("/").includes("..");
}

function isInside(root: string, target: string): boolean {
  const rel = relative(root, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function buildFileStatus(
  relativePath: string,
  group: ProjectGitFileGroup,
  indexStatus: string,
  worktreeStatus: string,
  stats?: { additions: number; deletions: number },
): ProjectGitFileStatus {
  return {
    relativePath,
    name: basename(relativePath),
    group,
    indexStatus,
    worktreeStatus,
    statusLabel: statusLabel(group, indexStatus, worktreeStatus),
    additions: stats?.additions,
    deletions: stats?.deletions,
  };
}

function statusLabel(group: ProjectGitFileGroup, indexStatus: string, worktreeStatus: string): string {
  if (group === "untracked") return "未跟踪";
  const code = group === "staged" ? indexStatus : worktreeStatus;
  if (code === "A") return "新增";
  if (code === "M") return "修改";
  if (code === "D") return "删除";
  if (code === "R") return "重命名";
  if (code === "C") return "复制";
  return "变更";
}

async function readNumstat(root: string, args: string[]): Promise<Map<string, { additions: number; deletions: number }>> {
  const output = await gitText(root, args).catch(() => "");
  const map = new Map<string, { additions: number; deletions: number }>();
  for (const line of output.split(/\r?\n/).filter(Boolean)) {
    const [addedRaw, deletedRaw, ...pathParts] = line.split(/\t/);
    const path = unquoteGitPath(pathParts.join("\t"));
    if (!path || addedRaw === "-" || deletedRaw === "-") continue;
    map.set(path, {
      additions: Number.parseInt(addedRaw, 10) || 0,
      deletions: Number.parseInt(deletedRaw, 10) || 0,
    });
  }
  return map;
}

function combineStats(a?: { additions: number; deletions: number }, b?: { additions: number; deletions: number }): { additions: number; deletions: number } | undefined {
  if (!a && !b) return undefined;
  return {
    additions: (a?.additions ?? 0) + (b?.additions ?? 0),
    deletions: (a?.deletions ?? 0) + (b?.deletions ?? 0),
  };
}

async function readPatchSection(root: string, relativePath: string, kind: "staged" | "unstaged"): Promise<ProjectGitDiffSection | null> {
  const args = kind === "staged"
    ? ["diff", "--cached", "--no-color", "--no-ext-diff", "--", relativePath]
    : ["diff", "--no-color", "--no-ext-diff", "--", relativePath];
  const patch = await gitText(root, args).catch(() => "");
  if (!patch.trim()) return null;
  return { label: kind === "staged" ? "已暂存" : "未暂存", kind, patch, truncated: false };
}

function clampPatchSection(section: ProjectGitDiffSection): ProjectGitDiffSection {
  const lines = section.patch.split(/\r?\n/);
  const tooManyLines = lines.length > MAX_DIFF_LINES;
  const tooManyBytes = section.patch.length > MAX_DIFF_BYTES;
  if (!tooManyBytes && !tooManyLines) return section;
  let patch = section.patch.slice(0, MAX_DIFF_BYTES);
  if (tooManyLines) patch = lines.slice(0, MAX_DIFF_LINES).join("\n");
  return { ...section, patch, truncated: true };
}

function sortFiles(files: ProjectGitFileStatus[]): ProjectGitFileStatus[] {
  return [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
