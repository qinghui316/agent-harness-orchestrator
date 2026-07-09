import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { git, gitText } from "../project/git.js";
import { renderUntrackedTextPatch } from "../project/untracked-patch.js";
import type { ManagedProject } from "../types/index.js";

export async function prepareIntegrationCheckout(project: ManagedProject, checkoutPath: string, patchPath: string): Promise<void> {
  await git(project.path, ["worktree", "remove", "--force", checkoutPath]).catch(() => "");
  await rm(checkoutPath, { recursive: true, force: true }).catch(() => undefined);
  await git(project.path, ["worktree", "prune"]).catch(() => "");
  await mkdir(checkoutPath, { recursive: true }).catch(() => undefined);
  await rm(checkoutPath, { recursive: true, force: true }).catch(() => undefined);
  await git(project.path, ["worktree", "add", "--detach", checkoutPath, "HEAD"]);
  await git(checkoutPath, ["apply", "--binary", patchPath]);
}

export async function prepareIntegrationFixCheckout(project: ManagedProject, checkoutPath: string, patchPath: string): Promise<void> {
  await git(project.path, ["worktree", "remove", "--force", checkoutPath]).catch(() => "");
  await rm(checkoutPath, { recursive: true, force: true }).catch(() => undefined);
  await git(project.path, ["worktree", "prune"]).catch(() => "");
  await git(project.path, ["worktree", "add", "--detach", checkoutPath, "HEAD"]);
  await git(checkoutPath, ["apply", "--3way", "--binary", patchPath]);
}

export async function removeKnownIntegrationFailureMarkers(checkoutPath: string): Promise<void> {
  await rm(join(checkoutPath, "integration-validation-fail.txt"), { force: true }).catch(() => undefined);
  await rm(join(checkoutPath, "integration-audit-fail.txt"), { force: true }).catch(() => undefined);
}

export async function collectCheckoutPatch(checkoutPath: string): Promise<string> {
  const tracked = await gitText(checkoutPath, ["diff", "--no-ext-diff", "--binary", "HEAD"]);
  const untracked = await gitText(checkoutPath, ["ls-files", "--others", "--exclude-standard", "-z"]);
  const untrackedPatches = await Promise.all(untracked.split("\0").map((item) => item.trim()).filter(Boolean).sort().map((file) => renderUntrackedTextPatch(checkoutPath, file)));
  return tracked + untrackedPatches.join("");
}
