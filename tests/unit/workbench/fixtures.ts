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
import type { ManagedProject } from "../../../src/types/index.js";

let tempDir: string;
export const execFileAsync = promisify(execFile);

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-workbench-"));
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
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

export async function createFakeCodex(): Promise<{ binDir: string }> {
  const binDir = join(tempDir, "fake-codex-bin");
  await mkdir(binDir, { recursive: true });
  const script = join(binDir, "fake-codex.cjs");
  await writeFile(script, `#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const args = process.argv.slice(2);
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
  fs.appendFileSync(path.join(cwd, "README.md"), "\\nScheduler worker fake coder\\n", "utf8");
  if (lastMessagePath) fs.writeFileSync(lastMessagePath, "fake scheduler coder done", "utf8");
  console.log(JSON.stringify({ type: "item.completed", item: { type: "agent_message", text: "fake scheduler coder done" } }));
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

export async function writePlanningBundleFixture(changeId: string, goal = "Implement pricing rule", suffix = changeId): Promise<string> {
  const changeDir = join(tempDir, "harness", "changes", "active", changeId);
  const planningDir = join(changeDir, "planning");
  await mkdir(planningDir, { recursive: true });
  const id = `bundle-${suffix}`;
  const specMd = `# Spec\n\n## Goal\n\n${goal}\n\n## Acceptance Criteria\n\n- AC-001: Implement and test the requested behavior.\n`;
  const planMd = "# Plan\n\n1. Update implementation.\n2. Add tests.\n";
  const tasksMd = "- [ ] T-001: Implement requested behavior\n  - Covers: AC-001\n";
  await writeFile(join(planningDir, "latest-bundle.json"), JSON.stringify({
    id,
    status: "draft",
    goal,
    constraints: ["Do not apply source root without confirmation."],
    acceptanceCriteria: ["Implement and test the requested behavior."],
    design: "Use existing pricing module and tests.",
    tasks: [{ id: "T-001", title: "Implement requested behavior", acIds: ["AC-001"] }],
    risks: [],
    openQuestions: [],
    specMd,
    planMd,
    tasksMd,
    acMapCandidate: null,
    artifact: `harness/changes/active/${changeId}/planning/latest-bundle.md`,
    updatedAt: new Date().toISOString(),
  }, null, 2), "utf8");
  await writeFile(join(planningDir, "latest-bundle.md"), `# Planning Draft ${id}\n\n${goal}\n`, "utf8");
  return id;
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
      .find((action) => action.actionType === "planning.scheduler.worker.validate-first" && action.schedulerWorkerResultId === prepared.workerResult.id);
    if (!firstValidationAction) throw new Error("Missing first worker validation action.");
    const firstValidation = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...firstValidationAction, confirm: true });
    const firstValidationResult = (firstValidation.result as {
      result?: { schedulerValidation?: { id?: string } };
    }).result;

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const firstAuditAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => action.actionType === "planning.scheduler.worker.audit-first" && action.schedulerWorkerValidationId === firstValidationResult?.schedulerValidation?.id);
    if (!firstAuditAction) throw new Error("Missing first worker audit action.");
    await executeWorkbenchAction({ project: project(), path: tempDir }, { ...firstAuditAction, confirm: true });
    await rm(join(tempDir, "README.md"), { force: true });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const firstCandidateAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => action.actionType === "planning.scheduler.integration-candidate.compile" && action.schedulerRunId === prepared.schedulerRun.id);
    if (!firstCandidateAction) throw new Error("Missing first scheduler integration candidate action.");
    const firstCandidateResult = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...firstCandidateAction, confirm: true });
    const firstCandidateWorkflow = firstCandidateResult.result as { status?: string; error?: string; result?: unknown };
    if (firstCandidateWorkflow.status === "failed") throw new Error(firstCandidateWorkflow.error ?? "first candidate action failed");
    const firstCandidate = ((firstCandidateWorkflow.result ?? firstCandidateResult.result) as {
      candidate?: { id?: string; readyCount?: number };
    }).candidate;
    expect(firstCandidate).toMatchObject({ readyCount: 1 });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const startNextAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => action.actionType === "planning.scheduler.worker.start-next" && action.schedulerRunId === prepared.schedulerRun.id);
    if (!startNextAction) throw new Error("Missing scheduler start-next action.");
    const secondStartResult = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...startNextAction, confirm: true });
    const secondStart = (((secondStartResult.result as { result?: unknown }).result ?? secondStartResult.result) as {
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
      .find((action) => action.actionType === "planning.scheduler.worker.reconcile-result" && action.schedulerWorkerStartId === secondStart.workerStart?.id);
    if (!secondResultAction) throw new Error("Missing second worker result reconcile action.");
    const secondResult = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...secondResultAction, confirm: true });
    const secondWorkerResult = (secondResult.result as {
      result?: { result?: { id?: string; status?: string } };
    }).result;
    expect(secondWorkerResult).toMatchObject({ result: { status: "evidence-ready" } });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const secondValidationAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => action.actionType === "planning.scheduler.worker.validate-first" && action.schedulerWorkerResultId === secondWorkerResult?.result?.id);
    if (!secondValidationAction) throw new Error("Missing second worker validation action.");
    const secondValidation = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...secondValidationAction, confirm: true });
    const secondValidationResult = (secondValidation.result as {
      result?: { schedulerValidation?: { id?: string; status?: string } };
    }).result;
    expect(secondValidationResult).toMatchObject({ schedulerValidation: { status: "passed" } });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const secondAuditAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => action.actionType === "planning.scheduler.worker.audit-first" && action.schedulerWorkerValidationId === secondValidationResult?.schedulerValidation?.id);
    if (!secondAuditAction) throw new Error("Missing second worker audit action.");
    const secondAudit = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...secondAuditAction, confirm: true });
    const secondAuditResult = ((secondAudit.result as { result?: unknown }).result ?? secondAudit.result) as {
      schedulerAudit?: { status?: string };
    };
    expect(secondAuditResult).toMatchObject({ schedulerAudit: { status: "approved" } });
    await rm(join(tempDir, "README.md"), { force: true });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const refreshedCandidateAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => action.actionType === "planning.scheduler.integration-candidate.compile" && action.schedulerRunId === prepared.schedulerRun.id);
    if (!refreshedCandidateAction) throw new Error("Missing refreshed scheduler integration candidate action.");
    const refreshedCandidateResult = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...refreshedCandidateAction, confirm: true });
    const refreshedCandidateWorkflow = refreshedCandidateResult.result as { status?: string; error?: string; result?: unknown };
    if (refreshedCandidateWorkflow.status === "failed") throw new Error(refreshedCandidateWorkflow.error ?? "refreshed candidate action failed");
    const refreshedCandidate = ((refreshedCandidateWorkflow.result ?? refreshedCandidateResult.result) as {
      candidate?: { id?: string; status?: string; readyCount?: number; readyWorktreeIds?: string[] };
    }).candidate ?? {};
    expect(refreshedCandidate).toMatchObject({ status: "ready", readyCount: 2 });

    snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: prepared.topic.changeId });
    const handoffAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => action.actionType === "planning.scheduler.integration-check.run" && action.schedulerIntegrationCandidateId === refreshedCandidate.id);
    if (!handoffAction) throw new Error("Missing scheduler IntegrationCheck handoff action.");
    const handoffResult = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...handoffAction, confirm: true });
    const handoffWorkflow = handoffResult.result as { status?: string; error?: string; result?: unknown };
    if (handoffWorkflow.status === "failed") throw new Error(handoffWorkflow.error ?? "handoff action failed");
    const handoff = (handoffWorkflow.result ?? handoffResult.result) as {
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
  await writePlanningBundleFixture(topic.changeId, "Implement independent parallel module updates.");
  const bundlePath = join(changeDir, "planning", "latest-bundle.json");
  const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
  bundle.status = "confirmed";
  bundle.tasks = [
    { id: "T-001", title: "Update module A", acIds: ["AC-001"] },
    { id: "T-002", title: "Update module B", acIds: ["AC-001"] },
  ];
  bundle.tasksMd = "- [ ] T-001: Update module A\n  - Covers: AC-001\n- [ ] T-002: Update module B\n  - Covers: AC-001\n";
  await writeFile(bundlePath, JSON.stringify(bundle, null, 2), "utf8");

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
  const schedulerRun = preparedResult?.schedulerRun ?? {};
  const claimReservation = preparedResult?.claimReservation ?? {};
  const runtimeEventsPath = join(changeDir, "planning", "scheduler-runs", `${schedulerRun.id}`, "scheduler-runtime-events.jsonl");

  const reservedSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
  const launchAction = reservedSnapshot.right.confirmationQueue.current
    .flatMap((item) => item.actions)
    .find((action) => action.actionType === "planning.scheduler.plan.prepare" && action.schedulerClaimReservationId === claimReservation.id);
  if (!launchAction) throw new Error("Missing scheduler launch confirmation action.");
  await executeWorkbenchAction({ project: project(), path: tempDir }, { ...launchAction, confirm: true });

  await initGitRepository(tempDir);
  await mkdir(join(tempDir, "src"), { recursive: true });
  await writeFile(join(tempDir, ".gitignore"), "harness/\n.agent-harness/\nfake-codex-bin/\n", "utf8");
  await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: { test: options.packageTestScript ?? "node -e \"process.exit(0)\"" } }), "utf8");
  await writeFile(join(tempDir, "src", "module-a.ts"), "export const moduleA = 1;\n", "utf8");
  await writeFile(join(tempDir, "src", "module-b.ts"), "export const moduleB = 1;\n", "utf8");
  await git(tempDir, ["add", "."]);
  await git(tempDir, ["commit", "-m", "initial"]);

  const startSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
  const startAction = startSnapshot.right.confirmationQueue.current
    .flatMap((item) => item.actions)
    .find((action) => action.actionType === "planning.scheduler.worker.start-first" && action.schedulerClaimReservationId === claimReservation.id);
  if (!startAction) throw new Error("Missing scheduler first worker action.");

  const oldPath = process.env.PATH;
  const fakeCodex = await createFakeCodex();
  try {
    process.env.PATH = `${fakeCodex.binDir}${delimiter}${oldPath ?? ""}`;
    const started = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...startAction, confirm: true });
    const startedActionResult = (started.result as {
      result?: unknown;
    }).result ?? started.result;
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
      .find((action) => action.actionType === "planning.scheduler.worker.reconcile-result" && action.schedulerWorkerStartId === workerStart.id);
    if (!resultAction) throw new Error("Missing scheduler first worker result reconcile action.");
    const reconciled = await executeWorkbenchAction({ project: project(), path: tempDir }, { ...resultAction, confirm: true });
    const reconciledResult = (reconciled.result as {
      result?: {
        result?: { id?: string; status?: string };
      };
    }).result;
    return {
      topic,
      changeDir,
      runtimeEventsPath,
      schedulerRun,
      claimReservation,
      workerStart,
      workerResult: reconciledResult?.result ?? {},
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
