import type { ChangeStatus } from "../types/index.js";

export function assertClosableChangeStatus(
  status: ChangeStatus,
  mode: "legacy" | "scoped",
  action: "close" | "abandon",
): asserts status is ChangeStatus & { change: NonNullable<ChangeStatus["change"]>; activeChanges: [ChangeStatus["activeChanges"][number], ...ChangeStatus["activeChanges"]] } {
  if (!status.change || status.activeChanges.length !== 1) {
    if (mode === "scoped") {
      const cause = status.closeGate.blockingIssues[0] ?? "scoped active change is missing valid metadata.";
      throw new Error(`Cannot ${action} change: ${cause}`);
    }
    throw new Error(`Cannot ${action} change: expected exactly one active change with valid metadata.`);
  }
}
