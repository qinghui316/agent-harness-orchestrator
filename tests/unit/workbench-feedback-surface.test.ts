import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { createChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { resolveFeedbackRouteFromPrimary } from "../../src/server/workbench/feedback-routing.js";
import { classifyPrFeedbackSnapshotData } from "../../src/pr-feedback/manager.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import type { WorkbenchActionRequest } from "../../src/server/workbench/types.js";
import type { RunMetadata } from "../../src/types/index.js";
import { getWorkbenchSnapshot, getWorkbenchTopic } from "../../src/workbench/manager.js";
import { getTempDir, project } from "./workbench/fixtures.js";

describe("workbench feedback surface", () => {
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
    const before = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "feedback-proposal" });
    const action = before.right.approvals.find((item) => item.id === `spec:${run.id}`)?.action;
    expect(action).toBeTruthy();
    if (!action) throw new Error("Expected spec proposal action");

    await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
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

    const after = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "feedback-proposal" });

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
    const detail = await getWorkbenchTopic({ project: project(), path: getTempDir() }, "feedback-proposal");
    expect(detail.threadItems).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "decision", status: "requested-changes", body: "User requested changes instead of accepting this decision." }),
    ]));
  });

  it("routes result apply feedback to bounded rework without applying source", () => {
    const route = resolveFeedbackRouteFromPrimary({
      id: "result:change-1:wt-1:ready",
      kind: "single-result-apply",
      changeId: "change-1",
      resultId: "wt-1",
      worktreeId: "wt-1",
      runId: "run-1",
      evidenceRefs: ["artifact/result-review.json"],
      actions: [
        { id: "apply:change-1:wt-1", kind: "approval", changeId: "change-1", worktreeId: "wt-1", enabled: true },
        { id: "feedback:wt-1", label: "要求修改", kind: "feedback", changeId: "change-1", worktreeId: "wt-1", enabled: true },
      ],
    }, feedbackRequest({
      feedback: "保留现有 API，改成向后兼容实现。",
      changeId: "change-1",
      actionId: "feedback:wt-1",
      worktreeId: "wt-1",
      runId: "run-1",
    }));

    expect(route.decisionType).toBe("result.feedback");
    expect(route.targetId).toBe("wt-1");
    expect(route.artifact).toBe("artifact/result-review.json");
    expect(route.workflowRequest).toEqual(expect.objectContaining({
      actionType: "result.refresh-rework",
      changeId: "change-1",
      worktreeId: "wt-1",
      feedback: "保留现有 API，改成向后兼容实现。",
    }));
    expect(route.workflowRequest?.prompt).toContain("保留现有 API，改成向后兼容实现。");
  });

  it("fails closed for stale or cross-change feedback targets", () => {
    const primary = {
      id: "result:change-1:wt-1:ready",
      kind: "single-result-apply",
      changeId: "change-1",
      resultId: "wt-1",
      worktreeId: "wt-1",
      runId: "run-1",
      actions: [
        { id: "feedback:wt-1", label: "要求修改", kind: "feedback", changeId: "change-1", worktreeId: "wt-1", enabled: true },
      ],
    };

    expect(() => resolveFeedbackRouteFromPrimary(primary, feedbackRequest({
      feedback: "换一个方向。",
      changeId: "other-change",
      actionId: "feedback:wt-1",
      worktreeId: "wt-1",
    }))).toThrow("Feedback target is stale or no longer available.");

    expect(() => resolveFeedbackRouteFromPrimary(primary, feedbackRequest({
      feedback: "换一个方向。",
      changeId: "change-1",
      actionId: "missing-feedback-action",
      worktreeId: "wt-1",
    }))).toThrow("Feedback target is stale or no longer available.");
  });
});

function feedbackRequest(input: { feedback: string; changeId: string; actionId: string; worktreeId?: string; runId?: string }): WorkbenchActionRequest {
  return {
    feedback: input.feedback,
    feedbackContext: {
      contextId: "context-1",
      actionId: input.actionId,
      actionKind: "feedback",
      changeId: input.changeId,
      worktreeId: input.worktreeId,
      runId: input.runId,
    },
  };
}

async function writeSpecProposalRun(changeId: string): Promise<RunMetadata> {
  const runId = `run-test-${changeId}`;
  const runDir = join(getTempDir(), ".agent-harness", "runs", runId);
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  const run: RunMetadata = {
    version: "1.0",
    id: runId,
    changeId,
    projectPath: getTempDir(),
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
