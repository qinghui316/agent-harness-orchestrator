import { resolveProjectHarnessChangeEvidenceRoot, listProjectHarnessChanges } from "../project-harness/change.js";
import { readProjectHarnessPlanningGate } from "../project-harness/planning-gate-query.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import type { ManagedProject } from "../types/index.js";
import { openProjectRuntimeWorkbenchDatabase } from "../workbench/persistence/open-workbench-database.js";
import { resolveProjectRuntimeState } from "./coordinator.js";
import {
  projectExecutionRuntimePort,
  projectHarnessExecutionPort,
  type ProjectCodeExecutionRuntimePort,
  type ProjectHarnessExecutionPort,
} from "./execution-ports.js";

export interface ProjectActiveExecutionScope {
  runtime: ProjectCodeExecutionRuntimePort;
  harness: ProjectHarnessExecutionPort;
  conversationId: string;
  graphScopeId: string;
}

export async function resolveProjectActiveExecutionScope(
  project: ManagedProject,
  requestedChangeId?: string,
): Promise<ProjectActiveExecutionScope> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") {
    throw new Error(`Project Harness is not ready for execution: ${project.id}.`);
  }
  const resolution = state.resolution;
  if (project.id !== resolution.harness.projectId || project.path !== resolution.projectRoot) {
    throw new Error("Project execution identity is stale.");
  }
  const changeId = await resolveActiveChangeId(resolution.harness.skillRoot, requestedChangeId);
  const store = await openProjectRuntimeWorkbenchDatabase(resolution.paths);
  let conversation;
  try {
    conversation = store.conversations.findConversationForChange(resolution.harness.projectId, changeId);
  } finally {
    store.close();
  }
  if (!conversation
    || conversation.state !== "active"
    || conversation.boundChangeId !== changeId
    || !conversation.currentGraphScopeId) {
    throw new Error("Project execution cannot resolve the active Change conversation and graph scope.");
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
  return {
    runtime: projectExecutionRuntimePort(project, resolution),
    harness: await projectHarnessExecutionPort(project, evidenceRoot, planning),
    conversationId: conversation.conversationId,
    graphScopeId: conversation.currentGraphScopeId,
  };
}

async function resolveActiveChangeId(skillRoot: string, requestedChangeId?: string): Promise<string> {
  const requested = requestedChangeId?.trim();
  const active = (await listProjectHarnessChanges(skillRoot))
    .filter((change) => change.status === "active");
  if (requested) {
    if (!active.some((change) => change.change_id === requested)) {
      throw new Error(`Requested Change is not active in the project Harness: ${requested}.`);
    }
    return requested;
  }
  if (active.length !== 1) {
    throw new Error("Project execution requires an explicit Change id when the active target is not unique.");
  }
  return active[0].change_id;
}
