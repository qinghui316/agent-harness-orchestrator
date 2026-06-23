import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { collectWorktreeDiff } from "../../src/audit/diff.js";
import { createChange } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { listIntegrationChecks } from "../../src/integration-check/manager.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { createWorkbenchTopic } from "../../src/workbench/chat.js";
import { getWorkbenchSnapshot, listWorkbenchTopics } from "../../src/workbench/manager.js";
import { createWorktree } from "../../src/worktree/manager.js";
import { writeRawActiveChange } from "../unit/workbench/change-fixtures.js";
import {
  getTempDir,
  git,
  initGitRepository,
  project,
  writeAcceptedSpecAndTasks,
  writeAuditResultWithHash,
  writeValidationResultWithHash,
} from "../unit/workbench/fixtures.js";

const execFileAsync = promisify(execFile);

describe("workbench apply and integration slow flows", () => {
  it("projects result review and applies a reviewed worktree through one user decision", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());
      await createChange(project(), { title: "Result Review Demand" });
      await writeAcceptedSpecAndTasks("result-review-demand");
      const memory = await resolveProjectMemory(project());
      const worktree = await createWorktree(project(), memory, "result-review-demand");
      await writeFile(join(worktree.metadata.checkoutPath, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"console.log('ok')\\\"\"}}\n", "utf8");
      const diff = await collectWorktreeDiff(memory, worktree.metadata.worktreeId, "result-review-demand");
      await writeValidationResultWithHash("result-review-demand", "run-validation-review", worktree.metadata.worktreeId, diff.diffHash, "passed");
      await writeAuditResultWithHash("result-review-demand", "run-audit-review", worktree.metadata.worktreeId, diff.diffHash, "approved-with-notes");

      const beforeAuditAccept = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "result-review-demand" });
      expect(beforeAuditAccept.right.confirmationQueue.primary?.actions.some((action) => action.action?.actionId === "audit.accept")).toBe(true);
      const beforeApply = await acceptAuditAndGetSnapshot("result-review-demand");
      expect(beforeApply.center.workpad.resultReview).toMatchObject({
        status: "ready-to-apply",
        worktreeId: worktree.metadata.worktreeId,
        validation: expect.objectContaining({ status: "passed" }),
        audit: expect.objectContaining({ status: "approved-with-notes" }),
      });
      const applyApproval = beforeApply.right.decisionInspector.primary;
      expect(applyApproval).toMatchObject({ kind: "apply-gate" });
      expect(applyApproval?.actions.find((action) => action.kind === "approval")?.action).toMatchObject({
        actionId: "result.apply",
        args: ["apply", "", "result-review-demand", worktree.metadata.worktreeId],
      });

      const resultApplyAction = applyApproval?.actions.find((action) => action.action?.actionId === "result.apply")?.action;
      if (!resultApplyAction) throw new Error("Missing result.apply action.");
      const applied = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        action: resultApplyAction,
        confirm: true,
      });

      expect(applied.result).toMatchObject({
        apply: expect.objectContaining({ status: "applied", committed: false }),
      });
      const afterApply = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "result-review-demand" });
      expect(afterApply.center.workpad.resultReview).toMatchObject({ status: "applied-source-dirty" });
      expect(afterApply.center.selectedTopic?.state).toBe("active");
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  }, 120_000);

  it("completes a user-facing manual gated Workbench loop through apply and archive", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());
      const topic = await createWorkbenchTopic(project(), { title: "Finalize Target", body: "Make the package test print finalize." });
      await createWorkbenchTopic(project(), { title: "Other Active Demand", body: "Keep open." });
      await writeAcceptedSpecAndTasks(topic.changeId);
      const memory = await resolveProjectMemory(project());
      const worktree = await createWorktree(project(), memory, topic.changeId);
      await writeFile(join(worktree.metadata.checkoutPath, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"console.log('finalize')\\\"\"}}\n", "utf8");
      const diff = await collectWorktreeDiff(memory, worktree.metadata.worktreeId, topic.changeId);
      await writeValidationResultWithHash(topic.changeId, "run-validation-finalize", worktree.metadata.worktreeId, diff.diffHash, "passed");
      await writeAuditResultWithHash(topic.changeId, "run-audit-finalize", worktree.metadata.worktreeId, diff.diffHash, "approved");

      const beforeAuditAccept = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
      expect(beforeAuditAccept.right.confirmationQueue.primary?.actions.some((action) => action.action?.actionId === "audit.accept")).toBe(true);
      const snapshot = await acceptAuditAndGetSnapshot(topic.changeId);
      expect(snapshot.center.thread.items).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "user-message", body: "Make the package test print finalize." }),
      ]));
      expect(snapshot.center.workpad).toMatchObject({
        intake: expect.objectContaining({ currentUnderstanding: expect.any(String) }),
        resultReview: expect.objectContaining({
          status: "ready-to-apply",
          worktreeId: worktree.metadata.worktreeId,
          validation: expect.objectContaining({ id: "run-validation-finalize", status: "passed" }),
          audit: expect.objectContaining({ id: "run-audit-finalize", status: "approved" }),
          applyReadiness: expect.objectContaining({ ready: true }),
        }),
      });
      expect(snapshot.right.confirmationQueue.primary).toMatchObject({
        kind: "single-result-apply",
        changeId: topic.changeId,
        worktreeId: worktree.metadata.worktreeId,
        primary: true,
      });
      expect(snapshot.right.confirmationQueue.current.filter((item) => item.primary)).toHaveLength(1);
      expect(snapshot.right.confirmationQueue.current.flatMap((item) => item.actions).filter((action) => action.action?.actionId === "result.apply")).toHaveLength(1);
      expect(JSON.stringify(snapshot.right.confirmationQueue)).not.toMatch(/full-auto|parallel executor|merge queue/i);
      const applyAction = snapshot.right.decisionInspector.primary?.actions.find((action) => action.action?.actionId === "result.apply")?.action;
      if (!applyAction) throw new Error("Missing result.apply action.");
      expect(applyAction.args).toEqual(["apply", "", topic.changeId, worktree.metadata.worktreeId]);
      expect(await gitStatus(getTempDir())).toBe("");
      const applied = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        action: applyAction,
        confirm: true,
        options: { commit: true, message: "Apply finalize target" },
      });

      expect(applied.result).toMatchObject({
        apply: expect.objectContaining({ status: "applied", committed: true }),
      });
      expect(await gitStatus(getTempDir())).toBe("");
      const afterApply = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
      expect(afterApply.center.selectedTopic?.state).toBe("active");
      expect(afterApply.center.workpad.resultReview).toMatchObject({ status: "applied-clean" });
      expect(afterApply.right.confirmationQueue.primary).toMatchObject({
        changeId: topic.changeId,
        whyNeedsConfirmation: "确认完成需求",
        primary: true,
      });
      const closeAction = afterApply.right.decisionInspector.primary?.actions.find((action) => action.action?.actionId === "change.close")?.action;
      if (!closeAction) throw new Error("Missing change.close action after apply.");
      expect(closeAction.args).toEqual(["close", "repo", topic.changeId]);
      const closed = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        action: closeAction,
        confirm: true,
      });
      expect(closed.result).toMatchObject({
        change: expect.objectContaining({ id: topic.changeId }),
        archivePath: expect.stringContaining(topic.changeId),
      });
      const topics = await listWorkbenchTopics(project());
      expect(topics.find((item) => item.id === topic.changeId)).toMatchObject({ state: "archive" });
      expect(topics.find((item) => item.id === "other-active-demand")).toMatchObject({ state: "active" });
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  }, 120_000);

  it("scopes result review apply decisions to the selected demand worktree", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());
      await writeRawActiveChange(getTempDir(), "demand-a", "Demand A");
      await writeRawActiveChange(getTempDir(), "demand-b", "Demand B");
      await writeAcceptedSpecAndTasks("demand-a");
      await writeAcceptedSpecAndTasks("demand-b");
      const memory = await resolveProjectMemory(project());
      const worktreeB = await createWorktree(project(), memory, "demand-b");
      await writeFile(join(worktreeB.metadata.checkoutPath, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"console.log('b')\\\"\"}}\n", "utf8");
      const diffB = await collectWorktreeDiff(memory, worktreeB.metadata.worktreeId, "demand-b");
      await writeValidationResultWithHash("demand-b", "run-validation-b", worktreeB.metadata.worktreeId, diffB.diffHash, "passed");
      await writeAuditResultWithHash("demand-b", "run-audit-b", worktreeB.metadata.worktreeId, diffB.diffHash, "approved-with-notes");

      const snapshot = await acceptAuditAndGetSnapshot("demand-b");
      const applyAction = snapshot.right.decisionInspector.primary?.actions.find((action) => action.action?.actionId === "result.apply")?.action;

      expect(snapshot.center.selectedTopic?.id).toBe("demand-b");
      expect(snapshot.center.workpad.resultReview).toMatchObject({
        status: "ready-to-apply",
        worktreeId: worktreeB.metadata.worktreeId,
        applyReadiness: expect.objectContaining({ kind: "ready" }),
      });
      expect(applyAction).toMatchObject({
        actionId: "result.apply",
        args: ["apply", "", "demand-b", worktreeB.metadata.worktreeId],
      });
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  });

  it("projects multiple ready results into a confirmation queue integration check", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await writeFile(join(getTempDir(), "pricing.ts"), "export const base = 1;\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());
      await writeRawActiveChange(getTempDir(), "demand-a", "Demand A");
      await writeRawActiveChange(getTempDir(), "demand-b", "Demand B");
      await writeAcceptedSpecAndTasks("demand-a");
      await writeAcceptedSpecAndTasks("demand-b");
      const memory = await resolveProjectMemory(project());
      const worktreeA = await createWorktree(project(), memory, "demand-a");
      await writeFile(join(worktreeA.metadata.checkoutPath, "a.txt"), "a\n", "utf8");
      const diffA = await collectWorktreeDiff(memory, worktreeA.metadata.worktreeId, "demand-a");
      await writeValidationResultWithHash("demand-a", "run-validation-a", worktreeA.metadata.worktreeId, diffA.diffHash, "passed");
      await writeAuditResultWithHash("demand-a", "run-audit-a", worktreeA.metadata.worktreeId, diffA.diffHash, "approved-with-notes");
      const worktreeB = await createWorktree(project(), memory, "demand-b");
      await writeFile(join(worktreeB.metadata.checkoutPath, "b.txt"), "b\n", "utf8");
      const diffB = await collectWorktreeDiff(memory, worktreeB.metadata.worktreeId, "demand-b");
      await writeValidationResultWithHash("demand-b", "run-validation-b", worktreeB.metadata.worktreeId, diffB.diffHash, "passed");
      await writeAuditResultWithHash("demand-b", "run-audit-b", worktreeB.metadata.worktreeId, diffB.diffHash, "approved-with-notes");

      await acceptAuditAndGetSnapshot("demand-a");
      await acceptAuditAndGetSnapshot("demand-b");
      const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "demand-a" });
      expect(snapshot.right.confirmationQueue.primary).toMatchObject({
        kind: "integration-check",
        whyNeedsConfirmation: "多个结果都已准备好应用。",
      });
      expect(snapshot.right.confirmationQueue.primary?.actions[0]).toMatchObject({
        actionType: "apply-check.run",
        worktreeIds: expect.arrayContaining([worktreeA.metadata.worktreeId, worktreeB.metadata.worktreeId]),
      });
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  }, 120_000);

  it("runs an integration check in a temporary worktree without changing source root", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());
      await writeRawActiveChange(getTempDir(), "demand-a", "Demand A");
      await writeRawActiveChange(getTempDir(), "demand-b", "Demand B");
      await writeAcceptedSpecAndTasks("demand-a");
      await writeAcceptedSpecAndTasks("demand-b");
      const memory = await resolveProjectMemory(project());
      const worktreeA = await createWorktree(project(), memory, "demand-a");
      await writeFile(join(worktreeA.metadata.checkoutPath, "a.txt"), "a\n", "utf8");
      const diffA = await collectWorktreeDiff(memory, worktreeA.metadata.worktreeId, "demand-a");
      await writeValidationResultWithHash("demand-a", "run-validation-a", worktreeA.metadata.worktreeId, diffA.diffHash, "passed");
      await writeAuditResultWithHash("demand-a", "run-audit-a", worktreeA.metadata.worktreeId, diffA.diffHash, "approved-with-notes");
      const worktreeB = await createWorktree(project(), memory, "demand-b");
      await writeFile(join(worktreeB.metadata.checkoutPath, "b.txt"), "b\n", "utf8");
      const diffB = await collectWorktreeDiff(memory, worktreeB.metadata.worktreeId, "demand-b");
      await writeValidationResultWithHash("demand-b", "run-validation-b", worktreeB.metadata.worktreeId, diffB.diffHash, "passed");
      await writeAuditResultWithHash("demand-b", "run-audit-b", worktreeB.metadata.worktreeId, diffB.diffHash, "approved-with-notes");

      await acceptAuditAndGetSnapshot("demand-a");
      await acceptAuditAndGetSnapshot("demand-b");
      const checked = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        actionType: "apply-check.run",
        changeId: "demand-a",
        worktreeIds: [worktreeA.metadata.worktreeId, worktreeB.metadata.worktreeId],
        confirm: true,
      });
      expect(checked.result).toMatchObject({
        result: {
          check: expect.objectContaining({ status: "passed" }),
        },
      });
      expect(existsSync(join(getTempDir(), "a.txt"))).toBe(false);
      expect(existsSync(join(getTempDir(), "b.txt"))).toBe(false);

      const after = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "demand-a" });
      expect(after.right.confirmationQueue.primary).toMatchObject({
        kind: "integration-apply",
        whyNeedsConfirmation: "兼容性检查已通过，是否应用这些结果需要你确认。",
      });
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  }, 120_000);

  it("rejects explicit integration check targets when any requested worktree id is forged", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());
      await writeRawActiveChange(getTempDir(), "demand-a", "Demand A");
      await writeRawActiveChange(getTempDir(), "demand-b", "Demand B");
      await writeAcceptedSpecAndTasks("demand-a");
      await writeAcceptedSpecAndTasks("demand-b");
      const memory = await resolveProjectMemory(project());
      const worktreeA = await createWorktree(project(), memory, "demand-a");
      await writeFile(join(worktreeA.metadata.checkoutPath, "a.txt"), "a\n", "utf8");
      const diffA = await collectWorktreeDiff(memory, worktreeA.metadata.worktreeId, "demand-a");
      await writeValidationResultWithHash("demand-a", "run-validation-a", worktreeA.metadata.worktreeId, diffA.diffHash, "passed");
      await writeAuditResultWithHash("demand-a", "run-audit-a", worktreeA.metadata.worktreeId, diffA.diffHash, "approved-with-notes");
      const worktreeB = await createWorktree(project(), memory, "demand-b");
      await writeFile(join(worktreeB.metadata.checkoutPath, "b.txt"), "b\n", "utf8");
      const diffB = await collectWorktreeDiff(memory, worktreeB.metadata.worktreeId, "demand-b");
      await writeValidationResultWithHash("demand-b", "run-validation-b", worktreeB.metadata.worktreeId, diffB.diffHash, "passed");
      await writeAuditResultWithHash("demand-b", "run-audit-b", worktreeB.metadata.worktreeId, diffB.diffHash, "approved-with-notes");

      await acceptAuditAndGetSnapshot("demand-a");
      await acceptAuditAndGetSnapshot("demand-b");
      const result = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        actionType: "apply-check.run",
        changeId: "demand-a",
        worktreeIds: [worktreeA.metadata.worktreeId, worktreeB.metadata.worktreeId, "forged-worktree"],
        confirm: true,
      });
      expect(result.result.status).toBe("failed");
      expect(result.result.error).toMatch(/forged-worktree|requested worktree/i);
      await expect(listIntegrationChecks(memory)).resolves.toHaveLength(0);
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  }, 120_000);

  it("runs integration fix on aggregate validation failure and applies repaired artifact only after confirmation", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());
      await writeRawActiveChange(getTempDir(), "demand-a", "Demand A");
      await writeRawActiveChange(getTempDir(), "demand-b", "Demand B");
      await writeAcceptedSpecAndTasks("demand-a");
      await writeAcceptedSpecAndTasks("demand-b");
      const memory = await resolveProjectMemory(project());
      const worktreeA = await createWorktree(project(), memory, "demand-a");
      await writeFile(join(worktreeA.metadata.checkoutPath, "a.txt"), "a\n", "utf8");
      const diffA = await collectWorktreeDiff(memory, worktreeA.metadata.worktreeId, "demand-a");
      await writeValidationResultWithHash("demand-a", "run-validation-a", worktreeA.metadata.worktreeId, diffA.diffHash, "passed");
      await writeAuditResultWithHash("demand-a", "run-audit-a", worktreeA.metadata.worktreeId, diffA.diffHash, "approved-with-notes");
      const worktreeB = await createWorktree(project(), memory, "demand-b");
      await writeFile(join(worktreeB.metadata.checkoutPath, "integration-validation-fail.txt"), "temporary aggregate failure marker\n", "utf8");
      await writeFile(join(worktreeB.metadata.checkoutPath, "b.txt"), "b\n", "utf8");
      const diffB = await collectWorktreeDiff(memory, worktreeB.metadata.worktreeId, "demand-b");
      await writeValidationResultWithHash("demand-b", "run-validation-b", worktreeB.metadata.worktreeId, diffB.diffHash, "passed");
      await writeAuditResultWithHash("demand-b", "run-audit-b", worktreeB.metadata.worktreeId, diffB.diffHash, "approved-with-notes");

      await acceptAuditAndGetSnapshot("demand-a");
      await acceptAuditAndGetSnapshot("demand-b");
      const checked = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        actionType: "apply-check.run",
        changeId: "demand-a",
        worktreeIds: [worktreeA.metadata.worktreeId, worktreeB.metadata.worktreeId],
        confirm: true,
      });
      const check = (checked.result as { result: { check: { id: string; status: string; latestArtifactRef?: string; aggregateValidation?: { status: string }; aggregateAudit?: { status: string }; fixAttempts?: Array<{ status: string }> } } }).result.check;
      expect(check).toMatchObject({
        status: "passed",
        latestArtifactRef: expect.stringContaining("repaired.patch"),
        aggregateValidation: expect.objectContaining({ status: "passed" }),
        aggregateAudit: expect.objectContaining({ status: "approved" }),
      });
      expect(check.fixAttempts?.[0]).toMatchObject({ status: "completed" });
      expect(existsSync(join(getTempDir(), "a.txt"))).toBe(false);
      expect(existsSync(join(getTempDir(), "b.txt"))).toBe(false);
      expect(existsSync(join(getTempDir(), "integration-validation-fail.txt"))).toBe(false);

      await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        action: {
          actionId: "apply-check.apply",
          command: "apply-check",
          args: ["apply", check.id],
          label: "确认应用到项目",
          mutates: true,
          requiresConfirmation: true,
        },
        confirm: true,
      });
      expect(existsSync(join(getTempDir(), "a.txt"))).toBe(true);
      expect(existsSync(join(getTempDir(), "b.txt"))).toBe(true);
      expect(existsSync(join(getTempDir(), "integration-validation-fail.txt"))).toBe(false);
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  }, 120_000);

  it("classifies source drift as same-demand refresh rework instead of apply", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());
      await createChange(project(), { title: "Source Drift Demand" });
      await writeAcceptedSpecAndTasks("source-drift-demand");
      const memory = await resolveProjectMemory(project());
      const worktree = await createWorktree(project(), memory, "source-drift-demand");
      await writeFile(join(worktree.metadata.checkoutPath, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"console.log('drift')\\\"\"}}\n", "utf8");
      const diff = await collectWorktreeDiff(memory, worktree.metadata.worktreeId, "source-drift-demand");
      await writeValidationResultWithHash("source-drift-demand", "run-validation-drift", worktree.metadata.worktreeId, diff.diffHash, "passed");
      await writeAuditResultWithHash("source-drift-demand", "run-audit-drift", worktree.metadata.worktreeId, diff.diffHash, "approved-with-notes");
      await acceptAuditAndGetSnapshot("source-drift-demand");
      await writeFile(join(getTempDir(), "README.md"), "Project changed after result review.\n", "utf8");
      await git(getTempDir(), ["add", "README.md"]);
      await git(getTempDir(), ["commit", "-m", "source changed"]);

      const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "source-drift-demand" });
      const primary = snapshot.right.decisionInspector.primary;

      expect(snapshot.center.workpad.resultReview?.applyReadiness).toMatchObject({
        kind: "source-drift",
        message: "项目已变化，需要重新处理这个结果。",
      });
      expect(primary).toMatchObject({
        title: "项目已变化，需要重新处理这个结果。",
        targetId: worktree.metadata.worktreeId,
      });
      expect(primary?.actions.some((action) => action.actionType === "result.refresh-rework")).toBe(true);
      expect(primary?.actions.some((action) => action.action?.actionId === "result.apply")).toBe(false);
      expect(JSON.stringify(snapshot.center.workpad.resultReview)).not.toContain("Source HEAD drifted");
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  });

  it("classifies dirty source as refresh status without automatic coder rework", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());
      await createChange(project(), { title: "Dirty Source Demand" });
      await writeAcceptedSpecAndTasks("dirty-source-demand");
      const memory = await resolveProjectMemory(project());
      const worktree = await createWorktree(project(), memory, "dirty-source-demand");
      await writeFile(join(worktree.metadata.checkoutPath, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"console.log('dirty')\\\"\"}}\n", "utf8");
      const diff = await collectWorktreeDiff(memory, worktree.metadata.worktreeId, "dirty-source-demand");
      await writeValidationResultWithHash("dirty-source-demand", "run-validation-dirty", worktree.metadata.worktreeId, diff.diffHash, "passed");
      await writeAuditResultWithHash("dirty-source-demand", "run-audit-dirty", worktree.metadata.worktreeId, diff.diffHash, "approved-with-notes");
      await acceptAuditAndGetSnapshot("dirty-source-demand");
      await writeFile(join(getTempDir(), "README.md"), "Uncommitted local edit.\n", "utf8");

      const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "dirty-source-demand" });
      const primary = snapshot.right.decisionInspector.primary;

      expect(snapshot.center.workpad.resultReview?.applyReadiness).toMatchObject({
        kind: "dirty-source",
        message: "项目里有未处理的本地改动，暂时不能应用。",
      });
      expect(primary?.actions.some((action) => action.actionType === "result.refresh-status")).toBe(true);
      expect(primary?.actions.some((action) => action.actionType === "result.refresh-rework")).toBe(false);
      expect(primary?.actions.some((action) => action.action?.actionId === "result.apply")).toBe(false);
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  });
});

async function gitStatus(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd });
  return stdout.trim();
}

async function acceptAuditAndGetSnapshot(topicId: string) {
  let snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId });
  const auditAccept = snapshot.right.confirmationQueue.primary?.actions.find((action) => action.action?.actionId === "audit.accept")?.action;
  if (!auditAccept) throw new Error(`Missing audit.accept action for ${topicId}.`);
  await executeWorkbenchAction({ project: project(), path: getTempDir() }, { action: auditAccept, confirm: true });
  snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId });
  return snapshot;
}
