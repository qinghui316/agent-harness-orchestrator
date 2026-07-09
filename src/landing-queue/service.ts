import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import type { LandingQueueSnapshot, ManagedProject } from "../types/index.js";
import { collectLandingQueueCandidates } from "./candidates.js";
import { writeSnapshot } from "./repository.js";

export async function prepareLandingQueue(project: ManagedProject): Promise<LandingQueueSnapshot> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "landing queue");
  const candidates = await collectLandingQueueCandidates(project, memory);
  return writeSnapshot(memory, candidates);
}

export async function refreshLandingQueue(project: ManagedProject): Promise<LandingQueueSnapshot> {
  return prepareLandingQueue(project);
}
