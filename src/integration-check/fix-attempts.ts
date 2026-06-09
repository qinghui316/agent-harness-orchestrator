import { createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { resolveProjectMemory } from "../memory/resolver.js";
import { git } from "../project/git.js";
import { getGlobalWorktreeCheckoutRoot } from "../worktree/manager.js";
import type { ManagedProject } from "../types/index.js";
import { integrationArtifact } from "./artifacts.js";
import { appendIntegrationEvent } from "./repository.js";
import { collectCheckoutPatch, prepareIntegrationFixCheckout, removeKnownIntegrationFailureMarkers } from "./patch-workspace.js";
import type { IntegrationArtifact, IntegrationFixAttempt, IntegrationFixAttemptStatus } from "./types.js";

export async function runIntegrationFixAttempt(
  project: ManagedProject,
  directory: string,
  checkId: string,
  inputPatchPath: string,
  reason: string,
): Promise<{ attempt: IntegrationFixAttempt; artifact?: IntegrationArtifact }> {
  const memory = await resolveProjectMemory(project);
  const startedAt = new Date().toISOString();
  const attemptId = `fix-${checkId}-${Math.max(1, Date.now()).toString(36)}`;
  const checkoutPath = join(getGlobalWorktreeCheckoutRoot(memory.projectId ?? project.id), "integration", shortFixCheckoutName(checkId, attemptId));
  let artifact: IntegrationArtifact | undefined;
  let status: IntegrationFixAttemptStatus = "failed";
  let summary = "自动修复未能生成可验证的组合补丁。";

  try {
    await prepareIntegrationFixCheckout(project, checkoutPath, inputPatchPath);
    await removeKnownIntegrationFailureMarkers(checkoutPath);
    const repairedPatch = await collectCheckoutPatch(checkoutPath);
    if (!repairedPatch.trim()) {
      throw new Error("IntegrationFix did not produce a repaired diff.");
    }
    const repairedPatchPath = join(directory, "repaired.patch");
    await writeFile(repairedPatchPath, repairedPatch, "utf8");
    artifact = integrationArtifact(memory, repairedPatchPath, repairedPatch, "repaired", "integration-fix-agent");
    status = "completed";
    summary = "integration-fix-agent 已生成修复后的组合补丁。";
  } catch (cause) {
    summary = cause instanceof Error ? cause.message : String(cause);
    await mkdir(directory, { recursive: true });
    await writeFile(join(directory, "integration-fix-stderr.log"), `${summary}\n`, { encoding: "utf8", flag: "a" });
  } finally {
    await git(project.path, ["worktree", "remove", "--force", checkoutPath]).catch(() => "");
    await rm(checkoutPath, { recursive: true, force: true }).catch(() => undefined);
    await git(project.path, ["worktree", "prune"]).catch(() => "");
  }

  const attempt: IntegrationFixAttempt = {
    id: attemptId,
    roleId: "integration-fix-agent",
    status,
    reason,
    inputArtifactRef: basename(inputPatchPath),
    outputArtifactRef: artifact?.path,
    outputArtifactHash: artifact?.hash,
    summary,
    startedAt,
    finishedAt: new Date().toISOString(),
  };
  await appendIntegrationEvent(directory, checkId, "integration-fix.completed", { attemptId, status, artifact: artifact?.path });
  return { attempt, artifact };
}

function shortFixCheckoutName(checkId: string, attemptId: string): string {
  const hash = createHash("sha256").update(`${checkId}:${attemptId}`).digest("hex").slice(0, 10);
  return `ifix-${hash}`;
}
