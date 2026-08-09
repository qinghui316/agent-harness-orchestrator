import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

let injectCandidatePublishedFailure = false;

vi.mock("../../src/project-harness/publication.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../src/project-harness/publication.js")>();
  return {
    ...actual,
    publishProjectHarnessCandidate(options: Parameters<typeof actual.publishProjectHarnessCandidate>[0]) {
      return actual.publishProjectHarnessCandidate({
        ...options,
        async failureInjection(stage) {
          await options.failureInjection?.(stage);
          if (injectCandidatePublishedFailure && stage === "candidate-published") {
            throw new Error("injected reconsideration candidate-published failure");
          }
        },
      });
    },
  };
});

import {
  completeProjectHarnessEvolution,
  reconsiderProjectHarnessEvolution,
  stageProjectHarnessEvolution,
} from "../../src/project-harness/evolution.js";
import { SourceFingerprintSnapshot } from "../../src/project-harness/source-fingerprint.js";
import { readProjectHarnessWriterLock, projectHarnessSharedWriterRoot } from "../../src/project-harness/writer-lock.js";

const cleanup: string[] = [];

afterEach(async () => {
  injectCandidatePublishedFailure = false;
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness Evolution reconsideration failure recovery", () => {
  it("restores content, terminal evidence, revision, owner, and writer after publication fails", async () => {
    const root = await mkdtemp(join(tmpdir(), "aho-evolution-reconsider-failure-"));
    cleanup.push(root);
    const skillRoot = join(root, "sample-a1-harness");
    const initialCandidate = join(root, "initial-candidate");
    const reconsideredCandidate = join(root, "reconsidered-candidate");
    const sidecarRoot = join(root, "sidecar");
    const projectRoot = join(root, "project");
    await createSkill(skillRoot, 27, "current");
    await createSkill(initialCandidate, 28, "initial candidate");
    await createSkill(reconsideredCandidate, 28, "reconsidered candidate");
    await mkdir(join(projectRoot, "src"), { recursive: true });
    await writeFile(join(projectRoot, "src", "owner.ts"), "export const owner = 'current';\n", "utf8");
    await writeCompletedChanges(skillRoot, 7);
    await writeProposal(skillRoot, "initial-proposal", "Initial proposal.");

    const snapshot = () => new SourceFingerprintSnapshot({ projectRoot });
    const initialStage = await stageProjectHarnessEvolution(skillRoot, sidecarRoot, {
      proposalId: "initial-proposal",
      ownerId: "evolution-owner",
      mode: "focused",
      e1Approved: true,
      candidateRoot: initialCandidate,
      sourcePaths: ["src/owner.ts"],
      sourceSnapshot: snapshot(),
    });
    const rejectedJudge = judge(initialStage, "reject", 70);
    await writeFile(
      join(skillRoot, "state", "evolution", "proposals", "initial-proposal-judge.json"),
      `${JSON.stringify(rejectedJudge, null, 2)}\n`,
      "utf8",
    );
    await completeProjectHarnessEvolution(skillRoot, sidecarRoot, {
      proposalId: initialStage.proposal_id,
      ownerId: initialStage.owner_id,
      claimToken: initialStage.claim_token,
      status: "rejected",
      judge: rejectedJudge,
      validation: passingValidation(),
      note: "Initial rejection.",
      sourceSnapshot: snapshot(),
    });

    await writeProposal(skillRoot, "reconsidered-proposal", "Fresh reconsideration proposal.");
    await reconsiderProjectHarnessEvolution(skillRoot, sidecarRoot, {
      rejectedProposalId: initialStage.proposal_id,
      proposalId: "reconsidered-proposal",
      ownerId: "evolution-owner",
      e1Approved: true,
      reconsiderApproved: true,
    });
    const stage = await stageProjectHarnessEvolution(skillRoot, sidecarRoot, {
      proposalId: "reconsidered-proposal",
      ownerId: "evolution-owner",
      mode: "focused",
      e1Approved: true,
      candidateRoot: reconsideredCandidate,
      sourcePaths: ["src/owner.ts"],
      sourceSnapshot: snapshot(),
      changeIds: initialStage.change_ids,
    });
    const keepJudge = judge(stage, "keep", 90);
    await writeFile(
      join(skillRoot, "state", "evolution", "proposals", "reconsidered-proposal-judge.json"),
      `${JSON.stringify(keepJudge, null, 2)}\n`,
      "utf8",
    );

    const statePath = join(skillRoot, "state", "evolution", "state.json");
    const resultsPath = join(skillRoot, "state", "evolution", "results.tsv");
    const manifestPath = join(skillRoot, "state", "manifest.json");
    const parentPath = join(skillRoot, "state", "evolution", "attempts", "initial-proposal.json");
    const before = await Promise.all([
      readFile(statePath), readFile(resultsPath), readFile(manifestPath), readFile(parentPath),
    ]);

    injectCandidatePublishedFailure = true;
    await expect(completeProjectHarnessEvolution(skillRoot, sidecarRoot, {
      proposalId: stage.proposal_id,
      ownerId: stage.owner_id,
      claimToken: stage.claim_token,
      status: "keep",
      judge: keepJudge,
      validation: passingValidation(),
      note: "Injected failure must roll back.",
      sourceSnapshot: snapshot(),
    })).rejects.toThrow(/injected reconsideration candidate-published failure/);

    expect(await readFile(join(skillRoot, "static.txt"), "utf8")).toBe("current\n");
    expect(await Promise.all([
      readFile(statePath), readFile(resultsPath), readFile(manifestPath), readFile(parentPath),
    ])).toEqual(before);
    expect(await readProjectHarnessWriterLock(projectHarnessSharedWriterRoot(sidecarRoot))).toBeNull();
    expect(await readFile(join(skillRoot, "state", "registry", "locks", "evolution-owner", "owner.json"), "utf8"))
      .toContain('"proposal_id": "reconsidered-proposal"');
  });
});

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

async function writeCompletedChanges(skillRoot: string, count: number): Promise<void> {
  const root = join(skillRoot, "state", "registry", "changes");
  await mkdir(root, { recursive: true });
  for (let index = 0; index < count; index += 1) {
    const changeId = `change-${String(index + 1).padStart(2, "0")}`;
    await writeFile(join(root, `${changeId}.json`), `${JSON.stringify({
      schema_version: "1.0", change_id: changeId, lane_id: `lane-${index + 1}`,
      status: "completed", claim_token: `claim-${index + 1}`, scope: "fixture",
      paths: ["src/project-harness"], base_commit: null, completion_commit: null,
      validation: ["targeted tests"], validation_passed: true, evidence_complete: true,
      contract_required: false, contract_path: null, evidence_paths: [`state/changes/archive/${changeId}`],
      integrated_by: null, integration_status: "not_required", repository_mode: "multi_lane",
      created_at: `2026-08-03T00:${String(index).padStart(2, "0")}:00.000Z`,
      updated_at: `2026-08-03T00:${String(index).padStart(2, "0")}:00.000Z`,
    }, null, 2)}\n`, "utf8");
  }
}

async function writeProposal(skillRoot: string, proposalId: string, content: string): Promise<void> {
  const root = join(skillRoot, "state", "evolution", "proposals");
  await mkdir(root, { recursive: true });
  await writeFile(join(root, `${proposalId}.md`), `# ${proposalId}\n\n${content}\n`, "utf8");
}

function judge(
  stage: Awaited<ReturnType<typeof stageProjectHarnessEvolution>>,
  decision: "keep" | "reject",
  score: number,
) {
  return {
    schema_version: "1.0" as const,
    kind: "evolution-candidate-judge" as const,
    proposal_id: stage.proposal_id,
    candidate_fingerprint: stage.candidate_fingerprint,
    source_snapshot_digest: stage.source_snapshot_digest,
    author_id: "evolution-owner",
    judge_id: "independent-judge",
    eval_mode: "live" as const,
    dimensions: {
      evidence_grounding: score, project_relevance: score, mechanical_enforceability: score,
      regression_safety: score, context_cost: score,
    },
    score,
    hard_issues: [] as string[],
    decision,
    findings: [] as Array<Record<string, unknown>>,
    reviewed_at: "2026-08-09T00:00:00.000Z",
  };
}

function passingValidation() {
  return { harnessPassed: true, projectPassed: true, fullTestRequired: false, fullTestPassed: false };
}
