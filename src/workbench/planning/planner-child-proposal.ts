import { createHash } from "node:crypto";
import { join } from "node:path";
import { isAbsolute, relative, resolve } from "node:path";
import { z } from "zod";
import {
  acceptPlanningPackage,
  type AcceptedPlanningPackage,
  type PlanningAcceptanceCommitPort,
  type ValidatedPlanningPackageInput,
} from "../../change/manager.js";
import { writeJsonFile } from "../../fs/json.js";
import { readRequiredJsonFile } from "../../fs/json.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import type { ManagedProject } from "../../types/index.js";
import { WorkbenchStore } from "../store.js";

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

const planningAcceptanceLocks = new Map<string, Promise<void>>();

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

export async function acceptCurrentConversationPlanningPackage(
  project: ManagedProject,
  conversationId: string,
  proposalArtifact: string,
): Promise<AcceptedPlanningPackage> {
  const key = `${project.path}:${project.id}:${conversationId}`;
  const previous = planningAcceptanceLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolvePromise) => { release = resolvePromise; });
  const queued = previous.then(() => current);
  planningAcceptanceLocks.set(key, queued);
  await previous;
  try {
    return await acceptCurrentConversationPlanningPackageUnlocked(project, conversationId, proposalArtifact);
  } finally {
    release();
    if (planningAcceptanceLocks.get(key) === queued) planningAcceptanceLocks.delete(key);
  }
}

async function acceptCurrentConversationPlanningPackageUnlocked(
  project: ManagedProject,
  conversationId: string,
  proposalArtifact: string,
): Promise<AcceptedPlanningPackage> {
  const memory = await resolveProjectMemory(project);
  if (!memory.projectId) throw new Error("Project id is required to accept a conversation planning package.");
  const input = await validateCurrentConversationPlanningPackage(memory, conversationId, proposalArtifact);
  const store = await WorkbenchStore.open(memory);
  try {
    const commitPort: PlanningAcceptanceCommitPort = {
      hasCommit: (transactionId) => store.hasPlanningAcceptanceCommit(transactionId),
      commit: (commit) => store.acceptConversationChangeBinding(
        commit.projectId,
        commit.conversationId,
        commit.changeId,
        commit.acceptedAt,
        commit.transactionId,
        commit.proposalHash,
      ),
      deleteCommit: (transactionId) => store.deletePlanningAcceptanceCommit(transactionId),
    };
    return await acceptPlanningPackage(project, input, commitPort);
  } finally {
    store.close();
  }
}

async function validateCurrentConversationPlanningPackage(
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  conversationId: string,
  proposalArtifact: string,
): Promise<ValidatedPlanningPackageInput> {
  const proposalRoot = resolve(memory.workbenchRoot, "conversations", conversationId, "runs");
  const proposalPath = resolve(proposalArtifact);
  const proposalScope = relative(proposalRoot, proposalPath);
  if (!proposalScope || proposalScope.startsWith("..") || isAbsolute(proposalScope)) {
    throw new Error("Planner proposal artifact is outside the selected conversation run scope.");
  }
  const proposal = await readPlannerChildProposal(proposalPath);
  if (proposal.projectId !== memory.projectId || proposal.conversationId !== conversationId) {
    throw new Error("Planner proposal is not scoped to the selected conversation.");
  }
  if (proposal.status !== "proposed" || proposal.openQuestions.length > 0) {
    throw new Error("Only a complete proposed planner result with no open questions can be accepted.");
  }

  const store = await WorkbenchStore.open(memory);
  try {
    const conversation = store.readConversation(memory.projectId, conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}.`);
    const mainThread = store.readProviderThread(memory.projectId, conversationId, "main-agent");
    const childThread = store.listProviderThreads(memory.projectId, conversationId)
      .find((link) => link.providerThreadId === proposal.childThreadId && link.roleId === "planning-agent");
    if (!mainThread || !childThread || childThread.parentThreadId !== proposal.parentThreadId || proposal.parentThreadId !== mainThread.providerThreadId) {
      throw new Error("Planner proposal does not belong to the current Main/child provider lineage.");
    }
    const latestProposalArtifact = store.listConversationMessages(memory.projectId, conversationId)
      .filter((message) => storedAgentRoleId(message.rawJson) === "planning-agent" && Boolean(message.artifact))
      .at(-1)?.artifact;
    if (latestProposalArtifact !== proposal.artifact) throw new Error("Planner proposal is stale or superseded.");
    return {
      conversationId,
      conversationTitle: conversation.title,
      boundChangeId: conversation.boundChangeId,
      proposal: {
        id: proposal.id,
        hash: proposal.hash,
        artifact: proposal.artifact,
        specMd: proposal.specMd,
        planMd: proposal.planMd,
        tasksMd: proposal.tasksMd,
      },
    };
  } finally {
    store.close();
  }
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

function storedAgentRoleId(rawJson: string): string | undefined {
  try {
    const value = JSON.parse(rawJson) as { agentRoleId?: unknown };
    return typeof value.agentRoleId === "string" ? value.agentRoleId : undefined;
  } catch {
    return undefined;
  }
}
