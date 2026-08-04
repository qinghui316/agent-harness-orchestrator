import type { ProjectHarnessAgentIdentity } from "../../project-harness/agent-input.js";
import { resolveProjectHarnessAgentInput } from "../../project-harness/agent-input.js";
import { listProjectHarnessChanges, resolveProjectHarnessChangeEvidenceRoot } from "../../project-harness/change.js";
import type { ProviderSkillInput } from "../../project-harness/contracts.js";
import {
  projectHarnessPlanningStartManifestHash,
  readProjectHarnessPlanningGate,
  type ProjectHarnessPlanningGateEvidence,
} from "../../project-harness/planning-gate-query.js";
import { projectHarnessSharedWriterRoot } from "../../project-harness/writer-lock.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../../project-runtime/coordinator.js";
import {
  projectExecutionRuntimePort,
  projectHarnessExecutionPort,
  type ProjectCodeExecutionRuntimePort,
} from "../../project-runtime/execution-ports.js";
import type { AcceptanceCriterion, ChangeStatus, LocalExecutionAuthorization, ManagedProject } from "../../types/index.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../workbench/persistence/open-workbench-database.js";
import { readExecutionAuthorization } from "../../workflow-runtime/execution-authorization.js";

export interface SpecTestContext {
  projectId: string;
  projectRoot: string;
  changeId: string;
  conversationId: string;
  graphScopeId: string;
  evidenceRoot: string;
  criteria: AcceptanceCriterion[];
  changeStatus: ChangeStatus;
  runtime: ProjectCodeExecutionRuntimePort;
  writerRoot: string;
  projectHarness: ProjectHarnessAgentIdentity;
  providerSkillInput: ProviderSkillInput;
  planning: ProjectHarnessPlanningGateEvidence;
  planningEvidenceDigest: string;
}

export async function getActiveSpecTestContext(project: ManagedProject): Promise<SpecTestContext> {
  const state = await requireReadyProjectRuntime(project);
  const active = (await listProjectHarnessChanges(state.resolution.harness.skillRoot))
    .filter((change) => change.status === "active");
  if (active.length !== 1) {
    throw new Error(`Expected exactly one active change; found ${active.length}.`);
  }
  return resolveSpecTestContext(project, state, active[0]!.change_id);
}

export async function getSpecTestContextForChange(project: ManagedProject, changeId: string): Promise<SpecTestContext> {
  const state = await requireReadyProjectRuntime(project);
  return resolveSpecTestContext(project, state, changeId);
}

export async function requireActiveSpecTestExecutionAuthorization(
  context: SpecTestContext,
  now = new Date(),
): Promise<LocalExecutionAuthorization> {
  const intent = context.planning.authorizationIntent;
  if (intent.status !== "issued" || !intent.authorizationId) {
    throw new Error("Spec-Test execution authorization is not active.");
  }
  const authorization = await readExecutionAuthorization(context.runtime, intent.authorizationId);
  if (authorization.id !== intent.authorizationId
    || authorization.projectId !== context.projectId
    || authorization.changeId !== context.changeId
    || authorization.conversationId !== context.conversationId
    || authorization.acceptedPlanId !== context.planning.mainAcceptance.proposalId
    || authorization.acceptedPlanHash !== context.planning.mainAcceptance.proposalHash
    || authorization.graphId !== context.planning.graph.id
    || authorization.status !== "active"
    || Date.parse(authorization.expiresAt) <= now.getTime()) {
    throw new Error("Spec-Test execution authorization is not active.");
  }
  return authorization;
}

async function resolveSpecTestContext(
  project: ManagedProject,
  state: Extract<Awaited<ReturnType<typeof resolveProjectRuntimeState>>, { state: "ready" }>,
  changeId: string,
): Promise<SpecTestContext> {
  const { resolution } = state;
  const database = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  let conversation;
  try {
    conversation = database.conversations.findConversationForChange(resolution.harness.projectId, changeId);
  } finally {
    database.close();
  }
  if (!conversation
    || conversation.projectId !== resolution.harness.projectId
    || conversation.boundChangeId !== changeId
    || !conversation.currentGraphScopeId
    || conversation.state !== "active") {
    throw new Error(`Active Conversation and graph scope not found for scoped spec-test context: ${changeId}.`);
  }

  const planning = await readProjectHarnessPlanningGate({
    projectId: resolution.harness.projectId,
    projectRoot: resolution.projectRoot,
    skillRoot: resolution.harness.skillRoot,
    conversationId: conversation.conversationId,
    graphScopeId: conversation.currentGraphScopeId,
    changeId,
  });
  const evidenceRoot = await resolveProjectHarnessChangeEvidenceRoot(
    resolution.harness.skillRoot,
    "active",
    changeId,
  );
  const harness = await projectHarnessExecutionPort(project, evidenceRoot, planning);
  const agentInput = await resolveProjectHarnessAgentInput(project, DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY);
  if (agentInput.identity.contentFingerprint !== resolution.harness.contentFingerprint) {
    throw new Error("Project Harness fingerprint changed while resolving the Spec-Test scope.");
  }
  return {
    projectId: resolution.harness.projectId,
    projectRoot: resolution.projectRoot,
    changeId,
    conversationId: conversation.conversationId,
    graphScopeId: conversation.currentGraphScopeId,
    evidenceRoot,
    criteria: harness.changeStatus.acMap?.acceptanceCriteria ?? [],
    changeStatus: harness.changeStatus,
    runtime: projectExecutionRuntimePort(project, resolution),
    writerRoot: projectHarnessSharedWriterRoot(resolution.paths.sidecarRoot),
    projectHarness: agentInput.identity,
    providerSkillInput: agentInput.providerSkillInput,
    planning,
    planningEvidenceDigest: projectHarnessPlanningStartManifestHash(
      planning,
      agentInput.identity.contentFingerprint,
    ),
  };
}

async function requireReadyProjectRuntime(project: ManagedProject) {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") {
    throw new Error(`Project Harness is not ready for Spec-Test: ${state.state}.`);
  }
  return state;
}
