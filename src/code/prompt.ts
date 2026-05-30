import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getTemplateRoot } from "../template-source/paths.js";
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
    "# AHO Coder Worktree Run",
    "",
    "You are running as the Coder Agent for Agent Harness Orchestrator.",
    "",
    profile.trim(),
    "",
    "## Command Boundary",
    "",
    "- You are a worker role, not the orchestrator.",
    "- Do not call delegateTask, do not spawn subagents, and do not create additional role tasks.",
    "- Modify files only inside the assigned worktree checkout.",
    "- Treat the source project path as read-only context.",
    "- Do not apply, merge, close, archive, or evolve Harness rules.",
    "- Your output is a proposal; AHO Validator, Auditor, and the human user decide acceptance.",
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
    "## Final Output Contract",
    "",
    "Your final answer should use this shape:",
    "",
    "Status: completed | blocked | failed",
    "",
    "Modified Files:",
    "- path",
    "",
    "Task / AC Coverage:",
    "- T-001 -> AC-001: note",
    "",
    "Implementation Notes:",
    "- note",
    "",
    "Verification Attempted:",
    "- command: result",
    "- or none",
    "",
    "Blockers / Follow-up:",
    "- item",
    "- or none",
    "",
  ].join("\n");
}

async function readBundledCoderProfile(): Promise<string> {
  return await readFile(join(getTemplateRoot(), "..", "agent-profiles", "coder.md"), "utf8");
}
