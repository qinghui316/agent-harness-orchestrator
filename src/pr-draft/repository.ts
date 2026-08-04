import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile } from "../fs/json.js";
import { readLandingPackage } from "../landing/repository.js";
import type { ProjectWorkbenchArtifactPathPort } from "../project-runtime/paths.js";
import { prDraftPackageSchema } from "./schemas.js";
import type { PrDraftPackage } from "./types.js";
import { prDraftRoot } from "./utils.js";

export async function findPrDraftPackageForLanding(memory: ProjectWorkbenchArtifactPathPort, landingPackageId: string): Promise<PrDraftPackage | null> {
  const packages = await listPrDraftPackages(memory);
  return packages.find((pkg) => pkg.landingPackageId === landingPackageId) ?? null;
}

export async function findLatestCreatedPrDraftPackageForChanges(memory: ProjectWorkbenchArtifactPathPort, changeIds: string[]): Promise<PrDraftPackage | null> {
  const wanted = new Set(changeIds);
  for (const pkg of await listPrDraftPackages(memory)) {
    if (pkg.status !== "created") continue;
    const landing = await readLandingPackage(memory, pkg.landingPackageId).catch(() => null);
    if (landing && landing.target.changeIds.some((changeId) => wanted.has(changeId))) return pkg;
  }
  return null;
}

export async function listPrDraftPackages(memory: ProjectWorkbenchArtifactPathPort): Promise<PrDraftPackage[]> {
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
