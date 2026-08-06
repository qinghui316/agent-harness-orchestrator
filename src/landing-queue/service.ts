import { requireProjectExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import type { LandingQueueSnapshot, ManagedProject } from "../types/index.js";
import { collectLandingQueueCandidates } from "./candidates.js";
import { writeSnapshot } from "./repository.js";

export async function prepareLandingQueue(project: ManagedProject): Promise<LandingQueueSnapshot> {
  const memory = await requireProjectExecutionRuntimePort(project);
  const candidates = await collectLandingQueueCandidates(project, memory);
  return writeSnapshot(memory, candidates);
}

export async function refreshLandingQueue(project: ManagedProject): Promise<LandingQueueSnapshot> {
  return prepareLandingQueue(project);
}
