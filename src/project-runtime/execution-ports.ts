import { readFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { z } from "zod";
import type { AgentTaskStorePort } from "../agent-task/paths.js";
import type { ProjectHarnessPlanningGateEvidence } from "../project-harness/planning-gate-query.js";
import { loadProjectHarnessChange, resolveProjectHarnessChangeEvidenceRoot } from "../project-harness/change.js";
import { readLatestWorkflowGraphPlanAt } from "../workflow-artifacts/workflow-graph-plan.js";
import type { AcMap, ChangeStatus, ManagedProject, RunMetadata } from "../types/index.js";
import type { WorktreeCreationPort } from "../worktree/paths.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import type { ProjectRuntimeResolution } from "./context.js";
import { resolveProjectRuntimeState } from "./coordinator.js";
import type { ProjectRunsPathPort } from "./paths.js";

const acMapSchema = z.object({
  version: z.literal("1.0"),
  generatedAt: z.string(),
  changeId: z.string().min(1),
  acceptanceCriteria: z.array(z.object({
    id: z.string().min(1),
    text: z.string(),
    taskIds: z.array(z.string()),
    validationRefs: z.array(z.string()),
    warnings: z.array(z.string()),
  })),
  tasks: z.array(z.object({
    id: z.string().min(1),
    text: z.string(),
    acIds: z.array(z.string()),
    done: z.boolean(),
    warnings: z.array(z.string()),
  })),
  warnings: z.array(z.string()),
  blockingIssues: z.array(z.string()),
}).strict();

export interface ProjectRunArtifactReferencePort {
  runArtifactRoot: string;
  runArtifactOwner: RunMetadata["artifacts"]["owner"];
}

export type ProjectExecutionRuntimePort = ProjectRunsPathPort
  & ProjectRunArtifactReferencePort
  & Omit<AgentTaskStorePort, "projectId">
  & Omit<WorktreeCreationPort, "projectId" | "projectWriteLeasePath">
  & { projectId: string };

export type ProjectCodeExecutionRuntimePort = ProjectExecutionRuntimePort
  & Pick<WorktreeCreationPort, "projectWriteLeasePath">;

export interface ProjectHarnessExecutionPort {
  evidenceRoot: string;
  planning: ProjectHarnessPlanningGateEvidence;
  changeStatus: ChangeStatus;
}

export interface ProjectHarnessArchivedChangeReadPort {
  evidenceRoot: string;
  changeStatus: ChangeStatus;
  graph: import("../types/index.js").WorkflowGraphPlan;
}

export function projectExecutionRuntimePort(
  project: ManagedProject,
  resolution: ProjectRuntimeResolution,
): ProjectCodeExecutionRuntimePort {
  return {
    projectId: resolution.harness.projectId,
    projectRoot: resolution.projectRoot,
    runsRoot: resolution.paths.runsRoot,
    runArtifactRoot: resolution.paths.sidecarRoot,
    runArtifactOwner: "runtime-sidecar",
    workbenchRoot: resolution.paths.workbenchRoot,
    workbenchDbPath: resolution.paths.workbenchDbPath,
    worktreeMetadataRoot: resolution.paths.worktreeMetadataRoot,
    worktreeIndexPath: resolution.paths.worktreeIndexPath,
    projectWriteLeasePath: join(resolution.paths.sidecarRoot, "project-write-lease.sqlite"),
  };
}

export async function requireProjectExecutionRuntimePort(
  project: ManagedProject,
): Promise<ProjectCodeExecutionRuntimePort> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") {
    throw new Error(`Project Harness is not ready for execution: ${project.id}.`);
  }
  return projectExecutionRuntimePort(project, state.resolution);
}

export function projectRunArtifactReference(
  port: ProjectRunArtifactReferencePort,
  directory: string,
): Pick<RunMetadata["artifacts"], "owner" | "directory"> {
  const root = resolve(port.runArtifactRoot);
  const target = resolve(directory);
  const path = relative(root, target);
  if (!path || isAbsolute(path) || path === ".." || path.startsWith(`..${sep}`)) {
    throw new Error("Run artifact directory escapes its declared artifact root.");
  }
  return {
    owner: port.runArtifactOwner,
    directory: path.replace(/\\/g, "/"),
  };
}

export async function projectHarnessExecutionPort(
  project: ManagedProject,
  evidenceRoot: string,
  planning: ProjectHarnessPlanningGateEvidence,
): Promise<ProjectHarnessExecutionPort> {
  const acMap = acMapSchema.parse(JSON.parse(await readFile(join(evidenceRoot, "ac-map.json"), "utf8"))) as AcMap;
  if (acMap.changeId !== planning.change.change_id || planning.change.status !== "active") {
    throw new Error("Project Harness execution Change evidence is stale.");
  }
  const updatedAt = planning.change.updated_at;
  return {
    evidenceRoot,
    planning,
    changeStatus: {
      projectPath: project.path,
      activeChanges: [{ name: planning.change.change_id, path: `state/changes/active/${planning.change.change_id}` }],
      change: {
        version: "1.0",
        id: planning.change.change_id,
        title: planning.change.scope || planning.change.change_id,
        state: "active",
        createdAt: planning.change.created_at,
        updatedAt,
        closedAt: null,
        archivePath: null,
        originConversationId: planning.lane.conversation_id ?? undefined,
      },
      reviewStatus: "approved",
      acMap,
      specTest: null,
      latestValidation: null,
      latestAudit: null,
      closeGate: {
        ready: false,
        warnings: ["Execution is active; apply and close remain separate human-gated transitions."],
        blockingIssues: [],
      },
    },
  };
}

export async function projectHarnessArchivedChangeReadPort(
  project: ManagedProject,
  skillRoot: string,
  changeId: string,
): Promise<ProjectHarnessArchivedChangeReadPort> {
  const record = await loadProjectHarnessChange(skillRoot, changeId, true);
  if (!record || !["completed", "blocked", "abandoned"].includes(record.status)) {
    throw new Error(`Project Harness archived Change is not terminal: ${changeId}.`);
  }
  const evidenceRoot = await resolveProjectHarnessChangeEvidenceRoot(skillRoot, "archive", changeId);
  const acMap = acMapSchema.parse(JSON.parse(await readFile(join(evidenceRoot, "ac-map.json"), "utf8"))) as AcMap;
  if (acMap.changeId !== changeId) throw new Error("Project Harness archived Change evidence is stale.");
  const graph = await readLatestWorkflowGraphPlanAt(evidenceRoot, changeId);
  return {
    evidenceRoot,
    graph,
    changeStatus: {
      projectPath: project.path,
      activeChanges: [],
      change: {
        version: "1.0",
        id: changeId,
        title: record.scope || changeId,
        state: "archived",
        createdAt: record.created_at,
        updatedAt: record.updated_at,
        closedAt: record.updated_at,
        archivePath: `state/changes/archive/${changeId}`,
      },
      reviewStatus: "approved",
      acMap,
      specTest: null,
      latestValidation: null,
      latestAudit: null,
      closeGate: {
        ready: false,
        warnings: ["Archived Change evidence is read-only."],
        blockingIssues: [],
      },
    },
  };
}
