import { createHash } from "node:crypto";
import { join } from "node:path";
import { z } from "zod";
import { writeJsonFile } from "../../fs/json.js";
import { readRequiredJsonFile } from "../../fs/json.js";

const plannerChildOutputSchema = z.object({
  status: z.enum(["proposed", "blocked", "failed"]).default("proposed"),
  specMd: z.string().default(""),
  planMd: z.string().default(""),
  tasksMd: z.string().default(""),
  openQuestions: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
}).strict();

export interface PlannerChildProposal extends z.infer<typeof plannerChildOutputSchema> {
  version: "1.0";
  id: string;
  hash: string;
  projectId: string;
  conversationId: string;
  runId: string;
  parentThreadId: string;
  childThreadId: string;
  createdAt: string;
  artifact: string;
}

const plannerChildProposalSchema = plannerChildOutputSchema.extend({
  version: z.literal("1.0"),
  id: z.string(),
  hash: z.string(),
  projectId: z.string(),
  conversationId: z.string(),
  runId: z.string(),
  parentThreadId: z.string(),
  childThreadId: z.string(),
  createdAt: z.string(),
  artifact: z.string(),
});

export async function readPlannerChildProposal(path: string): Promise<PlannerChildProposal> {
  const proposal = await readRequiredJsonFile(path, plannerChildProposalSchema) as PlannerChildProposal;
  const output = plannerChildOutputSchema.parse({
    status: proposal.status,
    specMd: proposal.specMd,
    planMd: proposal.planMd,
    tasksMd: proposal.tasksMd,
    openQuestions: proposal.openQuestions,
    assumptions: proposal.assumptions,
    warnings: proposal.warnings,
  });
  const expectedHash = proposalHash({
    projectId: proposal.projectId,
    conversationId: proposal.conversationId,
    runId: proposal.runId,
    parentThreadId: proposal.parentThreadId,
    childThreadId: proposal.childThreadId,
    output,
  });
  if (proposal.hash !== expectedHash || proposal.id !== `planner-proposal-${expectedHash.slice(0, 16)}`) {
    throw new Error("Planner child proposal hash is stale or forged.");
  }
  return proposal;
}

export function parsePlannerChildOutput(text: string): z.infer<typeof plannerChildOutputSchema> {
  const candidate = unwrapJsonFence(text);
  let value: unknown;
  try {
    value = JSON.parse(candidate);
  } catch (error) {
    throw new Error(`Planner child must return the fixed JSON proposal envelope: ${(error as Error).message}`);
  }
  const parsed = plannerChildOutputSchema.parse(value);
  if (parsed.status === "proposed" && (!parsed.specMd.trim() || !parsed.planMd.trim() || !parsed.tasksMd.trim())) {
    throw new Error("A proposed planner child result requires specMd, planMd, and tasksMd.");
  }
  return parsed;
}

export async function writePlannerChildProposal(input: {
  directory: string;
  projectId: string;
  conversationId: string;
  runId: string;
  parentThreadId: string;
  childThreadId: string;
  finalText: string;
}): Promise<PlannerChildProposal> {
  const output = parsePlannerChildOutput(input.finalText);
  const hash = proposalHash({ ...input, output });
  const artifact = join(input.directory, `planner-proposal-${input.childThreadId}.json`);
  const proposal: PlannerChildProposal = {
    version: "1.0",
    id: `planner-proposal-${hash.slice(0, 16)}`,
    hash,
    projectId: input.projectId,
    conversationId: input.conversationId,
    runId: input.runId,
    parentThreadId: input.parentThreadId,
    childThreadId: input.childThreadId,
    createdAt: new Date().toISOString(),
    artifact,
    ...output,
  };
  await writeJsonFile(artifact, proposal);
  return proposal;
}

function proposalHash(input: {
  projectId: string;
  conversationId: string;
  runId: string;
  parentThreadId: string;
  childThreadId: string;
  output: z.infer<typeof plannerChildOutputSchema>;
}): string {
  return createHash("sha256").update(JSON.stringify({
    projectId: input.projectId,
    conversationId: input.conversationId,
    runId: input.runId,
    parentThreadId: input.parentThreadId,
    childThreadId: input.childThreadId,
    output: input.output,
  })).digest("hex");
}

function unwrapJsonFence(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (match?.[1] ?? trimmed).trim();
}
