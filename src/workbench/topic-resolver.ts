import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { readScopedChangeMetadataAt } from "../change/metadata.js";
import { getActiveChanges } from "../ecl/index.js";
import { resolveProjectMemory } from "../memory/resolver.js";
import type { ManagedProject, ResolvedMemory } from "../types/index.js";

export async function resolveTopic(project: ManagedProject, changeId: string): Promise<{ memory: ResolvedMemory; changePath: string }> {
  const memory = await resolveProjectMemory(project);
  const roots = [join(memory.changesRoot, "active"), join(memory.changesRoot, "archive")];
  for (const root of roots) {
    const candidate = join(root, changeId);
    if (existsSync(candidate)) {
      const relativePath = relative(memory.memoryRoot, candidate).replace(/\\/g, "/");
      if (root.endsWith("active")) {
        return { memory, changePath: relativePath };
      }
      const metadata = await readScopedChangeMetadataAt(memory, relativePath, "archive").catch(() => ({ metadata: null })).then((result) => result.metadata);
      if (metadata?.id === changeId) {
        return { memory, changePath: relativePath };
      }
    }
    if (root.endsWith("archive")) {
      const archived = await readdir(root, { withFileTypes: true }).catch(() => []);
      for (const entry of archived) {
        if (!entry.isDirectory()) continue;
        const archivedCandidate = join(root, entry.name);
        const relativePath = relative(memory.memoryRoot, archivedCandidate).replace(/\\/g, "/");
        const metadata = await readScopedChangeMetadataAt(memory, relativePath, "archive").catch(() => ({ metadata: null })).then((result) => result.metadata);
        if (metadata?.id === changeId) {
          return { memory, changePath: relative(memory.memoryRoot, archivedCandidate).replace(/\\/g, "/") };
        }
      }
    }
  }
  throw new Error(`Topic not found: ${changeId}.`);
}

export async function getSingleActiveChangeId(project: ManagedProject): Promise<string> {
  const memory = await resolveProjectMemory(project);
  const active = await getActiveChanges(memory);
  if (active.length !== 1) throw new Error(`Expected exactly one active Topic; found ${active.length}.`);
  return active[0].name;
}
