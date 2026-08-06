import { existsSync } from "node:fs";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import type {
  LandingQueueCandidate,
  LandingQueueDecision,
  LandingQueueResult,
  LandingQueueSnapshot,
} from "../types/index.js";
import type { ProjectExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import type { ProjectWorkbenchArtifactPathPort } from "../project-runtime/paths.js";
import { contentHash, displayLandingQueueArtifactPath, landingQueueRoot } from "./paths.js";
import { renderResultSummary, renderSnapshotSummary, summaryForQueue } from "./rendering.js";
import { decisionSchema, resultSchema, snapshotSchema } from "./schemas.js";

export async function latestLandingQueueSnapshot(memory: ProjectWorkbenchArtifactPathPort): Promise<LandingQueueSnapshot | null> {
  const snapshots = await listLandingQueueSnapshots(memory);
  return snapshots[0] ?? null;
}

export async function listLandingQueueSnapshots(memory: ProjectWorkbenchArtifactPathPort): Promise<LandingQueueSnapshot[]> {
  const root = landingQueueRoot(memory);
  if (!existsSync(root)) return [];
  const entries = await readdir(root, { withFileTypes: true });
  const snapshots: LandingQueueSnapshot[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const file = join(root, entry.name, "landing-queue-snapshot.json");
    if (!existsSync(file)) continue;
    snapshots.push(await readRequiredJsonFile(file, snapshotSchema));
  }
  return snapshots.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function writeSnapshot(memory: ProjectExecutionRuntimePort, candidates: LandingQueueCandidate[]): Promise<LandingQueueSnapshot> {
  const now = new Date().toISOString();
  const readyCount = candidates.filter((candidate) => candidate.canMerge).length;
  const needsAttentionCount = candidates.filter((candidate) => candidate.status === "needs-attention").length;
  const mergedCount = candidates.filter((candidate) => candidate.status === "merged").length;
  const status = readyCount > 0 ? "ready" : needsAttentionCount > 0 ? "needs-attention" : "empty";
  const id = `landing-queue-${contentHash(`${now}:${candidates.map((candidate) => `${candidate.id}:${candidate.updatedAt}`).join("|")}`).slice(0, 12)}`;
  const directory = join(landingQueueRoot(memory), id);
  await mkdir(directory, { recursive: true });
  const snapshotPath = join(directory, "landing-queue-snapshot.json");
  const summaryPath = join(directory, "landing-queue-summary.md");
  const snapshot: LandingQueueSnapshot = {
    version: "1.0",
    id,
    projectId: memory.projectId,
    status,
    summary: summaryForQueue(readyCount, needsAttentionCount, mergedCount),
    readyCount,
    needsAttentionCount,
    mergedCount,
    candidates,
    snapshotArtifact: displayLandingQueueArtifactPath(memory, snapshotPath),
    summaryArtifact: displayLandingQueueArtifactPath(memory, summaryPath),
    evidenceRefs: Array.from(new Set(candidates.flatMap((candidate) => candidate.evidenceRefs))),
    createdAt: now,
  };
  snapshotSchema.parse(snapshot);
  await writeJsonFile(snapshotPath, snapshot);
  await writeFile(summaryPath, renderSnapshotSummary(snapshot), "utf8");
  return snapshot;
}

export async function writeDecisionResult(
  _memory: ProjectExecutionRuntimePort,
  directory: string,
  decision: LandingQueueDecision,
  result: LandingQueueResult,
): Promise<LandingQueueResult> {
  decisionSchema.parse(decision);
  resultSchema.parse(result);
  await writeJsonFile(join(directory, "landing-queue-decision.json"), decision);
  await writeJsonFile(join(directory, "landing-queue-result.json"), result);
  await writeFile(join(directory, "landing-queue-result.md"), renderResultSummary(result), "utf8");
  return result;
}
