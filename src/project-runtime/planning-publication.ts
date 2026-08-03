import {
  acceptProjectHarnessPlanningPackage,
  type AcceptedPlanningPackage,
  type PlanningAcceptanceCommitPort,
  type ProjectHarnessPlanningAuthorizationEvidence,
  type ProjectHarnessPlanningPublicationPorts,
  type ValidatedPlanningPackageInput,
} from "../project-harness/planning-publication.js";
import { preflightProjectHarnessChange } from "../project-harness/change.js";
import { resolveProjectHarnessRegistryContext } from "../project-harness/registry.js";
import { SourceFingerprintSnapshot } from "../project-harness/source-fingerprint.js";
import { listAuditResults } from "../audit/artifacts.js";
import { listIntegrationChecks } from "../integration-check/manager.js";
import { listRuns } from "../run/manager.js";
import { listTaskQueues } from "../task-queue/manager.js";
import { listTaskRuns, listWorkerLeases } from "../task-run/manager.js";
import { listValidationResults } from "../validation/artifacts.js";
import { listWorkflowRuns } from "../workflow-run/manager.js";
import { listWorktreesForChange } from "../worktree/manager.js";
import {
  readExecutionAuthorization,
  reactivateLocalExecutionAuthorizationAfterRollback,
  revokeLocalExecutionAuthorization,
} from "../workflow-runtime/execution-authorization.js";
import type { ProjectRuntimeResolution } from "./context.js";

export type ProjectRuntimePlanningEvidencePorts = Pick<
  ProjectHarnessPlanningPublicationPorts,
  "executionEvidence" | "authorization" | "preflight"
>;

export interface PlanningExecutionEvidenceRuntime {
  projectId: string | null;
  projectRoot: string;
  runsRoot: string;
  workbenchRoot: string;
  worktreeMetadataRoot: string;
}

export function createProjectRuntimePlanningEvidencePorts(
  resolution: ProjectRuntimeResolution,
): ProjectRuntimePlanningEvidencePorts {
  const projectId = resolution.harness.projectId;
  const paths = resolution.paths;
  return {
    executionEvidence: {
      hasEvidence: (changeId) => hasPlanningExecutionEvidence({
        projectId,
        projectRoot: resolution.projectRoot,
        runsRoot: paths.runsRoot,
        workbenchRoot: paths.workbenchRoot,
        worktreeMetadataRoot: paths.worktreeMetadataRoot,
      }, changeId),
    },
    authorization: {
      async captureSuperseded(input) {
        const authorization = await readExecutionAuthorization(paths, input.authorizationId);
        if (input.projectId !== projectId
          || authorization.projectId !== projectId
          || authorization.changeId !== input.changeId
          || authorization.conversationId !== input.conversationId
          || authorization.acceptedPlanHash !== input.acceptedPlanHash
          || authorization.graphId !== input.graphId
          || authorization.status !== "active") {
          throw new Error("Execution authorization intent does not belong to the accepted Change lineage.");
        }
        return planningAuthorizationEvidence(authorization);
      },
      async revoke(evidence, reason) {
        assertPlanningAuthorizationEvidence(projectId, evidence);
        await revokeLocalExecutionAuthorization(paths, evidence.id, reason);
      },
      async restore(evidence, reason) {
        assertPlanningAuthorizationEvidence(projectId, evidence);
        try {
          await reactivateLocalExecutionAuthorizationAfterRollback(paths, evidence.id, {
            epoch: evidence.epoch + 1,
            reason,
          });
        } catch (error) {
          const current = await readExecutionAuthorization(paths, evidence.id);
          assertSamePlanningAuthorizationLineage(evidence, current);
          if (current.status === "revoked"
            && (current.epoch !== evidence.epoch + 1 || current.revocationReason !== reason)) {
            return;
          }
          throw error;
        }
      },
    },
    preflight: {
      async evaluate(context, changeId) {
        const snapshot = new SourceFingerprintSnapshot({ projectRoot: resolution.projectRoot });
        return preflightProjectHarnessChange(context, {
          changeId,
          sourceSnapshot: { fingerprintSources: (sources) => snapshot.fingerprints(sources) },
        });
      },
    },
  };
}

export async function hasPlanningExecutionEvidence(
  runtime: PlanningExecutionEvidenceRuntime,
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
    listRuns(runtime),
    listTaskQueues(runtime, changeId),
    listTaskRuns(runtime, changeId),
    listWorkerLeases(runtime, changeId),
    listWorkflowRuns(runtime, changeId),
    listValidationResults(runtime, changeId),
    listAuditResults(runtime, changeId),
    listWorktreesForChange(runtime, changeId),
    listIntegrationChecks(runtime),
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

export async function publishProjectRuntimePlanningPackage(
  resolution: ProjectRuntimeResolution,
  input: ValidatedPlanningPackageInput,
  commit: PlanningAcceptanceCommitPort,
  createGraphScopeId: (conversationId: string) => string,
): Promise<AcceptedPlanningPackage> {
  const registry = await resolveProjectHarnessRegistryContext({
    projectId: resolution.harness.projectId,
    projectRoot: resolution.projectRoot,
    skillRoot: resolution.harness.skillRoot,
  });
  return acceptProjectHarnessPlanningPackage({
    registry,
    sidecarRoot: resolution.paths.sidecarRoot,
  }, input, {
    ...createProjectRuntimePlanningEvidencePorts(resolution),
    commit,
    createGraphScopeId,
  });
}

function planningAuthorizationEvidence(
  authorization: Awaited<ReturnType<typeof readExecutionAuthorization>>,
): ProjectHarnessPlanningAuthorizationEvidence {
  return {
    id: authorization.id,
    epoch: authorization.epoch,
    projectId: authorization.projectId,
    changeId: authorization.changeId,
    conversationId: authorization.conversationId,
    acceptedPlanHash: authorization.acceptedPlanHash,
    graphId: authorization.graphId,
  };
}

function assertPlanningAuthorizationEvidence(
  projectId: string,
  evidence: ProjectHarnessPlanningAuthorizationEvidence,
): void {
  if (evidence.projectId !== projectId) {
    throw new Error("Planning authorization evidence belongs to another project.");
  }
}

function assertSamePlanningAuthorizationLineage(
  evidence: ProjectHarnessPlanningAuthorizationEvidence,
  authorization: Awaited<ReturnType<typeof readExecutionAuthorization>>,
): void {
  if (authorization.id !== evidence.id
    || authorization.projectId !== evidence.projectId
    || authorization.changeId !== evidence.changeId
    || authorization.conversationId !== evidence.conversationId
    || authorization.acceptedPlanHash !== evidence.acceptedPlanHash
    || authorization.graphId !== evidence.graphId) {
    throw new Error("Planning authorization changed lineage during publication rollback.");
  }
}
