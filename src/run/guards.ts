import type { ChangeStatus } from "../types/index.js";

export function assertRunnableChange(status: ChangeStatus): void {
  if (status.activeChanges.length === 0) {
    throw new Error("Cannot start run: no active change found.");
  }
  if (status.activeChanges.length > 1) {
    throw new Error(`Cannot start run: expected exactly one active change; found ${status.activeChanges.length}.`);
  }
  if (!status.change) {
    throw new Error("Cannot start run: active change is missing valid change.json.");
  }
}
