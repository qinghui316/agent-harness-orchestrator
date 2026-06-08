export const OFFICIAL_REWORK_BUDGET = 1;

export function shouldAutoReworkTaskRun(taskRun: { status: string; attempt: number }): boolean {
  if (taskRun.status !== "blocked" && taskRun.status !== "failed") return false;
  const officialReworkAttempt = Math.max(0, taskRun.attempt - 1);
  return officialReworkAttempt < OFFICIAL_REWORK_BUDGET;
}

export function buildOfficialTaskRunReworkPrompt(prompt: string | undefined): string {
  return [
    prompt,
    "",
    "AHO official validation/audit did not accept the previous attempt.",
    "Read the latest validation/audit/run evidence for this Change and fix the assigned worktree proposal.",
    "Do not ask the user unless the evidence shows requirement ambiguity, product tradeoff, environment failure, or no real code rework path.",
  ].filter((item): item is string => Boolean(item)).join("\n");
}

export function buildResumeReworkPrompt(prompt: string | undefined): string {
  return [
    prompt,
    "",
    "AHO resumed a WorkflowRun and found validation/audit evidence that requires bounded rework.",
    "Read the latest validation/audit/run evidence for this Change and fix the assigned worktree proposal.",
    "Do not ask the user unless the evidence shows requirement ambiguity, product tradeoff, environment failure, or no real code rework path.",
  ].filter((item): item is string => Boolean(item)).join("\n");
}

export function sourceRefreshReworkPrompt(worktreeId: string, extraPrompt?: string): string {
  return [
    "The previous result is no longer safe to apply because the project source changed after the worktree was created.",
    "Re-read the accepted demand artifacts, current source tree, prior result summary, validation/audit evidence, and user feedback.",
    `Do not patch the old result in place. Create a fresh same-demand implementation attempt from the current source state. Prior worktree: ${worktreeId}.`,
    "After implementation, preserve evidence for independent validation and audit.",
    extraPrompt?.trim() ? `Additional user feedback:\n${extraPrompt.trim()}` : "",
  ].filter(Boolean).join("\n\n");
}
