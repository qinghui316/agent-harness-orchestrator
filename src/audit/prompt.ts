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
    "You are a worker role, not the orchestrator. Do not call delegateTask, do not spawn subagents, and do not create additional role tasks.",
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
    "## Authoritative Audit Packet",
    "",
    "For this AHO audit run, the packet below is sufficient review evidence unless a concrete required artifact is missing.",
    "Treat the run context, active AC/task summary, diff stat, full diff, and latest validation summary as the authoritative audit packet for this proposal.",
    "Do not block only because external-local durable memory is outside the Codex working directory.",
    "If extra memory is available through an additional read-only directory, you may inspect it, but do not require it when the packet is complete.",
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
