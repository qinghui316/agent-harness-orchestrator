export function sourceRefreshReworkPrompt(worktreeId: string, extraPrompt?: string): string {
  return [
    "The previous result is not currently safe to apply because validation, audit, source state, or user feedback requires bounded rework.",
    "Re-read the accepted demand artifacts, current source tree, prior result summary, validation/audit evidence, and user feedback.",
    `Do not patch the old result in place. Create a fresh same-demand implementation attempt from the current source state. Prior worktree: ${worktreeId}.`,
    "After implementation, preserve evidence for independent validation and audit.",
    extraPrompt?.trim() ? `Additional user feedback:\n${extraPrompt.trim()}` : "",
  ].filter(Boolean).join("\n\n");
}
