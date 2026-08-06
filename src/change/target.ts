import { getChangeStatus, getChangeStatusForChange } from "./manager.js";
import type { ChangeStatus, ManagedProject } from "../types/index.js";

export type ChangeTargetCapability = "runnable" | "closeable";
export type ChangeTargetSource = "explicit-change-id" | "unique-active-change";

export interface ChangeTarget {
  changeId: string;
  status: ChangeStatus;
  source: ChangeTargetSource;
  capability: ChangeTargetCapability;
}

export interface ResolveChangeTargetOptions {
  changeId?: string | null;
}

type ChangeTargetProject = ManagedProject;

export async function resolveRunnableChangeTarget(project: ChangeTargetProject, options: ResolveChangeTargetOptions = {}): Promise<ChangeTarget> {
  return resolveChangeTarget(project, "runnable", options);
}

export async function resolveCloseableChangeTarget(project: ChangeTargetProject, options: ResolveChangeTargetOptions = {}): Promise<ChangeTarget> {
  return resolveChangeTarget(project, "closeable", options);
}

async function resolveChangeTarget(project: ChangeTargetProject, capability: ChangeTargetCapability, options: ResolveChangeTargetOptions): Promise<ChangeTarget> {
  const explicitChangeId = options.changeId?.trim();
  if (explicitChangeId) {
    const status = await getChangeStatusForChange(project, explicitChangeId);
    assertExplicitChangeStatus(status, explicitChangeId, capability);
    return { changeId: explicitChangeId, status, source: "explicit-change-id", capability };
  }

  const status = await getChangeStatus(project);
  assertUniqueActiveStatus(status, capability);
  const changeId = status.change?.id ?? status.activeChanges[0]?.name;
  if (!changeId) throw new Error(`Cannot resolve ${capability} Change target without an active change id.`);
  return { changeId, status, source: "unique-active-change", capability };
}

function assertExplicitChangeStatus(status: ChangeStatus, changeId: string, capability: ChangeTargetCapability): void {
  if (!status.change) {
    const reason = status.closeGate.blockingIssues[0] ?? `Active demand conversation not found for scoped run: ${changeId}.`;
    throw new Error(`Cannot resolve ${capability} Change target: ${reason}`);
  }
}

function assertUniqueActiveStatus(status: ChangeStatus, capability: ChangeTargetCapability): void {
  if (status.activeChanges.length === 0) {
    throw new Error(`Cannot resolve ${capability} Change target: no active change found.`);
  }
  if (status.activeChanges.length > 1) {
    throw new Error(`Cannot resolve ${capability} Change target: expected exactly one active change; found ${status.activeChanges.length}.`);
  }
  if (!status.change) {
    throw new Error(`Cannot resolve ${capability} Change target: active change is missing valid change.json.`);
  }
}
