import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { buildAcMap, parseAcceptanceCriteria, parseTasks } from "../ecl/anchors.js";
import { atomicWriteFile, writeJsonFile } from "../fs/json.js";
import { shortHash, slugify } from "../fs/path.js";
import { createEmptySpecTests } from "../spec-test/manager.js";
import type { WorkflowGraphPlan } from "../types/index.js";
import {
  compileWorkflowGraphPlan,
  parseWorkflowAuthoringPlan,
  readLatestWorkflowGraphPlanAt,
  writeWorkflowGraphPlanAt,
} from "../workflow-artifacts/manager.js";
import {
  createProjectHarnessChange,
  initializeProjectHarnessChangeEvidence,
  listProjectHarnessChanges,
  loadProjectHarnessChange,
  loadProjectHarnessContract,
  parseProjectHarnessContractInput,
  type ProjectHarnessChangePreflightResult,
  type ProjectHarnessContractInput,
  type ProjectHarnessContractRecord,
  publishProjectHarnessChange,
  rebuildProjectHarnessChangeIndex,
  resolveProjectHarnessChangeEvidenceRoot,
  restoreMutableProjectHarnessChangeRecord,
  restoreProjectHarnessContract,
  rollbackUncommittedProjectHarnessChange,
  type ProjectHarnessChangeRecord,
} from "./change.js";
import {
  canonicalProjectHarnessId,
  projectHarnessConversationLane,
  projectHarnessLaneId,
  readProjectHarnessLane,
  restoreProjectHarnessLane,
  type ProjectHarnessLaneRecord,
  type ProjectHarnessRegistryContext,
} from "./registry.js";
import { assertPhysicalDirectory, resolveWithinPhysicalRoot } from "./path-safety.js";
import { projectHarnessSharedWriterRoot, withProjectHarnessWriterLock } from "./writer-lock.js";

export interface AcceptedPlanningPackage {
  changeId: string;
  proposalId: string;
  proposalHash: string;
  graphScopeId: string;
  authorizationIntentArtifact: string;
  workflowGraphPlan: WorkflowGraphPlan;
  registryContract: ProjectHarnessContractRecord | null;
  registryContractValidation: string[];
}

export interface MainPlanningAcceptanceEvidence {
  version: "1.0";
  proposalHash: string;
  graphScopeId: string;
  contractRequired: boolean;
  contract: ProjectHarnessContractInput | null;
  validation: string[];
}

const mainPlanningAcceptanceEvidenceSchema = z.object({
  version: z.literal("1.0"),
  proposalHash: z.string().trim().min(1),
  graphScopeId: z.string().trim().min(1),
  contractRequired: z.boolean(),
  contract: z.unknown().nullable(),
  validation: z.array(z.string().trim().min(1)).min(1),
}).strict();

export function parseMainPlanningAcceptanceEvidence(input: unknown): MainPlanningAcceptanceEvidence {
  const parsed = mainPlanningAcceptanceEvidenceSchema.parse(input);
  if (parsed.contractRequired !== (parsed.contract !== null)) {
    throw new Error("Main planning acceptance must include a Registry contract exactly when contractRequired is true.");
  }
  return {
    version: parsed.version,
    proposalHash: parsed.proposalHash,
    graphScopeId: parsed.graphScopeId,
    contractRequired: parsed.contractRequired,
    contract: parsed.contract === null ? null : parseProjectHarnessContractInput(parsed.contract),
    validation: [...parsed.validation],
  };
}

export interface ValidatedPlanningProposal {
  id: string;
  hash: string;
  artifact: string;
  specMd: string;
  planMd: string;
  tasksMd: string;
  runId?: string;
  childThreadId?: string;
}

export interface ValidatedPlanningPackageInput {
  conversationId: string;
  conversationTitle: string;
  boundChangeId: string | null;
  currentGraphScopeId: string;
  proposal: ValidatedPlanningProposal;
  acceptance: MainPlanningAcceptanceEvidence;
}

export interface ProjectHarnessPlanningPublicationContext {
  registry: ProjectHarnessRegistryContext;
  sidecarRoot: string;
}

export interface ProjectHarnessPlanningExecutionEvidencePort {
  hasEvidence(changeId: string): Promise<boolean>;
}

export interface ProjectHarnessPlanningAuthorizationEvidence {
  id: string;
  epoch: number;
  projectId: string | null;
  changeId: string;
  conversationId: string;
  acceptedPlanHash: string;
  graphId: string;
}

export interface ProjectHarnessPlanningAuthorizationPort {
  captureSuperseded(input: {
    projectId: string;
    changeId: string;
    conversationId: string;
    acceptedPlanHash: string;
    graphId: string;
    authorizationId: string;
  }): Promise<ProjectHarnessPlanningAuthorizationEvidence | null>;
  revoke(evidence: ProjectHarnessPlanningAuthorizationEvidence, reason: string): Promise<void>;
  restore(evidence: ProjectHarnessPlanningAuthorizationEvidence, reason: string): Promise<void>;
}

export interface ProjectHarnessPlanningPreflightPort {
  evaluate(
    context: ProjectHarnessRegistryContext,
    changeId: string,
  ): Promise<ProjectHarnessChangePreflightResult>;
}

export interface ProjectHarnessPlanningPublicationPorts {
  executionEvidence: ProjectHarnessPlanningExecutionEvidencePort;
  authorization: ProjectHarnessPlanningAuthorizationPort;
  preflight: ProjectHarnessPlanningPreflightPort;
  commit: PlanningAcceptanceCommitPort;
  createGraphScopeId(conversationId: string): string;
}

interface ProjectHarnessPlanningPublicationTransaction {
  schema_version: "3.0";
  id: string;
  phase: "prepared" | "swapped" | "committed";
  project_id: string;
  change_id: string;
  claim_token: string;
  lane_id: string;
  repository_mode: "single_lane" | "multi_lane";
  branch: string | null;
  head_commit: string | null;
  conversation_id: string;
  graph_scope_id: string;
  active_path: string;
  staging_path: string;
  backup_path: string;
  created_change: boolean;
  record_before: ProjectHarnessChangeRecord | null;
  contract_before: ProjectHarnessContractRecord | null;
  lane_before: ProjectHarnessLaneRecord | null;
  scope: string;
  paths: string[];
  superseded_authorization: ProjectHarnessPlanningAuthorizationEvidence | null;
}

export function validatePlanningProposalArtifacts(proposal: Pick<ValidatedPlanningProposal, "specMd" | "planMd" | "tasksMd">) {
  const criteria = parseAcceptanceCriteria(proposal.specMd).criteria;
  const tasks = parseTasks(proposal.tasksMd).tasks;
  if (criteria.length === 0 || tasks.length === 0) {
    throw new Error("Accepted planning requires at least one AC in '- AC-001: ...' form and one task in '- [ ] T-001: ...' form.");
  }
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
  if (acMap.blockingIssues.length > 0) {
    throw new Error(`Planning package is not internally consistent:\n${acMap.blockingIssues.join("\n")}`);
  }
  const authored = parseWorkflowAuthoringPlan(proposal.planMd, {
    taskIds: tasks.map((task) => task.id),
    acIds: criteria.map((criterion) => criterion.id),
  });
  return { criteria, tasks, acMap, authored };
}

export interface PlanningAcceptanceCommitPort {
  hasCommit(transactionId: string): boolean;
  commit(input: {
    projectId: string;
    conversationId: string;
    changeId: string;
    acceptedAt: string;
    transactionId: string;
    proposalHash: string;
    graphScopeId: string;
    previousGraphScopeId: string;
    proposalRunId?: string;
    plannerThreadId?: string;
  }): void;
  deleteCommit(transactionId: string): void;
}

export async function acceptProjectHarnessPlanningPackage(
  context: ProjectHarnessPlanningPublicationContext,
  input: ValidatedPlanningPackageInput,
  ports: ProjectHarnessPlanningPublicationPorts,
): Promise<AcceptedPlanningPackage> {
  if (context.registry.lane) throw new Error("Planning publication derives its graph Lane from the accepted conversation scope.");
  if (context.registry.projectId.trim() === "" || input.currentGraphScopeId.trim() === "") {
    throw new Error("Planning publication requires project and graph-scope identity.");
  }
  const proposal: ValidatedPlanningProposal = { ...input.proposal };
  const acceptance = parseMainPlanningAcceptanceEvidence(input.acceptance);
  if (acceptance.proposalHash !== proposal.hash || acceptance.graphScopeId !== input.currentGraphScopeId) {
    throw new Error("Main planning acceptance is not bound to the exact current proposal and graph scope.");
  }
  return withProjectHarnessWriterLock(projectHarnessSharedWriterRoot(context.sidecarRoot), {
    projectId: context.registry.projectId,
    ownerId: `planning-${input.conversationId}`,
    operation: "change-publish",
  }, async ({ assertCurrent }) => {
    await recoverProjectHarnessPlanningPublications(context, ports);
    const validated = validatePlanningProposalArtifacts(proposal);
    const existing = input.boundChangeId
      ? await loadProjectHarnessChange(context.registry.skillRoot, input.boundChangeId, false)
      : null;
    const boundActive = existing && (existing.status === "planning" || existing.status === "active")
      ? existing
      : null;
    const currentLaneContext = planningLaneContext(
      context.registry,
      input.conversationId,
      input.currentGraphScopeId,
    );
    if (boundActive && boundActive.lane_id !== projectHarnessLaneId(currentLaneContext)) {
      throw new Error("Bound Change does not belong to the current conversation graph-scope Lane.");
    }
    const hasExecution = boundActive
      ? await ports.executionEvidence.hasEvidence(boundActive.change_id)
      : false;
    const reusable = boundActive && !hasExecution ? boundActive : null;
    const graphScopeId = boundActive && hasExecution
      ? ports.createGraphScopeId(input.conversationId)
      : input.currentGraphScopeId;
    const laneContext = planningLaneContext(context.registry, input.conversationId, graphScopeId);
    const laneBefore = await readProjectHarnessLane(laneContext);
    const changeId = reusable?.change_id
      ?? await allocateProjectHarnessPlanningChangeId(context.registry.skillRoot, input.conversationTitle);
    const activePath = await resolveProjectHarnessChangeEvidenceRoot(
      context.registry.skillRoot,
      "active",
      changeId,
    );
    const graphId = `workflow-graph-${proposal.hash.slice(0, 16)}`;
    const existingGraph = reusable && existsSync(activePath)
      ? await readLatestWorkflowGraphPlanAt(activePath, changeId).catch(() => null)
      : null;
    if (existingGraph?.id === graphId) {
      await assertPlanningArtifactsMatch(activePath, proposal);
      await assertMainPlanningAcceptanceMatch(activePath, {
        projectId: context.registry.projectId,
        changeId,
        conversationId: input.conversationId,
        graphScopeId,
        proposal,
        acceptance,
      });
      await assertPlanningContractMatch(context.registry.skillRoot, changeId, acceptance);
      await assertPlanningPreflightContinue(ports, laneContext, changeId);
      return planningPublicationResult(
        changeId,
        proposal,
        acceptance,
        existingGraph,
        await loadProjectHarnessContract(context.registry.skillRoot, changeId),
        graphScopeId,
      );
    }

    const claimToken = reusable?.claim_token ?? randomBytes(16).toString("hex");
    const transactionId = `${changeId}-${proposal.hash.slice(0, 16)}`;
    const physicalTransactions = await projectHarnessPlanningPhysicalTransactionsRoot(context.registry.skillRoot);
    const stagingPath = await resolveWithinPhysicalRoot(
      physicalTransactions,
      `${transactionId}.staging`,
      "planning publication staging evidence",
    );
    const backupPath = await resolveWithinPhysicalRoot(
      physicalTransactions,
      `${transactionId}.backup`,
      "planning publication backup evidence",
    );
    if (existsSync(stagingPath) || existsSync(backupPath)) {
      throw new Error(`Planning publication physical transaction already exists: ${transactionId}.`);
    }
    const journalPath = await projectHarnessPlanningJournalPath(context.sidecarRoot, transactionId);
    if (existsSync(journalPath)) throw new Error(`Planning publication journal already exists: ${transactionId}.`);
    const paths = [...new Set([
      ...validated.authored.nodes.flatMap((node) => node.sourceScopes),
      ...(acceptance.contract?.affected_paths ?? []),
    ])].sort();
    const supersededIntent = reusable
      ? await readSupersededAuthorizationIntent(activePath, proposal.hash)
      : null;
    const supersededAuthorization = supersededIntent
      ? await ports.authorization.captureSuperseded({
        projectId: context.registry.projectId,
        changeId,
        conversationId: input.conversationId,
        acceptedPlanHash: supersededIntent.acceptedPlanHash,
        graphId: supersededIntent.graphId,
        authorizationId: supersededIntent.authorizationId,
      })
      : null;
    let transaction: ProjectHarnessPlanningPublicationTransaction = {
      schema_version: "3.0",
      id: transactionId,
      phase: "prepared",
      project_id: context.registry.projectId,
      change_id: changeId,
      claim_token: claimToken,
      lane_id: projectHarnessLaneId(laneContext),
      repository_mode: laneContext.mode,
      branch: laneContext.branch,
      head_commit: laneContext.headCommit,
      conversation_id: input.conversationId,
      graph_scope_id: graphScopeId,
      active_path: activePath,
      staging_path: stagingPath,
      backup_path: backupPath,
      created_change: reusable === null,
      record_before: reusable ? structuredClone(reusable) : null,
      contract_before: reusable
        ? structuredClone(await loadProjectHarnessContract(context.registry.skillRoot, changeId))
        : null,
      lane_before: laneBefore ? structuredClone(laneBefore) : null,
      scope: input.conversationTitle,
      paths,
      superseded_authorization: supersededAuthorization,
    };
    await writeJsonFile(journalPath, transaction);

    try {
      if (!reusable) {
        const created = await createProjectHarnessChange(laneContext, {
          changeId,
          scope: input.conversationTitle,
          claimToken,
        });
        if (created.claim_token !== claimToken || created.lane_id !== transaction.lane_id) {
          throw new Error("Created Change claim does not match its planning publication transaction.");
        }
      }
      await initializeProjectHarnessChangeEvidence(context.registry.skillRoot, stagingPath, changeId);
      const graph = await writeAcceptedPlanningEvidence(
        stagingPath,
        context.registry.projectId,
        changeId,
        graphScopeId,
        input,
        acceptance,
        validated,
        graphId,
      );
      await rename(activePath, backupPath);
      try {
        await rename(stagingPath, activePath);
      } catch (error) {
        await rename(backupPath, activePath);
        throw error;
      }
      transaction = { ...transaction, phase: "swapped" };
      await writeJsonFile(journalPath, transaction);
      if (supersededAuthorization) {
        await ports.authorization.revoke(supersededAuthorization, supersessionReason(transaction.id));
      }
      await publishProjectHarnessChange(laneContext, {
        changeId,
        scope: input.conversationTitle,
        paths,
        status: "active",
        validation: acceptance.validation,
        contract: acceptance.contractRequired
          ? acceptance.contract
          : null,
      });
      await assertPlanningPreflightContinue(ports, laneContext, changeId);
      await assertCurrent();
      ports.commit.commit({
        projectId: context.registry.projectId,
        conversationId: input.conversationId,
        changeId,
        acceptedAt: new Date().toISOString(),
        transactionId,
        proposalHash: proposal.hash,
        graphScopeId,
        previousGraphScopeId: input.currentGraphScopeId,
        proposalRunId: proposal.runId,
        plannerThreadId: proposal.childThreadId,
      });
      transaction = { ...transaction, phase: "committed" };
      await writeJsonFile(journalPath, transaction);
      await rm(backupPath, { recursive: true });
      await rm(journalPath);
      try {
        ports.commit.deleteCommit(transactionId);
      } catch {
        // The project Skill and Workbench binding already committed; recovery may remove the projection marker later.
      }
      return planningPublicationResult(
        changeId,
        proposal,
        acceptance,
        graph,
        await loadProjectHarnessContract(context.registry.skillRoot, changeId),
        graphScopeId,
      );
    } catch (error) {
      if (ports.commit.hasCommit(transactionId)) {
        await rm(stagingPath, { recursive: true, force: true });
        await rm(backupPath, { recursive: true, force: true });
        await rm(journalPath, { force: true });
        try {
          ports.commit.deleteCommit(transactionId);
        } catch {
          // A stale acceptance marker is harmless once the exact committed publication is authoritative.
        }
        const graph = await readLatestWorkflowGraphPlanAt(activePath, changeId);
        return planningPublicationResult(
          changeId,
          proposal,
          acceptance,
          graph,
          await loadProjectHarnessContract(context.registry.skillRoot, changeId),
          graphScopeId,
        );
      }
      await rollbackProjectHarnessPlanningPublication(context, transaction, ports);
      await rm(journalPath, { force: true });
      throw error;
    }
  });
}

function supersessionReason(transactionId: string): string {
  return `Planning proposal superseded by transaction ${transactionId}.`;
}

function assertTransactionPath(root: string, candidate: string): void {
  const scoped = relative(resolve(root), resolve(candidate));
  if (!scoped || scoped.startsWith("..") || isAbsolute(scoped)) {
    throw new Error(`Planning publication transaction path escaped its owner root: ${candidate}`);
  }
}

async function writeAcceptedPlanningEvidence(
  stagingPath: string,
  projectId: string,
  changeId: string,
  graphScopeId: string,
  input: ValidatedPlanningPackageInput,
  acceptance: MainPlanningAcceptanceEvidence,
  validated: ReturnType<typeof validatePlanningProposalArtifacts>,
  graphId: string,
): Promise<WorkflowGraphPlan> {
  const now = new Date().toISOString();
  const planMd = planningApprovedPlan(input.proposal.planMd, input.proposal.id);
  const tasksMd = renderPlanningTasks(changeId, validated.tasks, validated.authored.nodes);
  const summaryPath = join(stagingPath, "summary.md");
  const reviewPath = join(stagingPath, "reviews", "review.md");
  const summary = (await readFile(summaryPath, "utf8"))
    .replace('status: "planning"', 'status: "implementing"')
    .replace('phase: "intake"', 'phase: "plan"')
    .replace('intake_status: "pending"', 'intake_status: "complete"')
    .replace('spec_review: "pending"', 'spec_review: "complete"')
    .replace('plan_review: "pending"', 'plan_review: "approved"');
  const review = (await readFile(reviewPath, "utf8"))
    .replace("- Intake complete: no", "- Intake complete: yes")
    .replace("- Approved: no", "- Approved: yes")
    .replace("- Acceptance observable: TBD", "- Acceptance observable: yes; bound to the accepted proposal")
    .replace("- High-impact clarifications resolved: TBD", "- High-impact clarifications resolved: yes")
    .replace("- WHAT/WHY separated from HOW: TBD", "- WHAT/WHY separated from HOW: yes")
    .replace("- Scope matches spec: TBD", "- Scope matches spec: yes")
    .replace("- Spec gaps found from planning: none recorded", `- Spec gaps found from planning: none; proposal ${input.proposal.id}`);
  await atomicWriteFile(summaryPath, trailingNewline(summary));
  await atomicWriteFile(join(stagingPath, "spec.md"), trailingNewline(input.proposal.specMd));
  await atomicWriteFile(join(stagingPath, "plan.md"), trailingNewline(planMd));
  await atomicWriteFile(join(stagingPath, "tasks.md"), trailingNewline(tasksMd));
  await atomicWriteFile(reviewPath, trailingNewline(review));
  const acMap = buildAcMap({
    changeId,
    specContent: input.proposal.specMd,
    tasksContent: tasksMd,
    placeholderFiles: [
      { path: "spec.md", content: input.proposal.specMd },
      { path: "plan.md", content: planMd },
      { path: "tasks.md", content: tasksMd },
    ],
  });
  await writeJsonFile(join(stagingPath, "ac-map.json"), { ...acMap, generatedAt: now });
  await createEmptySpecTests(stagingPath, changeId);
  await writeJsonFile(join(stagingPath, "planning", "execution-authorization-intent.json"), {
    version: "1.0",
    status: "pending",
    changeId,
    conversationId: input.conversationId,
    proposalId: input.proposal.id,
    proposalHash: input.proposal.hash,
    graphId,
    authorizationId: null,
    reason: null,
    updatedAt: now,
  });
  await writeJsonFile(join(stagingPath, "planning", "main-acceptance.json"), mainPlanningAcceptanceRecord({
    projectId,
    changeId,
    conversationId: input.conversationId,
    graphScopeId,
    proposal: input.proposal,
    acceptance,
  }));
  const changeRelativePath = `state/changes/active/${changeId}`;
  const artifact = `${changeRelativePath}/planning/workflow-graphs/${graphId}.json`;
  const markdownArtifact = `${changeRelativePath}/planning/workflow-graphs/${graphId}.md`;
  const sourceArtifactHashes = {
    [`${changeRelativePath}/spec.md`]: sha256(trailingNewline(input.proposal.specMd)),
    [`${changeRelativePath}/plan.md`]: sha256(trailingNewline(planMd)),
    [`${changeRelativePath}/tasks.md`]: sha256(trailingNewline(tasksMd)),
  };
  const graph = compileWorkflowGraphPlan(validated.authored, {
    id: graphId,
    changeId,
    taskIds: validated.tasks.map((task) => task.id),
    acIds: validated.criteria.map((criterion) => criterion.id),
    planArtifactRef: `${changeRelativePath}/plan.md`,
    sourceArtifactHashes,
    artifactRefs: [...Object.keys(sourceArtifactHashes), artifact, markdownArtifact],
    artifact,
    markdownArtifact,
    createdAt: now,
  });
  await writeWorkflowGraphPlanAt(stagingPath, changeId, graph);
  return graph;
}

function renderPlanningTasks(
  changeId: string,
  tasks: ReturnType<typeof parseTasks>["tasks"],
  nodes: ReturnType<typeof parseWorkflowAuthoringPlan>["nodes"],
): string {
  const nodeByTask = new Map(nodes.flatMap((node) =>
    node.taskIds.map((taskId) => [taskId.toUpperCase(), node] as const)));
  return [
    `# Tasks: ${changeId}`,
    "",
    "Each task records its accepted criteria, project-source scope, and required validation evidence.",
    "",
    ...tasks.flatMap((task) => {
      const node = nodeByTask.get(task.id.toUpperCase());
      if (!node) throw new Error(`Accepted task ${task.id} has no Workflow node.`);
      return [
        `- [${task.done ? "x" : " "}] ${task.id}: ${task.text}`,
        `  - Covers: ${task.acIds.join(", ")}`,
        `  - owner/path: project source / ${node.sourceScopes.join(", ")}`,
        `  - validation: Workflow node ${node.id} validation and audit evidence`,
      ];
    }),
    "",
  ].join("\n");
}

function planningApprovedPlan(planMd: string, proposalId: string): string {
  const normalized = planMd.trimEnd();
  if (/^## Plan Review\s*$/m.test(normalized)) {
    throw new Error("Planner proposal must not self-approve its Plan Review section.");
  }
  return [
    normalized,
    "",
    "## Plan Review",
    "",
    "- Status: approved",
    `- Reviewer/evidence: user-approved proposal ${proposalId}`,
    "",
  ].join("\n");
}

async function readSupersededAuthorizationIntent(
  evidenceRoot: string,
  nextProposalHash: string,
): Promise<{ acceptedPlanHash: string; graphId: string; authorizationId: string } | null> {
  const intentPath = join(evidenceRoot, "planning", "execution-authorization-intent.json");
  if (!existsSync(intentPath)) return null;
  const intent = JSON.parse(await readFile(intentPath, "utf8")) as {
    proposalHash?: unknown;
    graphId?: unknown;
    authorizationId?: unknown;
  };
  if (intent.proposalHash === nextProposalHash
    || typeof intent.proposalHash !== "string"
    || typeof intent.graphId !== "string"
    || !intent.graphId
    || typeof intent.authorizationId !== "string"
    || !intent.authorizationId) return null;
  return {
    acceptedPlanHash: intent.proposalHash,
    graphId: intent.graphId,
    authorizationId: intent.authorizationId,
  };
}

async function assertPlanningPreflightContinue(
  ports: ProjectHarnessPlanningPublicationPorts,
  context: ProjectHarnessRegistryContext,
  changeId: string,
): Promise<void> {
  const result = await ports.preflight.evaluate(context, changeId);
  if (result.action !== "continue") {
    throw new Error(`Planning publication preflight requires replanning: ${JSON.stringify({
      conflicts: result.conflicts,
      baselineRelation: result.baseline_relation,
      baselineImpacts: result.baseline_impacts,
      knowledge: result.knowledge,
    })}`);
  }
}

async function assertPlanningArtifactsMatch(
  activePath: string,
  proposal: ValidatedPlanningProposal,
): Promise<void> {
  const [specMd, planMd] = await Promise.all([
    readFile(join(activePath, "spec.md"), "utf8"),
    readFile(join(activePath, "plan.md"), "utf8"),
  ]);
  if (specMd.trim() !== proposal.specMd.trim()
    || planMd.trim() !== planningApprovedPlan(proposal.planMd, proposal.id).trim()) {
    throw new Error("Accepted artifacts drifted after this planner proposal; a fresh revision is required.");
  }
}

function planningPublicationResult(
  changeId: string,
  proposal: ValidatedPlanningProposal,
  acceptance: MainPlanningAcceptanceEvidence,
  graph: WorkflowGraphPlan,
  contract: ProjectHarnessContractRecord | null,
  graphScopeId: string,
): AcceptedPlanningPackage {
  return {
    changeId,
    proposalId: proposal.id,
    proposalHash: proposal.hash,
    graphScopeId,
    authorizationIntentArtifact: `state/changes/active/${changeId}/planning/execution-authorization-intent.json`,
    workflowGraphPlan: graph,
    registryContract: contract,
    registryContractValidation: [...acceptance.validation],
  };
}

async function assertPlanningContractMatch(
  skillRoot: string,
  changeId: string,
  evidence: MainPlanningAcceptanceEvidence,
): Promise<void> {
  const current = await loadProjectHarnessContract(skillRoot, changeId);
  if (evidence.contractRequired !== Boolean(current)) {
    throw new Error("Accepted Registry contract drifted after this Main acceptance; a fresh acceptance is required.");
  }
  if (!current) return;
  const expected = {
    ...evidence.contract,
    affected_paths: evidence.contract?.affected_paths ?? [],
  };
  const actual = {
    kind: current.kind,
    subject: current.subject,
    operation: current.operation,
    owner_module: current.owner_module,
    affected_paths: current.affected_paths,
    consumers: current.consumers,
    depends_on: current.depends_on,
    depends_on_changes: current.depends_on_changes,
    compatibility: current.compatibility,
    status: current.status,
  };
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error("Accepted Registry contract drifted after this Main acceptance; a fresh acceptance is required.");
  }
}

interface MainPlanningAcceptanceRecordInput {
  projectId: string;
  changeId: string;
  conversationId: string;
  graphScopeId: string;
  proposal: Pick<ValidatedPlanningProposal, "id" | "hash">;
  acceptance: MainPlanningAcceptanceEvidence;
}

function mainPlanningAcceptanceRecord(input: MainPlanningAcceptanceRecordInput): object {
  return {
    version: "1.0",
    acceptedBy: "main-agent",
    projectId: input.projectId,
    changeId: input.changeId,
    conversationId: input.conversationId,
    graphScopeId: input.graphScopeId,
    proposalId: input.proposal.id,
    proposalHash: input.proposal.hash,
    contractRequired: input.acceptance.contractRequired,
    contract: input.acceptance.contract,
    validation: [...input.acceptance.validation],
  };
}

async function assertMainPlanningAcceptanceMatch(
  activePath: string,
  input: MainPlanningAcceptanceRecordInput,
): Promise<void> {
  const path = join(activePath, "planning", "main-acceptance.json");
  if (!existsSync(path)) throw new Error("Accepted Main planning evidence is missing; a fresh acceptance is required.");
  const current = JSON.parse(await readFile(path, "utf8")) as unknown;
  if (JSON.stringify(current) !== JSON.stringify(mainPlanningAcceptanceRecord(input))) {
    throw new Error("Accepted Main planning evidence drifted; a fresh acceptance is required.");
  }
}

function planningLaneContext(
  base: ProjectHarnessRegistryContext,
  conversationId: string,
  graphScopeId: string,
): ProjectHarnessRegistryContext {
  return {
    ...base,
    lane: projectHarnessConversationLane(conversationId, graphScopeId),
  };
}

async function allocateProjectHarnessPlanningChangeId(skillRoot: string, title: string): Promise<string> {
  const rawSlug = slugify(title);
  const descriptive = rawSlug === "project" ? `project-${shortHash(title)}` : rawSlug;
  const base = descriptive.length <= 100
    ? descriptive
    : `${descriptive.slice(0, 91).replace(/-+$/g, "")}-${shortHash(title)}`;
  const occupied = new Set((await listProjectHarnessChanges(skillRoot)).map((change) => change.change_id));
  let candidate = base;
  let suffix = 2;
  while (occupied.has(candidate)) candidate = `${base}-${suffix++}`;
  return candidate;
}

async function projectHarnessPlanningPhysicalTransactionsRoot(skillRoot: string): Promise<string> {
  const root = await resolveWithinPhysicalRoot(skillRoot, "state/changes/.transactions", "planning publication transactions");
  await mkdir(root, { recursive: true });
  return assertPhysicalDirectory(root, "planning publication transactions");
}

async function projectHarnessPlanningJournalPath(sidecarRoot: string, transactionId: string): Promise<string> {
  const sidecar = await assertPhysicalDirectory(sidecarRoot, "project runtime sidecar");
  const root = await resolveWithinPhysicalRoot(sidecar, "transactions/planning", "planning publication journals");
  await mkdir(root, { recursive: true });
  return resolveWithinPhysicalRoot(root, `${transactionId}.json`, "planning publication journal");
}

async function recoverProjectHarnessPlanningPublications(
  context: ProjectHarnessPlanningPublicationContext,
  ports: ProjectHarnessPlanningPublicationPorts,
): Promise<void> {
  const sidecar = await assertPhysicalDirectory(context.sidecarRoot, "project runtime sidecar");
  const root = await resolveWithinPhysicalRoot(sidecar, "transactions/planning", "planning publication journals");
  if (!existsSync(root)) return;
  for (const entry of (await readdir(root, { withFileTypes: true })).sort((left, right) => left.name.localeCompare(right.name))) {
    if (entry.isSymbolicLink() || !entry.isFile() || !entry.name.endsWith(".json")) {
      throw new Error(`Planning publication journals contain an unsupported entry: ${entry.name}.`);
    }
    const path = await resolveWithinPhysicalRoot(root, entry.name, "planning publication journal");
    const transaction = JSON.parse(await readFile(path, "utf8")) as ProjectHarnessPlanningPublicationTransaction;
    await assertProjectHarnessPlanningTransaction(context, transaction, entry.name);
    if (transaction.phase === "committed" || ports.commit.hasCommit(transaction.id)) {
      await rm(transaction.staging_path, { recursive: true, force: true });
      await rm(transaction.backup_path, { recursive: true, force: true });
      try {
        ports.commit.deleteCommit(transaction.id);
      } catch {
        // The committed project Skill state remains authoritative; a later open may clean the marker.
      }
    } else {
      await rollbackProjectHarnessPlanningPublication(context, transaction, ports);
    }
    await rm(path, { force: true });
  }
}

async function rollbackProjectHarnessPlanningPublication(
  context: ProjectHarnessPlanningPublicationContext,
  transaction: ProjectHarnessPlanningPublicationTransaction,
  ports: ProjectHarnessPlanningPublicationPorts,
): Promise<void> {
  const laneContext = planningLaneContext(
    {
      ...context.registry,
      mode: transaction.repository_mode,
      branch: transaction.branch,
      headCommit: transaction.head_commit,
      lane: undefined,
    },
    transaction.conversation_id,
    transaction.graph_scope_id,
  );
  if (projectHarnessLaneId(laneContext) !== transaction.lane_id) {
    throw new Error("Planning publication rollback Lane identity does not match its journal.");
  }
  if (existsSync(transaction.backup_path)) {
    await rm(transaction.active_path, { recursive: true, force: true });
    await rename(transaction.backup_path, transaction.active_path);
  }
  await rm(transaction.staging_path, { recursive: true, force: true });
  if (transaction.superseded_authorization) {
    await ports.authorization.restore(
      transaction.superseded_authorization,
      supersessionReason(transaction.id),
    );
  }
  await restoreProjectHarnessContract(
    laneContext,
    transaction.change_id,
    transaction.claim_token,
    transaction.contract_before,
  );
  if (transaction.created_change) {
    const current = await loadProjectHarnessChange(context.registry.skillRoot, transaction.change_id, false);
    if (current) {
      await rollbackUncommittedProjectHarnessChange(
        laneContext,
        transaction.change_id,
        transaction.claim_token,
        transaction.lane_before,
      );
    }
  } else if (transaction.record_before) {
    await restoreMutableProjectHarnessChangeRecord(laneContext, transaction.record_before);
    await restoreProjectHarnessLane(laneContext, transaction.lane_before);
  }
  await rebuildProjectHarnessChangeIndex(context.registry.skillRoot);
}

async function assertProjectHarnessPlanningTransaction(
  context: ProjectHarnessPlanningPublicationContext,
  transaction: ProjectHarnessPlanningPublicationTransaction,
  filename: string,
): Promise<void> {
  if (transaction.schema_version !== "3.0"
    || transaction.project_id !== context.registry.projectId
    || filename !== `${transaction.id}.json`
    || canonicalProjectHarnessId(transaction.id, "Planning transaction id") !== transaction.id
    || canonicalProjectHarnessId(transaction.change_id, "Planning Change id") !== transaction.change_id
    || !/^[a-f0-9]{32}$/i.test(transaction.claim_token)
    || !["prepared", "swapped", "committed"].includes(transaction.phase)
    || !["single_lane", "multi_lane"].includes(transaction.repository_mode)
    || (transaction.branch !== null && typeof transaction.branch !== "string")
    || (transaction.head_commit !== null && typeof transaction.head_commit !== "string")
    || !transaction.conversation_id
    || !transaction.graph_scope_id
    || typeof transaction.created_change !== "boolean"
    || (transaction.record_before !== null && typeof transaction.record_before !== "object")
    || (transaction.contract_before !== null && typeof transaction.contract_before !== "object")
    || (transaction.lane_before !== null && typeof transaction.lane_before !== "object")
    || (transaction.superseded_authorization !== null
      && typeof transaction.superseded_authorization !== "object")
    || !Array.isArray(transaction.paths)
    || transaction.paths.some((path) => typeof path !== "string")
    || (transaction.created_change ? transaction.record_before !== null : transaction.record_before === null)) {
    throw new Error(`Invalid or foreign planning publication journal: ${filename}.`);
  }
  const laneContext = planningLaneContext(
    {
      ...context.registry,
      mode: transaction.repository_mode,
      branch: transaction.branch,
      headCommit: transaction.head_commit,
      lane: undefined,
    },
    transaction.conversation_id,
    transaction.graph_scope_id,
  );
  if (projectHarnessLaneId(laneContext) !== transaction.lane_id
    || (transaction.record_before !== null
      && (transaction.record_before.change_id !== transaction.change_id
        || transaction.record_before.lane_id !== transaction.lane_id))
    || (transaction.contract_before !== null
      && transaction.contract_before.change_id !== transaction.change_id)
    || (transaction.lane_before !== null && transaction.lane_before.lane_id !== transaction.lane_id)
    || (transaction.superseded_authorization !== null
      && (transaction.superseded_authorization.projectId !== transaction.project_id
        || transaction.superseded_authorization.changeId !== transaction.change_id
        || transaction.superseded_authorization.conversationId !== transaction.conversation_id))) {
    throw new Error(`Planning publication journal identity is inconsistent: ${filename}.`);
  }
  const physicalRoot = resolve(context.registry.skillRoot, "state", "changes", ".transactions");
  assertTransactionPath(physicalRoot, transaction.staging_path);
  assertTransactionPath(physicalRoot, transaction.backup_path);
  const activeRoot = resolve(context.registry.skillRoot, "state", "changes", "active");
  assertTransactionPath(activeRoot, transaction.active_path);
  if (!samePhysicalPath(transaction.active_path, resolve(activeRoot, transaction.change_id))
    || !samePhysicalPath(transaction.staging_path, resolve(physicalRoot, `${transaction.id}.staging`))
    || !samePhysicalPath(transaction.backup_path, resolve(physicalRoot, `${transaction.id}.backup`))) {
    throw new Error("Planning publication journal paths do not match its bound transaction identity.");
  }
  for (const [path, label] of [
    [transaction.active_path, "planning publication active evidence"],
    [transaction.staging_path, "planning publication staging evidence"],
    [transaction.backup_path, "planning publication backup evidence"],
  ] as const) {
    if (existsSync(path)) await assertPhysicalDirectory(path, label);
  }
}

function samePhysicalPath(left: string, right: string): boolean {
  const normalizedLeft = resolve(left);
  const normalizedRight = resolve(right);
  return process.platform === "win32"
    ? normalizedLeft.toLowerCase() === normalizedRight.toLowerCase()
    : normalizedLeft === normalizedRight;
}

function trailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
