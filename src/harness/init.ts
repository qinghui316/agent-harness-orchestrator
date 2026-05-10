import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import type { ManagedProject } from "../types/index.js";
import { getActiveChanges, writeChangeIndex } from "../ecl/index.js";
import { writeProjectMarker } from "../project/marker.js";
import { getTemplateRoot } from "../template-source/paths.js";
import { auditHarness } from "./audit.js";

export interface HarnessInitResult {
  created: string[];
  skipped: string[];
  indexPath: string;
}

async function copyTemplateTree(
  sourceRoot: string,
  targetRoot: string,
  replacements: Record<string, string>,
  created: string[],
  skipped: string[],
): Promise<void> {
  const entries = await readdir(sourceRoot, { withFileTypes: true });
  for (const entry of entries) {
    const source = join(sourceRoot, entry.name);
    const target = join(targetRoot, entry.name);
    if (entry.isDirectory()) {
      await mkdir(target, { recursive: true });
      await copyTemplateTree(source, target, replacements, created, skipped);
      continue;
    }

    const rel = relative(targetRoot, target).replace(/\\/g, "/");
    if (existsSync(target)) {
      skipped.push(rel);
      continue;
    }

    const raw = await readFile(source, "utf8");
    const content = Object.entries(replacements).reduce(
      (text, [key, value]) => text.replaceAll(`{{${key}}}`, value),
      raw,
    );
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
    created.push(rel);
  }
}

export async function initHarness(project: ManagedProject): Promise<HarnessInitResult> {
  const activeChanges = await getActiveChanges(project.path);
  if (activeChanges.length > 0) {
    throw new Error(`Target project has an active change (${activeChanges[0]?.name}); close or park it before harness init.`);
  }

  await writeProjectMarker(project);

  const created: string[] = [".agent-harness/project.json"];
  const skipped: string[] = [];
  const templateRoot = getTemplateRoot();
  const replacements = {
    PROJECT_NAME: project.name,
    PROJECT_ID: project.id,
    GENERATED_AT: new Date().toISOString(),
  };
  await copyTemplateTree(templateRoot, project.path, replacements, created, skipped);
  await writeChangeIndex(project.path);
  await auditHarness(project.path);
  return {
    created,
    skipped,
    indexPath: "harness/changes/INDEX.json",
  };
}
