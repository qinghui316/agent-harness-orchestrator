import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export interface CodexPromptInput {
  context: string;
  userPrompt: string;
}

export async function readPromptInput(options: { prompt?: string; promptFile?: string }): Promise<string> {
  if (options.prompt && options.promptFile) {
    throw new Error("Use either --prompt or --prompt-file, not both.");
  }
  if (!options.prompt && !options.promptFile) {
    throw new Error("Codex run requires --prompt or --prompt-file.");
  }
  if (options.promptFile) {
    return await readFile(resolve(options.promptFile), "utf8");
  }
  return options.prompt ?? "";
}

export function composeCodexPrompt(input: CodexPromptInput): string {
  return [
    "# AHO Codex Read-Only Proposal Run",
    "",
    "You are running inside Agent Harness Orchestrator as a read-only proposal executor.",
    "",
    "Rules:",
    "",
    "- Do not edit files.",
    "- Do not apply patches.",
    "- Do not run commands that modify the repository.",
    "- Produce a proposal or analysis only.",
    "- Treat the context projection below as run-local context, not the source of truth.",
    "- Durable project memory lives in the repository Harness, docs, archives, and run artifacts.",
    "",
    "## Run Context Projection",
    "",
    input.context.trim(),
    "",
    "## User Prompt",
    "",
    input.userPrompt.trim(),
    "",
  ].join("\n");
}
