import { createHash } from "node:crypto";
import { join } from "node:path";
import { getGitCommit, getGitStatusShort } from "../project/git.js";
import {
  projectHarnessPlanningStartManifestHash,
  readProjectHarnessPlanningGate,
  type ProjectHarnessPlanningGateEvidence,
} from "../project-harness/planning-gate-query.js";
import {
  projectHarnessConversationLane,
  resolveProjectHarnessRegistryContext,
} from "../project-harness/registry.js";
import {
  projectHarnessSharedWriterRoot,
  withProjectHarnessWriterLock,
} from "../project-harness/writer-lock.js";
import { listTaskQueueItems, listTaskQueues } from "../task-queue/manager.js";
import { listTaskRuns, listWorkerLeases } from "../task-run/manager.js";
import type {
  LocalExecutionAuthorization,
  ManagedProject,
  TransitionExecution,
  WorkflowGraphPlan,
} from "../types/index.js";
import { openProjectRuntimeWorkbenchDatabase } from "../workbench/persistence/open-workbench-database.js";
import { listWorkflowRuns } from "../workflow-run/manager.js";
import { hashWorkflowGraphPlan } from "../workflow-artifacts/hashes.js";
import { listSkillNativeSchedulerRuns } from "../workflow-runtime/skill-native-ready-set.js";
import {
  claimTransitionExecution,
  markTransitionExecutionStarted,
  readExecutionAuthorization,
  readTransitionExecution,
  reconcileCommittedTransitionExecution,
  recordTransitionExecutionTerminal,
  reserveTransitionExecutionCommitPoint,
} from "../workflow-runtime/execution-authorization.js";
import type { ProjectRuntimeResolution } from "./context.js";
import type { ProjectRunsPathPort } from "./paths.js";
import { createProjectRuntimePlanningEvidencePorts } from "./planning-publication.js";

export interface SkillNativeWorkflowStartGate {
  project: ManagedProject;
  runs: ProjectRunsPathPort;
  changeId: string;
  conversationId: string;
  graphScopeId: string;
  graph: WorkflowGraphPlan;
  evidence: ProjectHarnessPlanningGateEvidence;
  authorization: LocalExecutionAuthorization;
  execution: TransitionExecution;
  evidenceRoot: string;
}

export interface SkillNativeWorkflowInitialization<T> {
  value: T;
  evidenceRefs: string[];
  rollback(): Promise<void>;
}

export async function withSkillNativeWorkflowStart<T>(
  project: ManagedProject,
  resolution: ProjectRuntimeResolution,
  input: {
    changeId: string;
    graphScopeId?: string;
    workflowGraphPlanId: string;
  },
  initialize: (gate: SkillNativeWorkflowStartGate) => Promise<SkillNativeWorkflowInitialization<T>>,
): Promise<T> {
  return withProjectHarnessWriterLock(projectHarnessSharedWriterRoot(resolution.paths.sidecarRoot), {
    projectId: resolution.harness.projectId,
    ownerId: `workflow-start-${input.changeId}`,
    operation: "workflow-start",
  }, async (lock) => {
    const gate = await validateAndClaimWorkflowStart(project, resolution, input);
    await lock.assertCurrent();
    let initialized: SkillNativeWorkflowInitialization<T> | null = null;
    try {
      initialized = await initialize(gate);
      await lock.assertCurrent();
      await reserveTransitionExecutionCommitPoint(resolution.paths, executionLineage(gate));
      await recordTransitionExecutionTerminal(resolution.paths, {
        operationId: gate.execution.operationId,
        claimToken: gate.execution.claimToken,
        fencingToken: gate.execution.fencingToken,
        outcome: "completed",
        evidenceRefs: initialized.evidenceRefs,
      });
      return initialized.value;
    } catch (error) {
      const current = await readTransitionExecution(resolution.paths, gate.execution.operationId).catch(() => gate.execution);
      if (current.commitPointReservedAt) {
        await reconcileCommittedTransitionExecution(resolution.paths, {
          ...executionLineage({ ...gate, execution: current }),
          evidenceRefs: initialized?.evidenceRefs ?? [],
        });
        if (initialized) return initialized.value;
        throw error;
      }
      if (initialized) await initialized.rollback().catch(() => undefined);
      await recordTransitionExecutionTerminal(resolution.paths, {
        operationId: current.operationId,
        claimToken: current.claimToken,
        fencingToken: current.fencingToken,
        outcome: "retryable-failed",
        error: error instanceof Error ? error.message : String(error),
      }).catch(() => undefined);
      throw error;
    }
  });
}

async function validateAndClaimWorkflowStart(
  project: ManagedProject,
  resolution: ProjectRuntimeResolution,
  input: { changeId: string; graphScopeId?: string; workflowGraphPlanId: string },
): Promise<SkillNativeWorkflowStartGate> {
  if (project.id !== resolution.harness.projectId || project.path !== resolution.projectRoot) {
    throw new Error("workflow.run.start project identity is stale.");
  }
  const conversation = await currentConversationForChange(resolution, input.changeId);
  if (!input.graphScopeId || conversation.currentGraphScopeId !== input.graphScopeId) {
    throw new Error("workflow.run.start conversation graph scope is stale.");
  }
  const evidence = await readProjectHarnessPlanningGate({
    projectId: resolution.harness.projectId,
    projectRoot: resolution.projectRoot,
    skillRoot: resolution.harness.skillRoot,
    conversationId: conversation.conversationId,
    graphScopeId: input.graphScopeId,
    changeId: input.changeId,
  });
  if (evidence.graph.id !== input.workflowGraphPlanId) {
    throw new Error("workflow.run.start authored graph target is stale.");
  }
  const intent = evidence.authorizationIntent;
  if (intent.status !== "issued"
    || !intent.authorizationId
    || intent.projectHarnessContentFingerprint !== resolution.harness.contentFingerprint
    || !intent.startManifestHash) {
    throw new Error("workflow.run.start authorization intent is stale or incomplete.");
  }
  const startManifestHash = projectHarnessPlanningStartManifestHash(
    evidence,
    resolution.harness.contentFingerprint,
  );
  if (intent.startManifestHash !== startManifestHash) {
    throw new Error("workflow.run.start project Harness or Registry evidence drifted.");
  }
  const authorization = await readExecutionAuthorization(resolution.paths, intent.authorizationId);
  await assertAuthorizationCurrent(project, resolution, evidence, authorization, startManifestHash);
  await assertNoExecutionState(resolution.paths, input.changeId);
  const registry = await resolveProjectHarnessRegistryContext({
    projectId: resolution.harness.projectId,
    projectRoot: resolution.projectRoot,
    skillRoot: resolution.harness.skillRoot,
  });
  const preflight = await createProjectRuntimePlanningEvidencePorts(resolution).preflight.evaluate({
    ...registry,
    lane: projectHarnessConversationLane(conversation.conversationId, input.graphScopeId),
  }, input.changeId);
  if (preflight.action !== "continue") {
    throw new Error("workflow.run.start scoped preflight is stale or blocked.");
  }
  const claimed = await claimTransitionExecution(resolution.paths, {
    authorizationId: authorization.id,
    authorizationEpoch: authorization.epoch,
    transition: "workflow.run.start",
    targetId: evidence.graph.id,
    manifestHash: startManifestHash,
    snapshot: authorizationSnapshot(authorization),
    claimedBy: `workbench:${conversation.conversationId}:${input.graphScopeId}`,
  });
  const execution = await markTransitionExecutionStarted(
    resolution.paths,
    claimed.operationId,
    claimed.claimToken,
    claimed.fencingToken,
  );
  return {
    project,
    runs: resolution.paths,
    changeId: input.changeId,
    conversationId: conversation.conversationId,
    graphScopeId: input.graphScopeId,
    graph: evidence.graph,
    evidence,
    authorization,
    execution,
    evidenceRoot: join(resolution.harness.skillRoot, "state", "changes", "active", input.changeId),
  };
}

async function assertAuthorizationCurrent(
  project: ManagedProject,
  resolution: ProjectRuntimeResolution,
  evidence: ProjectHarnessPlanningGateEvidence,
  authorization: LocalExecutionAuthorization,
  startManifestHash: string,
): Promise<void> {
  const [sourceHead, sourceStatus] = await Promise.all([
    getGitCommit(project.path),
    getGitStatusShort(project.path),
  ]);
  if (!sourceHead
    || authorization.status !== "active"
    || authorization.projectId !== resolution.harness.projectId
    || authorization.changeId !== evidence.change.change_id
    || authorization.conversationId !== evidence.authorizationIntent.conversationId
    || authorization.acceptedPlanId !== evidence.authorizationIntent.proposalId
    || authorization.acceptedPlanHash !== evidence.authorizationIntent.proposalHash
    || authorization.graphId !== evidence.graph.id
    || authorization.graphHash !== hashWorkflowGraphPlan(evidence.graph)
    || authorization.artifactManifestHash !== hashJson(evidence.graph.sourceArtifactHashes)
    || authorization.sourceHead !== sourceHead
    || authorization.sourceStateHash !== hashJson(sourceStatus)
    || !authorization.targets.some((target) => target.transition === "workflow.run.start"
      && target.targetId === evidence.graph.id
      && target.manifestHash === startManifestHash)) {
    throw new Error("workflow.run.start execution authorization lineage is stale.");
  }
}

async function assertNoExecutionState(runs: ProjectRunsPathPort, changeId: string): Promise<void> {
  const [workflowRuns, taskQueues, taskQueueItems, taskRuns, workerLeases, schedulerRuns] = await Promise.all([
    listWorkflowRuns(runs, changeId),
    listTaskQueues(runs, changeId),
    listTaskQueueItems(runs, changeId),
    listTaskRuns(runs, changeId),
    listWorkerLeases(runs, changeId),
    listSkillNativeSchedulerRuns(runs, changeId),
  ]);
  if (workflowRuns.length || taskQueues.length || taskQueueItems.length || taskRuns.length || workerLeases.length || schedulerRuns.length) {
    throw new Error("workflow.run.start has already initialized execution state for this Change.");
  }
}

async function currentConversationForChange(resolution: ProjectRuntimeResolution, changeId: string) {
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  try {
    const conversation = store.conversations.findConversationForChange(
      resolution.harness.projectId,
      changeId,
    );
    if (!conversation || conversation.boundChangeId !== changeId || conversation.state !== "active") {
      throw new Error("workflow.run.start cannot resolve the active Change conversation.");
    }
    return conversation;
  } finally {
    store.close();
  }
}

function authorizationSnapshot(authorization: LocalExecutionAuthorization) {
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

function executionLineage(gate: SkillNativeWorkflowStartGate) {
  return {
    operationId: gate.execution.operationId,
    authorizationId: gate.execution.authorizationId,
    authorizationEpoch: gate.execution.authorizationEpoch,
    transition: gate.execution.transition,
    targetId: gate.execution.targetId,
    manifestHash: gate.execution.manifestHash,
    claimToken: gate.execution.claimToken,
    fencingToken: gate.execution.fencingToken,
  };
}

function hashJson(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
