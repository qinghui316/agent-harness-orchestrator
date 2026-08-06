import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { writeJsonFile } from "../fs/json.js";
import { gitText } from "../project/git.js";
import { executeProcessStreaming } from "../run/process.js";
import type { ProjectExecutionRuntimePort } from "../project-runtime/execution-ports.js";
import { resolveSkillNativeValidationProfile, type ValidationProfile } from "../validation/profiles.js";
import { prepareWorktreeDependencyBridge } from "../worktree/dependencies.js";
import { displaySkillNativeArtifactPath } from "./paths.js";
import type { AggregateValidationResult, AggregateValidationStatus } from "./types.js";

export async function runSkillNativeAggregateValidation(
  runtime: ProjectExecutionRuntimePort,
  directory: string,
  checkId: string,
  checkoutPath: string,
  shouldRun: boolean,
): Promise<AggregateValidationResult> {
  return runAggregateValidationCore(runtime, directory, checkId, checkoutPath, shouldRun, {
    artifactRef: (path) => displaySkillNativeArtifactPath(runtime, path),
    resolveProfile: () => resolveOptionalSkillNativeAggregateProfile(runtime.projectRoot),
  });
}

async function runAggregateValidationCore(
  memory: Pick<ProjectExecutionRuntimePort, "projectRoot">,
  directory: string,
  checkId: string,
  checkoutPath: string,
  shouldRun: boolean,
  ports: { artifactRef(path: string): string; resolveProfile(): Promise<ValidationProfile | null> },
): Promise<AggregateValidationResult> {
  const id = `aggregate-validation-${checkId}`;
  let status: AggregateValidationStatus = "passed";
  let exitCode: number | null = 0;
  let stdout = "";
  let stderr = "";
  let command = ["git", "diff", "--check"];
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
      const profile = await ports.resolveProfile();
      if (profile) {
        command = ["aggregate-validation-profile", profile.name, ...profile.commands.map((item) => item.name)];
        const bridge = await prepareWorktreeDependencyBridge({ sourceRoot: memory.projectRoot, checkoutPath });
        stdout += renderAggregateValidationNote(`Dependency bridge: ${bridge.status}${bridge.reason ? ` (${bridge.reason})` : ""}.`);
        const commandResult = await runAggregateValidationProfile(directory, checkoutPath, profile.commands);
        stdout += commandResult.stdout;
        stderr += commandResult.stderr;
        if (commandResult.status !== "passed") {
          status = "failed";
          exitCode = commandResult.exitCode;
          command = commandResult.command;
        }
      } else {
        stdout += renderAggregateValidationNote("No project validation profile was available; only git diff --check was run.");
      }
    } catch (cause) {
      status = "failed";
      exitCode = 1;
      stderr = cause instanceof Error ? cause.message : String(cause);
    }
  }
  const artifactRef = ports.artifactRef(join(directory, "aggregate-validation.json"));
  const result: AggregateValidationResult = {
    id,
    status,
    command,
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

async function resolveOptionalSkillNativeAggregateProfile(projectRoot: string): Promise<ValidationProfile | null> {
  try {
    return await resolveSkillNativeValidationProfile(projectRoot);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("package.json was not found for fallback detection") || message.includes("package.json has none of")) return null;
    throw error;
  }
}

async function runAggregateValidationProfile(
  directory: string,
  checkoutPath: string,
  commands: ValidationProfile["commands"],
): Promise<{ status: AggregateValidationStatus; command: string[]; exitCode: number | null; stdout: string; stderr: string }> {
  const commandsDir = join(directory, "aggregate-validation-commands");
  await mkdir(commandsDir, { recursive: true });
  let stdout = "";
  let stderr = "";
  for (let index = 0; index < commands.length; index += 1) {
    const item = commands[index];
    const prefix = `${(index + 1).toString().padStart(3, "0")}-${slugForArtifact(item.name)}`;
    const stdoutPath = join(commandsDir, `${prefix}.stdout.log`);
    const stderrPath = join(commandsDir, `${prefix}.stderr.log`);
    const result = await executeProcessStreaming({
      cwd: checkoutPath,
      command: item.command[0] as string,
      args: item.command.slice(1),
      stdoutPath,
      stderrPath,
    });
    stdout += renderAggregateValidationNote(`Command ${item.name}: ${item.command.join(" ")} -> ${result.exitCode ?? "signal"}.`);
    if (result.stdoutSample) stdout += `\n## ${item.name} stdout\n\n\`\`\`\n${result.stdoutSample}\n\`\`\`\n`;
    if (result.stderrSample) stderr += `\n## ${item.name} stderr\n\n\`\`\`\n${result.stderrSample}\n\`\`\`\n`;
    if (result.exitCode !== 0 || result.terminated) {
      return {
        status: "failed",
        command: item.command,
        exitCode: result.exitCode ?? 1,
        stdout,
        stderr,
      };
    }
  }
  return { status: "passed", command: ["aggregate-validation-profile", ...commands.map((item) => item.name)], exitCode: 0, stdout, stderr };
}

function slugForArtifact(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "command";
}

function renderAggregateValidationNote(message: string): string {
  return `\n## ${message}\n`;
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
