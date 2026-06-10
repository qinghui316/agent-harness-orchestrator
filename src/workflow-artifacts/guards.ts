import { join } from "node:path";
import { z } from "zod";
import { readRequiredJsonFile } from "../fs/json.js";
import type { ResolvedMemory } from "../types/index.js";
import type { WorkflowArtifactWithChange } from "./types.js";

const changeScopeSchema = z.object({ id: z.string() });

export async function readChangePathChangeId(memory: ResolvedMemory, changePath: string): Promise<string> {
  const metadata = await readRequiredJsonFile(join(memory.memoryRoot, changePath, "change.json"), changeScopeSchema);
  return metadata.id;
}

export async function assertChangePathScope(memory: ResolvedMemory, changePath: string, changeId: string, label: string): Promise<void> {
  const expected = await readChangePathChangeId(memory, changePath);
  if (expected !== changeId) {
    throw new Error(`${label} is not scoped to the selected Change: expected ${expected}, got ${changeId}.`);
  }
}

export async function assertWorkflowArtifactScope(memory: ResolvedMemory, changePath: string, artifact: WorkflowArtifactWithChange, label: string): Promise<void> {
  await assertChangePathScope(memory, changePath, artifact.changeId, `${label} ${artifact.id ?? ""}`.trim());
}
