import { access, mkdir, readdir, writeFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { writeJsonFile } from "../fs/json.js";
import { shortHash } from "../fs/path.js";
import type { ResolvedMemory } from "../types/index.js";
import type { AutomationAuthorization, AutomationIteration, AutomationRun, AutomationStopReason } from "./types.js";

const RUNTIME_DIR = "automation-runtime";

export function automationRuntimeRoot(memory: ResolvedMemory, changePath: string): string {
  return join(memory.memoryRoot, changePath, "planning", RUNTIME_DIR);
}

export function createAutomationRuntimeId(prefix: string, seed: string): string {
  const now = new Date().toISOString();
  return `${prefix}-${now.replace(/[-:.TZ]/g, "").slice(0, 14)}-${shortHash(`${seed}:${now}`)}`;
}

export function automationRuntimeArtifactRefs(memory: ResolvedMemory, changePath: string, id: string): { artifact: string; markdownArtifact: string } {
  const root = automationRuntimeRoot(memory, changePath);
  return {
    artifact: displayMemoryPath(memory, join(root, `${id}.json`)),
    markdownArtifact: displayMemoryPath(memory, join(root, `${id}.md`)),
  };
}

export async function writeAutomationAuthorization(memory: ResolvedMemory, changePath: string, authorization: AutomationAuthorization): Promise<void> {
  await writeAutomationRecord(memory, changePath, authorization.id, authorization, renderAuthorizationMarkdown(authorization));
}

export async function writeAutomationRun(memory: ResolvedMemory, changePath: string, run: AutomationRun): Promise<void> {
  await writeAutomationRecord(memory, changePath, run.id, run, renderRunMarkdown(run));
}

export async function writeAutomationIteration(memory: ResolvedMemory, changePath: string, iteration: AutomationIteration): Promise<void> {
  await writeAutomationRecord(memory, changePath, iteration.id, iteration, renderIterationMarkdown(iteration));
}

async function writeAutomationRecord(memory: ResolvedMemory, changePath: string, id: string, value: unknown, markdown: string): Promise<void> {
  const root = await automationRuntimeRootForWrite(memory, changePath, changeIdFromRecord(value));
  await mkdir(root, { recursive: true });
  const jsonPath = join(root, `${id}.json`);
  const markdownPath = join(root, `${id}.md`);
  updateRecordArtifactRefs(memory, value, jsonPath, markdownPath);
  await writeJsonFile(jsonPath, value);
  await writeFile(markdownPath, markdown, "utf8");
}

async function automationRuntimeRootForWrite(memory: ResolvedMemory, changePath: string, changeId: string | undefined): Promise<string> {
  const root = automationRuntimeRoot(memory, changePath);
  const changeRoot = join(memory.memoryRoot, changePath);
  if (!isActiveChangePath(changePath) || await pathExists(changeRoot)) {
    return root;
  }
  const archivePath = changeId ? await findArchivedChangePath(memory, changeId) : null;
  return archivePath ? join(memory.memoryRoot, archivePath, "planning", RUNTIME_DIR) : root;
}

function isActiveChangePath(changePath: string): boolean {
  return changePath.replace(/\\/g, "/").startsWith("harness/changes/active/");
}

async function findArchivedChangePath(memory: ResolvedMemory, changeId: string): Promise<string | null> {
  const archiveRoot = join(memory.memoryRoot, "harness", "changes", "archive");
  let entries: string[];
  try {
    entries = await readdir(archiveRoot);
  } catch {
    return null;
  }
  const suffix = `-${changeId}`;
  const match = entries
    .filter((entry) => entry === changeId || entry.endsWith(suffix))
    .sort()
    .at(-1);
  return match ? ["harness", "changes", "archive", match].join(sep) : null;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function changeIdFromRecord(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const candidate = (value as { changeId?: unknown }).changeId;
  return typeof candidate === "string" && candidate.trim() ? candidate : undefined;
}

function updateRecordArtifactRefs(memory: ResolvedMemory, value: unknown, artifactPath: string, markdownPath: string): void {
  if (!value || typeof value !== "object") return;
  const record = value as { artifact?: unknown; markdownArtifact?: unknown };
  if (typeof record.artifact === "string") {
    record.artifact = displayMemoryPath(memory, artifactPath);
  }
  if (typeof record.markdownArtifact === "string") {
    record.markdownArtifact = displayMemoryPath(memory, markdownPath);
  }
}

function renderAuthorizationMarkdown(authorization: AutomationAuthorization): string {
  return [
    `# Scoped Automation Authorization: ${authorization.id}`,
    "",
    `- Project: ${authorization.projectId}`,
    `- Change: ${authorization.changeId}`,
    `- Mode: ${authorization.mode}`,
    `- Codex runtime capability: ${authorization.codexRuntimeCapability}`,
    `- Max steps: ${authorization.maxSteps}`,
    `- Current gate: ${authorization.requestedGate.automationCurrentGateActionType ?? authorization.requestedGate.automationCurrentGateApprovalActionId ?? authorization.requestedGate.actionType ?? "unknown"}`,
    "",
    "## Boundaries",
    "",
    "- Scope: current project and current Change only",
    `- Apply authorized: ${authorization.applyAuthorized ? "true" : "false"}`,
    `- Close authorized: ${authorization.closeAuthorized ? "true" : "false"}`,
    "- Merge/remote authorized: false",
    "- Harness evolution authorized: false",
    "- Parallel executor authorized: false",
    "",
  ].join("\n");
}

function renderRunMarkdown(run: AutomationRun): string {
  return [
    `# Scoped Automation Run: ${run.id}`,
    "",
    `- Project: ${run.projectId}`,
    `- Change: ${run.changeId}`,
    `- Authorization: ${run.automationAuthorizationId}`,
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

function renderIterationMarkdown(iteration: AutomationIteration): string {
  return [
    `# Scoped Automation Iteration: ${iteration.id}`,
    "",
    `- Project: ${iteration.projectId}`,
    `- Change: ${iteration.changeId}`,
    `- Automation run: ${iteration.automationRunId}`,
    `- Authorization: ${iteration.automationAuthorizationId}`,
    `- Ordinal: ${iteration.ordinal}`,
    `- Submitted action: ${iteration.submittedActionType ?? iteration.submittedApprovalActionId ?? "none"}`,
    `- Current gate: ${iteration.currentGateActionType ?? "unknown"}`,
    `- Status: ${iteration.status}`,
    `- Stop reason: ${iteration.stopReason ?? "none"}`,
    `- Summary: ${iteration.resultSummary ?? iteration.error ?? ""}`,
    "",
  ].join("\n");
}

export function automationStopReasonSummary(reason: AutomationStopReason): string {
  switch (reason) {
    case "max-steps": return "Reached the scoped automation step budget.";
    case "no-primary-gate": return "No current primary confirmation gate is available.";
    case "unsupported-gate": return "The current primary gate is outside scoped automation V1.";
    case "terminal-human-gate": return "Scoped automation stopped at a human terminal gate.";
    case "stale-target": return "The current gate target is stale or mismatched.";
    case "source-drift": return "Source state changed outside the authorization scope.";
    case "accepted-artifact-drift": return "Accepted artifact hashes changed outside the authorization scope.";
    case "in-flight-action": return "Another workflow action is already running.";
    case "blocked": return "Current evidence is blocked or requires user direction.";
    case "handler-failed": return "A scoped automation child action failed.";
  }
}

function displayMemoryPath(memory: ResolvedMemory, absolutePath: string): string {
  const rel = relative(memory.memoryRoot, absolutePath).replace(/\\/g, "/");
  return rel.startsWith("..") ? absolutePath : rel;
}
