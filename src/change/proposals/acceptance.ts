import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildAcMap, parseAcceptanceCriteria, parseTasks } from "../../ecl/anchors.js";
import { getActiveChanges } from "../../ecl/index.js";
import { atomicWriteFile } from "../../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../../memory/resolver.js";
import { appendRunEvent } from "../../run/manager.js";
import type { ManagedProject, ResolvedMemory } from "../../types/index.js";
import { getChangeStatusForChange } from "../manager.js";
import { assertTargetHashesUnchanged } from "./hashes.js";
import { displayArtifactPath } from "./paths.js";
import { readPlanProposal, readSpecProposal } from "./repository.js";
import type { PlanProposalAcceptResult, SpecProposalAcceptResult } from "./types.js";

export async function acceptSpecProposal(project: ManagedProject, proposalId: string): Promise<SpecProposalAcceptResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Spec proposal accept");
  const proposal = await readSpecProposal(memory, proposalId);
  if (proposal.status !== "proposed") {
    throw new Error(`Cannot accept spec proposal with status ${proposal.status}.`);
  }
  if (parseAcceptanceCriteria(proposal.specMd).criteria.length === 0) {
    throw new Error("Cannot accept spec proposal: proposal must contain at least one Acceptance Criterion ID such as AC-001.");
  }
  const active = await getActiveChangePathForChange(memory, proposal.changeId);
  const specPath = join(active.changePath, "spec.md");
  await assertTargetHashesUnchanged({ spec: specPath }, proposal.targetHashes);
  await atomicWriteFile(specPath, ensureTrailingNewline(proposal.specMd));
  const changeStatus = await getChangeStatusForChange(project, proposal.changeId);
  await appendAcceptedEvent(memory, proposal.runId, "change.spec.proposal.accepted", { specPath: displayArtifactPath(memory, specPath) });
  return { proposal, changeStatus, specPath: displayArtifactPath(memory, specPath) };
}

export async function acceptPlanProposal(project: ManagedProject, proposalId: string): Promise<PlanProposalAcceptResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Plan proposal accept");
  const proposal = await readPlanProposal(memory, proposalId);
  if (proposal.status !== "proposed") {
    throw new Error(`Cannot accept plan proposal with status ${proposal.status}.`);
  }
  if (!proposal.planMd.trim() || !proposal.tasksMd.trim()) {
    throw new Error("Cannot accept plan proposal: planMd and tasksMd are required.");
  }
  const active = await getActiveChangePathForChange(memory, proposal.changeId);
  const specPath = join(active.changePath, "spec.md");
  const planPath = join(active.changePath, "plan.md");
  const tasksPath = join(active.changePath, "tasks.md");
  await assertTargetHashesUnchanged({ spec: specPath, plan: planPath, tasks: tasksPath }, proposal.targetHashes);
  const spec = await readFile(specPath, "utf8");
  const acMap = buildAcMap({
    changeId: active.changeId,
    specContent: spec,
    tasksContent: proposal.tasksMd,
    placeholderFiles: [
      { path: "plan.md", content: proposal.planMd },
      { path: "tasks.md", content: proposal.tasksMd },
    ],
  });
  if (acMap.blockingIssues.length > 0) {
    throw new Error(`Cannot accept plan proposal:\n${acMap.blockingIssues.map((issue) => `- ${issue}`).join("\n")}`);
  }
  if (parseTasks(proposal.tasksMd).tasks.length === 0) {
    throw new Error("Cannot accept plan proposal: tasksMd must contain at least one T-xxx task.");
  }
  await atomicWriteFile(planPath, ensureTrailingNewline(proposal.planMd));
  await atomicWriteFile(tasksPath, ensureTrailingNewline(proposal.tasksMd));
  const changeStatus = await getChangeStatusForChange(project, proposal.changeId);
  await appendAcceptedEvent(memory, proposal.runId, "change.plan.proposal.accepted", {
    planPath: displayArtifactPath(memory, planPath),
    tasksPath: displayArtifactPath(memory, tasksPath),
  });
  return {
    proposal,
    changeStatus,
    planPath: displayArtifactPath(memory, planPath),
    tasksPath: displayArtifactPath(memory, tasksPath),
  };
}

async function getActiveChangePathForChange(memory: ResolvedMemory, changeId: string): Promise<{ changeId: string; changePath: string }> {
  const active = await getActiveChanges(memory);
  const match = active.find((item) => item.name === changeId);
  if (!match) {
    throw new Error(`Active demand conversation not found for scoped proposal accept: ${changeId}.`);
  }
  return { changeId: match.name, changePath: join(memory.memoryRoot, match.path) };
}

async function appendAcceptedEvent(memory: ResolvedMemory, runId: string, type: "change.spec.proposal.accepted" | "change.plan.proposal.accepted", data: Record<string, unknown>): Promise<void> {
  const events = join(memory.runsRoot, runId, "events.jsonl");
  if (existsSync(events)) {
    await appendRunEvent(events, { timestamp: new Date().toISOString(), type, runId, data });
  }
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}
