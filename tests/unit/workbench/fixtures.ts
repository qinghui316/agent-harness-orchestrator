import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { afterEach, beforeEach, expect } from "vitest";
import { defaultProviderRegistry } from "../../../src/provider-runtime/default-registry.js";
import { createConversationChangeFixture } from "../../helpers/conversation-change-fixture.js";
import { initHarness } from "../../../src/harness/init.js";
import { executeWorkbenchAction } from "../../../src/server/workbench-server.js";
import { getWorkbenchSnapshot } from "../../../src/workbench/projections/read-model/implementation.js";
import type { WorkbenchDecisionAction } from "../../../src/workbench/read-model-types.js";
import { resolveProjectMemory } from "../../../src/memory/resolver.js";
import { compileWorkflowGraphPlan, hashArtifactRefs, writeWorkflowGraphPlan, type WorkflowAuthoringPlan } from "../../../src/workflow-artifacts/manager.js";
import { runSchedulerReadySetInitialization } from "../../../src/workflow-runtime/scheduler.js";
import { readLatestSchedulerCurrentTransitionView } from "../../../src/workflow-runtime/scheduler-current-transition-view.js";
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
  schedulerWorkerAuditArtifactRefs,
  schedulerWorkerResultArtifactRefs,
  schedulerWorkerStartArtifactRefs,
  schedulerWorkerValidationArtifactRefs,
  writeSchedulerReconcileSnapshot,
  writeSchedulerIntegrationCandidate,
  writeSchedulerIntegrationCheckHandoff,
  writeSchedulerRuntimeClaimReservation,
  writeSchedulerRuntimeState,
  writeSchedulerRuntimeWorkerAudit,
  writeSchedulerRuntimeWorkerResult,
  writeSchedulerRuntimeWorkerStart,
  writeSchedulerRuntimeWorkerValidation,
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
  IntegrationCheckRecord,
  ManagedProject,
  ReadySetWorkflowGraphPlan,
  RunMetadata,
  TaskQueueItem,
  TaskQueueRun,
  WorktreeMetadata,
  TaskRun,
  WorkerLease,
} from "../../../src/types/index.js";
import type { SchedulerClaimReconcilePlan, SchedulerContract, SchedulerDispatchDryRun, SchedulerLaunchPreflight, SchedulerRun, SchedulerWorkerSessionPlan } from "../../../src/workflow-scheduler/types.js";
import type {
  SchedulerIntegrationCandidate,
  SchedulerIntegrationCheckHandoff,
  SchedulerReconcileSnapshot,
  SchedulerRuntimeClaimReservation,
  SchedulerRuntimeState,
  SchedulerRuntimeWorkerAudit,
  SchedulerRuntimeWorkerResult,
  SchedulerRuntimeWorkerStart,
  SchedulerRuntimeWorkerValidation,
} from "../../../src/scheduler-runtime/types.js";

let tempDir: string;
export const execFileAsync = promisify(execFile);

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-workbench-"));
});

afterEach(async () => {
  await defaultProviderRegistry.shutdownAll("Workbench fixture cleanup.");
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
  return actions.find((action) => action.actionType === concreteActionType && predicate(action));
}

export function unwrapWorkflowActionResult(result: unknown): unknown {
  if (!result || typeof result !== "object") return result;
  const record = result as Record<string, unknown>;
  return typeof record.actionRunId === "string" && "result" in record ? record.result : result;
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
const appServerIndex = args.indexOf("app-server");
const mutateOnExec = ${JSON.stringify(mutateOnExec)};
const message = ${JSON.stringify(message)};
if (args[0] === "--version") {
  console.log("codex-cli fake");
  process.exit(0);
}
if (appServerIndex >= 0 && args.includes("--help")) {
  console.log("Codex app server\\n--listen <stdio://>");
  process.exit(0);
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
if (appServerIndex >= 0) {
  const readline = require("readline");
  const rl = readline.createInterface({ input: process.stdin });
  let appCwd = process.cwd();
  let threadSequence = 0;
  let threadId = "thread-scheduler-fake-" + process.pid + "-0";
  let turnSequence = 0;
  const reply = (id, result) => console.log(JSON.stringify({ id, result }));
  rl.on("line", (line) => {
    const request = JSON.parse(line);
    if (request.method === "initialize" || request.method === "skills/extraRoots/set") {
      reply(request.id, {});
    } else if (request.method === "skills/list") {
      reply(request.id, { data: [{ skills: [] }] });
    } else if (request.method === "model/list") {
      reply(request.id, { data: [{ id: "fake-model", model: "fake-model", displayName: "Fake Model" }] });
    } else if (request.method === "thread/start" || request.method === "thread/resume") {
      appCwd = request.params.cwd || appCwd;
      if (request.method === "thread/start") threadId = "thread-scheduler-fake-" + process.pid + "-" + (++threadSequence);
      else if (request.params.threadId) threadId = request.params.threadId;
      reply(request.id, { thread: { id: threadId } });
    } else if (request.method === "turn/start") {
      appCwd = request.params.cwd || appCwd;
      const turnId = "turn-scheduler-fake-" + process.pid + "-" + (++turnSequence);
      const requestText = JSON.stringify(request.params);
      const isAudit = requestText.includes("Auditor Agent Profile") || requestText.includes("Authoritative Audit Packet");
      const responseText = isAudit
        ? "Status: approved\\n\\nFinding: Scheduler worker audit passed."
        : message;
      if (mutateOnExec && !isAudit) fs.appendFileSync(path.join(appCwd, "README.md"), "\\nScheduler worker fake coder\\n", "utf8");
      reply(request.id, { turn: { id: turnId } });
      setImmediate(() => {
        console.log(JSON.stringify({ method: "turn/started", params: { threadId, turn: { id: turnId, status: "inProgress" } } }));
        console.log(JSON.stringify({ method: "item/completed", params: { threadId, turnId, item: { id: "message-scheduler-fake-" + process.pid + "-" + turnSequence, type: "agentMessage", text: responseText } } }));
        console.log(JSON.stringify({ method: "turn/completed", params: { threadId, turn: { id: turnId, status: "completed" } } }));
      });
    }
  });
} else if (args[0] === "exec" || args.includes("exec")) {
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
} else {
  console.error("Unsupported fake codex command: " + args.join(" "));
  process.exit(1);
}
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
    const firstValidationResult = unwrapWorkflowActionResult(firstValidation.result) as {
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

    const secondStart = { workerStart: prepared.secondWorkerStart };

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const secondResultAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.reconcile-result", (candidate) => candidate.schedulerWorkerStartId === secondStart.workerStart?.id));
    if (!secondResultAction) throw new Error("Missing second worker result reconcile action.");
    const secondResult = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...secondResultAction, confirm: true });
    const secondWorkerResult = unwrapWorkflowActionResult(secondResult.result) as { result?: { id?: string; status?: string } };
    expect(secondWorkerResult).toMatchObject({ result: { status: "evidence-ready" } });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const secondValidationAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.validate-first", (candidate) => candidate.schedulerWorkerResultId === secondWorkerResult?.result?.id));
    if (!secondValidationAction) throw new Error("Missing second worker validation action.");
    const secondValidation = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...secondValidationAction, confirm: true });
    const secondValidationResult = unwrapWorkflowActionResult(secondValidation.result) as { schedulerValidation?: { id?: string; status?: string } };
    expect(secondValidationResult).toMatchObject({ schedulerValidation: { status: "passed" } });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const secondAuditAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.audit-first", (candidate) => candidate.schedulerWorkerValidationId === secondValidationResult?.schedulerValidation?.id));
    if (!secondAuditAction) throw new Error("Missing second worker audit action.");
    const secondAudit = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...secondAuditAction, confirm: true });
    const secondAuditResult = unwrapWorkflowActionResult(secondAudit.result) as {
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
    const refreshedCandidate = (unwrapWorkflowActionResult(refreshedCandidateResult.result) as {
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
    const handoff = unwrapWorkflowActionResult(handoffResult.result) as {
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

async function writeSeededTerminalSchedulerWorkerPaths(input: {
  memory: Parameters<typeof writeSchedulerRuntimeWorkerStart>[0];
  changePath: string;
  changeId: string;
  schedulerRunId: string;
  schedulerRuntimeStateId: string;
  schedulerReconcileSnapshotId: string;
  schedulerClaimReservationId: string;
  schedulerContractId: string;
  schedulerDispatchDryRunId: string;
  schedulerWorkerPlanId: string;
  schedulerClaimReconcilePlanId: string;
  schedulerLaunchPreflightId: string;
  sourceArtifactHashes: Record<string, string>;
  now: string;
  targets: Array<{
    worktreeId: string;
    validationRunId: string;
    auditRunId: string;
    node: ReadySetWorkflowGraphPlan["nodes"][number];
    reservationIntentId: string;
  }>;
}): Promise<void> {
  await Promise.all(input.targets.map(async (target, index) => {
    const position = index + 1;
    const nodeId = target.node.id;
    const unitId = target.node.unitId;
    const taskId = target.node.taskIds[0];
    const taskRunId = `task-run-${target.worktreeId}`;
    const workerLeaseId = `worker-lease-${target.worktreeId}`;
    const runId = `run-${target.worktreeId}`;
    const reservationIntentId = target.reservationIntentId;
    const claimIntentId = target.node.claimIntentId;
    const plannedWorkerKey = target.node.plannedWorkerKey;
    const workerStartId = `scheduler-worker-start-${input.schedulerRunId}-${position}`;
    const workerResultId = `scheduler-worker-result-${input.schedulerRunId}-${position}`;
    const workerValidationId = `scheduler-worker-validation-${input.schedulerRunId}-${position}`;
    const workerAuditId = `scheduler-worker-audit-${input.schedulerRunId}-${position}`;
    const startRefs = schedulerWorkerStartArtifactRefs(input.memory, input.changePath, input.schedulerRunId, workerStartId);
    const resultRefs = schedulerWorkerResultArtifactRefs(input.memory, input.changePath, input.schedulerRunId, workerResultId);
    const validationRefs = schedulerWorkerValidationArtifactRefs(input.memory, input.changePath, input.schedulerRunId, workerValidationId);
    const auditRefs = schedulerWorkerAuditArtifactRefs(input.memory, input.changePath, input.schedulerRunId, workerAuditId);
    const lineage = {
      version: "1.0" as const,
      changeId: input.changeId,
      schedulerRunId: input.schedulerRunId,
      schedulerMode: "parallel-readiness-v1" as const,
      schedulerRuntimeStateId: input.schedulerRuntimeStateId,
      schedulerReconcileSnapshotId: input.schedulerReconcileSnapshotId,
      schedulerClaimReservationId: input.schedulerClaimReservationId,
      schedulerContractId: input.schedulerContractId,
      schedulerDispatchDryRunId: input.schedulerDispatchDryRunId,
      schedulerWorkerPlanId: input.schedulerWorkerPlanId,
      schedulerClaimReconcilePlanId: input.schedulerClaimReconcilePlanId,
      schedulerLaunchPreflightId: input.schedulerLaunchPreflightId,
      reservationIntentId,
      claimIntentId,
      plannedWorkerKey,
      nodeId,
      unitId,
      waveIndex: 0,
      taskId,
      taskRunId,
      workerLeaseId,
      sourceArtifactHashes: input.sourceArtifactHashes,
      createdAt: input.now,
      updatedAt: input.now,
    };
    const workerStart: SchedulerRuntimeWorkerStart = {
      ...lineage,
      id: workerStartId,
      status: "started",
      stageId: `stage-${position}`,
      stage: "coder",
      taskRunRoleId: "coder",
      agentRoleId: "coder-agent",
      worktreeId: target.worktreeId,
      runId,
      artifactRefs: [startRefs.artifact, startRefs.markdownArtifact],
      artifact: startRefs.artifact,
      markdownArtifact: startRefs.markdownArtifact,
    };
    const workerResult: SchedulerRuntimeWorkerResult = {
      ...lineage,
      id: workerResultId,
      status: "evidence-ready",
      schedulerWorkerStartId: workerStartId,
      stageId: workerStart.stageId,
      stage: "coder",
      taskRunStatus: "evidence-ready",
      workerLeaseStatus: "released",
      agentRoleId: workerStart.agentRoleId,
      worktreeId: target.worktreeId,
      runId,
      runStatus: "completed",
      artifactRefs: [resultRefs.artifact, resultRefs.markdownArtifact, startRefs.artifact],
      artifact: resultRefs.artifact,
      markdownArtifact: resultRefs.markdownArtifact,
    };
    const workerValidation: SchedulerRuntimeWorkerValidation = {
      ...lineage,
      id: workerValidationId,
      status: "passed",
      schedulerWorkerStartId: workerStartId,
      schedulerWorkerResultId: workerResultId,
      stageId: `${nodeId}:validation`,
      stage: "validation",
      taskRunStatus: "evidence-ready",
      worktreeId: target.worktreeId,
      codeRunId: runId,
      validationRunId: target.validationRunId,
      validationStatus: "passed",
      artifactRefs: [validationRefs.artifact, validationRefs.markdownArtifact, resultRefs.artifact],
      artifact: validationRefs.artifact,
      markdownArtifact: validationRefs.markdownArtifact,
    };
    const workerAudit: SchedulerRuntimeWorkerAudit = {
      ...lineage,
      id: workerAuditId,
      status: "approved",
      schedulerWorkerStartId: workerStartId,
      schedulerWorkerResultId: workerResultId,
      schedulerWorkerValidationId: workerValidationId,
      stageId: `${nodeId}:audit`,
      stage: "audit",
      taskRunStatus: "completed",
      worktreeId: target.worktreeId,
      codeRunId: runId,
      validationRunId: target.validationRunId,
      validationStatus: "passed",
      auditRunId: target.auditRunId,
      auditStatus: "approved",
      artifactRefs: [auditRefs.artifact, auditRefs.markdownArtifact, validationRefs.artifact],
      artifact: auditRefs.artifact,
      markdownArtifact: auditRefs.markdownArtifact,
    };
    await writeSchedulerRuntimeWorkerStart(input.memory, input.changePath, workerStart);
    await writeSchedulerRuntimeWorkerResult(input.memory, input.changePath, workerResult);
    await writeSchedulerRuntimeWorkerValidation(input.memory, input.changePath, workerValidation);
    await writeSchedulerRuntimeWorkerAudit(input.memory, input.changePath, workerAudit);
  }));
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
  const topic = await createConversationChangeFixture(project(), {
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
  const schedulerLaunchPreflightId = `scheduler-launch-preflight-${schedulerRunId}`;
  const workflowGraphPlanId = `workflow-graph-${schedulerRunId}`;
  const acceptedArtifactRefs = [
    `${changePath}/spec.md`,
    `${changePath}/plan.md`,
    `${changePath}/tasks.md`,
  ];
  const sourceArtifactHashes = await hashArtifactRefs(memory, acceptedArtifactRefs);
  const graphBase = `${changePath}/planning/workflow-graphs/${workflowGraphPlanId}`;
  const graph = compileWorkflowGraphPlan({
    version: "1.0",
    mode: "ready-set-v1",
    nodes: [{
      id: "unit-1",
      title: "Update module A",
      taskIds: ["T-001"],
      acIds: ["AC-001"],
      prompt: "Objective: Update module A. Required behavior: Complete T-001. Constraints: Modify only module A. Expected evidence: Report verification results.",
      dependsOn: [],
      sourceScopes: ["src/module-a.ts"],
    }, {
      id: "unit-2",
      title: "Update module B",
      taskIds: ["T-002"],
      acIds: ["AC-001"],
      prompt: "Objective: Update module B. Required behavior: Complete T-002. Constraints: Modify only module B. Expected evidence: Report verification results.",
      dependsOn: [],
      sourceScopes: ["src/module-b.ts"],
    }],
  }, {
    id: workflowGraphPlanId,
    changeId: topic.changeId,
    planArtifactRef: `${changePath}/plan.md`,
    taskIds: ["T-001", "T-002"],
    acIds: ["AC-001"],
    sourceArtifactHashes,
    artifactRefs: acceptedArtifactRefs,
    artifact: `${graphBase}.json`,
    markdownArtifact: `${graphBase}.md`,
    createdAt: now,
  });
  if (graph.graphMode !== "ready-set-v1") throw new Error("Expected ready-set graph fixture.");
  await writeWorkflowGraphPlan(memory, changePath, graph);
  const schedulerContractId = graph.schedulerContractId;
  const schedulerDispatchDryRunId = graph.schedulerDispatchDryRunId;
  const schedulerWorkerPlanId = graph.schedulerWorkerPlanId;
  const schedulerClaimReconcilePlanId = graph.schedulerClaimReconcilePlanId;
  const contractRefs = schedulerContractArtifactRefs(memory, changePath, schedulerContractId);
  const dryRunRefs = schedulerDispatchDryRunArtifactRefs(memory, changePath, schedulerDispatchDryRunId);
  const workerPlanRefs = schedulerWorkerSessionPlanArtifactRefs(memory, changePath, schedulerWorkerPlanId);
  const claimPlanRefs = schedulerClaimReconcilePlanArtifactRefs(memory, changePath, schedulerClaimReconcilePlanId);
  const preflightRefs = schedulerLaunchPreflightArtifactRefs(memory, changePath, schedulerLaunchPreflightId);
  const contractNodes = graph.nodes.map((node) => ({
    id: node.id,
    unitId: node.unitId,
    taskIds: node.taskIds,
    acIds: node.acIds,
    title: node.title,
    sourceScopes: node.sourceScopes,
    stages: node.stages,
  }));
  const contract: SchedulerContract = {
    version: "1.0",
    id: schedulerContractId,
    changeId: topic.changeId,
    status: "compiled",
    schedulerMode: "parallel-readiness-v1",
    workflowGraphPlanId,
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
    workflowGraphPlanId,
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
    adapterFamily: "provider-code" as const,
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
      adapterFamily: "provider-code" as const,
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
    workflowGraphPlanId,
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
  const schedulerPlanClaimIntents = graph.nodes.map((node, index) => ({
    claimIntentId: node.claimIntentId,
    plannedWorkerKey: node.plannedWorkerKey,
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
    workflowGraphPlanId,
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
    workflowGraphPlanId,
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
    workflowGraphPlanId,
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
    node: graph.nodes[index],
    reservationIntentId: `reservation-intent-${index + 1}`,
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

  const claimIntents = readyTargets.map((target) => ({
    claimIntentId: target.node.claimIntentId,
    plannedWorkerKey: target.node.plannedWorkerKey,
    nodeId: target.node.id,
    unitId: target.node.unitId,
    waveIndex: target.node.waveIndex,
    status: "pending" as const,
    plannedSlotDemand: 1,
    sourceScopes: target.node.sourceScopes,
    blockedReasons: [],
  }));
  const waves = [{
    waveIndex: 0,
    claimIntentIds: claimIntents.map((intent) => intent.claimIntentId),
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
    workflowGraphPlanId,
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
    reservationIntents: readyTargets.map((target) => ({
      reservationIntentId: target.reservationIntentId,
      claimIntentId: target.node.claimIntentId,
      plannedWorkerKey: target.node.plannedWorkerKey,
      nodeId: target.node.id,
      unitId: target.node.unitId,
      waveIndex: target.node.waveIndex,
      status: "reserved",
      plannedSlotDemand: 1,
      sourceScopes: target.node.sourceScopes,
      blockedReasons: [],
    })),
    waves: [{ waveIndex: 0, reservationIntentIds: readyTargets.map((target) => target.reservationIntentId), reservedCount: 2, blockedCount: 0, plannedSlotDemand: 2, status: "reserved", blockedReasons: [] }],
    sourceLocks: readyTargets.flatMap((target) => target.node.sourceScopes.map((scope) => ({
      scope,
      waveIndex: target.node.waveIndex,
      reservationIntentIds: [target.reservationIntentId],
      status: "reserved",
      blockedReasons: [],
    }))),
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
  await writeSeededTerminalSchedulerWorkerPaths({
    memory,
    changePath,
    changeId: topic.changeId,
    schedulerRunId,
    schedulerRuntimeStateId,
    schedulerReconcileSnapshotId: reconcileSnapshotId,
    schedulerClaimReservationId: claimReservationId,
    schedulerContractId,
    schedulerDispatchDryRunId,
    schedulerWorkerPlanId,
    schedulerClaimReconcilePlanId,
    schedulerLaunchPreflightId,
    sourceArtifactHashes,
    now,
    targets: readyTargets,
  });

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
      reservationIntentId: target.reservationIntentId,
      claimIntentId: target.node.claimIntentId,
      plannedWorkerKey: target.node.plannedWorkerKey,
      nodeId: target.node.id,
      unitId: target.node.unitId,
      waveIndex: target.node.waveIndex,
      taskId: target.node.taskIds[0],
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
  secondWorkerStart: {
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
  const topic = await createConversationChangeFixture(project(), {
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
  const workflowPlan: WorkflowAuthoringPlan = {
    version: "1.0",
    mode: "ready-set-v1",
    nodes: [{
      id: "module-a",
      title: "Update module A",
      taskIds: ["T-001"],
      acIds: ["AC-001"],
      prompt: "Objective: Update src/module-a.ts. Required behavior: Complete T-001. Constraints: Modify only module A. Expected evidence: Return implementation and verification evidence.",
      dependsOn: [],
      sourceScopes: ["src/module-a.ts"],
    }, {
      id: "module-b",
      title: "Update module B",
      taskIds: ["T-002"],
      acIds: ["AC-001"],
      prompt: "Objective: Update src/module-b.ts. Required behavior: Complete T-002. Constraints: Modify only module B. Expected evidence: Return implementation and verification evidence.",
      dependsOn: [],
      sourceScopes: ["src/module-b.ts"],
    }],
  };
  await writeFile(join(changeDir, "plan.md"), [
    "# Plan",
    "",
    "Run two independent same-wave worker leaves, then integrate after both are terminal.",
    "",
    "## Workflow",
    "",
    "```json",
    JSON.stringify(workflowPlan, null, 2),
    "```",
    "",
  ].join("\n"), "utf8");

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

  const memory = await resolveProjectMemory(project());
  const changePath = join("harness", "changes", "active", topic.changeId);
  const planRef = `${changePath.replaceAll("\\", "/")}/plan.md`;
  const acceptedRefs = ["spec.md", "plan.md", "tasks.md", "ac-map.json"].map((name) => `${changePath.replaceAll("\\", "/")}/${name}`);
  const graphId = `authored-ready-set-${topic.changeId}`;
  const graphBase = `${changePath.replaceAll("\\", "/")}/planning/workflow-graphs/${graphId}`;
  const graph = compileWorkflowGraphPlan(workflowPlan, {
    id: graphId,
    changeId: topic.changeId,
    planArtifactRef: planRef,
    taskIds: ["T-001", "T-002"],
    acIds: ["AC-001"],
    sourceArtifactHashes: await hashArtifactRefs(memory, acceptedRefs),
    artifactRefs: acceptedRefs,
    artifact: `${graphBase}.json`,
    markdownArtifact: `${graphBase}.md`,
    createdAt: new Date().toISOString(),
  });
  if (graph.graphMode !== "ready-set-v1") throw new Error("Expected ready-set graph fixture.");
  await writeWorkflowGraphPlan(memory, changePath, graph);
  const initialized = await runSchedulerReadySetInitialization(memory, changePath, graph);
  const schedulerRun = initialized.schedulerRun;
  const claimReservation = initialized.claimReservation;
  const runtimeEventsPath = join(changeDir, "planning", "scheduler-runs", schedulerRun.id, "scheduler-runtime-events.jsonl");

  const startSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
  const projectedTransition = await readLatestSchedulerCurrentTransitionView(memory, startSnapshot.center.selectedTopic.path, schedulerRun.id, "slow fixture projection path");
  if (projectedTransition.transition.kind !== "start-first-worker") {
    throw new Error(`Scheduler fixture projection path did not produce start-first: ${JSON.stringify(projectedTransition.transition)}`);
  }
  const startAction = startSnapshot.right.confirmationQueue.current
    .flatMap((item) => item.actions)
    .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.start-first", (candidate) => candidate.schedulerClaimReservationId === claimReservation.id));
  if (!startAction) {
    const actions = startSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).map((action) => ({
      actionType: action.actionType,
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
    const startedWorkflow = started.result as { status?: string; error?: string };
    if (startedWorkflow.status === "failed") {
      throw new Error(`scheduler first worker start action failed: ${startedWorkflow.error ?? JSON.stringify(started.result)}`);
    }
    const startedActionResult = unwrapWorkflowActionResult(started.result);
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

    const secondStartSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    const secondStartAction = secondStartSnapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.start-next", (candidate) => candidate.schedulerRunId === schedulerRun.id));
    if (!secondStartAction) {
      throw new Error(`Missing concrete scheduler second worker start action. nextAction=${JSON.stringify(secondStartSnapshot.center.workpad.nextAction)}`);
    }
    const secondStarted = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...secondStartAction, confirm: true });
    if ((secondStarted.result as { status?: string; error?: string }).status === "failed") {
      throw new Error(`scheduler second worker start action failed: ${JSON.stringify(secondStarted.result)}`);
    }
    const secondStartedResult = unwrapWorkflowActionResult(secondStarted.result) as {
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
    const secondWorkerStart = secondStartedResult.workerStart ?? {};

    const resultSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    const resultAction = resultSnapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => findSchedulerGateAction([action], "planning.scheduler.worker.reconcile-result", (candidate) => candidate.schedulerWorkerStartId === workerStart.id));
    if (!resultAction) {
      const actions = resultSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).map((action) => ({
        actionType: action.actionType,
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
    const reconciledResult = unwrapWorkflowActionResult(reconciled.result) as {
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
      secondWorkerStart,
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

export async function prepareAcceptedSequentialWorkflowGraph(changeId: string, taskIds: string[]): Promise<{ workflowGraphPlanId: string }> {
  const memory = await resolveProjectMemory(project());
  const changePath = join("harness", "changes", "active", changeId);
  const now = new Date().toISOString();
  const artifactRefs = ["spec.md", "plan.md", "tasks.md", "ac-map.json"].map((name) => `${changePath.replaceAll("\\", "/")}/${name}`);
  const id = `workflow-graph-${changeId}`;
  const graph = compileWorkflowGraphPlan({
    version: "1.0",
    mode: "sequential-v1",
    nodes: taskIds.map((taskId, index) => ({
      id: `task-${String(index + 1).padStart(3, "0")}`,
      title: `Task ${taskId}`,
      taskIds: [taskId],
      acIds: ["AC-001"],
      prompt: `Objective: Implement accepted task ${taskId}. Required behavior: Complete the accepted task. Constraints: Stay within the accepted source scope. Expected evidence: Report changed files and verification results.`,
      dependsOn: index === 0 ? [] : [`task-${String(index).padStart(3, "0")}`],
      sourceScopes: ["src/**"],
    })),
  }, {
    id,
    changeId,
    planArtifactRef: `${changePath.replaceAll("\\", "/")}/plan.md`,
    taskIds,
    acIds: ["AC-001"],
    sourceArtifactHashes: await hashArtifactRefs(memory, artifactRefs),
    artifactRefs,
    artifact: `harness/changes/active/${changeId}/planning/workflow-graphs/${id}.json`,
    markdownArtifact: `harness/changes/active/${changeId}/planning/workflow-graphs/${id}.md`,
    createdAt: now,
    updatedAt: now,
  });
  await writeWorkflowGraphPlan(memory, changePath, graph);
  return { workflowGraphPlanId: graph.id };
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
    runtime: "provider-code",
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
    worktreeDiffHash: `fixture-diff:${worktreeId}`,
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
    worktreeDiffHash: `fixture-diff:${worktreeId}`,
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
    validationId: auditId.replace(/audit/i, "validation"),
    worktreeDiffHash: `fixture-diff:${worktreeId}`,
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
