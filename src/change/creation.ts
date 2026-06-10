import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildAcMap } from "../ecl/anchors.js";
import { getActiveChanges, writeChangeIndex } from "../ecl/index.js";
import { atomicWriteFile, writeJsonFile } from "../fs/json.js";
import { slugify } from "../fs/path.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { createEmptySpecTests } from "../spec-test/manager.js";
import type { ChangeMetadata, ManagedProject } from "../types/index.js";
import { displayPath } from "./paths.js";
import { requiredChangeFiles } from "./schemas.js";
import { normalizeInitialContent, renderTemplate } from "./templates.js";
import { readChangeContents } from "./repository.js";
import type { ChangeCreateResult } from "./types.js";

export async function createChange(project: ManagedProject, options: { title: string; body?: string }): Promise<ChangeCreateResult> {
  return createChangeInDirectory(project, options, "active", true);
}

export async function createConcurrentChange(project: ManagedProject, options: { title: string; body?: string }): Promise<ChangeCreateResult> {
  return createChangeInDirectory(project, options, "active", false);
}

async function createChangeInDirectory(project: ManagedProject, options: { title: string; body?: string }, directory: "active" | "parking", requireNoActive: boolean): Promise<ChangeCreateResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Change creation");
  const activeChanges = await getActiveChanges(memory);
  if (requireNoActive && activeChanges.length > 0) {
    throw new Error(`Cannot create a new change while an active change exists: ${activeChanges[0]?.name}.`);
  }

  const id = slugify(options.title);
  if (existsSync(join(memory.changesRoot, "active", id)) || existsSync(join(memory.changesRoot, "parking", id))) {
    throw new Error(`Change already exists: ${id}.`);
  }
  const changePath = join(memory.changesRoot, directory, id);
  const relativePath = displayPath(memory, changePath);
  if (existsSync(changePath)) {
    throw new Error(`Change already exists: ${relativePath}.`);
  }

  await mkdir(join(changePath, "reviews"), { recursive: true });
  for (const file of requiredChangeFiles) {
    const content = await renderTemplate(memory, file, options.title);
    await atomicWriteFile(join(changePath, file), normalizeInitialContent(file, content, options.body));
  }

  const now = new Date().toISOString();
  const change: ChangeMetadata = {
    version: "1.0",
    id,
    title: options.title,
    state: "active",
    createdAt: now,
    updatedAt: now,
    closedAt: null,
    archivePath: null,
  };
  await writeJsonFile(join(changePath, "change.json"), change);
  await createEmptySpecTests(changePath, id);

  const contents = await readChangeContents(changePath);
  const specContent = contents["spec.md"] ?? "";
  const tasksContent = contents["tasks.md"] ?? "";
  const acMap = buildAcMap({
    changeId: id,
    specContent,
    tasksContent,
    placeholderFiles: [
      { path: "spec.md", content: specContent },
      { path: "tasks.md", content: tasksContent },
    ],
  });
  await writeJsonFile(join(changePath, "ac-map.json"), acMap);
  const index = await writeChangeIndex(memory);
  return { change, path: relativePath, acMap, index };
}
