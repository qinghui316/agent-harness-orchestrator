import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectRegistryStore } from "../../src/registry/store.js";
import { executeWorkbenchAction } from "../../src/server/workbench/actions.js";
import { recoverWorkbenchProjects } from "../../src/server/workbench-server.js";
import { runAllowlistedAction } from "../../src/workbench/actions/approval-execution.js";
import { recordAcceptedApprovalDecision } from "../../src/workbench/actions/approval-decision-reconciliation.js";
import {
  recordWorkbenchDecisionFailureUnlessAccepted,
} from "../../src/workbench/decisions.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import type { WorkbenchApprovalAction } from "../../src/workbench/read-model-types.js";
import { prepareSkillNativeApplyFixture } from "../helpers/skill-native-apply-fixture.js";
import { getTempDir, git, initGitRepository, project } from "./workbench/fixtures.js";

let previousAhoHome: string | undefined;

beforeEach(() => {
  previousAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(getTempDir(), ".aho-home");
});

afterEach(() => {
  if (previousAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = previousAhoHome;
});

describe("Workbench Apply decision recovery", () => {
  it("reconciles a failed decision after the committed domain transaction recovers on startup", async () => {
    const fixture = await prepareFixture("Post-commit handler failure");
    const action = currentApplyAction(fixture);

    await expect(executeWorkbenchAction(
      { project: fixture.project, path: fixture.project.path },
      { action, confirm: true },
      {
        assertCurrentAction: async () => undefined,
        runAction: async (managedProject, selectedAction, options) => {
          await runAllowlistedAction(managedProject, selectedAction, options);
          throw new Error("injected failure after the domain commit point");
        },
        recordAcceptedDecision: recordAcceptedApprovalDecision,
        recordFailureDecision: recordWorkbenchDecisionFailureUnlessAccepted,
      },
    )).rejects.toThrow(/injected failure after the domain commit point/i);

    expect(await decisionStatus(fixture.resolution.paths, fixture.changeId, "result.apply")).toBe("failed");
    const store = new ProjectRegistryStore(process.env.AHO_HOME!);
    await store.save({ version: "1.0", projects: [fixture.project] });
    const malformedCheck = join(fixture.resolution.paths.workbenchRoot, "integration-checks", "malformed");
    await mkdir(malformedCheck, { recursive: true });
    await writeFile(join(malformedCheck, "apply-transaction.json"), "{}\n", "utf8");

    await expect(recoverWorkbenchProjects(store, null)).rejects.toThrow(/Invalid IntegrationCheck apply transaction/i);

    expect(await decisionStatus(fixture.resolution.paths, fixture.changeId, "result.apply")).toBe("accepted");
    await rm(malformedCheck, { recursive: true, force: true });
    await recoverWorkbenchProjects(store, null);
    expect(await decisionStatus(fixture.resolution.paths, fixture.changeId, "result.apply")).toBe("accepted");
  }, 120_000);

  it("returns the committed result when the first accepted decision write fails", async () => {
    const fixture = await prepareFixture("Accepted decision write retry");
    const action = currentApplyAction(fixture);
    let acceptedWrites = 0;

    const result = await executeWorkbenchAction(
      { project: fixture.project, path: fixture.project.path },
      { action, confirm: true },
      {
        assertCurrentAction: async () => undefined,
        runAction: runAllowlistedAction,
        recordAcceptedDecision: async (...args) => {
          acceptedWrites += 1;
          if (acceptedWrites === 1) throw new Error("injected accepted decision persistence failure");
          await recordAcceptedApprovalDecision(...args);
        },
        recordFailureDecision: recordWorkbenchDecisionFailureUnlessAccepted,
      },
    );

    expect(result.result).toMatchObject({ apply: { status: "applied", worktreeId: fixture.worktreeId } });
    expect(acceptedWrites).toBe(2);
    expect(await decisionStatus(fixture.resolution.paths, fixture.changeId, "result.apply")).toBe("accepted");

    await recordWorkbenchDecisionFailureUnlessAccepted(fixture.project, {
      id: `approval:${action.actionId}:${action.args.join(":")}`,
      changeId: fixture.changeId,
      decisionType: action.actionId,
      status: "failed",
      label: action.label,
      summary: "late failure",
      targetId: fixture.worktreeId,
      runId: null,
      artifact: null,
      actionId: action.actionId,
      payload: { error: "late failure" },
      completedAt: new Date().toISOString(),
    });
    expect(await decisionStatus(fixture.resolution.paths, fixture.changeId, "result.apply")).toBe("accepted");
  }, 120_000);
});

async function prepareFixture(title: string) {
  await initGitRepository(getTempDir());
  await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agents/\n.claude/\n", "utf8");
  await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
  await git(getTempDir(), ["add", "."]);
  await git(getTempDir(), ["commit", "-m", "initial"]);
  return prepareSkillNativeApplyFixture({
    projectRoot: getTempDir(),
    ahoHome: process.env.AHO_HOME!,
    projectId: project().id,
    projectName: project().name,
    title,
  });
}

function currentApplyAction(fixture: Awaited<ReturnType<typeof prepareFixture>>): WorkbenchApprovalAction {
  return {
    actionId: "result.apply",
    label: "应用到项目",
    command: "result",
    args: ["apply", fixture.project.id, fixture.changeId, fixture.worktreeId],
    mutates: true,
    requiresConfirmation: true,
    scope: fixture.actionScope,
  };
}

async function decisionStatus(
  paths: Parameters<typeof openProjectRuntimeWorkbenchDatabase>[0],
  changeId: string,
  actionId: string,
): Promise<string | undefined> {
  const store = await openProjectRuntimeWorkbenchDatabase(paths);
  try {
    return store.decisions.listDecisions(project().id, changeId)
      .find((decision) => decision.actionId === actionId)?.status;
  } finally {
    store.close();
  }
}
