import { createHash } from "node:crypto";
import { join } from "node:path";
import { isAbsolute, relative, resolve } from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { z } from "zod";
import {
  type AcceptedPlanningPackage,
  type MainPlanningAcceptanceEvidence,
  type PlanningAcceptanceCommitPort,
  type ValidatedPlanningPackageInput,
  parseMainPlanningAcceptanceEvidence,
  validatePlanningProposalArtifacts,
} from "../../project-harness/planning-publication.js";
import { writeJsonFile } from "../../fs/json.js";
import { readRequiredJsonFile } from "../../fs/json.js";
import { resolveProjectRuntimeState } from "../../project-runtime/coordinator.js";
import { publishProjectRuntimePlanningPackage } from "../../project-runtime/planning-publication.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../provider-runtime/project-harness-discovery.js";
import type { ProjectHarnessDiscoveryPolicy } from "../../project-harness/contracts.js";
import type { ManagedProject } from "../../types/index.js";
import {
  openProjectRuntimeWorkbenchDatabase,
} from "../persistence/open-workbench-database.js";
import { publishAgentSurfacesInvalidated } from "../project-live-events.js";
import type { StoredTopicMessage } from "../persistence/contracts.js";
import type { WorkbenchDatabase } from "../persistence/database.js";
import { createConversationGraphScopeId } from "../conversation-graph-scope.js";

export interface AcceptedConversationPlanningPackage extends AcceptedPlanningPackage {
  timelineRows: StoredTopicMessage[];
}

export interface AcceptConversationPlanningPackageOptions {
  ahoHome?: string;
  discoveryPolicy?: ProjectHarnessDiscoveryPolicy;
  expectedMainAttemptId?: string;
}

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
  acceptance: MainPlanningAcceptanceEvidence,
  options: AcceptConversationPlanningPackageOptions = {},
): Promise<AcceptedConversationPlanningPackage> {
  const key = `${project.path}:${project.id}:${conversationId}`;
  const previous = planningAcceptanceLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolvePromise) => { release = resolvePromise; });
  const queued = previous.then(() => current);
  planningAcceptanceLocks.set(key, queued);
  await previous;
  try {
    return await acceptCurrentConversationPlanningPackageUnlocked(project, conversationId, proposalArtifact, acceptance, options);
  } finally {
    release();
    if (planningAcceptanceLocks.get(key) === queued) planningAcceptanceLocks.delete(key);
  }
}

async function acceptCurrentConversationPlanningPackageUnlocked(
  project: ManagedProject,
  conversationId: string,
  proposalArtifact: string,
  acceptance: MainPlanningAcceptanceEvidence,
  options: AcceptConversationPlanningPackageOptions,
): Promise<AcceptedConversationPlanningPackage> {
  return acceptCurrentProjectHarnessPlanningPackage(project, conversationId, proposalArtifact, acceptance, options);
}

async function acceptCurrentProjectHarnessPlanningPackage(
  project: ManagedProject,
  conversationId: string,
  proposalArtifact: string,
  acceptance: MainPlanningAcceptanceEvidence,
  options: AcceptConversationPlanningPackageOptions,
): Promise<AcceptedConversationPlanningPackage> {
  const runtimeState = await resolveProjectRuntimeState(project, {
    ahoHome: options.ahoHome,
    discoveryPolicy: options.discoveryPolicy ?? DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (runtimeState.state === "onboarding") {
    throw new Error("Project Harness onboarding must complete before accepting a planning package.");
  }
  if (runtimeState.state === "repair-required") {
    throw new Error("Project Harness requires repair before accepting a planning package.");
  }
  const resolution = runtimeState.resolution;
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  let timelineRows: StoredTopicMessage[] = [];
  try {
    const input = await validateCurrentConversationPlanningPackage(
      { projectId: resolution.harness.projectId, workbenchRoot: resolution.paths.workbenchRoot },
      store,
      conversationId,
      proposalArtifact,
      acceptance,
    );
    const commit = planningAcceptanceCommitPort(
      store,
      (rows) => { timelineRows = rows; },
      options.expectedMainAttemptId,
    );
    const result = await publishProjectRuntimePlanningPackage(
      resolution,
      input,
      commit,
      createConversationGraphScopeId,
    );
    return { ...result, timelineRows };
  } finally {
    store.close();
  }
}

function planningAcceptanceCommitPort(
  store: WorkbenchDatabase,
  onTimelineRows: (rows: StoredTopicMessage[]) => void,
  expectedMainAttemptId?: string,
): PlanningAcceptanceCommitPort {
  return {
    hasCommit: (transactionId) => store.conversations.hasPlanningAcceptanceCommit(transactionId),
    commit: (commit) => {
      if (commit.graphScopeId !== commit.previousGraphScopeId && !expectedMainAttemptId) {
        throw new Error("A superseding planning acceptance requires the exact accepting Main attempt.");
      }
      const scopeTransition = commit.graphScopeId !== commit.previousGraphScopeId
        ? {
            graphScopeId: commit.graphScopeId,
            previousGraphScopeId: commit.previousGraphScopeId,
            runId: commit.proposalRunId,
            mainAttemptId: expectedMainAttemptId!,
            plannerThreadId: commit.plannerThreadId,
          }
        : undefined;
      onTimelineRows(store.unitOfWork.acceptConversationChangeBinding(
        commit.projectId,
        commit.conversationId,
        commit.changeId,
        commit.acceptedAt,
        commit.transactionId,
        commit.proposalHash,
        scopeTransition,
        commit.previousGraphScopeId,
        expectedMainAttemptId,
      ));
      if (scopeTransition) publishAgentSurfacesInvalidated(commit.projectId, {
        conversationId: commit.conversationId,
        graphScopeId: scopeTransition.graphScopeId,
        reason: "scope-changed",
      });
    },
    deleteCommit: (transactionId) => store.conversations.deletePlanningAcceptanceCommit(transactionId),
  };
}

async function validateCurrentConversationPlanningPackage(
  runtime: { projectId: string; workbenchRoot: string },
  store: WorkbenchDatabase,
  conversationId: string,
  proposalArtifact: string,
  mainAcceptance: MainPlanningAcceptanceEvidence,
): Promise<ValidatedPlanningPackageInput> {
  const projectId = runtime.projectId;
  const proposalRoot = resolve(runtime.workbenchRoot, "conversations", conversationId, "runs");
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
  if (proposal.projectId !== projectId || proposal.conversationId !== conversationId) {
    throw new Error("Planner proposal is not scoped to the selected conversation.");
  }
  if (proposal.status !== "proposed" || proposal.openQuestions.length > 0) {
    throw new Error("Only a complete proposed planner result with no open questions can be accepted.");
  }
  const acceptance = parseMainPlanningAcceptanceEvidence(mainAcceptance);

  const conversation = store.conversations.readConversation(projectId, conversationId);
    if (!conversation) throw new Error(`Conversation not found: ${conversationId}.`);
    if (!conversation.currentGraphScopeId) throw new Error("Conversation planning requires a current graph scope.");
    const currentGraphScopeId = conversation.currentGraphScopeId;
    const scopedThreads = store.providerAttempts.listProviderThreads(projectId, conversationId)
      .filter((link) => link.graphScopeId === currentGraphScopeId);
    const lineage = scopedThreads
      .filter((link) => link.providerThreadId === proposal.childThreadId && link.roleId === "planning-agent")
      .flatMap((childThread) => {
        const mainThreads = scopedThreads.filter((link) => link.providerId === childThread.providerId && link.roleId === "main-agent");
        return mainThreads.map((mainThread) => ({ childThread, mainThread }));
      })
      .filter(({ childThread, mainThread }) => mainThread
        && childThread.parentThreadId === proposal.parentThreadId
        && proposal.parentThreadId === mainThread.providerThreadId);
    if (lineage.length !== 1) {
      throw new Error("Planner proposal does not belong to the current Main/child provider lineage.");
    }
    const latestProposalArtifact = store.timeline.listConversationMessages(projectId, conversationId)
      .filter((message) => storedAgentRoleId(message.rawJson) === "planning-agent" && Boolean(message.artifact))
      .at(-1)?.artifact;
    if (latestProposalArtifact !== proposal.artifact) throw new Error("Planner proposal is stale or superseded.");
    if (acceptance.proposalHash !== proposal.hash || acceptance.graphScopeId !== currentGraphScopeId) {
      throw new Error("Main planning acceptance is not bound to the exact current proposal and graph scope.");
    }
  return {
      conversationId,
      conversationTitle: conversation.title,
      boundChangeId: conversation.boundChangeId,
      currentGraphScopeId,
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
      acceptance,
  };
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
