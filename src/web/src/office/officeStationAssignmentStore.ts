export type OfficeStationAssignmentScope = {
  projectId: string;
  conversationId: string;
  graphScopeId: string;
};

export type OfficeStationAssignments = ReadonlyMap<string, string>;

type StoredAssignments = {
  version: 1;
  assignments: Record<string, string>;
};

const STORAGE_PREFIX = "aho:agent-office:station-assignments:v1";

export class OfficeStationAssignmentStore {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null = browserStorage()) {}

  read(scope: OfficeStationAssignmentScope): Map<string, string> {
    if (!this.storage) return new Map();
    try {
      const source = this.storage.getItem(storageKey(scope));
      if (!source) return new Map();
      const parsed: unknown = JSON.parse(source);
      if (!isStoredAssignments(parsed)) return new Map();
      return new Map(Object.entries(parsed.assignments));
    } catch {
      return new Map();
    }
  }

  write(scope: OfficeStationAssignmentScope, assignments: OfficeStationAssignments): void {
    if (!this.storage) return;
    const value: StoredAssignments = { version: 1, assignments: Object.fromEntries(assignments) };
    try {
      this.storage.setItem(storageKey(scope), JSON.stringify(value));
    } catch {
      // Presentation persistence is best-effort; runtime placement remains usable.
    }
  }

  clear(scope: OfficeStationAssignmentScope): void {
    if (!this.storage) return;
    try {
      this.storage.removeItem(storageKey(scope));
    } catch {
      // Ignore unavailable browser storage.
    }
  }
}

export function officeStationAssignmentStorageKey(scope: OfficeStationAssignmentScope): string {
  return storageKey(scope);
}

function storageKey(scope: OfficeStationAssignmentScope): string {
  return `${STORAGE_PREFIX}:${encodeURIComponent(scope.projectId)}:${encodeURIComponent(scope.conversationId)}:${encodeURIComponent(scope.graphScopeId)}`;
}

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isStoredAssignments(value: unknown): value is StoredAssignments {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredAssignments>;
  return candidate.version === 1
    && Boolean(candidate.assignments)
    && typeof candidate.assignments === "object"
    && Object.entries(candidate.assignments ?? {}).every(([participantId, stationId]) => participantId.length > 0 && typeof stationId === "string" && stationId.length > 0);
}
