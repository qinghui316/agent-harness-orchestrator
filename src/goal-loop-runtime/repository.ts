import { mkdir, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { writeJsonFile } from "../fs/json.js";
import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";
import type { GoalLoopRuntimeAuthorization, GoalLoopRuntimeIteration, GoalLoopRuntimeRun, GoalLoopRuntimeStopReason } from "./types.js";

const RUNTIME_DIR = "goal-loop-runtime";

export function goalLoopRuntimeRoot(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", RUNTIME_DIR);
}

export function createGoalLoopRuntimeId(prefix: string, seed: string): string {
  const now = new Date().toISOString();
  return `${prefix}-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${seed}:${now}`)}`;
}

export function goalLoopRuntimeArtifactRefs(memory: ResolvedMemory, changePath: string, id: string): { artifact: string; markdownArtifact: string } {
  const root = goalLoopRuntimeRoot(memory, changePath);
  return {
    artifact: displayMemoryPath(memory, join(root, `${id}.json`)),
    markdownArtifact: displayMemoryPath(memory, join(root, `${id}.md`)),
  };
}

export async function writeGoalLoopRuntimeAuthorization(memory: ResolvedMemory, changePath: string, authorization: GoalLoopRuntimeAuthorization): Promise<void> {
  await writeGoalLoopRuntimeRecord(memory, changePath, authorization.id, authorization, renderAuthorizationMarkdown(authorization));
}

export async function writeGoalLoopRuntimeRun(memory: ResolvedMemory, changePath: string, run: GoalLoopRuntimeRun): Promise<void> {
  await writeGoalLoopRuntimeRecord(memory, changePath, run.id, run, renderRunMarkdown(run));
}

export async function writeGoalLoopRuntimeIteration(memory: ResolvedMemory, changePath: string, iteration: GoalLoopRuntimeIteration): Promise<void> {
  await writeGoalLoopRuntimeRecord(memory, changePath, iteration.id, iteration, renderIterationMarkdown(iteration));
}

async function writeGoalLoopRuntimeRecord(memory: ResolvedMemory, changePath: string, id: string, value: unknown, markdown: string): Promise<void> {
  const root = goalLoopRuntimeRoot(memory, changePath);
  await mkdir(root, { recursive: true });
  await writeJsonFile(join(root, `${id}.json`), value);
  await writeFile(join(root, `${id}.md`), markdown, "utf8");
}

function renderAuthorizationMarkdown(authorization: GoalLoopRuntimeAuthorization): string {
  return [
    `# Goal Loop Runtime Authorization: ${authorization.id}`,
    "",
    `- Change: ${authorization.changeId}`,
    `- Authority: ${authorization.authority}`,
    `- Max steps: ${authorization.maxSteps}`,
    `- Allowed child action: ${authorization.allowedChildActionType}`,
    `- Packet: ${authorization.sourceGoalLoopNextStepPacketId}`,
    `- Controller policy: ${authorization.sourceGoalLoopControllerPolicyId}`,
    `- Gate preflight: ${authorization.sourceGoalLoopGateReadinessPreflightId}`,
    "",
    "## Boundaries",
    "",
    "- Full-auto authorized: false",
    "- Parallel executor authorized: false",
    "- Source mutation authorized: false",
    "- Apply/close/merge/remote/Harness evolution authorized: false",
    "",
  ].join("\n");
}

function renderRunMarkdown(run: GoalLoopRuntimeRun): string {
  return [
    `# Goal Loop Runtime Run: ${run.id}`,
    "",
    `- Change: ${run.changeId}`,
    `- Authorization: ${run.goalLoopRuntimeAuthorizationId}`,
    `- Status: ${run.status}`,
    `- Completed steps: ${run.completedSteps}/${run.maxSteps}`,
    `- Stop reason: ${run.stopReason ?? "none"}`,
    `- Summary: ${run.stopSummary ?? "running"}`,
    "",
    "## Iterations",
    "",
    ...(run.iterations.length ? run.iterations.map((id) => `- ${id}`) : ["- none"]),
    "",
  ].join("\n");
}

function renderIterationMarkdown(iteration: GoalLoopRuntimeIteration): string {
  return [
    `# Goal Loop Runtime Iteration: ${iteration.id}`,
    "",
    `- Change: ${iteration.changeId}`,
    `- Runtime run: ${iteration.goalLoopRuntimeRunId}`,
    `- Authorization: ${iteration.goalLoopRuntimeAuthorizationId}`,
    `- Ordinal: ${iteration.ordinal}`,
    `- Submitted action: ${iteration.submittedActionType}`,
    `- Current gate: ${iteration.currentGateActionType ?? "unknown"}`,
    `- Status: ${iteration.status}`,
    `- Stop reason: ${iteration.stopReason ?? "none"}`,
    `- Summary: ${iteration.resultSummary ?? iteration.error ?? ""}`,
    "",
  ].join("\n");
}

export function stopReasonSummary(reason: GoalLoopRuntimeStopReason): string {
  switch (reason) {
    case "max-steps": return "Reached the bounded continuation step budget.";
    case "no-current-gate": return "No current controlled Scheduler gate is available.";
    case "unsupported-gate": return "The current gate is not supported by controlled continuation V1.";
    case "stale-target": return "The current gate target is stale or mismatched.";
    case "source-safety": return "Source state requires user review before continuing.";
    case "in-flight-action": return "Another workflow action is already running.";
    case "blocked": return "Current evidence is blocked or requires user direction.";
    case "high-impact-terminal-gate": return "Continuation stopped at a terminal high-impact human gate.";
    case "handler-failed": return "A child controlled Scheduler step failed.";
  }
}

function displayMemoryPath(memory: ResolvedMemory, absolutePath: string): string {
  const rel = relative(memory.memoryRoot, absolutePath).replace(/\\/g, "/");
  return rel.startsWith("..") ? absolutePath : rel;
}
