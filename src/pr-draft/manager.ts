import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { readLandingPackage, type LandingReadinessPackage } from "../landing/manager.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { getGitBranch, gitText } from "../project/git.js";
import type { ManagedProject, PrDraftRevision, ResolvedMemory } from "../types/index.js";

const execFileAsync = promisify(execFile);

export type RemoteProviderStatus = "ready" | "no-remote" | "no-gh" | "no-auth" | "not-git" | "unsupported";
export type PrDraftStatus = "prepared" | "created";

export interface RemoteProviderCapability {
  provider: "github-cli";
  status: RemoteProviderStatus;
  ready: boolean;
  remoteName?: string;
  remoteUrl?: string;
  currentBranch?: string | null;
  reason?: string;
  setupHint: string;
}

export interface PrDraftPackage {
  version: "1.0";
  id: string;
  landingPackageId: string;
  projectId: string | null;
  provider: "github-cli";
  status: PrDraftStatus;
  title: string;
  bodyArtifact: string;
  packageArtifact: string;
  remoteName?: string;
  remoteUrl?: string;
  baseBranch?: string | null;
  branchName: string;
  prUrl?: string;
  landingEvidenceRefs: string[];
  createdAt: string;
  updatedAt: string;
}

const prDraftRevisionSchema: z.ZodType<PrDraftRevision> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  prDraftPackageId: z.string(),
  previousLandingPackageId: z.string(),
  landingPackageId: z.string(),
  projectId: z.string().nullable(),
  branchName: z.string(),
  prUrl: z.string().optional(),
  commitHash: z.string().optional(),
  artifactRefs: z.array(z.string()),
  createdAt: z.string(),
});

const prDraftPackageSchema: z.ZodType<PrDraftPackage> = z.object({
  version: z.literal("1.0"),
  id: z.string(),
  landingPackageId: z.string(),
  projectId: z.string().nullable(),
  provider: z.literal("github-cli"),
  status: z.enum(["prepared", "created"]),
  title: z.string(),
  bodyArtifact: z.string(),
  packageArtifact: z.string(),
  remoteName: z.string().optional(),
  remoteUrl: z.string().optional(),
  baseBranch: z.string().nullable().optional(),
  branchName: z.string(),
  prUrl: z.string().optional(),
  landingEvidenceRefs: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export async function detectRemoteProviderCapability(project: ManagedProject): Promise<RemoteProviderCapability> {
  const base = {
    provider: "github-cli" as const,
    setupHint: "配置 Git remote、安装 GitHub CLI，并运行 gh auth login 后才能创建 Draft PR。",
  };
  const currentBranch = await getGitBranch(project.path).catch(() => null);
  const insideGit = await commandOk("git", ["rev-parse", "--is-inside-work-tree"], project.path);
  if (!insideGit) {
    return { ...base, status: "not-git", ready: false, currentBranch, reason: "当前项目不是 Git 仓库。" };
  }
  const remotes = (await gitText(project.path, ["remote"]).catch(() => "")).split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
  if (remotes.length === 0) {
    return { ...base, status: "no-remote", ready: false, currentBranch, reason: "当前项目没有配置 Git remote。" };
  }
  const remoteName = remotes.includes("origin") ? "origin" : remotes[0];
  const remoteUrl = await gitText(project.path, ["remote", "get-url", remoteName]).then((value) => value.trim()).catch(() => undefined);
  const gh = githubCliCommand();
  const hasGh = await commandOk(gh, ["--version"], project.path);
  if (!hasGh) {
    return { ...base, status: "no-gh", ready: false, currentBranch, remoteName, remoteUrl, reason: "未检测到 GitHub CLI gh。" };
  }
  const hasAuth = await commandOk(gh, ["auth", "status"], project.path);
  if (!hasAuth) {
    return { ...base, status: "no-auth", ready: false, currentBranch, remoteName, remoteUrl, reason: "GitHub CLI 尚未完成认证或当前仓库无权限。" };
  }
  return {
    ...base,
    status: "ready",
    ready: true,
    currentBranch,
    remoteName,
    remoteUrl,
    reason: "GitHub CLI provider ready.",
    setupHint: "远端 Draft PR 能力可用。",
  };
}

export async function preparePrDraftPackage(project: ManagedProject, landingPackageId: string): Promise<PrDraftPackage> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "PR draft package");
  const landing = await readLandingPackage(memory, landingPackageId);
  assertLandingReady(landing);
  const existing = await findPrDraftPackageForLanding(memory, landingPackageId);
  const now = new Date().toISOString();
  const capability = await detectRemoteProviderCapability(project);
  const id = existing?.id ?? `pr-draft-${contentHash(landingPackageId).slice(0, 12)}`;
  const directory = join(prDraftRoot(memory), id);
  await mkdir(directory, { recursive: true });
  const title = prTitleForLanding(landing);
  const branchName = existing?.branchName ?? buildBranchName(landing);
  const body = renderPrBody(landing);
  await writeFile(join(directory, "pr-body.md"), body, "utf8");
  const pkg: PrDraftPackage = {
    version: "1.0",
    id,
    landingPackageId,
    projectId: memory.projectId,
    provider: "github-cli",
    status: existing?.status ?? "prepared",
    title,
    bodyArtifact: displayArtifactPath(memory, join(directory, "pr-body.md")),
    packageArtifact: displayArtifactPath(memory, join(directory, "pr-draft-package.json")),
    remoteName: capability.remoteName,
    remoteUrl: capability.remoteUrl,
    baseBranch: capability.currentBranch,
    branchName,
    prUrl: existing?.prUrl,
    landingEvidenceRefs: landing.artifactRefs,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await writeJsonFile(join(directory, "pr-draft-package.json"), pkg);
  return pkg;
}

export async function createDraftPr(project: ManagedProject, landingPackageId: string): Promise<PrDraftPackage> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Draft PR creation");
  const landing = await readLandingPackage(memory, landingPackageId);
  assertLandingReady(landing);
  await assertSourceStillMatchesLanding(project, landing);
  const capability = await detectRemoteProviderCapability(project);
  if (!capability.ready || !capability.remoteName) {
    throw new Error(capability.reason ?? "Draft PR provider is unavailable.");
  }
  const prepared = await preparePrDraftPackage(project, landingPackageId);
  const directory = join(prDraftRoot(memory), prepared.id);
  const bodyPath = join(directory, "pr-body.md");
  await gitText(project.path, ["checkout", "-B", prepared.branchName]);
  if (landing.changedFiles.length === 0) throw new Error("Cannot create Draft PR: landing package has no changed files.");
  await gitText(project.path, ["add", "-A", "--", ...landing.changedFiles]);
  const staged = (await gitText(project.path, ["diff", "--cached", "--name-only"])).trim();
  if (!staged) throw new Error("Cannot create Draft PR: there are no reviewed source changes staged for commit.");
  await gitText(project.path, ["commit", "-m", prepared.title]);
  await gitText(project.path, ["push", "-u", capability.remoteName, prepared.branchName]);
  const gh = githubCliCommand();
  const existingUrl = await commandText(gh, ["pr", "view", "--head", prepared.branchName, "--json", "url", "--jq", ".url"], project.path).then((value) => value.trim()).catch(() => "");
  let prUrl = existingUrl;
  if (prUrl) {
    await commandText(gh, ["pr", "edit", prUrl, "--title", prepared.title, "--body-file", bodyPath], project.path);
  } else {
    prUrl = (await commandText(gh, [
      "pr",
      "create",
      "--draft",
      "--title",
      prepared.title,
      "--body-file",
      bodyPath,
      "--head",
      prepared.branchName,
      ...(prepared.baseBranch ? ["--base", prepared.baseBranch] : []),
    ], project.path)).trim();
  }
  const created: PrDraftPackage = {
    ...prepared,
    status: "created",
    remoteName: capability.remoteName,
    remoteUrl: capability.remoteUrl,
    baseBranch: prepared.baseBranch ?? capability.currentBranch,
    prUrl,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(join(directory, "pr-draft-package.json"), created);
  return created;
}

export async function refreshPrDraftStatus(project: ManagedProject, landingPackageId: string): Promise<PrDraftPackage> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "PR draft refresh");
  const pkg = await findPrDraftPackageForLanding(memory, landingPackageId);
  if (!pkg) return preparePrDraftPackage(project, landingPackageId);
  const capability = await detectRemoteProviderCapability(project);
  if (!capability.ready) return pkg;
  const prUrl = await commandText(githubCliCommand(), ["pr", "view", "--head", pkg.branchName, "--json", "url", "--jq", ".url"], project.path)
    .then((value) => value.trim())
    .catch(() => pkg.prUrl);
  const refreshed: PrDraftPackage = { ...pkg, prUrl, updatedAt: new Date().toISOString() };
  await writeJsonFile(join(prDraftRoot(memory), pkg.id, "pr-draft-package.json"), refreshed);
  return refreshed;
}

export async function updateDraftPrFromLanding(project: ManagedProject, landingPackageId: string): Promise<{ package: PrDraftPackage; revision: PrDraftRevision }> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Draft PR update");
  const landing = await readLandingPackage(memory, landingPackageId);
  assertLandingReady(landing);
  const exactExisting = await findPrDraftPackageForLanding(memory, landingPackageId);
  if (!exactExisting || !(await sourceRootIsClean(project.path))) {
    await assertSourceStillMatchesLanding(project, landing);
  }
  const existing = exactExisting ?? await findLatestCreatedPrDraftPackageForChanges(memory, landing.target.changeIds);
  if (!existing || existing.status !== "created") {
    throw new Error("Cannot update Draft PR: no existing Draft PR package is associated with this demand.");
  }
  const capability = await detectRemoteProviderCapability(project);
  if (!capability.ready || !capability.remoteName) {
    throw new Error(capability.reason ?? "Draft PR provider is unavailable.");
  }
  const directory = join(prDraftRoot(memory), existing.id);
  await mkdir(directory, { recursive: true });
  const title = prTitleForLanding(landing);
  const body = renderPrBody(landing);
  const bodyPath = join(directory, "pr-body.md");
  await writeFile(bodyPath, body, "utf8");
  await gitText(project.path, ["checkout", existing.branchName]);
  if (landing.changedFiles.length > 0) {
    await gitText(project.path, ["add", "-A", "--", ...landing.changedFiles]);
  } else {
    await gitText(project.path, ["add", "-A"]);
  }
  const staged = (await gitText(project.path, ["diff", "--cached", "--name-only"])).trim();
  let commitHash: string | undefined;
  if (staged) {
    await gitText(project.path, ["commit", "-m", title]);
    commitHash = (await gitText(project.path, ["rev-parse", "HEAD"])).trim();
    await gitText(project.path, ["push", "-u", capability.remoteName, existing.branchName]);
  }
  const prRef = existing.prUrl ?? existing.branchName;
  const gh = githubCliCommand();
  await commandText(gh, ["pr", "edit", prRef, "--title", title, "--body-file", bodyPath], project.path);
  const prUrl = await commandText(gh, ["pr", "view", "--head", existing.branchName, "--json", "url", "--jq", ".url"], project.path)
    .then((value) => value.trim())
    .catch(() => existing.prUrl);
  const now = new Date().toISOString();
  const updated: PrDraftPackage = {
    ...existing,
    landingPackageId,
    title,
    bodyArtifact: displayArtifactPath(memory, bodyPath),
    remoteName: capability.remoteName,
    remoteUrl: capability.remoteUrl,
    prUrl,
    landingEvidenceRefs: landing.artifactRefs,
    updatedAt: now,
  };
  const revision: PrDraftRevision = {
    version: "1.0",
    id: `pr-revision-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    prDraftPackageId: existing.id,
    previousLandingPackageId: existing.landingPackageId,
    landingPackageId,
    projectId: memory.projectId,
    branchName: existing.branchName,
    ...(prUrl ? { prUrl } : {}),
    ...(commitHash ? { commitHash } : {}),
    artifactRefs: [updated.bodyArtifact, updated.packageArtifact, ...landing.artifactRefs],
    createdAt: now,
  };
  prDraftRevisionSchema.parse(revision);
  await writeJsonFile(join(directory, "pr-draft-package.json"), updated);
  await writeJsonFile(join(directory, "revisions", `${revision.id}.json`), revision);
  return { package: updated, revision };
}

export async function findPrDraftPackageForLanding(memory: ResolvedMemory, landingPackageId: string): Promise<PrDraftPackage | null> {
  const packages = await listPrDraftPackages(memory);
  return packages.find((pkg) => pkg.landingPackageId === landingPackageId) ?? null;
}

export async function findLatestCreatedPrDraftPackageForChanges(memory: ResolvedMemory, changeIds: string[]): Promise<PrDraftPackage | null> {
  const wanted = new Set(changeIds);
  for (const pkg of await listPrDraftPackages(memory)) {
    if (pkg.status !== "created") continue;
    const landing = await readLandingPackage(memory, pkg.landingPackageId).catch(() => null);
    if (landing && landing.target.changeIds.some((changeId) => wanted.has(changeId))) return pkg;
  }
  return null;
}

export async function listPrDraftPackages(memory: ResolvedMemory): Promise<PrDraftPackage[]> {
  const root = prDraftRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const packages: PrDraftPackage[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, "pr-draft-package.json");
    if (!existsSync(file)) continue;
    packages.push(await readRequiredJsonFile(file, prDraftPackageSchema));
  }
  return packages.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function assertLandingReady(landing: LandingReadinessPackage): void {
  if (landing.review?.verdict !== "ready") {
    throw new Error(`Cannot prepare Draft PR: landing package ${landing.id} has not passed merge-reviewer review.`);
  }
}

async function assertSourceStillMatchesLanding(project: ManagedProject, landing: LandingReadinessPackage): Promise<void> {
  const diff = await gitText(project.path, ["diff", "--no-ext-diff", "--binary", "HEAD"]);
  const untracked = await gitText(project.path, ["ls-files", "--others", "--exclude-standard", "-z"]);
  const untrackedDiff = (await Promise.all(untracked.split("\0").map((item) => item.trim()).filter(Boolean).map((file) => renderUntrackedTextPatch(project.path, file)))).join("");
  const hash = contentHash(diff + untrackedDiff);
  if (hash !== landing.sourceDiffHash) {
    throw new Error("Cannot create Draft PR: local source diff no longer matches the reviewed landing package.");
  }
}

async function sourceRootIsClean(cwd: string): Promise<boolean> {
  const status = await gitText(cwd, ["status", "--short"]).catch(() => "unknown");
  return status.trim().length === 0;
}

async function renderUntrackedTextPatch(cwd: string, file: string): Promise<string> {
  const normalized = file.replace(/\\/g, "/");
  const content = await readFile(join(cwd, file), "utf8");
  const lines = content.endsWith("\n") ? content.slice(0, -1).split(/\r?\n/) : content.split(/\r?\n/);
  const lineCount = Math.max(lines.length, 1);
  return [
    `diff --git a/${normalized} b/${normalized}`,
    "new file mode 100644",
    "index 0000000..0000000",
    "--- /dev/null",
    `+++ b/${normalized}`,
    `@@ -0,0 +1,${lineCount} @@`,
    ...lines.map((line) => `+${line}`),
    "",
  ].join("\n");
}

function renderPrBody(landing: LandingReadinessPackage): string {
  return [
    "## Summary",
    "",
    landing.summary,
    "",
    "## Changed Files",
    "",
    ...(landing.changedFiles.length ? landing.changedFiles.map((file) => `- ${file}`) : ["- None"]),
    "",
    "## Validation / Audit Evidence",
    "",
    ...(landing.artifactRefs.length ? landing.artifactRefs.map((ref) => `- ${ref}`) : ["- None"]),
    "",
    "## Merge Reviewer",
    "",
    landing.review?.summary ?? "No merge-reviewer summary.",
    "",
    "## Boundary",
    "",
    "This is a Draft PR handoff created by AHO. It does not merge, land, or enable auto-merge.",
    "",
  ].join("\n");
}

function prTitleForLanding(landing: LandingReadinessPackage): string {
  const change = landing.target.changeIds[0] ?? "aho-change";
  return `AHO: ${change}`;
}

function buildBranchName(landing: LandingReadinessPackage): string {
  const change = slug(landing.target.changeIds[0] ?? "change");
  return `aho/${change}-${landing.id.replace(/^landing-/, "").slice(0, 16)}`;
}

function slug(value: string): string {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return normalized || "change";
}

async function commandOk(command: string, args: string[], cwd: string): Promise<boolean> {
  try {
    await commandText(command, args, cwd);
    return true;
  } catch {
    return false;
  }
}

async function commandText(command: string, args: string[], cwd: string): Promise<string> {
  const { stdout } = await execFileAsync(command, args, { cwd, maxBuffer: 50 * 1024 * 1024 });
  return stdout;
}

function prDraftRoot(memory: ResolvedMemory): string {
  return join(memory.workbenchRoot, "pr-drafts");
}

function displayArtifactPath(memory: ResolvedMemory, absolutePath: string): string {
  return `${memory.artifactBase === "memory-root" ? "memory://" : "project://"}${relative(memory.artifactBase === "memory-root" ? memory.memoryRoot : memory.projectRoot, absolutePath).replace(/\\/g, "/")}`;
}

function contentHash(content: string): string {
  return createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
}

export function githubCliCommand(): string {
  const portable = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, "Programs", "GitHub CLI Portable", "bin", "gh.exe") : "";
  return portable && existsSync(portable) ? portable : "gh";
}
