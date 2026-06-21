import { delimiter, join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { writeFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { initHarness } from "../../src/harness/init.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { createWorkbenchTopic } from "../../src/workbench/chat.js";
import { getWorkbenchSnapshot } from "../../src/workbench/manager.js";
import {
  createFakeCodex,
  getTempDir,
  git,
  initGitRepository,
  project,
} from "../unit/workbench/fixtures.js";
import type { WorkbenchDecisionAction } from "../../src/workbench/read-model-types.js";

const execFileAsync = promisify(execFile);

describe("workbench demand-to-execution golden flow", () => {
  it("carries a natural demand through planning, readiness, code, validation, and audit without source apply", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    const oldPath = process.env.PATH;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nfake-codex-bin/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());

      const topic = await createWorkbenchTopic(project(), {
        title: "Pricing Demand",
        body: "会员订单满 100 元打九折，非会员不打折，需要测试。",
      });
      process.env.PATH = join(getTempDir(), "no-codex-bin");

      await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        actionType: "planning.generate",
        changeId: topic.changeId,
        prompt: "会员订单满 100 元打九折，非会员不打折，需要测试。",
        confirm: true,
      });
      let snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
      const confirmPlanning = primaryWorkflowAction(snapshot, "planning.confirm-execution");
      expect(confirmPlanning).toMatchObject({ changeId: topic.changeId, planningBundleId: expect.any(String) });

      const confirmed = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...confirmPlanning,
        confirm: true,
      });
      const confirmedWorkflow = unwrapWorkflowActionResult(confirmed.result);
      expect(confirmedWorkflow).toMatchObject({
        bundle: expect.objectContaining({ status: "confirmed" }),
        executionStarted: false,
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
      expect(snapshot.right.confirmationQueue.current.filter((item) => item.primary)).toHaveLength(1);
      const decompose = primaryWorkflowAction(snapshot, "planning.decompose");
      expect(decompose).toMatchObject({ changeId: topic.changeId });

      await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...decompose, confirm: true });
      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
      const confirmDecomposition = primaryWorkflowAction(snapshot, "planning.decomposition.confirm");
      expect(confirmDecomposition).toMatchObject({ changeId: topic.changeId, decompositionPlanId: expect.any(String) });
      await executeWorkbenchAction({ project: project(), path: getTempDir() }, { ...confirmDecomposition, confirm: true });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
      const assessReadiness = primaryWorkflowAction(snapshot, "planning.decomposition.assess-readiness");
      expect(assessReadiness).toMatchObject({
        changeId: topic.changeId,
        decompositionPlanId: confirmDecomposition.decompositionPlanId,
      });
      const readinessResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...assessReadiness,
        confirm: true,
      });
      const readinessWorkflow = unwrapWorkflowActionResult(readinessResult.result) as { manifest: { id: string } };
      expect(readinessWorkflow).toMatchObject({
        manifest: expect.objectContaining({
          status: "ready-for-single-change",
          nextAllowedAction: "code.run",
        }),
        executionStarted: false,
      });

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
      expect(snapshot.right.confirmationQueue.current.filter((item) => item.primary)).toHaveLength(1);
      const runCode = primaryWorkflowAction(snapshot, "code.run");
      expect(runCode).toMatchObject({
        changeId: topic.changeId,
        readinessManifestId: readinessWorkflow.manifest.id,
      });
      expect(JSON.stringify(snapshot.right.confirmationQueue)).not.toMatch(/full-auto|parallel executor|merge queue|slot allocator|whole-wave/i);
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
      expect(await gitStatus(getTempDir())).toBe("");

      const fakeCodex = await createFakeCodex();
      process.env.PATH = `${fakeCodex.binDir}${delimiter}${oldPath ?? ""}`;
      const codeResult = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        ...runCode,
        confirm: true,
      });
      expect(unwrapWorkflowActionResult(codeResult.result)).toMatchObject({ status: "completed" });
      expect(await gitStatus(getTempDir())).toBe("");

      snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
      expect(snapshot.center.workpad.resultReview).toMatchObject({
        status: "ready-to-apply",
        validation: expect.objectContaining({ status: "passed" }),
        audit: expect.objectContaining({ status: expect.stringMatching(/approved/) }),
      });
      expect(snapshot.right.confirmationQueue.primary).toMatchObject({
        kind: "single-result-apply",
        changeId: topic.changeId,
        primary: true,
      });
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
      if (oldPath === undefined) delete process.env.PATH;
      else process.env.PATH = oldPath;
    }
  });
});

function primaryWorkflowAction(snapshot: Awaited<ReturnType<typeof getWorkbenchSnapshot>>, actionType: string): WorkbenchDecisionAction {
  const action = snapshot.right.confirmationQueue.primary?.actions.find((candidate) => candidate.actionType === actionType);
  if (!action) throw new Error(`Missing primary ${actionType} action.`);
  return action;
}

function unwrapWorkflowActionResult(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  const record = value as Record<string, unknown>;
  return record.result ?? value;
}

async function gitStatus(cwd: string): Promise<string> {
  const { stdout } = await execFileAsync("git", ["status", "--porcelain"], { cwd });
  return stdout.trim();
}
