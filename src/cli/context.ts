import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { resolveExistingDirectory } from "../fs/path.js";
import { ProjectRegistryStore } from "../registry/store.js";
import { auditHarness } from "../harness/audit.js";
import { assertWritableMemory, resolveMemory } from "../memory/resolver.js";
import { readProjectMarker } from "../project/marker.js";
import { getSpecTestStatus } from "../spec-test/manager.js";
import { printTable } from "./output.js";
import type { ManagedProject, MemoryMode, ResolvedMemory, SpecTestDriftReport } from "../types/index.js";

export interface CliContext {
  store: ProjectRegistryStore;
}

export function createCliContext(): CliContext {
  return { store: new ProjectRegistryStore() };
}

export { resolveExistingDirectory };

export async function resolveRegisteredOrPath(store: ProjectRegistryStore, query: string): Promise<{ project: Awaited<ReturnType<ProjectRegistryStore["resolveProject"]>>; path: string }> {
  const project = await store.resolveProject(query);
  if (project) return { project, path: project.path };
  return { project: null, path: await resolveExistingDirectory(query) };
}

export async function resolveManagedProject(store: ProjectRegistryStore, query: string): Promise<ManagedProject> {
  const project = await store.resolveProject(query);
  if (!project) {
    throw new Error("Project must be registered with `aho project add` before using managed project commands.");
  }
  const audit = await auditHarness(project.path);
  if (!audit.managed) {
    throw new Error("Project must be initialized with `aho harness init` before using change commands.");
  }
  if (audit.readiness !== "ready") {
    throw new Error(`Project Harness is not ready (${audit.readiness}); run \`aho harness audit ${project.id}\`.`);
  }
  return project;
}

export async function resolveManagedMemoryProject(store: ProjectRegistryStore, query: string, action: string): Promise<{ project: ManagedProject; memory: ResolvedMemory }> {
  const project = await store.resolveProject(query);
  if (!project) {
    throw new Error("Project must be registered with `aho project add` before using worktree commands.");
  }
  const marker = await readProjectMarker(project.path);
  if (!marker) {
    throw new Error("Project must be initialized with `aho harness init` before using worktree commands.");
  }
  const memory = resolveMemory({ ...project, marker });
  assertWritableMemory(memory, action);
  return { project, memory };
}

export function openUrl(url: string): void {
  const command = process.platform === "win32" ? "cmd" : process.platform === "darwin" ? "open" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

export function parseHarnessInitMemoryMode(input: string | undefined): Exclude<MemoryMode, "remote"> {
  if (!input || input === "repo-local") return "repo-local";
  if (input === "external-local") return "external-local";
  throw new Error("Unsupported harness memory mode. Use `repo-local` or `external-local`.");
}

export function collectOption(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

export async function readOptionalPromptInput(options: { prompt?: string; promptFile?: string }): Promise<string | undefined> {
  if (!options.prompt && !options.promptFile) return undefined;
  if (options.prompt && options.promptFile) throw new Error("Use either --prompt or --prompt-file, not both.");
  return options.promptFile ? readFile(resolve(options.promptFile), "utf8") : options.prompt;
}

export function printSpecTestStatus(status: Awaited<ReturnType<typeof getSpecTestStatus>>): void {
  printTable(status.acceptanceCriteria.map((item) => ({
    ac: item.acId,
    linkedEvidence: item.linkedEvidence,
    fileExists: item.evidenceFilesExist,
    validation: item.latestValidationStatus ?? "",
    confidence: item.confidence,
    warnings: item.warnings.length,
    blocking: item.blockingIssues.length,
  })));
  for (const issue of status.blockingIssues) console.log(`BLOCKING: ${issue}`);
  for (const warning of status.warnings) console.log(`WARNING: ${warning}`);
}

export function printSpecTestDrift(report: SpecTestDriftReport): void {
  console.log(`Change: ${report.changeId}`);
  console.log(`Selected root: ${report.selectedRootType}${report.selectedWorktreeId ? ` (${report.selectedWorktreeId})` : ""}`);
  console.log(`Latest validation: ${report.latestValidationId ?? "none"}${report.latestValidationStatus ? ` (${report.latestValidationStatus})` : ""}`);
  printTable(report.acceptanceCriteria.map((item) => ({
    ac: item.acId,
    status: item.status,
    reasons: item.reasons.length,
    warnings: item.warnings.length,
    blocking: item.blockingIssues.length,
    next: item.recommendedNextAction,
  })));
  for (const issue of report.blockingIssues) console.log(`BLOCKING: ${issue}`);
  for (const warning of report.warnings) console.log(`WARNING: ${warning}`);
  if (!report.strict.passed) {
    console.log(`STRICT: failed (${report.strict.failingStatuses.join(", ")})`);
  } else {
    console.log("STRICT: passed");
  }
}
