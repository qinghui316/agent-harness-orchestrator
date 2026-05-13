import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getTemplateRoot } from "../template-source/paths.js";

export interface AuditPromptInput {
  context: string;
  auditorProfile?: string;
  latestValidation: string;
  diffStat?: string;
  diff?: string;
  extraPrompt?: string;
}

export async function composeAuditPrompt(input: AuditPromptInput): Promise<string> {
  const profile = input.auditorProfile ?? await readBundledAuditorProfile();
  return [
    "# AHO Auditor Proposal Run",
    "",
    "You are running as a read-only Auditor for Agent Harness Orchestrator.",
    "",
    profile.trim(),
    "",
    "## Output Contract",
    "",
    "Your final answer must include exactly one status line:",
    "",
    "Status: approved | approved-with-notes | blocked",
    "",
    "For each finding, use this parseable shape:",
    "",
    "Finding: short title",
    "- Severity: blocking | note",
    "- Area: spec | implementation | validation | safety | maintainability",
    "- Evidence: concrete artifact, file, diff, or validation reference",
    "- Recommendation: specific next action",
    "",
    "If you cannot complete the audit from the provided evidence, use Status: blocked and explain what is missing.",
    "Do not edit files. Do not run commands. Do not merge, apply, or close the change.",
    "",
    "## Run Context Projection",
    "",
    input.context.trim(),
    "",
    "## Latest Validation",
    "",
    input.latestValidation.trim(),
    "",
    "## Diff Stat",
    "",
    input.diffStat?.trim() || "No worktree diff was provided.",
    "",
    "## Diff",
    "",
    input.diff?.trim() || "No worktree diff was provided.",
    "",
    input.extraPrompt?.trim() ? "## Additional Human Prompt" : "",
    input.extraPrompt?.trim() ?? "",
    "",
  ].join("\n");
}

async function readBundledAuditorProfile(): Promise<string> {
  return await readFile(join(getTemplateRoot(), "..", "agent-profiles", "auditor.md"), "utf8");
}
