import { mkdir, readFile, writeFile } from "node:fs/promises";
import { delimiter, join } from "node:path";
import { describe, expect, it } from "vitest";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";
import {
  authorizeSkillNativeWorkflowStartFixture,
  prepareSkillNativeWorkbenchFixture,
  writeSkillNativeAcceptedSpecAndTasks,
} from "../helpers/skill-native-workbench-fixture.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { collectWorktreeDiff } from "../../src/audit/diff.js";
import { getCodexProviderCapabilitySnapshot } from "../../src/provider-runtime/codex.js";
import { listRuns } from "../../src/run/repository.js";
import { readWorktreeMetadata } from "../../src/worktree/repository.js";
import { cleanupRemoteBranchAfterMerge, preparePostMergeHandoff, syncLocalAfterMerge } from "../../src/post-merge/manager.js";
import { mergeNextLandingQueueCandidate, prepareLandingQueue } from "../../src/landing-queue/manager.js";
import { getWorkbenchSnapshot } from "../../src/workbench/projections/read-model/implementation.js";
import { bindProviderAttemptThread, startProviderAttempt } from "../../src/workbench/provider-attempts.js";
import {
  createFakeCodex,
  createFakeGh,
  execFileAsync,
  getTempDir,
  git,
  initGitRepository,
  project,
  ensureProjectHarnessFixture,
  resolveFixtureRuntime,
  unwrapWorkflowActionResult,
} from "../unit/workbench/fixtures.js";

describe("workbench remote landing slow flow", () => {
  it("prepares a local landing package after apply without committing, pushing, or creating PR controls", async () => {
      const oldAhoHome = process.env.AHO_HOME;
      process.env.AHO_HOME = join(getTempDir(), ".aho-home");
      try {
        await initGitRepository(getTempDir());
        await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agents/\n.claude/\nfake-codex-bin/\n", "utf8");
        await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
        await git(getTempDir(), ["add", "."]);
        await git(getTempDir(), ["commit", "-m", "initial"]);
        const { worktree } = await prepareRemoteLandingApplyCandidate({
          title: "Landing Demand",
          changedContent: "{\"scripts\":{\"test\":\"node -e \\\"console.log('landing')\\\"\"}}\n",
          additionalChanges: [{ path: "acceptance-note.txt", content: "real acceptance\n" }],
        });

        const applyAction = await applyActionAfterAuditAcceptance("landing-demand");
        await executeWorkbenchAction({ project: project(), path: getTempDir() }, { action: applyAction, confirm: true });
        const statusBeforeLanding = (await execFileAsync("git", ["status", "--short"], { cwd: getTempDir() })).stdout;

        const afterApply = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "landing-demand" });
        if (!afterApply.right.confirmationQueue.primary) {
          throw new Error(`Missing landing readiness after apply: ${JSON.stringify({
            warnings: afterApply.warnings,
            workpad: afterApply.center.workpad,
            queue: afterApply.right.confirmationQueue,
            inspector: afterApply.right.decisionInspector,
          })}`);
        }
        expect(afterApply.right.confirmationQueue.primary).toMatchObject({
          kind: "landing-readiness",
          whyNeedsConfirmation: "本地结果已应用，可以做提交/PR 前检查。",
        });
        expect(afterApply.right.confirmationQueue.primary?.actions[0]).toMatchObject({
          actionType: "landing.prepare",
          worktreeId: worktree.metadata.worktreeId,
        });

        const prepared = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          ...await landingPrepareActionAfterApply("landing-demand"),
          confirm: true,
        });
        const pkg = (prepared.result as { result: { package: { status: string; review?: { roleId: string; verdict: string }; artifactRefs: string[] } } }).result.package;
        expect(pkg).toMatchObject({
          status: "ready",
          review: expect.objectContaining({ roleId: "merge-reviewer-agent", verdict: "ready" }),
        });
        expect(pkg.artifactRefs).toEqual(expect.arrayContaining([
          expect.stringContaining("landing-package.json"),
          expect.stringContaining("landing-summary.md"),
          expect.stringContaining("source-diff.patch"),
          expect.stringContaining("merge-review.md"),
        ]));
        const statusAfterLanding = (await execFileAsync("git", ["status", "--short"], { cwd: getTempDir() })).stdout;
        expect(statusAfterLanding).toBe(statusBeforeLanding);

        const reviewedSnapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "landing-demand" });
        expect(reviewedSnapshot.right.confirmationQueue.primary).toMatchObject({
          kind: "request-changes",
          whyNeedsConfirmation: "当前流程不使用 PR/remote；需要先满足本地完成门禁。",
        });
        expect(reviewedSnapshot.right.confirmationQueue.primary?.actions.some((action) => action.actionType?.startsWith("pr-draft."))).toBe(false);
        const prPrepared = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          actionType: "pr-draft.prepare",
          changeId: "landing-demand",
          landingPackageId: pkg.id,
          confirm: true,
        });
        const prPkg = (prPrepared.result as { result: { package: { landingPackageId: string; bodyArtifact: string; status: string } } }).result.package;
        expect(prPkg).toMatchObject({
          landingPackageId: pkg.id,
          status: "prepared",
        });
        expect(prPkg.bodyArtifact).toContain("pr-body.md");
        await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          actionType: "pr-draft.create",
          changeId: "landing-demand",
          landingPackageId: pkg.id,
          confirm: true,
        })).rejects.toThrow("Workflow action target is stale or no longer available.");
      } finally {
        if (oldAhoHome === undefined) delete process.env.AHO_HOME;
        else process.env.AHO_HOME = oldAhoHome;
      }
    }, 180_000);

  it("prepares landing evidence from a committed worktree apply", async () => {
      const oldAhoHome = process.env.AHO_HOME;
      process.env.AHO_HOME = join(getTempDir(), ".aho-home");
      try {
        await initGitRepository(getTempDir());
        await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agents/\n.claude/\nfake-codex-bin/\n", "utf8");
        await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
        await git(getTempDir(), ["add", "."]);
        await git(getTempDir(), ["commit", "-m", "initial"]);
        const { diff, providerBinDir } = await prepareRemoteLandingApplyCandidate({
          title: "Committed Landing Demand",
          changedContent: "{\"scripts\":{\"test\":\"node -e \\\"console.log('committed landing')\\\"\"}}\n",
          additionalChanges: [{ path: "committed-acceptance-note.txt", content: "real acceptance\n" }],
        });

        const applyAction = await applyActionAfterAuditAcceptance("committed-landing-demand");
        await withProviderBin(providerBinDir, () => executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          action: applyAction,
          confirm: true,
          options: { commit: true, message: "Apply AHO result: committed-landing-demand" },
        }));
        const statusBeforeLanding = (await execFileAsync("git", ["status", "--short"], { cwd: getTempDir() })).stdout;
        expect(statusBeforeLanding).toBe("");
        const latestCommit = (await execFileAsync("git", ["log", "-1", "--pretty=%s"], { cwd: getTempDir() })).stdout.trim();
        expect(latestCommit).toBe("Apply AHO result: committed-landing-demand");

        const prepared = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          ...await landingPrepareActionAfterApply("committed-landing-demand"),
          confirm: true,
        });
        const pkg = (prepared.result as { result: { package: { status: string; review?: { roleId: string; verdict: string }; sourceDiffHash: string; changedFiles: string[] } } }).result.package;
        expect(pkg).toMatchObject({
          status: "ready",
          sourceDiffHash: diff.diffHash,
          review: expect.objectContaining({ roleId: "merge-reviewer-agent", verdict: "ready" }),
        });
        expect(pkg.changedFiles).toEqual(expect.arrayContaining(["package.json", "committed-acceptance-note.txt"]));
        const statusAfterLanding = (await execFileAsync("git", ["status", "--short"], { cwd: getTempDir() })).stdout;
        expect(statusAfterLanding).toBe("");
      } finally {
        if (oldAhoHome === undefined) delete process.env.AHO_HOME;
        else process.env.AHO_HOME = oldAhoHome;
      }
    }, 180_000);

  it("prepares and submits a Draft PR for human review without merging or archiving", async () => {
      const oldAhoHome = process.env.AHO_HOME;
      const oldGhCommand = process.env.AHO_GH_COMMAND;
      const oldGhCommandArgs = process.env.AHO_GH_COMMAND_ARGS;
      process.env.AHO_HOME = join(getTempDir(), ".aho-home");
      const fakeGh = await createFakeGh();
      process.env.AHO_GH_COMMAND = fakeGh.command;
      process.env.AHO_GH_COMMAND_ARGS = JSON.stringify(fakeGh.args);
      try {
        await initGitRepository(getTempDir());
        await git(getTempDir(), ["remote", "add", "origin", "https://github.com/qinghui316/private-acceptance.git"]);
        await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agents/\n.claude/\nfake-codex-bin/\n", "utf8");
        await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
        await git(getTempDir(), ["add", "."]);
        await git(getTempDir(), ["commit", "-m", "initial"]);
        const { memory } = await prepareRemoteLandingApplyCandidate({
          title: "PR Review Demand",
          changedContent: "{\"scripts\":{\"test\":\"node -e \\\"console.log('review')\\\"\"}}\n",
        });

        const applyAction = await applyActionAfterAuditAcceptance("pr-review-demand");
        await executeWorkbenchAction({ project: project(), path: getTempDir() }, { action: applyAction, confirm: true });
        const landingPrepared = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          ...await landingPrepareActionAfterApply("pr-review-demand"),
          confirm: true,
        });
        const landingPackage = (landingPrepared.result as { result: { package: { id: string } } }).result.package;
        const prPrepared = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          actionType: "pr-draft.prepare",
          changeId: "pr-review-demand",
          landingPackageId: landingPackage.id,
          confirm: true,
        });
        const prPackage = (prPrepared.result as { result: { package: { id: string; packageArtifact: string } } }).result.package;
        const prPackagePath = join(memory.workbenchRoot, "pr-drafts", prPackage.id, "pr-draft-package.json");
        const createdPackage = {
          ...JSON.parse(await readFile(prPackagePath, "utf8")),
          status: "created",
          prUrl: "https://github.com/qinghui316/private-acceptance/pull/1",
        };
        await writeFile(prPackagePath, JSON.stringify(createdPackage, null, 2), "utf8");

        const preparedReview = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          actionType: "pr-review.prepare",
          changeId: "pr-review-demand",
          landingPackageId: landingPackage.id,
          confirm: true,
        });
        expect(preparedReview.result).toMatchObject({
          result: {
            readiness: expect.objectContaining({
              status: "ready",
              canSubmit: true,
              prUrl: "https://github.com/qinghui316/private-acceptance/pull/1",
            }),
          },
        });

        const readySnapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "pr-review-demand" });
        expect(readySnapshot.right.confirmationQueue.primary).toMatchObject({
          kind: "pr-review",
          summary: "Draft PR 已准备好提交人工评审。",
        });
        expect(readySnapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
          expect.objectContaining({ actionType: "pr-review.submit", label: "提交人工评审" }),
        ]));

        const submitted = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          actionType: "pr-review.submit",
          changeId: "pr-review-demand",
          landingPackageId: landingPackage.id,
          confirm: true,
        });
        expect(submitted.result).toMatchObject({
          result: {
            readiness: expect.objectContaining({ status: "already-ready", canSubmit: false }),
            handoff: expect.objectContaining({ status: "submitted" }),
          },
        });
        const state = JSON.parse(await readFile(fakeGh.stateFile, "utf8"));
        expect(state.isDraft).toBe(false);
        const afterSubmit = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "pr-review-demand" });
        expect(afterSubmit.center.selectedTopic?.state).toBe("active");
        expect(afterSubmit.right.confirmationQueue.primary?.actions.some((action) => action.actionType === "pr-review.submit")).toBe(false);
        expect(afterSubmit.right.confirmationQueue.primary?.actions.some((action) => action.actionType === "pr-review.feedback-refresh")).toBe(true);
      } finally {
        if (oldAhoHome === undefined) delete process.env.AHO_HOME;
        else process.env.AHO_HOME = oldAhoHome;
        if (oldGhCommand === undefined) delete process.env.AHO_GH_COMMAND;
        else process.env.AHO_GH_COMMAND = oldGhCommand;
        if (oldGhCommandArgs === undefined) delete process.env.AHO_GH_COMMAND_ARGS;
        else process.env.AHO_GH_COMMAND_ARGS = oldGhCommandArgs;
      }
    }, 180_000);

  it("prepares and performs a user-confirmed remote PR merge with merged closeout", async () => {
      const oldAhoHome = process.env.AHO_HOME;
      const oldGhCommand = process.env.AHO_GH_COMMAND;
      const oldGhCommandArgs = process.env.AHO_GH_COMMAND_ARGS;
      process.env.AHO_HOME = join(getTempDir(), ".aho-home");
      const fakeGh = await createFakeGh({ isDraft: false });
      process.env.AHO_GH_COMMAND = fakeGh.command;
      process.env.AHO_GH_COMMAND_ARGS = JSON.stringify(fakeGh.args);
      try {
        await initGitRepository(getTempDir());
        await git(getTempDir(), ["remote", "add", "origin", "https://github.com/qinghui316/private-acceptance.git"]);
        await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agents/\n.claude/\nfake-codex-bin/\n", "utf8");
        await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
        await git(getTempDir(), ["add", "."]);
        await git(getTempDir(), ["commit", "-m", "initial"]);
        const { memory } = await prepareRemoteLandingApplyCandidate({
          title: "Remote Landing Demand",
          changedContent: "{\"scripts\":{\"test\":\"node -e \\\"console.log('landing')\\\"\"}}\n",
        });

        const applyAction = await applyActionAfterAuditAcceptance("remote-landing-demand");
        await executeWorkbenchAction({ project: project(), path: getTempDir() }, { action: applyAction, confirm: true });
        const landingPrepared = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          ...await landingPrepareActionAfterApply("remote-landing-demand"),
          confirm: true,
        });
        const landingPackage = (landingPrepared.result as { result: { package: { id: string } } }).result.package;
        const prPrepared = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          actionType: "pr-draft.prepare",
          changeId: "remote-landing-demand",
          landingPackageId: landingPackage.id,
          confirm: true,
        });
        const prPackage = (prPrepared.result as { result: { package: { id: string } } }).result.package;
        const prPackagePath = join(memory.workbenchRoot, "pr-drafts", prPackage.id, "pr-draft-package.json");
        await writeFile(prPackagePath, JSON.stringify({
          ...JSON.parse(await readFile(prPackagePath, "utf8")),
          status: "created",
          prUrl: "https://github.com/qinghui316/private-acceptance/pull/1",
        }, null, 2), "utf8");

        const readiness = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          actionType: "remote-landing.prepare",
          changeId: "remote-landing-demand",
          landingPackageId: landingPackage.id,
          confirm: true,
        });
        expect(readiness.result).toMatchObject({
          result: {
            readiness: expect.objectContaining({
              status: "ready",
              canMerge: true,
              prUrl: "https://github.com/qinghui316/private-acceptance/pull/1",
            }),
          },
        });
        const readySnapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "remote-landing-demand" });
        expect(readySnapshot.right.confirmationQueue.primary).toMatchObject({
          kind: "remote-landing",
          summary: "PR 已满足远端合并条件。",
        });
        expect(readySnapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
          expect.objectContaining({ actionType: "remote-landing.merge", label: "合并 PR" }),
        ]));

        const merged = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          actionType: "remote-landing.merge",
          changeId: "remote-landing-demand",
          landingPackageId: landingPackage.id,
          confirm: true,
        });
        expect(merged.result).toMatchObject({
          result: {
            result: expect.objectContaining({
              status: "merged",
              mergeMethod: "squash",
            }),
          },
        });
        const ghState = JSON.parse(await readFile(fakeGh.stateFile, "utf8"));
        expect(ghState.merged).toBe(true);
        const mergedResult = (merged.result as { result: { result: { id: string } } }).result.result;
        const postMergeSnapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "remote-landing-demand" });
        expect(postMergeSnapshot.right.confirmationQueue.primary).toMatchObject({
          kind: "post-merge",
          summary: "PR 已远端合并，可以检查本地项目和远端分支收尾状态。",
        });
        const postMerge = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          actionType: "post-merge.prepare",
          changeId: "remote-landing-demand",
          landingPackageId: landingPackage.id,
          remoteLandingResultId: mergedResult.id,
          confirm: true,
        });
        expect(postMerge.result).toMatchObject({
          result: {
            handoff: expect.objectContaining({
              status: "merged",
              localSyncReadiness: expect.objectContaining({
                canSync: false,
              }),
            }),
          },
        });
      } finally {
        if (oldAhoHome === undefined) delete process.env.AHO_HOME;
        else process.env.AHO_HOME = oldAhoHome;
        if (oldGhCommand === undefined) delete process.env.AHO_GH_COMMAND;
        else process.env.AHO_GH_COMMAND = oldGhCommand;
        if (oldGhCommandArgs === undefined) delete process.env.AHO_GH_COMMAND_ARGS;
        else process.env.AHO_GH_COMMAND_ARGS = oldGhCommandArgs;
      }
    }, 180_000);

  it("builds a landing queue from explicit PR targets and merges only one refreshed PR", async () => {
      const oldAhoHome = process.env.AHO_HOME;
      const oldGhCommand = process.env.AHO_GH_COMMAND;
      const oldGhCommandArgs = process.env.AHO_GH_COMMAND_ARGS;
      process.env.AHO_HOME = join(getTempDir(), ".aho-home");
      const fakeGh = await createFakeGh({ isDraft: false });
      process.env.AHO_GH_COMMAND = fakeGh.command;
      process.env.AHO_GH_COMMAND_ARGS = JSON.stringify(fakeGh.args);
      try {
        await initGitRepository(getTempDir());
        await git(getTempDir(), ["remote", "add", "origin", "https://github.com/qinghui316/private-acceptance.git"]);
        await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
        await git(getTempDir(), ["add", "."]);
        await git(getTempDir(), ["commit", "-m", "initial"]);
        await ensureProjectHarnessFixture();
        const memory = await resolveFixtureRuntime();
        await mkdir(join(memory.workbenchRoot, "landing", "landing-a"), { recursive: true });
        await mkdir(join(memory.workbenchRoot, "landing", "landing-b"), { recursive: true });
        const landingBase = {
          version: "1.0",
          projectId: memory.projectId,
          status: "ready",
          sourceHead: "head",
          sourceDiffHash: "diff",
          sourceDiffStat: " package.json | 1 +",
          changedFiles: ["package.json"],
          attributable: true,
          unattributedFiles: [],
          summary: "Landing package ready.",
          riskSummary: "Reviewed local landing evidence.",
          artifactRefs: ["runtime-sidecar://workbench/landing/landing-summary.md"],
          createdAt: "2026-05-30T00:00:00.000Z",
          reviewedAt: "2026-05-30T00:00:00.000Z",
          review: {
            version: "1.0",
            roleId: "merge-reviewer-agent",
            verdict: "ready",
            summary: "Ready.",
            riskSummary: "No blocker.",
            evidenceRefs: [],
            missingChecks: [],
            suggestedNextAction: "Remote landing.",
            createdAt: "2026-05-30T00:00:00.000Z",
          },
        };
        await writeFile(join(memory.workbenchRoot, "landing", "landing-a", "landing-package.json"), JSON.stringify({
          ...landingBase,
          id: "landing-a",
          target: { kind: "worktree", changeIds: ["demand-a"], worktreeIds: ["worktree-a"], applyRunId: "apply-a", expectedDiffHash: "diff", evidenceRefs: [] },
          review: { ...landingBase.review, packageId: "landing-a" },
        }, null, 2), "utf8");
        await writeFile(join(memory.workbenchRoot, "landing", "landing-b", "landing-package.json"), JSON.stringify({
          ...landingBase,
          id: "landing-b",
          target: { kind: "worktree", changeIds: ["demand-b"], worktreeIds: ["worktree-b"], applyRunId: "apply-b", expectedDiffHash: "diff", evidenceRefs: [] },
          createdAt: "2026-05-30T00:01:00.000Z",
          reviewedAt: "2026-05-30T00:01:00.000Z",
          review: { ...landingBase.review, packageId: "landing-b", createdAt: "2026-05-30T00:01:00.000Z" },
        }, null, 2), "utf8");
        await mkdir(join(memory.workbenchRoot, "pr-drafts", "pr-draft-a"), { recursive: true });
        await mkdir(join(memory.workbenchRoot, "pr-drafts", "pr-draft-b"), { recursive: true });
        const draftBase = {
          version: "1.0",
          projectId: memory.projectId,
          provider: "github-cli",
          status: "created",
          title: "AHO test",
          bodyArtifact: "runtime-sidecar://workbench/pr-drafts/body.md",
          packageArtifact: "runtime-sidecar://workbench/pr-drafts/package.json",
          remoteName: "origin",
          remoteUrl: "https://github.com/qinghui316/private-acceptance.git",
          baseBranch: "main",
          branchName: "aho/test",
          landingEvidenceRefs: [],
          createdAt: "2026-05-30T00:00:00.000Z",
          updatedAt: "2026-05-30T00:00:00.000Z",
        };
        await writeFile(join(memory.workbenchRoot, "pr-drafts", "pr-draft-a", "pr-draft-package.json"), JSON.stringify({
          ...draftBase,
          id: "pr-draft-a",
          landingPackageId: "landing-a",
          prUrl: "https://github.com/qinghui316/private-acceptance/pull/1",
        }, null, 2), "utf8");
        await writeFile(join(memory.workbenchRoot, "pr-drafts", "pr-draft-b", "pr-draft-package.json"), JSON.stringify({
          ...draftBase,
          id: "pr-draft-b",
          landingPackageId: "landing-b",
          prUrl: "https://github.com/qinghui316/private-acceptance/pull/2",
          branchName: "aho/test-b",
          updatedAt: "2026-05-30T00:01:00.000Z",
        }, null, 2), "utf8");

        const queue = await prepareLandingQueue(project());
        expect(queue.readyCount).toBe(2);
        expect(queue.candidates.map((candidate) => candidate.landingPackageId)).toEqual(["landing-a", "landing-b"]);
        expect(queue.candidates.every((candidate) => candidate.canMerge)).toBe(true);

        const merged = await mergeNextLandingQueueCandidate(project(), "landing-a");
        expect(merged.result).toMatchObject({
          status: "merged",
          landingPackageId: "landing-a",
        });
        expect(merged.after).toBeTruthy();
        const ghState = JSON.parse(await readFile(fakeGh.stateFile, "utf8"));
        expect(ghState.mergeCount).toBe(1);
      } finally {
        if (oldAhoHome === undefined) delete process.env.AHO_HOME;
        else process.env.AHO_HOME = oldAhoHome;
        if (oldGhCommand === undefined) delete process.env.AHO_GH_COMMAND;
        else process.env.AHO_GH_COMMAND = oldGhCommand;
        if (oldGhCommandArgs === undefined) delete process.env.AHO_GH_COMMAND_ARGS;
        else process.env.AHO_GH_COMMAND_ARGS = oldGhCommandArgs;
      }
    });

  it("allows post-merge fast-forward sync and remote branch cleanup only from explicit merged evidence", async () => {
      const oldAhoHome = process.env.AHO_HOME;
      const oldGhCommand = process.env.AHO_GH_COMMAND;
      const oldGhCommandArgs = process.env.AHO_GH_COMMAND_ARGS;
      process.env.AHO_HOME = join(getTempDir(), ".aho-home");
      const fakeGh = await createFakeGh({ isDraft: false });
      const ghState = JSON.parse(await readFile(fakeGh.stateFile, "utf8"));
      ghState.merged = true;
      await writeFile(fakeGh.stateFile, JSON.stringify(ghState), "utf8");
      process.env.AHO_GH_COMMAND = fakeGh.command;
      process.env.AHO_GH_COMMAND_ARGS = JSON.stringify(fakeGh.args);
      try {
        await initGitRepository(getTempDir());
        await git(getTempDir(), ["branch", "-M", "main"]);
        await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agents/\n.claude/\n.tmp-origin.git/\n.tmp-updater/\n", "utf8");
        await writeFile(join(getTempDir(), "README.md"), "initial\n", "utf8");
        await git(getTempDir(), ["add", "."]);
        await git(getTempDir(), ["commit", "-m", "initial"]);
        const originDir = join(getTempDir(), ".tmp-origin.git");
        await git(getTempDir(), ["init", "--bare", originDir]);
        await git(getTempDir(), ["remote", "add", "origin", originDir]);
        await git(getTempDir(), ["push", "-u", "origin", "HEAD:main"]);
        await git(getTempDir(), ["branch", "aho/test"]);
        await git(getTempDir(), ["push", "origin", "aho/test"]);
        const updaterDir = join(getTempDir(), ".tmp-updater");
        await execFileAsync("git", ["clone", originDir, updaterDir]);
        await git(updaterDir, ["checkout", "main"]);
        await git(updaterDir, ["config", "user.email", "test@example.com"]);
        await git(updaterDir, ["config", "user.name", "Test User"]);
        await writeFile(join(updaterDir, "README.md"), "initial\nmerged remotely\n", "utf8");
        await git(updaterDir, ["add", "README.md"]);
        await git(updaterDir, ["commit", "-m", "simulate remote merge"]);
        await git(updaterDir, ["push", "origin", "main"]);
        await ensureProjectHarnessFixture();
        const memory = await resolveFixtureRuntime();
        const now = new Date().toISOString();
        const landingId = "landing-post-merge-test";
        const prDraftId = "pr-draft-post-merge-test";
        const remoteLandingResultId = "remote-landing-result-post-merge-test";
        await mkdir(join(memory.workbenchRoot, "landing", landingId), { recursive: true });
        await writeFile(join(memory.workbenchRoot, "landing", landingId, "landing-package.json"), JSON.stringify({
          version: "1.0",
          id: landingId,
          projectId: memory.projectId,
          target: { kind: "worktree", changeIds: ["post-merge-demand"], worktreeIds: ["worktree-post-merge"], expectedDiffHash: "diff", evidenceRefs: [] },
          status: "ready",
          sourceHead: null,
          sourceDiffHash: "diff",
          sourceDiffStat: "README.md | 1 +",
          changedFiles: ["README.md"],
          attributable: true,
          unattributedFiles: [],
          summary: "Post-merge landing package.",
          riskSummary: "Test package.",
          artifactRefs: [],
          createdAt: now,
          reviewedAt: now,
          review: {
            version: "1.0",
            packageId: landingId,
            roleId: "merge-reviewer-agent",
            verdict: "ready",
            summary: "Ready.",
            riskSummary: "Low.",
            evidenceRefs: [],
            missingChecks: [],
            suggestedNextAction: "Prepare PR.",
            createdAt: now,
          },
        }, null, 2), "utf8");
        await mkdir(join(memory.workbenchRoot, "pr-drafts", prDraftId), { recursive: true });
        await writeFile(join(memory.workbenchRoot, "pr-drafts", prDraftId, "pr-draft-package.json"), JSON.stringify({
          version: "1.0",
          id: prDraftId,
          landingPackageId: landingId,
          projectId: memory.projectId,
          provider: "github-cli",
          status: "created",
          title: "AHO: post-merge-demand",
          bodyArtifact: "project://body.md",
          packageArtifact: "project://pr-draft-package.json",
          remoteName: "origin",
          remoteUrl: originDir,
          baseBranch: "main",
          branchName: "aho/test",
          prUrl: "https://github.com/qinghui316/private-acceptance/pull/1",
          landingEvidenceRefs: [],
          createdAt: now,
          updatedAt: now,
        }, null, 2), "utf8");
        await mkdir(join(memory.workbenchRoot, "remote-landing", "remote-landing-attempt-post-merge-test"), { recursive: true });
        await writeFile(join(memory.workbenchRoot, "remote-landing", "remote-landing-attempt-post-merge-test", "remote-landing-result.json"), JSON.stringify({
          version: "1.0",
          id: remoteLandingResultId,
          attemptId: "remote-landing-attempt-post-merge-test",
          readinessId: "remote-landing-ready-post-merge-test",
          prDraftPackageId: prDraftId,
          landingPackageId: landingId,
          projectId: memory.projectId,
          prUrl: "https://github.com/qinghui316/private-acceptance/pull/1",
          status: "merged",
          mergeMethod: "squash",
          mergeCommit: "merge-commit-sha",
          mergedAt: now,
          artifactRefs: [],
          createdAt: now,
        }, null, 2), "utf8");

        const handoff = await preparePostMergeHandoff(project(), landingId, remoteLandingResultId);
        expect(handoff.localSyncReadiness).toMatchObject({ status: "ready", canSync: true });
        expect(handoff.remoteBranchCleanupReadiness).toMatchObject({ status: "ready", canCleanup: true, headBranch: "aho/test" });
        const sync = await syncLocalAfterMerge(project(), landingId, remoteLandingResultId);
        expect(sync.result.status).toBe("synced");
        const cleanup = await cleanupRemoteBranchAfterMerge(project(), landingId, remoteLandingResultId);
        expect(cleanup.result.status).toBe("deleted");
        const remoteBranch = await execFileAsync("git", ["ls-remote", "--heads", "origin", "aho/test"], { cwd: getTempDir() });
        expect(remoteBranch.stdout.trim()).toBe("");
      } finally {
        if (oldAhoHome === undefined) delete process.env.AHO_HOME;
        else process.env.AHO_HOME = oldAhoHome;
        if (oldGhCommand === undefined) delete process.env.AHO_GH_COMMAND;
        else process.env.AHO_GH_COMMAND = oldGhCommand;
        if (oldGhCommandArgs === undefined) delete process.env.AHO_GH_COMMAND_ARGS;
        else process.env.AHO_GH_COMMAND_ARGS = oldGhCommandArgs;
      }
    });

  it("captures inline PR review feedback and routes replies through explicit review actions", async () => {
      const oldAhoHome = process.env.AHO_HOME;
      const oldGhCommand = process.env.AHO_GH_COMMAND;
      const oldGhCommandArgs = process.env.AHO_GH_COMMAND_ARGS;
      process.env.AHO_HOME = join(getTempDir(), ".aho-home");
      const fakeGh = await createFakeGh({
        isDraft: false,
        inlineComments: [
          { id: 101, body: "Please fix the missing threshold edge case.", path: "src/pricing.ts", line: 12, html_url: "https://github.com/qinghui316/private-acceptance/pull/1#discussion_r101" },
        ],
        canResolveThreads: true,
      });
      process.env.AHO_GH_COMMAND = fakeGh.command;
      process.env.AHO_GH_COMMAND_ARGS = JSON.stringify(fakeGh.args);
      try {
        await initGitRepository(getTempDir());
        await git(getTempDir(), ["remote", "add", "origin", "https://github.com/qinghui316/private-acceptance.git"]);
        await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agents/\n.claude/\nfake-codex-bin/\n", "utf8");
        await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
        await git(getTempDir(), ["add", "."]);
        await git(getTempDir(), ["commit", "-m", "initial"]);
        const { memory } = await prepareRemoteLandingApplyCandidate({
          title: "PR Feedback Demand",
          changedContent: "{\"scripts\":{\"test\":\"node -e \\\"console.log('feedback')\\\"\"}}\n",
        });

        const applyAction = await applyActionAfterAuditAcceptance("pr-feedback-demand");
        await executeWorkbenchAction({ project: project(), path: getTempDir() }, { action: applyAction, confirm: true });
        const landingPrepared = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          ...await landingPrepareActionAfterApply("pr-feedback-demand"),
          confirm: true,
        });
        const landingPackage = (landingPrepared.result as { result: { package: { id: string } } }).result.package;
        const prPrepared = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          actionType: "pr-draft.prepare",
          changeId: "pr-feedback-demand",
          landingPackageId: landingPackage.id,
          confirm: true,
        });
        const prPackage = (prPrepared.result as { result: { package: { id: string } } }).result.package;
        const prPackagePath = join(memory.workbenchRoot, "pr-drafts", prPackage.id, "pr-draft-package.json");
        await writeFile(prPackagePath, JSON.stringify({
          ...JSON.parse(await readFile(prPackagePath, "utf8")),
          status: "created",
          prUrl: "https://github.com/qinghui316/private-acceptance/pull/1",
        }, null, 2), "utf8");

        const feedback = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          actionType: "pr-review.feedback-refresh",
          changeId: "pr-feedback-demand",
          landingPackageId: landingPackage.id,
          confirm: true,
        });
        expect(feedback.result).toMatchObject({
          result: {
            summary: expect.objectContaining({
              classification: "inline-comments-actionable",
              actionable: true,
              inlineCommentsCount: 1,
            }),
          },
        });
        await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          actionType: "pr-review.refresh",
          changeId: "pr-feedback-demand",
          landingPackageId: landingPackage.id,
          confirm: true,
        });
        const draft = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          actionType: "pr-review.reply-prepare",
          changeId: "pr-feedback-demand",
          landingPackageId: landingPackage.id,
          prompt: "这个评论请解释原因后回复",
          confirm: true,
        });
        expect(draft.result).toMatchObject({
          result: {
            draft: expect.objectContaining({
              targetKind: "review-thread",
              canResolveThread: true,
              status: "draft",
            }),
          },
        });
        const replySnapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "pr-feedback-demand" });
        expect(replySnapshot.right.confirmationQueue.primary?.actions).toEqual(expect.arrayContaining([
          expect.objectContaining({ actionType: "pr-review.reply-submit", label: "回复评审" }),
          expect.objectContaining({ actionType: "pr-review.thread-resolve", label: "标记已处理" }),
        ]));
        await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          actionType: "pr-review.reply-submit",
          changeId: "pr-feedback-demand",
          landingPackageId: landingPackage.id,
          confirm: true,
        });
        await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
          actionType: "pr-review.thread-resolve",
          changeId: "pr-feedback-demand",
          landingPackageId: landingPackage.id,
          confirm: true,
        });
        const state = JSON.parse(await readFile(fakeGh.stateFile, "utf8"));
        expect(state.replies).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "inline", commentId: "101" })]));
        expect(state.resolvedThreads).toEqual(expect.arrayContaining(["thread-1"]));
      } finally {
        if (oldAhoHome === undefined) delete process.env.AHO_HOME;
        else process.env.AHO_HOME = oldAhoHome;
        if (oldGhCommand === undefined) delete process.env.AHO_GH_COMMAND;
        else process.env.AHO_GH_COMMAND = oldGhCommand;
        if (oldGhCommandArgs === undefined) delete process.env.AHO_GH_COMMAND_ARGS;
        else process.env.AHO_GH_COMMAND_ARGS = oldGhCommandArgs;
      }
    }, 180_000);
  });

async function prepareRemoteLandingApplyCandidate(input: {
  title: string;
  changedContent: string;
  additionalChanges?: Array<{ path: string; content: string }>;
}) {
  const managedProject = project();
  const fixture = await prepareSkillNativeWorkbenchFixture({
    project: managedProject,
    ahoHome: join(getTempDir(), ".aho-home"),
  });
  const topic = await createConversationChangeFixture(managedProject, { title: input.title });
  const changes = [
    { path: "package.json", content: input.changedContent },
    ...(input.additionalChanges ?? []),
  ];
  await writeSkillNativeAcceptedSpecAndTasks(fixture, topic.changeId, {
    sourceScopes: changes.map((change) => change.path),
  });
  await authorizeSkillNativeWorkflowStartFixture(fixture, topic.changeId);
  const fakeCodex = await createFakeCodex({ changes });
  const oldPath = process.env.PATH;
  process.env.PATH = `${fakeCodex.binDir}${delimiter}${oldPath ?? ""}`;
  try {
    await execFileAsync(process.execPath, ["--check", join(fakeCodex.binDir, "fake-codex.cjs")]);
    const mainAttemptId = `attempt-main-${topic.conversationId}`;
    await startProviderAttempt(fixture.resolution.paths, {
      attemptId: mainAttemptId,
      providerId: "codex",
      capabilitySnapshot: await getCodexProviderCapabilitySnapshot(managedProject, getTempDir()),
      operationProfile: "main",
      roleId: "main-agent",
      handoffHash: "a".repeat(64),
      conversationId: topic.conversationId,
      changeId: topic.changeId,
      graphScopeId: `graph:${topic.conversationId}`,
    });
    await bindProviderAttemptThread(fixture.resolution.paths, {
      attemptId: mainAttemptId,
      threadId: `fixture-main-thread-${topic.conversationId}`,
      parentThreadId: null,
      parentAgentSurfaceId: null,
    });

    const snapshot = await getWorkbenchSnapshot(
      { project: managedProject, path: getTempDir() },
      { topicId: topic.conversationId },
    );
    const runAction = snapshot.right.confirmationQueue.current
      .flatMap((item) => item.actions)
      .find((action) => action.actionType === "workflow.run.start");
    if (!runAction) throw new Error(`Missing workflow.run.start action for ${topic.changeId}.`);

    const started = await executeWorkbenchAction(
      { project: managedProject, path: getTempDir() },
      { ...runAction, confirm: true },
    );
    const result = unwrapWorkflowActionResult(started.result) as { status?: string };
    if (result.status !== "completed") {
      const runs = await listRuns(fixture.runtime);
      const latestRun = runs.at(0);
      const [stderr, providerStderr, events] = await Promise.all([
        latestRun?.artifacts.stderr
          ? readFile(join(fixture.resolution.paths.sidecarRoot, latestRun.artifacts.stderr), "utf8").catch(() => "")
          : "",
        latestRun?.artifacts.providerStderr
          ? readFile(join(fixture.resolution.paths.sidecarRoot, latestRun.artifacts.providerStderr), "utf8").catch(() => "")
          : "",
        latestRun?.artifacts.events
          ? readFile(join(fixture.resolution.paths.sidecarRoot, latestRun.artifacts.events), "utf8").catch(() => "")
          : "",
      ]);
      throw new Error(`Remote landing fixture workflow did not complete: stderr=${stderr}; providerStderr=${providerStderr}; events=${events}; runs=${JSON.stringify(runs)}; result=${JSON.stringify(result)}`);
    }
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
  }

  const snapshot = await getWorkbenchSnapshot(
    { project: managedProject, path: getTempDir() },
    { topicId: topic.conversationId },
  );
  const worktreeId = snapshot.center.workpad.resultReview?.worktreeId;
  if (!worktreeId) throw new Error(`Remote landing fixture is missing result review for ${topic.changeId}.`);
  const metadata = await readWorktreeMetadata(fixture.runtime, worktreeId);
  const diff = await collectWorktreeDiff(fixture.runtime, worktreeId, topic.changeId);
  return { memory: fixture.runtime, worktree: { metadata }, diff, providerBinDir: fakeCodex.binDir };
}

async function withProviderBin<T>(binDir: string, action: () => Promise<T>): Promise<T> {
  const oldPath = process.env.PATH;
  try {
    process.env.PATH = `${binDir}${delimiter}${oldPath ?? ""}`;
    return await action();
  } finally {
    if (oldPath === undefined) delete process.env.PATH;
    else process.env.PATH = oldPath;
  }
}

async function applyActionAfterAuditAcceptance(topicId: string) {
  let snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId });
  const auditAccept = snapshot.right.decisionInspector.primary?.actions.find((action) => action.action?.actionId === "audit.accept")?.action
    ?? snapshot.right.confirmationQueue.primary?.actions.find((action) => action.action?.actionId === "audit.accept")?.action;
  if (auditAccept) {
    await executeWorkbenchAction({ project: project(), path: getTempDir() }, { action: auditAccept, confirm: true });
    snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId });
  }
  const applyAction = snapshot.right.decisionInspector.primary?.actions.find((action) => action.action?.actionId === "result.apply")?.action
    ?? snapshot.right.confirmationQueue.primary?.actions.find((action) => action.action?.actionId === "result.apply")?.action;
  if (!applyAction) {
    throw new Error(`Missing result.apply action: ${JSON.stringify({
      warnings: snapshot.warnings,
      resultReview: snapshot.center.workpad.resultReview,
      confirmationActions: snapshot.right.confirmationQueue.current.flatMap((item) => item.actions),
      inspector: snapshot.right.decisionInspector.primary,
    })}`);
  }
  return applyAction;
}

async function landingPrepareActionAfterApply(topicId: string) {
  const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId });
  const queue = snapshot.right.confirmationQueue;
  const action = [queue.primary, ...queue.current, ...queue.otherDemands]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .flatMap((item) => item.actions)
    .find((candidate) => candidate.actionType === "landing.prepare");
  if (!action) throw new Error("Missing landing.prepare action.");
  return { ...action, changeId: topicId };
}
