import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { collectWorktreeDiff } from "../audit/diff.js";
import { acceptAudit } from "../audit/manager.js";
import { getChangeStatusForChange } from "../change/manager.js";
import { writeJsonFile } from "../fs/json.js";
import { assertWritableMemory, resolveProjectMemory } from "../memory/resolver.js";
import { getGitCommit, git } from "../project/git.js";
import { withProjectWriteLease } from "../project/project-write-lease.js";
import { appendRunEvent, buildRunId } from "../run/manager.js";
import { getWorktreeStatus, markWorktreeApplied, removeWorktree } from "../worktree/manager.js";
import type { ManagedProject, RunMetadata, RunStatus } from "../types/index.js";
import { canAutoAcceptAuditForApply, evaluateApplyGate } from "./gate.js";
import { buildApplyPaths, buildDiscardPaths, displayArtifactPath } from "./paths.js";
import { previewWorktreeApply } from "./preview.js";
import type { WorktreeApplyOptions, WorktreeApplyResult, WorktreeDiscardResult, WorktreeResultApplyResult } from "./types.js";

export async function applyResultToProject(project: ManagedProject, worktreeId: string, options: WorktreeApplyOptions = {}): Promise<WorktreeResultApplyResult> {
  const preview = await previewWorktreeApply(project, worktreeId);
  let auditAccepted: WorktreeResultApplyResult["auditAccepted"];
  if (!preview.gate.ready && canAutoAcceptAuditForApply(preview.gate) && preview.gate.audit) {
    const accepted = await acceptAudit(project, preview.gate.audit.id);
    auditAccepted = {
      auditId: accepted.audit.id,
      reviewPath: accepted.reviewPath,
    };
  }
  const applied = await applyWorktree(project, worktreeId, options);
  return auditAccepted ? { ...applied, auditAccepted } : applied;
}

export async function applyWorktree(project: ManagedProject, worktreeId: string, options: WorktreeApplyOptions = {}): Promise<WorktreeApplyResult> {
  if (options.message && !options.commit) {
    throw new Error("Cannot use --message without --commit.");
  }
  return withProjectWriteLease(project.path, {}, async (lease) =>
    applyWorktreeWithLease(project, worktreeId, options, lease),
  );
}

async function applyWorktreeWithLease(
  project: ManagedProject,
  worktreeId: string,
  options: WorktreeApplyOptions,
  lease: Parameters<Parameters<typeof withProjectWriteLease>[2]>[0],
): Promise<WorktreeApplyResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Worktree apply");
  const gate = await evaluateApplyGate(project, memory, worktreeId);
  if (!gate.ready) {
    throw new Error(`Cannot apply worktree:\n${gate.blockingIssues.map((issue) => `- ${issue}`).join("\n")}`);
  }
  if (!gate.validation || !gate.audit || !gate.reviewAuditId) {
    throw new Error("Cannot apply worktree: missing gate evidence.");
  }

  const runId = buildRunId(gate.changeId, ["worktree-apply", worktreeId, gate.diffHash, options.commit ? "commit" : "no-commit"]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const paths = buildApplyPaths(directory);
  const artifacts = {
    base: memory.artifactBase,
    directory: relativeDir,
    context: `${relativeDir}/context.md`,
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
    diff: `${relativeDir}/diff.patch`,
    diffStat: `${relativeDir}/diff-stat.txt`,
    apply: `${relativeDir}/apply.json`,
  };

  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId: gate.changeId,
    projectPath: project.path,
    runtime: "worktree-apply",
    executionMode: "direct",
    proposalOnly: false,
    command: ["git", "apply", "--binary", artifacts.diff],
    status: "created",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts,
  };
  await writeJsonFile(paths.run, run);
  await writeFile(paths.context, "Worktree apply gate run. Source of truth is apply.json and diff.patch.\n", "utf8");
  await writeFile(paths.stdout, "", "utf8");
  await writeFile(paths.stderr, "", "utf8");
  await writeFile(paths.diff, (await collectWorktreeDiff(memory, worktreeId, gate.changeId)).diff, "utf8");
  await writeFile(paths.diffStat, gate.diffStat, "utf8");
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { runtime: "worktree-apply", worktreeId } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.apply.started", runId, data: { worktreeId, diffHash: gate.diffHash } });

  let applyStatus: "applied" | "failed" = "failed";
  let commitHash: string | undefined;
  let sourceHeadAfter: string | null = null;
  try {
    run = { ...run, status: "running" };
    await writeJsonFile(paths.run, run);
    await lease.heartbeat();
    await git(project.path, ["apply", "--binary", paths.diff]);
    if (options.commit) {
      await git(project.path, ["add", "-A"]);
      const message = options.message?.trim() || `Apply ${gate.changeId} from ${worktreeId}`;
      await git(project.path, ["commit", "-m", message]);
      commitHash = await getGitCommit(project.path) ?? undefined;
    }
    sourceHeadAfter = await getGitCommit(project.path);
    await markWorktreeApplied(memory, worktreeId, {
      applyRunId: runId,
      worktreeDiffHash: gate.diffHash,
      appliedCommit: commitHash,
    });
    applyStatus = "applied";
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.apply.completed", runId, data: { committed: options.commit === true, commitHash } });
  } catch (error) {
    await writeFile(paths.stderr, error instanceof Error ? `${error.message}\n` : `${String(error)}\n`, "utf8");
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.apply.failed", runId, data: { error: error instanceof Error ? error.message : String(error) } });
  }

  const apply = {
    version: "1.0" as const,
    changeId: gate.changeId,
    worktreeId,
    worktreeDiffHash: gate.diffHash,
    validationId: gate.validation.id,
    auditId: gate.audit.id,
    reviewAuditId: gate.reviewAuditId,
    sourceHeadBefore: gate.sourceHead,
    sourceHeadAfter,
    committed: options.commit === true && applyStatus === "applied",
    ...(commitHash ? { commitHash } : {}),
    status: applyStatus,
  };
  await lease.assertCurrent();
  await writeJsonFile(paths.apply, apply);
  const status: RunStatus = applyStatus === "applied" ? "completed" : "failed";
  run = await finishRun(paths.run, run, status, status === "completed" ? 0 : 1);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: status === "completed" ? "run.completed" : "run.failed", runId });
  return { run, apply };
}

export async function discardWorktree(project: ManagedProject, worktreeId: string): Promise<WorktreeDiscardResult> {
  const memory = await resolveProjectMemory(project);
  assertWritableMemory(memory, "Worktree discard");
  const worktree = await getWorktreeStatus(memory, worktreeId);
  const changeId = worktree.changeId;
  const status = await getChangeStatusForChange(project, changeId);
  if (!status.change) throw new Error(`Cannot discard worktree ${worktreeId}: demand conversation is not active: ${changeId}.`);
  if (worktree.status === "applied") {
    throw new Error(`Cannot discard applied worktree ${worktreeId}. Use worktree remove for cleanup.`);
  }

  const runId = buildRunId(changeId, ["worktree-discard", worktreeId]);
  const directory = join(memory.runsRoot, runId);
  const relativeDir = displayArtifactPath(memory, directory);
  const paths = buildDiscardPaths(directory);
  const artifacts = {
    base: memory.artifactBase,
    directory: relativeDir,
    context: `${relativeDir}/context.md`,
    events: `${relativeDir}/events.jsonl`,
    stdout: `${relativeDir}/stdout.log`,
    stderr: `${relativeDir}/stderr.log`,
    discard: `${relativeDir}/discard.json`,
  };
  await mkdir(directory, { recursive: true });
  const now = new Date().toISOString();
  let run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: project.path,
    runtime: "worktree-discard",
    executionMode: "direct",
    proposalOnly: false,
    command: ["worktree", "discard", worktreeId],
    status: "running",
    exitCode: null,
    signal: null,
    startedAt: now,
    finishedAt: null,
    artifacts,
  };
  await writeJsonFile(paths.run, run);
  await writeFile(paths.context, "Worktree discard gate run. Discard removes an unapplied proposal checkout only.\n", "utf8");
  await writeFile(paths.stdout, "", "utf8");
  await writeFile(paths.stderr, "", "utf8");
  await appendRunEvent(paths.events, { timestamp: now, type: "run.created", runId, data: { runtime: "worktree-discard", worktreeId } });
  await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.discard.started", runId, data: { worktreeId } });
  let discardStatus: "discarded" | "failed" = "failed";
  try {
    await removeWorktree(memory, worktreeId, true);
    discardStatus = "discarded";
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.discard.completed", runId, data: { worktreeId } });
  } catch (error) {
    await writeFile(paths.stderr, error instanceof Error ? `${error.message}\n` : `${String(error)}\n`, "utf8");
    await appendRunEvent(paths.events, { timestamp: new Date().toISOString(), type: "worktree.discard.failed", runId, data: { error: error instanceof Error ? error.message : String(error) } });
  }
  const discard = { version: "1.0" as const, changeId, worktreeId, status: discardStatus };
  await writeJsonFile(paths.discard, discard);
  const runStatus: RunStatus = discardStatus === "discarded" ? "completed" : "failed";
  run = await finishRun(paths.run, run, runStatus, runStatus === "completed" ? 0 : 1);
  await appendRunEvent(paths.events, { timestamp: run.finishedAt ?? new Date().toISOString(), type: runStatus === "completed" ? "run.completed" : "run.failed", runId });
  return { run, discard };
}

async function finishRun(path: string, run: RunMetadata, status: RunStatus, exitCode: number): Promise<RunMetadata> {
  const finished = {
    ...run,
    status,
    exitCode,
    signal: null,
    finishedAt: new Date().toISOString(),
  };
  await writeJsonFile(path, finished);
  return finished;
}
