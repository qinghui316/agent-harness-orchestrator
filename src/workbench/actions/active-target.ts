import { getActiveChanges } from "../../ecl/index.js";
import type { ResolvedMemory, ChangeIndexItem } from "../../types/index.js";

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
