import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { isAbsolute, relative, resolve } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  acceptPlanningPackage,
  type AcceptedPlanningPackage,
  type PlanningAcceptanceCommitPort,
  type ValidatedPlanningPackageInput,
  validatePlanningProposalArtifacts,
} from "../../change/manager.js";
import { writeJsonFile } from "../../fs/json.js";
import { readRequiredJsonFile } from "../../fs/json.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import type { ManagedProject } from "../../types/index.js";
import { openWorkbenchDatabase } from "../persistence/open-workbench-database.js";

const plannerChildOutputSchema = z.object({
  status: z.enum(["proposed", "blocked", "failed"]).default("proposed"),
  specMd: z.string().default(""),
  planMd: z.string().default(""),
  tasksMd: z.string().default(""),
  openQuestions: z.array(z.string()).default([]),
  assumptions: z.array(z.string()).default([]),
  warnings: z.array(z.string()).default([]),
  notesMd: z.string().default(""),
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
    notesMd: proposal.notesMd,
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

export async function writePlannerChildProposal(input: {
  directory: string;
  projectId: string;
  conversationId: string;
  runId: string;
  parentThreadId: string;
  childThreadId: string;
}): Promise<PlannerChildProposal> {
  const proposalDirectory = join(input.directory, "planner-proposal");
  const output = await readPlannerProposalFiles(proposalDirectory);
  const hash = proposalHash({ ...input, output });
  const artifact = join(proposalDirectory, `proposal-${hash.slice(0, 16)}.json`);
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

async function readPlannerProposalFiles(directory: string): Promise<z.infer<typeof plannerChildOutputSchema>> {
  const required = async (name: string): Promise<string> => {
    const path = join(directory, name);
    if (!existsSync(path)) throw new Error(`Planner child must write ${name} in the run-scoped proposal directory.`);
    const value = await readFile(path, "utf8");
    if (!value.trim()) throw new Error(`Planner child proposal file ${name} is empty.`);
    return value;
  };
  const notesPath = join(directory, "notes.md");
  const output = plannerChildOutputSchema.parse({
    status: "proposed",
    specMd: await required("spec.md"),
    planMd: await required("plan.md"),
    tasksMd: await required("tasks.md"),
    notesMd: existsSync(notesPath) ? await readFile(notesPath, "utf8") : "",
    openQuestions: [],
    assumptions: [],
    warnings: [],
  });
  validatePlanningProposalArtifacts(output);
  return output;
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
  const store = await openWorkbenchDatabase(memory);
  try {
    const commitPort: PlanningAcceptanceCommitPort = {
      hasCommit: (transactionId) => store.conversations.hasPlanningAcceptanceCommit(transactionId),
      commit: (commit) => {
        const scopeTransition = commit.newGraphScopeRequired
          ? {
              graphScopeId: `graph:${conversationId}:${Date.now().toString(36)}:${randomUUID().slice(0, 8)}`,
              runId: commit.proposalRunId,
              plannerThreadId: commit.plannerThreadId,
            }
          : undefined;
        store.unitOfWork.acceptConversationChangeBinding(
          commit.projectId,
          commit.conversationId,
          commit.changeId,
          commit.acceptedAt,
          commit.transactionId,
          commit.proposalHash,
          scopeTransition,
        );
      },
      deleteCommit: (transactionId) => store.conversations.deletePlanningAcceptanceCommit(transactionId),
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
  if (!memory.projectId) throw new Error("Project id is required to validate a conversation planning package.");
  const projectId = memory.projectId;
  const proposalRoot = resolve(memory.workbenchRoot, "conversations", conversationId, "runs");
  const proposalPath = resolve(proposalArtifact);
  const proposalScope = relative(proposalRoot, proposalPath);
  if (!proposalScope || proposalScope.startsWith("..") || isAbsolute(proposalScope)) {
    throw new Error("Planner proposal artifact is outside the selected conversation run scope.");
  }
  const proposal = await readPlannerChildProposal(proposalPath);
  const expectedDirectory = resolve(proposalRoot, proposal.runId, "planner-proposal");
  if (resolve(proposal.artifact) !== proposalPath || resolve(proposalPath, "..") !== expectedDirectory) {
    throw new Error("Planner proposal artifact does not match its declared run and path.");
  }
  if (proposal.projectId !== memory.projectId || proposal.conversationId !== conversationId) {
    throw new Error("Planner proposal is not scoped to the selected conversation.");
  }
  if (proposal.status !== "proposed" || proposal.openQuestions.length > 0) {
    throw new Error("Only a complete proposed planner result with no open questions can be accepted.");
  }

  const store = await openWorkbenchDatabase(memory);
  try {
    const conversation = store.conversations.readConversation(projectId, conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}.`);
    const lineage = store.providerAttempts.listProviderThreads(projectId, conversationId)
      .filter((link) => link.providerThreadId === proposal.childThreadId && link.roleId === "planning-agent")
      .flatMap((childThread) => {
        const providerId = childThread.providerId;
        return providerId
          ? [{ childThread, mainThread: store.providerAttempts.readProviderThread(projectId, conversationId, providerId, "main-agent") }]
          : [];
      })
      .filter(({ childThread, mainThread }) => mainThread
        && childThread.parentThreadId === proposal.parentThreadId
        && proposal.parentThreadId === mainThread.providerThreadId);
    if (lineage.length !== 1) {
      throw new Error("Planner proposal does not belong to the current Main/child provider lineage.");
    }
    const latestProposalArtifact = store.timeline.listConversationMessages(projectId, conversationId)
      .filter((message) => storedAgentRoleId(message.rawJson) === "planning-agent")
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
        runId: proposal.runId,
        childThreadId: proposal.childThreadId,
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

function storedAgentRoleId(rawJson: string): string | undefined {
  try {
    const value = JSON.parse(rawJson) as { agentRoleId?: unknown };
    return typeof value.agentRoleId === "string" ? value.agentRoleId : undefined;
  } catch {
    return undefined;
  }
}
