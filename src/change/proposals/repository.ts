import { existsSync } from "node:fs";
import { readdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readRequiredJsonFile, writeJsonFile } from "../../fs/json.js";
import type {
  ChangeProposalStatus,
  ChangeProposalSummary,
  ChangeProposalTargetHashes,
  PlanProposal,
  ResolvedMemory,
  RunArtifactPaths,
  SpecProposal,
} from "../../types/index.js";
import { renderPlanProposalMarkdown, renderSpecProposalMarkdown } from "./parser-renderer.js";
import { planProposalSchema, specProposalSchema } from "./schemas.js";
import type { ProposalKind } from "./types.js";

export async function listProposals(memory: ResolvedMemory, kind: ProposalKind): Promise<Array<SpecProposal | PlanProposal>> {
  if (!existsSync(memory.runsRoot)) return [];
  const entries = await readdir(memory.runsRoot, { withFileTypes: true });
  const proposals: Array<SpecProposal | PlanProposal> = [];
  const file = kind === "spec" ? "spec-proposal.json" : "plan-proposal.json";
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (!existsSync(join(memory.runsRoot, entry.name, file))) continue;
    proposals.push(kind === "spec" ? await readSpecProposal(memory, entry.name) : await readPlanProposal(memory, entry.name));
  }
  return proposals.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function readSpecProposal(memory: ResolvedMemory, proposalId: string): Promise<SpecProposal> {
  return await readRequiredJsonFile(join(memory.runsRoot, proposalId, "spec-proposal.json"), specProposalSchema) as SpecProposal;
}

export async function readPlanProposal(memory: ResolvedMemory, proposalId: string): Promise<PlanProposal> {
  return await readRequiredJsonFile(join(memory.runsRoot, proposalId, "plan-proposal.json"), planProposalSchema) as PlanProposal;
}

export async function writeSpecProposal(
  path: string,
  markdownPath: string,
  input: {
    runId: string;
    changeId: string;
    startedAt: string;
    status: ChangeProposalStatus;
    output: Pick<SpecProposal, "status" | "specMd" | "openQuestions" | "assumptions" | "warnings">;
    message: string;
    targetHashes: ChangeProposalTargetHashes;
    artifacts: RunArtifactPaths;
  },
): Promise<SpecProposal> {
  const proposal: SpecProposal = {
    version: "1.0",
    id: input.runId,
    runId: input.runId,
    changeId: input.changeId,
    status: input.status === "failed" ? "failed" : input.output.status,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    targetHashes: input.targetHashes,
    specMd: input.output.specMd,
    openQuestions: input.output.openQuestions,
    assumptions: input.output.assumptions,
    warnings: input.output.warnings,
    artifacts: {
      proposal: input.artifacts.specProposal ?? "",
      proposalMarkdown: input.artifacts.specProposalMarkdown ?? "",
      lastMessage: input.artifacts.lastMessage ?? "",
    },
  };
  await writeJsonFile(path, proposal);
  await writeFile(markdownPath, renderSpecProposalMarkdown(proposal, input.message), "utf8");
  return proposal;
}

export async function writePlanProposal(
  path: string,
  markdownPath: string,
  input: {
    runId: string;
    changeId: string;
    startedAt: string;
    status: ChangeProposalStatus;
    output: Pick<PlanProposal, "status" | "planMd" | "tasksMd" | "openQuestions" | "assumptions" | "warnings">;
    message: string;
    targetHashes: ChangeProposalTargetHashes;
    artifacts: RunArtifactPaths;
  },
): Promise<PlanProposal> {
  const proposal: PlanProposal = {
    version: "1.0",
    id: input.runId,
    runId: input.runId,
    changeId: input.changeId,
    status: input.status === "failed" ? "failed" : input.output.status,
    startedAt: input.startedAt,
    finishedAt: new Date().toISOString(),
    targetHashes: input.targetHashes,
    planMd: input.output.planMd,
    tasksMd: input.output.tasksMd,
    openQuestions: input.output.openQuestions,
    assumptions: input.output.assumptions,
    warnings: input.output.warnings,
    artifacts: {
      proposal: input.artifacts.planProposal ?? "",
      proposalMarkdown: input.artifacts.planProposalMarkdown ?? "",
      lastMessage: input.artifacts.lastMessage ?? "",
    },
  };
  await writeJsonFile(path, proposal);
  await writeFile(markdownPath, renderPlanProposalMarkdown(proposal, input.message), "utf8");
  return proposal;
}

export function summarizeProposal(proposal: SpecProposal | PlanProposal): ChangeProposalSummary {
  return {
    id: proposal.id,
    runId: proposal.runId,
    changeId: proposal.changeId,
    status: proposal.status,
    startedAt: proposal.startedAt,
    finishedAt: proposal.finishedAt,
    openQuestionCount: proposal.openQuestions.length,
    warningCount: proposal.warnings.length,
  };
}
