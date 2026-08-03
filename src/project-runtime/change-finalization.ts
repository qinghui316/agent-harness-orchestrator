import { createHash } from "node:crypto";
import { join } from "node:path";
import { getLatestAuditSummary } from "../audit/artifacts.js";
import { validateProjectHarnessChangeEvidence } from "../project-harness/change-evidence.js";
import { closeProjectHarnessChange } from "../project-harness/change.js";
import { readProjectHarnessPlanningGate } from "../project-harness/planning-gate-query.js";
import {
  projectHarnessConversationLane,
  resolveProjectHarnessRegistryContext,
} from "../project-harness/registry.js";
import { SourceFingerprintSnapshot } from "../project-harness/source-fingerprint.js";
import {
  projectHarnessSharedWriterRoot,
  withProjectHarnessWriterLock,
} from "../project-harness/writer-lock.js";
import { getGitCommit, getGitStatusShort } from "../project/git.js";
import type { LocalExecutionAuthorization, ManagedProject, TransitionExecution } from "../types/index.js";
import { getLatestValidationSummary } from "../validation/artifacts.js";
import { listWorktreesForChange } from "../worktree/manager.js";
import { hashWorkflowGraphPlan } from "../workflow-artifacts/hashes.js";
import {
  claimTransitionExecution,
  markTransitionExecutionStarted,
  readExecutionAuthorization,
  readTransitionExecution,
  reconcileCommittedTransitionExecution,
  recordTransitionExecutionTerminal,
  reserveTransitionExecutionCommitPoint,
} from "../workflow-runtime/execution-authorization.js";
import { openProjectRuntimeWorkbenchDatabase } from "../workbench/persistence/open-workbench-database.js";
import type { StoredDecisionRecord } from "../workbench/persistence/contracts.js";
import type { ProjectRuntimeResolution } from "./context.js";

export interface ProjectHarnessChangeFinalizationInput {
  changeId: string;
  conversationId: string;
  graphScopeId: string;
  mainAttemptId: string;
  providerThreadId: string;
  turnId: string;
}

export interface ProjectHarnessChangeFinalizationResult {
  changeId: string;
  requestId: string;
  authorizationId: string;
  operationId: string;
  archivePath: string;
}

export interface ProjectHarnessChangeFinalizationConfirmationInput {
  changeId: string;
  finalizationRequestId: string;
}

export interface ProjectHarnessChangeFinalizationRequest {
  version: "1.0";
  id: string;
  projectId: string;
  changeId: string;
  conversationId: string;
  graphScopeId: string;
  mainAttemptId: string;
  providerThreadId: string;
  turnId: string;
  authorizationId: string;
  authorizationEpoch: number;
  manifestHash: string;
  skillContentFingerprint: string;
  status: "pending" | "completed";
  createdAt: string;
  completedAt: string | null;
}

interface FinalizationReadiness {
  authorization: LocalExecutionAuthorization;
  manifestHash: string;
  sourceHead: string;
  validationId: string;
  auditId: string;
  evidenceRoot: string;
}

export async function requestSkillNativeProjectHarnessChangeFinalization(
  project: ManagedProject,
  resolution: ProjectRuntimeResolution,
  input: ProjectHarnessChangeFinalizationInput,
): Promise<ProjectHarnessChangeFinalizationRequest> {
  assertProjectIdentity(project, resolution);
  return withProjectHarnessWriterLock(projectHarnessSharedWriterRoot(resolution.paths.sidecarRoot), {
    projectId: resolution.harness.projectId,
    ownerId: `change-finalize-request-${input.changeId}`,
    operation: "change-finalize",
  }, async (lock) => {
    const readiness = await assertSkillNativeChangeFinalizationReady(project, resolution, input);
    const requestId = finalizationRequestId(resolution.harness.projectId, input, readiness);
    const now = new Date().toISOString();
    const request: ProjectHarnessChangeFinalizationRequest = {
      version: "1.0",
      id: requestId,
      projectId: resolution.harness.projectId,
      changeId: input.changeId,
      conversationId: input.conversationId,
      graphScopeId: input.graphScopeId,
      mainAttemptId: input.mainAttemptId,
      providerThreadId: input.providerThreadId,
      turnId: input.turnId,
      authorizationId: readiness.authorization.id,
      authorizationEpoch: readiness.authorization.epoch,
      manifestHash: readiness.manifestHash,
      skillContentFingerprint: resolution.harness.contentFingerprint,
      status: "pending",
      createdAt: now,
      completedAt: null,
    };
    await lock.assertCurrent();
    const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
    try {
      store.transaction(() => {
        const existing = store.decisions.listDecisions(resolution.harness.projectId, input.changeId)
          .find((candidate) => candidate.decisionType === FINALIZATION_DECISION_TYPE && candidate.status === "pending");
        if (existing) throw new Error("A Change finalization request is already pending human confirmation.");
        store.decisions.upsertDecision(finalizationDecisionRecord(request));
      });
    } finally {
      store.close();
    }
    return request;
  });
}

export async function listPendingSkillNativeProjectHarnessChangeFinalizations(
  resolution: ProjectRuntimeResolution,
  changeId: string,
): Promise<ProjectHarnessChangeFinalizationRequest[]> {
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  try {
    const pending = store.decisions.listDecisions(resolution.harness.projectId, changeId)
      .filter((candidate) => candidate.decisionType === FINALIZATION_DECISION_TYPE && candidate.status === "pending")
      .map(parseFinalizationDecision);
    if (pending.length > 1) throw new Error("Multiple pending Change finalization requests violate the one-time confirmation contract.");
    return pending;
  } finally {
    store.close();
  }
}

export async function finalizeSkillNativeProjectHarnessChange(
  project: ManagedProject,
  resolution: ProjectRuntimeResolution,
  input: ProjectHarnessChangeFinalizationConfirmationInput,
): Promise<ProjectHarnessChangeFinalizationResult> {
  assertProjectIdentity(project, resolution);
  return withProjectHarnessWriterLock(projectHarnessSharedWriterRoot(resolution.paths.sidecarRoot), {
    projectId: resolution.harness.projectId,
    ownerId: `change-finalize-${input.changeId}`,
    operation: "change-finalize",
  }, async (lock) => {
    const requestRecord = await readFinalizationDecision(resolution, input.changeId, input.finalizationRequestId);
    if (requestRecord.status !== "pending") throw new Error("This Change finalization request has already been consumed.");
    const request = parseFinalizationDecision(requestRecord);
    const readiness = await assertSkillNativeChangeFinalizationReady(project, resolution, request, ["running", "completed"]);
    if (request.projectId !== resolution.harness.projectId
      || request.authorizationId !== readiness.authorization.id
      || request.authorizationEpoch !== readiness.authorization.epoch
      || request.manifestHash !== readiness.manifestHash
      || request.skillContentFingerprint !== resolution.harness.contentFingerprint) {
      throw new Error("Change finalization request lineage is stale or forged.");
    }
    await lock.assertCurrent();
    let execution: TransitionExecution | null = null;
    let archivePath: string | null = null;
    try {
      const claimed = await claimTransitionExecution(resolution.paths, {
        authorizationId: readiness.authorization.id,
        authorizationEpoch: readiness.authorization.epoch,
        transition: "change.finalize",
        targetId: input.changeId,
        manifestHash: readiness.manifestHash,
        snapshot: authorizationSnapshot(readiness.authorization),
        claimedBy: `human-confirmation:${request.conversationId}:${request.graphScopeId}:${request.providerThreadId}`,
      });
      execution = await markTransitionExecutionStarted(
        resolution.paths,
        claimed.operationId,
        claimed.claimToken,
        claimed.fencingToken,
      );
      execution = await reserveTransitionExecutionCommitPoint(resolution.paths, executionLineage(execution));
      const registry = await resolveProjectHarnessRegistryContext({
        projectId: resolution.harness.projectId,
        projectRoot: resolution.projectRoot,
        skillRoot: resolution.harness.skillRoot,
      });
      const snapshot = new SourceFingerprintSnapshot({ projectRoot: resolution.projectRoot });
      const closed = await closeProjectHarnessChange({
        ...registry,
        lane: projectHarnessConversationLane(request.conversationId, request.graphScopeId),
      }, {
        changeId: input.changeId,
        status: "completed",
        completionCommit: readiness.sourceHead,
        validation: [
          `Validation ${readiness.validationId} passed for the applied result.`,
          `Audit ${readiness.auditId} approved the same applied result.`,
        ],
        validationPassed: true,
        sourceSnapshot: { fingerprintSources: (sources) => snapshot.fingerprints(sources) },
      });
      archivePath = `state/changes/archive/${closed.change.change_id}`;
      await lock.assertCurrent();
      await recordTransitionExecutionTerminal(resolution.paths, {
        operationId: execution.operationId,
        claimToken: execution.claimToken,
        fencingToken: execution.fencingToken,
        outcome: "completed",
        evidenceRefs: [archivePath],
      });
      await completeFinalizationDecision(resolution, request);
      return {
        changeId: input.changeId,
        requestId: request.id,
        authorizationId: readiness.authorization.id,
        operationId: execution.operationId,
        archivePath,
      };
    } catch (error) {
      if (execution && archivePath) {
        const current = await readTransitionExecution(resolution.paths, execution.operationId).catch(() => execution!);
        await reconcileCommittedTransitionExecution(resolution.paths, {
          ...executionLineage(current),
          evidenceRefs: [archivePath],
        });
        await completeFinalizationDecision(resolution, request);
        return {
          changeId: input.changeId,
          requestId: request.id,
          authorizationId: readiness.authorization.id,
          operationId: execution.operationId,
          archivePath,
        };
      }
      if (execution) {
        await recordTransitionExecutionTerminal(resolution.paths, {
          operationId: execution.operationId,
          claimToken: execution.claimToken,
          fencingToken: execution.fencingToken,
          outcome: execution.commitPointReservedAt ? "terminal-failed" : "retryable-failed",
          error: error instanceof Error ? error.message : String(error),
        }).catch(() => undefined);
      }
      throw error;
    }
  });
}

export async function assertSkillNativeChangeFinalizationReady(
  project: ManagedProject,
  resolution: ProjectRuntimeResolution,
  input: ProjectHarnessChangeFinalizationInput,
  allowedAttemptStatuses: Array<"running" | "completed"> = ["running"],
): Promise<FinalizationReadiness> {
  assertProjectIdentity(project, resolution);
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  try {
    const conversation = store.conversations.readConversation(resolution.harness.projectId, input.conversationId);
    const attempt = store.providerAttempts.readProviderAttempt(resolution.harness.projectId, input.mainAttemptId);
    const thread = store.providerAttempts.readProviderThread(
      resolution.harness.projectId,
      input.conversationId,
      conversation?.selectedProviderId ?? "",
      "main-agent",
    );
    if (!conversation
      || conversation.state !== "active"
      || conversation.boundChangeId !== input.changeId
      || conversation.currentGraphScopeId !== input.graphScopeId
      || !attempt
      || attempt.conversationId !== input.conversationId
      || attempt.graphScopeId !== input.graphScopeId
      || attempt.roleId !== "main-agent"
      || !allowedAttemptStatuses.includes(attempt.status as "running" | "completed")
      || thread?.attemptId !== input.mainAttemptId
      || thread.providerThreadId !== input.providerThreadId) {
      throw new Error("Change finalization requires the exact current Main Agent thread and graph scope.");
    }
  } finally {
    store.close();
  }
  const evidence = await readProjectHarnessPlanningGate({
    projectId: resolution.harness.projectId,
    projectRoot: resolution.projectRoot,
    skillRoot: resolution.harness.skillRoot,
    conversationId: input.conversationId,
    graphScopeId: input.graphScopeId,
    changeId: input.changeId,
  });
  if (!evidence.authorizationIntent.authorizationId) {
    throw new Error("Change finalization requires issued execution authorization evidence.");
  }
  const authorization = await readExecutionAuthorization(
    resolution.paths,
    evidence.authorizationIntent.authorizationId,
  );
  const target = authorization.targets.find((candidate) =>
    candidate.transition === "change.finalize" && candidate.targetId === input.changeId);
  if (!target
    || authorization.status !== "active"
    || authorization.projectId !== resolution.harness.projectId
    || authorization.changeId !== input.changeId
    || authorization.conversationId !== input.conversationId
    || authorization.providerThreadId !== input.providerThreadId
    || authorization.acceptedPlanId !== evidence.authorizationIntent.proposalId
    || authorization.acceptedPlanHash !== evidence.authorizationIntent.proposalHash
    || authorization.graphId !== evidence.graph.id
    || authorization.graphHash !== hashWorkflowGraphPlan(evidence.graph)) {
    throw new Error("Change finalization authorization lineage is stale or forged.");
  }
  const evidenceRoot = join(resolution.harness.skillRoot, "state", "changes", "active", input.changeId);
  const evidenceValidation = await validateProjectHarnessChangeEvidence(evidenceRoot);
  if (!evidenceValidation.valid) {
    throw new Error(`Change finalization evidence is incomplete: ${evidenceValidation.issues.join("; ")}.`);
  }
  const [validation, audit, worktrees, sourceHead, sourceStatus] = await Promise.all([
    getLatestValidationSummary(resolution.paths, input.changeId),
    getLatestAuditSummary(resolution.paths, input.changeId),
    listWorktreesForChange({
      projectId: resolution.harness.projectId,
      projectRoot: resolution.projectRoot,
      worktreeMetadataRoot: resolution.paths.worktreeMetadataRoot,
    }, input.changeId),
    getGitCommit(resolution.projectRoot),
    getGitStatusShort(resolution.projectRoot),
  ]);
  const applied = worktrees.find((worktree) => worktree.status === "applied"
    && worktree.appliedCommit
    && worktree.worktreeDiffHash
    && validation?.status === "passed"
    && validation.worktreeId === worktree.worktreeId
    && validation.worktreeDiffHash === worktree.worktreeDiffHash
    && (audit?.status === "approved" || audit?.status === "approved-with-notes")
    && audit.worktreeId === worktree.worktreeId
    && audit.worktreeDiffHash === worktree.worktreeDiffHash
    && audit.validationId === validation.id);
  if (!validation || !audit || !applied || !sourceHead || sourceHead !== applied.appliedCommit || sourceStatus.length > 0) {
    throw new Error("Change finalization requires passed Validation, approved Audit, applied worktree, and current source HEAD for the same diff.");
  }
  return {
    authorization,
    manifestHash: target.manifestHash,
    sourceHead,
    validationId: validation.id,
    auditId: audit.id,
    evidenceRoot,
  };
}

const FINALIZATION_DECISION_TYPE = "change.finalization-request";

async function readFinalizationDecision(
  resolution: ProjectRuntimeResolution,
  changeId: string,
  requestId: string,
): Promise<StoredDecisionRecord> {
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  try {
    const record = store.decisions.listDecisions(resolution.harness.projectId, changeId)
      .find((candidate) => candidate.id === requestId && candidate.decisionType === FINALIZATION_DECISION_TYPE);
    if (!record) throw new Error("Change finalization request is stale or unavailable.");
    return record;
  } finally {
    store.close();
  }
}

async function completeFinalizationDecision(
  resolution: ProjectRuntimeResolution,
  request: ProjectHarnessChangeFinalizationRequest,
): Promise<void> {
  const completedAt = new Date().toISOString();
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  try {
    store.decisions.upsertDecision(finalizationDecisionRecord({
      ...request,
      status: "completed",
      completedAt,
    }));
  } finally {
    store.close();
  }
}

function finalizationDecisionRecord(request: ProjectHarnessChangeFinalizationRequest): StoredDecisionRecord {
  return {
    id: request.id,
    projectId: request.projectId,
    changeId: request.changeId,
    decisionType: FINALIZATION_DECISION_TYPE,
    status: request.status,
    label: "Close the current Change",
    summary: "Main requested closure of the exact current Change after terminal evidence was revalidated.",
    targetId: request.changeId,
    runId: null,
    artifact: null,
    actionId: "harness-change.close",
    feedback: null,
    payloadJson: JSON.stringify(request),
    createdAt: request.createdAt,
    updatedAt: request.completedAt ?? request.createdAt,
    completedAt: request.completedAt,
  };
}

function parseFinalizationDecision(record: StoredDecisionRecord): ProjectHarnessChangeFinalizationRequest {
  let value: unknown;
  try { value = JSON.parse(record.payloadJson); } catch { throw new Error("Change finalization request payload is invalid."); }
  if (!value || typeof value !== "object") throw new Error("Change finalization request payload is invalid.");
  const request = value as Partial<ProjectHarnessChangeFinalizationRequest>;
  if (request.version !== "1.0"
    || request.id !== record.id
    || request.projectId !== record.projectId
    || request.changeId !== record.changeId
    || !request.conversationId
    || !request.graphScopeId
    || !request.mainAttemptId
    || !request.providerThreadId
    || !request.turnId
    || !request.authorizationId
    || typeof request.authorizationEpoch !== "number"
    || !request.manifestHash
    || !request.skillContentFingerprint
    || (request.status !== "pending" && request.status !== "completed")) {
    throw new Error("Change finalization request payload is invalid.");
  }
  if (record.status !== request.status) throw new Error("Change finalization request status is inconsistent.");
  return request as ProjectHarnessChangeFinalizationRequest;
}

function assertProjectIdentity(project: ManagedProject, resolution: ProjectRuntimeResolution): void {
  if (project.id !== resolution.harness.projectId
    || project.path !== resolution.projectRoot
    || resolution.paths.projectId !== resolution.harness.projectId) {
    throw new Error("Change finalization project identity is stale.");
  }
}

function finalizationRequestId(
  projectId: string,
  input: ProjectHarnessChangeFinalizationInput,
  readiness: FinalizationReadiness,
): string {
  return `finalize-${createHash("sha256").update(JSON.stringify({
    projectId,
    ...input,
    authorizationId: readiness.authorization.id,
    authorizationEpoch: readiness.authorization.epoch,
    manifestHash: readiness.manifestHash,
  })).digest("hex")}`;
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

function executionLineage(execution: TransitionExecution) {
  return {
    operationId: execution.operationId,
    authorizationId: execution.authorizationId,
    authorizationEpoch: execution.authorizationEpoch,
    transition: execution.transition,
    targetId: execution.targetId,
    manifestHash: execution.manifestHash,
    claimToken: execution.claimToken,
    fencingToken: execution.fencingToken,
  };
}
