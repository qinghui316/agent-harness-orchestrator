import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { relative, resolve } from "node:path";
import { z } from "zod";
import { parseJsonText, writeJsonFile } from "../fs/json.js";
import { parseOwnedArtifactRef, runtimeSidecarArtifact } from "../project-harness/contracts.js";
import { ensureProjectHarnessOnboardingWorkspace } from "../project-harness/onboarding.js";
import type {
  ProjectHarnessOnboardingExecution,
  ProjectHarnessOnboardingExecutionPort,
  ProjectHarnessOnboardingRole,
} from "../project-harness/runtime.js";
import type { ProjectRuntimePaths } from "../project-runtime/paths.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";

const evidenceSchema = z.object({
  schema_version: z.literal("1.0"),
  project_id: z.string().min(1),
  attempt_id: z.string().min(1),
  role_id: z.enum(["main-agent", "auditor-agent"]),
  artifact: z.object({
    owner: z.literal("runtime-sidecar"),
    path: z.string().min(1),
  }).strict(),
  assigned_at: z.string().datetime({ offset: true }),
}).strict();

export class WorkbenchProjectHarnessOnboardingExecutionStore
implements ProjectHarnessOnboardingExecutionPort {
  constructor(
    private readonly projectId: string,
    private readonly projectRoot: string,
    private readonly paths: ProjectRuntimePaths,
  ) {}

  async assign(input: {
    attemptId: string;
    roleId: ProjectHarnessOnboardingRole;
  }): Promise<ProjectHarnessOnboardingExecution> {
    const workspace = await ensureProjectHarnessOnboardingWorkspace(
      this.projectId,
      this.projectRoot,
      this.paths.sidecarRoot,
    );
    const artifactPath = input.roleId === "main-agent" ? workspace.bundleRoot : workspace.reviewPath;
    await this.assertProviderAttempt(input.attemptId, input.roleId, ["queued", "running"]);
    const evidence = {
      schema_version: "1.0" as const,
      project_id: this.projectId,
      attempt_id: input.attemptId,
      role_id: input.roleId,
      artifact: runtimeSidecarArtifact(relative(this.paths.sidecarRoot, artifactPath)),
      assigned_at: new Date().toISOString(),
    };
    await writeJsonFile(this.evidencePath(input.attemptId), evidence);
    return {
      projectId: this.projectId,
      attemptId: input.attemptId,
      roleId: input.roleId,
      artifactPath,
    };
  }

  async verify(input: {
    projectId: string;
    attemptId: string;
    requiredRole: ProjectHarnessOnboardingRole;
    artifactPath: string;
  }): Promise<ProjectHarnessOnboardingExecution> {
    if (input.projectId !== this.projectId) {
      throw new Error("Project Harness onboarding execution belongs to another project.");
    }
    const parsed = evidenceSchema.parse(parseJsonText(
      await readFile(this.evidencePath(input.attemptId), "utf8"),
      this.evidencePath(input.attemptId),
    ));
    const artifact = parseOwnedArtifactRef(parsed.artifact);
    if (artifact.owner !== "runtime-sidecar") {
      throw new Error("Project Harness onboarding execution evidence must reference the runtime sidecar.");
    }
    const assignedPath = resolve(this.paths.sidecarRoot, artifact.path);
    if (parsed.project_id !== input.projectId
      || parsed.attempt_id !== input.attemptId
      || parsed.role_id !== input.requiredRole
      || normalize(assignedPath) !== normalize(input.artifactPath)) {
      throw new Error("Project Harness onboarding artifact assignment does not match the requested Agent execution.");
    }
    await this.assertProviderAttempt(input.attemptId, input.requiredRole, ["running", "completed"]);
    return {
      projectId: input.projectId,
      attemptId: input.attemptId,
      roleId: input.requiredRole,
      artifactPath: assignedPath,
    };
  }

  private async assertProviderAttempt(
    attemptId: string,
    roleId: ProjectHarnessOnboardingRole,
    allowedStatuses: readonly string[],
  ): Promise<void> {
    const database = await openProjectRuntimeWorkbenchDatabase(this.paths);
    try {
      const attempt = database.providerAttempts.readProviderAttempt(this.projectId, attemptId);
      const expectedProfile = roleId === "main-agent" ? "main" : "auditor";
      if (!attempt
        || attempt.projectId !== this.projectId
        || attempt.roleId !== roleId
        || attempt.operationProfile !== expectedProfile
        || !allowedStatuses.includes(attempt.status)) {
        throw new Error("Project Harness onboarding ProviderAttempt is missing, stale, or has the wrong role.");
      }
    } finally {
      database.close();
    }
  }

  private evidencePath(attemptId: string): string {
    const identity = createHash("sha256").update(attemptId).digest("hex");
    return resolve(this.paths.sidecarRoot, "onboarding", "executions", `${identity}.json`);
  }
}

function normalize(path: string): string {
  const absolute = resolve(path);
  return process.platform === "win32" ? absolute.toLowerCase() : absolute;
}
