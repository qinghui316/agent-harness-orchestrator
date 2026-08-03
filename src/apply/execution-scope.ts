import { createHash } from "node:crypto";
import { join } from "node:path";
import { projectHarnessPlanningStartManifestHash, readProjectHarnessPlanningGate } from "../project-harness/planning-gate-query.js";
import { projectHarnessConversationLane, resolveProjectHarnessRegistryContext } from "../project-harness/registry.js";
import { projectHarnessSharedWriterRoot } from "../project-harness/writer-lock.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { createProjectRuntimePlanningEvidencePorts } from "../project-runtime/planning-publication.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import {
  projectExecutionRuntimePort,
  projectHarnessExecutionPort,
  type ProjectCodeExecutionRuntimePort,
  type ProjectHarnessExecutionPort,
} from "../project-runtime/execution-ports.js";
import { getGitCommit, getGitStatusShort } from "../project/git.js";
import type { LocalExecutionAuthorization, ManagedProject } from "../types/index.js";
import { getWorktreeStatus } from "../worktree/status.js";
import { hashWorkflowGraphPlan } from "../workflow-artifacts/hashes.js";
import { readExecutionAuthorization } from "../workflow-runtime/execution-authorization.js";
import { openProjectRuntimeWorkbenchDatabase } from "../workbench/persistence/open-workbench-database.js";
import type { HighImpactApprovalScope } from "../workflow-actions/high-impact-approval.js";
import { evaluateSkillNativeApplyGate, worktreeApplyManifestHash } from "./gate.js";

export interface ProjectApplyExecutionScope {
  runtime: ProjectCodeExecutionRuntimePort;
  harness: ProjectHarnessExecutionPort;
  authorization: LocalExecutionAuthorization;
  conversationId: string;
  graphScopeId: string;
  evidenceDigest: string;
  writerRoot: string;
}

export async function resolveProjectApplyExecutionScope(
  project: ManagedProject,
  worktreeId: string,
): Promise<ProjectApplyExecutionScope> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") {
    throw new Error(`Project Harness is not ready for apply/discard: ${state.state}.`);
  }
  const resolution = state.resolution;
  if (project.id !== resolution.harness.projectId || project.path !== resolution.projectRoot) {
    throw new Error("Apply/discard project identity is stale.");
  }
  const runtime = projectExecutionRuntimePort(project, resolution);
  const worktree = await getWorktreeStatus(runtime, worktreeId);
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  let conversation;
  try {
    conversation = store.conversations.findConversationForChange(resolution.harness.projectId, worktree.changeId);
  } finally {
    store.close();
  }
  if (!conversation
    || conversation.state !== "active"
    || conversation.boundChangeId !== worktree.changeId
    || !conversation.currentGraphScopeId) {
    throw new Error("Apply/discard cannot resolve the active Change conversation and graph scope.");
  }
  const planning = await readProjectHarnessPlanningGate({
    projectId: resolution.harness.projectId,
    projectRoot: resolution.projectRoot,
    skillRoot: resolution.harness.skillRoot,
    conversationId: conversation.conversationId,
    graphScopeId: conversation.currentGraphScopeId,
    changeId: worktree.changeId,
  });
  const intent = planning.authorizationIntent;
  const evidenceDigest = projectHarnessPlanningStartManifestHash(planning, resolution.harness.contentFingerprint);
  if (intent.status !== "issued"
    || !intent.authorizationId
    || intent.projectHarnessContentFingerprint !== resolution.harness.contentFingerprint
    || intent.startManifestHash !== evidenceDigest) {
    throw new Error("Apply/discard Project Harness, Registry, or authorization evidence drifted.");
  }
  const authorization = await readExecutionAuthorization(runtime, intent.authorizationId);
  const [sourceHead, sourceStatus] = await Promise.all([
    getGitCommit(project.path),
    getGitStatusShort(project.path),
  ]);
  if (!sourceHead
    || authorization.status !== "active"
    || Date.parse(authorization.expiresAt) <= Date.now()
    || authorization.projectId !== resolution.harness.projectId
    || authorization.changeId !== worktree.changeId
    || authorization.conversationId !== conversation.conversationId
    || authorization.acceptedPlanId !== intent.proposalId
    || authorization.acceptedPlanHash !== intent.proposalHash
    || authorization.graphId !== planning.graph.id
    || authorization.graphHash !== hashWorkflowGraphPlan(planning.graph)
    || authorization.artifactManifestHash !== hashJson(planning.graph.sourceArtifactHashes)
    || authorization.sourceHead !== sourceHead
    || authorization.sourceStateHash !== hashJson(sourceStatus)
    || !authorization.targets.some((target) => target.transition === "workflow.run.start"
      && target.targetId === planning.graph.id
      && target.manifestHash === evidenceDigest)) {
    throw new Error("Apply/discard execution authorization lineage is stale.");
  }
  const registry = await resolveProjectHarnessRegistryContext({
    projectId: resolution.harness.projectId,
    projectRoot: resolution.projectRoot,
    skillRoot: resolution.harness.skillRoot,
  });
  const preflight = await createProjectRuntimePlanningEvidencePorts(resolution).preflight.evaluate({
    ...registry,
    lane: projectHarnessConversationLane(conversation.conversationId, conversation.currentGraphScopeId),
  }, worktree.changeId);
  if (preflight.action !== "continue") {
    throw new Error("Apply/discard scoped preflight is stale or blocked.");
  }
  const evidenceRoot = join(resolution.harness.skillRoot, "state", "changes", "active", worktree.changeId);
  return {
    runtime,
    harness: await projectHarnessExecutionPort(project, evidenceRoot, planning),
    authorization,
    conversationId: conversation.conversationId,
    graphScopeId: conversation.currentGraphScopeId,
    evidenceDigest,
    writerRoot: projectHarnessSharedWriterRoot(resolution.paths.sidecarRoot),
  };
}

export function projectApplyActionScope(
  scope: ProjectApplyExecutionScope,
  targetManifestHash: string,
): HighImpactApprovalScope {
  return {
    projectId: scope.runtime.projectId,
    changeId: scope.harness.planning.change.change_id,
    conversationId: scope.conversationId,
    graphScopeId: scope.graphScopeId,
    workflowGraphPlanId: scope.harness.planning.graph.id,
    acceptedProposalHash: scope.harness.planning.mainAcceptance.proposalHash,
    authorizationId: scope.authorization.id,
    evidenceDigest: scope.evidenceDigest,
    targetManifestHash,
  };
}

export async function resolveWorktreeApprovalScope(
  project: ManagedProject,
  worktreeId: string,
): Promise<HighImpactApprovalScope> {
  const scope = await resolveProjectApplyExecutionScope(project, worktreeId);
  const gate = await evaluateSkillNativeApplyGate(project, scope.runtime, scope.harness, worktreeId);
  if (!gate.ready) {
    throw new Error(`Cannot authorize worktree transition:\n${gate.blockingIssues.map((issue) => `- ${issue}`).join("\n")}`);
  }
  return projectApplyActionScope(scope, worktreeApplyManifestHash(gate));
}

export function assertApplyActionScope(current: HighImpactApprovalScope, expected: HighImpactApprovalScope | undefined): void {
  if (!expected || JSON.stringify(expected) !== JSON.stringify(current)) {
    throw new Error("Apply/discard action scope is stale or incomplete.");
  }
}

export function executionAuthorizationSnapshot(authorization: LocalExecutionAuthorization) {
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

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
