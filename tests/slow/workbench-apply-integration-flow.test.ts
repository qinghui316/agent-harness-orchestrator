import { existsSync } from "node:fs";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";
import { createConversationChangeFixture } from "../helpers/conversation-change-fixture.js";
import { collectWorktreeDiff } from "../../src/audit/diff.js";
import { applyResultToProject, applyWorktree } from "../../src/apply/manager.js";
import { closeChangeForFinalization, recoverChangeCloseTransactions } from "../../src/change/manager.js";
import { initHarness } from "../../src/harness/init.js";
import { listIntegrationChecks, runIntegrationCheck } from "../../src/integration-check/manager.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { getGitCommit, getGitStatusShort } from "../../src/project/git.js";
import { executeWorkbenchAction } from "../../src/server/workbench-server.js";
import { getWorkbenchSnapshot, listWorkbenchTopics } from "../../src/workbench/projections/read-model/implementation.js";
import { createWorktree } from "../../src/worktree/manager.js";
import { claimTransitionExecution, issueLocalExecutionAuthorization, markTransitionExecutionStarted, readExecutionAuthorization, readTransitionExecution, revokeLocalExecutionAuthorization } from "../../src/workflow-runtime/execution-authorization.js";
import { runExecutionAuthorizationTransaction } from "../../src/workflow-runtime/execution-authorization-repository.js";
import {
  getTempDir,
  git,
  initGitRepository,
  project,
  writeAcceptedSpecAndTasks,
  writeAuditResultWithHash,
  writeValidationResultWithHash,
  deterministicMarkerRepairRunner,
} from "../unit/workbench/fixtures.js";

const execFileAsync = promisify(execFile);

describe("workbench apply and integration slow flows", () => {
  it("consumes a scoped-auto authorization without a second apply confirmation and advances source lineage", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());
      const topic = await createConversationChangeFixture(project(), { title: "Scoped Auto Demand", body: "Apply the accepted local task automatically." });
      await writeAcceptedSpecAndTasks(topic.changeId);
      const memory = await resolveProjectMemory(project());
      const worktree = await createWorktree(project(), memory, topic.changeId);
      await writeFile(join(worktree.metadata.checkoutPath, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"console.log('scoped-auto')\\\"\"}}\n", "utf8");
      const diff = await collectWorktreeDiff(memory, worktree.metadata.worktreeId, topic.changeId);
      await writeValidationResultWithHash(topic.changeId, "run-validation-scoped-auto", worktree.metadata.worktreeId, diff.diffHash, "passed");
      await writeAuditResultWithHash(topic.changeId, "run-audit-scoped-auto", worktree.metadata.worktreeId, diff.diffHash, "approved");
      const sourceHead = await getGitCommit(getTempDir());
      if (!sourceHead) throw new Error("Expected source commit.");
      const sourceStateHash = createHash("sha256").update(JSON.stringify(await getGitStatusShort(getTempDir()))).digest("hex");
      const hash = "b".repeat(64);
      const authorization = await issueLocalExecutionAuthorization(memory, {
        projectId: memory.projectId,
        changeId: topic.changeId,
        conversationId: topic.conversationId,
        providerThreadId: "thread-scoped-auto",
        goalIdentityHash: hash,
        mode: "scoped-auto",
        acceptedPlanId: "plan-scoped-auto",
        acceptedPlanHash: hash,
        graphId: "graph-scoped-auto",
        graphHash: hash,
        artifactManifestHash: hash,
        sourceHead,
        sourceStateHash,
        permissionProfileHash: hash,
        providerScopeHash: hash,
        policyHash: hash,
        targets: [{ transition: "change.finalize", targetId: topic.changeId, manifestHash: hash }],
        budget: { maxCompletedOperations: 8, maxReworks: 1, maxChangedFiles: 20, maxChangedBytes: 1_000_000 },
        userDecision: { decisionId: "execute-scoped-auto", actorId: "workbench-user", decidedAt: new Date().toISOString() },
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      });
      const intentPath = join(memory.changesRoot, "active", topic.changeId, "planning", "execution-authorization-intent.json");
      await mkdir(join(memory.changesRoot, "active", topic.changeId, "planning"), { recursive: true });
      await writeFile(intentPath, JSON.stringify({ version: "1.0", status: "issued", authorizationId: authorization.id }), "utf8");

      const applied = await applyResultToProject(project(), worktree.metadata.worktreeId, { commit: true, message: "Scoped auto apply" });

      expect(applied.apply).toMatchObject({ status: "applied", committed: true, commitHash: expect.any(String) });
      expect(await getGitStatusShort(getTempDir())).toEqual([]);
      expect(await readExecutionAuthorization(memory, authorization.id)).toMatchObject({
        mode: "scoped-auto",
        epoch: 2,
        sourceHead: applied.apply.commitHash,
        sourceStateHash: createHash("sha256").update(JSON.stringify([])).digest("hex"),
      });
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  }, 120_000);

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
      await createConversationChangeFixture(project(), { title: "Result Review Demand" });
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
      const topic = await createConversationChangeFixture(project(), { title: "Finalize Target", body: "Make the package test print finalize." });
      const otherTopic = await createConversationChangeFixture(project(), { title: "Other Active Demand", body: "Keep open." });
      await writeAcceptedSpecAndTasks(topic.changeId);
      const memory = await resolveProjectMemory(project());
      const worktree = await createWorktree(project(), memory, topic.changeId);
      await writeFile(join(worktree.metadata.checkoutPath, "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"console.log('finalize')\\\"\"}}\n", "utf8");
      await writeFile(join(worktree.metadata.checkoutPath, "health-proof.bin"), Buffer.from([0, 255, 1, 2, 3, 0]));
      const diff = await collectWorktreeDiff(memory, worktree.metadata.worktreeId, topic.changeId);
      const hash = "a".repeat(64);
      const sourceHead = await getGitCommit(getTempDir());
      if (!sourceHead) throw new Error("Expected source commit.");
      const authorization = await issueLocalExecutionAuthorization(memory, {
        projectId: memory.projectId,
        changeId: topic.changeId,
        conversationId: topic.conversationId,
        providerThreadId: "thread-finalize",
        goalIdentityHash: hash,
        mode: "stepwise",
        acceptedPlanId: "plan-finalize",
        acceptedPlanHash: hash,
        graphId: "graph-finalize",
        graphHash: hash,
        artifactManifestHash: hash,
        sourceHead,
        sourceStateHash: createHash("sha256").update(JSON.stringify(await getGitStatusShort(getTempDir()))).digest("hex"),
        permissionProfileHash: hash,
        providerScopeHash: hash,
        policyHash: hash,
        targets: [{ transition: "change.finalize", targetId: topic.changeId, manifestHash: hash }],
        budget: { maxCompletedOperations: 8, maxReworks: 1, maxChangedFiles: 20, maxChangedBytes: 1_000_000 },
        userDecision: { decisionId: "execute-finalize", actorId: "user", decidedAt: new Date().toISOString() },
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(),
      });
      await mkdir(join(memory.changesRoot, "active", topic.changeId, "planning"), { recursive: true });
      await writeFile(join(memory.changesRoot, "active", topic.changeId, "planning", "execution-authorization-intent.json"), JSON.stringify({
        version: "1.0", status: "issued", authorizationId: authorization.id,
      }), "utf8");
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
      expect([...await readFile(join(getTempDir(), "health-proof.bin"))]).toEqual([0, 255, 1, 2, 3, 0]);
      const firstApply = applied.result as Awaited<ReturnType<typeof applyWorktree>>;
      const applyTransaction = JSON.parse(await readFile(join(memory.memoryRoot, firstApply.run.artifacts.directory, "apply-transaction.json"), "utf8")) as {
        authorization: { operationId: string };
      };
      expect(await readTransitionExecution(memory, applyTransaction.authorization.operationId)).toMatchObject({
        transition: "source.apply",
        status: "completed",
        commitPointReservedAt: expect.any(String),
      });
      const duplicateApply = await applyWorktree(project(), worktree.metadata.worktreeId, {
        commit: true,
        message: "Apply finalize target",
        userConfirmed: true,
      });
      expect(duplicateApply.run.id).toBe(firstApply.run.id);
      expect(duplicateApply.apply.commitHash).toBe(firstApply.apply.commitHash);
      const amendedAuthorization = await readExecutionAuthorization(memory, authorization.id);
      expect(amendedAuthorization).toMatchObject({
        epoch: 2,
        targets: expect.arrayContaining([expect.objectContaining({ transition: "source.apply", targetId: worktree.metadata.worktreeId })]),
      });
      expect(await gitStatus(getTempDir())).toBe("");
      const afterApply = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
      expect(afterApply.center.selectedTopic?.state).toBe("active");
      expect(afterApply.center.workpad.resultReview).toMatchObject({ status: "applied-clean" });
      expect(JSON.stringify(afterApply.right)).not.toContain("change.close");
      const finalizeClaim = await claimTransitionExecution(memory, {
        authorizationId: amendedAuthorization.id,
        authorizationEpoch: amendedAuthorization.epoch,
        transition: "change.finalize",
        targetId: topic.changeId,
        manifestHash: hash,
        snapshot: {
          acceptedPlanHash: amendedAuthorization.acceptedPlanHash,
          graphHash: amendedAuthorization.graphHash,
          artifactManifestHash: amendedAuthorization.artifactManifestHash,
          sourceHead: amendedAuthorization.sourceHead,
          sourceStateHash: amendedAuthorization.sourceStateHash,
          permissionProfileHash: amendedAuthorization.permissionProfileHash,
          providerScopeHash: amendedAuthorization.providerScopeHash,
          policyHash: amendedAuthorization.policyHash,
        },
        claimedBy: "test-finalization",
      });
      await markTransitionExecutionStarted(memory, finalizeClaim.operationId, finalizeClaim.claimToken, finalizeClaim.fencingToken);
      const requestId = `finalize-${createHash("sha256").update(`${amendedAuthorization.id}:${amendedAuthorization.epoch}:turn-finalize`).digest("hex")}`;
      const requestArtifact = join(memory.changesRoot, "active", topic.changeId, "finalization", "requests", `${requestId}.json`);
      await mkdir(join(memory.changesRoot, "active", topic.changeId, "finalization", "requests"), { recursive: true });
      await writeFile(requestArtifact, `${JSON.stringify({
        version: "1.0", id: requestId, changeId: topic.changeId, conversationId: topic.conversationId,
        providerThreadId: "thread-finalize", turnId: "turn-finalize", authorizationId: amendedAuthorization.id,
        authorizationEpoch: amendedAuthorization.epoch, manifestHash: hash, goalIdentityHash: hash,
        status: "requested", createdAt: new Date().toISOString(), artifact: requestArtifact,
      }, null, 2)}\n`, "utf8");
      await expect(closeChangeForFinalization(project(), {
        changeId: topic.changeId,
        requestId: `finalize-${"0".repeat(64)}`,
        authorizationId: amendedAuthorization.id,
        authorizationEpoch: amendedAuthorization.epoch,
        conversationId: topic.conversationId,
        providerThreadId: "thread-finalize",
        goalIdentityHash: hash,
        operationId: finalizeClaim.operationId,
        claimToken: finalizeClaim.claimToken,
        fencingToken: finalizeClaim.fencingToken,
      })).rejects.toThrow("Persisted FinalizeRequest was not found");
      const auditArtifact = join(memory.runsRoot, "run-audit-finalize", "audit.json");
      const matchingAudit = JSON.parse(await readFile(auditArtifact, "utf8")) as Record<string, unknown>;
      await writeFile(auditArtifact, `${JSON.stringify({ ...matchingAudit, worktreeDiffHash: "b".repeat(64) }, null, 2)}\n`, "utf8");
      await expect(closeChangeForFinalization(project(), {
        changeId: topic.changeId,
        requestId,
        authorizationId: amendedAuthorization.id,
        authorizationEpoch: amendedAuthorization.epoch,
        conversationId: topic.conversationId,
        providerThreadId: "thread-finalize",
        goalIdentityHash: hash,
        operationId: finalizeClaim.operationId,
        claimToken: finalizeClaim.claimToken,
        fencingToken: finalizeClaim.fencingToken,
      })).rejects.toThrow("same worktree diff");
      await writeFile(auditArtifact, `${JSON.stringify(matchingAudit, null, 2)}\n`, "utf8");
      const closed = await closeChangeForFinalization(project(), {
        changeId: topic.changeId,
        requestId,
        authorizationId: amendedAuthorization.id,
        authorizationEpoch: amendedAuthorization.epoch,
        conversationId: topic.conversationId,
        providerThreadId: "thread-finalize",
        goalIdentityHash: hash,
        operationId: finalizeClaim.operationId,
        claimToken: finalizeClaim.claimToken,
        fencingToken: finalizeClaim.fencingToken,
      });
      expect(await readTransitionExecution(memory, finalizeClaim.operationId)).toMatchObject({
        status: "completed",
        commitPointReservedAt: expect.any(String),
        receipt: { evidenceRefs: [closed.receiptPath] },
      });
      const completedExecution = await readTransitionExecution(memory, finalizeClaim.operationId);
      runExecutionAuthorizationTransaction(memory, (transaction) => {
        transaction.putExecution({
          ...completedExecution,
          status: "executing",
          claimExpiresAt: "2026-07-11T00:00:00.000Z",
          terminalAt: null,
          receipt: null,
        });
      });
      await revokeLocalExecutionAuthorization(memory, amendedAuthorization.id, "revoked after close commit point");
      const closeMarkerPath = join(memory.changesRoot, ".close-transactions", `${topic.changeId}.json`);
      const closeMarker = JSON.parse(await readFile(closeMarkerPath, "utf8")) as Record<string, unknown>;
      await rm(join(memory.memoryRoot, closed.receiptPath as string), { force: true });
      await writeFile(closeMarkerPath, `${JSON.stringify({ ...closeMarker, stage: "renamed" }, null, 2)}\n`, "utf8");
      await recoverChangeCloseTransactions(project());
      expect(await readTransitionExecution(memory, finalizeClaim.operationId)).toMatchObject({
        status: "completed",
        receipt: { evidenceRefs: [closed.receiptPath] },
      });
      expect(closed).toMatchObject({
        change: expect.objectContaining({ id: topic.changeId }),
        archivePath: expect.stringContaining(topic.changeId),
        transactionId: expect.stringMatching(/^close-/),
      });
      const topics = await listWorkbenchTopics(project());
      expect(topics.find((item) => item.id === topic.conversationId)).toMatchObject({ state: "active" });
      expect(topics.find((item) => item.id === otherTopic.conversationId)).toMatchObject({ state: "active" });
      const archivedSnapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: topic.changeId });
      expect(archivedSnapshot.center.selectedTopic?.state).toBe("archive");
      expect(archivedSnapshot.right.confirmationQueue.primary?.changeId).not.toBe(topic.changeId);
      expect(JSON.stringify(archivedSnapshot.right.confirmationQueue.primary)).not.toContain("landing.prepare");
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
      await createConversationChangeFixture(project(), { title: "Demand A" });
      const demandB = await createConversationChangeFixture(project(), { title: "Demand B" });
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

      expect(snapshot.center.selectedTopic?.id).toBe(demandB.conversationId);
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
      await createConversationChangeFixture(project(), { title: "Demand A" });
      await writeAcceptedSpecAndTasks("demand-a");
      const memory = await resolveProjectMemory(project());
      const worktreeA = await createWorktree(project(), memory, "demand-a");
      await writeFile(join(worktreeA.metadata.checkoutPath, "a.txt"), "a\n", "utf8");
      const diffA = await collectWorktreeDiff(memory, worktreeA.metadata.worktreeId, "demand-a");
      await writeValidationResultWithHash("demand-a", "run-validation-a", worktreeA.metadata.worktreeId, diffA.diffHash, "passed");
      await writeAuditResultWithHash("demand-a", "run-audit-a", worktreeA.metadata.worktreeId, diffA.diffHash, "approved");
      const worktreeB = await createWorktree(project(), memory, "demand-a");
      await writeFile(join(worktreeB.metadata.checkoutPath, "b.txt"), "b\n", "utf8");
      const diffB = await collectWorktreeDiff(memory, worktreeB.metadata.worktreeId, "demand-a");
      await writeValidationResultWithHash("demand-a", "run-validation-b", worktreeB.metadata.worktreeId, diffB.diffHash, "passed");
      await writeAuditResultWithHash("demand-a", "run-audit-b", worktreeB.metadata.worktreeId, diffB.diffHash, "approved");

      const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "demand-a" });
      const integrationGate = snapshot.right.confirmationQueue.current.find((item) => item.kind === "integration-check");
      expect(integrationGate).toMatchObject({
        kind: "integration-check",
        changeId: "demand-a",
        whyNeedsConfirmation: "多个结果都已准备好应用。",
      });
      expect(integrationGate?.actions[0]).toMatchObject({
        actionType: "apply-check.run",
        worktreeIds: expect.arrayContaining([worktreeA.metadata.worktreeId, worktreeB.metadata.worktreeId]),
      });
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  }, 120_000);

  it("does not combine ready worktrees from different Changes into one IntegrationCheck", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\nAGENTS.md\ndocs/\nscripts/\n", "utf8");
      await writeFile(join(getTempDir(), "package.json"), "{\"scripts\":{\"test\":\"node -e \\\"process.exit(0)\\\"\"}}\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());
      await createConversationChangeFixture(project(), { title: "Demand A" });
      await createConversationChangeFixture(project(), { title: "Demand B" });
      await writeAcceptedSpecAndTasks("demand-a");
      await writeAcceptedSpecAndTasks("demand-b");
      const memory = await resolveProjectMemory(project());
      const worktreeA = await createWorktree(project(), memory, "demand-a");
      await writeFile(join(worktreeA.metadata.checkoutPath, "a.txt"), "a\n", "utf8");
      const diffA = await collectWorktreeDiff(memory, worktreeA.metadata.worktreeId, "demand-a");
      await writeValidationResultWithHash("demand-a", "run-validation-a", worktreeA.metadata.worktreeId, diffA.diffHash, "passed");
      await writeAuditResultWithHash("demand-a", "run-audit-a", worktreeA.metadata.worktreeId, diffA.diffHash, "approved");
      const worktreeB = await createWorktree(project(), memory, "demand-b");
      await writeFile(join(worktreeB.metadata.checkoutPath, "b.txt"), "b\n", "utf8");
      const diffB = await collectWorktreeDiff(memory, worktreeB.metadata.worktreeId, "demand-b");
      await writeValidationResultWithHash("demand-b", "run-validation-b", worktreeB.metadata.worktreeId, diffB.diffHash, "passed");
      await writeAuditResultWithHash("demand-b", "run-audit-b", worktreeB.metadata.worktreeId, diffB.diffHash, "approved");
      const worktreeB2 = await createWorktree(project(), memory, "demand-b");
      await writeFile(join(worktreeB2.metadata.checkoutPath, "b2.txt"), "b2\n", "utf8");
      const diffB2 = await collectWorktreeDiff(memory, worktreeB2.metadata.worktreeId, "demand-b");
      await writeValidationResultWithHash("demand-b", "run-validation-b2", worktreeB2.metadata.worktreeId, diffB2.diffHash, "passed");
      await writeAuditResultWithHash("demand-b", "run-audit-b2", worktreeB2.metadata.worktreeId, diffB2.diffHash, "approved");

      const snapshot = await getWorkbenchSnapshot({ project: project(), path: getTempDir() }, { topicId: "demand-a" });
      expect(snapshot.right.confirmationQueue.current.some((item) =>
        item.kind === "integration-check"
        && item.actions.some((action) => action.actionType === "apply-check.run")
      )).toBe(false);

      const checked = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        actionType: "apply-check.run",
        changeId: "demand-a",
        worktreeIds: [worktreeA.metadata.worktreeId, worktreeB.metadata.worktreeId],
        confirm: true,
      });
      expect(checked.result.status).toBe("failed");
      expect(checked.result.error).toMatch(/same Change|stale/i);
      await expect(runIntegrationCheck(project(), [worktreeA.metadata.worktreeId, worktreeB.metadata.worktreeId], "demand-a")).rejects.toThrow(/same Change/i);
      const hijacked = await executeWorkbenchAction({ project: project(), path: getTempDir() }, {
        actionType: "apply-check.run",
        changeId: "demand-a",
        worktreeIds: [worktreeB.metadata.worktreeId, worktreeB2.metadata.worktreeId],
        confirm: true,
      });
      expect(hijacked.result.status).toBe("failed");
      expect(hijacked.result.error).toMatch(/requested Change|stale/i);
      await expect(runIntegrationCheck(project(), [worktreeB.metadata.worktreeId, worktreeB2.metadata.worktreeId], "demand-a")).rejects.toThrow(/requested Change/i);
      await expect(listIntegrationChecks(memory)).resolves.toHaveLength(0);
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
      await createConversationChangeFixture(project(), { title: "Demand A" });
      await writeAcceptedSpecAndTasks("demand-a");
      const memory = await resolveProjectMemory(project());
      const worktreeA = await createWorktree(project(), memory, "demand-a");
      await writeFile(join(worktreeA.metadata.checkoutPath, "a.txt"), "a\n", "utf8");
      const diffA = await collectWorktreeDiff(memory, worktreeA.metadata.worktreeId, "demand-a");
      await writeValidationResultWithHash("demand-a", "run-validation-a", worktreeA.metadata.worktreeId, diffA.diffHash, "passed");
      await writeAuditResultWithHash("demand-a", "run-audit-a", worktreeA.metadata.worktreeId, diffA.diffHash, "approved");
      const worktreeB = await createWorktree(project(), memory, "demand-a");
      await writeFile(join(worktreeB.metadata.checkoutPath, "b.txt"), "b\n", "utf8");
      const diffB = await collectWorktreeDiff(memory, worktreeB.metadata.worktreeId, "demand-a");
      await writeValidationResultWithHash("demand-a", "run-validation-b", worktreeB.metadata.worktreeId, diffB.diffHash, "passed");
      await writeAuditResultWithHash("demand-a", "run-audit-b", worktreeB.metadata.worktreeId, diffB.diffHash, "approved");

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
      const integrationApply = after.right.confirmationQueue.current.find((item) => item.kind === "integration-apply");
      expect(integrationApply).toMatchObject({
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
      await createConversationChangeFixture(project(), { title: "Demand A" });
      await createConversationChangeFixture(project(), { title: "Demand B" });
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
      await createConversationChangeFixture(project(), { title: "Demand A" });
      await writeAcceptedSpecAndTasks("demand-a");
      const memory = await resolveProjectMemory(project());
      const worktreeA = await createWorktree(project(), memory, "demand-a");
      await writeFile(join(worktreeA.metadata.checkoutPath, "a.txt"), "a\n", "utf8");
      const diffA = await collectWorktreeDiff(memory, worktreeA.metadata.worktreeId, "demand-a");
      await writeValidationResultWithHash("demand-a", "run-validation-a", worktreeA.metadata.worktreeId, diffA.diffHash, "passed");
      await writeAuditResultWithHash("demand-a", "run-audit-a", worktreeA.metadata.worktreeId, diffA.diffHash, "approved");
      const worktreeB = await createWorktree(project(), memory, "demand-a");
      await writeFile(join(worktreeB.metadata.checkoutPath, "integration-validation-fail.txt"), "temporary aggregate failure marker\n", "utf8");
      await writeFile(join(worktreeB.metadata.checkoutPath, "b.txt"), "b\n", "utf8");
      const diffB = await collectWorktreeDiff(memory, worktreeB.metadata.worktreeId, "demand-a");
      await writeValidationResultWithHash("demand-a", "run-validation-b", worktreeB.metadata.worktreeId, diffB.diffHash, "passed");
      await writeAuditResultWithHash("demand-a", "run-audit-b", worktreeB.metadata.worktreeId, diffB.diffHash, "approved");

      const checked = await runIntegrationCheck(project(), [worktreeA.metadata.worktreeId, worktreeB.metadata.worktreeId], "demand-a", {
        repairRunner: deterministicMarkerRepairRunner,
      });
      const check = checked.check;
      expect(check).toMatchObject({
        status: "passed",
        latestArtifactRef: expect.stringContaining("repaired.patch"),
        aggregateValidation: expect.objectContaining({ status: "passed" }),
        aggregateAudit: expect.objectContaining({ status: "approved" }),
      });
      expect(check.fixAttempts?.[0]).toMatchObject({ status: "completed", repairMode: "deterministic-marker-test" });
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
      await createConversationChangeFixture(project(), { title: "Source Drift Demand" });
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
      await createConversationChangeFixture(project(), { title: "Dirty Source Demand" });
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
