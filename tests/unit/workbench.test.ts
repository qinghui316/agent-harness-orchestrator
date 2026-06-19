import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { createChange, closeChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { createWorkbenchTopic, postTopicMessage } from "../../src/workbench/chat.js";
import { getWorkbenchRunGraphProjection, getWorkbenchSnapshot, listWorkbenchTopics } from "../../src/workbench/manager.js";
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
import { classifyPrFeedbackSnapshotData } from "../../src/pr-feedback/manager.js";
import type { ManagedProject, RunMetadata } from "../../src/types/index.js";
import {
  getTempDir,
  writeCoderRun,
  writeTaskQueueItemRecord,
  writeTaskQueueRecord,
  writeTaskRunRecord,
} from "./workbench/fixtures.js";

let tempDir: string;
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

describe("workbench read model", () => {
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

