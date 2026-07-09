import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseAcceptanceCriteria } from "../../ecl/anchors.js";
import { getActiveChanges } from "../../ecl/index.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import type { AcceptanceCriterion, ManagedProject, ResolvedMemory } from "../../types/index.js";

export interface SpecTestContext {
  memory: ResolvedMemory;
  changeId: string;
  changeDir: string;
  criteria: AcceptanceCriterion[];
}

export async function getActiveSpecTestContext(project: ManagedProject | ResolvedMemory): Promise<SpecTestContext> {
  const memory = "harnessRoot" in project ? project : await resolveProjectMemory(project);
  const activeRoot = join(memory.changesRoot, "active");
  if (!existsSync(activeRoot)) {
    throw new Error("Cannot resolve spec-test context: no active change found.");
  }
  const active = await getActiveChanges(memory);
  if (active.length !== 1) {
    throw new Error(`Expected exactly one active change; found ${active.length}.`);
  }
  return getSpecTestContextFromChangeItem(memory, active[0].name, active[0].path);
}

export async function getSpecTestContextForChange(project: ManagedProject | ResolvedMemory, changeId: string): Promise<SpecTestContext> {
  const memory = "harnessRoot" in project ? project : await resolveProjectMemory(project);
  const active = await getActiveChanges(memory);
  const match = active.find((item) => item.name === changeId);
  if (!match) {
    throw new Error(`Active demand conversation not found for scoped spec-test context: ${changeId}.`);
  }
  return getSpecTestContextFromChangeItem(memory, changeId, match.path);
}

async function getSpecTestContextFromChangeItem(memory: ResolvedMemory, changeId: string, changePath: string): Promise<SpecTestContext> {
  const changeDir = join(memory.memoryRoot, changePath);
  const specPath = join(changeDir, "spec.md");
  if (!existsSync(specPath)) {
    throw new Error(`Cannot resolve spec-test context: missing spec.md for ${changeId}.`);
  }
  const specContent = await readFile(specPath, "utf8");
  const criteria = parseAcceptanceCriteria(specContent).criteria.map((criterion) => ({
    id: criterion.id,
    text: criterion.text,
    taskIds: [],
    validationRefs: [],
    warnings: [],
  }));
  return { memory, changeId, changeDir, criteria };
}
