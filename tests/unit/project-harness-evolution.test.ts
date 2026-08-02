import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  checkProjectHarnessEvolution,
  completeProjectHarnessEvolution,
  readProjectHarnessEvolutionState,
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
    expect(state.pending_change_ids).toEqual(changeIds(7));

    const stage = await fixture.stage();
    expect(stage.change_ids).toEqual(changeIds(5));
    await fixture.completeRejected(stage, { validationPassed: false });

    const completed = await readProjectHarnessEvolutionState(fixture.skillRoot);
    expect(completed.evaluated_change_ids).toEqual(changeIds(5));
    expect(completed.pending_change_ids).toEqual(changeIds(7).slice(5));
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
    async completeRejected(
      stage: Awaited<ReturnType<typeof stageProjectHarnessEvolution>>,
      options: { validationPassed?: boolean } = {},
    ) {
      const validationPassed = options.validationPassed ?? true;
      return completeProjectHarnessEvolution(skillRoot, sidecarRoot, {
        ...completeInput(stage),
        status: "rejected",
        judge: judge(stage, "reject", 70),
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
