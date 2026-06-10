import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../fs/json.js";
import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";
import { displayArtifactPath } from "./artifact-refs.js";
import { assertChangePathScope, assertWorkflowArtifactScope } from "./guards.js";
import { hashArtifactRefs } from "./hashes.js";
import { latestTaskQueueProposalPath, planningDir } from "./paths.js";
import { renderTaskQueueProposalMarkdown } from "./rendering.js";
import { taskQueueProposalSchema } from "./schemas.js";
import type { DecompositionReadinessManifest, TaskQueueProposal, TaskQueueProposalItem } from "./types.js";
import { unique } from "./utils.js";

export async function readLatestTaskQueueProposal(memory: ResolvedMemory, changePath: string): Promise<TaskQueueProposal> {
  const proposal = await readRequiredJsonFile(latestTaskQueueProposalPath(memory, changePath), taskQueueProposalSchema);
  await assertWorkflowArtifactScope(memory, changePath, proposal, "TaskQueueProposal");
  return proposal;
}

export async function writeTaskQueueProposal(memory: ResolvedMemory, changePath: string, proposal: TaskQueueProposal): Promise<void> {
  await assertWorkflowArtifactScope(memory, changePath, proposal, "TaskQueueProposal");
  const dir = planningDir(memory, changePath);
  await mkdir(dir, { recursive: true });
  await writeJsonFile(join(dir, "taskqueue-proposal.json"), proposal);
  await writeFile(join(dir, "taskqueue-proposal.md"), renderTaskQueueProposalMarkdown(proposal), "utf8");
}

export async function supersedeExistingTaskQueueProposal(memory: ResolvedMemory, changePath: string): Promise<void> {
  const current = await readLatestTaskQueueProposal(memory, changePath).catch(() => null);
  if (!current || !["draft", "confirmed"].includes(current.status)) return;
  await writeTaskQueueProposal(memory, changePath, { ...current, status: "superseded", updatedAt: new Date().toISOString() });
}

export async function buildTaskQueueProposalFromReadiness(memory: ResolvedMemory, changePath: string, changeId: string, manifest: DecompositionReadinessManifest): Promise<TaskQueueProposal> {
  await assertChangePathScope(memory, changePath, changeId, "TaskQueueProposal");
  await assertWorkflowArtifactScope(memory, changePath, manifest, "TaskQueueProposal readiness");
  if (manifest.changeId !== changeId) throw new Error("TaskQueueProposal readiness is not scoped to the selected Change.");
  if (manifest.status !== "ready-for-sequential-taskqueue-proposal" || manifest.nextAllowedAction !== "taskqueue.proposal") {
    throw new Error(`TaskQueueProposal requires sequential taskqueue readiness; current readiness is ${manifest.status}.`);
  }
  const now = new Date().toISOString();
  const dir = planningDir(memory, changePath);
  const id = `taskqueue-proposal-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${changeId}:${manifest.id}:${now}`).slice(0, 8)}`;
  const seenTaskIds = new Set<string>();
  const items: TaskQueueProposalItem[] = [];
  for (const unit of manifest.units) {
    for (const taskId of unit.taskIds) {
      if (seenTaskIds.has(taskId)) continue;
      seenTaskIds.add(taskId);
      const order = items.length + 1;
      items.push({
        id: `${id}-item-${String(order).padStart(3, "0")}`,
        taskId,
        unitId: unit.id,
        title: unit.title,
        order,
        dependsOn: unit.dependsOn,
        sourceScopes: unit.sourceScopes,
        acIds: unit.acIds,
      });
    }
  }
  if (items.length === 0) throw new Error("TaskQueueProposal requires at least one task item.");
  return {
    id,
    changeId,
    decompositionPlanId: manifest.decompositionPlanId,
    readinessManifestId: manifest.id,
    status: "draft",
    recommendation: "taskgraph-sequential",
    queueMode: "sequential",
    items,
    dependencies: manifest.dependencies,
    conflictScopes: manifest.conflictScopes,
    sourceArtifactHashes: await hashArtifactRefs(memory, unique([...manifest.artifactRefs, manifest.artifact, manifest.markdownArtifact])),
    recoveryKeyMaterial: manifest.recoveryKeyMaterial,
    artifactRefs: unique([...manifest.artifactRefs, manifest.artifact, manifest.markdownArtifact]),
    artifact: displayArtifactPath(memory, join(dir, "taskqueue-proposal.json")),
    markdownArtifact: displayArtifactPath(memory, join(dir, "taskqueue-proposal.md")),
    createdAt: now,
    updatedAt: now,
  };
}
