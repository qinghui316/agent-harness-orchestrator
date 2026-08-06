import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveFeedbackRouteFromPrimary } from "../../src/server/workbench/feedback-routing.js";
import { classifyPrFeedbackSnapshotData, refreshPrFeedback, startPrFeedbackReworkAttempt } from "../../src/pr-feedback/manager.js";
import type { WorkbenchActionRequest } from "../../src/server/workbench/types.js";
import type { LandingReadinessPackage, PrDraftPackage } from "../../src/types/index.js";
import { project, resolveFixtureRuntime } from "./workbench/fixtures.js";

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

  it("does not use latest Draft PR fallback for PR feedback lineage", async () => {
    await resolveFixtureRuntime();
    await writeLandingPackage("landing-a", ["change-a"]);
    await writeLandingPackage("landing-b", ["change-a"]);
    await writeDraftPackage("draft-b", "landing-b", "https://github.com/example/repo/pull/1");

    const feedback = await refreshPrFeedback(project(), "landing-a", { expectedChangeId: "change-a" });
    expect(feedback.summary.classification).toBe("provider-unavailable");
    expect(feedback.snapshot.prDraftPackageId).toBe("unavailable");

    await expect(startPrFeedbackReworkAttempt(project(), "landing-a", undefined, { expectedChangeId: "change-a" }))
      .rejects.toThrow("exact Draft PR package");
  });

  it("fails closed for multi-change and cross-change PR feedback targets", async () => {
    await resolveFixtureRuntime();
    await writeLandingPackage("landing-multi", ["change-a", "change-b"]);
    await writeLandingPackage("landing-cross", ["change-a"]);

    await expect(refreshPrFeedback(project(), "landing-multi", { expectedChangeId: "change-a" }))
      .rejects.toThrow("exactly one changeId");
    await expect(refreshPrFeedback(project(), "landing-cross", { expectedChangeId: "other-change" }))
      .rejects.toThrow("does not match");
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

async function writeLandingPackage(id: string, changeIds: string[]): Promise<void> {
  const now = new Date().toISOString();
  const runtime = await resolveFixtureRuntime();
  const directory = join(runtime.workbenchRoot, "landing", id);
  await mkdir(directory, { recursive: true });
  const pkg: LandingReadinessPackage = {
    version: "1.0",
    id,
    projectId: null,
    target: {
      kind: "worktree",
      changeIds,
      worktreeIds: ["wt-test"],
      expectedDiffHash: "hash-test",
      evidenceRefs: ["runtime-sidecar://workbench/evidence.json"],
    },
    status: "ready",
    sourceHead: "HEAD",
    sourceDiffHash: "hash-test",
    sourceDiffStat: "1 file changed",
    changedFiles: ["src/example.ts"],
    attributable: true,
    unattributedFiles: [],
    summary: "Landing ready.",
    riskSummary: "Low risk.",
    artifactRefs: [`runtime-sidecar://workbench/landing/${id}/landing-package.json`],
    createdAt: now,
  };
  await writeFile(join(directory, "landing-package.json"), JSON.stringify(pkg, null, 2), "utf8");
}

async function writeDraftPackage(id: string, landingPackageId: string, prUrl: string): Promise<void> {
  const now = new Date().toISOString();
  const runtime = await resolveFixtureRuntime();
  const directory = join(runtime.workbenchRoot, "pr-drafts", id);
  await mkdir(directory, { recursive: true });
  const pkg: PrDraftPackage = {
    version: "1.0",
    id,
    landingPackageId,
    projectId: null,
    provider: "github-cli",
    status: "created",
    title: "Draft PR",
    bodyArtifact: `runtime-sidecar://workbench/pr-drafts/${id}/pr-body.md`,
    packageArtifact: `runtime-sidecar://workbench/pr-drafts/${id}/pr-draft-package.json`,
    branchName: `draft/${id}`,
    prUrl,
    landingEvidenceRefs: [`runtime-sidecar://workbench/landing/${landingPackageId}/landing-package.json`],
    createdAt: now,
    updatedAt: now,
  };
  await writeFile(join(directory, "pr-draft-package.json"), JSON.stringify(pkg, null, 2), "utf8");
}
