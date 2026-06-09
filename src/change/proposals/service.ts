import { writeFile } from "node:fs/promises";
import { parseAcceptanceCriteria } from "../../ecl/anchors.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import type { ChangeProposalSummary, ManagedProject, PlanProposal, RunStatus, SpecProposal } from "../../types/index.js";
import { parsePlanProposalMessage, parseSpecProposalMessage } from "./parser-renderer.js";
import { composePlanPrompt, composeSpecPrompt, readActiveChangeFiles } from "./prompt-builders.js";
import { listProposals, readPlanProposal, readSpecProposal, summarizeProposal, writePlanProposal, writeSpecProposal } from "./repository.js";
import { ensureLastMessage, executeCodexProposal, finishRun, prepareProposalRun } from "./runner.js";
import type { ChangeProposalRunOptions, PlanProposalRunResult, SpecProposalRunResult } from "./types.js";
import { appendRunEvent } from "../../run/manager.js";

export async function startSpecProposalRun(project: ManagedProject, options: ChangeProposalRunOptions = {}): Promise<SpecProposalRunResult> {
  const prepared = await prepareProposalRun(project, "spec", options);
  const prompt = await composeSpecPrompt(prepared, options.prompt);
  await writeFile(prepared.paths.prompt, prompt, "utf8");
  const runResult = await executeCodexProposal(project, prepared, "spec-agent", "change.spec.proposal", prompt);
  const lastMessage = await ensureLastMessage(prepared.paths.lastMessage, runResult.stdoutSample, runResult.stderrSample);
  const parsed = parseSpecProposalMessage(lastMessage);
  const proposal = await writeSpecProposal(prepared.paths.proposal, prepared.paths.proposalMarkdown, {
    runId: prepared.runId,
    changeId: prepared.changeId,
    startedAt: prepared.startedAt,
    status: runResult.exitCode === 0 ? parsed.status : "failed",
    output: parsed,
    message: lastMessage,
    targetHashes: prepared.targetHashes,
    artifacts: prepared.artifacts,
  });
  const status: RunStatus = runResult.exitCode === 0 && proposal.status !== "failed" ? "completed" : "failed";
  const run = await finishRun(prepared.paths.run, runResult.run, status, runResult.exitCode, runResult.signal);
  await appendRunEvent(prepared.paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: proposal.status === "failed" ? "change.spec.proposal.failed" : "change.spec.proposal.completed", runId: prepared.runId, data: { proposalStatus: proposal.status } });
  await appendRunEvent(prepared.paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId: prepared.runId });
  return { run, proposal };
}

export async function startPlanProposalRun(project: ManagedProject, options: ChangeProposalRunOptions = {}): Promise<PlanProposalRunResult> {
  const prepared = await prepareProposalRun(project, "plan", options);
  const active = await readActiveChangeFiles(prepared.changePath);
  if (parseAcceptanceCriteria(active.spec).criteria.length === 0) {
    throw new Error("Cannot propose plan/tasks: spec.md must contain at least one Acceptance Criterion ID such as AC-001.");
  }
  const prompt = await composePlanPrompt(prepared, options.prompt);
  await writeFile(prepared.paths.prompt, prompt, "utf8");
  const runResult = await executeCodexProposal(project, prepared, "planner", "change.plan.proposal", prompt);
  const lastMessage = await ensureLastMessage(prepared.paths.lastMessage, runResult.stdoutSample, runResult.stderrSample);
  const parsed = parsePlanProposalMessage(lastMessage);
  const proposal = await writePlanProposal(prepared.paths.proposal, prepared.paths.proposalMarkdown, {
    runId: prepared.runId,
    changeId: prepared.changeId,
    startedAt: prepared.startedAt,
    status: runResult.exitCode === 0 ? parsed.status : "failed",
    output: parsed,
    message: lastMessage,
    targetHashes: prepared.targetHashes,
    artifacts: prepared.artifacts,
  });
  const status: RunStatus = runResult.exitCode === 0 && proposal.status !== "failed" ? "completed" : "failed";
  const run = await finishRun(prepared.paths.run, runResult.run, status, runResult.exitCode, runResult.signal);
  await appendRunEvent(prepared.paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: proposal.status === "failed" ? "change.plan.proposal.failed" : "change.plan.proposal.completed", runId: prepared.runId, data: { proposalStatus: proposal.status } });
  await appendRunEvent(prepared.paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId: prepared.runId });
  return { run, proposal };
}

export async function listSpecProposalSummaries(project: ManagedProject): Promise<ChangeProposalSummary[]> {
  const memory = await resolveProjectMemory(project);
  const proposals = await listProposals(memory, "spec");
  return proposals.map((proposal) => summarizeProposal(proposal));
}

export async function listPlanProposalSummaries(project: ManagedProject): Promise<ChangeProposalSummary[]> {
  const memory = await resolveProjectMemory(project);
  const proposals = await listProposals(memory, "plan");
  return proposals.map((proposal) => summarizeProposal(proposal));
}

export async function showSpecProposal(project: ManagedProject, proposalId: string): Promise<SpecProposal> {
  const memory = await resolveProjectMemory(project);
  return readSpecProposal(memory, proposalId);
}

export async function showPlanProposal(project: ManagedProject, proposalId: string): Promise<PlanProposal> {
  const memory = await resolveProjectMemory(project);
  return readPlanProposal(memory, proposalId);
}
