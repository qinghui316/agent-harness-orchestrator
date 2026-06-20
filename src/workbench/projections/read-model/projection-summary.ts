export interface CreatedAtRecord {
  createdAt: string;
}

export type ProjectionTimestamp = string | null | undefined;

export function sortByTimestampDesc<T>(
  items: readonly T[],
  timestamp: (item: T) => ProjectionTimestamp,
): T[] {
  return [...items].sort((a, b) => (timestamp(b) ?? "").localeCompare(timestamp(a) ?? ""));
}

export function latestByTimestamp<T>(
  items: readonly T[],
  timestamp: (item: T) => ProjectionTimestamp,
): T | undefined {
  return sortByTimestampDesc(items, timestamp)[0];
}

export function latestByCreatedAt<T extends CreatedAtRecord>(items: readonly T[]): T | undefined {
  return latestByTimestamp(items, (item) => item.createdAt);
}

export function latestUnhandledByCreatedAt<T extends CreatedAtRecord, H>(
  items: readonly T[],
  handledItems: readonly H[],
  itemId: (item: T) => string,
  handledItemId: (item: H) => string | null | undefined,
  isEligible: (item: T) => boolean = () => true,
): T | undefined {
  const handledIds = new Set(
    handledItems
      .map(handledItemId)
      .filter((id): id is string => Boolean(id)),
  );
  return latestByCreatedAt(items.filter((item) => isEligible(item) && !handledIds.has(itemId(item))));
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
