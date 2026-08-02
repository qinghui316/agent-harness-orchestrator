import type { ProjectHarnessHandle } from "./contracts.js";
import { auditProjectHarness, doctorProjectHarness } from "./diagnostics.js";
import { fingerprintProjectHarness } from "./fingerprint.js";
import { checkProjectKnowledge, scanProjectKnowledge } from "./knowledge.js";
import { readProjectHarnessManifest } from "./manifest.js";
import { createSnapshotFingerprinter, SourceFingerprintSnapshot } from "./source-fingerprint.js";

export interface ProjectHarnessOperationResult {
  ok: boolean;
  status: string;
  projectId: string;
  revision: number;
  details?: unknown;
}

export interface ProjectHarnessProjectOperations {
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

export interface CreateProjectHarnessRuntimeOptions {
  projectRoot: string;
  skillRoot: string;
  sidecarRoot: string;
  change: ProjectHarnessCommandPort;
  registry: ProjectHarnessRegistryPort;
  integration: ProjectHarnessCommandPort;
  evolution: ProjectHarnessCommandPort;
  sourceSnapshotFactory?: () => SourceFingerprintSnapshot;
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
      async doctor(handle) {
        const report = await doctorProjectHarness({
          skillRoot: options.skillRoot,
          projectRoot: options.projectRoot,
          expectedProjectId: handle.projectId,
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

async function assertCurrentHandle(handle: ProjectHarnessHandle, skillRoot: string): Promise<void> {
  const manifest = await readProjectHarnessManifest(skillRoot);
  if (manifest.project_id !== handle.projectId
    || manifest.skill_name !== handle.skillName
    || manifest.skill_revision !== handle.skillRevision) {
    throw new Error("Project Harness handle identity or revision is stale.");
  }
  if (await fingerprintProjectHarness(skillRoot) !== handle.contentFingerprint) {
    throw new Error("Project Harness handle content fingerprint is stale.");
  }
}
