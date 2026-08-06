
import { writeFile } from "node:fs/promises";
import { getGitStatusShort } from "../project/git.js";

export async function getSortedSourceStatus(projectPath: string): Promise<string[]> {
  return (await getGitStatusShort(projectPath)).slice().sort();
}

export async function writeEmptyCodeArtifacts(
  paths: { stdout: string; stderr: string; providerEvents: string; lastMessage: string; diff: string; diffStat: string; implementation: string },
  message: string,
): Promise<void> {
  await writeFile(paths.stdout, "", "utf8");
  await writeFile(paths.stderr, message, "utf8");
  await writeFile(paths.providerEvents, "", "utf8");
  await writeFile(paths.lastMessage, message, "utf8");
  await writeFile(paths.diff, "", "utf8");
  await writeFile(paths.diffStat, "", "utf8");
  await writeFile(paths.implementation, message, "utf8");
}

export function renderImplementationSummary(input: { lastMessage: string; diffStat: string; diff: string; warnings: string[]; sourceBefore: string[]; sourceAfter: string[] }): string {
  const modifiedFiles = extractModifiedFilesFromDiff(input.diff);
  return [
    "# Implementation Summary",
    "",
    "## Coder Final Message",
    "",
    input.lastMessage.trim() || "(empty)",
    "",
    "## Modified Files",
    "",
    ...(modifiedFiles.length ? modifiedFiles.map((file) => `- ${file}`) : ["- None detected."]),
    "",
    "## Diff Stat",
    "",
    input.diffStat.trim() || "No diff stat.",
    "",
    "## Warnings",
    "",
    ...(input.warnings.length ? input.warnings.map((warning) => `- ${warning}`) : ["- None."]),
    "",
    "## Source Repo Status Check",
    "",
    `Before: ${input.sourceBefore.join(" | ") || "(clean)"}`,
    `After: ${input.sourceAfter.join(" | ") || "(clean)"}`,
    "",
  ].join("\n");
}

export function extractModifiedFilesFromDiff(diff: string): string[] {
  const files = new Set<string>();
  for (const line of diff.split(/\r?\n/)) {
    const match = /^diff --git a\/(.+?) b\/(.+)$/.exec(line);
    if (match) files.add(match[2]);
  }
  return Array.from(files).sort();
}
