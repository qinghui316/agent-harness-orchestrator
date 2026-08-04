import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const appServerTurn = vi.hoisted(() => vi.fn());
const executionSpec = vi.hoisted(() => ({
  changedPath: "candidate.txt",
  changedContent: "skill-native candidate\n",
  auditStatus: "approved" as "approved" | "approved-with-notes",
}));
const applyTransactionFailure = vi.hoisted(() => ({ beforeCommitPoint: false }));

vi.mock("../../src/codex/app-server.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/codex/app-server.js")>(),
  detectCodexAppServerCapability: vi.fn(async () => ({
    available: true,
    supportsStdio: true,
    supportsRequiredLifecycle: true,
    nativeCollab: { multiAgent: "enabled", multiAgentV2: "enabled", configPath: "test", errors: [] },
    help: "codex app server --listen stdio://",
    errors: [],
  })),
  runCodexAppServerTurn: appServerTurn,
  runCodexAppServerChildTurn: vi.fn(),
  runCodexAppServerChildClose: vi.fn(),
  isCodexAppServerChildAvailable: vi.fn(() => true),
  getActiveCodexAppServerTurn: vi.fn(() => null),
}));

vi.mock("../../src/codex/capabilities.js", () => ({
  detectCodexCapabilities: vi.fn(async () => readyCodexCapabilities()),
}));

vi.mock("../../src/codex/native-skills.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/codex/native-skills.js")>(),
  listCodexNativeSkills: vi.fn(async () => ({ providerId: "codex", projectPath: getTempDir(), skills: [], errors: [] })),
}));
vi.mock("../../src/workflow-runtime/execution-authorization.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/workflow-runtime/execution-authorization.js")>();
  return {
    ...actual,
    reserveTransitionExecutionCommitPoint: vi.fn(async (...args: Parameters<typeof actual.reserveTransitionExecutionCommitPoint>) => {
      if (applyTransactionFailure.beforeCommitPoint) {
        throw new Error("Injected ApplyTransaction failure before commit point.");
      }
      return actual.reserveTransitionExecutionCommitPoint(...args);
    }),
  };
});
import { applyResultToProject } from "../../src/apply/manager.js";
import { normalizeCodexAppServerNotification } from "../../src/codex/app-server-realtime.js";
import { listIntegrationChecks, runSkillNativeIntegrationCheck } from "../../src/integration-check/manager.js";
import { getGitCommit, getGitStatusShort } from "../../src/project/git.js";
import { projectExecutionRuntimePort } from "../../src/project-runtime/execution-ports.js";
import { resolveProjectRuntimeState } from "../../src/project-runtime/coordinator.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../src/provider-runtime/project-harness-discovery.js";
import { listRuns } from "../../src/run/manager.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { getWorkbenchSnapshot } from "../../src/workbench/projections/read-model/implementation.js";
import {
  createWorkbenchConversation,
  listConversationMessages,
  postConversationMessage,
} from "../../src/workbench/conversation-service.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { buildWorkbenchApprovalDecisionId, readWorkbenchDecisionStatus } from "../../src/workbench/decisions.js";
import { readExecutionAuthorization, recoverTransitionExecution } from "../../src/workflow-runtime/execution-authorization.js";
import { readWorktreeMetadata } from "../../src/worktree/repository.js";
import {
  addSkillNativeApplyCandidate,
  prepareSkillNativeApplyFixture,
  type SkillNativeApplyFixture,
} from "../helpers/skill-native-apply-fixture.js";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";
import {
  authorizeSkillNativeWorkflowStartFixture,
  createSkillNativeWorkbenchReadyCandidate,
  prepareSkillNativeWorkbenchFixture,
  writeSkillNativeAcceptedSpecAndTasks,
  type SkillNativeWorkbenchFixture,
} from "../helpers/skill-native-workbench-fixture.js";
import { getTempDir, git, initGitRepository, project } from "../helpers/skill-native-test-environment.js";

let previousAhoHome: string | undefined;

beforeEach(() => {
  previousAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(getTempDir(), ".aho-home");
  appServerTurn.mockReset();
  appServerTurn.mockImplementation(async (options) => executeFixtureRoleTurn(options));
});

afterEach(() => {
  if (previousAhoHome === undefined) delete process.env.AHO_HOME;
  else process.env.AHO_HOME = previousAhoHome;
});

describe("workbench apply and integration slow flows", () => {
  it("consumes a scoped-auto authorization without a second apply confirmation and advances source lineage", async () => {
    const fixture = await prepareApplyFixture("Scoped Auto Demand", {
      authorizationMode: "scoped-auto",
      changedContent: "scoped auto\n",
    });

    const applied = await applyResultToProject(project(), fixture.worktreeId, {
      commit: true,
      message: "Scoped auto apply",
      actionScope: fixture.actionScope,
    });

    expect(applied.apply).toMatchObject({ status: "applied", committed: true, commitHash: expect.any(String) });
    expect(await getGitStatusShort(getTempDir())).toEqual([]);
    expect(await readExecutionAuthorization(fixture.resolution.paths, fixture.authorizationId)).toMatchObject({
      mode: "scoped-auto",
      epoch: 2,
      sourceHead: applied.apply.commitHash,
    });
  }, 120_000);

  it("projects result review and applies a reviewed worktree through one user decision", async () => {
    const fixture = await prepareExecutedApplyFixture("Result Review Demand", {
      auditStatus: "approved-with-notes",
      acceptAudit: false,
      changedContent: "reviewed result\n",
    });
    const beforeAuditAccept = await getWorkbenchSnapshot(
      { project: project(), path: getTempDir() },
      { topicId: fixture.conversationId },
    );
    expect(beforeAuditAccept.right.confirmationQueue.primary?.actions.some((action) => action.action?.actionId === "audit.accept")).toBe(true);
    const beforeApply = await acceptAuditAndGetSnapshot(fixture);
    expect(beforeApply.center.workpad.resultReview).toMatchObject({
      status: "ready-to-apply",
      worktreeId: fixture.worktreeId,
      validation: expect.objectContaining({ status: "passed" }),
      audit: expect.objectContaining({ status: "approved-with-notes" }),
    });
    const action = beforeApply.right.decisionInspector.primary?.actions.find((item) => item.action?.actionId === "result.apply")?.action;
    expect(action).toMatchObject({
      actionId: "result.apply",
      args: ["apply", project().id, fixture.changeId, fixture.worktreeId],
    });
    if (!action) throw new Error("Missing result.apply action.");

    const sourceHeadBeforeApply = await getGitCommit(getTempDir());
    expect(existsSync(join(getTempDir(), "candidate.txt"))).toBe(false);

    await executeWorkbenchAction({ project: project(), path: getTempDir() }, { action, confirm: true });

    expect((await readFile(join(getTempDir(), "candidate.txt"), "utf8")).replaceAll("\r\n", "\n")).toBe("reviewed result\n");
    expect(await getGitCommit(getTempDir())).toBe(sourceHeadBeforeApply);
    expect(await getGitStatusShort(getTempDir())).toContain("?? candidate.txt");
    const afterApply = await getWorkbenchSnapshot(
      { project: project(), path: getTempDir() },
      { topicId: fixture.conversationId },
    );
    expect(afterApply.center.selectedTopic?.state).toBe("active");
    expect(JSON.stringify(afterApply.right.confirmationQueue.current)).not.toContain("\"actionId\":\"result.apply\"");
  }, 120_000);

  it("completes the manual Workbench apply gate without entering finalization", async () => {
    const fixture = await prepareExecutedApplyFixture("Manual Apply Target", {
      acceptAudit: false,
      changedContent: "manual apply\n",
    });
    const snapshot = await acceptAuditAndGetSnapshot(fixture);
    expect(snapshot.right.confirmationQueue.primary).toMatchObject({
      kind: "single-result-apply",
      changeId: fixture.changeId,
      worktreeId: fixture.worktreeId,
      primary: true,
    });
    expect(snapshot.right.confirmationQueue.current.filter((item) => item.primary)).toHaveLength(1);
    const action = snapshot.right.decisionInspector.primary?.actions.find((item) => item.action?.actionId === "result.apply")?.action;
    if (!action) throw new Error("Missing result.apply action.");

    const applied = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      action,
      confirm: true,
      options: { commit: true, message: "Apply manual target" },
    });
    expect(applied.result).toMatchObject({ apply: expect.objectContaining({ status: "applied", committed: true }) });
    await expect(executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      action,
      confirm: true,
      options: { commit: true, message: "Apply manual target" },
    })).rejects.toThrow(/stale or no longer available/i);
    expect(await getGitStatusShort(getTempDir())).toEqual([]);
    const after = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: fixture.conversationId });
    expect(after.center.selectedTopic?.state).toBe("active");
    expect(JSON.stringify(after.right)).not.toContain("change.close");
  }, 120_000);

  it("scopes result review apply decisions to the selected demand worktree", async () => {
    const fixture = await prepareSkillNativeWorkbenchFixture({ project: project(), ahoHome: process.env.AHO_HOME });
    const first = await createReadyDemand(fixture, "Selected Demand", "selected.txt", "selected\n");
    const second = await createReadyDemand(fixture, "Other Demand", "other.txt", "other\n");
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: first.topic.conversationId });
    const currentJson = JSON.stringify(snapshot.right.confirmationQueue.current);

    expect(currentJson).toContain(first.candidate.worktreeId);
    expect(currentJson).not.toContain(`"worktreeId":"${second.candidate.worktreeId}","applyCheckId"`);
    expect(snapshot.right.confirmationQueue.current.every((item) => item.changeId !== second.topic.changeId || !item.primary)).toBe(true);
  }, 120_000);

  it("projects multiple ready results into a confirmation queue integration check", async () => {
    const fixture = await prepareSkillNativeWorkbenchFixture({ project: project(), ahoHome: process.env.AHO_HOME });
    const topic = await createConversationChangeFixture(project(), { title: "Multiple Ready Results" });
    await writeSkillNativeAcceptedSpecAndTasks(fixture, topic.changeId);
    await authorizeSkillNativeWorkflowStartFixture(fixture, topic.changeId);
    const first = await createSkillNativeWorkbenchReadyCandidate(fixture, topic.changeId, "first.txt", "first\n");
    const second = await createSkillNativeWorkbenchReadyCandidate(fixture, topic.changeId, "second.txt", "second\n");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.conversationId });
    const item = snapshot.right.confirmationQueue.current.find((candidate) => candidate.kind === "integration-check");
    const runAction = item?.actions.find((action) => action.actionType === "apply-check.run");
    expect(runAction?.worktreeIds).toHaveLength(2);
    expect([...(runAction?.worktreeIds ?? [])].sort()).toEqual([first.worktreeId, second.worktreeId].sort());
    expect(await listIntegrationChecks(fixture.runtime)).toHaveLength(0);
  }, 120_000);

  it("does not combine ready worktrees from different Changes into one IntegrationCheck", async () => {
    const fixture = await prepareSkillNativeWorkbenchFixture({ project: project(), ahoHome: process.env.AHO_HOME });
    const first = await createReadyDemand(fixture, "Demand A", "a.txt", "a\n");
    const second = await createReadyDemand(fixture, "Demand B", "b.txt", "b\n");
    const secondExtra = await createSkillNativeWorkbenchReadyCandidate(fixture, second.topic.changeId, "b2.txt", "b2\n");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: first.topic.conversationId });
    expect(snapshot.right.confirmationQueue.current.some((item) => item.kind === "integration-check")).toBe(false);
    const crossChange = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      actionType: "apply-check.run",
      changeId: first.topic.changeId,
      worktreeIds: [first.candidate.worktreeId, second.candidate.worktreeId],
      confirm: true,
    });
    expect(crossChange.result).toMatchObject({ status: "failed", error: expect.stringMatching(/Change|requested|stale/i) });
    const hijacked = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      actionType: "apply-check.run",
      changeId: first.topic.changeId,
      worktreeIds: [second.candidate.worktreeId, secondExtra.worktreeId],
      confirm: true,
    });
    expect(hijacked.result).toMatchObject({ status: "failed", error: expect.stringMatching(/requested Change|stale|requested/i) });
    expect(await listIntegrationChecks(fixture.runtime)).toHaveLength(0);
  }, 120_000);

  it("runs an integration check in a temporary worktree without changing source root", async () => {
    const fixture = await prepareSkillNativeWorkbenchFixture({ project: project(), ahoHome: process.env.AHO_HOME });
    const topic = await createConversationChangeFixture(project(), { title: "Integration Check Product Path" });
    await writeSkillNativeAcceptedSpecAndTasks(fixture, topic.changeId);
    await authorizeSkillNativeWorkflowStartFixture(fixture, topic.changeId);
    const first = await createSkillNativeWorkbenchReadyCandidate(fixture, topic.changeId, "a.txt", "a\n");
    const second = await createSkillNativeWorkbenchReadyCandidate(fixture, topic.changeId, "b.txt", "b\n");

    const checked = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      actionType: "apply-check.run",
      changeId: topic.changeId,
      worktreeIds: [first.worktreeId, second.worktreeId],
      confirm: true,
    });
    expect(checked.result).toMatchObject({ result: { check: expect.objectContaining({ status: "passed" }) } });
    expect(existsSync(join(getTempDir(), "a.txt"))).toBe(false);
    expect(existsSync(join(getTempDir(), "b.txt"))).toBe(false);
    const after = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.conversationId });
    expect(after.right.confirmationQueue.primary).toMatchObject({ kind: "integration-apply", changeId: topic.changeId });
  }, 120_000);

  it("rejects explicit integration check targets when any requested worktree id is forged", async () => {
    const fixture = await prepareSkillNativeWorkbenchFixture({ project: project(), ahoHome: process.env.AHO_HOME });
    const topic = await createConversationChangeFixture(project(), { title: "Forged Integration Target" });
    await writeSkillNativeAcceptedSpecAndTasks(fixture, topic.changeId);
    await authorizeSkillNativeWorkflowStartFixture(fixture, topic.changeId);
    const first = await createSkillNativeWorkbenchReadyCandidate(fixture, topic.changeId, "a.txt", "a\n");
    const second = await createSkillNativeWorkbenchReadyCandidate(fixture, topic.changeId, "b.txt", "b\n");

    const result = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
      actionType: "apply-check.run",
      changeId: topic.changeId,
      worktreeIds: [first.worktreeId, second.worktreeId, "forged-worktree"],
      confirm: true,
    });
    expect(result.result).toMatchObject({ status: "failed", error: expect.stringMatching(/forged-worktree|requested worktree/i) });
    expect(await listIntegrationChecks(fixture.runtime)).toHaveLength(0);
  }, 120_000);

  it("runs integration fix on aggregate validation failure and applies repaired artifact only after confirmation", async () => {
    const fixture = await prepareApplyFixture("Integration Repair", { changedPath: "a.txt", changedContent: "a\n" });
    const second = await addSkillNativeApplyCandidate({
      fixture,
      changedPath: "integration-validation-fail.txt",
      changedContent: "temporary aggregate failure marker\n",
    });
    const result = await runSkillNativeIntegrationCheck(project(), projectExecutionRuntimePort(project(), fixture.resolution), [{
      changeId: fixture.changeId,
      worktreeId: fixture.worktreeId,
      diffHash: fixture.diffHash,
      diffStat: fixture.diffStat,
      sourceHead: fixture.sourceHead,
      validationRunId: fixture.validationId,
      auditRunId: fixture.auditId,
    }, {
      changeId: fixture.changeId,
      worktreeId: second.worktreeId,
      diffHash: second.diffHash,
      diffStat: second.diffStat,
      sourceHead: second.sourceHead,
      validationRunId: second.validationId,
      auditRunId: second.auditId,
    }], fixture.changeId, {
      repairRunner: async ({ checkoutPath }) => {
        await import("../../src/integration-check/patch-workspace.js").then(({ removeKnownIntegrationFailureMarkers }) => removeKnownIntegrationFailureMarkers(checkoutPath));
        return { repairMode: "deterministic-marker-test", summary: "Removed aggregate failure marker." };
      },
    });
    expect(result.check).toMatchObject({
      status: "passed",
      latestArtifactRef: expect.stringContaining("repaired.patch"),
      aggregateValidation: expect.objectContaining({ status: "passed" }),
      aggregateAudit: expect.objectContaining({ status: "approved" }),
    });
    expect(existsSync(join(getTempDir(), "a.txt"))).toBe(false);
    expect(existsSync(join(getTempDir(), "integration-validation-fail.txt"))).toBe(false);
    const snapshot = await getWorkbenchSnapshot(
      { project: project(), path: getTempDir() },
      { topicId: fixture.conversationId },
    );
    const applyAction = snapshot.right.confirmationQueue.primary?.actions
      .find((action) => action.action?.actionId === "apply-check.apply")?.action;
    if (!applyAction) throw new Error("Missing apply-check.apply action for repaired IntegrationCheck.");
    await executeWorkbenchAction(
      { project: project(), path: getTempDir() },
      { action: applyAction, confirm: true },
    );
    expect((await readFile(join(getTempDir(), "a.txt"), "utf8")).replaceAll("\r\n", "\n")).toBe("a\n");
    expect(existsSync(join(getTempDir(), "integration-validation-fail.txt"))).toBe(false);
  }, 120_000);

  it("classifies source drift as same-demand refresh rework instead of apply", async () => {
    const fixture = await prepareExecutedApplyFixture("Source Drift Demand", { changedContent: "drift\n" });
    await writeFile(join(getTempDir(), "source-drift.txt"), "Project changed after result review.\n", "utf8");
    await git(getTempDir(), ["add", "source-drift.txt"]);
    await git(getTempDir(), ["commit", "-m", "source changed"]);

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: fixture.conversationId });
    expect(snapshot.center.workpad.resultReview?.applyReadiness).toMatchObject({ kind: "source-drift" });
    expect(snapshot.right.decisionInspector.primary?.actions.some((action) => action.actionType === "result.refresh-rework")).toBe(true);
    expect(snapshot.right.decisionInspector.primary?.actions.some((action) => action.action?.actionId === "result.apply")).toBe(false);
  }, 120_000);

  it("classifies dirty source as refresh status without automatic coder rework", async () => {
    const fixture = await prepareExecutedApplyFixture("Dirty Source Demand", { changedContent: "dirty\n" });
    await writeFile(join(getTempDir(), "dirty-source.txt"), "Uncommitted local edit.\n", "utf8");

    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: fixture.conversationId });
    expect(snapshot.center.workpad.resultReview?.applyReadiness).toMatchObject({ kind: "dirty-source" });
    expect(snapshot.right.decisionInspector.primary?.actions.some((action) => action.actionType === "result.refresh-status")).toBe(true);
    expect(snapshot.right.decisionInspector.primary?.actions.some((action) => action.actionType === "result.refresh-rework")).toBe(false);
    expect(snapshot.right.decisionInspector.primary?.actions.some((action) => action.action?.actionId === "result.apply")).toBe(false);
  }, 120_000);

  it("rejects a stale apply action after the worktree diff changes", async () => {
    const fixture = await prepareExecutedApplyFixture("Worktree Diff Drift", { changedContent: "original candidate\n" });
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: fixture.conversationId });
    const action = resultApplyAction(snapshot, fixture.changeId);
    const sourceHead = await getGitCommit(getTempDir());
    const authorization = await readExecutionAuthorization(fixture.resolution.paths, fixture.authorizationId);

    await writeFile(join(fixture.worktreePath, "candidate.txt"), "changed after approval projection\n", "utf8");

    await expect(executeWorkbenchAction(
      { project: project(), path: getTempDir() },
      { action, confirm: true, options: { commit: true, message: "Reject stale diff" } },
    )).rejects.toThrow(/stale|no longer available|diff|validation/i);
    expect(existsSync(join(getTempDir(), "candidate.txt"))).toBe(false);
    expect(await getGitCommit(getTempDir())).toBe(sourceHead);
    expect(await readExecutionAuthorization(fixture.resolution.paths, fixture.authorizationId)).toMatchObject({
      status: "active",
      epoch: authorization.epoch,
      sourceHead: authorization.sourceHead,
    });
    const after = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: fixture.conversationId });
    expect(after.center.workpad.resultReview?.applyReadiness.kind).toBe("stale-validation");
  }, 120_000);

  it("rejects a stale apply action after Validation evidence drifts", async () => {
    const fixture = await prepareExecutedApplyFixture("Validation Evidence Drift", { changedContent: "validation drift\n" });
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: fixture.conversationId });
    const action = resultApplyAction(snapshot, fixture.changeId);
    const sourceHead = await getGitCommit(getTempDir());
    const validationPath = join(fixture.resolution.paths.runsRoot, fixture.validationId, "validation.json");
    const validation = JSON.parse(await readFile(validationPath, "utf8")) as Record<string, unknown>;
    await writeFile(validationPath, `${JSON.stringify({ ...validation, worktreeDiffHash: "0".repeat(64) }, null, 2)}\n`, "utf8");

    await expect(executeWorkbenchAction(
      { project: project(), path: getTempDir() },
      { action, confirm: true, options: { commit: true, message: "Reject stale validation" } },
    )).rejects.toThrow(/stale|no longer available|validation/i);
    expect(existsSync(join(getTempDir(), "candidate.txt"))).toBe(false);
    expect(await getGitCommit(getTempDir())).toBe(sourceHead);
    const after = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: fixture.conversationId });
    expect(after.center.workpad.resultReview?.applyReadiness.kind).toBe("stale-validation");
  }, 120_000);

  it("rejects a stale apply action after Audit evidence drifts", async () => {
    const fixture = await prepareExecutedApplyFixture("Audit Evidence Drift", { changedContent: "audit drift\n" });
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: fixture.conversationId });
    const action = resultApplyAction(snapshot, fixture.changeId);
    const sourceHead = await getGitCommit(getTempDir());
    const auditPath = join(fixture.resolution.paths.runsRoot, fixture.auditId, "audit.json");
    const audit = JSON.parse(await readFile(auditPath, "utf8")) as Record<string, unknown>;
    await writeFile(auditPath, `${JSON.stringify({ ...audit, worktreeDiffHash: "f".repeat(64) }, null, 2)}\n`, "utf8");

    await expect(executeWorkbenchAction(
      { project: project(), path: getTempDir() },
      { action, confirm: true, options: { commit: true, message: "Reject stale audit" } },
    )).rejects.toThrow(/stale|no longer available|audit/i);
    expect(existsSync(join(getTempDir(), "candidate.txt"))).toBe(false);
    expect(await getGitCommit(getTempDir())).toBe(sourceHead);
    const after = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: fixture.conversationId });
    expect(after.center.workpad.resultReview?.applyReadiness.kind).toBe("stale-audit");
  }, 120_000);

  it("keeps authorization, decision, and read model consistent when ApplyTransaction fails before commit", async () => {
    const fixture = await prepareExecutedApplyFixture("Apply Transaction Failure", { changedContent: "must not land\n" });
    const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: fixture.conversationId });
    const action = resultApplyAction(snapshot, fixture.changeId);
    const decisionId = buildWorkbenchApprovalDecisionId(action.actionId, action.args);
    const sourceHead = await getGitCommit(getTempDir());
    const authorizationBefore = await readExecutionAuthorization(fixture.resolution.paths, fixture.authorizationId);

    applyTransactionFailure.beforeCommitPoint = true;
    try {
      await expect(executeWorkbenchAction(
        { project: project(), path: getTempDir() },
        { action, confirm: true, options: { commit: true, message: "Injected failure" } },
      )).rejects.toThrow(/Authorized worktree apply failed/);
    } finally {
      applyTransactionFailure.beforeCommitPoint = false;
    }

    expect(existsSync(join(getTempDir(), "candidate.txt"))).toBe(false);
    expect(await getGitCommit(getTempDir())).toBe(sourceHead);
    const authorizationAfter = await readExecutionAuthorization(fixture.resolution.paths, fixture.authorizationId);
    expect(authorizationAfter).toMatchObject({
      status: "active",
      epoch: authorizationBefore.epoch + 1,
      sourceHead: authorizationBefore.sourceHead,
    });
    expect(authorizationAfter.targets).toEqual(expect.arrayContaining([
      expect.objectContaining({ transition: "source.apply", targetId: fixture.worktreeId }),
    ]));
    expect(await readWorkbenchDecisionStatus(project(), decisionId)).toBe("failed");
    const applyRun = (await listRuns(fixture.resolution.paths)).find((run) => run.runtime === "worktree-apply");
    if (!applyRun) throw new Error("Missing failed ApplyTransaction run.");
    const transaction = JSON.parse(await readFile(
      join(fixture.resolution.paths.runsRoot, applyRun.id, "apply-transaction.json"),
      "utf8",
    )) as { stage: string; blockedReason: string | null; authorization: { operationId: string } };
    expect(transaction).toMatchObject({ stage: "prepared", blockedReason: expect.stringContaining("Injected ApplyTransaction failure") });
    expect(await recoverTransitionExecution(fixture.resolution.paths, transaction.authorization.operationId)).toMatchObject({
      status: "retryable-failed",
      receipt: { consumesAuthorization: false, outcome: "retryable-failed" },
    });
    const after = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: fixture.conversationId });
    expect(after.center.workpad.resultReview).toMatchObject({ status: "ready-to-apply", worktreeId: fixture.worktreeId });
    expect(resultApplyAction(after, fixture.changeId)).toMatchObject({ actionId: "result.apply" });
  }, 120_000);
});

async function prepareApplyFixture(
  title: string,
  options: Partial<Parameters<typeof prepareSkillNativeApplyFixture>[0]> = {},
): Promise<SkillNativeApplyFixture> {
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
    ...options,
  });
}

async function prepareExecutedApplyFixture(
  title: string,
  options: {
    changedPath?: string;
    changedContent?: string;
    auditStatus?: "approved" | "approved-with-notes";
    acceptAudit?: boolean;
  } = {},
) {
  await initGitRepository(getTempDir());
  await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agents/\n.claude/\n", "utf8");
  await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
  await git(getTempDir(), ["add", "."]);
  await git(getTempDir(), ["commit", "-m", "initial"]);
  const fixture = await prepareSkillNativeWorkbenchFixture({ project: project(), ahoHome: process.env.AHO_HOME });
  executionSpec.changedPath = options.changedPath ?? "candidate.txt";
  executionSpec.changedContent = options.changedContent ?? "skill-native candidate\n";
  executionSpec.auditStatus = options.auditStatus ?? "approved";
  const topic = await prepareAcceptedConversation(fixture, title);
  const before = await getWorkbenchSnapshot(
    { project: project(), path: getTempDir() },
    { topicId: topic.conversationId },
  );
  const runAction = before.right.confirmationQueue.primary?.actions
    .find((action) => action.actionType === "workflow.run.start");
  if (!runAction) throw new Error(`Missing workflow.run.start action for ${topic.changeId}.`);
  const started = await executeWorkbenchAction(
    { project: project(), path: getTempDir() },
    { ...runAction, confirm: true },
  );
  const workflowResult = unwrapWorkflowActionResult(started.result) as { status?: string };
  if (workflowResult.status !== "completed") {
    const runs = await listRuns(fixture.runtime);
    const stderr = runs[0]?.artifacts.stderr
      ? await readFile(join(fixture.resolution.paths.sidecarRoot, runs[0].artifacts.stderr), "utf8").catch(() => "")
      : "";
    throw new Error(`Formal workflow did not complete after ${appServerTurn.mock.calls.length} provider calls; stderr=${stderr}; runs=${JSON.stringify(runs)}; result=${JSON.stringify(workflowResult)}`);
  }
  const after = await getWorkbenchSnapshot(
    { project: project(), path: getTempDir() },
    { topicId: topic.conversationId },
  );
  const review = after.center.workpad.resultReview;
  if (!review?.worktreeId) throw new Error(`Formal execution did not produce a result review for ${topic.changeId}.`);
  if (options.acceptAudit !== false) {
    const auditAccept = after.right.confirmationQueue.primary?.actions
      .find((action) => action.action?.actionId === "audit.accept")?.action;
    if (!auditAccept) throw new Error(`Missing audit.accept action for ${topic.changeId}.`);
    await executeWorkbenchAction(
      { project: project(), path: getTempDir() },
      { action: auditAccept, confirm: true },
    );
  }
  const current = await resolveProjectRuntimeState(project(), {
    ahoHome: process.env.AHO_HOME,
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  if (current.state !== "ready") throw new Error(`Expected ready runtime after execution: ${current.state}.`);
  const worktree = await readWorktreeMetadata(projectExecutionRuntimePort(project(), current.resolution), review.worktreeId);
  const evidenceRoot = join(fixture.skillRoot, "state", "changes", "active", topic.changeId);
  const authorizationIntent = JSON.parse(await readFile(
    join(evidenceRoot, "planning", "execution-authorization-intent.json"),
    "utf8",
  )) as { authorizationId?: string };
  if (!authorizationIntent.authorizationId || !review.validation?.id || !review.audit?.id) {
    throw new Error(`Formal execution did not retain exact Apply evidence for ${topic.changeId}.`);
  }
  return {
    project: project(),
    resolution: current.resolution,
    changeId: topic.changeId,
    conversationId: topic.conversationId,
    graphScopeId: topic.graphScopeId,
    evidenceRoot,
    worktreeId: review.worktreeId,
    worktreePath: worktree.checkoutPath,
    validationId: review.validation.id,
    auditId: review.audit.id,
    authorizationId: authorizationIntent.authorizationId,
  };
}

function resultApplyAction(
  snapshot: Awaited<ReturnType<typeof getWorkbenchSnapshot>>,
  changeId: string,
) {
  const action = snapshot.right.decisionInspector.primary?.actions
    .find((item) => item.action?.actionId === "result.apply")?.action;
  if (!action) throw new Error(`Missing result.apply action for ${changeId}.`);
  return action;
}

async function acceptAuditAndGetSnapshot(fixture: { conversationId: string; changeId: string }) {
  let snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: fixture.conversationId });
  const auditAccept = snapshot.right.confirmationQueue.primary?.actions.find((action) => action.action?.actionId === "audit.accept")?.action;
  if (!auditAccept) throw new Error(`Missing audit.accept action for ${fixture.changeId}.`);
  await executeWorkbenchAction({ project: project(), path: getTempDir() }, { action: auditAccept, confirm: true });
  snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: fixture.conversationId });
  return snapshot;
}

async function createReadyDemand(
  fixture: SkillNativeWorkbenchFixture,
  title: string,
  changedPath: string,
  changedContent: string,
) {
  executionSpec.changedPath = changedPath;
  executionSpec.changedContent = changedContent;
  executionSpec.auditStatus = "approved";
  const topic = await prepareAcceptedConversation(fixture, title);
  let snapshot = await getWorkbenchSnapshot(
    { project: project(), path: getTempDir() },
    { topicId: topic.conversationId },
  );
  const runAction = snapshot.right.confirmationQueue.primary?.actions
    .find((action) => action.actionType === "workflow.run.start");
  if (!runAction) throw new Error(`Missing workflow.run.start action for ${topic.changeId}.`);
  await executeWorkbenchAction(
    { project: project(), path: getTempDir() },
    { ...runAction, confirm: true },
  );
  snapshot = await getWorkbenchSnapshot(
    { project: project(), path: getTempDir() },
    { topicId: topic.conversationId },
  );
  const worktreeId = snapshot.center.workpad.resultReview?.worktreeId;
  if (!worktreeId) throw new Error(`Formal execution did not produce a candidate for ${topic.changeId}.`);
  const auditAccept = snapshot.right.confirmationQueue.primary?.actions.find(
    (action) => action.action?.actionId === "audit.accept",
  )?.action;
  if (!auditAccept) throw new Error(`Missing audit.accept action for ${topic.changeId}.`);
  await executeWorkbenchAction(
    { project: project(), path: getTempDir() },
    { action: auditAccept, confirm: true },
  );
  return { topic, candidate: { worktreeId } };
}

async function prepareAcceptedConversation(fixture: SkillNativeWorkbenchFixture, title: string) {
  appServerTurn.mockReset();
  appServerTurn
    .mockImplementationOnce(async (options) => planningTurn(options))
    .mockImplementationOnce(async (options) => acceptanceTurn(options))
    .mockImplementation(async (options) => executeFixtureRoleTurn(options));
  const conversation = await createWorkbenchConversation(project(), {
    body: title,
  });
  const messages = await listConversationMessages(project(), conversation.conversationId);
  const plan = messages.find((message) =>
    message.agentRoleId === "planning-agent" && message.document?.documentKind === "plan");
  if (!plan?.document?.proposalArtifact || !plan.document.proposalHash) {
    throw new Error(`Planning did not publish a proposal for ${title}.`);
  }
  await postConversationMessage(project(), conversation.conversationId, {
    mode: "chat",
    message: "执行当前计划",
    planHandoffIntent: {
      kind: "execute-plan",
      sourceRunId: plan.runId ?? "",
      sourceAgentRoleId: "planning-agent",
      sourceArtifact: plan.document.proposalArtifact,
      sourceDocumentId: plan.document.documentId,
      sourceCanonicalItemId: plan.document.sourceCanonicalItemId,
      sourceProposalHash: plan.document.proposalHash,
      executionMode: "stepwise",
    },
  });
  const store = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
  try {
    const current = store.conversations.readConversation(project().id, conversation.conversationId);
    if (!current?.boundChangeId || !current.currentGraphScopeId) {
      throw new Error(`Main acceptance did not bind Change lineage for ${title}.`);
    }
    return {
      conversationId: conversation.conversationId,
      changeId: current.boundChangeId,
      graphScopeId: current.currentGraphScopeId,
    };
  } finally {
    store.close();
  }
}

async function planningTurn(options: AppServerTurnOptions) {
  const mainThreadId = `thread-main-${options.conversationId}`;
  const plannerThreadId = `thread-planner-${options.conversationId}`;
  const directory = options.writableRoots?.[0] ?? "";
  await writeFile(
    join(directory, "spec.md"),
    `# Spec\n\n## Acceptance Criteria\n\n- AC-001: Produce ${executionSpec.changedPath} through the assigned worktree.\n`,
    "utf8",
  );
  await writeFile(join(directory, "plan.md"), plannerPlanText(), "utf8");
  await writeFile(
    join(directory, "tasks.md"),
    `# Tasks\n\n- [ ] T-001: Produce ${executionSpec.changedPath}.\n  - Covers: AC-001\n`,
    "utf8",
  );
  for (const event of normalizeCodexAppServerNotification("turn/started", { turnId: "turn-plan" }, {
    projectId: project().id,
    conversationId: options.conversationId,
    runId: options.runId,
    threadId: mainThreadId,
    turnId: "turn-plan",
    roleId: "main-agent",
  })) options.onRealtimeEvent?.(event);
  const changedFiles = ["spec.md", "plan.md", "tasks.md"].map((name) => join(directory, name));
  options.onChildLifecycleEvent?.({
    kind: "started",
    activityId: "item-spawn-planner",
    parentThreadId: mainThreadId,
    childThreadId: plannerThreadId,
    roleHint: "planning-agent",
  });
  for (const [method, params] of [
    ["turn/started", { turnId: "turn-planner" }],
    ["item/agentMessage/delta", { itemId: "message-plan", delta: plannerPlanText() }],
    ["turn/completed", { turnId: "turn-planner" }],
  ] as const) {
    for (const event of normalizeCodexAppServerNotification(method, params, {
      projectId: project().id,
      conversationId: options.conversationId,
      runId: options.runId,
      threadId: plannerThreadId,
      parentThreadId: mainThreadId,
      turnId: "turn-planner",
      roleId: "planning-agent",
      displayName: "Newton",
    })) options.onRealtimeEvent?.(event);
  }
  options.onChildThreadResult?.({
    itemId: "item-spawn-planner",
    parentThreadId: mainThreadId,
    threadId: plannerThreadId,
    roleHint: "planning-agent",
    status: "completed",
    displayName: "Newton",
    finalText: plannerPlanText(),
    changedFiles,
    snapshot: {},
  });
  emitMainText(options, "Planning returned an exact proposal.", mainThreadId, "turn-plan", "message-main-plan");
  return {
    status: "completed" as const,
    threadId: mainThreadId,
    turnId: "turn-plan",
    lastMessage: "Planning returned an exact proposal.",
    goal: nativeGoal("active", mainThreadId),
    childThreads: [{
      itemId: "item-spawn-planner",
      parentThreadId: mainThreadId,
      threadId: plannerThreadId,
      roleHint: "planning-agent",
      status: "completed" as const,
      displayName: "Newton",
      finalText: plannerPlanText(),
      changedFiles,
      snapshot: {},
    }],
    changedFiles: [],
  };
}

async function acceptanceTurn(options: AppServerTurnOptions) {
  const mainThreadId = options.existingThreadId ?? `thread-main-${options.conversationId}`;
  const context = JSON.parse(options.additionalContext?.["aho.plan-handoff"]?.value ?? "{}") as {
    sourceProposalHash?: string;
    graphScopeId?: string;
  };
  const result = await options.onDynamicToolCall?.({
    requestId: "request-accept",
    threadId: mainThreadId,
    turnId: "turn-accept",
    callId: "call-accept",
    tool: "aho_accept_current_plan",
    arguments: {
      proposalHash: context.sourceProposalHash,
      graphScopeId: context.graphScopeId,
      contractRequired: false,
      contract: null,
      validation: ["Main Agent verified the fixture source scope against the project Skill and Registry."],
    },
  });
  if (!result?.success) throw new Error(`Main plan acceptance failed: ${JSON.stringify(result)}`);
  emitMainText(options, "Plan accepted; human execution approval is pending.", mainThreadId, "turn-accept", "message-main-accept");
  return {
    status: "completed" as const,
    threadId: mainThreadId,
    turnId: "turn-accept",
    lastMessage: "Plan accepted; human execution approval is pending.",
    goal: nativeGoal("paused", mainThreadId),
    childThreads: [],
    changedFiles: [],
  };
}

function plannerPlanText(): string {
  return [
    "# Plan",
    "",
    "## Approach",
    `Produce ${executionSpec.changedPath} in the assigned worktree and verify it.`,
    "",
    "## Workflow",
    "",
    "```json",
    JSON.stringify({
      version: "1.0",
      mode: "sequential-v1",
      nodes: [{
        id: "fixture-change",
        title: "Produce the apply candidate",
        taskIds: ["T-001"],
        acIds: ["AC-001"],
        prompt: `Objective: Produce ${executionSpec.changedPath}. Required behavior: write only the assigned file. Constraints: preserve canonical source before apply. Expected evidence: passing validation and audit.`,
        dependsOn: [],
        sourceScopes: [executionSpec.changedPath],
      }],
    }, null, 2),
    "```",
    "",
  ].join("\n");
}

function emitMainText(options: AppServerTurnOptions, text: string, threadId: string, turnId: string, itemId: string): void {
  for (const event of normalizeCodexAppServerNotification("item/agentMessage/delta", { itemId, delta: text }, {
    projectId: project().id,
    conversationId: options.conversationId,
    runId: options.runId,
    threadId,
    turnId,
    itemId,
    roleId: "main-agent",
  })) options.onRealtimeEvent?.(event);
}

async function executeFixtureRoleTurn(options: AppServerTurnOptions) {
  if (options.roleId === "coder-agent" || options.roleId === "rework-coder") {
    const target = join(options.cwd, ...executionSpec.changedPath.split("/"));
    await import("node:fs/promises").then(({ mkdir }) => mkdir(join(target, ".."), { recursive: true }));
    await writeFile(target, executionSpec.changedContent, "utf8");
    return completedRoleTurn(options, "Coder completed the accepted fixture task.", [target]);
  }
  if (options.roleId === "auditor-agent") {
    return completedRoleTurn(options, `Status: ${executionSpec.auditStatus}\n\nFinding: Fixture evidence is acceptable.`);
  }
  return completedRoleTurn(options, `${options.roleId} completed.`);
}

function completedRoleTurn(options: AppServerTurnOptions, lastMessage: string, changedFiles: string[] = []) {
  return {
    status: "completed" as const,
    threadId: options.existingThreadId ?? `thread-${options.roleId}-${options.runId}`,
    turnId: `turn-${options.roleId}-${options.runId}`,
    lastMessageItemId: `message-${options.roleId}-${options.runId}`,
    lastMessage,
    childThreads: [],
    changedFiles,
  };
}

function unwrapWorkflowActionResult(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  return (value as Record<string, unknown>).result ?? value;
}

function readyCodexCapabilities() {
  return {
    available: true,
    version: "test",
    approvalFlagPlacement: "exec" as const,
    supportsJson: true,
    supportsSandbox: true,
    supportsCd: true,
    supportsAddDir: true,
    supportsColor: true,
    supportsOutputLastMessage: true,
    supportsSafeResume: true,
    supportsResumeAddDir: true,
    errors: [],
  };
}

function nativeGoal(status: "active" | "paused", threadId = "thread-main") {
  return {
    threadId,
    objective: "Produce the accepted apply candidate with validation and audit evidence.",
    status,
    tokenBudget: null,
    tokensUsed: 10,
    timeUsedSeconds: 1,
    createdAt: 100,
    updatedAt: 101,
  };
}

type AppServerTurnOptions = Parameters<typeof appServerTurn>[0];
