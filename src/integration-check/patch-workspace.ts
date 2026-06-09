import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { git, gitText } from "../project/git.js";
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
