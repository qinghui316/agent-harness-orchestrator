export function normalizeAndValidateTasks(changeStatus: { acMap: { tasks: Array<{ id: string }> } | null }, taskIds: string[]): string[] {
  const normalized = taskIds.map((item) => item.trim().toUpperCase()).filter(Boolean);
  if (normalized.length === 0) return [];
  const known = new Set((changeStatus.acMap?.tasks ?? []).map((task) => task.id.toUpperCase()));
  const unknown = normalized.filter((task) => !known.has(task));
  if (unknown.length > 0) {
    throw new Error(`Unknown task id(s): ${unknown.join(", ")}.`);
  }
  return Array.from(new Set(normalized));
}
