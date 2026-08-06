import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getAgentProfilesRoot } from "../template-source/paths.js";
import type { ChangeStatus, WorktreeMetadata } from "../types/index.js";

export interface CoderPromptInput {
  context: string;
  changeStatus: ChangeStatus;
  worktree: WorktreeMetadata;
  sourceProjectPath: string;
  selectedTasks: string[];
  extraPrompt?: string;
  coderProfile?: string;
}

export async function composeCoderPrompt(input: CoderPromptInput): Promise<string> {
  const profile = input.coderProfile ?? await readBundledCoderProfile();
  const selectedTaskSet = new Set(input.selectedTasks.map((task) => task.toUpperCase()));
  const taskScope = input.selectedTasks.length > 0
    ? input.changeStatus.acMap?.tasks
      .filter((task) => selectedTaskSet.has(task.id.toUpperCase()))
      .map((task) => `- ${task.id}: ${task.text}; Covers: ${task.acIds.join(", ") || "none"}`)
      .join("\n") || input.selectedTasks.map((task) => `- ${task}`).join("\n")
    : "Whole active change.";

  return [
    "# Agent Profile",
    "",
    profile.trim(),
    "",
    "# Task Packet",
    "",
    "## Assigned Worktree",
    "",
    `- Worktree ID: ${input.worktree.worktreeId}`,
    `- Checkout path: ${input.worktree.checkoutPath}`,
    `- Branch: ${input.worktree.branchName}`,
    `- Base ref: ${input.worktree.baseRef}`,
    `- Base commit: ${input.worktree.baseCommit}`,
    "",
    "## Source Project",
    "",
    `- Source project path: ${input.sourceProjectPath}`,
    "- Source project is read/context only. Do not edit it directly.",
    "",
    "## Selected Task Scope",
    "",
    taskScope,
    "",
    "## Run Context Projection",
    "",
    input.context.trim(),
    "",
    input.extraPrompt?.trim() ? "## Additional Human Prompt" : "",
    input.extraPrompt?.trim() ?? "",
    "",
  ].join("\n");
}

async function readBundledCoderProfile(): Promise<string> {
  return await readFile(join(getAgentProfilesRoot(), "coder-agent.md"), "utf8");
}
