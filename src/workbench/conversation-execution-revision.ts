import { createHash } from "node:crypto";

export function createConversationExecutionRevision(
  graphScopeId: string | null,
  completedTurnSequence: number,
  attemptIds: readonly string[],
): string {
  const value = JSON.stringify({
    graphScopeId,
    completedTurnSequence,
    attemptIds: [...attemptIds].sort(),
  });
  return `execution:${createHash("sha256").update(value).digest("hex")}`;
}
