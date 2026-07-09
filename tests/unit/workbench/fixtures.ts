import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect } from "vitest";
import { initHarness } from "../../../src/harness/init.js";
import { executeWorkbenchAction } from "../../../src/server/workbench-server.js";
import { createWorkbenchTopic } from "../../../src/workbench/chat.js";
import { getWorkbenchSnapshot } from "../../../src/workbench/manager.js";
import type { WorkbenchDecisionAction } from "../../../src/workbench/read-model-types.js";
import { resolveProjectMemory } from "../../../src/memory/resolver.js";
import { createWorkflowRunForTaskQueue, validateTaskQueueProposalStart } from "../../../src/workflow-run/manager.js";
import { compileWorkflowGraphPlan, hashArtifactRefs, writeDecompositionPlan, writeDecompositionReadinessManifest } from "../../../src/workflow-artifacts/manager.js";
import {
  schedulerClaimReconcilePlanArtifactRefs,
  schedulerContractArtifactRefs,
  schedulerDispatchDryRunArtifactRefs,
  schedulerLaunchPreflightArtifactRefs,
  schedulerRunArtifactRefs,
  schedulerWorkerSessionPlanArtifactRefs,
  writeSchedulerClaimReconcilePlan,
  writeSchedulerContract,
  writeSchedulerDispatchDryRun,
  writeSchedulerLaunchPreflight,
  writeSchedulerRun,
  writeSchedulerWorkerSessionPlan,
} from "../../../src/workflow-scheduler/repository.js";
import {
  schedulerIntegrationCandidateArtifactRefs,
  schedulerIntegrationCheckHandoffArtifactRefs,
  schedulerReconcileSnapshotArtifactRefs,
  writeSchedulerReconcileSnapshot,
  writeSchedulerIntegrationCandidate,
  writeSchedulerIntegrationCheckHandoff,
  writeSchedulerRuntimeClaimReservation,
  writeSchedulerRuntimeState,
} from "../../../src/scheduler-runtime/repository.js";
import { integrationCheckRoot } from "../../../src/integration-check/paths.js";
import { removeKnownIntegrationFailureMarkers } from "../../../src/integration-check/patch-workspace.js";
import { writeCheckArtifacts } from "../../../src/integration-check/repository.js";
import { contentHash } from "../../../src/integration-check/artifacts.js";
import type { IntegrationFixRepairRunner } from "../../../src/integration-check/fix-attempts.js";
import { getGlobalWorktreeCheckoutRoot } from "../../../src/worktree/paths.js";
import { writeWorktreeMetadata } from "../../../src/worktree/repository.js";
import { writeWorktreeIndex } from "../../../src/worktree/manager.js";
import type {
  DecompositionPlan,
  DecompositionReadinessManifest,
  IntegrationCheckRecord,
  ManagedProject,
  RunMetadata,
  TaskQueueItem,
  TaskQueueProposal,
  TaskQueueRun,
  WorktreeMetadata,
  TaskRun,
  WorkerLease,
  WorkflowGraphPlan,
} from "../../../src/types/index.js";
import type { SchedulerClaimReconcilePlan, SchedulerContract, SchedulerDispatchDryRun, SchedulerLaunchPreflight, SchedulerRun, SchedulerWorkerSessionPlan } from "../../../src/workflow-scheduler/types.js";
import type {
  SchedulerIntegrationCandidate,
  SchedulerIntegrationCheckHandoff,
  SchedulerReconcileSnapshot,
  SchedulerRuntimeClaimReservation,
  SchedulerRuntimeState,
} from "../../../src/scheduler-runtime/types.js";

let tempDir: string;
export const execFileAsync = promisify(execFile);

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-workbench-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
});

export function getTempDir(): string {
  return tempDir;
}

export function project(path = tempDir): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path,
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}

export async function readJsonl(path: string): Promise<Array<Record<string, unknown>>> {
  const text = await readFile(path, "utf8");
  return text.trim().split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>);
}

export function findSchedulerGateAction(actions: WorkbenchDecisionAction[], concreteActionType: WorkbenchDecisionAction["actionType"], predicate: (action: WorkbenchDecisionAction) => boolean): WorkbenchDecisionAction | undefined {
  return actions.find((action) => {
    if (action.actionType === concreteActionType && predicate(action)) return true;
    if (
      (action.actionType === "planning.scheduler.controlled-advance.run" || action.actionType === "planning.goal-loop.controlled-continue.run")
      && action.goalLoopCurrentGateActionType === concreteActionType
      && predicate(action)
    ) {
      if (action.actionType === "planning.goal-loop.controlled-continue.run") {
        (action as WorkbenchDecisionAction & { maxSteps?: number }).maxSteps = 1;
      }
      return true;
    }
    return false;
  });
}

export function unwrapControlledSchedulerAdvanceResult(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const record = result as Record<string, unknown>;
  if (Array.isArray(record.childResults) && record.childResults.length > 0) {
    return unwrapControlledSchedulerAdvanceResult(record.childResults[record.childResults.length - 1]);
  }
  const controlledStep = record.controlledStep;
  if (record.controlledAdvance) return record.result ?? result;
  if (!controlledStep || typeof controlledStep !== "object") return result;
  const stepRecord = controlledStep as Record<string, unknown>;
  return record.result ?? stepRecord.result ?? controlledStep;
}

export const deterministicMarkerRepairRunner: IntegrationFixRepairRunner = async ({ checkoutPath }) => {
  await removeKnownIntegrationFailureMarkers(checkoutPath);
  return {
    repairMode: "deterministic-marker-test",
    summary: "Deterministic test runner removed aggregate failure markers.",
  };
};

export async function createFakeGh(initial: { isDraft?: boolean; comments?: unknown[]; inlineComments?: unknown[]; failedChecks?: number; canResolveThreads?: boolean; mergeFails?: boolean } = {}): Promise<{ command: string; args: string[]; stateFile: string }> {
  const binDir = join(tempDir, "fake-gh-bin");
  await mkdir(binDir, { recursive: true });
  const stateFile = join(binDir, "state.json");
  await writeFile(stateFile, JSON.stringify({
    isDraft: initial.isDraft ?? true,
    comments: initial.comments ?? [],
    inlineComments: initial.inlineComments ?? [],
    failedChecks: initial.failedChecks ?? 0,
    canResolveThreads: initial.canResolveThreads ?? true,
    mergeFails: initial.mergeFails ?? false,
    mergeCount: 0,
    merged: false,
    replies: [],
    resolvedThreads: [],
  }), "utf8");
  const script = join(binDir, "fake-gh.js");
  await writeFile(script, `#!/usr/bin/env node
const fs = require("fs");
const stateFile = ${JSON.stringify(stateFile)};
const args = process.argv.slice(2);
const readState = () => JSON.parse(fs.readFileSync(stateFile, "utf8"));
const writeState = (state) => fs.writeFileSync(stateFile, JSON.stringify(state), "utf8");
if (args[0] === "--version") {
  console.log("gh version 2.0.0");
  process.exit(0);
}
if (args[0] === "auth" && args[1] === "status") {
  console.log("Logged in to github.com");
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "view") {
  const state = readState();
  const failedChecks = Array.from({ length: state.failedChecks || 0 }, (_, index) => ({ name: "check-" + index, conclusion: "FAILURE", status: "COMPLETED" }));
  console.log(JSON.stringify({
    url: "https://github.com/qinghui316/private-acceptance/pull/1",
    state: state.merged ? "MERGED" : "OPEN",
    isDraft: Boolean(state.isDraft),
    reviewDecision: null,
    reviews: [],
    comments: state.comments || [],
    headRefName: "aho/test",
    baseRefName: "main",
    headRefOid: "head",
    baseRefOid: "base",
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    mergedAt: state.merged ? "2026-05-30T00:00:00.000Z" : null,
    mergeCommit: state.merged ? { oid: "merge-commit-sha" } : null,
    statusCheckRollup: failedChecks,
  }));
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "merge") {
  const state = readState();
  if (state.mergeFails) {
    console.error("Branch protection blocked merge");
    process.exit(1);
  }
  state.merged = true;
  state.mergeCount = (state.mergeCount || 0) + 1;
  writeState(state);
  console.log("Merged pull request");
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "ready") {
  const state = readState();
  state.isDraft = false;
  writeState(state);
  console.log("Ready for review");
  process.exit(0);
}
if (args[0] === "pr" && args[1] === "comment") {
  const state = readState();
  const bodyIndex = args.indexOf("--body");
  state.replies = state.replies || [];
  state.replies.push({ kind: "pr", body: bodyIndex >= 0 ? args[bodyIndex + 1] : "" });
  writeState(state);
  console.log("Commented");
  process.exit(0);
}
if (args[0] === "api") {
  const state = readState();
  if (args[1] === "graphql") {
    const queryArg = args.find((arg) => String(arg).startsWith("query=")) || "";
    if (queryArg.includes("resolveReviewThread")) {
      if (!state.canResolveThreads) {
        console.error("Thread resolve is unavailable");
        process.exit(1);
      }
      const threadArg = args.find((arg) => String(arg).startsWith("threadId=")) || "threadId=thread-1";
      const threadId = threadArg.slice("threadId=".length);
      state.resolvedThreads = state.resolvedThreads || [];
      state.resolvedThreads.push(threadId);
      writeState(state);
      console.log(JSON.stringify({ data: { resolveReviewThread: { thread: { id: threadId, isResolved: true } } } }));
      process.exit(0);
    }
    if (!state.canResolveThreads) {
      console.error("GraphQL reviewThreads unavailable");
      process.exit(1);
    }
    console.log(JSON.stringify({
      data: {
        repository: {
          pullRequest: {
            reviewThreads: {
              nodes: (state.inlineComments || []).map((comment, index) => ({
                id: comment.threadId || "thread-" + (index + 1),
                isResolved: false,
                comments: { nodes: [{ id: "graphql-comment-" + String(comment.id || index + 1), databaseId: Number(comment.id || index + 1), body: comment.body || "", path: comment.path || null, line: comment.line || null, author: { login: "reviewer" }, createdAt: "2026-05-29T00:00:00.000Z" }] },
              })),
            },
          },
        },
      },
    }));
    process.exit(0);
  }
  if (/^repos\\/[^/]+\\/[^/]+\\/pulls\\/\\d+\\/comments$/.test(args[1])) {
    console.log(JSON.stringify(state.inlineComments || []));
    process.exit(0);
  }
  const replyMatch = args[1].match(/^repos\\/[^/]+\\/[^/]+\\/pulls\\/\\d+\\/comments\\/(\\d+)\\/replies$/);
  if (replyMatch) {
    const bodyArg = args.find((arg) => String(arg).startsWith("body=")) || "body=";
    state.replies = state.replies || [];
    state.replies.push({ kind: "inline", commentId: replyMatch[1], body: bodyArg.slice("body=".length) });
    writeState(state);
    console.log(JSON.stringify({ id: 999, body: bodyArg.slice("body=".length) }));
    process.exit(0);
  }
}
console.error("Unsupported fake gh command: " + args.join(" "));
process.exit(1);
`, "utf8");
  await chmod(script, 0o755).catch(() => undefined);
  return { command: process.execPath, args: [script], stateFile };
}

export async function createFakeCodex(options: { mutateOnExec?: boolean; message?: string } = {}): Promise<{ binDir: string }> {
  const binDir = join(tempDir, "fake-codex-bin");
  await mkdir(binDir, { recursive: true });
  const script = join(binDir, "fake-codex.cjs");
  const mutateOnExec = options.mutateOnExec ?? true;
  const message = options.message ?? "fake scheduler coder done";
  await writeFile(script, `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
const mutateOnExec = ${JSON.stringify(mutateOnExec)};
const message = ${JSON.stringify(message)};
if (args[0] === "--version") {
  console.log("codex-cli fake");
  process.exit(0);
}
if (args[0] === "app-server" && args[1] === "--help") {
  console.error("app-server unavailable in fake");
  process.exit(1);
}
if (args[0] === "--help") {
  console.log("Usage: codex [OPTIONS]\\n--ask-for-approval <APPROVAL_POLICY>");
  process.exit(0);
}
if (args[0] === "exec" && args[1] === "--help") {
  console.log("Usage: codex exec [OPTIONS]\\n--json\\n--sandbox <SANDBOX_MODE>\\n--cd <DIR>\\n--output-last-message <FILE>\\n--ask-for-approval <APPROVAL_POLICY>");
  process.exit(0);
}
if (args[0] === "exec" && args[1] === "resume" && args[2] === "--help") {
  console.log("Usage: codex exec resume [OPTIONS]\\n--sandbox <SANDBOX_MODE>\\n--cd <DIR>");
  process.exit(0);
}
if (args[0] === "exec" || args.includes("exec")) {
  const prompt = fs.readFileSync(0, "utf8");
  const lastMessageIndex = args.indexOf("--output-last-message");
  const lastMessagePath = lastMessageIndex >= 0 ? args[lastMessageIndex + 1] : null;
  const cwdIndex = args.indexOf("--cd");
  const cwd = cwdIndex >= 0 ? args[cwdIndex + 1] : process.cwd();
  if (prompt.includes("Auditor Agent Profile") || prompt.includes("Authoritative Audit Packet")) {
    const message = "Status: approved\\n\\nFinding: Scheduler worker audit passed.";
    if (lastMessagePath) fs.writeFileSync(lastMessagePath, message, "utf8");
    console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: message } }));
    process.exit(0);
  }
  if (mutateOnExec) fs.appendFileSync(path.join(cwd, "README.md"), "\\nScheduler worker fake coder\\n", "utf8");
  if (lastMessagePath) fs.writeFileSync(lastMessagePath, message, "utf8");
  console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: message } }));
  process.exit(0);
}
console.error("Unsupported fake codex command: " + args.join(" "));
process.exit(1);
`, "utf8");
  await chmod(script, 0o755).catch(() => undefined);
  const commandShim = process.platform === "win32" ? join(binDir, "codex.cmd") : join(binDir, "codex");
  const shim = process.platform === "win32"
    ? `@echo off\r\nnode "${script}" %*\r\n`
    : `#!/usr/bin/env sh\nnode "${script}" "$@"\n`;
  await writeFile(commandShim, shim, "utf8");
  await chmod(commandShim, 0o755).catch(() => undefined);
  return { binDir };
}

export async function writeAcceptedSpecAndTasks(changeId: string): Promise<void> {
  const changeDir = join(tempDir, "harness", "changes", "active", changeId);
  await writeFile(join(changeDir, "spec.md"), [
    "# Spec",
    "",
    "## Acceptance Criteria",
    "",
    "- AC-001: Complete one task-scoped change.",
    "",
  ].join("\n"), "utf8");
  await writeFile(join(changeDir, "plan.md"), "# Plan\n\nImplement this accepted task list.\n", "utf8");
  await writeFile(join(changeDir, "tasks.md"), [
    "# Tasks",
    "",
    "- [ ] T-001: Implement one task.",
    "  - Covers: AC-001",
    "",
  ].join("\n"), "utf8");
}

export async function prepareSchedulerTwoWorkerIntegrationHandoff(title: string): Promise<{
  topic: { changeId: string };
  schedulerRun: { id?: string };
  claimReservation: { id?: string };
  refreshedCandidate: { id?: string; readyWorktreeIds?: string[] };
  handoff: {
    handoff?: {
      id?: string;
      integrationCheckId?: string;
      schedulerIntegrationCandidateId?: string;
      readyWorktreeIds?: string[];
      resultTargetWorktreeIds?: string[];
    };
    integrationCheck?: { id?: string };
  };
}> {
  const prepared = await prepareSchedulerFirstWorkerThroughResult({ title });
  const oldPath = process.env.PATH;
  const fakeCodex = await createFakeCodex();
  try {
    process.env.PATH = `${fakeCodex.binDir}${delimiter}${oldPath ?? ""}`;

    let snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const firstValidationAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.validate-first", (candidate) => candidate.schedulerWorkerResultId === prepared.workerResult.id));
    if (!firstValidationAction) throw new Error("Missing first worker validation action.");
    const firstValidation = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...firstValidationAction, confirm: true });
    const firstValidationResult = unwrapControlledSchedulerAdvanceResult((firstValidation.result as {
      result?: unknown;
    }).result ?? firstValidation.result) as {
      result?: { schedulerValidation?: { id?: string } };
      schedulerValidation?: { id?: string };
    };
    const firstValidationConcreteResult = firstValidationResult.result ?? firstValidationResult;

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const firstAuditAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.audit-first", (candidate) => candidate.schedulerWorkerValidationId === firstValidationConcreteResult?.schedulerValidation?.id));
    if (!firstAuditAction) throw new Error("Missing first worker audit action.");
    await executeWorkbenchAction({ project: project(), path: tempDir }, { ...firstAuditAction, confirm: true });
    await rm(join(tempDir, "README.md"), { force: true });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const firstCandidateAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.integration-candidate.compile", (candidate) => candidate.schedulerRunId === prepared.schedulerRun.id));
    if (!firstCandidateAction) throw new Error("Missing first scheduler integration candidate action.");
    const firstCandidateResult = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...firstCandidateAction, confirm: true });
    const firstCandidateWorkflow = firstCandidateResult.result as { status?: string; error?: string; result?: unknown };
    if (firstCandidateWorkflow.status === "failed") throw new Error(firstCandidateWorkflow.error ?? "first candidate action failed");
    const firstCandidate = (unwrapControlledSchedulerAdvanceResult(firstCandidateWorkflow.result ?? firstCandidateResult.result) as {
      candidate?: { id?: string; readyCount?: number };
    }).candidate;
    expect(firstCandidate).toMatchObject({ readyCount: 1 });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const startNextAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.start-next", (candidate) => candidate.schedulerRunId === prepared.schedulerRun.id));
    if (!startNextAction) throw new Error("Missing scheduler start-next action.");
    const secondStartResult = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...startNextAction, confirm: true });
    const secondStart = (unwrapControlledSchedulerAdvanceResult((secondStartResult.result as { result?: unknown }).result ?? secondStartResult.result) as {
      workerStart?: {
        id?: string;
        taskRunId?: string;
        workerLeaseId?: string;
        worktreeId?: string;
        runId?: string;
      };
    });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const secondResultAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.reconcile-result", (candidate) => candidate.schedulerWorkerStartId === secondStart.workerStart?.id));
    if (!secondResultAction) throw new Error("Missing second worker result reconcile action.");
    const secondResult = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...secondResultAction, confirm: true });
    const secondWorkerResult = unwrapControlledSchedulerAdvanceResult((secondResult.result as { result?: unknown }).result ?? secondResult.result) as { result?: { id?: string; status?: string } };
    expect(secondWorkerResult).toMatchObject({ result: { status: "evidence-ready" } });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const secondValidationAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.validate-first", (candidate) => candidate.schedulerWorkerResultId === secondWorkerResult?.result?.id));
    if (!secondValidationAction) throw new Error("Missing second worker validation action.");
    const secondValidation = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...secondValidationAction, confirm: true });
    const secondValidationResult = unwrapControlledSchedulerAdvanceResult((secondValidation.result as { result?: unknown }).result ?? secondValidation.result) as { schedulerValidation?: { id?: string; status?: string } };
    expect(secondValidationResult).toMatchObject({ schedulerValidation: { status: "passed" } });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const secondAuditAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.audit-first", (candidate) => candidate.schedulerWorkerValidationId === secondValidationResult?.schedulerValidation?.id));
    if (!secondAuditAction) throw new Error("Missing second worker audit action.");
    const secondAudit = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...secondAuditAction, confirm: true });
    const secondAuditResult = unwrapControlledSchedulerAdvanceResult((secondAudit.result as { result?: unknown }).result ?? secondAudit.result) as {
      schedulerAudit?: { status?: string };
    };
    expect(secondAuditResult).toMatchObject({ schedulerAudit: { status: "approved" } });
    await rm(join(tempDir, "README.md"), { force: true });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const refreshedCandidateAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.integration-candidate.compile", (candidate) => candidate.schedulerRunId === prepared.schedulerRun.id));
    if (!refreshedCandidateAction) throw new Error("Missing refreshed scheduler integration candidate action.");
    const refreshedCandidateResult = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...refreshedCandidateAction, confirm: true });
    const refreshedCandidateWorkflow = refreshedCandidateResult.result as { status?: string; error?: string; result?: unknown };
    if (refreshedCandidateWorkflow.status === "failed") throw new Error(refreshedCandidateWorkflow.error ?? "refreshed candidate action failed");
    const refreshedCandidate = (unwrapControlledSchedulerAdvanceResult(refreshedCandidateWorkflow.result ?? refreshedCandidateResult.result) as {
      candidate?: { id?: string; status?: string; readyCount?: number; readyWorktreeIds?: string[] };
    }).candidate ?? {};
    expect(refreshedCandidate).toMatchObject({ status: "ready", readyCount: 2 });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const handoffAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.integration-check.run", (candidate) => candidate.schedulerIntegrationCandidateId === refreshedCandidate.id));
    if (!handoffAction) throw new Error("Missing scheduler IntegrationCheck handoff action.");
    const handoffResult = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...handoffAction, confirm: true });
    const handoffWorkflow = handoffResult.result as { status?: string; error?: string; result?: unknown };
    if (handoffWorkflow.status === "failed") throw new Error(handoffWorkflow.error ?? "handoff action failed");
    const handoff = unwrapControlledSchedulerAdvanceResult(handoffWorkflow.result ?? handoffResult.result) as {
      handoff?: {
        id?: string;
        integrationCheckId?: string;
        schedulerIntegrationCandidateId?: string;
        readyWorktreeIds?: string[];
        resultTargetWorktreeIds?: string[];
      };
      integrationCheck?: { id?: string };
    };
    expect(handoff.handoff).toMatchObject({
      schedulerIntegrationCandidateId: refreshedCandidate.id,
      integrationCheckId: handoff.integrationCheck?.id,
    });

    return {
      topic: prepared.topic,
      schedulerRun: prepared.schedulerRun,
      claimReservation: prepared.claimReservation,
      refreshedCandidate,
      handoff,
    };
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
  }
}

export async function prepareSeededSchedulerIntegrationHandoff(title: string): Promise<{
  topic: { changeId: string };
  schedulerRun: { id: string };
  claimReservation: { id: string };
  refreshedCandidate: { id: string; readyWorktreeIds: string[] };
  handoff: {
    handoff: {
      id: string;
      integrationCheckId: string;
      schedulerIntegrationCandidateId: string;
      readyWorktreeIds: string[];
      resultTargetWorktreeIds: string[];
    };
    integrationCheck: { id: string };
  };
  latestArtifactHash: string;
}> {
  await initHarness(project());
  const topic = await createWorkbenchTopic(project(), {
    title,
    body: "Seed a completed two-worker scheduler integration handoff for discard/completion verification.",
  });
  await writeAcceptedSpecAndTasks(topic.changeId);
  const changePath = join("harness", "changes", "active", topic.changeId);
  const memory = await resolveProjectMemory(project());
  await initGitRepository(tempDir);
  await mkdir(join(tempDir, "src"), { recursive: true });
  await writeFile(join(tempDir, ".gitignore"), "harness/\n.agent-harness/\nfake-codex-bin/\n", "utf8");
  await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: { test: "node -e \"process.exit(0)\"" } }), "utf8");
  await writeFile(join(tempDir, "src", "module-a.ts"), "export const moduleA = 1;\n", "utf8");
  await writeFile(join(tempDir, "src", "module-b.ts"), "export const moduleB = 1;\n", "utf8");
  await git(tempDir, ["add", "."]);
  await git(tempDir, ["commit", "-m", "initial"]);
  const sourceHead = (await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: tempDir })).stdout.trim();

  const now = new Date().toISOString();
  const schedulerRunId = `scheduler-run-seeded-${Date.now()}`;
  const schedulerRuntimeStateId = `scheduler-runtime-state-${schedulerRunId}`;
  const reconcileSnapshotId = `scheduler-reconcile-snapshot-${schedulerRunId}`;
  const claimReservationId = `scheduler-claim-reservation-${schedulerRunId}`;
  const schedulerIntegrationCandidateId = `scheduler-integration-candidate-${schedulerRunId}`;
  const integrationCheckId = `integration-check-${schedulerRunId}`;
  const schedulerIntegrationCheckHandoffId = `scheduler-integration-check-handoff-${schedulerRunId}`;
  const schedulerContractId = `scheduler-contract-${schedulerRunId}`;
  const schedulerDispatchDryRunId = `scheduler-dispatch-dry-run-${schedulerRunId}`;
  const schedulerWorkerPlanId = `scheduler-worker-plan-${schedulerRunId}`;
  const schedulerClaimReconcilePlanId = `scheduler-claim-reconcile-plan-${schedulerRunId}`;
  const schedulerLaunchPreflightId = `scheduler-launch-preflight-${schedulerRunId}`;
  const decompositionPlanId = `decomposition-plan-${schedulerRunId}`;
  const readinessManifestId = `readiness-manifest-${schedulerRunId}`;
  const acceptedArtifactRefs = [
    `${changePath}/spec.md`,
    `${changePath}/plan.md`,
    `${changePath}/tasks.md`,
  ];
  const sourceArtifactHashes = await hashArtifactRefs(memory, acceptedArtifactRefs);
  const decompositionPlan: DecompositionPlan = {
    id: decompositionPlanId,
    changeId: topic.changeId,
    status: "confirmed",
    recommendation: "taskgraph-parallel-candidate",
    rationale: "Seeded scheduler discard completion fixture.",
    units: [{
      id: "unit-1",
      title: "Update module A",
      summary: "Seeded low-conflict unit for module A.",
      taskIds: ["T-001"],
      acIds: ["AC-001"],
      scopeHints: ["src/module-a.ts"],
      dependsOn: [],
      recommendedRoleId: "coder",
    }, {
      id: "unit-2",
      title: "Update module B",
      summary: "Seeded low-conflict unit for module B.",
      taskIds: ["T-002"],
      acIds: ["AC-001"],
      scopeHints: ["src/module-b.ts"],
      dependsOn: [],
      recommendedRoleId: "coder",
    }],
    dependencies: [],
    conflictScopes: [],
    riskSummary: "Seeded independent scheduler units.",
    openQuestions: [],
    artifactRefs: acceptedArtifactRefs,
    recoveryKeyInputs: {
      changeId: topic.changeId,
      acceptedArtifactRefs,
      contextScope: "selected-demand",
      sourceRevision: sourceHead,
      rolePolicyProfile: "test",
      notes: ["Seeded scheduler discard completion fixture."],
    },
    artifact: `${changePath}/planning/decomposition-plan.json`,
    markdownArtifact: `${changePath}/planning/decomposition-plan.md`,
    createdAt: now,
    updatedAt: now,
  };
  await writeDecompositionPlan(memory, changePath, decompositionPlan);
  const readiness: DecompositionReadinessManifest = {
    id: readinessManifestId,
    changeId: topic.changeId,
    decompositionPlanId,
    status: "ready-for-scheduler-contract",
    recommendation: "taskgraph-parallel-candidate",
    executable: false,
    schedulerEligible: true,
    nextAllowedAction: "scheduler.contract",
    units: decompositionPlan.units.map((unit) => ({
      id: unit.id,
      title: unit.title,
      taskIds: unit.taskIds,
      acIds: unit.acIds,
      dependsOn: unit.dependsOn,
      guardrailStatus: "passed",
      sourceScopes: unit.scopeHints,
    })),
    dependencies: [],
    conflictScopes: [],
    guardrails: [{
      id: "parallel-scope",
      status: "passed",
      summary: "Seeded independent source scopes.",
      refs: acceptedArtifactRefs,
    }],
    recoveryKeyMaterial: {
      ...decompositionPlan.recoveryKeyInputs,
      decompositionPlanId,
      taskIds: ["T-001", "T-002"],
      acIds: ["AC-001"],
    },
    artifactRefs: acceptedArtifactRefs,
    artifact: `${changePath}/planning/decomposition-readiness.json`,
    markdownArtifact: `${changePath}/planning/decomposition-readiness.md`,
    createdAt: now,
    updatedAt: now,
  };
  await writeDecompositionReadinessManifest(memory, changePath, readiness);
  const contractRefs = schedulerContractArtifactRefs(memory, changePath, schedulerContractId);
  const dryRunRefs = schedulerDispatchDryRunArtifactRefs(memory, changePath, schedulerDispatchDryRunId);
  const workerPlanRefs = schedulerWorkerSessionPlanArtifactRefs(memory, changePath, schedulerWorkerPlanId);
  const claimPlanRefs = schedulerClaimReconcilePlanArtifactRefs(memory, changePath, schedulerClaimReconcilePlanId);
  const preflightRefs = schedulerLaunchPreflightArtifactRefs(memory, changePath, schedulerLaunchPreflightId);
  const contractNodes = decompositionPlan.units.map((unit, index) => ({
    id: `node-${index + 1}`,
    unitId: unit.id,
    taskIds: unit.taskIds,
    acIds: unit.acIds,
    title: unit.title,
    sourceScopes: unit.scopeHints,
    stages: ["coder" as const],
  }));
  const contract: SchedulerContract = {
    version: "1.0",
    id: schedulerContractId,
    changeId: topic.changeId,
    status: "compiled",
    schedulerMode: "parallel-readiness-v1",
    decompositionPlanId,
    readinessManifestId,
    nodes: contractNodes,
    edges: [],
    waves: [{ index: 0, nodeIds: contractNodes.map((node) => node.id) }],
    conflictScopes: [],
    sourceArtifactHashes,
    artifactRefs: [contractRefs.artifact, contractRefs.markdownArtifact, ...acceptedArtifactRefs],
    artifact: contractRefs.artifact,
    markdownArtifact: contractRefs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerContract(memory, changePath, contract);
  const dryRun: SchedulerDispatchDryRun = {
    version: "1.0",
    id: schedulerDispatchDryRunId,
    changeId: topic.changeId,
    status: "generated",
    schedulerMode: "parallel-readiness-v1",
    schedulerContractId,
    decompositionPlanId,
    readinessManifestId,
    nodeVerdicts: contractNodes.map((node) => ({
      nodeId: node.id,
      unitId: node.unitId,
      waveIndex: 0,
      status: "candidate",
      dependencyNodeIds: [],
      dependenciesSatisfied: true,
      sourceScopes: node.sourceScopes,
      stages: node.stages,
      runtimeContinuityPrerequisites: [],
      blockedReasons: [],
    })),
    waveVerdicts: [{
      index: 0,
      nodeIds: contractNodes.map((node) => node.id),
      status: "candidate",
      candidateCount: contractNodes.length,
      blockedCount: 0,
      blockedReasons: [],
    }],
    estimatedMaxWaveWidth: 2,
    dependencyCount: 0,
    conflictCount: 0,
    conflictScopes: [],
    runtimeContinuityPrerequisites: [],
    blockedReasons: [],
    sourceArtifactHashes,
    artifactRefs: [dryRunRefs.artifact, dryRunRefs.markdownArtifact, contractRefs.artifact],
    artifact: dryRunRefs.artifact,
    markdownArtifact: dryRunRefs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerDispatchDryRun(memory, changePath, dryRun);
  const plannedStages = contractNodes.map((node, index) => ({
    id: `stage-${index + 1}`,
    nodeId: node.id,
    unitId: node.unitId,
    waveIndex: 0,
    stage: "coder" as const,
    roleId: "coder",
    status: "planned" as const,
    workspaceIntent: {
      kind: "future-local-worktree" as const,
      sourceScopes: node.sourceScopes,
      requiresFreshWorktree: true,
    },
    adapterFamily: "codex-code" as const,
    permissionProfile: {
      version: "1.0" as const,
      roleId: "coder",
      allowedReadRoots: ["."],
      allowedWriteRoots: node.sourceScopes,
      deniedPaths: [],
      allowedCommands: ["npm test"],
      sandboxPolicy: "workspace-write" as const,
      mayDelegate: false,
    },
    eventSourceExpectation: {
      adapterFamily: "codex-code" as const,
      expectedEventTypes: ["coder.completed"],
    },
    recoveryKeyInputs: [{ key: "changeId", value: topic.changeId }],
    blockedReasons: [],
  }));
  const workerPlan: SchedulerWorkerSessionPlan = {
    version: "1.0",
    id: schedulerWorkerPlanId,
    changeId: topic.changeId,
    status: "planned",
    schedulerMode: "parallel-readiness-v1",
    schedulerContractId,
    schedulerDispatchDryRunId,
    decompositionPlanId,
    readinessManifestId,
    plannedNodes: contractNodes.map((node, index) => ({
      nodeId: node.id,
      unitId: node.unitId,
      waveIndex: 0,
      status: "planned",
      stageIds: [plannedStages[index].id],
      blockedReasons: [],
    })),
    plannedStages,
    plannedWorkerCount: 2,
    stageCount: plannedStages.length,
    blockedCount: 0,
    warningCount: 0,
    recoveryKeyCoverage: "complete",
    sourceArtifactHashes,
    artifactRefs: [workerPlanRefs.artifact, workerPlanRefs.markdownArtifact, dryRunRefs.artifact],
    artifact: workerPlanRefs.artifact,
    markdownArtifact: workerPlanRefs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerWorkerSessionPlan(memory, changePath, workerPlan);
  const schedulerPlanClaimIntents = contractNodes.map((node, index) => ({
    claimIntentId: `claim-intent-${index + 1}`,
    plannedWorkerKey: `worker-${index + 1}`,
    nodeId: node.id,
    unitId: node.unitId,
    waveIndex: 0,
    stageIds: [plannedStages[index].id],
    roleIds: ["coder"],
    sourceScopes: node.sourceScopes,
    status: "planned" as const,
    plannedSlotDemand: 1,
    sourceLockIntents: node.sourceScopes.map((scope) => ({
      scope,
      nodeId: node.id,
      unitId: node.unitId,
      waveIndex: 0,
      stageIds: [plannedStages[index].id],
    })),
    recoveryKeyInputs: [{ key: "changeId", value: topic.changeId }],
    blockedReasons: [],
  }));
  const claimPlan: SchedulerClaimReconcilePlan = {
    version: "1.0",
    id: schedulerClaimReconcilePlanId,
    changeId: topic.changeId,
    status: "planned",
    schedulerMode: "parallel-readiness-v1",
    schedulerContractId,
    schedulerDispatchDryRunId,
    schedulerWorkerPlanId,
    decompositionPlanId,
    readinessManifestId,
    claimIntents: schedulerPlanClaimIntents,
    waveCheckpoints: [{
      waveIndex: 0,
      claimIntentIds: schedulerPlanClaimIntents.map((claim) => claim.claimIntentId),
      candidateCount: schedulerPlanClaimIntents.length,
      blockedCount: 0,
      plannedSlotDemand: 2,
      blockedReasons: [],
    }],
    plannedSlotDemand: 2,
    maxPlannedWaveWidth: 2,
    blockedCount: 0,
    recoveryKeyCoverage: "complete",
    sourceArtifactHashes,
    artifactRefs: [claimPlanRefs.artifact, claimPlanRefs.markdownArtifact, workerPlanRefs.artifact],
    artifact: claimPlanRefs.artifact,
    markdownArtifact: claimPlanRefs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerClaimReconcilePlan(memory, changePath, claimPlan);
  const preflight: SchedulerLaunchPreflight = {
    version: "1.0",
    id: schedulerLaunchPreflightId,
    changeId: topic.changeId,
    status: "checked",
    schedulerMode: "parallel-readiness-v1",
    schedulerContractId,
    schedulerDispatchDryRunId,
    schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId,
    decompositionPlanId,
    readinessManifestId,
    claimSummaries: schedulerPlanClaimIntents.map((claim) => ({
      claimIntentId: claim.claimIntentId,
      plannedWorkerKey: claim.plannedWorkerKey,
      nodeId: claim.nodeId,
      unitId: claim.unitId,
      waveIndex: claim.waveIndex,
      status: claim.status,
      plannedSlotDemand: claim.plannedSlotDemand,
      sourceScopes: claim.sourceScopes,
      blockedReasons: [],
    })),
    sourceLockSummaries: schedulerPlanClaimIntents.flatMap((claim) => claim.sourceScopes.map((scope) => ({
      scope,
      waveIndexes: [claim.waveIndex],
      claimIntentIds: [claim.claimIntentId],
      status: "clear" as const,
      blockedReasons: [],
    }))),
    plannedSlotDemand: 2,
    maxPlannedWaveWidth: 2,
    blockedCount: 0,
    runtimeContinuityRequirements: [],
    permissionProfileRequirements: [],
    toolPolicyGateRequirement: {
      id: "tool-policy-gate",
      status: "required",
      description: "Seeded scheduler run still requires ToolPolicyGate before worker execution.",
    },
    humanGateRequirement: {
      id: "human-gate",
      status: "required",
      description: "Seeded scheduler run remains human-gated.",
    },
    blockedReasons: [],
    sourceArtifactHashes,
    artifactRefs: [preflightRefs.artifact, preflightRefs.markdownArtifact, claimPlanRefs.artifact],
    artifact: preflightRefs.artifact,
    markdownArtifact: preflightRefs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerLaunchPreflight(memory, changePath, preflight);
  const runRefs = schedulerRunArtifactRefs(memory, changePath, schedulerRunId);
  const reconcileRefs = schedulerReconcileSnapshotArtifactRefs(memory, changePath, schedulerRunId, reconcileSnapshotId);
  const candidateRefs = schedulerIntegrationCandidateArtifactRefs(memory, changePath, schedulerRunId, schedulerIntegrationCandidateId);
  const handoffRefs = schedulerIntegrationCheckHandoffArtifactRefs(memory, changePath, schedulerRunId, schedulerIntegrationCheckHandoffId);
  const schedulerRun: SchedulerRun = {
    version: "1.0",
    id: schedulerRunId,
    changeId: topic.changeId,
    status: "prepared",
    schedulerMode: "parallel-readiness-v1",
    schedulerContractId,
    schedulerDispatchDryRunId,
    schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId,
    decompositionPlanId,
    readinessManifestId,
    claimIntentCount: 2,
    plannedSlotDemand: 2,
    maxPlannedWaveWidth: 2,
    blockedCount: 0,
    humanConfirmed: true,
    futureToolPolicyGateRequired: true,
    futureHumanGateRequired: true,
    sourceArtifactHashes,
    artifactRefs: [runRefs.artifact, runRefs.markdownArtifact, runRefs.journalArtifact],
    artifact: runRefs.artifact,
    markdownArtifact: runRefs.markdownArtifact,
    journalArtifact: runRefs.journalArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerRun(memory, changePath, schedulerRun);

  const worktreeIds = [`wt-seeded-a-${Date.now()}`, `wt-seeded-b-${Date.now()}`];
  const checkoutRoot = getGlobalWorktreeCheckoutRoot(memory.projectId ?? project().id);
  const readyTargets = worktreeIds.map((worktreeId, index) => ({
    worktreeId,
    worktreeDiffHash: `seed-diff-hash-${index + 1}`,
    diffStat: `src/module-${index === 0 ? "a" : "b"}.ts | 1 +`,
    sourceHead,
    validationRunId: `validation-${worktreeId}`,
    auditRunId: `audit-${worktreeId}`,
  }));
  for (const [index, worktreeId] of worktreeIds.entries()) {
    const metadata: WorktreeMetadata = {
      version: "1.0",
      worktreeId,
      projectId: memory.projectId ?? project().id,
      changeId: topic.changeId,
      runId: `run-${worktreeId}`,
      branchName: `aho/${worktreeId}`,
      baseRef: "HEAD",
      baseCommit: sourceHead,
      createdFromDirtyProject: false,
      createdAt: now,
      status: "active",
      checkoutPath: join(checkoutRoot, worktreeId),
      worktreeDiffHash: readyTargets[index].worktreeDiffHash,
    };
    await writeWorktreeMetadata(memory, metadata);
  }
  await writeWorktreeIndex(memory);

  const claimIntents = worktreeIds.map((_worktreeId, index) => ({
    claimIntentId: `claim-intent-${index + 1}`,
    plannedWorkerKey: `worker-${index + 1}`,
    nodeId: `node-${index + 1}`,
    unitId: `unit-${index + 1}`,
    waveIndex: 0,
    status: "pending" as const,
    plannedSlotDemand: 1,
    sourceScopes: [`src/module-${index === 0 ? "a" : "b"}.ts`],
    blockedReasons: [],
  }));
  const waves = [{
    waveIndex: 0,
    claimIntentIds: ["claim-intent-1", "claim-intent-2"],
    candidateCount: 2,
    blockedCount: 0,
    plannedSlotDemand: 2,
    status: "pending" as const,
    blockedReasons: [],
  }];
  const reconcileSnapshot: SchedulerReconcileSnapshot = {
    version: "1.0",
    id: reconcileSnapshotId,
    changeId: topic.changeId,
    schedulerRunId,
    schedulerMode: "parallel-readiness-v1",
    status: "generated",
    schedulerRuntimeStateId,
    schedulerContractId,
    schedulerDispatchDryRunId,
    schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId,
    claimIntents,
    waves,
    plannedSlotDemand: 2,
    maxPlannedWaveWidth: 2,
    blockedCount: 0,
    warningCount: 0,
    warnings: [],
    recoveryCheckpoint: "seeded-reconcile",
    sourceArtifactHashes,
    artifactRefs: [reconcileRefs.artifact, reconcileRefs.markdownArtifact],
    artifact: reconcileRefs.artifact,
    markdownArtifact: reconcileRefs.markdownArtifact,
    createdAt: now,
  };
  await writeSchedulerReconcileSnapshot(memory, changePath, reconcileSnapshot);

  const runtimeState: SchedulerRuntimeState = {
    version: "1.0",
    id: schedulerRuntimeStateId,
    changeId: topic.changeId,
    schedulerRunId,
    schedulerMode: "parallel-readiness-v1",
    status: "initialized",
    schedulerContractId,
    schedulerDispatchDryRunId,
    schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId,
    decompositionPlanId,
    readinessManifestId,
    claimIntents,
    waves,
    plannedSlotDemand: 2,
    maxPlannedWaveWidth: 2,
    blockedCount: 0,
    lastReconcileSnapshotId: reconcileSnapshotId,
    lastClaimReservationId: claimReservationId,
    lastClaimReservationSnapshotId: reconcileSnapshotId,
    sourceArtifactHashes,
    artifactRefs: [],
    artifact: `${changePath}/planning/scheduler-runs/${schedulerRunId}/runtime/scheduler-runtime-state.json`,
    eventsArtifact: `${changePath}/planning/scheduler-runs/${schedulerRunId}/runtime/scheduler-runtime-events.jsonl`,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerRuntimeState(memory, changePath, runtimeState);

  const reservation: SchedulerRuntimeClaimReservation = {
    version: "1.0",
    id: claimReservationId,
    changeId: topic.changeId,
    schedulerRunId,
    schedulerMode: "parallel-readiness-v1",
    status: "reserved",
    schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: reconcileSnapshotId,
    schedulerContractId,
    schedulerDispatchDryRunId,
    schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId,
    reservationIntents: worktreeIds.map((_worktreeId, index) => ({
      reservationIntentId: `reservation-intent-${index + 1}`,
      claimIntentId: `claim-intent-${index + 1}`,
      plannedWorkerKey: `worker-${index + 1}`,
      nodeId: `node-${index + 1}`,
      unitId: `unit-${index + 1}`,
      waveIndex: 0,
      status: "reserved",
      plannedSlotDemand: 1,
      sourceScopes: [`src/module-${index === 0 ? "a" : "b"}.ts`],
      blockedReasons: [],
    })),
    waves: [{ waveIndex: 0, reservationIntentIds: ["reservation-intent-1", "reservation-intent-2"], reservedCount: 2, blockedCount: 0, plannedSlotDemand: 2, status: "reserved", blockedReasons: [] }],
    sourceLocks: readyTargets.map((target, index) => ({
      scope: `src/module-${index === 0 ? "a" : "b"}.ts`,
      waveIndex: 0,
      reservationIntentIds: [`reservation-intent-${index + 1}`],
      status: "reserved",
      blockedReasons: [],
    })),
    reservedCount: 2,
    blockedCount: 0,
    sourceLockCount: 2,
    sourceArtifactHashes,
    artifactRefs: [],
    artifact: `${changePath}/planning/scheduler-runs/${schedulerRunId}/claim-reservations/${claimReservationId}.json`,
    markdownArtifact: `${changePath}/planning/scheduler-runs/${schedulerRunId}/claim-reservations/${claimReservationId}.md`,
    createdAt: now,
  };
  await writeSchedulerRuntimeClaimReservation(memory, changePath, reservation);

  const candidate: SchedulerIntegrationCandidate = {
    version: "1.0",
    id: schedulerIntegrationCandidateId,
    changeId: topic.changeId,
    schedulerRunId,
    schedulerMode: "parallel-readiness-v1",
    status: "ready",
    schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: reconcileSnapshotId,
    schedulerClaimReservationId: claimReservationId,
    schedulerContractId,
    schedulerDispatchDryRunId,
    schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId,
    outputs: readyTargets.map((target, index) => ({
      outputId: `scheduler-output-${index + 1}`,
      kind: "worker",
      status: "ready",
      blockingReasons: [],
      reservationIntentId: `reservation-intent-${index + 1}`,
      claimIntentId: `claim-intent-${index + 1}`,
      plannedWorkerKey: `worker-${index + 1}`,
      nodeId: `node-${index + 1}`,
      unitId: `unit-${index + 1}`,
      waveIndex: 0,
      taskId: `T-00${index + 1}`,
      taskRunId: `task-run-${target.worktreeId}`,
      workerLeaseId: `worker-lease-${target.worktreeId}`,
      worktreeId: target.worktreeId,
      codeRunId: `run-${target.worktreeId}`,
      validationRunId: target.validationRunId,
      auditRunId: target.auditRunId,
      worktreeDiffHash: target.worktreeDiffHash,
      diffStat: target.diffStat,
      sourceHead: target.sourceHead,
      artifactRefs: [],
    })),
    readyTargets,
    readyWorktreeIds: worktreeIds,
    readyCount: 2,
    blockedCount: 0,
    sourceArtifactHashes,
    artifactRefs: [candidateRefs.artifact, candidateRefs.markdownArtifact],
    artifact: candidateRefs.artifact,
    markdownArtifact: candidateRefs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerIntegrationCandidate(memory, changePath, candidate);

  const integrationCheckDir = join(integrationCheckRoot(memory), integrationCheckId);
  const combinedPatch = [
    "diff --git a/src/module-a.ts b/src/module-a.ts",
    "--- a/src/module-a.ts",
    "+++ b/src/module-a.ts",
    "@@ -1 +1 @@",
    "-export const moduleA = 1;",
    "+export const moduleA = 2;",
    "diff --git a/src/module-b.ts b/src/module-b.ts",
    "--- a/src/module-b.ts",
    "+++ b/src/module-b.ts",
    "@@ -1 +1 @@",
    "-export const moduleB = 1;",
    "+export const moduleB = 2;",
    "",
  ].join("\n");
  const combinedPatchHash = contentHash(combinedPatch);
  await mkdir(integrationCheckDir, { recursive: true });
  await writeFile(join(integrationCheckDir, "combined.patch"), combinedPatch, "utf8");
  const integrationCheck: IntegrationCheckRecord = {
    version: "1.0",
    id: integrationCheckId,
    projectId: memory.projectId,
    status: "passed",
    resultTargets: readyTargets.map((target) => ({
      changeId: topic.changeId,
      worktreeId: target.worktreeId,
      diffHash: target.worktreeDiffHash,
      diffStat: target.diffStat,
      sourceHead: target.sourceHead,
    })),
    sourceHead,
    createdAt: now,
    finishedAt: now,
    summary: "Seeded scheduler IntegrationCheck passed.",
    riskSummary: "Seeded fixture for scheduler discard completion.",
    artifactRefs: [`${integrationCheckId}/integration-check.json`, `${integrationCheckId}/summary.md`],
    artifacts: [{
      kind: "combined",
      path: `${integrationCheckId}/combined.patch`,
      hash: combinedPatchHash,
      createdAt: now,
      source: "integration-check",
    }],
    latestArtifactHash: combinedPatchHash,
    latestArtifactRef: `${integrationCheckId}/combined.patch`,
    aggregateValidation: {
      id: `aggregate-validation-${schedulerRunId}`,
      status: "passed",
      command: ["node", "-e", "process.exit(0)"],
      exitCode: 0,
      stdout: "",
      stderr: "",
      artifactRef: `${integrationCheckId}/aggregate-validation.json`,
      createdAt: now,
    },
    aggregateAudit: {
      id: `aggregate-audit-${schedulerRunId}`,
      status: "approved",
      summary: "Seeded aggregate audit approved.",
      findings: [],
      artifactRef: `${integrationCheckId}/aggregate-audit.json`,
      createdAt: now,
    },
    fixAttempts: [],
    integrationWorktreePath: join(tempDir, ".agent-harness", "integration", integrationCheckId),
    blockingIssues: [],
    warnings: [],
  };
  await writeCheckArtifacts(memory, integrationCheckDir, integrationCheck);

  const handoff: SchedulerIntegrationCheckHandoff = {
    version: "1.0",
    id: schedulerIntegrationCheckHandoffId,
    changeId: topic.changeId,
    schedulerRunId,
    schedulerMode: "parallel-readiness-v1",
    status: "completed",
    schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: reconcileSnapshotId,
    schedulerClaimReservationId: claimReservationId,
    schedulerIntegrationCandidateId,
    schedulerContractId,
    schedulerDispatchDryRunId,
    schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId,
    readyTargets,
    readyWorktreeIds: worktreeIds,
    integrationCheckId,
    integrationCheckStatus: "passed",
    resultTargetWorktreeIds: worktreeIds,
    sourceArtifactHashes,
    artifactRefs: [handoffRefs.artifact, handoffRefs.markdownArtifact, candidateRefs.artifact, `${integrationCheckId}/integration-check.json`],
    artifact: handoffRefs.artifact,
    markdownArtifact: handoffRefs.markdownArtifact,
    createdAt: now,
    updatedAt: now,
  };
  await writeSchedulerIntegrationCheckHandoff(memory, changePath, handoff);

  return {
    topic,
    schedulerRun: { id: schedulerRunId },
    claimReservation: { id: claimReservationId },
    refreshedCandidate: { id: schedulerIntegrationCandidateId, readyWorktreeIds: worktreeIds },
    handoff: {
      handoff: {
        id: schedulerIntegrationCheckHandoffId,
        integrationCheckId,
        schedulerIntegrationCandidateId,
        readyWorktreeIds: worktreeIds,
        resultTargetWorktreeIds: worktreeIds,
      },
      integrationCheck: { id: integrationCheckId },
    },
    latestArtifactHash: combinedPatchHash,
  };
}

export async function prepareSchedulerFirstWorkerThroughResult(options: {
  packageTestScript?: string;
  title?: string;
} = {}): Promise<{
  topic: { changeId: string };
  changeDir: string;
  runtimeEventsPath: string;
  schedulerRun: { id?: string };
  claimReservation: { id?: string };
  workerStart: {
    id?: string;
    schedulerClaimReservationId?: string;
    reservationIntentId?: string;
    claimIntentId?: string;
    taskRunId?: string;
    workerLeaseId?: string;
    worktreeId?: string;
    runId?: string;
  };
  workerResult: { id?: string; status?: string };
}> {
  await initHarness(project());
  const topic = await createWorkbenchTopic(project(), {
    title: options.title ?? "Parallel Scheduler Worker",
    body: "Split this into independent parallel work across multiple modules.",
  });
  await writeAcceptedSpecAndTasks(topic.changeId);
  const changeDir = join(tempDir, "harness", "changes", "active", topic.changeId);
  await writeFile(join(changeDir, "tasks.md"), [
    "# Tasks",
    "",
    "- [ ] T-001: Update module A.",
    "  - Covers: AC-001",
    "- [ ] T-002: Update module B.",
    "  - Covers: AC-001",
    "",
  ].join("\n"), "utf8");
  const draft = await executeWorkbenchAction({ project: project(), path: tempDir }, {
    actionType: "planning.decompose",
    changeId: topic.changeId,
    prompt: "并行 独立 src/module-a.ts src/module-b.ts",
    confirm: true,
  });
  const planId = (draft.result as { result?: { plan?: { id?: string } } }).result?.plan?.id;
  const planPath = join(changeDir, "planning", "decomposition-plan.json");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  plan.units[0].scopeHints = ["src/module-a.ts"];
  plan.units[1].scopeHints = ["src/module-b.ts"];
  plan.units[0].dependsOn = [];
  plan.units[1].dependsOn = [];
  plan.dependencies = [];
  plan.conflictScopes = ["src/module-a.ts", "src/module-b.ts"];
  await writeFile(planPath, JSON.stringify(plan, null, 2), "utf8");

  await executeWorkbenchAction({ project: project(), path: tempDir }, {
    actionType: "planning.decomposition.confirm",
    changeId: topic.changeId,
    decompositionPlanId: planId,
    confirm: true,
  });
  const readiness = await executeWorkbenchAction({ project: project(), path: tempDir }, {
    actionType: "planning.decomposition.assess-readiness",
    changeId: topic.changeId,
    decompositionPlanId: planId,
    confirm: true,
  });
  const manifest = (readiness.result as { result?: { manifest?: { id?: string } } }).result?.manifest;
  await initGitRepository(tempDir);
  await mkdir(join(tempDir, "src"), { recursive: true });
  await writeFile(join(tempDir, ".gitignore"), "harness/\n.agent-harness/\nfake-codex-bin/\n", "utf8");
  await writeFile(join(tempDir, "spec.md"), "# Spec\n\n## Acceptance Criteria\n\n- AC-001: Update module A and module B through same-wave Scheduler workers.\n", "utf8");
  await writeFile(join(tempDir, "plan.md"), "# Plan\n\nRun module A and module B as same-wave Scheduler worker leaves, then integrate after both are terminal.\n", "utf8");
  await writeFile(join(tempDir, "tasks.md"), [
    "# Tasks",
    "",
    "- [ ] T-001: Update module A.",
    "  - Covers: AC-001",
    "- [ ] T-002: Update module B.",
    "  - Covers: AC-001",
    "",
  ].join("\n"), "utf8");
  await writeFile(join(tempDir, "ac-map.json"), JSON.stringify({ generatedAt: "2026-07-08T00:00:00.000Z", items: [] }, null, 2), "utf8");
  await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: { test: options.packageTestScript ?? "node -e \"process.exit(0)\"" } }), "utf8");
  await writeFile(join(tempDir, "src", "module-a.ts"), "export const moduleA = 1;\n", "utf8");
  await writeFile(join(tempDir, "src", "module-b.ts"), "export const moduleB = 1;\n", "utf8");
  await git(tempDir, ["add", "."]);
  await git(tempDir, ["commit", "-m", "initial"]);
  const prepared = await executeWorkbenchAction({ project: project(), path: tempDir }, {
    actionType: "planning.scheduler.plan.prepare",
    changeId: topic.changeId,
    decompositionPlanId: planId,
    readinessManifestId: manifest?.id,
    confirm: true,
  });
  const preparedResult = (prepared.result as {
    result?: {
      schedulerRun?: { id?: string };
      claimReservation?: { id?: string };
      reconcileSnapshot?: { id?: string };
    };
  }).result;
  if (!preparedResult?.schedulerRun?.id || !preparedResult.claimReservation?.id || !preparedResult.reconcileSnapshot?.id) {
    throw new Error(`Scheduler plan prepare did not return scoped run/reservation ids: ${JSON.stringify(prepared.result)}`);
  }
  const schedulerRun = preparedResult?.schedulerRun ?? {};
  const claimReservation = preparedResult?.claimReservation ?? {};
  const runtimeEventsPath = join(changeDir, "planning", "scheduler-runs", `${schedulerRun.id}`, "scheduler-runtime-events.jsonl");

  const reservedSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
  const launchAction = reservedSnapshot.right.confirmationQueue.current
    .flatMap((item) => item.actions)
    .find((action) => findSchedulerGateAction([action], "planning.scheduler.plan.prepare", (candidate) => candidate.schedulerClaimReservationId === claimReservation.id));
  if (!launchAction) throw new Error("Missing scheduler launch confirmation action.");
  if (!launchAction.schedulerRunId || !launchAction.schedulerReconcileSnapshotId || !launchAction.schedulerClaimReservationId) {
    throw new Error(`Scheduler launch confirmation action is missing scoped ids: ${JSON.stringify(launchAction)}`);
  }
  const launchResult = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...launchAction, confirm: true });
  if ((launchResult.result as { status?: string; error?: string }).status === "failed") {
    throw new Error((launchResult.result as { error?: string }).error ?? "scheduler launch confirmation action failed");
  }
  const launchPayload = ((launchResult.result as { result?: unknown }).result ?? launchResult.result) as {
    status?: string;
    blockedSummary?: string;
    claimReservation?: { launchConfirmed?: boolean };
  };
  if (launchPayload.status !== "prepared" || launchPayload.claimReservation?.launchConfirmed !== true) {
    throw new Error(`Scheduler launch confirmation did not mark reservation launch-confirmed: ${JSON.stringify(launchPayload)}`);
  }

  const startSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
  const startAction = startSnapshot.right.confirmationQueue.current
    .flatMap((item) => item.actions)
    .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.start-first", (candidate) => candidate.schedulerClaimReservationId === claimReservation.id));
  if (!startAction) {
    const actions = startSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).map((action) => ({
      actionType: action.actionType,
      goalLoopCurrentGateActionType: action.goalLoopCurrentGateActionType,
      schedulerRunId: action.schedulerRunId,
      schedulerClaimReservationId: action.schedulerClaimReservationId,
      reservationIntentId: action.reservationIntentId,
      claimIntentId: action.claimIntentId,
      enabled: action.enabled,
    }));
    throw new Error(`Missing scheduler first worker action. nextAction=${JSON.stringify(startSnapshot.center.workpad.nextAction)} actions=${JSON.stringify(actions)}`);
  }

  const oldPath = process.env.PATH;
  const fakeCodex = await createFakeCodex();
  try {
    process.env.PATH = `${fakeCodex.binDir}${delimiter}${oldPath ?? ""}`;
    const started = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...startAction, confirm: true });
    const startedWorkflow = started.result as {
      status?: string;
      error?: string;
      result?: {
        postStepGoalLoopEvaluationWarning?: string;
        postStepGoalLoopReadinessWarning?: string;
        schedulerControlledStepEvidence?: {
          controlledLoopBoundaryResult?: { status?: string; warning?: string; nextGateActionType?: string };
          controlledLoopRuntimeBoundary?: { status?: string; warning?: string; nextGateActionType?: string };
        };
      };
    };
    const startedWarnings = startedWorkflow.result?.schedulerControlledStepEvidence;
    if (
      startedWorkflow.result?.postStepGoalLoopEvaluationWarning
      || startedWorkflow.result?.postStepGoalLoopReadinessWarning
      || startedWarnings?.controlledLoopBoundaryResult?.warning
      || startedWarnings?.controlledLoopRuntimeBoundary?.warning
    ) {
      throw new Error(`scheduler first worker start recorded warning evidence: ${JSON.stringify({
        postStepGoalLoopEvaluationWarning: startedWorkflow.result?.postStepGoalLoopEvaluationWarning,
        postStepGoalLoopReadinessWarning: startedWorkflow.result?.postStepGoalLoopReadinessWarning,
        controlledLoopBoundaryResult: startedWarnings?.controlledLoopBoundaryResult,
        controlledLoopRuntimeBoundary: startedWarnings?.controlledLoopRuntimeBoundary,
      })}`);
    }
    const startedActionResult = unwrapControlledSchedulerAdvanceResult((started.result as { result?: unknown }).result ?? started.result);
    const startedResult = startedActionResult as {
        workerStart?: {
          id?: string;
          schedulerClaimReservationId?: string;
          reservationIntentId?: string;
          claimIntentId?: string;
          taskRunId?: string;
          workerLeaseId?: string;
          worktreeId?: string;
          runId?: string;
        };
      };
    const workerStart = startedResult?.workerStart ?? {};

    const resultSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    const resultAction = resultSnapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.reconcile-result", (candidate) => candidate.schedulerWorkerStartId === workerStart.id));
    if (!resultAction) {
      const actions = resultSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).map((action) => ({
        actionType: action.actionType,
        goalLoopCurrentGateActionType: action.goalLoopCurrentGateActionType,
        schedulerWorkerStartId: action.schedulerWorkerStartId,
        schedulerRunId: action.schedulerRunId,
        schedulerClaimReservationId: action.schedulerClaimReservationId,
        reservationIntentId: action.reservationIntentId,
        claimIntentId: action.claimIntentId,
        enabled: action.enabled,
      }));
      throw new Error(`Missing scheduler first worker result reconcile action. workerStart=${JSON.stringify(workerStart)} nextAction=${JSON.stringify(resultSnapshot.center.workpad.nextAction)} actions=${JSON.stringify(actions)}`);
    }
    const reconciled = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...resultAction, confirm: true });
    if ((reconciled.result as { status?: string; error?: string }).status === "failed") {
      throw new Error(`scheduler first worker result reconcile action failed: ${JSON.stringify(reconciled.result)}`);
    }
    const reconciledResult = unwrapControlledSchedulerAdvanceResult((reconciled.result as { result?: unknown }).result ?? reconciled.result) as {
      result?: { id?: string; status?: string };
    };
    const afterResultSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    const workerResult = reconciledResult?.result?.id
      ? reconciledResult.result
      : afterResultSnapshot.center.workpad.schedulerWorkerResult ?? {};
    return {
      topic,
      changeDir,
      runtimeEventsPath,
      schedulerRun,
      claimReservation,
      workerStart,
      workerResult,
    };
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
  }
}

export async function initGitRepository(cwd: string): Promise<void> {
  await git(cwd, ["init"]);
  await git(cwd, ["config", "user.email", "test@example.com"]);
  await git(cwd, ["config", "user.name", "Test User"]);
}

export async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

export async function writeValidationResultWithHash(changeId: string, runId: string, worktreeId: string, diffHash: string, status: "passed" | "failed"): Promise<void> {
  const dir = join(tempDir, ".agent-harness", "runs", runId);
  await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  const validation = {
    version: "1.0",
    id: runId,
    runId,
    changeId,
    profile: "test",
    status,
    executionMode: "worktree",
    worktreeId,
    worktreeDiffHash: diffHash,
    startedAt: now,
    finishedAt: now,
    commands: [],
  };
  await writeFile(join(dir, "validation.json"), JSON.stringify(validation, null, 2), "utf8");
}

export async function writeAuditResultWithHash(changeId: string, runId: string, worktreeId: string, diffHash: string, status: "approved" | "approved-with-notes" | "blocked" | "failed"): Promise<void> {
  const dir = join(tempDir, ".agent-harness", "runs", runId);
  await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  const validationId = runId.startsWith("run-audit-")
    ? runId.replace("run-audit-", "run-validation-")
    : undefined;
  const audit = {
    version: "1.0",
    id: runId,
    runId,
    changeId,
    status,
    worktreeId,
    validationId,
    worktreeDiffHash: diffHash,
    startedAt: now,
    finishedAt: now,
    findings: status === "approved-with-notes" ? [{
      severity: "note",
      area: "risk",
      evidence: "unit test fixture",
      recommendation: "review before applying",
      text: "Package script changed; review before applying.",
    }] : [],
    artifacts: {
      audit: `harness/runs/${runId}/audit.json`,
      auditMarkdown: `harness/runs/${runId}/audit.md`,
      lastMessage: `harness/runs/${runId}/last-message.md`,
      diffStat: `harness/runs/${runId}/diff-stat.txt`,
    },
  };
  await writeFile(join(dir, "audit.json"), JSON.stringify(audit, null, 2), "utf8");
  await writeFile(join(dir, "audit.md"), "Status: approved-with-notes\n", "utf8");
  await writeFile(join(dir, "last-message.md"), "Audit approved with notes.\n", "utf8");
  await writeFile(join(dir, "diff-stat.txt"), " package.json | 2 +-\n", "utf8");
}

export async function prepareConfirmedTaskQueueProposalWithWorkflow(changeId: string, taskIds: string[]): Promise<{ proposalId: string; workflowGraphPlanId: string; workflowRunId: string; readinessManifestId: string; decompositionPlanId: string }> {
  const memory = await resolveProjectMemory(project());
  const planningDir = join(tempDir, "harness", "changes", "active", changeId, "planning");
  await mkdir(planningDir, { recursive: true });
  const now = new Date().toISOString();
  const readinessArtifact = `harness/changes/active/${changeId}/planning/decomposition-readiness.json`;
  const readinessMarkdown = `harness/changes/active/${changeId}/planning/decomposition-readiness.md`;
  const readiness = {
    id: `readiness-${changeId}`,
    changeId,
    decompositionPlanId: `decomposition-${changeId}`,
    status: "ready-for-sequential-taskqueue-proposal",
    recommendation: "taskgraph-sequential",
    executable: false,
    schedulerEligible: true,
    nextAllowedAction: "taskqueue.proposal",
    units: taskIds.map((taskId, index) => ({
      id: `DU-${String(index + 1).padStart(3, "0")}`,
      title: `Task ${taskId}`,
      taskIds: [taskId],
      acIds: ["AC-001"],
      dependsOn: index === 0 ? [] : [`DU-${String(index).padStart(3, "0")}`],
      guardrailStatus: "passed",
      sourceScopes: ["src"],
    })),
    dependencies: taskIds.slice(1).map((_, index) => ({ from: `DU-${String(index + 1).padStart(3, "0")}`, to: `DU-${String(index + 2).padStart(3, "0")}`, kind: "blocks" })),
    conflictScopes: [],
    guardrails: [{ id: "tasks", status: "passed", summary: "Tasks are scoped.", refs: [] }],
    recoveryKeyMaterial: {
      changeId,
      decompositionPlanId: `decomposition-${changeId}`,
      taskIds,
      acIds: ["AC-001"],
      acceptedArtifactRefs: [`harness/changes/active/${changeId}/spec.md`, `harness/changes/active/${changeId}/plan.md`, `harness/changes/active/${changeId}/tasks.md`, `harness/changes/active/${changeId}/ac-map.json`],
      contextScope: "selected-demand",
      rolePolicyProfile: "test",
      notes: [],
    },
    artifactRefs: [`harness/changes/active/${changeId}/spec.md`, `harness/changes/active/${changeId}/plan.md`, `harness/changes/active/${changeId}/tasks.md`, `harness/changes/active/${changeId}/ac-map.json`],
    artifact: readinessArtifact,
    markdownArtifact: readinessMarkdown,
    createdAt: now,
    updatedAt: now,
  };
  await writeFile(join(planningDir, "decomposition-readiness.json"), JSON.stringify(readiness, null, 2), "utf8");
  await writeFile(join(planningDir, "decomposition-readiness.md"), `# ${readiness.id}\n`, "utf8");
  await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: changeId });
  const artifactRefs = [...readiness.artifactRefs, readiness.artifact, readiness.markdownArtifact];
  const proposalId = `taskqueue-proposal-${changeId}`;
  const proposal = {
    id: proposalId,
    changeId,
    decompositionPlanId: readiness.decompositionPlanId,
    readinessManifestId: readiness.id,
    status: "confirmed",
    recommendation: "taskgraph-sequential",
    queueMode: "sequential",
    items: taskIds.map((taskId, index) => ({
      id: `${proposalId}-item-${String(index + 1).padStart(3, "0")}`,
      taskId,
      unitId: readiness.units[index]?.id,
      title: `Task ${taskId}`,
      order: index + 1,
      dependsOn: index === 0 ? [] : [taskIds[index - 1]],
      sourceScopes: ["src"],
      acIds: ["AC-001"],
    })),
    dependencies: readiness.dependencies,
    conflictScopes: [],
    sourceArtifactHashes: await hashArtifactRefs(memory, artifactRefs),
    recoveryKeyMaterial: readiness.recoveryKeyMaterial,
    artifactRefs,
    artifact: `harness/changes/active/${changeId}/planning/taskqueue-proposal.json`,
    markdownArtifact: `harness/changes/active/${changeId}/planning/taskqueue-proposal.md`,
    createdAt: now,
    updatedAt: now,
  };
  await writeFile(join(planningDir, "taskqueue-proposal.json"), JSON.stringify(proposal, null, 2), "utf8");
  await writeFile(join(planningDir, "taskqueue-proposal.md"), `# ${proposal.id}\n`, "utf8");
  const graph = await compileWorkflowGraphPlan(memory, join("harness", "changes", "active", changeId), proposal, readiness);
  const validated = await validateTaskQueueProposalStart(memory, project(), changeId, proposalId, graph.id);
  const workflow = await createWorkflowRunForTaskQueue(memory, project(), validated);
  return { proposalId, workflowGraphPlanId: graph.id, workflowRunId: workflow.id, readinessManifestId: readiness.id, decompositionPlanId: readiness.decompositionPlanId };
}

export function minimalDecompositionPlan(changeId: string): DecompositionPlan {
  const now = new Date().toISOString();
  return {
    id: `decomposition-${changeId}`,
    changeId,
    status: "confirmed",
    recommendation: "taskgraph-sequential",
    rationale: "Test decomposition.",
    units: [{
      id: "DU-001",
      title: "Task T-001",
      summary: "Test unit.",
      taskIds: ["T-001"],
      acIds: ["AC-001"],
      scopeHints: ["src"],
      dependsOn: [],
      recommendedRoleId: "coder-agent",
    }],
    dependencies: [],
    conflictScopes: [],
    riskSummary: "",
    openQuestions: [],
    artifactRefs: [`harness/changes/active/${changeId}/spec.md`],
    recoveryKeyInputs: {
      changeId,
      acceptedArtifactRefs: [`harness/changes/active/${changeId}/spec.md`],
      contextScope: "selected-demand",
      rolePolicyProfile: "test",
      notes: [],
    },
    artifact: `harness/changes/active/${changeId}/planning/decomposition-plan.json`,
    markdownArtifact: `harness/changes/active/${changeId}/planning/decomposition-plan.md`,
    createdAt: now,
    updatedAt: now,
  };
}

export function minimalReadiness(changeId: string, taskIds: string[]): DecompositionReadinessManifest {
  const now = new Date().toISOString();
  const artifactRefs = [
    `harness/changes/active/${changeId}/spec.md`,
    `harness/changes/active/${changeId}/plan.md`,
    `harness/changes/active/${changeId}/tasks.md`,
    `harness/changes/active/${changeId}/ac-map.json`,
  ];
  return {
    id: `readiness-${changeId}`,
    changeId,
    decompositionPlanId: `decomposition-${changeId}`,
    status: "ready-for-sequential-taskqueue-proposal",
    recommendation: "taskgraph-sequential",
    executable: false,
    schedulerEligible: true,
    nextAllowedAction: "taskqueue.proposal",
    units: taskIds.map((taskId, index) => ({
      id: `DU-${String(index + 1).padStart(3, "0")}`,
      title: `Task ${taskId}`,
      taskIds: [taskId],
      acIds: ["AC-001"],
      dependsOn: index === 0 ? [] : [`DU-${String(index).padStart(3, "0")}`],
      guardrailStatus: "passed",
      sourceScopes: ["src"],
    })),
    dependencies: taskIds.slice(1).map((_, index) => ({ from: `DU-${String(index + 1).padStart(3, "0")}`, to: `DU-${String(index + 2).padStart(3, "0")}`, kind: "blocks" })),
    conflictScopes: [],
    guardrails: [{ id: "tasks", status: "passed", summary: "Tasks are scoped.", refs: [] }],
    recoveryKeyMaterial: {
      changeId,
      decompositionPlanId: `decomposition-${changeId}`,
      taskIds,
      acIds: ["AC-001"],
      acceptedArtifactRefs: artifactRefs,
      contextScope: "selected-demand",
      rolePolicyProfile: "test",
      notes: [],
    },
    artifactRefs,
    artifact: `harness/changes/active/${changeId}/planning/decomposition-readiness.json`,
    markdownArtifact: `harness/changes/active/${changeId}/planning/decomposition-readiness.md`,
    createdAt: now,
    updatedAt: now,
  };
}

export function minimalTaskQueueProposal(changeId: string, readiness: DecompositionReadinessManifest, status: TaskQueueProposal["status"] = "draft"): TaskQueueProposal {
  const now = new Date().toISOString();
  const id = `taskqueue-proposal-${changeId}`;
  return {
    id,
    changeId,
    decompositionPlanId: readiness.decompositionPlanId,
    readinessManifestId: readiness.id,
    status,
    recommendation: "taskgraph-sequential",
    queueMode: "sequential",
    items: readiness.units.map((unit, index) => ({
      id: `${id}-item-${String(index + 1).padStart(3, "0")}`,
      taskId: unit.taskIds[0] ?? `T-${String(index + 1).padStart(3, "0")}`,
      unitId: unit.id,
      title: unit.title,
      order: index + 1,
      dependsOn: unit.dependsOn,
      sourceScopes: unit.sourceScopes,
      acIds: unit.acIds,
    })),
    dependencies: readiness.dependencies,
    conflictScopes: readiness.conflictScopes,
    sourceArtifactHashes: {},
    recoveryKeyMaterial: readiness.recoveryKeyMaterial,
    artifactRefs: readiness.artifactRefs,
    artifact: `harness/changes/active/${changeId}/planning/taskqueue-proposal.json`,
    markdownArtifact: `harness/changes/active/${changeId}/planning/taskqueue-proposal.md`,
    createdAt: now,
    updatedAt: now,
  };
}

export function minimalWorkflowGraphPlan(changeId: string, proposal: TaskQueueProposal, readiness: DecompositionReadinessManifest): WorkflowGraphPlan {
  const now = new Date().toISOString();
  const id = `workflow-graph-${changeId}`;
  return {
    version: "1.0",
    id,
    changeId,
    status: "compiled",
    graphMode: "sequential-v1",
    decompositionPlanId: proposal.decompositionPlanId,
    readinessManifestId: readiness.id,
    taskQueueProposalId: proposal.id,
    nodes: proposal.items.map((item) => ({
      id: `${id}-node-${String(item.order).padStart(3, "0")}`,
      taskId: item.taskId,
      taskQueueProposalItemId: item.id,
      unitId: item.unitId,
      title: item.title,
      order: item.order,
      stages: ["coder", "validation", "audit", "bounded-rework"],
      acIds: item.acIds,
      sourceScopes: item.sourceScopes,
    })),
    edges: [],
    sourceArtifactHashes: {},
    artifactRefs: proposal.artifactRefs,
    artifact: `harness/changes/active/${changeId}/planning/workflow-graphs/${id}.json`,
    markdownArtifact: `harness/changes/active/${changeId}/planning/workflow-graphs/${id}.md`,
    createdAt: now,
    updatedAt: now,
  };
}

export async function writeCoderRun(changeId: string, runId: string, taskIds: string[], worktreeId: string, status: RunMetadata["status"], taskRunId?: string): Promise<RunMetadata> {
  const runDir = join(tempDir, ".agent-harness", "runs", runId);
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: tempDir,
    runtime: "coder-codex",
    executionMode: "worktree",
    proposalOnly: true,
    command: ["codex"],
    status,
    exitCode: status === "failed" ? 1 : 0,
    signal: null,
    startedAt: now,
    finishedAt: status === "running" || status === "created" ? null : now,
    artifacts: {
      base: "project-root",
      directory: `.agent-harness/runs/${runId}`,
      context: `.agent-harness/runs/${runId}/context.md`,
      events: `.agent-harness/runs/${runId}/events.jsonl`,
      stdout: `.agent-harness/runs/${runId}/stdout.log`,
      stderr: `.agent-harness/runs/${runId}/stderr.log`,
    },
    worktree: {
      worktreeId,
      branchName: `aho/${runId}`,
      baseRef: "HEAD",
      baseCommit: "abc123",
      checkoutPath: join(tempDir, ".agent-harness", "worktrees", worktreeId),
      metadataPath: `.agent-harness/worktrees/${worktreeId}.json`,
    },
    ...(taskIds.length > 0 ? { taskIds } : {}),
    ...(taskRunId ? { taskRunId } : {}),
  };
  await writeFile(join(runDir, "run.json"), JSON.stringify(run, null, 2), "utf8");
  await writeFile(join(runDir, "events.jsonl"), `${JSON.stringify({ timestamp: now, type: "run.completed", runId })}\n`, "utf8");
  return run;
}

export async function writeTaskRunRecord(changeId: string, taskRunId: string, taskId: string, status: TaskRun["status"], attempt: number, overrides: Partial<TaskRun> = {}): Promise<void> {
  const dir = join(tempDir, ".agent-harness", "runs", "task-runs", changeId);
  await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  const taskRun: TaskRun = {
    version: "1.0",
    id: taskRunId,
    projectId: "test-project",
    changeId,
    taskId,
    roleId: "coder",
    attempt,
    status,
    createdAt: now,
    updatedAt: now,
    startedAt: now,
    finishedAt: status === "running" || status === "claimed" || status === "queued" ? null : now,
    ...overrides,
  };
  await writeFile(join(dir, `${taskRunId}.json`), JSON.stringify(taskRun, null, 2), "utf8");
}

export async function writeWorkerLeaseRecord(changeId: string, leaseId: string, taskRunId: string, taskId: string, status: WorkerLease["status"]): Promise<void> {
  const dir = join(tempDir, ".agent-harness", "runs", "worker-leases", changeId);
  await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  const lease: WorkerLease = {
    version: "1.0",
    id: leaseId,
    projectId: "test-project",
    changeId,
    taskRunId,
    taskId,
    roleId: "coder",
    workerId: "local-test",
    status,
    claimedAt: now,
    updatedAt: now,
    releasedAt: status === "released" ? now : null,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
  await writeFile(join(dir, `${leaseId}.json`), JSON.stringify(lease, null, 2), "utf8");
}

export async function writeTaskQueueRecord(changeId: string, queueId: string, status: TaskQueueRun["status"], overrides: Partial<TaskQueueRun> = {}): Promise<void> {
  const dir = join(tempDir, ".agent-harness", "runs", "task-queues", changeId);
  await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  const queue: TaskQueueRun = {
    version: "1.0",
    id: queueId,
    projectId: "test-project",
    changeId,
    status,
    createdAt: now,
    updatedAt: now,
    startedAt: status === "queued" ? null : now,
    finishedAt: status === "completed" || status === "blocked" || status === "failed" ? now : null,
    totalCount: 1,
    completedCount: status === "completed" ? 1 : 0,
    ...overrides,
  };
  await writeFile(join(dir, `${queueId}.json`), JSON.stringify(queue, null, 2), "utf8");
}

export async function writeTaskQueueItemRecord(changeId: string, queueRunId: string, itemId: string, taskId: string, order: number, status: TaskQueueItem["status"], overrides: Partial<TaskQueueItem> = {}): Promise<void> {
  const dir = join(tempDir, ".agent-harness", "runs", "task-queue-items", changeId);
  await mkdir(dir, { recursive: true });
  const now = new Date().toISOString();
  const item: TaskQueueItem = {
    version: "1.0",
    id: itemId,
    projectId: "test-project",
    changeId,
    queueRunId,
    taskId,
    order,
    status,
    createdAt: now,
    updatedAt: now,
    startedAt: status === "queued" || status === "skipped" ? null : now,
    finishedAt: status === "completed" || status === "blocked" || status === "failed" || status === "skipped" ? now : null,
    ...overrides,
  };
  await writeFile(join(dir, `${itemId}.json`), JSON.stringify(item, null, 2), "utf8");
}

export async function writeValidationResult(changeId: string, validationId: string, worktreeId: string, status: "passed" | "failed"): Promise<void> {
  const runDir = join(tempDir, ".agent-harness", "runs", validationId);
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  await writeRunMetadata(changeId, validationId, "validator", "completed", worktreeId, now);
  await writeFile(join(runDir, "validation.json"), JSON.stringify({
    version: "1.0",
    id: validationId,
    runId: validationId,
    changeId,
    profile: "default",
    status,
    executionMode: "worktree",
    worktreeId,
    startedAt: now,
    finishedAt: now,
    commands: [],
  }, null, 2), "utf8");
}

export async function writeAuditResult(changeId: string, auditId: string, worktreeId: string, status: "approved" | "approved-with-notes" | "blocked" | "failed"): Promise<void> {
  const runDir = join(tempDir, ".agent-harness", "runs", auditId);
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  await writeRunMetadata(changeId, auditId, "auditor", "completed", worktreeId, now);
  await writeFile(join(runDir, "audit.json"), JSON.stringify({
    version: "1.0",
    id: auditId,
    runId: auditId,
    changeId,
    status,
    worktreeId,
    startedAt: now,
    finishedAt: now,
    findings: [],
    artifacts: {
      audit: `.agent-harness/runs/${auditId}/audit.json`,
      auditMarkdown: `.agent-harness/runs/${auditId}/audit.md`,
      lastMessage: `.agent-harness/runs/${auditId}/last-message.md`,
    },
  }, null, 2), "utf8");
}

async function writeRunMetadata(changeId: string, runId: string, runtime: RunMetadata["runtime"], status: RunMetadata["status"], worktreeId: string, now: string): Promise<void> {
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: tempDir,
    runtime,
    executionMode: "worktree",
    command: [runtime],
    status,
    exitCode: status === "failed" ? 1 : 0,
    signal: null,
    startedAt: now,
    finishedAt: now,
    artifacts: {
      base: "project-root",
      directory: `.agent-harness/runs/${runId}`,
      context: `.agent-harness/runs/${runId}/context.md`,
      events: `.agent-harness/runs/${runId}/events.jsonl`,
      stdout: `.agent-harness/runs/${runId}/stdout.log`,
      stderr: `.agent-harness/runs/${runId}/stderr.log`,
    },
    worktree: {
      worktreeId,
      branchName: `aho/${runId}`,
      baseRef: "HEAD",
      baseCommit: "abc123",
      checkoutPath: join(tempDir, ".agent-harness", "worktrees", worktreeId),
      metadataPath: `.agent-harness/worktrees/${worktreeId}.json`,
    },
  };
  await writeFile(join(tempDir, ".agent-harness", "runs", runId, "run.json"), JSON.stringify(run, null, 2), "utf8");
}
