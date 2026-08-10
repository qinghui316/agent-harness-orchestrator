import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { writeJsonFile } from "../../src/fs/json.js";
import { getChangeStatusForChange } from "../../src/change/status.js";
import { git } from "../../src/project/git.js";
import { projectExecutionRuntimePort } from "../../src/project-runtime/execution-ports.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { executeWorkbenchAction as executeWorkbenchActionWithDeps } from "../../src/server/workbench/actions.js";
import { runAllowlistedAction } from "../../src/server/workbench/approval-actions.js";
import { classifySpecTestDiff, composeSpecTestGeneratorPrompt, selectAcsForGeneration } from "../../src/spec-test/generate.js";
import { getSpecTestContextForChange, getSpecTestEvidenceFingerprint, getSpecTestStatus, linkSpecTest, unlinkSpecTest } from "../../src/spec-test/manager.js";
import { acceptSpecTestProposal, parseSpecTestProposalMessage, recoverSpecTestApprovalReceipts, startSpecTestProposalRun } from "../../src/spec-test/proposal.js";
import type { RunWorktreeInfo, SpecTestAcStatus, ValidationResult } from "../../src/types/index.js";
import { openProjectRuntimeWorkbenchDatabase } from "../../src/workbench/persistence/open-workbench-database.js";
import { assertCurrentApprovalAction } from "../../src/workbench/actions/current-approval-revalidation.js";
import { reconcileRecoveredApprovalDecisions } from "../../src/workbench/actions/approval-decision-reconciliation.js";
import { recordWorkbenchDecisionFailureUnlessAccepted, readWorkbenchDecisionStatus } from "../../src/workbench/decisions.js";
import { getWorkbenchSnapshot } from "../../src/workbench/projections/read-model/implementation.js";
import { createWorktreeWithRuntimePort } from "../../src/worktree/creation.js";
import { listWorktreesForChange } from "../../src/worktree/status.js";
import { revokeLocalExecutionAuthorization } from "../../src/workflow-runtime/execution-authorization.js";
import { prepareSkillNativeSpecTestFixture, type SkillNativeSpecTestFixture } from "../helpers/skill-native-spec-test-fixture.js";

const providerRequire = vi.hoisted(() => vi.fn());
const providerAttemptRollbackFailure = vi.hoisted(() => ({ error: null as Error | null }));

vi.mock("../../src/provider-runtime/index.js", async (importOriginal) => ({
  ...await importOriginal<typeof import("../../src/provider-runtime/index.js")>(),
  defaultProviderRegistry: {
    require: providerRequire,
  },
}));

vi.mock("../../src/workbench/provider-attempts.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/workbench/provider-attempts.js")>();
  return {
    ...actual,
    rollbackProviderAttempt: async (...args: Parameters<typeof actual.rollbackProviderAttempt>) => {
      if (providerAttemptRollbackFailure.error) throw providerAttemptRollbackFailure.error;
      return actual.rollbackProviderAttempt(...args);
    },
  };
});

let tempDir: string;
let previousAhoHome: string | undefined;
let fixture: SkillNativeSpecTestFixture;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-skill-native-spec-test-"));
  previousAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(tempDir, "aho-home");
  const projectRoot = join(tempDir, "project");
  await mkdir(join(projectRoot, "tests"), { recursive: true });
  await writeFile(join(projectRoot, ".gitignore"), ".agents/\n.claude/\n", "utf8");
  await writeFile(join(projectRoot, "tests", "existing.test.js"), "test('existing', () => {});\n", "utf8");
  await initGitRepository(projectRoot);
  await git(projectRoot, ["add", "."]);
  await git(projectRoot, ["commit", "-m", "initial"]);
  fixture = await prepareSkillNativeSpecTestFixture({
    projectRoot,
    ahoHome: process.env.AHO_HOME,
    projectId: `spec-test-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
  });
  providerRequire.mockReset();
  providerRequire.mockRejectedValue(new Error("Provider capability unavailable."));
  providerAttemptRollbackFailure.error = null;
});

afterEach(async () => {
  vi.useRealTimers();
  process.env.AHO_HOME = previousAhoHome;
  await rm(tempDir, { recursive: true, force: true });
});

describe("Skill-native Spec-Test ownership", () => {
  it("reads AC facts from the physical project Skill and writes mapping only there", async () => {
    const initial = await getSpecTestStatus(fixture.project, { changeId: fixture.changeId });
    expect(initial.acceptanceCriteria.map((item) => item.acId)).toEqual(["AC-001", "AC-002"]);
    expect(initial.mappings).toEqual([]);

    await linkSpecTest(fixture.project, { ac: "AC-001", file: "tests/existing.test.js", command: "test" });
    const stored = JSON.parse(await readFile(join(fixture.evidenceRoot, "spec-tests.json"), "utf8"));
    expect(stored).toMatchObject({
      changeId: fixture.changeId,
      mappings: [{ acId: "AC-001", refs: expect.arrayContaining([
        { type: "file", path: "tests/existing.test.js" },
        { type: "command", commandName: "test" },
      ]) }],
    });
    await expect(readFile(join(fixture.project.path, ".agent-harness", "spec-tests.json"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
  });

  it("dedupes, unlinks, and rejects unsafe or unknown mapping input", async () => {
    await linkSpecTest(fixture.project, { ac: "AC-001", command: "test" });
    await linkSpecTest(fixture.project, { ac: "AC-001", command: "test" });
    expect((await getSpecTestStatus(fixture.project, { changeId: fixture.changeId })).mappings[0]?.refs).toHaveLength(1);
    await unlinkSpecTest(fixture.project, { ac: "AC-001", command: "test" });
    expect((await getSpecTestStatus(fixture.project, { changeId: fixture.changeId })).mappings).toEqual([]);
    await expect(linkSpecTest(fixture.project, { ac: "AC-999", command: "test" })).rejects.toThrow("Unknown Acceptance Criterion");
    await expect(linkSpecTest(fixture.project, { ac: "AC-001", file: "../outside.test.js" })).rejects.toThrow("must not escape");
    await expect(linkSpecTest(fixture.project, { ac: "AC-001", file: join(tempDir, "absolute.test.js") })).rejects.toThrow("repo-relative");
  });

  it("selects the exact Change-bound Conversation and graph in a multi-Conversation sidecar", async () => {
    const database = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
    try {
      database.conversations.createConversation({
        projectId: fixture.project.id,
        conversationId: "unrelated-conversation",
        productMode: "harness",
        title: "Unrelated",
        state: "active",
        boundChangeId: null,
        currentGraphScopeId: "graph:unrelated",
        selectedProviderId: "other-provider",
        completedTurnSequence: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        deletedAt: null,
      });
    } finally {
      database.close();
    }
    const context = await getSpecTestContextForChange(fixture.project, fixture.changeId);
    expect(context).toMatchObject({
      projectId: fixture.project.id,
      changeId: fixture.changeId,
      conversationId: fixture.conversationId,
      graphScopeId: fixture.graphScopeId,
    });
  });

  it("projects selected-topic status and drift from Skill-native facts", async () => {
    await linkSpecTest(fixture.project, { ac: "AC-001", file: "tests/existing.test.js" });
    const snapshot = await getWorkbenchSnapshot(
      { project: fixture.project, path: fixture.project.path },
      { topicId: fixture.conversationId },
    );
    expect(snapshot.center.selectedTopic).toMatchObject({
      id: fixture.conversationId,
      boundChangeId: fixture.changeId,
      graphScopeId: fixture.graphScopeId,
      specTest: { changeId: fixture.changeId },
      drift: { changeId: fixture.changeId },
    });
  });

  it("keeps Skill-native Spec-Test warnings in the Change close gate", async () => {
    const status = await getChangeStatusForChange(fixture.project, fixture.changeId);
    expect(status.specTest).toMatchObject({ changeId: fixture.changeId });
    expect(status.closeGate.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining("AC-001 has no linked test evidence"),
      expect.stringContaining("AC-002 has no linked test evidence"),
    ]));
  });

  it("runs proposer through the formal Workbench action as read-only and binds Provider evidence", async () => {
    const runTurn = vi.fn(async () => {
      expect(await readAttempts()).toEqual(expect.arrayContaining([
        expect.objectContaining({
          roleId: "spec-test-proposer",
          status: "running",
          parentAgentSurfaceId: "main-agent",
          nativeSessionId: null,
        }),
      ]));
      return {
      providerId: "codex",
      status: "completed" as const,
      session: { providerId: "codex", sessionId: "proposal-session" },
      turnId: "proposal-turn",
      lastMessage: JSON.stringify({
        status: "proposed",
        evidence: [{
          refId: "ev-001",
          acId: "AC-001",
          source: "source-root",
          kind: "existingEvidence",
          refs: [{ type: "file", path: "tests/existing.test.js" }],
          rationale: "Existing exact test evidence.",
        }],
        warnings: [],
      }),
      childThreads: [],
      changedFiles: [],
      };
    });
    providerRequire.mockResolvedValue(providerDescriptor(runTurn));
    const sourceBefore = await git(fixture.project.path, ["status", "--short"]);
    const evidenceFingerprint = await getSpecTestEvidenceFingerprint(fixture.project, fixture.changeId);
    const result = await executeWorkbenchAction(
      { project: fixture.project, path: fixture.project.path },
      {
        actionType: "spec-test.propose",
        changeId: fixture.changeId,
        graphScopeId: fixture.graphScopeId,
        specTestEvidenceFingerprint: evidenceFingerprint,
        confirm: true,
      },
    );

    expect(providerRequire).toHaveBeenCalledWith("codex", "auditor", "harness", fixture.project, fixture.project.path);
    expect(runTurn).toHaveBeenCalledWith(expect.objectContaining({
      projectId: fixture.project.id,
      conversationId: fixture.conversationId,
      graphScopeId: fixture.graphScopeId,
      changeId: fixture.changeId,
      roleId: "spec-test-proposer",
      sandboxPolicy: "read-only",
      writableRoots: [],
      skillInputs: [expect.objectContaining({ id: `${fixture.project.id}-harness`, source: "project-harness", required: true })],
    }));
    expect(await git(fixture.project.path, ["status", "--short"])).toBe(sourceBefore);
    expect(result.result).toMatchObject({ status: "completed", error: undefined });
    const attempts = await readAttempts();
    expect(attempts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        conversationId: fixture.conversationId,
        graphScopeId: fixture.graphScopeId,
        changeId: fixture.changeId,
        roleId: "spec-test-proposer",
        status: "completed",
      }),
    ]));
    expect(await readThreads()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        roleId: "spec-test-proposer",
        parentThreadId: null,
        parentAgentSurfaceId: "main-agent",
      }),
    ]));
  });

  it("accepts a proposal only through the current human approval and publishes atomically", async () => {
    providerRequire.mockResolvedValue(providerDescriptor(vi.fn(async () => ({
      providerId: "codex",
      status: "completed" as const,
      session: { providerId: "codex", sessionId: "proposal-session" },
      turnId: "proposal-turn",
      lastMessage: JSON.stringify({
        status: "proposed",
        evidence: [{
          refId: "ev-001",
          acId: "AC-001",
          source: "source-root",
          kind: "existingEvidence",
          refs: [{ type: "file", path: "tests/existing.test.js" }],
          rationale: "Existing exact test evidence.",
        }],
        warnings: [],
      }),
      childThreads: [],
      changedFiles: [],
    }))));
    await runSpecTestAction("spec-test.propose");
    const snapshot = await getWorkbenchSnapshot(
      { project: fixture.project, path: fixture.project.path },
      { topicId: fixture.conversationId },
    );
    const approval = snapshot.right.approvals.find((item) => item.kind === "spec-test-proposal")?.action;
    expect(approval).toMatchObject({
      actionId: "spec-test.proposal.accept-all-existing",
      requiresConfirmation: true,
      scope: {
        projectId: fixture.project.id,
        changeId: fixture.changeId,
        conversationId: fixture.conversationId,
        graphScopeId: fixture.graphScopeId,
      },
    });
    if (!approval) throw new Error("Expected Spec-Test approval action.");
    await executeWorkbenchAction(
      { project: fixture.project, path: fixture.project.path },
      { action: approval, confirm: true },
    );
    expect((await getSpecTestStatus(fixture.project, { changeId: fixture.changeId })).mappings)
      .toEqual([{ acId: "AC-001", refs: [{ type: "file", path: "tests/existing.test.js" }] }]);
  });

  it("recovers an accepted mapping when Workbench decision persistence fails", async () => {
    providerRequire.mockResolvedValue(providerDescriptor(vi.fn(async () => ({
      providerId: "codex",
      status: "completed" as const,
      session: { providerId: "codex", sessionId: "recovery-proposal-session" },
      turnId: "recovery-proposal-turn",
      lastMessage: JSON.stringify({
        status: "proposed",
        evidence: [{
          refId: "ev-recovery",
          acId: "AC-001",
          source: "source-root",
          kind: "existingEvidence",
          refs: [{ type: "file", path: "tests/existing.test.js" }],
          rationale: "Recoverable exact evidence.",
        }],
        warnings: [],
      }),
      childThreads: [],
      changedFiles: [],
    }))));
    await runSpecTestAction("spec-test.propose");
    const snapshot = await getWorkbenchSnapshot(
      { project: fixture.project, path: fixture.project.path },
      { topicId: fixture.conversationId },
    );
    const approval = snapshot.right.approvals.find((item) => item.kind === "spec-test-proposal")?.action;
    if (!approval) throw new Error("Expected recoverable Spec-Test approval action.");
    const recordAcceptedDecision = vi.fn(async () => {
      throw new Error("injected decision persistence failure");
    });
    await executeWorkbenchActionWithDeps(
      { project: fixture.project, path: fixture.project.path },
      { action: approval, confirm: true },
      {
        assertCurrentAction: assertCurrentApprovalAction,
        runAction: runAllowlistedAction,
        recordAcceptedDecision,
        recordFailureDecision: recordWorkbenchDecisionFailureUnlessAccepted,
      },
    );
    expect(recordAcceptedDecision).toHaveBeenCalledTimes(2);
    expect((await getSpecTestStatus(fixture.project, { changeId: fixture.changeId })).mappings).toHaveLength(1);
    const decisionId = `approval:${approval.actionId}:${approval.args.join(":")}`;
    expect(await readWorkbenchDecisionStatus(fixture.project, decisionId)).not.toBe("accepted");

    await recoverSpecTestApprovalReceipts(fixture.project, (receipt) => (
      reconcileRecoveredApprovalDecisions(fixture.project, [receipt])
    ));
    expect(await readWorkbenchDecisionStatus(fixture.project, decisionId)).toBe("accepted");
    expect((await recoverSpecTestApprovalReceipts(fixture.project, async () => undefined))).toEqual([]);
  });

  it("removes an expired authorization approval and rejects its stale acceptance action", async () => {
    providerRequire.mockResolvedValue(providerDescriptor(vi.fn(async () => ({
      providerId: "codex",
      status: "completed" as const,
      session: { providerId: "codex", sessionId: "expiring-proposal-session" },
      turnId: "expiring-proposal-turn",
      lastMessage: JSON.stringify({
        status: "proposed",
        evidence: [{
          refId: "ev-expiring",
          acId: "AC-001",
          source: "source-root",
          kind: "existingEvidence",
          refs: [{ type: "file", path: "tests/existing.test.js" }],
          rationale: "Exact evidence before authorization expiry.",
        }],
        warnings: [],
      }),
      childThreads: [],
      changedFiles: [],
    }))));
    await runSpecTestAction("spec-test.propose");
    const beforeExpiry = await getWorkbenchSnapshot(
      { project: fixture.project, path: fixture.project.path },
      { topicId: fixture.conversationId },
    );
    const approval = beforeExpiry.right.approvals.find((item) => item.kind === "spec-test-proposal")?.action;
    if (!approval) throw new Error("Expected a Spec-Test approval before authorization expiry.");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(Date.now() + 2 * 60 * 60_000));
    const expired = await getWorkbenchSnapshot(
      { project: fixture.project, path: fixture.project.path },
      { topicId: fixture.conversationId },
    );
    expect(expired.right.approvals.some((item) => item.kind === "spec-test-proposal")).toBe(false);
    await expect(executeWorkbenchAction(
      { project: fixture.project, path: fixture.project.path },
      { action: approval, confirm: true },
    )).rejects.toThrow("stale or no longer available");
  });

  it("revalidates authorization inside proposal publication before mutating mappings", async () => {
    providerRequire.mockResolvedValue(providerDescriptor(vi.fn(async () => ({
      providerId: "codex",
      status: "completed" as const,
      session: { providerId: "codex", sessionId: "revoked-acceptance-session" },
      turnId: "revoked-acceptance-turn",
      lastMessage: JSON.stringify({
        status: "proposed",
        evidence: [{
          refId: "ev-revoked-acceptance",
          acId: "AC-001",
          source: "source-root",
          kind: "existingEvidence",
          refs: [{ type: "file", path: "tests/existing.test.js" }],
          rationale: "Exact evidence before authorization revocation.",
        }],
        warnings: [],
      }),
      childThreads: [],
      changedFiles: [],
    }))));
    await runSpecTestAction("spec-test.propose");
    const snapshot = await getWorkbenchSnapshot(
      { project: fixture.project, path: fixture.project.path },
      { topicId: fixture.conversationId },
    );
    const approval = snapshot.right.approvals.find((item) => item.kind === "spec-test-proposal")?.action;
    if (!approval?.scope) throw new Error("Expected a scoped Spec-Test approval action.");
    const proposalId = approval.args[3];
    if (!proposalId) throw new Error("Expected a Spec-Test proposal id.");

    await revokeLocalExecutionAuthorization(
      projectExecutionRuntimePort(fixture.project, fixture.resolution),
      fixture.authorizationId,
      "Fixture revoked immediately before publication.",
    );

    await expect(acceptSpecTestProposal(fixture.project, proposalId, {
      allExisting: true,
      scope: approval.scope,
    })).rejects.toThrow("execution authorization is not active");
    expect((await getSpecTestStatus(fixture.project, { changeId: fixture.changeId })).mappings).toEqual([]);
  });

  it("fails stale graph or evidence actions before Run, ProviderAttempt, or worktree mutation", async () => {
    const fingerprint = await getSpecTestEvidenceFingerprint(fixture.project, fixture.changeId);
    await writeFile(join(fixture.project.path, "source-drift.txt"), "drift\n", "utf8");
    const beforeRuns = await listRunDirectories();
    const beforeAttempts = await readAttempts();
    const beforeWorktrees = await listWorktreesForChange(
      { ...fixture.resolution.paths, projectId: fixture.project.id, projectRoot: fixture.project.path },
      fixture.changeId,
    );
    const staleEvidenceResult = await executeWorkbenchAction(
      { project: fixture.project, path: fixture.project.path },
      {
        actionType: "spec-test.generate",
        changeId: fixture.changeId,
        graphScopeId: fixture.graphScopeId,
        specTestEvidenceFingerprint: fingerprint,
        specTestMissing: true,
        confirm: true,
      },
    );
    expect(staleEvidenceResult.result).toMatchObject({
      status: "failed",
      error: expect.stringContaining("evidence or source scope is stale"),
    });
    const staleGraphResult = await executeWorkbenchAction(
      { project: fixture.project, path: fixture.project.path },
      {
        actionType: "spec-test.drift",
        changeId: fixture.changeId,
        graphScopeId: "graph:wrong",
        specTestEvidenceFingerprint: await getSpecTestEvidenceFingerprint(fixture.project, fixture.changeId),
        confirm: true,
      },
    );
    expect(staleGraphResult.result).toMatchObject({
      status: "failed",
      error: expect.stringContaining("Conversation or graph scope is stale"),
    });
    expect(await listRunDirectories()).toEqual(beforeRuns);
    expect(await readAttempts()).toEqual(beforeAttempts);
    expect(await listWorktreesForChange(
      { ...fixture.resolution.paths, projectId: fixture.project.id, projectRoot: fixture.project.path },
      fixture.changeId,
    )).toEqual(beforeWorktrees);
  });

  it("invalidates an action when an already-untracked source changes content again", async () => {
    const path = join(fixture.project.path, "same-status-drift.txt");
    await writeFile(path, "first\n", "utf8");
    const fingerprint = await getSpecTestEvidenceFingerprint(fixture.project, fixture.changeId);
    await writeFile(path, "second\n", "utf8");
    const result = await executeWorkbenchAction(
      { project: fixture.project, path: fixture.project.path },
      {
        actionType: "spec-test.drift",
        changeId: fixture.changeId,
        graphScopeId: fixture.graphScopeId,
        specTestEvidenceFingerprint: fingerprint,
        confirm: true,
      },
    );
    expect(result.result).toMatchObject({
      status: "failed",
      error: expect.stringContaining("evidence or source scope is stale"),
    });
  });

  it("consumes an exact Spec-Test action fingerprint and rejects repeated use without new execution state", async () => {
    const runTurn = vi.fn(async () => ({
      providerId: "codex",
      status: "completed" as const,
      session: { providerId: "codex", sessionId: "single-use-proposal-session" },
      turnId: "single-use-proposal-turn",
      lastMessage: JSON.stringify({ status: "proposed", evidence: [], warnings: [] }),
      childThreads: [],
      changedFiles: [],
    }));
    providerRequire.mockResolvedValue(providerDescriptor(runTurn));
    const request = {
      actionType: "spec-test.propose" as const,
      changeId: fixture.changeId,
      graphScopeId: fixture.graphScopeId,
      specTestEvidenceFingerprint: await getSpecTestEvidenceFingerprint(fixture.project, fixture.changeId),
      confirm: true,
    };
    const first = await executeWorkbenchAction(
      { project: fixture.project, path: fixture.project.path },
      request,
    );
    expect(first.result).toMatchObject({ status: "completed" });
    const afterFirstRuns = await listRunDirectories();
    const afterFirstAttempts = await readAttempts();
    const repeated = await executeWorkbenchAction(
      { project: fixture.project, path: fixture.project.path },
      request,
    );
    expect(repeated.result).toMatchObject({
      status: "failed",
      error: expect.stringContaining("evidence or source scope is stale"),
    });
    expect(runTurn).toHaveBeenCalledTimes(1);
    expect(await listRunDirectories()).toEqual(afterFirstRuns);
    expect(await readAttempts()).toEqual(afterFirstAttempts);
  });

  it("rejects blocked authorization and a worktree owned by another Change before proposer state is written", async () => {
    const otherWorktree = await createWorktreeWithRuntimePort(
      fixture.project,
      projectExecutionRuntimePort(fixture.project, fixture.resolution),
      "other-change",
    );
    const beforeWrongWorktreeRuns = await listRunDirectories();
    const beforeWrongWorktreeAttempts = await readAttempts();
    const wrongWorktree = await executeWorkbenchAction(
      { project: fixture.project, path: fixture.project.path },
      {
        actionType: "spec-test.propose",
        changeId: fixture.changeId,
        graphScopeId: fixture.graphScopeId,
        worktreeId: otherWorktree.metadata.worktreeId,
        specTestEvidenceFingerprint: await getSpecTestEvidenceFingerprint(fixture.project, fixture.changeId),
        confirm: true,
      },
    );
    expect(wrongWorktree.result).toMatchObject({
      status: "failed",
      error: expect.stringContaining("belongs to change other-change"),
    });
    expect(await listRunDirectories()).toEqual(beforeWrongWorktreeRuns);
    expect(await readAttempts()).toEqual(beforeWrongWorktreeAttempts);

    const intentPath = join(fixture.evidenceRoot, "planning", "execution-authorization-intent.json");
    const intent = JSON.parse(await readFile(intentPath, "utf8"));
    await writeJsonFile(intentPath, {
      ...intent,
      status: "blocked",
      authorizationId: null,
      projectHarnessContentFingerprint: null,
      startManifestHash: null,
      reason: "Fixture authorization revoked.",
      updatedAt: new Date().toISOString(),
    });
    const beforeBlockedRuns = await listRunDirectories();
    const beforeBlockedAttempts = await readAttempts();
    const blocked = await executeWorkbenchAction(
      { project: fixture.project, path: fixture.project.path },
      {
        actionType: "spec-test.generate",
        changeId: fixture.changeId,
        graphScopeId: fixture.graphScopeId,
        specTestEvidenceFingerprint: await getSpecTestEvidenceFingerprint(fixture.project, fixture.changeId),
        specTestMissing: true,
        confirm: true,
      },
    );
    expect(blocked.result).toMatchObject({
      status: "failed",
      error: expect.stringContaining("execution authorization is not active"),
    });
    expect(await listRunDirectories()).toEqual(beforeBlockedRuns);
    expect(await readAttempts()).toEqual(beforeBlockedAttempts);
  });

  it("rejects a revoked sidecar execution authorization before any Spec-Test mutation", async () => {
    await revokeLocalExecutionAuthorization(
      projectExecutionRuntimePort(fixture.project, fixture.resolution),
      fixture.authorizationId,
      "Fixture revoked before Spec-Test action.",
    );
    const beforeRuns = await listRunDirectories();
    const beforeAttempts = await readAttempts();
    const result = await runSpecTestAction("spec-test.generate", { specTestMissing: true });
    expect(result.result).toMatchObject({
      status: "failed",
      error: expect.stringContaining("execution authorization is not active"),
    });
    expect(await listRunDirectories()).toEqual(beforeRuns);
    expect(await readAttempts()).toEqual(beforeAttempts);
  });

  it("rolls back proposer state when Provider is unavailable, throws, or returns invalid output", async () => {
    const beforeRuns = await listRunDirectories();
    const beforeAttempts = await readAttempts();
    const unavailable = await runSpecTestAction("spec-test.propose");
    expect(unavailable.result).toMatchObject({ status: "failed", error: expect.stringContaining("Provider capability unavailable") });
    expect(await listRunDirectories()).toEqual(beforeRuns);
    expect(await readAttempts()).toEqual(beforeAttempts);

    providerRequire.mockResolvedValue(providerDescriptor(vi.fn(async () => {
      throw new Error("injected proposer turn failure");
    })));
    const thrown = await runSpecTestAction("spec-test.propose");
    expect(thrown.result).toMatchObject({ status: "failed", error: expect.stringContaining("injected proposer turn failure") });
    expect(await listRunDirectories()).toEqual(beforeRuns);
    expect(await readAttempts()).toEqual(beforeAttempts);

    providerRequire.mockResolvedValue(providerDescriptor(vi.fn(async () => ({
      providerId: "codex",
      status: "completed" as const,
      session: { providerId: "codex", sessionId: "invalid-proposal-session" },
      turnId: "invalid-proposal-turn",
      lastMessage: "Status: proposed",
      childThreads: [],
      changedFiles: [],
    }))));
    const invalid = await runSpecTestAction("spec-test.propose");
    expect(invalid.result).toMatchObject({ status: "failed", error: expect.stringContaining("parseable JSON") });
    expect(await listRunDirectories()).toEqual(beforeRuns);
    expect(await readAttempts()).toEqual(beforeAttempts);
  });

  it("retains paired Run and ProviderAttempt evidence when proposer cleanup itself fails", async () => {
    providerRequire.mockResolvedValue(providerDescriptor(vi.fn(async () => ({
      providerId: "codex",
      status: "completed" as const,
      session: { providerId: "codex", sessionId: "cleanup-failure-session" },
      turnId: "cleanup-failure-turn",
      lastMessage: "invalid proposer output",
      childThreads: [],
      changedFiles: [],
    }))));
    providerAttemptRollbackFailure.error = new Error("injected ProviderAttempt rollback failure");
    const beforeRuns = await listRunDirectories();
    const beforeAttempts = await readAttempts();

    let caught: unknown;
    try {
      await startSpecTestProposalRun(fixture.project, { changeId: fixture.changeId });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(AggregateError);
    expect((caught as AggregateError).message).toContain("evidence were retained for recovery");
    expect((caught as AggregateError).errors).toEqual([
      expect.objectContaining({ message: expect.stringContaining("did not include parseable JSON") }),
      expect.objectContaining({ message: "injected ProviderAttempt rollback failure" }),
    ]);
    const afterRuns = await listRunDirectories();
    const afterAttempts = await readAttempts();
    expect(afterRuns).toHaveLength(beforeRuns.length + 1);
    expect(afterAttempts).toHaveLength(beforeAttempts.length + 1);
    expect(afterAttempts.at(-1)).toMatchObject({
      attemptId: afterRuns.find((runId) => !beforeRuns.includes(runId)),
      roleId: "spec-test-proposer",
      status: "running",
    });
  });

  it("runs generator through the formal action and limits writes to the assigned test worktree", async () => {
    const runTurn = vi.fn(async (request: { cwd: string }) => {
      expect(await readAttempts()).toEqual(expect.arrayContaining([
        expect.objectContaining({
          roleId: "spec-test-generator",
          status: "running",
          parentAgentSurfaceId: "main-agent",
          nativeSessionId: null,
        }),
      ]));
      await writeFile(join(request.cwd, "tests", "generated.test.js"), "test('generated', () => {});\n", "utf8");
      return {
        providerId: "codex",
        status: "completed" as const,
        session: { providerId: "codex", sessionId: "generator-session" },
        turnId: "generator-turn",
        lastMessage: "Generated test-only evidence.",
        childThreads: [],
        changedFiles: ["tests/generated.test.js"],
      };
    });
    providerRequire.mockResolvedValue(providerDescriptor(runTurn));
    const result = await runSpecTestAction("spec-test.generate", { specTestMissing: true });
    expect(result.result).toMatchObject({ status: "completed", error: undefined });
    expect(runTurn).toHaveBeenCalledWith(expect.objectContaining({
      projectId: fixture.project.id,
      conversationId: fixture.conversationId,
      graphScopeId: fixture.graphScopeId,
      changeId: fixture.changeId,
      roleId: "spec-test-generator",
      sandboxPolicy: "workspace-write",
      writableRoots: [expect.stringContaining("checkouts")],
    }));
    const worktrees = await listWorktreesForChange(
      { ...fixture.resolution.paths, projectId: fixture.project.id, projectRoot: fixture.project.path },
      fixture.changeId,
    );
    expect(worktrees).toHaveLength(1);
    expect(await readFile(join(worktrees[0]!.checkoutPath, "tests", "generated.test.js"), "utf8"))
      .toContain("generated");
    await expect(readFile(join(fixture.project.path, "tests", "generated.test.js"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect(await readThreads()).toEqual(expect.arrayContaining([
      expect.objectContaining({
        roleId: "spec-test-generator",
        parentThreadId: null,
        parentAgentSurfaceId: "main-agent",
      }),
    ]));
  }, 60_000);

  it("fails a generator that writes non-test files without mutating the source project", async () => {
    const beforeRuns = await listRunDirectories();
    const beforeAttempts = await readAttempts();
    providerRequire.mockResolvedValue(providerDescriptor(vi.fn(async (request: { cwd: string }) => {
      await mkdir(join(request.cwd, "src"), { recursive: true });
      await writeFile(join(request.cwd, "src", "forbidden.ts"), "export const forbidden = true;\n", "utf8");
      return {
        providerId: "codex",
        status: "completed" as const,
        session: { providerId: "codex", sessionId: "non-test-session" },
        turnId: "non-test-turn",
        lastMessage: "Generated a non-test file.",
        childThreads: [],
        changedFiles: ["src/forbidden.ts"],
      };
    })));
    const result = await runSpecTestAction("spec-test.generate", { specTestMissing: true });
    expect(result.result).toMatchObject({
      status: "failed",
      error: expect.stringContaining("non-test changes"),
    });
    await expect(readFile(join(fixture.project.path, "src", "forbidden.ts"), "utf8"))
      .rejects.toMatchObject({ code: "ENOENT" });
    expect(await listRunDirectories()).toEqual(beforeRuns);
    expect(await readAttempts()).toEqual(beforeAttempts);
    expect(await listWorktreesForChange(
      { ...fixture.resolution.paths, projectId: fixture.project.id, projectRoot: fixture.project.path },
      fixture.changeId,
    )).toEqual([]);
  }, 60_000);

  it("rolls back generator state when Provider is unavailable or throws", async () => {
    const beforeRuns = await listRunDirectories();
    const beforeAttempts = await readAttempts();
    const unavailable = await runSpecTestAction("spec-test.generate", { specTestMissing: true });
    expect(unavailable.result).toMatchObject({ status: "failed", error: expect.stringContaining("Provider capability unavailable") });
    expect(await listRunDirectories()).toEqual(beforeRuns);
    expect(await readAttempts()).toEqual(beforeAttempts);

    providerRequire.mockResolvedValue(providerDescriptor(vi.fn(async () => {
      throw new Error("injected generator turn failure");
    })));
    const thrown = await runSpecTestAction("spec-test.generate", { specTestMissing: true });
    expect(thrown.result).toMatchObject({ status: "failed", error: expect.stringContaining("injected generator turn failure") });
    expect(await listRunDirectories()).toEqual(beforeRuns);
    expect(await readAttempts()).toEqual(beforeAttempts);
    expect(await listWorktreesForChange(
      { ...fixture.resolution.paths, projectId: fixture.project.id, projectRoot: fixture.project.path },
      fixture.changeId,
    )).toEqual([]);
  }, 60_000);

  it("rolls back proposal acceptance when one candidate has an unknown Acceptance Criterion", async () => {
    providerRequire.mockResolvedValue(providerDescriptor(vi.fn(async () => ({
      providerId: "codex",
      status: "completed" as const,
      session: { providerId: "codex", sessionId: "rollback-proposal-session" },
      turnId: "rollback-proposal-turn",
      lastMessage: JSON.stringify({
        status: "proposed",
        evidence: [
          { refId: "valid", acId: "AC-001", source: "source-root", kind: "existingEvidence", refs: [{ type: "file", path: "tests/existing.test.js" }], rationale: "Valid." },
          { refId: "invalid", acId: "AC-999", source: "source-root", kind: "existingEvidence", refs: [{ type: "file", path: "tests/existing.test.js" }], rationale: "Unknown AC." },
        ],
        warnings: [],
      }),
      childThreads: [],
      changedFiles: [],
    }))));
    await runSpecTestAction("spec-test.propose");
    const snapshot = await getWorkbenchSnapshot(
      { project: fixture.project, path: fixture.project.path },
      { topicId: fixture.conversationId },
    );
    const approval = snapshot.right.approvals.find((item) => item.kind === "spec-test-proposal")?.action;
    if (!approval) throw new Error("Expected rollback proposal approval action.");
    await expect(executeWorkbenchAction(
      { project: fixture.project, path: fixture.project.path },
      { action: approval, confirm: true },
    )).rejects.toThrow("Unknown Acceptance Criterion");
    expect((await getSpecTestStatus(fixture.project, { changeId: fixture.changeId })).mappings).toEqual([]);
  });

  it("joins exact Validation command evidence without changing Validation/Audit ownership", async () => {
    await linkSpecTest(fixture.project, { ac: "AC-001", command: "test" });
    await writeValidation("validation-spec-test", "passed");
    const status = await getSpecTestStatus(fixture.project, { changeId: fixture.changeId });
    expect(status.acceptanceCriteria[0]).toMatchObject({
      latestValidationStatus: "passed",
      confidence: "validation-passed",
      commandEvidence: [{ commandName: "test", validationStatus: "passed" }],
    });
  });
});

describe("Spec-Test pure Agent contracts", () => {
  it("parses structured proposer output without natural-language inference", () => {
    const result = parseSpecTestProposalMessage(JSON.stringify({
      status: "proposed",
      evidence: [{
        refId: "ev-001",
        acId: "AC-001",
        source: "source-root",
        kind: "existingEvidence",
        refs: [{ type: "file", path: "tests/existing.test.js" }],
        rationale: "Existing test evidence.",
      }],
      warnings: [],
    }));
    expect(result).toMatchObject({ status: "proposed", evidence: [{ refId: "ev-001", acId: "AC-001" }] });
    expect(parseSpecTestProposalMessage("This plan mentions tests but is not JSON.")).toMatchObject({ status: "failed" });
    expect(parseSpecTestProposalMessage("Status: proposed")).toMatchObject({ status: "failed", evidence: [] });
  });

  it("enforces generator selection and test-only diff policy", () => {
    const statuses: SpecTestAcStatus[] = [acStatus("AC-001", false, "none"), acStatus("AC-002", true, "linked-only")];
    expect(selectAcsForGeneration(statuses, { missing: true })).toEqual(["AC-001"]);
    expect(() => selectAcsForGeneration(statuses, { acIds: ["AC-999"] })).toThrow("Unknown Acceptance Criterion");
    expect(classifySpecTestDiff([
      "diff --git a/tests/new.test.ts b/tests/new.test.ts",
      "diff --git a/src/product.ts b/src/product.ts",
    ].join("\n"))).toEqual({
      files: ["src/product.ts", "tests/new.test.ts"],
      allowed: ["tests/new.test.ts"],
      rejected: ["src/product.ts"],
    });
  });

  it("keeps the generator prompt bounded to the assigned worktree", async () => {
    const worktree: RunWorktreeInfo = {
      worktreeId: "wt-1",
      branchName: "aho/spec/wt-1",
      baseRef: "main",
      baseCommit: "abc123",
      checkoutPath: "C:/tmp/wt-1",
      metadataPath: "runtime/worktrees/wt-1.json",
    };
    const prompt = await composeSpecTestGeneratorPrompt({
      context: "Exact role context",
      changeStatus: { projectPath: "C:/project", activeChanges: [], change: null, reviewStatus: null, acMap: null, specTest: null, latestValidation: null, latestAudit: null, closeGate: { ready: false, warnings: [], blockingIssues: [] } },
      selectedAcs: ["AC-001"],
      specTestStatus: "{}",
      latestValidation: "none",
      sourceTests: "tests/existing.test.js",
      worktree,
      sourceProjectPath: "C:/project",
      generatorProfile: "Spec-Test Generator Agent Profile",
    });
    expect(prompt).toContain("Modify files only inside the assigned worktree checkout");
    expect(prompt).toContain("Do not modify production code");
    expect(prompt).toContain("Do not edit `spec-tests.json`");
  });
});

async function runSpecTestAction(
  actionType: "spec-test.propose" | "spec-test.generate" | "spec-test.drift",
  extra: { specTestMissing?: boolean } = {},
) {
  return executeWorkbenchAction(
    { project: fixture.project, path: fixture.project.path },
    {
      actionType,
      changeId: fixture.changeId,
      graphScopeId: fixture.graphScopeId,
      specTestEvidenceFingerprint: await getSpecTestEvidenceFingerprint(fixture.project, fixture.changeId),
      ...extra,
      confirm: true,
    },
  );
}

async function readAttempts() {
  const database = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
  try {
    return database.providerAttempts.listProviderAttempts(fixture.project.id, fixture.conversationId);
  } finally {
    database.close();
  }
}

async function readThreads() {
  const database = await openProjectRuntimeWorkbenchDatabase(fixture.resolution.paths);
  try {
    return database.providerAttempts.listProviderThreads(fixture.project.id, fixture.conversationId);
  } finally {
    database.close();
  }
}

async function listRunDirectories(): Promise<string[]> {
  try {
    return (await readdir(fixture.resolution.paths.runsRoot)).sort();
  } catch {
    return [];
  }
}

async function writeValidation(runId: string, commandStatus: "passed" | "failed"): Promise<void> {
  const runDir = join(fixture.resolution.paths.runsRoot, runId);
  await mkdir(runDir, { recursive: true });
  const now = new Date().toISOString();
  const validation: ValidationResult = {
    version: "1.0",
    id: runId,
    runId,
    changeId: fixture.changeId,
    profile: "default",
    status: commandStatus,
    executionMode: "direct",
    startedAt: now,
    finishedAt: now,
    commands: [{
      name: "test",
      command: ["npm", "test"],
      cwd: fixture.project.path,
      status: commandStatus,
      exitCode: commandStatus === "passed" ? 0 : 1,
      signal: null,
      startedAt: now,
      finishedAt: now,
      stdout: "stdout.log",
      stderr: "stderr.log",
    }],
  };
  await writeJsonFile(join(runDir, "validation.json"), validation);
}

function acStatus(acId: string, linkedEvidence: boolean, confidence: SpecTestAcStatus["confidence"]): SpecTestAcStatus {
  return {
    acId,
    text: acId,
    linkedEvidence,
    evidenceFilesExist: confidence !== "invalid",
    latestValidationStatus: null,
    commandEvidence: [],
    confidence,
    refs: linkedEvidence ? [{ type: "command", commandName: "test" }] : [],
    warnings: [],
    blockingIssues: [],
  };
}

async function initGitRepository(cwd: string): Promise<void> {
  await git(cwd, ["init"]);
  await git(cwd, ["config", "user.email", "test@example.com"]);
  await git(cwd, ["config", "user.name", "Test User"]);
}

function providerDescriptor(runTurn: ReturnType<typeof vi.fn>) {
  return {
    id: "codex",
    displayName: "Codex",
    capabilitySnapshot: vi.fn(async () => ({
      providerId: "codex",
      displayName: "Codex",
      productMode: "harness" as const,
      status: "ready" as const,
      runnable: true,
      checkedAt: "2026-08-04T00:00:00.000Z",
      snapshotHash: "snapshot",
      snapshotVersion: 1,
      effectiveModel: "test-model",
      effectiveModelSource: "provider-default" as const,
      degradedReasons: [],
      capabilities: [],
    })),
    leafExecution: { runTurn },
  };
}
