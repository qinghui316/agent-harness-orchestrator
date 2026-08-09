import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkProjectHarnessEvolution,
  completeProjectHarnessEvolution,
  readProjectHarnessEvolutionState,
  reconsiderProjectHarnessEvolution,
  stageProjectHarnessEvolution,
} from "../../src/project-harness/evolution.js";
import { SourceFingerprintSnapshot } from "../../src/project-harness/source-fingerprint.js";
import {
  claimProjectHarnessWriterLock,
  projectHarnessSharedWriterRoot,
  releaseProjectHarnessWriterLock,
} from "../../src/project-harness/writer-lock.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness Evolution", () => {
  it("opens one stable five-Change window and queues later eligible Changes", async () => {
    const fixture = await createFixture(7);
    const state = await checkProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot);

    expect(state.pending).toBe(true);
    expect(state.pending_change_ids).toEqual(changeIds(5));

    const stage = await fixture.stage();
    expect(stage.change_ids).toEqual(changeIds(5));
    await fixture.completeRejected(stage, { validationPassed: false });

    const completed = await readProjectHarnessEvolutionState(fixture.skillRoot);
    expect(completed.evaluated_change_ids).toEqual(changeIds(5));
    expect(completed.pending_change_ids).toEqual([]);
    expect(completed.pending).toBe(false);
  });

  it("requires E1, one exact pending window, and one owner", async () => {
    const fixture = await createFixture();
    await expect(fixture.stage({ e1Approved: false })).rejects.toThrow(/explicit E1 approval/);
    await expect(fixture.stage({ changeIds: changeIds(5).reverse() })).rejects.toThrow(/stable order/);

    await fixture.stage();
    await expect(stageProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, {
      ...fixture.stageInput,
      proposalId: "second-proposal",
      ownerId: "second-owner",
      candidateRoot: fixture.secondCandidateRoot,
    })).rejects.toThrow(/owner is already active/);
  });

  it("recovers an incomplete stage claim without reopening a complete active owner", async () => {
    const fixture = await createFixture();
    const first = await fixture.stage();
    await rm(join(fixture.skillRoot, "state", "evolution", "staging", `${first.proposal_id}.json`));

    const recovered = await fixture.stage();
    expect(recovered.proposal_id).toBe(first.proposal_id);
    expect(recovered.claim_token).not.toBe(first.claim_token);
  });

  it("rejects candidate and source changes after staging", async () => {
    const candidateFixture = await createFixture();
    const candidateStage = await candidateFixture.stage();
    await writeFile(join(candidateFixture.sidecarRoot, "evolution", "staging", candidateStage.proposal_id, "candidate", "static.txt"), "tampered\n", "utf8");
    await expect(candidateFixture.completeRejected(candidateStage)).rejects.toThrow(/candidate changed/);

    const sourceFixture = await createFixture();
    const sourceStage = await sourceFixture.stage();
    await writeFile(join(sourceFixture.projectRoot, "src", "owner.ts"), "export const owner = 'changed';\n", "utf8");
    await expect(sourceFixture.completeRejected(sourceStage)).rejects.toThrow(/source snapshot changed/);
  });

  it("publishes a live passing candidate and supports an authenticated idempotent retry", async () => {
    const fixture = await createFixture();
    const stage = await fixture.stage();
    const judge = fixture.judge(stage, "keep", 90);

    const first = await completeProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, {
      ...fixture.completeInput(stage),
      status: "keep",
      judge,
      validation: passingValidation(),
      note: "Accepted by the independent Judge.",
    });
    expect(first).toMatchObject({ status: "keep", score: 90, revision: 28, cleanupPending: false });
    expect(await readFile(join(fixture.skillRoot, "static.txt"), "utf8")).toBe("candidate\n");

    const retry = await completeProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, {
      ...fixture.completeInput(stage),
      status: "keep",
      judge,
      validation: passingValidation(),
      note: "Idempotent retry.",
    });
    expect(retry).toEqual(first);
    await expect(completeProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, {
      ...fixture.completeInput(stage),
      claimToken: "wrong-claim",
      status: "keep",
      judge,
      validation: passingValidation(),
      note: "Must fail.",
    })).rejects.toThrow(/not active/);
  });

  it("records rejected and unavailable-Judge outcomes without publishing content", async () => {
    const rejected = await createFixture();
    const rejectedStage = await rejected.stage();
    const rejectedResult = await rejected.completeRejected(rejectedStage, { validationPassed: false });
    expect(rejectedResult).toMatchObject({ status: "rejected", score: 70, revision: 27 });
    expect(await readFile(join(rejected.skillRoot, "static.txt"), "utf8")).toBe("current\n");

    const noop = await createFixture();
    const noopStage = await noop.stage();
    const noopResult = await completeProjectHarnessEvolution(noop.skillRoot, noop.sidecarRoot, {
      ...noop.completeInput(noopStage),
      status: "noop",
      judgeUnavailable: true,
      validation: {
        harnessPassed: false,
        projectPassed: false,
        fullTestRequired: false,
        fullTestPassed: false,
      },
      note: "Independent Judge unavailable.",
      sourceSnapshot: noop.snapshot(),
    });
    expect(noopResult).toMatchObject({ status: "noop", score: null, revision: 27 });
  });

  it("never publishes dry-run, sub-80, hard-issue, or unvalidated keep outcomes", async () => {
    const fixture = await createFixture();
    const stage = await fixture.stage();
    const base = fixture.judge(stage, "keep", 90);

    for (const judge of [
      { ...base, eval_mode: "dry-run" },
      fixture.judge(stage, "keep", 70),
      { ...base, hard_issues: ["Unsafe publication"] },
      { ...base, author_id: "another-author" },
    ]) {
      await expect(completeProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, {
        ...fixture.completeInput(stage),
        status: "keep",
        judge,
        validation: passingValidation(),
        note: "Must not publish.",
      })).rejects.toThrow();
    }
    await expect(completeProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, {
      ...fixture.completeInput(stage),
      status: "keep",
      judge: base,
      validation: { ...passingValidation(), projectPassed: false },
      note: "Must not publish.",
    })).rejects.toThrow(/validation/);
    expect(await readFile(join(fixture.skillRoot, "static.txt"), "utf8")).toBe("current\n");
  });

  it("honors the shared writer lock during publication", async () => {
    const fixture = await createFixture();
    const stage = await fixture.stage();
    const writerRoot = projectHarnessSharedWriterRoot(fixture.sidecarRoot);
    const lock = await claimProjectHarnessWriterLock(writerRoot, {
      projectId: "sample-a1",
      ownerId: "integration-owner",
      operation: "integration-finalize",
    });
    try {
      await expect(checkProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot)).rejects.toThrow(/writer lock is already held/);
      await expect(completeProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, {
        ...fixture.completeInput(stage),
        status: "keep",
        judge: fixture.judge(stage, "keep", 90),
        validation: passingValidation(),
        note: "Must wait for Integration.",
      })).rejects.toThrow(/writer lock is already held/);
    } finally {
      await releaseProjectHarnessWriterLock(writerRoot, lock.token);
    }
    expect(await readFile(join(fixture.skillRoot, "static.txt"), "utf8")).toBe("current\n");
  });

  it("reconsiders the latest unpublished rejection without re-consuming its Change window", async () => {
    const fixture = await createFixture(7);
    const rejectedStage = await fixture.stage();
    await fixture.completeRejected(rejectedStage);
    await rm(join(fixture.skillRoot, "state", "evolution", "attempts", `${rejectedStage.proposal_id}.json`));
    await fixture.writeProposal("proposal-reconsidered", "Fresh reconsideration proposal.");

    const claim = await reconsiderProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, {
      rejectedProposalId: rejectedStage.proposal_id,
      proposalId: "proposal-reconsidered",
      ownerId: "evolution-agent",
      e1Approved: true,
      reconsiderApproved: true,
    });
    expect(claim).toMatchObject({
      attempt_kind: "reconsideration",
      change_ids: changeIds(5),
      queued_change_ids_snapshot: changeIds(7).slice(5),
      base_revision: 27,
    });
    expect(await readFile(join(
      fixture.skillRoot,
      "state",
      "evolution",
      "attempts",
      `${rejectedStage.proposal_id}.json`,
    ), "utf8")).toContain('"status": "rejected"');

    const stage = await fixture.stage({ proposalId: "proposal-reconsidered" });
    expect(stage).toMatchObject({
      attempt_kind: "reconsideration",
      reconsidered_from_proposal_id: rejectedStage.proposal_id,
      reconsidered_result_fingerprint: claim.reconsidered_result_fingerprint,
      change_ids: changeIds(5),
    });
    const judge = fixture.judge(stage, "keep", 92);
    await writeFile(join(
      fixture.skillRoot,
      "state",
      "evolution",
      "proposals",
      `${stage.proposal_id}-judge.json`,
    ), `${JSON.stringify(judge, null, 2)}\n`, "utf8");
    const result = await completeProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, {
      ...fixture.completeInput(stage),
      status: "keep",
      judge,
      validation: passingValidation(),
      note: "Reconsidered with the missing external authorization.",
    });
    expect(result).toMatchObject({
      status: "keep",
      score: 92,
      revision: 28,
      evaluatedChangeIds: changeIds(5),
      pendingChangeIds: changeIds(7).slice(5),
    });
    const state = await readProjectHarnessEvolutionState(fixture.skillRoot);
    expect(state.evaluated_change_ids).toEqual(changeIds(5));
    expect(state.pending_change_ids).toEqual([]);
    const attempt = JSON.parse(await readFile(join(
      fixture.skillRoot,
      "state",
      "evolution",
      "attempts",
      "proposal-reconsidered.json",
    ), "utf8")) as Record<string, unknown>;
    expect(attempt).toMatchObject({
      attempt_kind: "reconsideration",
      parent_proposal_id: rejectedStage.proposal_id,
      published: true,
      base_revision: 27,
    });

    const retry = await completeProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, {
      ...fixture.completeInput(stage),
      status: "keep",
      judge,
      validation: passingValidation(),
      note: "Idempotent retry.",
    });
    expect(retry).toEqual(result);
    expect((await readProjectHarnessManifestForTest(fixture.skillRoot)).skill_revision).toBe(28);
  });

  it("requires both confirmations and rejects stale reconsideration evidence", async () => {
    const fixture = await createFixture(7);
    const rejectedStage = await fixture.stage();
    await fixture.completeRejected(rejectedStage);
    await fixture.writeProposal("proposal-reconsidered", "Fresh reconsideration proposal.");
    const input = {
      rejectedProposalId: rejectedStage.proposal_id,
      proposalId: "proposal-reconsidered",
      ownerId: "evolution-agent",
      e1Approved: true,
      reconsiderApproved: true,
    };
    await expect(reconsiderProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, {
      ...input,
      e1Approved: false,
    })).rejects.toThrow(/explicit E1 approval/);
    await expect(reconsiderProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, {
      ...input,
      reconsiderApproved: false,
    })).rejects.toThrow(/explicit reconsider approval/);
    await writeFile(join(
      fixture.skillRoot,
      "state",
      "evolution",
      "proposals",
      "proposal-reconsidered-judge.json",
    ), "{}\n", "utf8");
    await expect(reconsiderProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, input))
      .rejects.toThrow(/fresh independent Judge/);
  });

  it("fails before claiming when the rejected window is no longer evaluated or a full next window is pending", async () => {
    const missingEvaluated = await createFixture(7);
    const missingStage = await missingEvaluated.stage();
    await missingEvaluated.completeRejected(missingStage);
    await missingEvaluated.writeProposal("proposal-reconsidered", "Fresh reconsideration proposal.");
    const missingStatePath = join(missingEvaluated.skillRoot, "state", "evolution", "state.json");
    const missingState = JSON.parse(await readFile(missingStatePath, "utf8")) as Record<string, unknown>;
    await writeFile(missingStatePath, `${JSON.stringify({
      ...missingState,
      evaluated_change_ids: changeIds(5).slice(1),
    }, null, 2)}\n`, "utf8");
    await expect(reconsiderProjectHarnessEvolution(missingEvaluated.skillRoot, missingEvaluated.sidecarRoot, {
      rejectedProposalId: missingStage.proposal_id,
      proposalId: "proposal-reconsidered",
      ownerId: "evolution-agent",
      e1Approved: true,
      reconsiderApproved: true,
    })).rejects.toThrow(/must already exist in the evaluated Change set/);

    const fullNextWindow = await createFixture(10);
    const fullStage = await fullNextWindow.stage();
    await fullNextWindow.completeRejected(fullStage);
    await fullNextWindow.writeProposal("proposal-reconsidered", "Fresh reconsideration proposal.");
    await expect(reconsiderProjectHarnessEvolution(fullNextWindow.skillRoot, fullNextWindow.sidecarRoot, {
      rejectedProposalId: fullStage.proposal_id,
      proposalId: "proposal-reconsidered",
      ownerId: "evolution-agent",
      e1Approved: true,
      reconsiderApproved: true,
    })).rejects.toThrow(/complete pending Evolution window/);
  });

  it("rolls back a failed legacy-attempt claim and refuses a foreign shared writer", async () => {
    const failedClaim = await createFixture(7);
    const failedStage = await failedClaim.stage();
    await failedClaim.completeRejected(failedStage);
    await failedClaim.writeProposal("proposal-reconsidered", "Fresh reconsideration proposal.");
    const evolutionRoot = join(failedClaim.skillRoot, "state", "evolution");
    const attemptsRoot = join(evolutionRoot, "attempts");
    await rm(attemptsRoot, { recursive: true, force: true });
    await writeFile(attemptsRoot, "exclusive attempt storage collision\n", "utf8");
    const stateBefore = await readFile(join(evolutionRoot, "state.json"));
    const resultsBefore = await readFile(join(evolutionRoot, "results.tsv"));
    const judgeBefore = await readFile(join(evolutionRoot, "proposals", `${failedStage.proposal_id}-judge.json`));
    await expect(reconsiderProjectHarnessEvolution(failedClaim.skillRoot, failedClaim.sidecarRoot, {
      rejectedProposalId: failedStage.proposal_id,
      proposalId: "proposal-reconsidered",
      ownerId: "evolution-agent",
      e1Approved: true,
      reconsiderApproved: true,
    })).rejects.toThrow();
    expect(await readFile(join(evolutionRoot, "state.json"))).toEqual(stateBefore);
    expect(await readFile(join(evolutionRoot, "results.tsv"))).toEqual(resultsBefore);
    expect(await readFile(join(evolutionRoot, "proposals", `${failedStage.proposal_id}-judge.json`))).toEqual(judgeBefore);
    expect(await readFile(attemptsRoot, "utf8")).toBe("exclusive attempt storage collision\n");
    await expect(readFile(join(failedClaim.skillRoot, "state", "registry", "locks", "evolution-owner", "owner.json")))
      .rejects.toThrow();

    const foreignWriter = await createFixture(7);
    const foreignStage = await foreignWriter.stage();
    await foreignWriter.completeRejected(foreignStage);
    await foreignWriter.writeProposal("proposal-reconsidered", "Fresh reconsideration proposal.");
    const writerRoot = projectHarnessSharedWriterRoot(foreignWriter.sidecarRoot);
    const lock = await claimProjectHarnessWriterLock(writerRoot, {
      projectId: "sample-a1",
      ownerId: "integration-owner",
      operation: "integration-finalize",
    });
    try {
      await expect(reconsiderProjectHarnessEvolution(foreignWriter.skillRoot, foreignWriter.sidecarRoot, {
        rejectedProposalId: foreignStage.proposal_id,
        proposalId: "proposal-reconsidered",
        ownerId: "evolution-agent",
        e1Approved: true,
        reconsiderApproved: true,
      })).rejects.toThrow(/writer lock is already held/);
    } finally {
      await releaseProjectHarnessWriterLock(writerRoot, lock.token);
    }
    await expect(readFile(join(foreignWriter.skillRoot, "state", "registry", "locks", "evolution-owner", "owner.json")))
      .rejects.toThrow();
  });

  it("uses an operation-scoped writer with durable owner and fingerprint fencing between reconsider and stage", async () => {
    const fixture = await createFixture(7);
    const rejectedStage = await fixture.stage();
    await fixture.completeRejected(rejectedStage);
    await fixture.writeProposal("proposal-reconsidered", "Fresh reconsideration proposal.");
    const claim = await reconsiderProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, {
      rejectedProposalId: rejectedStage.proposal_id,
      proposalId: "proposal-reconsidered",
      ownerId: "evolution-agent",
      e1Approved: true,
      reconsiderApproved: true,
    });
    const writerRoot = projectHarnessSharedWriterRoot(fixture.sidecarRoot);
    const foreign = await claimProjectHarnessWriterLock(writerRoot, {
      projectId: "sample-a1",
      ownerId: "integration-owner",
      operation: "integration-finalize",
    });
    try {
      await expect(fixture.stage({ proposalId: "proposal-reconsidered" }))
        .rejects.toThrow(/writer lock is already held/);
    } finally {
      await releaseProjectHarnessWriterLock(writerRoot, foreign.token);
    }
    const stage = await fixture.stage({ proposalId: "proposal-reconsidered" });
    expect(stage.claim_token).toBe(claim.claim_token);
    expect(stage.reconsidered_result_fingerprint).toBe(claim.reconsidered_result_fingerprint);
  });

  it("revalidates every durable reconsideration claim binding before an idempotent retry", async () => {
    const fixture = await createFixture(7);
    const rejectedStage = await fixture.stage();
    await fixture.completeRejected(rejectedStage);
    await fixture.writeProposal("proposal-reconsidered", "Fresh reconsideration proposal.");
    const input = {
      rejectedProposalId: rejectedStage.proposal_id,
      proposalId: "proposal-reconsidered",
      ownerId: "evolution-agent",
      e1Approved: true,
      reconsiderApproved: true,
    };
    const claim = await reconsiderProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, input);
    const ownerPath = join(fixture.skillRoot, "state", "registry", "locks", "evolution-owner", "owner.json");
    for (const tampered of [
      { ...claim, claim_token: "" },
      { ...claim, reconsidered_from_proposal_id: "another-parent" },
      { ...claim, change_ids: [...claim.change_ids].reverse() },
      { ...claim, queued_change_ids_snapshot: [...claim.queued_change_ids_snapshot].reverse() },
      { ...claim, queued_change_ids_digest: "0".repeat(64) },
    ]) {
      await writeFile(ownerPath, `${JSON.stringify(tampered, null, 2)}\n`, "utf8");
      await expect(reconsiderProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, input)).rejects.toThrow();
    }
    await writeFile(ownerPath, `${JSON.stringify(claim, null, 2)}\n`, "utf8");
    await expect(reconsiderProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, input)).resolves.toEqual(claim);
  });

  it("rejects non-rejected terminal results and reused attempt identities", async () => {
    const kept = await createFixture();
    const keptStage = await kept.stage();
    const keepJudge = kept.judge(keptStage, "keep", 90);
    await completeProjectHarnessEvolution(kept.skillRoot, kept.sidecarRoot, {
      ...kept.completeInput(keptStage),
      status: "keep",
      judge: keepJudge,
      validation: passingValidation(),
      note: "Published terminal attempt.",
    });
    await kept.writeProposal("proposal-reconsidered", "Must not reopen a keep result.");
    await expect(reconsiderProjectHarnessEvolution(kept.skillRoot, kept.sidecarRoot, {
      rejectedProposalId: keptStage.proposal_id,
      proposalId: "proposal-reconsidered",
      ownerId: "evolution-agent",
      e1Approved: true,
      reconsiderApproved: true,
    })).rejects.toThrow(/latest terminal result/);

    const reused = await createFixture();
    const rejectedStage = await reused.stage();
    await reused.completeRejected(rejectedStage);
    await reused.writeProposal("proposal-reconsidered", "Colliding attempt id.");
    const attemptRoot = join(reused.skillRoot, "state", "evolution", "attempts");
    await mkdir(attemptRoot, { recursive: true });
    await writeFile(join(attemptRoot, "proposal-reconsidered.json"), "{}\n", "utf8");
    await expect(reconsiderProjectHarnessEvolution(reused.skillRoot, reused.sidecarRoot, {
      rejectedProposalId: rejectedStage.proposal_id,
      proposalId: "proposal-reconsidered",
      ownerId: "evolution-agent",
      e1Approved: true,
      reconsiderApproved: true,
    })).rejects.toThrow(/fresh candidate and attempt id/);
  });

  it("records a second rejection as a new immutable lineage attempt", async () => {
    const fixture = await createFixture(7);
    const original = await fixture.stage();
    await fixture.completeRejected(original);
    await fixture.writeProposal("proposal-reconsidered-one", "First reconsideration proposal.");
    await reconsiderProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, {
      rejectedProposalId: original.proposal_id,
      proposalId: "proposal-reconsidered-one",
      ownerId: "evolution-agent",
      e1Approved: true,
      reconsiderApproved: true,
    });
    const firstReconsideration = await fixture.stage({ proposalId: "proposal-reconsidered-one" });
    await fixture.completeRejected(firstReconsideration);

    await fixture.writeProposal("proposal-reconsidered-two", "Second reconsideration proposal.");
    const secondClaim = await reconsiderProjectHarnessEvolution(fixture.skillRoot, fixture.sidecarRoot, {
      rejectedProposalId: firstReconsideration.proposal_id,
      proposalId: "proposal-reconsidered-two",
      ownerId: "evolution-agent",
      e1Approved: true,
      reconsiderApproved: true,
    });
    expect(secondClaim).toMatchObject({
      reconsidered_from_proposal_id: firstReconsideration.proposal_id,
      change_ids: changeIds(5),
      queued_change_ids_snapshot: changeIds(7).slice(5),
    });
    const firstAttempt = JSON.parse(await readFile(join(
      fixture.skillRoot,
      "state",
      "evolution",
      "attempts",
      `${firstReconsideration.proposal_id}.json`,
    ), "utf8")) as Record<string, unknown>;
    expect(firstAttempt).toMatchObject({
      parent_proposal_id: original.proposal_id,
      status: "rejected",
      published: false,
    });
  });

  it("fails closed when queued Changes or the immutable parent attempt drift", async () => {
    const queuedFixture = await createFixture(7);
    const rejectedStage = await queuedFixture.stage();
    await queuedFixture.completeRejected(rejectedStage);
    await queuedFixture.writeProposal("proposal-reconsidered", "Fresh reconsideration proposal.");
    await reconsiderProjectHarnessEvolution(queuedFixture.skillRoot, queuedFixture.sidecarRoot, {
      rejectedProposalId: rejectedStage.proposal_id,
      proposalId: "proposal-reconsidered",
      ownerId: "evolution-agent",
      e1Approved: true,
      reconsiderApproved: true,
    });
    await writeCompletedChanges(queuedFixture.skillRoot, 8);
    await expect(queuedFixture.stage({ proposalId: "proposal-reconsidered" }))
      .rejects.toThrow(/Queued Evolution Changes changed/);

    const parentFixture = await createFixture();
    const parentStage = await parentFixture.stage();
    await parentFixture.completeRejected(parentStage);
    await parentFixture.writeProposal("proposal-reconsidered", "Fresh reconsideration proposal.");
    const parentPath = join(parentFixture.skillRoot, "state", "evolution", "attempts", `${parentStage.proposal_id}.json`);
    const parent = JSON.parse(await readFile(parentPath, "utf8")) as Record<string, unknown>;
    await writeFile(parentPath, `${JSON.stringify({ ...parent, published: true }, null, 2)}\n`, "utf8");
    await expect(reconsiderProjectHarnessEvolution(parentFixture.skillRoot, parentFixture.sidecarRoot, {
      rejectedProposalId: parentStage.proposal_id,
      proposalId: "proposal-reconsidered",
      ownerId: "evolution-agent",
      e1Approved: true,
      reconsiderApproved: true,
    })).rejects.toThrow(/fingerprint drifted/);

    const ledgerFixture = await createFixture();
    const ledgerStage = await ledgerFixture.stage();
    await ledgerFixture.completeRejected(ledgerStage);
    await ledgerFixture.writeProposal("proposal-reconsidered", "Fresh reconsideration proposal.");
    const resultsPath = join(ledgerFixture.skillRoot, "state", "evolution", "results.tsv");
    const results = await readFile(resultsPath, "utf8");
    await writeFile(resultsPath, results.replace("Rejected by the independent Judge.", "Tampered note."), "utf8");
    await expect(reconsiderProjectHarnessEvolution(ledgerFixture.skillRoot, ledgerFixture.sidecarRoot, {
      rejectedProposalId: ledgerStage.proposal_id,
      proposalId: "proposal-reconsidered",
      ownerId: "evolution-agent",
      e1Approved: true,
      reconsiderApproved: true,
    })).rejects.toThrow(/results ledger drifted/);
  });
});

async function createFixture(changeCount = 5) {
  const root = await mkdtemp(join(tmpdir(), "aho-evolution-"));
  cleanup.push(root);
  const skillRoot = join(root, "skills", "sample-a1-harness");
  const candidateRoot = join(root, "candidate", "sample-a1-harness");
  const secondCandidateRoot = join(root, "candidate-two", "sample-a1-harness");
  const sidecarRoot = join(root, "sidecar");
  const projectRoot = join(root, "project");
  await createSkill(skillRoot, 27, "current");
  await createSkill(candidateRoot, 28, "candidate");
  await createSkill(secondCandidateRoot, 28, "candidate-two");
  await mkdir(join(projectRoot, "src"), { recursive: true });
  await writeFile(join(projectRoot, "src", "owner.ts"), "export const owner = 'current';\n", "utf8");
  await writeCompletedChanges(skillRoot, changeCount);
  await writeEvolutionProposal(skillRoot, "proposal-one", "Initial Evolution proposal.");

  const stageInput = {
    proposalId: "proposal-one",
    ownerId: "evolution-agent",
    mode: "focused" as const,
    e1Approved: true,
    candidateRoot,
    sourcePaths: ["src/owner.ts"],
    sourceSnapshot: new SourceFingerprintSnapshot({ projectRoot }),
  };
  const snapshot = () => new SourceFingerprintSnapshot({ projectRoot });
  const completeInput = (stage: Awaited<ReturnType<typeof stageProjectHarnessEvolution>>) => ({
    proposalId: stage.proposal_id,
    ownerId: stage.owner_id,
    claimToken: stage.claim_token,
    sourceSnapshot: snapshot(),
  });
  const judge = (
    stage: Awaited<ReturnType<typeof stageProjectHarnessEvolution>>,
    decision: "keep" | "reject",
    score: number,
  ) => ({
    schema_version: "1.0" as const,
    kind: "evolution-candidate-judge" as const,
    proposal_id: stage.proposal_id,
    candidate_fingerprint: stage.candidate_fingerprint,
    source_snapshot_digest: stage.source_snapshot_digest,
    author_id: "evolution-agent",
    judge_id: "independent-judge",
    eval_mode: "live" as const,
    dimensions: {
      evidence_grounding: score,
      project_relevance: score,
      mechanical_enforceability: score,
      regression_safety: score,
      context_cost: score,
    },
    score,
    hard_issues: [] as string[],
    decision,
    findings: [] as Array<{
      severity: "blocking" | "note";
      area: string;
      evidence: string;
      recommendation: string;
      text: string;
    }>,
    reviewed_at: "2026-08-03T03:00:00.000Z",
  });
  return {
    root,
    skillRoot,
    candidateRoot,
    secondCandidateRoot,
    sidecarRoot,
    projectRoot,
    stageInput,
    snapshot,
    completeInput,
    stage(overrides: Partial<typeof stageInput & { changeIds: readonly string[] }> = {}) {
      return stageProjectHarnessEvolution(skillRoot, sidecarRoot, { ...stageInput, ...overrides });
    },
    judge,
    writeProposal(proposalId: string, content: string) {
      return writeEvolutionProposal(skillRoot, proposalId, content);
    },
    async completeRejected(
      stage: Awaited<ReturnType<typeof stageProjectHarnessEvolution>>,
      options: { validationPassed?: boolean } = {},
    ) {
      const validationPassed = options.validationPassed ?? true;
      const report = judge(stage, "reject", 70);
      await writeFile(join(
        skillRoot,
        "state",
        "evolution",
        "proposals",
        `${stage.proposal_id}-judge.json`,
      ), `${JSON.stringify(report, null, 2)}\n`, "utf8");
      return completeProjectHarnessEvolution(skillRoot, sidecarRoot, {
        ...completeInput(stage),
        status: "rejected",
        judge: report,
        validation: {
          harnessPassed: validationPassed,
          projectPassed: validationPassed,
          fullTestRequired: false,
          fullTestPassed: false,
        },
        note: "Rejected by the independent Judge.",
      });
    },
  };
}

async function writeEvolutionProposal(skillRoot: string, proposalId: string, content: string): Promise<void> {
  const root = join(skillRoot, "state", "evolution", "proposals");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, `${proposalId}.md`), `# ${proposalId}\n\n${content}\n`, "utf8");
}

async function readProjectHarnessManifestForTest(skillRoot: string): Promise<{ skill_revision: number }> {
  return JSON.parse(await readFile(join(skillRoot, "state", "manifest.json"), "utf8")) as {
    skill_revision: number;
  };
}

function passingValidation() {
  return {
    harnessPassed: true,
    projectPassed: true,
    fullTestRequired: true,
    fullTestPassed: true,
  };
}

function changeIds(count: number): string[] {
  return Array.from({ length: count }, (_value, index) => `change-${String(index + 1).padStart(2, "0")}`);
}

async function writeCompletedChanges(skillRoot: string, count: number): Promise<void> {
  const root = join(skillRoot, "state", "registry", "changes");
  await mkdir(root, { recursive: true });
  for (const [index, changeId] of changeIds(count).entries()) {
    await writeFile(join(root, `${changeId}.json`), `${JSON.stringify({
      schema_version: "1.0",
      change_id: changeId,
      lane_id: `lane-${index + 1}`,
      status: "completed",
      claim_token: `claim-${index + 1}`,
      scope: "Verified project Harness behavior.",
      paths: ["src/project-harness"],
      base_commit: null,
      completion_commit: null,
      validation: ["targeted tests"],
      validation_passed: true,
      evidence_complete: true,
      contract_required: false,
      contract_path: null,
      evidence_paths: [`state/changes/archive/${changeId}`],
      integrated_by: null,
      integration_status: "not_required",
      repository_mode: "multi_lane",
      created_at: `2026-08-03T00:${String(index).padStart(2, "0")}:00.000Z`,
      updated_at: `2026-08-03T00:${String(index).padStart(2, "0")}:00.000Z`,
    }, null, 2)}\n`, "utf8");
  }
}

async function createSkill(root: string, revision: number, content: string): Promise<void> {
  await mkdir(join(root, "state", "evolution"), { recursive: true });
  await writeFile(join(root, "SKILL.md"), "---\nname: sample-a1-harness\n---\n", "utf8");
  await writeFile(join(root, "static.txt"), `${content}\n`, "utf8");
  await writeFile(join(root, "state", "manifest.json"), `${JSON.stringify({
    schema_version: "2.0",
    project_id: "sample-a1",
    project_name: "sample",
    skill_name: "sample-a1-harness",
    skill_revision: revision,
    analysis_status: "complete",
  }, null, 2)}\n`, "utf8");
  await writeFile(join(root, "state", "evolution", "state.json"), `${JSON.stringify({
    schema_version: "1.0",
    threshold: 5,
    evaluated_change_ids: [],
    pending_change_ids: [],
    pending: false,
  }, null, 2)}\n`, "utf8");
}
