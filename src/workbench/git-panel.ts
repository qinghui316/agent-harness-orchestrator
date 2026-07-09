import { lstat, realpath } from "node:fs/promises";
import { basename, isAbsolute, relative, resolve, sep } from "node:path";
import { git, gitText } from "../project/git.js";
import type { ManagedProject } from "../types/index.js";

export type ProjectGitFileGroup = "staged" | "unstaged" | "untracked";
export type ProjectGitDiffStatus = "text" | "binary" | "too-large" | "not-found" | "not-git-repository" | "no-diff";
export type ProjectGitHistoryStatus = "ok" | "not-git-repository" | "error";
export type ProjectGitCommitDetailStatus = "ok" | "not-found" | "not-git-repository" | "error";

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

export interface ProjectGitHistoryCommit {
  sha: string;
  shortSha: string;
  summary: string;
  author: string;
  authorEmail: string;
  timestamp: string;
  parents: string[];
  refs: string[];
  additions: number;
  deletions: number;
  changedFiles: number;
}

export interface ProjectGitHistoryResult {
  status: ProjectGitHistoryStatus;
  branch: string | null;
  head: string | null;
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
  commits: ProjectGitHistoryCommit[];
  message?: string;
}

export interface ProjectGitCommitFileChange {
  relativePath: string;
  oldPath?: string | null;
  name: string;
  status: string;
  additions: number;
  deletions: number;
  binary: boolean;
}

export interface ProjectGitCommitDetailResult {
  status: ProjectGitCommitDetailStatus;
  sha: string;
  shortSha?: string;
  summary?: string;
  message?: string;
  author?: string;
  authorEmail?: string;
  committer?: string;
  committerEmail?: string;
  timestamp?: string;
  parents?: string[];
  refs?: string[];
  files: ProjectGitCommitFileChange[];
  totalAdditions?: number;
  totalDeletions?: number;
}

export interface ProjectGitCommitDiffResult {
  relativePath: string;
  name: string;
  status: ProjectGitDiffStatus;
  patch: string;
  truncated: boolean;
  additions?: number;
  deletions?: number;
  message?: string;
}

const MAX_DIFF_BYTES = 240 * 1024;
const MAX_DIFF_LINES = 2400;
const MAX_HISTORY_LIMIT = 50;
const DEFAULT_HISTORY_LIMIT = 30;

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

export async function getProjectGitHistory(
  project: ManagedProject,
  options: { limit?: number; offset?: number; query?: string } = {},
): Promise<ProjectGitHistoryResult> {
  const root = await safeProjectRoot(project);
  const repoRoot = await getGitRoot(root);
  const limit = clampLimit(options.limit);
  const offset = clampOffset(options.offset);
  const query = (options.query ?? "").trim();
  if (!repoRoot || (await realpath(repoRoot)) !== root) {
    return emptyHistory(limit, offset, "当前项目不是可读取的 Git 根目录。");
  }

  const branch = await git(root, ["branch", "--show-current"]).catch(() => null);
  const head = await git(root, ["rev-parse", "--short=12", "HEAD"]).catch(() => null);
  const countArgs = ["rev-list", "--count", "HEAD", ...historyQueryArgs(query)];
  const total = Number.parseInt(await git(root, countArgs).catch(() => "0"), 10) || 0;
  const format = "%H%x1f%h%x1f%an%x1f%ae%x1f%at%x1f%P%x1f%D%x1f%s%x1e";
  const logArgs = [
    "log",
    "HEAD",
    `--max-count=${limit}`,
    `--skip=${offset}`,
    `--pretty=format:${format}`,
    ...historyQueryArgs(query),
  ];
  const output = await gitText(root, logArgs).catch(() => "");
  const commits = await Promise.all(parseHistoryLog(output).map(async (commit) => {
    const stats = await readCommitStats(root, commit.sha);
    return { ...commit, ...stats };
  }));

  return {
    status: "ok",
    branch: branch || null,
    head,
    total,
    limit,
    offset,
    hasMore: offset + commits.length < total,
    commits,
  };
}

export async function getProjectGitCommitDetail(project: ManagedProject, sha: string): Promise<ProjectGitCommitDetailResult> {
  const root = await safeProjectRoot(project);
  const repoRoot = await getGitRoot(root);
  const requestedSha = normalizeSha(sha);
  if (!repoRoot || (await realpath(repoRoot)) !== root) {
    return { status: "not-git-repository", sha: requestedSha, files: [], message: "当前项目不是可读取的 Git 根目录。" };
  }
  const fullSha = await resolveCommitSha(root, requestedSha);
  if (!fullSha) {
    return { status: "not-found", sha: requestedSha, files: [], message: "未找到该 Git commit。" };
  }

  const format = "%H%x1f%h%x1f%an%x1f%ae%x1f%cn%x1f%ce%x1f%at%x1f%P%x1f%D%x1f%s%x1f%B";
  const raw = await gitText(root, ["show", "--quiet", `--pretty=format:${format}`, fullSha]).catch(() => "");
  const fields = raw.split("\x1f");
  if (fields.length < 11) {
    return { status: "error", sha: fullSha, files: [], message: "无法读取该 commit 的详情。" };
  }
  const files = await readCommitFiles(root, fullSha);
  const totals = files.reduce((sum, file) => ({
    additions: sum.additions + file.additions,
    deletions: sum.deletions + file.deletions,
  }), { additions: 0, deletions: 0 });

  return {
    status: "ok",
    sha: fields[0] ?? fullSha,
    shortSha: fields[1] ?? fullSha.slice(0, 12),
    author: fields[2] ?? "",
    authorEmail: fields[3] ?? "",
    committer: fields[4] ?? "",
    committerEmail: fields[5] ?? "",
    timestamp: timestampFromUnix(fields[6] ?? ""),
    parents: splitParents(fields[7] ?? ""),
    refs: splitRefs(fields[8] ?? ""),
    summary: fields[9] ?? "",
    message: fields.slice(10).join("\x1f").trim(),
    files,
    totalAdditions: totals.additions,
    totalDeletions: totals.deletions,
  };
}

export async function getProjectGitCommitDiff(project: ManagedProject, sha: string, requestedPath: string): Promise<ProjectGitCommitDiffResult> {
  const root = await safeProjectRoot(project);
  const repoRoot = await getGitRoot(root);
  const relativePath = normalizeRelativePath(requestedPath);
  const requestedSha = normalizeSha(sha);
  const name = basename(relativePath) || relativePath || "diff";
  if (!repoRoot || (await realpath(repoRoot)) !== root) {
    return { relativePath, name, status: "not-git-repository", patch: "", truncated: false, message: "当前项目不是可读取的 Git 根目录。" };
  }
  const fullSha = await resolveCommitSha(root, requestedSha);
  if (!fullSha) {
    return { relativePath, name, status: "not-found", patch: "", truncated: false, message: "未找到该 Git commit。" };
  }
  const safePath = await normalizeGitProjectPath(root, relativePath).catch(() => null);
  if (!safePath) {
    return { relativePath, name, status: "not-found", patch: "", truncated: false, message: "文件不在当前项目安全范围内。" };
  }
  const files = await readCommitFiles(root, fullSha);
  const file = files.find((entry) => entry.relativePath === safePath || entry.oldPath === safePath);
  if (!file) {
    return { relativePath: safePath, name: basename(safePath), status: "not-found", patch: "", truncated: false, message: "该文件不在此 commit 的变更列表中。" };
  }
  if (file.binary) {
    return { relativePath: file.relativePath, name: basename(file.relativePath), status: "binary", patch: "", truncated: false, additions: file.additions, deletions: file.deletions, message: "二进制 diff 不支持文本预览。" };
  }

  const patch = await gitText(root, ["show", "--format=", "--no-color", "--no-ext-diff", fullSha, "--", file.relativePath]).catch(() => "");
  if (!patch.trim()) {
    return { relativePath: file.relativePath, name: basename(file.relativePath), status: "no-diff", patch: "", truncated: false, message: "此文件没有可展示的文本 patch。" };
  }
  if (patch.includes("GIT binary patch") || /Binary files .* differ/.test(patch)) {
    return { relativePath: file.relativePath, name: basename(file.relativePath), status: "binary", patch: "", truncated: false, additions: file.additions, deletions: file.deletions, message: "二进制 diff 不支持文本预览。" };
  }
  const clamped = clampPatch(patch);
  return {
    relativePath: file.relativePath,
    name: basename(file.relativePath),
    status: clamped.truncated ? "too-large" : "text",
    patch: clamped.patch,
    truncated: clamped.truncated,
    additions: file.additions,
    deletions: file.deletions,
    message: clamped.truncated ? "Diff 较大，仅显示开头部分。" : undefined,
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

function emptyHistory(limit: number, offset: number, message: string): ProjectGitHistoryResult {
  return {
    status: "not-git-repository",
    branch: null,
    head: null,
    total: 0,
    limit,
    offset,
    hasMore: false,
    commits: [],
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

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return DEFAULT_HISTORY_LIMIT;
  return Math.max(1, Math.min(MAX_HISTORY_LIMIT, Math.floor(value ?? DEFAULT_HISTORY_LIMIT)));
}

function clampOffset(value: number | undefined): number {
  if (!Number.isFinite(value ?? NaN)) return 0;
  return Math.max(0, Math.floor(value ?? 0));
}

function historyQueryArgs(query: string): string[] {
  if (!query) return [];
  return ["--regexp-ignore-case", `--grep=${query.slice(0, 120)}`];
}

function parseHistoryLog(output: string): Omit<ProjectGitHistoryCommit, "additions" | "deletions" | "changedFiles">[] {
  return output.split("\x1e")
    .map((record) => record.trim())
    .filter(Boolean)
    .map((record) => {
      const [sha = "", shortSha = "", author = "", authorEmail = "", timestamp = "", parents = "", refs = "", summary = ""] = record.split("\x1f");
      return {
        sha,
        shortSha,
        author,
        authorEmail,
        timestamp: timestampFromUnix(timestamp),
        parents: splitParents(parents),
        refs: splitRefs(refs),
        summary: summary || "(no message)",
      };
    })
    .filter((commit) => commit.sha.length > 0);
}

async function readCommitStats(root: string, sha: string): Promise<{ additions: number; deletions: number; changedFiles: number }> {
  const files = await readCommitFiles(root, sha);
  return files.reduce((sum, file) => ({
    additions: sum.additions + file.additions,
    deletions: sum.deletions + file.deletions,
    changedFiles: sum.changedFiles + 1,
  }), { additions: 0, deletions: 0, changedFiles: 0 });
}

async function readCommitFiles(root: string, sha: string): Promise<ProjectGitCommitFileChange[]> {
  const statsOutput = await gitText(root, ["show", "--format=", "--numstat", "--no-renames", sha]).catch(() => "");
  const statusOutput = await gitText(root, ["show", "--format=", "--name-status", "--no-renames", sha]).catch(() => "");
  const stats = new Map<string, { additions: number; deletions: number; binary: boolean }>();
  const statuses = new Map<string, { status: string; oldPath?: string | null }>();
  for (const line of statsOutput.split(/\r?\n/).filter(Boolean)) {
    const parts = line.split(/\t/);
    if (parts.length >= 3 && (/^\d+$/.test(parts[0] ?? "") || parts[0] === "-")) {
      const rawPath = unquoteGitPath(parts.slice(2).join("\t"));
      const safePath = normalizeGitRelativePath(rawPath);
      if (!safePath) continue;
      stats.set(safePath, {
        additions: parts[0] === "-" ? 0 : Number.parseInt(parts[0] ?? "0", 10) || 0,
        deletions: parts[1] === "-" ? 0 : Number.parseInt(parts[1] ?? "0", 10) || 0,
        binary: parts[0] === "-" || parts[1] === "-",
      });
    }
  }
  for (const line of statusOutput.split(/\r?\n/).filter(Boolean)) {
    const parts = line.split(/\t/);
    if (/^[ACDMRTUXB?]/.test(parts[0] ?? "") && parts.length >= 2) {
      const rawPath = unquoteGitPath(parts[parts.length - 1] ?? "");
      const safePath = normalizeGitRelativePath(rawPath);
      if (!safePath) continue;
      const oldPath = parts.length > 2 ? normalizeGitRelativePath(unquoteGitPath(parts[1] ?? "")) : null;
      statuses.set(safePath, { status: parts[0] ?? "M", oldPath });
    }
  }
  const paths = new Set([...stats.keys(), ...statuses.keys()]);
  return [...paths].sort((a, b) => a.localeCompare(b)).map((relativePath) => {
    const stat = stats.get(relativePath);
    const status = statuses.get(relativePath);
    return {
      relativePath,
      oldPath: status?.oldPath,
      name: basename(relativePath),
      status: normalizeCommitStatus(status?.status),
      additions: stat?.additions ?? 0,
      deletions: stat?.deletions ?? 0,
      binary: stat?.binary ?? false,
    };
  });
}

async function resolveCommitSha(root: string, value: string): Promise<string | null> {
  if (!/^[0-9a-fA-F]{7,40}$/.test(value)) return null;
  try {
    return await git(root, ["rev-parse", "--verify", `${value}^{commit}`]);
  } catch {
    return null;
  }
}

function normalizeSha(value: string): string {
  return value.trim();
}

function timestampFromUnix(value: string): string {
  const seconds = Number.parseInt(value, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  return new Date(seconds * 1000).toISOString();
}

function splitParents(value: string): string[] {
  return value.split(/\s+/).map((item) => item.trim()).filter(Boolean);
}

function splitRefs(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function normalizeCommitStatus(value: string | undefined): string {
  if (!value) return "M";
  if (value.startsWith("R")) return "R";
  if (value.startsWith("C")) return "C";
  return value[0] ?? "M";
}

function normalizeGitRelativePath(value: string): string | null {
  const normalized = normalizeRelativePath(value);
  if (!normalized || isUnsafePath(normalized)) return null;
  return normalized;
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
  const clamped = clampPatch(section.patch);
  return { ...section, patch: clamped.patch, truncated: clamped.truncated || section.truncated };
}

function clampPatch(patchText: string): { patch: string; truncated: boolean } {
  const lines = patchText.split(/\r?\n/);
  const tooManyLines = lines.length > MAX_DIFF_LINES;
  const tooManyBytes = patchText.length > MAX_DIFF_BYTES;
  if (!tooManyBytes && !tooManyLines) return { patch: patchText, truncated: false };
  let patch = patchText.slice(0, MAX_DIFF_BYTES);
  if (tooManyLines) patch = lines.slice(0, MAX_DIFF_LINES).join("\n");
  return { patch, truncated: true };
}

function sortFiles(files: ProjectGitFileStatus[]): ProjectGitFileStatus[] {
  return [...files].sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}
