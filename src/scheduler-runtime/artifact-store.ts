import { existsSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { hashFile } from "../workflow-artifacts/hashes.js";
import type { WorkflowArtifactWithChange } from "../workflow-artifacts/types.js";

export interface SchedulerArtifactStore {
  changeId: string;
  changeEvidenceRoot: string;
  planningRoot: string;
  runtimeRoot: string;
  artifactRoots: readonly string[];
  runArtifacts: SchedulerRunArtifactPaths;
}

export interface SchedulerRunArtifactPaths {
  root: string;
  runPath: (schedulerRunId: string) => string;
  journalPath: (schedulerRunId: string) => string;
  latestRunPath: () => string;
  latestRunMarkdownPath: () => string;
}

export function createSchedulerArtifactStore(input: {
  changeId: string;
  changeEvidenceRoot: string;
  artifactRoots: readonly string[];
}): SchedulerArtifactStore {
  const changeEvidenceRoot = resolve(input.changeEvidenceRoot);
  const planningRoot = join(changeEvidenceRoot, "planning");
  return {
    changeId: input.changeId,
    changeEvidenceRoot,
    planningRoot,
    runtimeRoot: join(changeEvidenceRoot, "planning", "scheduler-runs"),
    artifactRoots: input.artifactRoots.map((root) => resolve(root)),
    runArtifacts: schedulerPlanningRunArtifactPaths(planningRoot),
  };
}

export function schedulerPlanningRunArtifactPaths(planningRoot: string): SchedulerRunArtifactPaths {
  const root = join(planningRoot, "scheduler-runs");
  return {
    root,
    runPath: (schedulerRunId) => join(root, `${schedulerRunId}.json`),
    journalPath: (schedulerRunId) => join(root, `${schedulerRunId}.jsonl`),
    latestRunPath: () => join(planningRoot, "scheduler-run.json"),
    latestRunMarkdownPath: () => join(planningRoot, "scheduler-run.md"),
  };
}

export function skillNativeSchedulerRunArtifactPaths(
  runtimeRoot: string,
  currentSchedulerRunId: string,
): SchedulerRunArtifactPaths {
  const currentRoot = join(runtimeRoot, currentSchedulerRunId);
  return {
    root: runtimeRoot,
    runPath: (schedulerRunId) => join(runtimeRoot, schedulerRunId, "scheduler-run.json"),
    journalPath: (schedulerRunId) => join(runtimeRoot, schedulerRunId, "scheduler-run-events.jsonl"),
    latestRunPath: () => join(currentRoot, "scheduler-run.json"),
    latestRunMarkdownPath: () => join(currentRoot, "scheduler-run.md"),
  };
}

export function schedulerPlanningRoot(store: SchedulerArtifactStore, _changePath: string): string {
  return store.planningRoot;
}

export function schedulerRuntimeRoot(
  store: SchedulerArtifactStore,
  _changePath: string,
  schedulerRunId: string,
): string {
  return assertWithin(store.runtimeRoot, join(store.runtimeRoot, schedulerRunId), "Scheduler runtime root");
}

export function schedulerArtifactRef(store: SchedulerArtifactStore, absolutePath: string): string {
  const target = resolve(absolutePath);
  for (const root of store.artifactRoots) {
    const scoped = relative(resolve(root), target);
    if (scoped && !isAbsolute(scoped) && scoped !== ".." && !scoped.startsWith(`..${sep}`)) {
      return scoped.replace(/\\/g, "/");
    }
  }
  throw new Error("Scheduler artifact path escapes its declared Skill and sidecar roots.");
}

export function resolveSchedulerArtifactRef(store: SchedulerArtifactStore, ref: string): string {
  if (isAbsolute(ref) || /^[a-zA-Z]:[\\/]/.test(ref)) {
    throw new Error("Scheduler artifact references must be portable.");
  }
  for (const root of store.artifactRoots) {
    const target = resolve(root, ref);
    const scoped = relative(resolve(root), target);
    if (scoped && !isAbsolute(scoped) && scoped !== ".." && !scoped.startsWith(`..${sep}`) && existsSync(target)) {
      return target;
    }
  }
  throw new Error(`Scheduler artifact reference is not owned by a declared root: ${ref}.`);
}

export async function hashSchedulerArtifactRefs(
  store: SchedulerArtifactStore,
  refs: string[],
): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const ref of refs) hashes[ref] = await hashFile(resolveSchedulerArtifactRef(store, ref));
  return hashes;
}

export async function assertSchedulerChangeScope(
  store: SchedulerArtifactStore,
  _changePath: string,
  changeId: string,
  label: string,
): Promise<void> {
  if (store.changeId !== changeId) {
    throw new Error(`${label} is not scoped to the selected Change: expected ${store.changeId}, got ${changeId}.`);
  }
}

export async function assertSchedulerWorkflowArtifactScope(
  store: SchedulerArtifactStore,
  changePath: string,
  artifact: WorkflowArtifactWithChange,
  label: string,
): Promise<void> {
  await assertSchedulerChangeScope(store, changePath, artifact.changeId, `${label} ${artifact.id ?? ""}`.trim());
}

function assertWithin(ownerRoot: string, target: string, label: string): string {
  const scoped = relative(resolve(ownerRoot), resolve(target));
  if (isAbsolute(scoped) || scoped === ".." || scoped.startsWith(`..${sep}`)) {
    throw new Error(`${label} escapes its declared owner root.`);
  }
  return target;
}
