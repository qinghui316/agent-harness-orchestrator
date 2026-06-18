import { getActiveChanges } from "../../ecl/index.js";
import type { ResolvedMemory, ChangeIndexItem } from "../../types/index.js";

interface WorkbenchActionTargetWithId {
  id: string;
}

export async function requireActiveChangeTarget(
  memory: ResolvedMemory,
  changeId: string,
  label: string,
  options: { includeChangeId?: boolean } = {},
): Promise<ChangeIndexItem> {
  const active = await getActiveChanges(memory);
  const target = active.find((item) => item.name === changeId);
  if (target) return target;
  const suffix = options.includeChangeId === false ? "." : `: ${changeId}.`;
  throw new Error(`${label} target is stale or missing active Change${suffix}`);
}

export function assertWorkbenchActionChangeScope(requestChangeId: string | undefined, changeId: string, label: string): void {
  if (requestChangeId && requestChangeId !== changeId) throw new Error(`${label} changeId scope mismatch.`);
}

export function assertLatestWorkbenchActionTarget<T extends WorkbenchActionTargetWithId>(
  latest: T | null | undefined,
  target: WorkbenchActionTargetWithId,
  label: string,
  targetName: string,
): asserts latest is T {
  if (!latest || latest.id !== target.id) throw new Error(`${label} requires the latest ${targetName}.`);
}
