import { createHash } from "node:crypto";
import { resolve } from "node:path";
import type { ProjectHarnessDiscoveryPolicy, ProjectHarnessHandle } from "./contracts.js";
import { auditProjectHarness, doctorProjectHarness } from "./diagnostics.js";
import { fingerprintProjectHarnessContent } from "./fingerprint.js";
import { checkProjectKnowledge, scanProjectKnowledge } from "./knowledge.js";
import { readProjectHarnessManifest } from "./manifest.js";
import {
  ensureProjectHarnessOnboardingWorkspace,
  prepareProjectHarnessOnboarding,
  publishProjectHarnessOnboarding,
  type ProjectHarnessOnboardingRecord,
  type ProjectHarnessOnboardingResult,
  type ProjectHarnessOnboardingWorkspace,
} from "./onboarding.js";
import { createSnapshotFingerprinter, SourceFingerprintSnapshot } from "./source-fingerprint.js";

export interface ProjectHarnessOperationResult {
  ok: boolean;
  status: string;
  projectId: string;
  revision: number;
  details?: unknown;
}

export interface ProjectHarnessProjectOperations {
  init: {
    workspace(): Promise<ProjectHarnessOnboardingWorkspace>;
    prepare(authorAttemptId: string): Promise<ProjectHarnessOnboardingRecord>;
    publish(reviewerAttemptId: string): Promise<ProjectHarnessOnboardingResult>;
  };
  doctor(handle: ProjectHarnessHandle): Promise<ProjectHarnessOperationResult>;
  audit(handle: ProjectHarnessHandle): Promise<ProjectHarnessOperationResult>;
}

export interface ProjectHarnessKnowledgeOperations {
  scan(handle: ProjectHarnessHandle): Promise<ProjectHarnessOperationResult>;
  check(handle: ProjectHarnessHandle): Promise<ProjectHarnessOperationResult>;
}

export interface ProjectHarnessChangeOperations {
  run(handle: ProjectHarnessHandle, args: readonly string[]): Promise<ProjectHarnessOperationResult>;
}

export interface ProjectHarnessRegistryOperations {
  preflight(handle: ProjectHarnessHandle, changeId: string): Promise<ProjectHarnessOperationResult>;
}

export interface ProjectHarnessIntegrationOperations {
  run(handle: ProjectHarnessHandle, args: readonly string[]): Promise<ProjectHarnessOperationResult>;
}

export interface ProjectHarnessEvolutionOperations {
  run(handle: ProjectHarnessHandle, args: readonly string[]): Promise<ProjectHarnessOperationResult>;
}

export interface ProjectHarnessRuntime {
  project: ProjectHarnessProjectOperations;
  knowledge: ProjectHarnessKnowledgeOperations;
  change: ProjectHarnessChangeOperations;
  registry: ProjectHarnessRegistryOperations;
  integration: ProjectHarnessIntegrationOperations;
  evolution: ProjectHarnessEvolutionOperations;
}

export interface ProjectHarnessCommandContext {
  handle: ProjectHarnessHandle;
  projectRoot: string;
  skillRoot: string;
  sidecarRoot: string;
  sourceSnapshot: SourceFingerprintSnapshot;
}

export interface ProjectHarnessCommandPort {
  run(context: ProjectHarnessCommandContext, args: readonly string[]): Promise<{
    status: string;
    details?: unknown;
  }>;
}

export interface ProjectHarnessRegistryPort {
  preflight(context: ProjectHarnessCommandContext, changeId: string): Promise<{
    status: string;
    details?: unknown;
  }>;
}

export type ProjectHarnessOnboardingRole = "main-agent" | "auditor-agent";

export interface ProjectHarnessOnboardingExecution {
  projectId: string;
  attemptId: string;
  roleId: ProjectHarnessOnboardingRole;
  artifactPath: string;
}

export interface ProjectHarnessOnboardingExecutionPort {
  verify(input: {
    projectId: string;
    attemptId: string;
    requiredRole: ProjectHarnessOnboardingRole;
    artifactPath: string;
  }): Promise<ProjectHarnessOnboardingExecution>;
}

export interface CreateProjectHarnessRuntimeOptions {
  projectId?: string;
  projectRoot: string;
  skillRoot: string;
  sidecarRoot: string;
  discoveryPolicy: ProjectHarnessDiscoveryPolicy;
  change: ProjectHarnessCommandPort;
  registry: ProjectHarnessRegistryPort;
  integration: ProjectHarnessCommandPort;
  evolution: ProjectHarnessCommandPort;
  sourceSnapshotFactory?: () => SourceFingerprintSnapshot;
  onboarding?: {
    scaffoldRoot?: string;
    compiledRuntimeEntry?: string;
    executions?: ProjectHarnessOnboardingExecutionPort;
  };
}

export function createProjectHarnessRuntime(
  options: CreateProjectHarnessRuntimeOptions,
): ProjectHarnessRuntime {
  const sourceSnapshotFactory = options.sourceSnapshotFactory
    ?? (() => new SourceFingerprintSnapshot({ projectRoot: options.projectRoot }));
  const context = async (handle: ProjectHarnessHandle): Promise<ProjectHarnessCommandContext> => {
    await assertCurrentHandle(handle, options.skillRoot);
    return {
      handle,
      projectRoot: options.projectRoot,
      skillRoot: options.skillRoot,
      sidecarRoot: options.sidecarRoot,
      sourceSnapshot: sourceSnapshotFactory(),
    };
  };
  const result = (
    handle: ProjectHarnessHandle,
    status: string,
    details?: unknown,
  ): ProjectHarnessOperationResult => ({
    ok: true,
    status,
    projectId: handle.projectId,
    revision: handle.skillRevision,
    ...(details === undefined ? {} : { details }),
  });
  return {
    project: {
      init: {
        async workspace() {
          return ensureProjectHarnessOnboardingWorkspace(
            requireOnboardingProjectId(options.projectId),
            options.projectRoot,
            options.sidecarRoot,
          );
        },
        async prepare(authorAttemptId) {
          const projectId = requireOnboardingProjectId(options.projectId);
          const workspace = await ensureProjectHarnessOnboardingWorkspace(
            projectId,
            options.projectRoot,
            options.sidecarRoot,
          );
          const author = await verifyOnboardingExecution(options, {
            projectId,
            attemptId: authorAttemptId,
            requiredRole: "main-agent",
            artifactPath: workspace.bundleRoot,
          });
          return prepareProjectHarnessOnboarding({
            projectId,
            projectRoot: options.projectRoot,
            sidecarRoot: options.sidecarRoot,
            authorId: author.attemptId,
            transactionId: deriveOnboardingTransactionId(projectId, author.attemptId),
            scaffoldRoot: options.onboarding?.scaffoldRoot,
            compiledRuntimeEntry: options.onboarding?.compiledRuntimeEntry,
            discoveryPolicy: options.discoveryPolicy,
          });
        },
        async publish(reviewerAttemptId) {
          const projectId = requireOnboardingProjectId(options.projectId);
          const workspace = await ensureProjectHarnessOnboardingWorkspace(
            projectId,
            options.projectRoot,
            options.sidecarRoot,
          );
          const reviewer = await verifyOnboardingExecution(options, {
            projectId,
            attemptId: reviewerAttemptId,
            requiredRole: "auditor-agent",
            artifactPath: workspace.reviewPath,
          });
          return publishProjectHarnessOnboarding({
            projectId,
            projectRoot: options.projectRoot,
            sidecarRoot: options.sidecarRoot,
            reviewerId: reviewer.attemptId,
            discoveryPolicy: options.discoveryPolicy,
          });
        },
      },
      async doctor(handle) {
        const report = await doctorProjectHarness({
          skillRoot: options.skillRoot,
          projectRoot: options.projectRoot,
          expectedProjectId: handle.projectId,
          discoveryPolicy: options.discoveryPolicy,
        });
        return {
          ok: report.healthy,
          status: report.healthy ? "healthy" : "unhealthy",
          projectId: report.projectId ?? handle.projectId,
          revision: report.revision ?? handle.skillRevision,
          details: report,
        };
      },
      async audit(handle) {
        const report = await auditProjectHarness({
          skillRoot: options.skillRoot,
          projectRoot: options.projectRoot,
          expectedProjectId: handle.projectId,
          discoveryPolicy: options.discoveryPolicy,
        });
        return {
          ok: report.healthy,
          status: report.healthy ? "healthy" : "unhealthy",
          projectId: report.projectId ?? handle.projectId,
          revision: report.revision ?? handle.skillRevision,
          details: report,
        };
      },
    },
    knowledge: {
      async scan(handle) {
        const command = await context(handle);
        const report = await scanProjectKnowledge({
          projectId: handle.projectId,
          projectRoot: options.projectRoot,
          skillRoot: options.skillRoot,
          fingerprintSources: createSnapshotFingerprinter(command.sourceSnapshot),
        });
        return {
          ok: report.healthy,
          status: report.healthy ? "healthy" : "drift",
          projectId: handle.projectId,
          revision: handle.skillRevision,
          details: { ...report, sourceSnapshotDigest: await command.sourceSnapshot.digest() },
        };
      },
      async check(handle) {
        const command = await context(handle);
        const report = await checkProjectKnowledge({
          projectId: handle.projectId,
          projectRoot: options.projectRoot,
          skillRoot: options.skillRoot,
          fingerprintSources: createSnapshotFingerprinter(command.sourceSnapshot),
        });
        return {
          ok: report.healthy,
          status: report.healthy ? "healthy" : "drift",
          projectId: handle.projectId,
          revision: handle.skillRevision,
          details: { ...report, sourceSnapshotDigest: await command.sourceSnapshot.digest() },
        };
      },
    },
    change: {
      async run(handle, args) {
        const output = await options.change.run(await context(handle), args);
        return result(handle, output.status, output.details);
      },
    },
    registry: {
      async preflight(handle, changeId) {
        const output = await options.registry.preflight(await context(handle), changeId);
        return result(handle, output.status, output.details);
      },
    },
    integration: {
      async run(handle, args) {
        const output = await options.integration.run(await context(handle), args);
        return result(handle, output.status, output.details);
      },
    },
    evolution: {
      async run(handle, args) {
        const output = await options.evolution.run(await context(handle), args);
        return result(handle, output.status, output.details);
      },
    },
  };
}

function requireOnboardingProjectId(value: string | undefined): string {
  if (!value?.trim()) throw new Error("Project Harness init requires the Runtime-bound project id.");
  return value;
}

function deriveOnboardingTransactionId(projectId: string, attemptId: string): string {
  return `onboard-${createHash("sha256").update(`${projectId}\0${attemptId}`).digest("hex").slice(0, 32)}`;
}

async function verifyOnboardingExecution(
  options: CreateProjectHarnessRuntimeOptions,
  expected: Parameters<ProjectHarnessOnboardingExecutionPort["verify"]>[0],
): Promise<ProjectHarnessOnboardingExecution> {
  const port = options.onboarding?.executions;
  if (!port) throw new Error("Project Harness init requires a Runtime-owned ProviderAttempt verifier.");
  const execution = await port.verify(expected);
  if (execution.projectId !== expected.projectId
    || execution.attemptId !== expected.attemptId
    || execution.roleId !== expected.requiredRole
    || normalizeRuntimePath(execution.artifactPath) !== normalizeRuntimePath(expected.artifactPath)) {
    throw new Error("Project Harness onboarding execution evidence does not match the required Agent attempt and artifact.");
  }
  return execution;
}

function normalizeRuntimePath(path: string): string {
  const value = resolve(path);
  return process.platform === "win32" ? value.toLowerCase() : value;
}

async function assertCurrentHandle(handle: ProjectHarnessHandle, skillRoot: string): Promise<void> {
  const manifest = await readProjectHarnessManifest(skillRoot);
  if (manifest.project_id !== handle.projectId
    || manifest.skill_name !== handle.skillName
    || manifest.skill_revision !== handle.skillRevision) {
    throw new Error("Project Harness handle identity or revision is stale.");
  }
  if (await fingerprintProjectHarnessContent(skillRoot) !== handle.contentFingerprint) {
    throw new Error("Project Harness handle content fingerprint is stale.");
  }
}
