import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { acceptSkillNativeAudit } from "../../src/audit/acceptance.js";
import { collectWorktreeDiff } from "../../src/audit/diff.js";
import { projectApplyActionScope, resolveProjectApplyExecutionScope, resolveWorktreeApprovalScope } from "../../src/apply/execution-scope.js";
import { writeJsonFile } from "../../src/fs/json.js";
import { integrationCheckActionManifestHash } from "../../src/integration-check/apply-discard.js";
import { runSkillNativeIntegrationCheck } from "../../src/integration-check/service.js";
import type { IntegrationCheckRecord } from "../../src/integration-check/types.js";
import { projectHarnessPlanningStartManifestHash, readProjectHarnessPlanningGate } from "../../src/project-harness/planning-gate-query.js";
import { projectHarnessSharedWriterRoot } from "../../src/project-harness/writer-lock.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../src/provider-runtime/project-harness-discovery.js";
import { getGitCommit, getGitStatusShort } from "../../src/project/git.js";
import { resolveProjectRuntimeState } from "../../src/project-runtime/coordinator.js";
import { projectExecutionRuntimePort } from "../../src/project-runtime/execution-ports.js";
import { publishProjectRuntimePlanningPackage } from "../../src/project-runtime/planning-publication.js";
import type { ProjectRuntimeResolution } from "../../src/project-runtime/context.js";
import type { ExecutionAuthorizationSnapshot, ManagedProject } from "../../src/types/index.js";
import { createWorktreeWithRuntimePort } from "../../src/worktree/creation.js";
import { hashWorkflowGraphPlan } from "../../src/workflow-artifacts/hashes.js";
import { issueLocalExecutionAuthorization } from "../../src/workflow-runtime/execution-authorization.js";
import type { HighImpactApprovalScope } from "../../src/workflow-actions/high-impact-approval.js";
import { createConversationChangeFixture } from "./conversation-change-fixture.js";
import { createReadyProjectHarnessFixture } from "./project-harness-fixture.js";

export interface SkillNativeApplyFixture {
  project: ManagedProject;
  resolution: ProjectRuntimeResolution;
  changeId: string;
  conversationId: string;
  graphScopeId: string;
  evidenceRoot: string;
  worktreeId: string;
  worktreePath: string;
  worktreeIdentityHash: string;
  diffHash: string;
  diff: string;
  diffStat: string;
  changedPaths: string[];
  expectedTree: string;
  validationId: string;
  auditId: string;
  sourceHead: string;
  authorizationId: string;
  authorizationEpoch: number;
  authorizationSnapshot: ExecutionAuthorizationSnapshot;
  actionScope: HighImpactApprovalScope;
}

export interface SkillNativeApplyCandidateFixture {
  worktreeId: string;
  worktreePath: string;
  diffHash: string;
  diffStat: string;
  validationId: string;
  auditId: string;
  sourceHead: string;
}

export async function prepareSkillNativeApplyFixture(input: {
  projectRoot: string;
  ahoHome: string;
  projectId: string;
  projectName: string;
  title?: string;
  changedPath?: string;
  changedContent?: string;
}): Promise<SkillNativeApplyFixture> {
  const harness = await createReadyProjectHarnessFixture({
    projectRoot: input.projectRoot,
    ahoHome: input.ahoHome,
    projectId: input.projectId,
    projectName: input.projectName,
  });
  const topic = await createConversationChangeFixture(harness.project, {
    title: input.title ?? "Skill Native Apply",
    body: "Apply one exact reviewed worktree candidate through the current project Harness.",
  });
  const graphScopeId = `graph:${topic.conversationId}`;
  const specMd = [
    "# Spec",
    "",
    "## Acceptance Criteria",
    "",
    "- AC-001: Apply one exact reviewed worktree candidate.",
    "",
  ].join("\n");
  const workflowPlan = {
    version: "1.0" as const,
    mode: "sequential-v1" as const,
    nodes: [{
      id: "apply-candidate",
      title: "Prepare apply candidate",
      taskIds: ["T-001"],
      acIds: ["AC-001"],
      prompt: "Objective: prepare one exact candidate. Required behavior: modify only the assigned worktree path. Constraints: keep the source root unchanged before apply. Expected evidence: matching Validation and Audit.",
      dependsOn: [],
      sourceScopes: [input.changedPath ?? "candidate.txt"],
    }],
  };
  const planMd = [
    "# Plan",
    "",
    "Prepare, validate, and audit one isolated worktree candidate.",
    "",
    "## Workflow",
    "",
    "```json",
    JSON.stringify(workflowPlan, null, 2),
    "```",
    "",
  ].join("\n");
  const tasksMd = [
    "# Tasks",
    "",
    "- [ ] T-001: Prepare the exact apply candidate.",
    "  - Covers: AC-001",
    "",
  ].join("\n");
  const proposalHash = sha256(`${specMd}\n${planMd}\n${tasksMd}`);
  const initial = await resolveReady(harness.project, input.ahoHome);
  const transactionIds = new Set<string>();
  const accepted = await publishProjectRuntimePlanningPackage(initial, {
    conversationId: topic.conversationId,
    conversationTitle: topic.title,
    boundChangeId: topic.changeId,
    currentGraphScopeId: graphScopeId,
    proposal: {
      id: `proposal-${topic.changeId}`,
      hash: proposalHash,
      artifact: `planner-proposals/${topic.changeId}/plan.md`,
      specMd,
      planMd,
      tasksMd,
    },
    acceptance: {
      version: "1.0",
      proposalHash,
      graphScopeId,
      contractRequired: false,
      contract: null,
      validation: ["Fixture Main accepted the exact sequential proposal."],
    },
  }, {
    hasCommit: (transactionId) => transactionIds.has(transactionId),
    commit: ({ transactionId }) => { transactionIds.add(transactionId); },
    deleteCommit: (transactionId) => { transactionIds.delete(transactionId); },
  }, () => graphScopeId);

  const resolution = await resolveReady(harness.project, input.ahoHome);
  const runtime = projectExecutionRuntimePort(harness.project, resolution);
  const planning = await readProjectHarnessPlanningGate({
    projectId: resolution.harness.projectId,
    projectRoot: resolution.projectRoot,
    skillRoot: resolution.harness.skillRoot,
    conversationId: topic.conversationId,
    graphScopeId,
    changeId: accepted.changeId,
  });
  const evidenceDigest = projectHarnessPlanningStartManifestHash(planning, resolution.harness.contentFingerprint);
  const sourceHead = await getGitCommit(input.projectRoot);
  const sourceStatus = await getGitStatusShort(input.projectRoot);
  if (!sourceHead || sourceStatus.length > 0) {
    throw new Error(`Skill-native apply fixture requires a clean Git source: ${sourceStatus.join(", ")}`);
  }
  const authorization = await issueLocalExecutionAuthorization(runtime, {
    projectId: resolution.harness.projectId,
    changeId: accepted.changeId,
    conversationId: topic.conversationId,
    providerThreadId: `fixture-main-${topic.conversationId}`,
    goalIdentityHash: sha256(`fixture-goal:${topic.conversationId}`),
    mode: "stepwise",
    acceptedPlanId: accepted.proposalId,
    acceptedPlanHash: accepted.proposalHash,
    graphId: accepted.workflowGraphPlan.id,
    graphHash: hashWorkflowGraphPlan(accepted.workflowGraphPlan),
    artifactManifestHash: hashJson(accepted.workflowGraphPlan.sourceArtifactHashes),
    sourceHead,
    sourceStateHash: hashJson(sourceStatus),
    providerScopeHash: hashJson({ projectId: resolution.harness.projectId, conversationId: topic.conversationId, providerId: "codex" }),
    permissionProfileHash: hashJson({ approvalPolicy: "never", sandbox: "runtime-owned-scoped-write", network: false }),
    policyHash: hashJson("local-execution-authorization-policy-v1"),
    targets: [{
      transition: "workflow.run.start",
      targetId: accepted.workflowGraphPlan.id,
      manifestHash: evidenceDigest,
    }],
    budget: { maxCompletedOperations: 16, maxReworks: 1, maxChangedFiles: 100, maxChangedBytes: 10 * 1024 * 1024 },
    userDecision: { decisionId: `fixture-execute:${topic.conversationId}`, actorId: "workbench-user", decidedAt: new Date().toISOString() },
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  });
  const authorizationSnapshot = authorizationSnapshotOf(authorization);
  const evidenceRoot = join(resolution.harness.skillRoot, "state", "changes", "active", accepted.changeId);
  await writeJsonFile(join(evidenceRoot, "planning", "execution-authorization-intent.json"), {
    version: "1.0",
    status: "issued",
    changeId: accepted.changeId,
    conversationId: topic.conversationId,
    proposalId: accepted.proposalId,
    proposalHash: accepted.proposalHash,
    graphId: accepted.workflowGraphPlan.id,
    authorizationId: authorization.id,
    projectHarnessContentFingerprint: resolution.harness.contentFingerprint,
    startManifestHash: evidenceDigest,
    reason: null,
    updatedAt: new Date().toISOString(),
  });

  const worktree = await createWorktreeWithRuntimePort(harness.project, runtime, accepted.changeId);
  const changedPath = input.changedPath ?? "candidate.txt";
  const target = join(worktree.metadata.checkoutPath, ...changedPath.split("/"));
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, input.changedContent ?? "skill-native candidate\n", "utf8");
  const diff = await collectWorktreeDiff(runtime, worktree.metadata.worktreeId, accepted.changeId);
  const validationId = `validation-${worktree.metadata.worktreeId}`;
  const auditId = `audit-${worktree.metadata.worktreeId}`;
  await writeFixtureValidation(runtime.runsRoot, accepted.changeId, validationId, worktree.metadata.worktreeId, diff.diffHash);
  await writeFixtureAudit(runtime.runsRoot, accepted.changeId, auditId, validationId, worktree.metadata.worktreeId, diff.diffHash);
  await acceptSkillNativeAudit({
    project: harness.project,
    runtime,
    evidenceRoot,
    writerRoot: projectHarnessSharedWriterRoot(resolution.paths.sidecarRoot),
    auditId,
  });
  const refreshed = await resolveReady(harness.project, input.ahoHome);
  const actionScope = await resolveWorktreeApprovalScope(harness.project, worktree.metadata.worktreeId);
  return {
    project: harness.project,
    resolution: refreshed,
    changeId: accepted.changeId,
    conversationId: topic.conversationId,
    graphScopeId,
    evidenceRoot,
    worktreeId: worktree.metadata.worktreeId,
    worktreePath: worktree.metadata.checkoutPath,
    worktreeIdentityHash: hashJson({
      projectId: worktree.metadata.projectId,
      changeId: worktree.metadata.changeId,
      worktreeId: worktree.metadata.worktreeId,
      checkoutPath: worktree.metadata.checkoutPath,
      branchName: worktree.metadata.branchName,
      baseCommit: worktree.metadata.baseCommit,
      createdAt: worktree.metadata.createdAt,
    }),
    diffHash: diff.diffHash,
    diffStat: diff.diffStat,
    diff: diff.diff,
    changedPaths: diff.changedPaths,
    expectedTree: diff.expectedTree,
    validationId,
    auditId,
    sourceHead,
    authorizationId: authorization.id,
    authorizationEpoch: authorization.epoch,
    authorizationSnapshot,
    actionScope,
  };
}

export interface SkillNativeIntegrationCheckFixture {
  base: SkillNativeApplyFixture;
  check: IntegrationCheckRecord;
  actionScope: HighImpactApprovalScope;
  secondWorktreeId: string;
  secondWorktreePath: string;
}

export async function prepareSkillNativeIntegrationCheckFixture(input: {
  projectRoot: string;
  ahoHome: string;
  projectId: string;
  projectName: string;
  title?: string;
}): Promise<SkillNativeIntegrationCheckFixture> {
  const base = await prepareSkillNativeApplyFixture({
    ...input,
    title: input.title ?? "Skill Native Integration Apply",
    changedPath: "candidate-a.txt",
    changedContent: "candidate A\n",
  });
  const runtime = projectExecutionRuntimePort(base.project, base.resolution);
  const second = await createWorktreeWithRuntimePort(base.project, runtime, base.changeId);
  await writeFile(join(second.metadata.checkoutPath, "candidate-b.txt"), "candidate B\n", "utf8");
  const secondDiff = await collectWorktreeDiff(runtime, second.metadata.worktreeId, base.changeId);
  const secondValidationId = `validation-${second.metadata.worktreeId}`;
  const secondAuditId = `audit-${second.metadata.worktreeId}`;
  await writeFixtureValidation(runtime.runsRoot, base.changeId, secondValidationId, second.metadata.worktreeId, secondDiff.diffHash);
  await writeFixtureAudit(runtime.runsRoot, base.changeId, secondAuditId, secondValidationId, second.metadata.worktreeId, secondDiff.diffHash);
  const result = await runSkillNativeIntegrationCheck(base.project, runtime, [{
    changeId: base.changeId,
    worktreeId: base.worktreeId,
    diffHash: base.diffHash,
    diffStat: base.diffStat,
    sourceHead: base.sourceHead,
    validationRunId: base.validationId,
    auditRunId: base.auditId,
  }, {
    changeId: base.changeId,
    worktreeId: second.metadata.worktreeId,
    diffHash: secondDiff.diffHash,
    diffStat: secondDiff.diffStat,
    sourceHead: base.sourceHead,
    validationRunId: secondValidationId,
    auditRunId: secondAuditId,
  }], base.changeId);
  if (result.check.status !== "passed") {
    throw new Error(`Skill-native IntegrationCheck fixture did not pass: ${result.check.blockingIssues.join(", ")}`);
  }
  const scope = await resolveProjectApplyExecutionScope(base.project, base.worktreeId);
  return {
    base,
    check: result.check,
    actionScope: projectApplyActionScope(scope, integrationCheckActionManifestHash(result.check)),
    secondWorktreeId: second.metadata.worktreeId,
    secondWorktreePath: second.metadata.checkoutPath,
  };
}

export async function addSkillNativeApplyCandidate(input: {
  fixture: SkillNativeApplyFixture;
  changedPath: string;
  changedContent: string;
}): Promise<SkillNativeApplyCandidateFixture> {
  const runtime = projectExecutionRuntimePort(input.fixture.project, input.fixture.resolution);
  const worktree = await createWorktreeWithRuntimePort(input.fixture.project, runtime, input.fixture.changeId);
  const target = join(worktree.metadata.checkoutPath, ...input.changedPath.split("/"));
  await mkdir(join(target, ".."), { recursive: true });
  await writeFile(target, input.changedContent, "utf8");
  const diff = await collectWorktreeDiff(runtime, worktree.metadata.worktreeId, input.fixture.changeId);
  const validationId = `validation-${worktree.metadata.worktreeId}`;
  const auditId = `audit-${worktree.metadata.worktreeId}`;
  await writeFixtureValidation(runtime.runsRoot, input.fixture.changeId, validationId, worktree.metadata.worktreeId, diff.diffHash);
  await writeFixtureAudit(runtime.runsRoot, input.fixture.changeId, auditId, validationId, worktree.metadata.worktreeId, diff.diffHash);
  return {
    worktreeId: worktree.metadata.worktreeId,
    worktreePath: worktree.metadata.checkoutPath,
    diffHash: diff.diffHash,
    diffStat: diff.diffStat,
    validationId,
    auditId,
    sourceHead: input.fixture.sourceHead,
  };
}

async function resolveReady(project: ManagedProject, ahoHome: string): Promise<ProjectRuntimeResolution> {
  const state = await resolveProjectRuntimeState(project, {
    ahoHome,
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") throw new Error(`Skill-native apply fixture requires a ready runtime: ${state.state}.`);
  return state.resolution;
}

async function writeFixtureValidation(
  runsRoot: string,
  changeId: string,
  validationId: string,
  worktreeId: string,
  diffHash: string,
): Promise<void> {
  const directory = join(runsRoot, validationId);
  const now = new Date().toISOString();
  await mkdir(directory, { recursive: true });
  await writeJsonFile(join(directory, "validation.json"), {
    version: "1.0",
    id: validationId,
    runId: validationId,
    changeId,
    profile: "fixture",
    status: "passed",
    executionMode: "worktree",
    worktreeId,
    worktreeDiffHash: diffHash,
    startedAt: now,
    finishedAt: now,
    commands: [],
  });
}

async function writeFixtureAudit(
  runsRoot: string,
  changeId: string,
  auditId: string,
  validationId: string,
  worktreeId: string,
  diffHash: string,
): Promise<void> {
  const directory = join(runsRoot, auditId);
  const now = new Date().toISOString();
  await mkdir(directory, { recursive: true });
  await writeJsonFile(join(directory, "audit.json"), {
    version: "1.0",
    id: auditId,
    runId: auditId,
    changeId,
    status: "approved",
    worktreeId,
    validationId,
    worktreeDiffHash: diffHash,
    startedAt: now,
    finishedAt: now,
    findings: [],
    artifacts: {
      audit: `${auditId}/audit.json`,
      auditMarkdown: `${auditId}/audit.md`,
      lastMessage: `${auditId}/last-message.md`,
      diffStat: `${auditId}/diff-stat.txt`,
    },
  });
  await writeFile(join(directory, "audit.md"), "Status: approved\n", "utf8");
  await writeFile(join(directory, "last-message.md"), "Audit approved.\n", "utf8");
  await writeFile(join(directory, "diff-stat.txt"), "candidate fixture\n", "utf8");
}

function authorizationSnapshotOf(authorization: {
  acceptedPlanHash: string;
  graphHash: string;
  artifactManifestHash: string;
  sourceHead: string;
  sourceStateHash: string;
  permissionProfileHash: string;
  providerScopeHash: string;
  policyHash: string;
}): ExecutionAuthorizationSnapshot {
  return {
    acceptedPlanHash: authorization.acceptedPlanHash,
    graphHash: authorization.graphHash,
    artifactManifestHash: authorization.artifactManifestHash,
    sourceHead: authorization.sourceHead,
    sourceStateHash: authorization.sourceStateHash,
    permissionProfileHash: authorization.permissionProfileHash,
    providerScopeHash: authorization.providerScopeHash,
    policyHash: authorization.policyHash,
  };
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function hashJson(value: unknown): string {
  return sha256(JSON.stringify(value));
}
