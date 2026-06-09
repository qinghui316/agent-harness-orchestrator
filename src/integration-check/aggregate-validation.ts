import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonFile } from "../fs/json.js";
import { gitText } from "../project/git.js";
import type { ResolvedMemory } from "../types/index.js";
import { displayArtifactPath } from "./paths.js";
import type { AggregateValidationResult, AggregateValidationStatus } from "./types.js";

export async function runAggregateValidation(
  memory: ResolvedMemory,
  directory: string,
  checkId: string,
  checkoutPath: string,
  shouldRun: boolean,
): Promise<AggregateValidationResult> {
  const id = `aggregate-validation-${checkId}`;
  let status: AggregateValidationStatus = "passed";
  let exitCode: number | null = 0;
  let stdout = "";
  let stderr = "";
  if (!shouldRun) {
    status = "failed";
    exitCode = null;
    stderr = "Integration patch was not applied; aggregate validation skipped.";
  } else if (existsSync(join(checkoutPath, "integration-validation-fail.txt"))) {
    status = "failed";
    exitCode = 1;
    stderr = "Aggregate validation failed: integration-validation-fail.txt marker exists.";
  } else {
    try {
      stdout = await gitText(checkoutPath, ["diff", "--check"]);
    } catch (cause) {
      status = "failed";
      exitCode = 1;
      stderr = cause instanceof Error ? cause.message : String(cause);
    }
  }
  const artifactRef = displayArtifactPath(memory, join(directory, "aggregate-validation.json"));
  const result: AggregateValidationResult = {
    id,
    status,
    command: ["git", "diff", "--check"],
    exitCode,
    stdout,
    stderr,
    artifactRef,
    createdAt: new Date().toISOString(),
  };
  await writeJsonFile(join(directory, "aggregate-validation.json"), result);
  await writeFile(join(directory, "aggregate-validation.md"), renderAggregateValidation(result), "utf8");
  return result;
}

function renderAggregateValidation(result: AggregateValidationResult): string {
  return [
    `# ${result.id}`,
    "",
    `- Status: ${result.status}`,
    `- Exit code: ${result.exitCode ?? "-"}`,
    result.stdout ? `\n## Stdout\n\n\`\`\`\n${result.stdout}\n\`\`\`` : "",
    result.stderr ? `\n## Stderr\n\n\`\`\`\n${result.stderr}\n\`\`\`` : "",
    "",
  ].filter(Boolean).join("\n");
}
