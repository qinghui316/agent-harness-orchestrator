import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type { ProjectWorkbenchArtifactPathPort } from "../project-runtime/paths.js";
import { renderLandingSummary, renderMergeReview } from "./rendering.js";
import { landingPackageSchema } from "./schemas.js";
import type { LandingReadinessPackage } from "./types.js";
import { landingRoot } from "./utils.js";

export async function listLandingPackages(memory: ProjectWorkbenchArtifactPathPort): Promise<LandingReadinessPackage[]> {
  const root = landingRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const packages: LandingReadinessPackage[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, "landing-package.json");
    if (!existsSync(file)) continue;
    packages.push(await readRequiredJsonFile(file, landingPackageSchema));
  }
  return packages.sort((a, b) => (b.reviewedAt ?? b.createdAt).localeCompare(a.reviewedAt ?? a.createdAt));
}

export async function readLandingPackage(memory: ProjectWorkbenchArtifactPathPort, packageId: string): Promise<LandingReadinessPackage> {
  return readRequiredJsonFile(join(landingRoot(memory), packageId, "landing-package.json"), landingPackageSchema);
}

export async function writeLandingArtifacts(directory: string, pkg: LandingReadinessPackage): Promise<void> {
  await writeJsonFile(join(directory, "landing-package.json"), pkg);
  await writeFile(join(directory, "landing-summary.md"), renderLandingSummary(pkg), "utf8");
  if (pkg.review) await writeFile(join(directory, "merge-review.md"), renderMergeReview(pkg.review), "utf8");
}
