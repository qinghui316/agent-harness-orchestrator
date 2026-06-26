import { gitText } from "../project/git.js";
import { renderUntrackedTextPatch } from "../project/untracked-patch.js";
import type { ManagedProject } from "../types/index.js";
import type { LandingReadinessPackage } from "../landing/types.js";
import { contentHash } from "./utils.js";

export function assertLandingReady(landing: LandingReadinessPackage): void {
  if (landing.review?.verdict !== "ready") {
    throw new Error(`Cannot prepare Draft PR: landing package ${landing.id} has not passed merge-reviewer review.`);
  }
}

export async function assertSourceStillMatchesLanding(project: ManagedProject, landing: LandingReadinessPackage): Promise<void> {
  const diff = await gitText(project.path, ["diff", "--no-ext-diff", "--binary", "HEAD"]);
  const untracked = await gitText(project.path, ["ls-files", "--others", "--exclude-standard", "-z"]);
  const untrackedDiff = (await Promise.all(untracked.split("\0").map((item) => item.trim()).filter(Boolean).map((file) => renderUntrackedTextPatch(project.path, file)))).join("");
  const hash = contentHash(diff + untrackedDiff);
  if (hash !== landing.sourceDiffHash) {
    throw new Error("Cannot create Draft PR: local source diff no longer matches the reviewed landing package.");
  }
}

export async function sourceRootIsClean(cwd: string): Promise<boolean> {
  const status = await gitText(cwd, ["status", "--short"]).catch(() => "unknown");
  return status.trim().length === 0;
}
