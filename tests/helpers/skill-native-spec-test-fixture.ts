import { createHash } from "node:crypto";
import { join } from "node:path";
import { writeJsonFile } from "../../src/fs/json.js";
import { projectHarnessPlanningStartManifestHash, readProjectHarnessPlanningGate } from "../../src/project-harness/planning-gate-query.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../src/provider-runtime/project-harness-discovery.js";
import { getGitCommit, getGitStatusShort } from "../../src/project/git.js";
import { resolveProjectRuntimeState } from "../../src/project-runtime/coordinator.js";
import type { ProjectRuntimeResolution } from "../../src/project-runtime/context.js";
import { projectExecutionRuntimePort } from "../../src/project-runtime/execution-ports.js";
import { publishProjectRuntimePlanningPackage } from "../../src/project-runtime/planning-publication.js";
import type { ProviderCapabilitySnapshot } from "../../src/provider-runtime/index.js";
import type { ManagedProject } from "../../src/types/index.js";
import { bindProviderAttemptThread, startProviderAttempt } from "../../src/workbench/provider-attempts.js";
import { hashWorkflowGraphPlan } from "../../src/workflow-artifacts/hashes.js";
import { issueLocalExecutionAuthorization } from "../../src/workflow-runtime/execution-authorization.js";
import { createConversationChangeFixture } from "./conversation-change-fixture.js";
import { createReadyProjectHarnessFixture } from "./project-harness-fixture.js";

export interface SkillNativeSpecTestFixture {
  project: ManagedProject;
  resolution: ProjectRuntimeResolution;
  changeId: string;
  conversationId: string;
  graphScopeId: string;
  evidenceRoot: string;
  authorizationId: string;
}

export async function prepareSkillNativeSpecTestFixture(input: {
  projectRoot: string;
  ahoHome: string;
  projectId?: string;
  projectName?: string;
  title?: string;
}): Promise<SkillNativeSpecTestFixture> {
  const harness = await createReadyProjectHarnessFixture({
    projectRoot: input.projectRoot,
    ahoHome: input.ahoHome,
    projectId: input.projectId ?? "spec-test-project",
    projectName: input.projectName ?? "Spec Test Project",
  });
  const topic = await createConversationChangeFixture(harness.project, {
    title: input.title ?? "Skill Native Spec Test",
    body: "Map acceptance criteria to exact test evidence through the project Harness.",
  });
  const graphScopeId = `graph:${topic.conversationId}`;
  const specMd = [
    "# Spec",
    "",
    "## Acceptance Criteria",
    "",
    "- AC-001: The exact project behavior has test evidence.",
    "- AC-002: The secondary behavior remains explicit.",
    "",
  ].join("\n");
  const workflow = {
    version: "1.0" as const,
    mode: "sequential-v1" as const,
    nodes: [{
      id: "spec-test-evidence",
      title: "Prepare test evidence",
      taskIds: ["T-001"],
      acIds: ["AC-001", "AC-002"],
      prompt: "Objective: prepare exact test evidence. Required behavior: change tests only. Constraints: preserve project Harness ownership. Expected evidence: test-only diff.",
      dependsOn: [],
      sourceScopes: ["tests/**"],
    }],
  };
  const planMd = [
    "# Plan",
    "",
    "Prepare exact test evidence in an isolated worktree.",
    "",
    "## Workflow",
    "",
    "```json",
    JSON.stringify(workflow, null, 2),
    "```",
    "",
  ].join("\n");
  const tasksMd = [
    "# Tasks",
    "",
    "- [ ] T-001: Prepare test evidence.",
    "  - Covers: AC-001, AC-002",
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
      validation: ["Fixture Main accepted the exact Spec-Test plan."],
    },
  }, {
    hasCommit: (transactionId) => transactionIds.has(transactionId),
    commit: ({ transactionId }) => { transactionIds.add(transactionId); },
    deleteCommit: (transactionId) => { transactionIds.delete(transactionId); },
  }, () => graphScopeId);

  const resolution = await resolveReady(harness.project, input.ahoHome);
  const runtime = projectExecutionRuntimePort(harness.project, resolution);
  const mainAttemptId = `attempt-main-${topic.conversationId}`;
  const mainThreadId = `fixture-main-${topic.conversationId}`;
  await startProviderAttempt(runtime, {
    attemptId: mainAttemptId,
    providerId: "codex",
    capabilitySnapshot: { providerId: "codex", effectiveModel: null } as unknown as ProviderCapabilitySnapshot,
    operationProfile: "main",
    roleId: "main-agent",
    handoffHash: sha256(`fixture-main-handoff:${topic.conversationId}`),
    conversationId: topic.conversationId,
    changeId: accepted.changeId,
    graphScopeId,
  });
  await bindProviderAttemptThread(runtime, {
    attemptId: mainAttemptId,
    threadId: mainThreadId,
    parentThreadId: null,
    parentAgentSurfaceId: null,
  });
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
    throw new Error(`Skill-native Spec-Test fixture requires a clean Git source: ${sourceStatus.join(", ")}`);
  }
  const authorization = await issueLocalExecutionAuthorization(runtime, {
    projectId: resolution.harness.projectId,
    changeId: accepted.changeId,
    conversationId: topic.conversationId,
    providerThreadId: mainThreadId,
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
    targets: [{ transition: "workflow.run.start", targetId: accepted.workflowGraphPlan.id, manifestHash: evidenceDigest }],
    budget: { maxCompletedOperations: 16, maxReworks: 1, maxChangedFiles: 100, maxChangedBytes: 10 * 1024 * 1024 },
    userDecision: { decisionId: `fixture-execute:${topic.conversationId}`, actorId: "workbench-user", decidedAt: new Date().toISOString() },
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
  });
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
  return {
    project: harness.project,
    resolution,
    changeId: accepted.changeId,
    conversationId: topic.conversationId,
    graphScopeId,
    evidenceRoot,
    authorizationId: authorization.id,
  };
}

async function resolveReady(project: ManagedProject, ahoHome: string): Promise<ProjectRuntimeResolution> {
  const state = await resolveProjectRuntimeState(project, {
    ahoHome,
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") throw new Error(`Expected ready project Runtime; found ${state.state}.`);
  return state.resolution;
}

function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashJson(value: unknown): string {
  return sha256(JSON.stringify(value));
}
