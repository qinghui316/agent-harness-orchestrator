import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { buildAcMap, parseAcceptanceCriteria, parseTasks } from "../ecl/anchors.js";
import { writeChangeIndex } from "../ecl/index.js";
import { atomicWriteFile, writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { listAuditResults } from "../audit/artifacts.js";
import { listIntegrationChecks } from "../integration-check/manager.js";
import { listRuns } from "../run/manager.js";
import { createEmptySpecTests } from "../spec-test/manager.js";
import { listTaskQueues } from "../task-queue/manager.js";
import { listTaskRuns, listWorkerLeases } from "../task-run/manager.js";
import type { ChangeMetadata, ManagedProject, WorkflowGraphPlan } from "../types/index.js";
import { listValidationResults } from "../validation/artifacts.js";
import { listWorkflowRuns } from "../workflow-run/manager.js";
import { listWorktreesForChange } from "../worktree/manager.js";
import { compileWorkflowGraphPlan, parseWorkflowAuthoringPlan, readLatestWorkflowGraphPlan, writeWorkflowGraphPlan } from "../workflow-artifacts/manager.js";
import { WorkbenchStore } from "../workbench/store.js";
import { readPlannerChildProposal } from "../workbench/planning/planner-child-proposal.js";
import { allocateChangeId } from "./creation.js";
import { requiredChangeFiles } from "./schemas.js";
import { renderTemplate } from "./templates.js";

export interface AcceptedPlanningPackage {
  changeId: string;
  proposalId: string;
  workflowGraphPlan: WorkflowGraphPlan;
}

interface PlanningAcceptanceTransaction {
  version: "1.0";
  id: string;
  phase: "prepared" | "swapped" | "committed";
  activePath: string;
  stagingPath: string;
  backupPath: string;
  replacing: boolean;
}

const acceptanceLocks = new Map<string, Promise<void>>();

export async function acceptConversationPlanningPackage(
  project: ManagedProject,
  conversationId: string,
  proposalArtifact: string,
): Promise<AcceptedPlanningPackage> {
  const key = `${project.path}:${project.id}:${conversationId}`;
  const previous = acceptanceLocks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolvePromise) => { release = resolvePromise; });
  const queued = previous.then(() => current);
  acceptanceLocks.set(key, queued);
  await previous;
  try {
    return await acceptConversationPlanningPackageUnlocked(project, conversationId, proposalArtifact);
  } finally {
    release();
    if (acceptanceLocks.get(key) === queued) acceptanceLocks.delete(key);
  }
}

async function acceptConversationPlanningPackageUnlocked(
  project: ManagedProject,
  conversationId: string,
  proposalArtifact: string,
): Promise<AcceptedPlanningPackage> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Conversation planning package accept");
  if (!memory.projectId) throw new Error("Project id is required to accept a conversation planning package.");
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

  const criteria = parseAcceptanceCriteria(proposal.specMd).criteria;
  const tasks = parseTasks(proposal.tasksMd).tasks;
  if (criteria.length === 0 || tasks.length === 0) throw new Error("Accepted planning requires at least one AC and one task.");
  const acMap = buildAcMap({
    changeId: "pending",
    specContent: proposal.specMd,
    tasksContent: proposal.tasksMd,
    placeholderFiles: [
      { path: "spec.md", content: proposal.specMd },
      { path: "plan.md", content: proposal.planMd },
      { path: "tasks.md", content: proposal.tasksMd },
    ],
  });
  if (acMap.blockingIssues.length > 0) throw new Error(`Planning package is not internally consistent:\n${acMap.blockingIssues.join("\n")}`);
  const authored = parseWorkflowAuthoringPlan(proposal.planMd, {
    taskIds: tasks.map((task) => task.id),
    acIds: criteria.map((criterion) => criterion.id),
  });

  const store = await WorkbenchStore.open(memory);
  let conversationTitle = "planned-change";
  let boundChangeId: string | null = null;
  try {
    await recoverPlanningAcceptanceTransactions(memory, store);
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
    conversationTitle = conversation.title;
    boundChangeId = conversation.boundChangeId;
  } finally {
    store.close();
  }
  const boundActive = boundChangeId && existsSync(join(memory.changesRoot, "active", boundChangeId))
    ? boundChangeId
    : null;
  const reusableChangeId = boundActive && !(await hasExecutionEvidence(memory, boundActive))
    ? boundActive
    : null;
  const changeId = reusableChangeId ?? allocateChangeId(memory.changesRoot, conversationTitle);
  const activePath = join(memory.changesRoot, "active", changeId);
  const graphId = `workflow-graph-${proposal.hash.slice(0, 16)}`;
  if (existsSync(activePath)) {
    const activeChangePath = relative(memory.memoryRoot, activePath).replace(/\\/g, "/");
    const existingGraph = await readLatestWorkflowGraphPlan(memory, activeChangePath).catch(() => null);
    if (existingGraph?.id === graphId) {
      const [specMd, planMd, tasksMd] = await Promise.all([
        readFile(join(activePath, "spec.md"), "utf8"),
        readFile(join(activePath, "plan.md"), "utf8"),
        readFile(join(activePath, "tasks.md"), "utf8"),
      ]);
      if (specMd.trim() !== proposal.specMd.trim() || planMd.trim() !== proposal.planMd.trim() || tasksMd.trim() !== proposal.tasksMd.trim()) {
        throw new Error("Accepted artifacts drifted after this planner proposal; a fresh revision is required.");
      }
      return { changeId, proposalId: proposal.id, workflowGraphPlan: existingGraph };
    }
  }
  const transactionRoot = join(memory.changesRoot, ".transactions");
  const transactionId = `${changeId}-${proposal.hash.slice(0, 16)}`;
  const stagingPath = join(transactionRoot, `${transactionId}.staging`);
  const backupPath = join(transactionRoot, `${transactionId}.backup`);
  const markerPath = join(transactionRoot, `${transactionId}.json`);
  await mkdir(transactionRoot, { recursive: true });
  await rm(stagingPath, { recursive: true, force: true });
  await rm(backupPath, { recursive: true, force: true });
  await initializeStagingChange(memory, stagingPath, conversationTitle);

  const now = new Date().toISOString();
  const metadata: ChangeMetadata = {
    version: "1.0",
    id: changeId,
    title: conversationTitle,
    state: "active",
    createdAt: reusableChangeId ? await existingCreatedAt(activePath, now) : now,
    updatedAt: now,
    closedAt: null,
    archivePath: null,
    originConversationId: conversationId,
  };
  const scopedAcMap = { ...acMap, changeId, generatedAt: now };
  await atomicWriteFile(join(stagingPath, "spec.md"), trailingNewline(proposal.specMd));
  await atomicWriteFile(join(stagingPath, "plan.md"), trailingNewline(proposal.planMd));
  await atomicWriteFile(join(stagingPath, "tasks.md"), trailingNewline(proposal.tasksMd));
  await writeJsonFile(join(stagingPath, "change.json"), metadata);
  await writeJsonFile(join(stagingPath, "ac-map.json"), scopedAcMap);
  if (!existsSync(join(stagingPath, "spec-tests.json"))) await createEmptySpecTests(stagingPath, changeId);

  const finalRelativeChangePath = relative(memory.memoryRoot, activePath).replace(/\\/g, "/");
  const graphDir = join(activePath, "planning", "workflow-graphs");
  const artifact = relative(memory.memoryRoot, join(graphDir, `${graphId}.json`)).replace(/\\/g, "/");
  const markdownArtifact = relative(memory.memoryRoot, join(graphDir, `${graphId}.md`)).replace(/\\/g, "/");
  const sourceArtifactHashes = {
    [`${finalRelativeChangePath}/spec.md`]: sha256(trailingNewline(proposal.specMd)),
    [`${finalRelativeChangePath}/plan.md`]: sha256(trailingNewline(proposal.planMd)),
    [`${finalRelativeChangePath}/tasks.md`]: sha256(trailingNewline(proposal.tasksMd)),
  };
  const graph = compileWorkflowGraphPlan(authored, {
    id: graphId,
    changeId,
    taskIds: tasks.map((task) => task.id),
    acIds: criteria.map((criterion) => criterion.id),
    planArtifactRef: `${finalRelativeChangePath}/plan.md`,
    sourceArtifactHashes,
    artifactRefs: [...Object.keys(sourceArtifactHashes), artifact, markdownArtifact],
    artifact,
    markdownArtifact,
    createdAt: now,
  });
  const stagingRelativePath = relative(memory.memoryRoot, stagingPath).replace(/\\/g, "/");
  await writeWorkflowGraphPlan(memory, stagingRelativePath, graph);
  const transaction: PlanningAcceptanceTransaction = {
    version: "1.0",
    id: transactionId,
    phase: "prepared",
    activePath,
    stagingPath,
    backupPath,
    replacing: existsSync(activePath),
  };
  await writeJsonFile(markerPath, transaction);
  const replacing = await swapStagingChange(activePath, stagingPath, backupPath);
  await writeJsonFile(markerPath, { ...transaction, phase: "swapped", replacing });
  try {
    await writeChangeIndex(memory);
    const projectionStore = await WorkbenchStore.open(memory);
    try {
      projectionStore.acceptConversationChangeBinding(
        memory.projectId,
        conversationId,
        changeId,
        now,
        transactionId,
        proposal.hash,
      );
    } finally {
      projectionStore.close();
    }
  } catch (error) {
    await rollbackStagingSwap(activePath, backupPath, replacing);
    await writeChangeIndex(memory).catch(() => undefined);
    throw error;
  }
  await writeJsonFile(markerPath, { ...transaction, phase: "committed", replacing });
  await rm(backupPath, { recursive: true, force: true }).catch(() => undefined);
  await rm(markerPath, { force: true }).catch(() => undefined);
  await deletePlanningAcceptanceCommit(memory, transactionId).catch(() => undefined);
  return { changeId, proposalId: proposal.id, workflowGraphPlan: graph };
}

async function initializeStagingChange(memory: Awaited<ReturnType<typeof resolveProjectMemory>>, path: string, title: string): Promise<void> {
  await mkdir(join(path, "reviews"), { recursive: true });
  for (const file of requiredChangeFiles) {
    if (file === "spec.md" || file === "plan.md" || file === "tasks.md") continue;
    await atomicWriteFile(join(path, file), await renderTemplate(memory, file, title));
  }
}

async function recoverPlanningAcceptanceTransactions(
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  store: WorkbenchStore,
): Promise<void> {
  const transactionRoot = join(memory.changesRoot, ".transactions");
  if (!existsSync(transactionRoot)) return;
  const markerNames = (await readdir(transactionRoot)).filter((name) => name.endsWith(".json"));
  let recovered = false;
  for (const markerName of markerNames) {
    const markerPath = join(transactionRoot, markerName);
    const transaction = JSON.parse(await readFile(markerPath, "utf8")) as PlanningAcceptanceTransaction;
    assertTransactionPath(memory.changesRoot, transaction.activePath);
    assertTransactionPath(transactionRoot, transaction.stagingPath);
    assertTransactionPath(transactionRoot, transaction.backupPath);
    const committed = transaction.phase === "committed" || store.hasPlanningAcceptanceCommit(transaction.id);
    if (committed) {
      await rm(transaction.stagingPath, { recursive: true, force: true });
      await rm(transaction.backupPath, { recursive: true, force: true });
    } else if (transaction.phase === "prepared") {
      const swapStarted = existsSync(transaction.backupPath)
        || (!transaction.replacing && existsSync(transaction.activePath) && !existsSync(transaction.stagingPath));
      if (swapStarted) {
        await rollbackStagingSwap(transaction.activePath, transaction.backupPath, transaction.replacing);
      }
      await rm(transaction.stagingPath, { recursive: true, force: true });
    } else {
      await rollbackStagingSwap(transaction.activePath, transaction.backupPath, transaction.replacing);
      await rm(transaction.stagingPath, { recursive: true, force: true });
    }
    await rm(markerPath, { force: true });
    if (committed) store.deletePlanningAcceptanceCommit(transaction.id);
    recovered = true;
  }
  if (recovered) await writeChangeIndex(memory);
}

function assertTransactionPath(root: string, candidate: string): void {
  const scoped = relative(resolve(root), resolve(candidate));
  if (!scoped || scoped.startsWith("..") || isAbsolute(scoped)) {
    throw new Error(`Planning acceptance transaction path escaped its owner root: ${candidate}`);
  }
}

async function deletePlanningAcceptanceCommit(
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  transactionId: string,
): Promise<void> {
  const store = await WorkbenchStore.open(memory);
  try {
    store.deletePlanningAcceptanceCommit(transactionId);
  } finally {
    store.close();
  }
}

async function swapStagingChange(activePath: string, stagingPath: string, backupPath: string): Promise<boolean> {
  const replacing = existsSync(activePath);
  if (replacing) await rename(activePath, backupPath);
  try {
    await rename(stagingPath, activePath);
    return replacing;
  } catch (error) {
    if (!existsSync(activePath) && existsSync(backupPath)) await rename(backupPath, activePath);
    throw error;
  }
}

async function rollbackStagingSwap(activePath: string, backupPath: string, replacing: boolean): Promise<void> {
  await rm(activePath, { recursive: true, force: true });
  if (replacing && existsSync(backupPath)) await rename(backupPath, activePath);
}

async function existingCreatedAt(activePath: string, fallback: string): Promise<string> {
  try {
    const raw = JSON.parse(await readFile(join(activePath, "change.json"), "utf8")) as { createdAt?: unknown };
    return typeof raw.createdAt === "string" ? raw.createdAt : fallback;
  } catch {
    return fallback;
  }
}

async function hasExecutionEvidence(
  memory: Awaited<ReturnType<typeof resolveProjectMemory>>,
  changeId: string,
): Promise<boolean> {
  const [
    runs,
    queues,
    taskRuns,
    workerLeases,
    workflowRuns,
    validations,
    audits,
    worktrees,
    integrationChecks,
  ] = await Promise.all([
    listRuns(memory),
    listTaskQueues(memory, changeId),
    listTaskRuns(memory, changeId),
    listWorkerLeases(memory, changeId),
    listWorkflowRuns(memory, changeId),
    listValidationResults(memory, changeId),
    listAuditResults(memory, changeId),
    listWorktreesForChange(memory, changeId),
    listIntegrationChecks(memory),
  ]);
  return runs.some((run) => run.changeId === changeId)
    || queues.length > 0
    || taskRuns.length > 0
    || workerLeases.length > 0
    || workflowRuns.length > 0
    || validations.length > 0
    || audits.length > 0
    || worktrees.length > 0
    || integrationChecks.some((check) => check.resultTargets.some((target) => target.changeId === changeId));
}

function trailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function storedAgentRoleId(rawJson: string): string | undefined {
  try {
    const value = JSON.parse(rawJson) as { agentRoleId?: unknown };
    return typeof value.agentRoleId === "string" ? value.agentRoleId : undefined;
  } catch {
    return undefined;
  }
}
