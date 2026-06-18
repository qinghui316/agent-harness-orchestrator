export interface CreatedAtRecord {
  createdAt: string;
}

export function latestByCreatedAt<T extends CreatedAtRecord>(items: readonly T[]): T | undefined {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
}

export function projectFields<T extends object, K extends keyof T>(
  item: T | null | undefined,
  fields: readonly K[],
): Pick<T, K> | undefined {
  if (!item) return undefined;
  const projected = {} as Pick<T, K>;
  for (const field of fields) {
    projected[field] = item[field];
  }
  return projected;
}
