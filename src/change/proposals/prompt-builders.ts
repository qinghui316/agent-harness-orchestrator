import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { buildAgentSystemPrompt } from "../../agent/catalog.js";
import type { ResolvedMemory } from "../../types/index.js";
import type { CommonProposalRun } from "./types.js";

export async function composeSpecPrompt(prepared: CommonProposalRun, extraPrompt?: string): Promise<string> {
  const files = await readActiveChangeFiles(prepared.changePath);
  const docs = await collectBoundedProjectDocs(prepared.memory);
  return [
    "# AHO Spec Agent Proposal Run",
    "",
    "You are running as a read-only Spec Agent. Generate a proposal only.",
    "",
    buildAgentSystemPrompt(prepared.role),
    "",
    "## Output Contract",
    "",
    "Your final answer must include a JSON object in a fenced ```json block.",
    "",
    "```json",
    "{",
    "  \"status\": \"proposed | blocked | failed\",",
    "  \"specMd\": \"complete proposed spec.md content\",",
    "  \"openQuestions\": [],",
    "  \"assumptions\": [],",
    "  \"warnings\": []",
    "}",
    "```",
    "",
    "High-impact open questions must make status blocked. Low-risk assumptions may remain proposed.",
    "Only define WHAT/WHY. Do not write implementation plan, tasks, code, validation commands, or reviews.",
    "",
    "## Run Context Projection",
    prepared.context,
    "",
    "## Active Change Files",
    renderActiveFiles(files),
    "",
    "## Bounded Project Docs Context",
    docs,
    "",
    extraPrompt?.trim() ? "## Additional Human Prompt" : "",
    extraPrompt?.trim() ?? "",
    "",
  ].join("\n");
}

export async function composePlanPrompt(prepared: CommonProposalRun, extraPrompt?: string): Promise<string> {
  const files = await readActiveChangeFiles(prepared.changePath);
  const docs = await collectBoundedProjectDocs(prepared.memory);
  return [
    "# AHO Planner Proposal Run",
    "",
    "You are running as a read-only Planner Agent. Generate plan/tasks proposal only.",
    "",
    buildAgentSystemPrompt(prepared.role),
    "",
    "## Output Contract",
    "",
    "Your final answer must include a JSON object in a fenced ```json block.",
    "",
    "```json",
    "{",
    "  \"status\": \"proposed | blocked | failed\",",
    "  \"planMd\": \"complete proposed plan.md content\",",
    "  \"tasksMd\": \"complete proposed tasks.md content\",",
    "  \"openQuestions\": [],",
    "  \"assumptions\": [],",
    "  \"warnings\": []",
    "}",
    "```",
    "",
    "Tasks must use T-xxx IDs and each task must include a Covers line with AC-xxx IDs.",
    "Do not write code, create worktrees, run validation, edit reviews, or claim approval.",
    "",
    "## Run Context Projection",
    prepared.context,
    "",
    "## Active Change Files",
    renderActiveFiles(files),
    "",
    "## Bounded Project Docs Context",
    docs,
    "",
    extraPrompt?.trim() ? "## Additional Human Prompt" : "",
    extraPrompt?.trim() ?? "",
    "",
  ].join("\n");
}

export async function readActiveChangeFiles(changePath: string): Promise<{ summary: string; spec: string; plan: string; tasks: string; review: string }> {
  return {
    summary: await safeRead(join(changePath, "summary.md")),
    spec: await safeRead(join(changePath, "spec.md")),
    plan: await safeRead(join(changePath, "plan.md")),
    tasks: await safeRead(join(changePath, "tasks.md")),
    review: await safeRead(join(changePath, "reviews", "review.md")),
  };
}

async function collectBoundedProjectDocs(memory: ResolvedMemory): Promise<string> {
  const docs = [
    { label: "AGENTS.md", path: memory.agentGuidePath },
    { label: "docs/ECL.md", path: join(memory.docsRoot, "ECL.md") },
    { label: "docs/PRODUCT.md", path: join(memory.docsRoot, "PRODUCT.md") },
    { label: "docs/ARCHITECTURE.md", path: join(memory.docsRoot, "ARCHITECTURE.md") },
    { label: "docs/BOUNDARIES.md", path: join(memory.docsRoot, "BOUNDARIES.md") },
    { label: "docs/STATUS.md", path: join(memory.docsRoot, "STATUS.md") },
  ];
  const sections: string[] = [];
  for (const doc of docs) {
    if (!existsSync(doc.path)) continue;
    sections.push(`### ${doc.label}`, "", "```markdown", await safeRead(doc.path, 6000), "```", "");
  }
  return sections.join("\n") || "No bounded project docs discovered.";
}

function renderActiveFiles(files: Awaited<ReturnType<typeof readActiveChangeFiles>>): string {
  return [
    "### summary.md",
    "```markdown",
    files.summary,
    "```",
    "### spec.md",
    "```markdown",
    files.spec,
    "```",
    "### plan.md",
    "```markdown",
    files.plan,
    "```",
    "### tasks.md",
    "```markdown",
    files.tasks,
    "```",
    "### reviews/review.md",
    "```markdown",
    files.review,
    "```",
  ].join("\n");
}

async function safeRead(path: string, maxChars = 12000): Promise<string> {
  if (!existsSync(path)) return "";
  const value = await readFile(path, "utf8");
  return value.length > maxChars ? `${value.slice(0, maxChars)}\n\n[AHO truncated file at ${maxChars} chars]\n` : value;
}
