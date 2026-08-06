import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonFile } from "../fs/json.js";
import { readLandingPackage } from "../landing/repository.js";
import { requireProjectExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import { gitText } from "../project/git.js";
import type { ManagedProject, PrDraftRevision } from "../types/index.js";
import { commandText, detectRemoteProviderCapability, githubCliArgs, githubCliCommand } from "./provider.js";
import { findLatestCreatedPrDraftPackageForChanges, findPrDraftPackageForLanding } from "./repository.js";
import { buildBranchName, prTitleForLanding, renderPrBody } from "./rendering.js";
import { prDraftRevisionSchema } from "./schemas.js";
import { assertLandingReady, assertSourceStillMatchesLanding, sourceRootIsClean } from "./source-match.js";
import type { PrDraftPackage } from "./types.js";
import { contentHash, displayPrDraftArtifactPath, prDraftRoot } from "./utils.js";

export async function preparePrDraftPackage(project: ManagedProject, landingPackageId: string): Promise<PrDraftPackage> {
  const memory = await requireProjectExecutionRuntimePort(project);
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
    bodyArtifact: displayPrDraftArtifactPath(memory, join(directory, "pr-body.md")),
    packageArtifact: displayPrDraftArtifactPath(memory, join(directory, "pr-draft-package.json")),
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
  const memory = await requireProjectExecutionRuntimePort(project);
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
  const ghArgs = githubCliArgs();
  const existingUrl = await commandText(gh, [...ghArgs, "pr", "view", "--head", prepared.branchName, "--json", "url", "--jq", ".url"], project.path).then((value) => value.trim()).catch(() => "");
  let prUrl = existingUrl;
  if (prUrl) {
    await commandText(gh, [...ghArgs, "pr", "edit", prUrl, "--title", prepared.title, "--body-file", bodyPath], project.path);
  } else {
    prUrl = (await commandText(gh, [
      ...ghArgs,
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
  const memory = await requireProjectExecutionRuntimePort(project);
  const pkg = await findPrDraftPackageForLanding(memory, landingPackageId);
  if (!pkg) return preparePrDraftPackage(project, landingPackageId);
  const capability = await detectRemoteProviderCapability(project);
  if (!capability.ready) return pkg;
  const prUrl = await commandText(githubCliCommand(), [...githubCliArgs(), "pr", "view", "--head", pkg.branchName, "--json", "url", "--jq", ".url"], project.path)
    .then((value) => value.trim())
    .catch(() => pkg.prUrl);
  const refreshed: PrDraftPackage = { ...pkg, prUrl, updatedAt: new Date().toISOString() };
  await writeJsonFile(join(prDraftRoot(memory), pkg.id, "pr-draft-package.json"), refreshed);
  return refreshed;
}

export async function updateDraftPrFromLanding(project: ManagedProject, landingPackageId: string): Promise<{ package: PrDraftPackage; revision: PrDraftRevision }> {
  const memory = await requireProjectExecutionRuntimePort(project);
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
  const ghArgs = githubCliArgs();
  await commandText(gh, [...ghArgs, "pr", "edit", prRef, "--title", title, "--body-file", bodyPath], project.path);
  const prUrl = await commandText(gh, [...ghArgs, "pr", "view", "--head", existing.branchName, "--json", "url", "--jq", ".url"], project.path)
    .then((value) => value.trim())
    .catch(() => existing.prUrl);
  const now = new Date().toISOString();
  const updated: PrDraftPackage = {
    ...existing,
    landingPackageId,
    title,
    bodyArtifact: displayPrDraftArtifactPath(memory, bodyPath),
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
