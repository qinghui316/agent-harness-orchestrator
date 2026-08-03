import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../project-runtime/coordinator.js";
import type { ManagedProject } from "../types/index.js";
import { openProjectRuntimeWorkbenchDatabase } from "./persistence/open-workbench-database.js";
import { type StoredDecisionRecord } from "./persistence/contracts.js";

export function buildWorkbenchApprovalDecisionId(actionId: string, args: readonly string[]): string {
  return `approval:${actionId}:${args.join(":")}`;
}

export async function readWorkbenchDecisionStatus(
  project: ManagedProject,
  decisionId: string,
): Promise<StoredDecisionRecord["status"] | null> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") throw new Error(`Project Harness is not ready for Workbench decisions: ${state.state}.`);
  const store = await openProjectRuntimeWorkbenchDatabase(state.resolution.paths);
  try {
    return store.decisions.listDecisions(state.resolution.paths.projectId)
      .find((decision) => decision.id === decisionId)?.status ?? null;
  } finally {
    store.close();
  }
}

export async function recordWorkbenchDecision(project: ManagedProject, input: {
  id: string;
  changeId: string | null;
  decisionType: string;
  status: StoredDecisionRecord["status"];
  label: string;
  summary: string;
  targetId: string | null;
  runId: string | null;
  artifact: string | null;
  actionId: string | null;
  feedback?: string | null;
  payload: unknown;
  completedAt?: string | null;
}): Promise<void> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") throw new Error(`Project Harness is not ready for Workbench decisions: ${state.state}.`);
  const { paths } = state.resolution;
  const now = new Date().toISOString();
  const store = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    store.decisions.upsertDecision({
      id: input.id,
      projectId: paths.projectId,
      changeId: input.changeId,
      decisionType: input.decisionType,
      status: input.status,
      label: input.label,
      summary: input.summary,
      targetId: input.targetId,
      runId: input.runId,
      artifact: input.artifact,
      actionId: input.actionId,
      feedback: input.feedback ?? null,
      payloadJson: JSON.stringify(input.payload),
      createdAt: now,
      updatedAt: now,
      completedAt: input.completedAt ?? null,
    });
  } finally {
    store.close();
  }
}

export async function recordWorkbenchDecisionFailureUnlessAccepted(
  project: ManagedProject,
  input: Parameters<typeof recordWorkbenchDecision>[1],
): Promise<boolean> {
  const state = await resolveProjectRuntimeState(project, {
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (state.state !== "ready") throw new Error(`Project Harness is not ready for Workbench decisions: ${state.state}.`);
  const now = new Date().toISOString();
  const store = await openProjectRuntimeWorkbenchDatabase(state.resolution.paths);
  try {
    return store.decisions.upsertFailureUnlessAccepted({
      id: input.id,
      projectId: state.resolution.paths.projectId,
      changeId: input.changeId,
      decisionType: input.decisionType,
      status: input.status,
      label: input.label,
      summary: input.summary,
      targetId: input.targetId,
      runId: input.runId,
      artifact: input.artifact,
      actionId: input.actionId,
      feedback: input.feedback ?? null,
      payloadJson: JSON.stringify(input.payload),
      createdAt: now,
      updatedAt: now,
      completedAt: input.completedAt ?? null,
    });
  } finally {
    store.close();
  }
}
