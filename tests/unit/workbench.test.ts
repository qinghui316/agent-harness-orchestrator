import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";
import { beforeEach, describe, expect, it } from "vitest";
import { createChange, closeChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { listRuns } from "../../src/run/manager.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { createWorkbenchTopic, postTopicMessage } from "../../src/workbench/chat.js";
import { buildTypedWorkflowNextAction } from "../../src/workbench/workflow-projection.js";
import { getWorkbenchDecompositionPlanProjection, getWorkbenchDecompositionReadinessProjection, getWorkbenchRunGraphProjection, getWorkbenchSchedulerClaimReservationProjection, getWorkbenchSchedulerContractProjection, getWorkbenchSnapshot, getWorkbenchTaskQueueProposalProjection, getWorkbenchWorkflowGraphPlanProjection, listWorkbenchTopics } from "../../src/workbench/manager.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import {
  completeAgentTask,
  createAgentTask,
  listAgentTasks,
} from "../../src/agent-task/manager.js";
import { buildDelegateTaskManifest, validateDelegateTaskPolicy } from "../../src/agent-task/delegate-task.js";
import { findBoundaryViolations } from "../../src/agent-task/boundary-audit.js";
import { dispatchForegroundRoleTask } from "../../src/agent-task/role-dispatcher.js";
import { evaluateToolPolicy, workerPermissionProfileForRole } from "../../src/agent-task/tool-policy.js";
import { writeRawActiveChange } from "./workbench/change-fixtures.js";
import { listWorktreeStatuses } from "../../src/worktree/manager.js";
import { classifyPrFeedbackSnapshotData } from "../../src/pr-feedback/manager.js";
import { listTaskQueues } from "../../src/task-queue/manager.js";
import { listTaskRuns, listWorkerLeases } from "../../src/task-run/manager.js";
import { listWorkflowRuns } from "../../src/workflow-run/manager.js";
import { auditSchedulerFirstWorker, validateSchedulerFirstWorker } from "../../src/scheduler-runtime/manager.js";
import type { ManagedProject, RunMetadata } from "../../src/types/index.js";
import {
  getTempDir,
  writeCoderRun,
  writeTaskQueueItemRecord,
  writeTaskQueueRecord,
  writeTaskRunRecord,
} from "./workbench/fixtures.js";

let tempDir: string;
const execFileAsync = promisify(execFile);

type BuildTypedWorkflowNextActionInput = Parameters<typeof buildTypedWorkflowNextAction>[0];

function workflowFixture<K extends keyof BuildTypedWorkflowNextActionInput>(
  value: Partial<NonNullable<BuildTypedWorkflowNextActionInput[K]>>,
): NonNullable<BuildTypedWorkflowNextActionInput[K]> {
  return value as NonNullable<BuildTypedWorkflowNextActionInput[K]>;
}

beforeEach(async () => {
  tempDir = getTempDir();
});

function project(path = tempDir): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path,
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}

async function createFakeCodex(): Promise<{ binDir: string }> {
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

async function writePlanningBundleFixture(changeId: string, goal = "Implement pricing rule", suffix = changeId): Promise<string> {
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

describe("workbench read model", () => {
  it("shows the scheduler first worker rework audit gate after passed rework validation", () => {
    const action = buildTypedWorkflowNextAction({
      topic: workflowFixture<"topic">({ id: "change-1", name: "change-1", title: "Change 1", state: "active", path: "harness/changes/active/change-1", runs: [] }),
      readiness: { specReady: true, planReady: true, tasksReady: true },
      decompositionPlan: workflowFixture<"decompositionPlan">({ id: "decomposition-1", status: "confirmed" }),
      decompositionReadiness: workflowFixture<"decompositionReadiness">({ id: "readiness-1", decompositionPlanId: "decomposition-1", status: "ready-for-scheduler-contract", nextAllowedAction: "scheduler.contract" }),
      schedulerRun: workflowFixture<"schedulerRun">({
        id: "scheduler-run-1",
        status: "prepared",
        schedulerContractId: "scheduler-contract-1",
        schedulerDispatchDryRunId: "scheduler-dry-run-1",
        schedulerWorkerPlanId: "scheduler-worker-plan-1",
        schedulerClaimReconcilePlanId: "scheduler-claim-plan-1",
        schedulerLaunchPreflightId: "scheduler-preflight-1",
      }),
      schedulerRuntime: workflowFixture<"schedulerRuntime">({
        schedulerRunId: "scheduler-run-1",
        lastReconcileSnapshotId: "scheduler-snapshot-1",
        lastClaimReservationId: "scheduler-reservation-1",
        lastClaimReservationSnapshotId: "scheduler-snapshot-1",
      }),
      schedulerReconcileSnapshot: workflowFixture<"schedulerReconcileSnapshot">({ id: "scheduler-snapshot-1" }),
      schedulerClaimReservation: workflowFixture<"schedulerClaimReservation">({
        id: "scheduler-reservation-1",
        schedulerRunId: "scheduler-run-1",
        schedulerReconcileSnapshotId: "scheduler-snapshot-1",
        launchConfirmed: true,
      }),
      schedulerWorkerStart: workflowFixture<"schedulerWorkerStart">({
        id: "scheduler-worker-start-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-reservation-1",
        reservationIntentId: "reservation-intent-1",
        claimIntentId: "claim-intent-1",
        taskRunId: "task-run-1",
        workerLeaseId: "worker-lease-1",
        worktreeId: "worktree-1",
        runId: "run-1",
      }),
      schedulerWorkerResult: workflowFixture<"schedulerWorkerResult">({
        id: "scheduler-worker-result-1",
        schedulerWorkerStartId: "scheduler-worker-start-1",
        status: "evidence-ready",
        taskRunId: "task-run-1",
        workerLeaseId: "worker-lease-1",
        worktreeId: "worktree-1",
        runId: "run-1",
      }),
      schedulerWorkerValidation: workflowFixture<"schedulerWorkerValidation">({
        id: "scheduler-worker-validation-1",
        status: "failed",
        taskRunId: "task-run-1",
        workerLeaseId: "worker-lease-1",
        worktreeId: "worktree-1",
        codeRunId: "run-1",
        validationRunId: "validation-1",
      }),
      schedulerWorkerReworkPlan: workflowFixture<"schedulerWorkerReworkPlan">({
        id: "scheduler-worker-rework-plan-1",
        schedulerWorkerValidationId: "scheduler-worker-validation-1",
      }),
      schedulerWorkerReworkStart: workflowFixture<"schedulerWorkerReworkStart">({
        id: "scheduler-worker-rework-start-1",
        schedulerWorkerReworkPlanId: "scheduler-worker-rework-plan-1",
      }),
      schedulerWorkerReworkResult: workflowFixture<"schedulerWorkerReworkResult">({
        id: "scheduler-worker-rework-result-1",
        schedulerWorkerReworkStartId: "scheduler-worker-rework-start-1",
        status: "evidence-ready",
      }),
      schedulerWorkerReworkValidation: workflowFixture<"schedulerWorkerReworkValidation">({
        id: "scheduler-worker-rework-validation-1",
        status: "passed",
        schedulerClaimReservationId: "scheduler-reservation-1",
        schedulerWorkerStartId: "scheduler-worker-start-1",
        schedulerWorkerResultId: "scheduler-worker-result-1",
        schedulerWorkerValidationId: "scheduler-worker-validation-1",
        schedulerWorkerReworkPlanId: "scheduler-worker-rework-plan-1",
        schedulerWorkerReworkStartId: "scheduler-worker-rework-start-1",
        schedulerWorkerReworkResultId: "scheduler-worker-rework-result-1",
        reservationIntentId: "reservation-intent-1",
        claimIntentId: "claim-intent-1",
        reworkTaskRunId: "task-run-rework-1",
        reworkWorkerLeaseId: "worker-lease-rework-1",
        worktreeId: "worktree-1",
        reworkRunId: "run-rework-1",
        validationRunId: "validation-rework-1",
      }),
    });

    expect(action).toMatchObject({
      actionType: "planning.scheduler.worker.rework-audit-first",
      label: "审计当前 worker rework 结果",
      schedulerRunId: "scheduler-run-1",
      schedulerWorkerReworkValidationId: "scheduler-worker-rework-validation-1",
      taskRunId: "task-run-rework-1",
      workerLeaseId: "worker-lease-rework-1",
      worktreeId: "worktree-1",
      runId: "run-rework-1",
      reworkValidationRunId: "validation-rework-1",
    });
  });

  it("refreshes scheduler integration candidate when a later approved worker path is not covered", () => {
    const base = {
      topic: workflowFixture<"topic">({ id: "change-1", name: "change-1", title: "Change 1", state: "active", path: "harness/changes/active/change-1", runs: [] }),
      readiness: { specReady: true, planReady: true, tasksReady: true },
      decompositionPlan: workflowFixture<"decompositionPlan">({ id: "decomposition-1", status: "confirmed" }),
      decompositionReadiness: workflowFixture<"decompositionReadiness">({ id: "readiness-1", decompositionPlanId: "decomposition-1", status: "ready-for-scheduler-contract", nextAllowedAction: "scheduler.contract" }),
      schedulerRun: workflowFixture<"schedulerRun">({
        id: "scheduler-run-1",
        status: "prepared",
        schedulerContractId: "scheduler-contract-1",
        schedulerDispatchDryRunId: "scheduler-dry-run-1",
        schedulerWorkerPlanId: "scheduler-worker-plan-1",
        schedulerClaimReconcilePlanId: "scheduler-claim-plan-1",
        schedulerLaunchPreflightId: "scheduler-preflight-1",
      }),
      schedulerRuntime: workflowFixture<"schedulerRuntime">({
        schedulerRunId: "scheduler-run-1",
        lastReconcileSnapshotId: "scheduler-snapshot-1",
        lastClaimReservationId: "scheduler-reservation-1",
        lastClaimReservationSnapshotId: "scheduler-snapshot-1",
      }),
      schedulerReconcileSnapshot: workflowFixture<"schedulerReconcileSnapshot">({ id: "scheduler-snapshot-1" }),
      schedulerClaimReservation: workflowFixture<"schedulerClaimReservation">({
        id: "scheduler-reservation-1",
        schedulerRunId: "scheduler-run-1",
        schedulerReconcileSnapshotId: "scheduler-snapshot-1",
        launchConfirmed: true,
        reservationIntents: [
          { reservationIntentId: "reservation-intent-1", claimIntentId: "claim-intent-1", status: "reserved", waveIndex: 0 },
          { reservationIntentId: "reservation-intent-2", claimIntentId: "claim-intent-2", status: "reserved", waveIndex: 0 },
        ],
      }),
      schedulerWorkerStart: workflowFixture<"schedulerWorkerStart">({
        id: "scheduler-worker-start-2",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-reservation-1",
        reservationIntentId: "reservation-intent-2",
        claimIntentId: "claim-intent-2",
        taskRunId: "task-run-2",
        workerLeaseId: "worker-lease-2",
        worktreeId: "worktree-2",
        runId: "run-2",
      }),
      schedulerWorkerResult: workflowFixture<"schedulerWorkerResult">({
        id: "scheduler-worker-result-2",
        schedulerWorkerStartId: "scheduler-worker-start-2",
        status: "evidence-ready",
        taskRunId: "task-run-2",
        workerLeaseId: "worker-lease-2",
        worktreeId: "worktree-2",
        runId: "run-2",
      }),
      schedulerWorkerValidation: workflowFixture<"schedulerWorkerValidation">({
        id: "scheduler-worker-validation-2",
        schedulerWorkerResultId: "scheduler-worker-result-2",
        status: "passed",
        taskRunId: "task-run-2",
        workerLeaseId: "worker-lease-2",
        worktreeId: "worktree-2",
        codeRunId: "run-2",
        validationRunId: "validation-2",
      }),
      schedulerWorkerAudit: workflowFixture<"schedulerWorkerAudit">({
        id: "scheduler-worker-audit-2",
        schedulerWorkerValidationId: "scheduler-worker-validation-2",
        status: "approved",
        reservationIntentId: "reservation-intent-2",
        claimIntentId: "claim-intent-2",
        taskRunId: "task-run-2",
        workerLeaseId: "worker-lease-2",
        worktreeId: "worktree-2",
        codeRunId: "run-2",
        validationRunId: "validation-2",
        auditRunId: "audit-2",
      }),
      schedulerWorkerPaths: [
        workflowFixture<"schedulerWorkerPaths">({
          start: { reservationIntentId: "reservation-intent-1" },
          audit: { status: "approved", claimIntentId: "claim-intent-1" },
          status: "audit-approved",
          terminal: true,
        }),
        workflowFixture<"schedulerWorkerPaths">({
          start: { reservationIntentId: "reservation-intent-2" },
          audit: { status: "approved", claimIntentId: "claim-intent-2" },
          status: "audit-approved",
          terminal: true,
        }),
      ],
      schedulerIntegrationCandidate: workflowFixture<"schedulerIntegrationCandidate">({
        id: "scheduler-integration-candidate-1",
        schedulerRunId: "scheduler-run-1",
        schedulerClaimReservationId: "scheduler-reservation-1",
        status: "waiting",
        readyCount: 1,
        blockedCount: 0,
        readyWorktreeIds: ["worktree-1"],
        outputClaimIntentIds: ["claim-intent-1"],
      }),
    } satisfies BuildTypedWorkflowNextActionInput;

    expect(buildTypedWorkflowNextAction(base)).toMatchObject({
      actionType: "planning.scheduler.integration-candidate.compile",
      schedulerRunId: "scheduler-run-1",
      schedulerClaimReservationId: "scheduler-reservation-1",
      schedulerWorkerAuditId: "scheduler-worker-audit-2",
      reservationIntentId: "reservation-intent-2",
      claimIntentId: "claim-intent-2",
    });
  });

  it("classifies Draft PR feedback for main-agent rework decisions", () => {
    expect(classifyPrFeedbackSnapshotData({
      state: "OPEN",
      reviewDecision: "CHANGES_REQUESTED",
      reviews: [],
      comments: [],
      statusCheckRollup: [],
    })).toBe("changes-requested");
    expect(classifyPrFeedbackSnapshotData({
      state: "OPEN",
      reviewDecision: "REVIEW_REQUIRED",
      reviews: [],
      comments: [],
      statusCheckRollup: [{ conclusion: "FAILURE" }],
    })).toBe("checks-failed");
    expect(classifyPrFeedbackSnapshotData({
      state: "OPEN",
      reviewDecision: "APPROVED",
      reviews: [],
      comments: [{ body: "nit" }],
      statusCheckRollup: [],
    })).toBe("comments-only");
    expect(classifyPrFeedbackSnapshotData({
      state: "MERGED",
      reviewDecision: "APPROVED",
      reviews: [],
      comments: [],
      statusCheckRollup: [],
    })).toBe("stale-pr");
  });

  it("records proposal request-changes feedback without accepting the proposal", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Feedback Proposal" });
    const run = await writeSpecProposalRun("feedback-proposal");
    const before = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "feedback-proposal" });
    const action = before.right.approvals.find((item) => item.id === `spec:${run.id}`)?.action;
    expect(action).toBeTruthy();
    if (!action) throw new Error("Expected spec proposal action");

    await executeWorkbenchAction({ project: project(), path: tempDir }, {
      action,
      feedback: "补充边界后再生成 Spec。",
      feedbackContext: {
        contextId: `approval:spec:${run.id}`,
        approvalId: `spec:${run.id}`,
        changeId: "feedback-proposal",
        targetId: run.id,
        runId: run.id,
      },
    });

    const after = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "feedback-proposal" });

    expect(after.right.approvals.some((item) => item.id === `spec:${run.id}`)).toBe(true);
    expect(after.right.decisions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        status: "requested-changes",
        changeId: "feedback-proposal",
        targetId: run.id,
        runId: run.id,
        feedback: "补充边界后再生成 Spec。",
      }),
    ]));
    expect(after.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "decision", status: "requested-changes", body: "User requested changes instead of accepting this decision." }),
    ]));
  });

  it("abandons an active Workpad without requiring close readiness", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Abandon Workpad" });

    const result = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      abandon: { changeId: "abandon-workpad", reason: "用户不需要继续。" },
      confirm: true,
    });
    const topics = await listWorkbenchTopics({ project: project(), path: tempDir });

    expect(result.result).toMatchObject({
      change: expect.objectContaining({ id: "abandon-workpad", state: "archived" }),
    });
    expect(topics.find((topic) => topic.id === "abandon-workpad")).toMatchObject({ state: "archive" });
  });

  it("projects multiple Workpads with scoped background activity and memory isolation", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Selected Blocked Workpad" });
    await writeAcceptedSpecAndTasks("selected-blocked-workpad");
    await writeTaskQueueRecord("selected-blocked-workpad", "queue-selected", "blocked", {
      currentTaskId: "T-001",
      totalCount: 1,
      blockedReason: "T-001: Audit blocked.",
    });
    await writeTaskQueueItemRecord("selected-blocked-workpad", "queue-selected", "queue-selected-item-001", "T-001", 1, "blocked", {
      taskRunId: "taskrun-selected-1",
      blockedReason: "Audit blocked.",
    });
    await writeTaskRunRecord("selected-blocked-workpad", "taskrun-selected-1", "T-001", "blocked", 1, {
      runId: "run-selected-1",
      worktreeId: "wt-selected-1",
      blockedReason: "Audit blocked.",
    });
    await writeCoderRun("selected-blocked-workpad", "run-selected-1", ["T-001"], "wt-selected-1", "completed", "taskrun-selected-1");

    await writeRawActiveChange(tempDir, "background-running-workpad", "Background Running Workpad");
    await writeAcceptedSpecAndTasks("background-running-workpad");
    await writeCoderRun("background-running-workpad", "run-background-1", ["T-001"], "wt-background-1", "running");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "selected-blocked-workpad" });

    expect(snapshot.left.workpads).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "selected-blocked-workpad", runtimeStatus: "blocked", selected: true, blocker: expect.stringContaining("Audit blocked") }),
      expect.objectContaining({ id: "background-running-workpad", runtimeStatus: "running", selected: false, latestRunId: "run-background-1" }),
    ]));
    expect(snapshot.center.workpad.background).toMatchObject({
      runningCount: 1,
      blockedCount: 0,
      waitingDecisionCount: 0,
      items: [expect.objectContaining({ id: "background-running-workpad", runtimeStatus: "running" })],
    });
    expect(snapshot.center.workpad.memoryIsolation).toMatchObject({
      projectStableNamespace: "project/stable",
      currentChangeNamespace: "change/selected-blocked-workpad",
      runNamespaces: expect.arrayContaining(["run/run-selected-1"]),
      relatedWorkpads: [expect.objectContaining({
        changeId: "background-running-workpad",
        status: "running",
        factBoundary: "local-evidence-only",
      })],
    });
    const memoryText = JSON.stringify(snapshot.center.workpad.memoryIsolation);
    expect(memoryText).not.toMatch(/stdout\.log|stderr\.log|events\.jsonl|codex-events\.jsonl|process\.started/);
    expect(snapshot.center.workpad.nextAction).toMatchObject({ label: "正在自动修改", enabled: false });
    expect(snapshot.right.decisionInspector.primary).toBeNull();
  });

  it("creates a separate active demand conversation instead of appending when another demand is active", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Current Active Demand" });

    const next = await createWorkbenchTopic(project(), {
      title: "Independent Follow-up Demand",
      body: "这是另一个独立需求，不应污染当前 Workpad。",
    });
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: next.changeId });

    expect(next.changeId).toBe("independent-follow-up-demand");
    expect(snapshot.center.selectedTopic).toMatchObject({ id: next.changeId, state: "active" });
    expect(snapshot.center.workpad.state).toBe("active");
    expect(snapshot.left.workpads).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "current-active-demand", runtimeStatus: "active" }),
      expect.objectContaining({ id: "independent-follow-up-demand", runtimeStatus: "active", selected: true }),
    ]));
    expect(snapshot.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "user-message", body: "这是另一个独立需求，不应污染当前 Workpad。" }),
    ]));
  });

  it("projects confirmed planning next action into the right confirmation queue", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), {
      title: "Ready Demand",
      body: "Run the accepted plan.",
    });
    await writeAcceptedSpecAndTasks(topic.changeId);
    const planningBundleId = await writePlanningBundleFixture(topic.changeId);

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });

    expect(snapshot.center.workpad.nextAction).toMatchObject({
      actionType: "planning.confirm-execution",
      enabled: true,
    });
    expect(snapshot.right.confirmationQueue.primary).toMatchObject({
      kind: "planning-confirm",
      changeId: topic.changeId,
      summary: expect.stringContaining("写入内部 spec/plan/tasks/ac-map"),
    });
    expect(snapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "planning.confirm-execution", label: "确认规划", planningBundleId }),
    ]));
    expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.goal-loop.evaluate")).toBe(false);
  });

  it("rejects stale planning bundle confirmation", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), {
      title: "Stale Planning",
      body: "Confirm only the visible planning bundle.",
    });
    await writeAcceptedSpecAndTasks(topic.changeId);
    const staleBundleId = await writePlanningBundleFixture(topic.changeId, "First bundle", "first");
    await writePlanningBundleFixture(topic.changeId, "Second bundle", "second");

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.confirm-execution",
      changeId: topic.changeId,
      planningBundleId: staleBundleId,
      confirm: true,
    })).rejects.toThrow("stale or no longer available");
  });

  it("generates and confirms a DecompositionPlan without creating execution artifacts", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), {
      title: "Decompose Demand",
      body: "Assess whether this should be split before execution.",
    });
    await writeAcceptedSpecAndTasks(topic.changeId);
    await writePlanningBundleFixture(topic.changeId, "Implement one scoped demand.");

    const draft = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decompose",
      changeId: topic.changeId,
      confirm: true,
    });
    const planId = ((draft.result as { result?: { plan?: { id?: string } } }).result?.plan?.id);
    expect(planId).toBeTruthy();

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    expect(snapshot.center.workpad.decompositionPlan).toMatchObject({
      id: planId,
      status: "draft",
      recommendation: "single-change",
    });
    expect(snapshot.right.confirmationQueue.current).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "planning-confirm",
        actions: expect.arrayContaining([
          expect.objectContaining({ actionType: "planning.decomposition.confirm", decompositionPlanId: planId }),
        ]),
      }),
    ]));
    const fullPlan = await getWorkbenchDecompositionPlanProjection({ project: project(), path: tempDir }, topic.changeId);
    expect(fullPlan).toMatchObject({ id: planId, status: "draft", units: expect.any(Array) });

    const confirmed = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decomposition.confirm",
      changeId: topic.changeId,
      decompositionPlanId: planId,
      confirm: true,
    });
    expect(confirmed.result).toMatchObject({ status: "completed", result: expect.objectContaining({ executionStarted: false }) });
    const confirmedSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    expect(confirmedSnapshot.right.confirmationQueue.current).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({ actionType: "planning.decomposition.assess-readiness", decompositionPlanId: planId }),
        ]),
      }),
    ]));
    const readiness = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decomposition.assess-readiness",
      changeId: topic.changeId,
      decompositionPlanId: planId,
      confirm: true,
    });
    const manifest = (readiness.result as { result?: { manifest?: { id?: string; status?: string; executable?: boolean; nextAllowedAction?: string } } }).result?.manifest;
    expect(manifest).toMatchObject({
      status: "ready-for-single-change",
      executable: false,
      nextAllowedAction: "code.run",
    });
    const readinessSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    expect(readinessSnapshot.center.workpad.decompositionReadiness).toMatchObject({
      id: manifest?.id,
      decompositionPlanId: planId,
      status: "ready-for-single-change",
      nextAllowedAction: "code.run",
    });
    const fullManifest = await getWorkbenchDecompositionReadinessProjection({ project: project(), path: tempDir }, topic.changeId);
    expect(fullManifest).toMatchObject({
      id: manifest?.id,
      changeId: topic.changeId,
      decompositionPlanId: planId,
      executable: false,
    });
    const memory = await resolveProjectMemory(project());
    expect(await listAgentTasks(memory, topic.changeId)).toHaveLength(0);
    expect(await listTaskQueues(memory, topic.changeId)).toHaveLength(0);
    expect((await getWorkbenchDecompositionPlanProjection({ project: project(), path: tempDir }, topic.changeId))?.status).toBe("confirmed");
  });

  it("rejects draft or stale DecompositionPlan readiness assessment", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), {
      title: "Readiness Stale Plan",
      body: "Assess only the visible confirmed decomposition plan.",
    });
    await writeAcceptedSpecAndTasks(topic.changeId);
    await writePlanningBundleFixture(topic.changeId, "Implement one scoped demand.");

    const draft = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decompose",
      changeId: topic.changeId,
      confirm: true,
    });
    const planId = ((draft.result as { result?: { plan?: { id?: string } } }).result?.plan?.id);
    expect(planId).toBeTruthy();

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decomposition.assess-readiness",
      changeId: topic.changeId,
      decompositionPlanId: planId,
      confirm: true,
    })).rejects.toThrow("stale or no longer available");

    await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decomposition.confirm",
      changeId: topic.changeId,
      decompositionPlanId: planId,
      confirm: true,
    });
    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decomposition.assess-readiness",
      changeId: topic.changeId,
      decompositionPlanId: "forged-plan",
      confirm: true,
    })).rejects.toThrow("stale or no longer available");
  });

  it("fails closed when readiness plan references forged task ids", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), {
      title: "Forged Readiness Task",
      body: "Reject decomposition plans that no longer match accepted tasks.",
    });
    await writeAcceptedSpecAndTasks(topic.changeId);
    await writePlanningBundleFixture(topic.changeId, "Implement one scoped demand.");

    const draft = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decompose",
      changeId: topic.changeId,
      confirm: true,
    });
    const planId = ((draft.result as { result?: { plan?: { id?: string } } }).result?.plan?.id);
    await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decomposition.confirm",
      changeId: topic.changeId,
      decompositionPlanId: planId,
      confirm: true,
    });
    const planPath = join(tempDir, "harness", "changes", "active", topic.changeId, "planning", "decomposition-plan.json");
    const plan = JSON.parse(await readFile(planPath, "utf8"));
    plan.units[0].taskIds = ["T-FORGED"];
    await writeFile(planPath, JSON.stringify(plan, null, 2), "utf8");

    const result = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decomposition.assess-readiness",
      changeId: topic.changeId,
      decompositionPlanId: planId,
      confirm: true,
    });
    expect(result.result).toMatchObject({
      status: "failed",
      error: expect.stringContaining("task-ids-known"),
    });
    const memory = await resolveProjectMemory(project());
    expect(await listAgentTasks(memory, topic.changeId)).toHaveLength(0);
    expect(await listTaskQueues(memory, topic.changeId)).toHaveLength(0);
    expect(await getWorkbenchDecompositionReadinessProjection({ project: project(), path: tempDir }, topic.changeId)).toBeNull();
  });

  it("generates TaskQueueProposal only from latest sequential readiness without starting execution", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), {
      title: "Sequential Proposal",
      body: "Split this into ordered taskgraph work.",
    });
    await writeAcceptedSpecAndTasks(topic.changeId);
    const changeDir = join(tempDir, "harness", "changes", "active", topic.changeId);
    await writeFile(join(changeDir, "tasks.md"), [
      "# Tasks",
      "",
      "- [ ] T-001: First task.",
      "  - Covers: AC-001",
      "- [ ] T-002: Second task.",
      "  - Covers: AC-001",
      "",
    ].join("\n"), "utf8");
    await writePlanningBundleFixture(topic.changeId, "Implement ordered split work.");
    const bundlePath = join(changeDir, "planning", "latest-bundle.json");
    const bundle = JSON.parse(await readFile(bundlePath, "utf8"));
    bundle.tasks = [
      { id: "T-001", title: "First task", acIds: ["AC-001"] },
      { id: "T-002", title: "Second task", acIds: ["AC-001"] },
    ];
    bundle.tasksMd = "- [ ] T-001: First task\n  - Covers: AC-001\n- [ ] T-002: Second task\n  - Covers: AC-001\n";
    await writeFile(bundlePath, JSON.stringify(bundle, null, 2), "utf8");

    const draft = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.decompose",
      changeId: topic.changeId,
      confirm: true,
    });
    const planId = ((draft.result as { result?: { plan?: { id?: string; recommendation?: string } } }).result?.plan?.id);
    expect((draft.result as { result?: { plan?: { recommendation?: string } } }).result?.plan?.recommendation).toBe("taskgraph-sequential");
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
    const manifest = (readiness.result as { result?: { manifest?: { id?: string; status?: string; nextAllowedAction?: string } } }).result?.manifest;
    expect(manifest).toMatchObject({ status: "ready-for-sequential-taskqueue-proposal", nextAllowedAction: "taskqueue.proposal" });

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.taskqueue.propose",
      changeId: topic.changeId,
      readinessManifestId: "forged-readiness",
      confirm: true,
    })).rejects.toThrow("stale or no longer available");

    const proposed = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.taskqueue.propose",
      changeId: topic.changeId,
      readinessManifestId: manifest?.id,
      confirm: true,
    });
    const proposal = (proposed.result as { result?: { proposal?: { id?: string; itemCount?: number; status?: string; readinessManifestId?: string; executionStarted?: boolean } } }).result?.proposal;
    expect(proposal).toMatchObject({ status: "draft", readinessManifestId: manifest?.id });
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    expect(snapshot.center.workpad.taskQueueProposal).toMatchObject({ id: proposal?.id, itemCount: 2, status: "draft" });
    expect(snapshot.right.confirmationQueue.current).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({ actionType: "planning.workflowgraph.compile", taskQueueProposalId: proposal?.id, readinessManifestId: manifest?.id }),
        ]),
      }),
    ]));
    const fullProposal = await getWorkbenchTaskQueueProposalProjection({ project: project(), path: tempDir }, topic.changeId);
    expect(fullProposal).toMatchObject({ id: proposal?.id, items: expect.arrayContaining([expect.objectContaining({ taskId: "T-002" })]) });
    const memory = await resolveProjectMemory(project());
    expect(await listTaskQueues(memory, topic.changeId)).toHaveLength(0);

    const compiled = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.workflowgraph.compile",
      changeId: topic.changeId,
      taskQueueProposalId: proposal?.id,
      readinessManifestId: manifest?.id,
      confirm: true,
    });
    const graph = (compiled.result as { result?: { graph?: { id?: string; taskQueueProposalId?: string; readinessManifestId?: string } } }).result?.graph;
    expect(graph).toMatchObject({ taskQueueProposalId: proposal?.id, readinessManifestId: manifest?.id });
    expect(await listTaskQueues(memory, topic.changeId)).toHaveLength(0);
    const fullGraph = await getWorkbenchWorkflowGraphPlanProjection({ project: project(), path: tempDir }, topic.changeId, graph?.id);
    expect(fullGraph).toMatchObject({ id: graph?.id, graphMode: "sequential-v1", taskQueueProposalId: proposal?.id });

    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.taskqueue.confirm-start",
      changeId: topic.changeId,
      taskQueueProposalId: "forged-proposal",
      workflowGraphPlanId: graph?.id,
      readinessManifestId: manifest?.id,
      decompositionPlanId: manifest?.decompositionPlanId,
      confirm: true,
    })).rejects.toThrow("stale or no longer available");
  });

  it("compiles SchedulerContract from parallel readiness without starting execution", async () => {
    await initHarness(project());
    const topic = await createWorkbenchTopic(project(), {
      title: "Parallel Scheduler Contract",
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
    const manifest = (readiness.result as { result?: { manifest?: { id?: string; status?: string; nextAllowedAction?: string; decompositionPlanId?: string } } }).result?.manifest;
    expect(manifest).toMatchObject({ status: "ready-for-scheduler-contract", nextAllowedAction: "scheduler.contract" });

    const beforeMemory = await resolveProjectMemory(project());
    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.taskqueue.propose",
      changeId: topic.changeId,
      readinessManifestId: manifest?.id,
      confirm: true,
    })).rejects.toThrow("stale or no longer available");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    expect(snapshot.center.workpad.nextAction).toMatchObject({
      actionType: "planning.scheduler.plan.prepare",
      decompositionPlanId: planId,
      readinessManifestId: manifest?.id,
    });
    expect(snapshot.center.workpad.taskQueueProposal).toBeUndefined();
    expect(snapshot.right.confirmationQueue.current).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actions: expect.arrayContaining([
          expect.objectContaining({
            actionType: "planning.scheduler.plan.prepare",
            decompositionPlanId: planId,
            readinessManifestId: manifest?.id,
          }),
        ]),
      }),
    ]));
    expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).map((action) => action.actionType))
      .not.toContain("planning.scheduler.contract.compile");
    expect(snapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "planning.scheduler.plan.prepare", label: "准备并行执行计划" }),
    ]));

    const prepared = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.scheduler.plan.prepare",
      changeId: topic.changeId,
      decompositionPlanId: planId,
      readinessManifestId: manifest?.id,
      confirm: true,
    });
    const preparedResult = (prepared.result as {
      result?: {
        status?: string;
        mode?: string;
        contract?: { id?: string; waveCount?: number; readinessManifestId?: string };
        dryRun?: { id?: string; schedulerContractId?: string; estimatedMaxWaveWidth?: number };
        workerPlan?: { id?: string; schedulerDispatchDryRunId?: string; plannedWorkerCount?: number; stageCount?: number };
        claimReconcilePlan?: { id?: string; schedulerWorkerPlanId?: string; claimIntents?: unknown[]; maxPlannedWaveWidth?: number };
        launchPreflight?: { id?: string; status?: string; schedulerClaimReconcilePlanId?: string; plannedSlotDemand?: number };
        schedulerRun?: { id?: string; status?: string; schedulerLaunchPreflightId?: string; claimIntentCount?: number; plannedSlotDemand?: number };
        runtimeState?: { id?: string; schedulerRunId?: string; blockedCount?: number; lastReconcileSnapshotId?: string; lastClaimReservationId?: string };
        reconcileSnapshot?: { id?: string; schedulerRunId?: string; status?: string; warningCount?: number };
        claimReservation?: { id?: string; schedulerRunId?: string; schedulerReconcileSnapshotId?: string; reservedCount?: number; blockedCount?: number };
        launchBrief?: { status?: string; schedulerRunId?: string; schedulerReconcileSnapshotId?: string; schedulerClaimReservationId?: string; reservedCount?: number; blockedCount?: number; summary?: string };
      };
    }).result;
    expect(preparedResult).toMatchObject({ status: "prepared", mode: "prepared-new-evidence" });
    const contract = preparedResult?.contract;
    const dryRun = preparedResult?.dryRun;
    const workerPlan = preparedResult?.workerPlan;
    const claimReconcilePlan = preparedResult?.claimReconcilePlan;
    const launchPreflight = preparedResult?.launchPreflight;
    const schedulerRun = preparedResult?.schedulerRun;
    const runtimeState = preparedResult?.runtimeState;
    const reconcileSnapshot = preparedResult?.reconcileSnapshot;
    const claimReservation = preparedResult?.claimReservation;
    expect(contract).toMatchObject({ readinessManifestId: manifest?.id });
    expect(dryRun).toMatchObject({ schedulerContractId: contract?.id, estimatedMaxWaveWidth: 2 });
    expect(workerPlan).toMatchObject({ schedulerDispatchDryRunId: dryRun?.id, plannedWorkerCount: 8, stageCount: 8 });
    expect(claimReconcilePlan).toMatchObject({ schedulerWorkerPlanId: workerPlan?.id, maxPlannedWaveWidth: 2 });
    expect(claimReconcilePlan?.claimIntents).toHaveLength(2);
    expect(launchPreflight).toMatchObject({ status: "checked", schedulerClaimReconcilePlanId: claimReconcilePlan?.id, plannedSlotDemand: 2 });
    expect(schedulerRun).toMatchObject({ status: "prepared", schedulerLaunchPreflightId: launchPreflight?.id, claimIntentCount: 2, plannedSlotDemand: 2 });
    expect(runtimeState).toMatchObject({ schedulerRunId: schedulerRun?.id, blockedCount: 0 });
    expect(reconcileSnapshot).toMatchObject({ status: "generated", schedulerRunId: schedulerRun?.id, warningCount: 0 });
    expect(claimReservation).toMatchObject({ status: "reserved", schedulerRunId: schedulerRun?.id, schedulerReconcileSnapshotId: reconcileSnapshot?.id, reservedCount: 2, blockedCount: 0 });
    expect(preparedResult?.launchBrief).toMatchObject({
      status: "ready",
      schedulerRunId: schedulerRun?.id,
      schedulerReconcileSnapshotId: reconcileSnapshot?.id,
      schedulerClaimReservationId: claimReservation?.id,
      reservedCount: 2,
      blockedCount: 0,
    });

    const fullContract = await getWorkbenchSchedulerContractProjection({ project: project(), path: tempDir }, topic.changeId, contract?.id);
    expect(fullContract).toMatchObject({
      id: contract?.id,
      schedulerMode: "parallel-readiness-v1",
      waves: [expect.objectContaining({ nodeIds: expect.arrayContaining(["scheduler-node-001", "scheduler-node-002"]) })],
    });
    const fullReservation = await getWorkbenchSchedulerClaimReservationProjection({ project: project(), path: tempDir }, topic.changeId, schedulerRun?.id, claimReservation?.id);
    expect(fullReservation).toMatchObject({
      id: claimReservation?.id,
      schedulerRunId: schedulerRun?.id,
      schedulerReconcileSnapshotId: reconcileSnapshot?.id,
      status: "reserved",
    });
    const runtimeEventsPath = join(changeDir, "planning", "scheduler-runs", `${schedulerRun?.id}`, "scheduler-runtime-events.jsonl");
    const reservedRuntimeEvents = (await readFile(runtimeEventsPath, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));
    expect(reservedRuntimeEvents).toEqual(expect.arrayContaining([
      expect.objectContaining({ schedulerRunId: schedulerRun?.id, changeId: topic.changeId, type: "scheduler-runtime.initialized" }),
      expect.objectContaining({ schedulerRunId: schedulerRun?.id, changeId: topic.changeId, type: "scheduler-runtime.reconciled" }),
      expect.objectContaining({ schedulerRunId: schedulerRun?.id, changeId: topic.changeId, type: "scheduler-runtime.claim-reserved" }),
    ]));

    const reservedSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    expect(reservedSnapshot.center.workpad.schedulerClaimReservation).toMatchObject({
      id: claimReservation?.id,
      schedulerRunId: schedulerRun?.id,
      schedulerReconcileSnapshotId: reconcileSnapshot?.id,
      reservedCount: 2,
      blockedCount: 0,
    });
    expect(reservedSnapshot.center.workpad.nextAction).toMatchObject({
      actionType: "planning.scheduler.plan.prepare",
      label: "确认启动这个并行执行计划",
      schedulerRunId: schedulerRun?.id,
      schedulerReconcileSnapshotId: reconcileSnapshot?.id,
      schedulerClaimReservationId: claimReservation?.id,
    });
    expect(reservedSnapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionType: "planning.scheduler.plan.prepare", label: "确认启动这个并行执行计划" }),
    ]));
    const schedulerActions = reservedSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).map((action) => action.actionType);
    expect(schedulerActions).toContain("planning.scheduler.plan.prepare");
    expect(schedulerActions).not.toContain("planning.scheduler.runtime.initialize");
    expect(schedulerActions).not.toContain("planning.scheduler.runtime.reconcile");
    expect(schedulerActions).not.toContain("planning.scheduler.runtime.reserve-claims");

    const launchAction = reservedSnapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => action.actionType === "planning.scheduler.plan.prepare" && action.schedulerClaimReservationId === claimReservation?.id);
    if (!launchAction) throw new Error("Missing scheduler launch confirmation action.");
    const launchConfirmation = await executeWorkbenchAction({ project: project(), path: tempDir }, {
      ...launchAction,
      confirm: true,
    });
    expect((launchConfirmation.result as { result?: { mode?: string; launchBrief?: { schedulerClaimReservationId?: string } } }).result).toMatchObject({
      mode: "launch-confirmation",
      launchBrief: { schedulerClaimReservationId: claimReservation?.id },
    });
    await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
      actionType: "planning.scheduler.plan.prepare",
      changeId: topic.changeId,
      schedulerContractId: launchAction.schedulerContractId,
      schedulerDispatchDryRunId: launchAction.schedulerDispatchDryRunId,
      schedulerWorkerPlanId: launchAction.schedulerWorkerPlanId,
      schedulerClaimReconcilePlanId: launchAction.schedulerClaimReconcilePlanId,
      schedulerLaunchPreflightId: launchAction.schedulerLaunchPreflightId,
      schedulerRunId: schedulerRun?.id,
      schedulerReconcileSnapshotId: "forged-reconcile-snapshot",
      schedulerClaimReservationId: claimReservation?.id,
      confirm: true,
    })).rejects.toThrow("stale or no longer available");

    expect(await listTaskQueues(beforeMemory, topic.changeId)).toHaveLength(0);
    expect(await listWorkflowRuns(beforeMemory, topic.changeId)).toHaveLength(0);
    expect(await listTaskRuns(beforeMemory, topic.changeId)).toHaveLength(0);
    expect(await listAgentTasks(beforeMemory, topic.changeId)).toHaveLength(0);
    expect(await listWorktreeStatuses(beforeMemory)).toHaveLength(0);
    expect((await listRuns(beforeMemory)).filter((run) => run.changeId === topic.changeId)).toHaveLength(0);

    const startSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
    expect(startSnapshot.center.workpad.nextAction).toMatchObject({
      actionType: "planning.scheduler.worker.start-first",
      label: "启动第一个 worker",
      schedulerRunId: schedulerRun?.id,
      schedulerClaimReservationId: claimReservation?.id,
    });
    expect(startSnapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        actionType: "planning.scheduler.worker.start-first",
        schedulerRunId: schedulerRun?.id,
        schedulerClaimReservationId: claimReservation?.id,
      }),
    ]));
    const startAction = startSnapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => action.actionType === "planning.scheduler.worker.start-first" && action.schedulerClaimReservationId === claimReservation?.id);
    if (!startAction) throw new Error("Missing scheduler first worker action.");

    await initGitRepository(tempDir);
    await mkdir(join(tempDir, "src"), { recursive: true });
    await writeFile(join(tempDir, ".gitignore"), "harness/\n.agent-harness/\nfake-codex-bin/\n", "utf8");
    await writeFile(join(tempDir, "package.json"), JSON.stringify({ scripts: { test: "node -e \"process.exit(0)\"" } }), "utf8");
    await writeFile(join(tempDir, "src", "module-a.ts"), "export const moduleA = 1;\n", "utf8");
    await writeFile(join(tempDir, "src", "module-b.ts"), "export const moduleB = 1;\n", "utf8");
    await git(tempDir, ["add", "."]);
    await git(tempDir, ["commit", "-m", "initial"]);

    const oldPath = process.env.PATH;
    const fakeCodex = await createFakeCodex();
    process.env.PATH = `${fakeCodex.binDir}${delimiter}${oldPath ?? ""}`;
    try {
      const started = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        ...startAction,
        confirm: true,
      });
      const startedActionResult = (started.result as {
        result?: unknown;
      }).result ?? started.result;
      const startedResult = startedActionResult as {
          executionStarted?: boolean;
          workerStart?: {
            id?: string;
            status?: string;
            stage?: string;
            schedulerRunId?: string;
            schedulerClaimReservationId?: string;
            reservationIntentId?: string;
            claimIntentId?: string;
            taskRunId?: string;
            workerLeaseId?: string;
            taskRunRoleId?: string;
            agentRoleId?: string;
            worktreeId?: string;
            runId?: string;
          };
          taskRun?: { id?: string; roleId?: string };
          lease?: { id?: string; taskRunId?: string };
          code?: { run?: { id?: string; changeId?: string; taskRunId?: string; runtime?: string; executionGate?: Record<string, unknown> } };
        };
      expect(startedResult).toMatchObject({
        executionStarted: true,
        workerStart: {
          status: "started",
          stage: "coder",
          schedulerRunId: schedulerRun?.id,
          schedulerClaimReservationId: claimReservation?.id,
          taskRunRoleId: "coder",
          agentRoleId: "coder-agent",
        },
      });
      expect(startedResult?.taskRun).toMatchObject({ id: startedResult?.workerStart?.taskRunId, roleId: "coder" });
      expect(startedResult?.lease).toMatchObject({ id: startedResult?.workerStart?.workerLeaseId, taskRunId: startedResult?.workerStart?.taskRunId });
      expect(startedResult?.code?.run).toMatchObject({
        id: startedResult?.workerStart?.runId,
        changeId: topic.changeId,
        taskRunId: startedResult?.workerStart?.taskRunId,
        executionGate: {
          mode: "scheduler-claim-reservation",
          schedulerRunId: schedulerRun?.id,
          schedulerClaimReservationId: claimReservation?.id,
          reservationIntentId: startedResult?.workerStart?.reservationIntentId,
          claimIntentId: startedResult?.workerStart?.claimIntentId,
          taskRunId: startedResult?.workerStart?.taskRunId,
        },
      });

      const afterMemory = await resolveProjectMemory(project());
      expect(await listTaskQueues(afterMemory, topic.changeId)).toHaveLength(0);
      expect(await listWorkflowRuns(afterMemory, topic.changeId)).toHaveLength(0);
      expect(await listAgentTasks(afterMemory, topic.changeId)).toHaveLength(0);
      expect(await listTaskRuns(afterMemory, topic.changeId)).toHaveLength(1);
      expect(await listWorktreeStatuses(afterMemory)).toHaveLength(1);
      expect((await listRuns(afterMemory)).filter((run) => run.changeId === topic.changeId)).toHaveLength(1);
      const workerStartPath = join(changeDir, "planning", "scheduler-runs", `${schedulerRun?.id}`, "scheduler-worker-starts", `${startedResult?.workerStart?.id}.json`);
      expect(JSON.parse(await readFile(workerStartPath, "utf8"))).toMatchObject({
        schedulerRunId: schedulerRun?.id,
        schedulerClaimReservationId: claimReservation?.id,
        status: "started",
        stage: "coder",
        taskRunRoleId: "coder",
        agentRoleId: "coder-agent",
      });
      const workerRuntimeEvents = (await readFile(runtimeEventsPath, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));
      expect(workerRuntimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          schedulerRunId: schedulerRun?.id,
          changeId: topic.changeId,
          type: "scheduler-runtime.worker-started",
          payload: expect.objectContaining({
            schedulerClaimReservationId: claimReservation?.id,
            taskRunId: startedResult?.workerStart?.taskRunId,
            workerLeaseId: startedResult?.workerStart?.workerLeaseId,
            worktreeId: startedResult?.workerStart?.worktreeId,
            runId: startedResult?.workerStart?.runId,
          }),
        }),
      ]));
      await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
        ...startAction,
        confirm: true,
      })).rejects.toThrow("stale or no longer available");

      const resultSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
      expect(resultSnapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.worker.reconcile-result",
        label: "检查当前 worker 结果",
        schedulerRunId: schedulerRun?.id,
        schedulerClaimReservationId: claimReservation?.id,
        schedulerWorkerStartId: startedResult?.workerStart?.id,
      });
      const resultAction = resultSnapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.worker.reconcile-result" && action.schedulerWorkerStartId === startedResult?.workerStart?.id);
      if (!resultAction) throw new Error("Missing scheduler first worker result reconcile action.");
      expect(resultAction).toMatchObject({
        schedulerRunId: schedulerRun?.id,
        schedulerClaimReservationId: claimReservation?.id,
        schedulerWorkerStartId: startedResult?.workerStart?.id,
        taskRunId: startedResult?.workerStart?.taskRunId,
        workerLeaseId: startedResult?.workerStart?.workerLeaseId,
        worktreeId: startedResult?.workerStart?.worktreeId,
        runId: startedResult?.workerStart?.runId,
      });

      const reconciled = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        ...resultAction,
        confirm: true,
      });
      expect(reconciled.result).toMatchObject({ status: "completed" });
      const reconciledResult = (reconciled.result as {
        result?: {
          status?: "terminal" | "running";
          result?: {
            id?: string;
            status?: string;
            schedulerWorkerStartId?: string;
            taskRunId?: string;
            workerLeaseId?: string;
            worktreeId?: string;
            runId?: string;
          };
          taskRun?: { id?: string; status?: string };
          lease?: { id?: string; status?: string };
          codeRun?: { id?: string; status?: string };
        };
      }).result;
      expect(reconciledResult).toMatchObject({
        status: "terminal",
        result: {
          status: "evidence-ready",
          schedulerWorkerStartId: startedResult?.workerStart?.id,
          taskRunId: startedResult?.workerStart?.taskRunId,
          workerLeaseId: startedResult?.workerStart?.workerLeaseId,
          worktreeId: startedResult?.workerStart?.worktreeId,
          runId: startedResult?.workerStart?.runId,
        },
        taskRun: { id: startedResult?.workerStart?.taskRunId, status: "evidence-ready" },
        lease: { id: startedResult?.workerStart?.workerLeaseId, status: "released" },
        codeRun: { id: startedResult?.workerStart?.runId, status: "completed" },
      });
      expect((await listTaskRuns(afterMemory, topic.changeId))[0]).toMatchObject({ id: startedResult?.workerStart?.taskRunId, status: "evidence-ready" });
      expect((await listWorkerLeases(afterMemory, topic.changeId)).find((lease) => lease.id === startedResult?.workerStart?.workerLeaseId)).toMatchObject({ status: "released" });
      const workerResultPath = join(changeDir, "planning", "scheduler-runs", `${schedulerRun?.id}`, "scheduler-worker-results", `${reconciledResult?.result?.id}.json`);
      expect(JSON.parse(await readFile(workerResultPath, "utf8"))).toMatchObject({
        schedulerRunId: schedulerRun?.id,
        schedulerClaimReservationId: claimReservation?.id,
        schedulerWorkerStartId: startedResult?.workerStart?.id,
        status: "evidence-ready",
      });
      const resultRuntimeEvents = (await readFile(runtimeEventsPath, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));
      expect(resultRuntimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          schedulerRunId: schedulerRun?.id,
          changeId: topic.changeId,
          type: "scheduler-runtime.worker-result-ready",
          payload: expect.objectContaining({
            schedulerWorkerStartId: startedResult?.workerStart?.id,
            schedulerWorkerResultId: reconciledResult?.result?.id,
            taskRunId: startedResult?.workerStart?.taskRunId,
            workerLeaseId: startedResult?.workerStart?.workerLeaseId,
            worktreeId: startedResult?.workerStart?.worktreeId,
            runId: startedResult?.workerStart?.runId,
          }),
        }),
      ]));
      const postResultSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
      expect(postResultSnapshot.center.workpad.schedulerWorkerResult).toMatchObject({
        id: reconciledResult?.result?.id,
        status: "evidence-ready",
        schedulerWorkerStartId: startedResult?.workerStart?.id,
      });
      expect(postResultSnapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.worker.validate-first",
        label: "验证当前 worker 结果",
        schedulerRunId: schedulerRun?.id,
        schedulerClaimReservationId: claimReservation?.id,
        schedulerWorkerStartId: startedResult?.workerStart?.id,
        schedulerWorkerResultId: reconciledResult?.result?.id,
        enabled: true,
      });
      expect(postResultSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.worker.reconcile-result")).toBe(false);
      const validationAction = postResultSnapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.worker.validate-first" && action.schedulerWorkerResultId === reconciledResult?.result?.id);
      if (!validationAction) throw new Error("Missing scheduler first worker validation action.");
      expect(validationAction).toMatchObject({
        schedulerRunId: schedulerRun?.id,
        schedulerClaimReservationId: claimReservation?.id,
        schedulerWorkerStartId: startedResult?.workerStart?.id,
        schedulerWorkerResultId: reconciledResult?.result?.id,
        taskRunId: startedResult?.workerStart?.taskRunId,
        workerLeaseId: startedResult?.workerStart?.workerLeaseId,
        worktreeId: startedResult?.workerStart?.worktreeId,
        runId: startedResult?.workerStart?.runId,
      });
      const validated = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        ...validationAction,
        confirm: true,
      });
      const validatedResult = (validated.result as {
        result?: {
          status?: "passed" | "failed";
          schedulerValidation?: {
            id?: string;
            status?: string;
            schedulerWorkerResultId?: string;
            taskRunId?: string;
            workerLeaseId?: string;
            worktreeId?: string;
            codeRunId?: string;
            validationRunId?: string;
          };
          taskRun?: { id?: string; status?: string };
          validationRun?: { id?: string; runtime?: string; worktree?: { worktreeId?: string } };
          validationResult?: { id?: string; status?: string; worktreeId?: string };
        };
      }).result;
      expect(validatedResult).toMatchObject({
        status: "passed",
        schedulerValidation: {
          status: "passed",
          schedulerWorkerResultId: reconciledResult?.result?.id,
          taskRunId: startedResult?.workerStart?.taskRunId,
          workerLeaseId: startedResult?.workerStart?.workerLeaseId,
          worktreeId: startedResult?.workerStart?.worktreeId,
          codeRunId: startedResult?.workerStart?.runId,
        },
        taskRun: { id: startedResult?.workerStart?.taskRunId, status: "evidence-ready" },
        validationRun: { runtime: "validator", worktree: { worktreeId: startedResult?.workerStart?.worktreeId } },
        validationResult: { status: "passed", worktreeId: startedResult?.workerStart?.worktreeId },
      });
      const workerValidationPath = join(changeDir, "planning", "scheduler-runs", `${schedulerRun?.id}`, "scheduler-worker-validations", `${validatedResult?.schedulerValidation?.id}.json`);
      expect(JSON.parse(await readFile(workerValidationPath, "utf8"))).toMatchObject({
        schedulerRunId: schedulerRun?.id,
        schedulerWorkerResultId: reconciledResult?.result?.id,
        status: "passed",
        worktreeId: startedResult?.workerStart?.worktreeId,
        codeRunId: startedResult?.workerStart?.runId,
        validationRunId: validatedResult?.schedulerValidation?.validationRunId,
      });
      const validationRuntimeEvents = (await readFile(runtimeEventsPath, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));
      expect(validationRuntimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          schedulerRunId: schedulerRun?.id,
          changeId: topic.changeId,
          type: "scheduler-runtime.worker-validation-passed",
          payload: expect.objectContaining({
            schedulerWorkerStartId: startedResult?.workerStart?.id,
            schedulerWorkerResultId: reconciledResult?.result?.id,
            schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
            taskRunId: startedResult?.workerStart?.taskRunId,
            workerLeaseId: startedResult?.workerStart?.workerLeaseId,
            worktreeId: startedResult?.workerStart?.worktreeId,
            codeRunId: startedResult?.workerStart?.runId,
            validationRunId: validatedResult?.schedulerValidation?.validationRunId,
            validationStatus: "passed",
          }),
        }),
      ]));
      const postValidationMemory = await resolveProjectMemory(project());
      expect((await listTaskRuns(postValidationMemory, topic.changeId))[0]).toMatchObject({ id: startedResult?.workerStart?.taskRunId, status: "evidence-ready" });
      expect((await listRuns(postValidationMemory)).filter((run) => run.changeId === topic.changeId)).toHaveLength(2);
      const postValidationSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
      expect(postValidationSnapshot.center.workpad.schedulerWorkerValidation).toMatchObject({
        id: validatedResult?.schedulerValidation?.id,
        status: "passed",
        schedulerWorkerResultId: reconciledResult?.result?.id,
      });
      expect(postValidationSnapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.worker.audit-first",
        label: "审计当前 worker 结果",
        schedulerRunId: schedulerRun?.id,
        schedulerClaimReservationId: claimReservation?.id,
        schedulerWorkerStartId: startedResult?.workerStart?.id,
        schedulerWorkerResultId: reconciledResult?.result?.id,
        schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
        enabled: true,
      });
      expect(postValidationSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.worker.validate-first")).toBe(false);
      const auditAction = postValidationSnapshot.right.confirmationQueue.current
        .flatMap((item) => item.actions)
        .find((action) => action.actionType === "planning.scheduler.worker.audit-first" && action.schedulerWorkerValidationId === validatedResult?.schedulerValidation?.id);
      if (!auditAction) throw new Error("Missing scheduler first worker audit action.");
      expect(auditAction).toMatchObject({
        schedulerRunId: schedulerRun?.id,
        schedulerClaimReservationId: claimReservation?.id,
        schedulerWorkerStartId: startedResult?.workerStart?.id,
        schedulerWorkerResultId: reconciledResult?.result?.id,
        schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
        taskRunId: startedResult?.workerStart?.taskRunId,
        workerLeaseId: startedResult?.workerStart?.workerLeaseId,
        worktreeId: startedResult?.workerStart?.worktreeId,
        runId: startedResult?.workerStart?.runId,
        validationRunId: validatedResult?.schedulerValidation?.validationRunId,
      });
      const repeatedValidation = await validateSchedulerFirstWorker(project(), {
        changeId: topic.changeId,
        schedulerRunId: `${schedulerRun?.id}`,
        schedulerWorkerResultId: `${reconciledResult?.result?.id}`,
      });
      expect(repeatedValidation).toMatchObject({
        existing: true,
        executionStarted: false,
        schedulerValidation: { id: validatedResult?.schedulerValidation?.id },
      });
      const audited = await executeWorkbenchAction({ project: project(), path: tempDir }, {
        ...auditAction,
        confirm: true,
      });
      const auditedActionResult = (audited.result as {
        result?: unknown;
      }).result ?? audited.result;
      const auditedResult = (auditedActionResult as {
        existing?: boolean;
        executionStarted?: boolean;
        schedulerAudit?: {
          id?: string;
          status?: string;
          schedulerWorkerValidationId?: string;
          schedulerWorkerResultId?: string;
          schedulerWorkerStartId?: string;
          taskRunId?: string;
          workerLeaseId?: string;
          worktreeId?: string;
          codeRunId?: string;
          validationRunId?: string;
          auditRunId?: string;
        };
        taskRun?: { id?: string; status?: string };
        auditRun?: { id?: string; runtime?: string; worktree?: { worktreeId?: string } };
        auditResult?: { id?: string; status?: string; worktreeId?: string; validationId?: string };
      });
      expect(auditedResult).toMatchObject({
        executionStarted: true,
        schedulerAudit: {
          status: "approved",
          schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
          schedulerWorkerResultId: reconciledResult?.result?.id,
          schedulerWorkerStartId: startedResult?.workerStart?.id,
          taskRunId: startedResult?.workerStart?.taskRunId,
          workerLeaseId: startedResult?.workerStart?.workerLeaseId,
          worktreeId: startedResult?.workerStart?.worktreeId,
          codeRunId: startedResult?.workerStart?.runId,
          validationRunId: validatedResult?.schedulerValidation?.validationRunId,
        },
        taskRun: { id: startedResult?.workerStart?.taskRunId, status: "completed" },
        auditRun: { runtime: "auditor" },
        auditResult: {
          status: "approved",
          worktreeId: startedResult?.workerStart?.worktreeId,
          validationId: validatedResult?.schedulerValidation?.validationRunId,
        },
      });
      const workerAuditPath = join(changeDir, "planning", "scheduler-runs", `${schedulerRun?.id}`, "scheduler-worker-audits", `${auditedResult.schedulerAudit?.id}.json`);
      expect(JSON.parse(await readFile(workerAuditPath, "utf8"))).toMatchObject({
        schedulerRunId: schedulerRun?.id,
        schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
        schedulerWorkerResultId: reconciledResult?.result?.id,
        status: "approved",
        worktreeId: startedResult?.workerStart?.worktreeId,
        codeRunId: startedResult?.workerStart?.runId,
        validationRunId: validatedResult?.schedulerValidation?.validationRunId,
        auditRunId: auditedResult.schedulerAudit?.auditRunId,
      });
      const auditRuntimeEvents = (await readFile(runtimeEventsPath, "utf8")).trim().split(/\r?\n/).map((line) => JSON.parse(line));
      expect(auditRuntimeEvents).toEqual(expect.arrayContaining([
        expect.objectContaining({
          schedulerRunId: schedulerRun?.id,
          changeId: topic.changeId,
          type: "scheduler-runtime.worker-audit-approved",
          payload: expect.objectContaining({
            schedulerWorkerStartId: startedResult?.workerStart?.id,
            schedulerWorkerResultId: reconciledResult?.result?.id,
            schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
            schedulerWorkerAuditId: auditedResult.schedulerAudit?.id,
            taskRunId: startedResult?.workerStart?.taskRunId,
            workerLeaseId: startedResult?.workerStart?.workerLeaseId,
            worktreeId: startedResult?.workerStart?.worktreeId,
            codeRunId: startedResult?.workerStart?.runId,
            validationRunId: validatedResult?.schedulerValidation?.validationRunId,
            auditRunId: auditedResult.schedulerAudit?.auditRunId,
            auditStatus: "approved",
          }),
        }),
      ]));
      const postAuditMemory = await resolveProjectMemory(project());
      expect((await listTaskRuns(postAuditMemory, topic.changeId))[0]).toMatchObject({ id: startedResult?.workerStart?.taskRunId, status: "completed" });
      expect((await listRuns(postAuditMemory)).filter((run) => run.changeId === topic.changeId)).toHaveLength(3);
      const postAuditSnapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: topic.changeId });
      expect(postAuditSnapshot.center.workpad.schedulerWorkerAudit).toMatchObject({
        id: auditedResult.schedulerAudit?.id,
        status: "approved",
        schedulerWorkerValidationId: validatedResult?.schedulerValidation?.id,
      });
      expect(postAuditSnapshot.center.workpad.nextAction).toMatchObject({
        actionType: "planning.scheduler.integration-candidate.compile",
        enabled: true,
        schedulerRunId: schedulerRun?.id,
        schedulerWorkerAuditId: auditedResult.schedulerAudit?.id,
      });
      expect(postAuditSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.worker.audit-first")).toBe(false);
      expect(postAuditSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => action.actionType === "planning.scheduler.integration-candidate.compile")).toBe(true);
      expect(postAuditSnapshot.right.confirmationQueue.current.flatMap((item) => item.actions).some((action) => {
        const actionType = action.actionType ?? "";
        return actionType === "apply-check.run" || actionType.startsWith("landing.") || actionType.startsWith("remote-landing.");
      })).toBe(false);
      const repeatedAudit = await auditSchedulerFirstWorker(project(), {
        changeId: topic.changeId,
        schedulerRunId: `${schedulerRun?.id}`,
        schedulerWorkerValidationId: `${validatedResult?.schedulerValidation?.id}`,
      });
      expect(repeatedAudit).toMatchObject({
        existing: true,
        executionStarted: false,
        schedulerAudit: { id: auditedResult.schedulerAudit?.id },
      });
      await expect(executeWorkbenchAction({ project: project(), path: tempDir }, {
        ...resultAction,
        confirm: true,
      })).rejects.toThrow("stale or no longer available");
    } finally {
      process.env.PATH = oldPath;
    }
  }, 90000);

  it("records supplemental input as pending feedback while a demand run is still running", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Running Demand" });
    await writeAcceptedSpecAndTasks("running-demand");
    await writeCoderRun("running-demand", "run-running-1", ["T-001"], "wt-running-1", "running");

    const result = await postTopicMessage(project(), "running-demand", "补充：金额需要四舍五入到分。");
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "running-demand" });

    expect(result).toMatchObject({ run: null, routingDecision: "same-topic", assistantMessage: "已记录，将在下一轮生效。" });
    expect(snapshot.center.workpad.pendingFeedback).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "补充：金额需要四舍五入到分。", runId: "run-running-1", status: "pending-next-turn" }),
    ]));
    expect(snapshot.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "user-message", body: "补充：金额需要四舍五入到分。", runId: "run-running-1" }),
      expect.objectContaining({ kind: "assistant-turn", body: "已记录，将在下一轮生效。", runId: "run-running-1" }),
    ]));
  });


  it("creates a linked follow-up demand instead of mutating an archived conversation", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Archived Demand" });
    await writeFile(join(tempDir, "harness", "changes", "active", "archived-demand", "reviews", "review.md"), "Status: approved\n", "utf8");
    await closeChange(tempDir);

    const result = await postTopicMessage(project(), "archived-demand", "继续修改实现并补测试。");
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "archived-demand" });

    expect(result.routingDecision).toBe("new-topic-required");
    expect(result.assistantMessage).toContain("linked follow-up");
    const followUpId = snapshot.center.thread.items.find((item) => item.kind === "assistant-turn" && item.body?.includes("linked follow-up"))?.artifact;
    expect(followUpId).toBeTruthy();
    expect(snapshot.center.workpad.conversationLifecycle).toBe("archived-readonly");
    expect(snapshot.center.thread.items).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "user-message", body: "继续修改实现并补测试。" }),
    ]));
  });

  it("persists AgentTaskRepository results and projects them into the role pipeline", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Agent Task Demand" });
    const memory = await resolveProjectMemory(project());

    const task = await createAgentTask(memory, {
      conversationId: "agent-task-demand",
      changeId: "agent-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      summary: "Implement the accepted demand.",
      inputArtifacts: ["harness/changes/active/agent-task-demand/spec.md"],
    });
    await completeAgentTask(memory, task, {
      status: "completed",
      summary: "Coder returned a worktree proposal.",
      artifactRefs: ["runs/run-agent-task/implementation.md"],
      nextRecommendation: "Run validation.",
    });

    const tasks = await listAgentTasks(memory, "agent-task-demand");
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: tempDir }, { topicId: "agent-task-demand" });

    expect(tasks).toHaveLength(1);
    expect(snapshot.center.workpad.rolePipeline?.agentTasks).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: task.id,
        roleId: "coder-agent",
        status: "completed",
        resultSummary: "Coder returned a worktree proposal.",
        evidenceRefs: ["runs/run-agent-task/implementation.md"],
      }),
    ]));
    expect(snapshot.center.parentAgentTranscript.cells).toHaveLength(0);
    expect(snapshot.center.agentRunGraph.nodes).toEqual([]);
    const graph = await getWorkbenchRunGraphProjection({ project: project(), path: tempDir }, "agent-task-demand");
    expect(graph.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "main-agent",
        kind: "main-agent",
        status: "idle",
      }),
      expect.objectContaining({
        kind: "coder-agent",
        roleId: "coder-agent",
        status: "completed",
        outputSummary: "Coder returned a worktree proposal.",
        evidenceRefs: expect.arrayContaining([
          expect.objectContaining({ ref: "runs/run-agent-task/implementation.md", kind: "artifact" }),
        ]),
      }),
    ]));
    const coderNode = graph.nodes.find((node) => node.kind === "coder-agent");
    expect(coderNode?.attempts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: task.id,
        status: "completed",
        summary: "Coder returned a worktree proposal.",
      }),
    ]));
    expect(graph.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({
        from: "main-agent",
        to: coderNode?.id,
        kind: "delegates",
      }),
      expect.objectContaining({
        from: coderNode?.id,
        to: "main-agent",
        kind: "returns",
      }),
    ]));
  });

  it("validates delegateTask policy and records queued to running AgentTask lifecycle", async () => {
    await initHarness(project());
    await createChange(project(), { title: "Delegate Task Demand" });
    const memory = await resolveProjectMemory(project());
    const manifest = buildDelegateTaskManifest();

    expect(manifest.allowedRoles.map((role) => role.roleId)).toEqual(expect.arrayContaining(["coder-agent", "validator", "auditor-agent", "rework-coder"]));
    const accepted = await validateDelegateTaskPolicy(memory, {
      conversationId: "delegate-task-demand",
      changeId: "delegate-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      goal: "Implement the confirmed demand in an AHO-owned worktree.",
      inputArtifacts: ["harness/changes/active/delegate-task-demand/spec.md"],
    });
    expect(accepted.ok).toBe(true);
    const forbidden = await validateDelegateTaskPolicy(memory, {
      conversationId: "delegate-task-demand",
      changeId: "delegate-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      goal: "Apply this result and merge the PR.",
      inputArtifacts: ["harness/changes/active/delegate-task-demand/spec.md"],
    });
    expect(forbidden.ok).toBe(false);
    expect(forbidden.readableMessage).toContain("用户确认");

    const dispatched = await dispatchForegroundRoleTask(memory, {
      conversationId: "delegate-task-demand",
      changeId: "delegate-task-demand",
      roleId: "coder-agent",
      kind: "foreground",
      goal: "Implement via delegated task.",
      inputArtifacts: ["harness/changes/active/delegate-task-demand/spec.md"],
      delegationMode: "orchestrator-policy",
    });
    expect(dispatched.task.status).toBe("running");
    expect(dispatched.task.startedAt).toBeTruthy();
    expect(dispatched.policyAuditRef).toContain("tool-events.jsonl");
    const tasks = await listAgentTasks(memory, "delegate-task-demand");
    expect(tasks).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: dispatched.task.id, roleId: "coder-agent", status: "running" }),
    ]));
  });

  it("enforces worker permission boundaries for delegation and high-impact actions", () => {
    expect(workerPermissionProfileForRole("main-agent").mayDelegate).toBe(true);
    expect(workerPermissionProfileForRole("coder-agent").mayDelegate).toBe(false);

    const workerDelegation = evaluateToolPolicy({
      actionType: "delegateTask",
      actorRoleId: "coder-agent",
      changeId: "boundary-demand",
      conversationId: "boundary-demand",
    });
    expect(workerDelegation.status).toBe("denied");
    expect(workerDelegation.readableMessage).toContain("不能继续委派");

    const roleMerge = evaluateToolPolicy({
      actionType: "remote-landing.merge",
      actorRoleId: "auditor-agent",
      changeId: "boundary-demand",
      conversationId: "boundary-demand",
    });
    expect(roleMerge.status).toBe("denied");

    const mainApply = evaluateToolPolicy({
      actionType: "remote-landing.merge",
      actorRoleId: "main-agent",
      changeId: "boundary-demand",
      conversationId: "boundary-demand",
    });
    expect(mainApply.status).toBe("needs-user-confirmation");
  });

  it("detects post-run boundary violations for source writes and read-only role writes", () => {
    const coderViolations = findBoundaryViolations(workerPermissionProfileForRole("coder-agent"), {
      sourceChanged: true,
      changedPaths: ["src/pricing.ts", ".env"],
      artifactRefs: ["runs/run-1/implementation.md"],
    });
    expect(coderViolations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "source-root-modified" }),
      expect.objectContaining({ kind: "denied-path", path: ".env" }),
    ]));

    const validatorViolations = findBoundaryViolations(workerPermissionProfileForRole("validator"), {
      changedPaths: ["src/pricing.ts"],
      artifactRefs: ["validation/run-1/validation.json"],
    });
    expect(validatorViolations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "readonly-role-write", path: "src/pricing.ts" }),
    ]));

    const scopedViolations = findBoundaryViolations(workerPermissionProfileForRole("auditor-agent"), {
      artifactRefs: ["C:/outside/audit.json", "../other-change/audit.json"],
    });
    expect(scopedViolations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "cross-demand-artifact" }),
    ]));
  });

});


async function writeAcceptedSpecAndTasks(changeId: string): Promise<void> {
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


async function initGitRepository(cwd: string): Promise<void> {
  await git(cwd, ["init"]);
  await git(cwd, ["config", "user.email", "test@example.com"]);
  await git(cwd, ["config", "user.name", "Test User"]);
}

async function git(cwd: string, args: string[]): Promise<void> {
  await execFileAsync("git", args, { cwd });
}

async function writeSpecProposalRun(changeId: string): Promise<RunMetadata> {
  const runId = `run-test-${changeId}`;
  const runDir = join(tempDir, ".agent-harness", "runs", runId);
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: tempDir,
    runtime: "spec-agent",
    executionMode: "direct",
    proposalOnly: true,
    command: ["codex", "exec"],
    status: "completed",
    exitCode: 0,
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
      specProposal: `.agent-harness/runs/${runId}/spec-proposal.json`,
      specProposalMarkdown: `.agent-harness/runs/${runId}/spec-proposal.md`,
      lastMessage: `.agent-harness/runs/${runId}/last-message.md`,
    },
  };
  await writeFile(join(runDir, "run.json"), JSON.stringify(run, null, 2), "utf8");
  await writeFile(join(runDir, "events.jsonl"), `${JSON.stringify({ timestamp: now, type: "change.spec.proposal.completed", runId })}\n`, "utf8");
  await writeFile(join(runDir, "spec-proposal.md"), "# Spec Proposal\n", "utf8");
  await writeFile(join(runDir, "last-message.md"), "Status: proposed\n", "utf8");
  await writeFile(join(runDir, "spec-proposal.json"), JSON.stringify({
    version: "1.0",
    id: runId,
    runId,
    changeId,
    status: "proposed",
    startedAt: now,
    finishedAt: now,
    targetHashes: {},
    specMd: "# Spec\n\n## Acceptance Criteria\n\n- AC-001: Example\n",
    openQuestions: [],
    assumptions: [],
    warnings: [],
    artifacts: {
      proposal: `.agent-harness/runs/${runId}/spec-proposal.json`,
      proposalMarkdown: `.agent-harness/runs/${runId}/spec-proposal.md`,
      lastMessage: `.agent-harness/runs/${runId}/last-message.md`,
    },
  }, null, 2), "utf8");
  expect(existsSync(join(runDir, "spec-proposal.json"))).toBe(true);
  expect(await readFile(join(runDir, "events.jsonl"), "utf8")).toContain("change.spec.proposal.completed");
  return run;
}

