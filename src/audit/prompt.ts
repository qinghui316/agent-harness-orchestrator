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
    "# Agent Profile",
    "",
    profile.trim(),
    "",
    "# Task Packet",
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
  return await readFile(join(getTemplateRoot(), "..", "agent-profiles", "auditor-agent.md"), "utf8");
}
