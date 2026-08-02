import { cp, mkdtemp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import {
  fingerprintProjectHarness,
  PROJECT_HARNESS_DYNAMIC_PATHS,
} from "../../src/project-harness/fingerprint.js";
import {
  publishProjectHarnessCandidate,
  recoverProjectHarnessPublication,
  type ProjectHarnessPublicationJournal,
} from "../../src/project-harness/publication.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness atomic publication", () => {
  it("publishes one reviewed candidate while preserving dynamic state", async () => {
    const fixture = await createFixture();
    const result = await publishProjectHarnessCandidate({
      ...fixture.options,
      transactionId: "publish-success",
    });
    expect(result.stage).toBe("completed");
    expect(await readFile(join(fixture.current, "static.txt"), "utf8")).toBe("candidate\n");
    expect(await readFile(join(fixture.current, "state", "changes", "active", "change.txt"), "utf8")).toBe("current-state\n");
    const manifest = JSON.parse(await readFile(join(fixture.current, "state", "manifest.json"), "utf8")) as { skill_revision: number };
    expect(manifest.skill_revision).toBe(28);
  });

  it.each(["current-moved", "candidate-published"] as const)(
    "restores the exact current Harness when failure is injected after %s",
    async (failureStage) => {
      const fixture = await createFixture();
      const before = await fingerprintProjectHarness(fixture.current);
      await expect(publishProjectHarnessCandidate({
        ...fixture.options,
        transactionId: `publish-fail-${failureStage}`,
        failureInjection(stage) {
          if (stage === failureStage) throw new Error(`injected ${stage}`);
        },
      })).rejects.toThrow(/rolled back/);
      expect(await fingerprintProjectHarness(fixture.current)).toBe(before);
      expect(await readFile(join(fixture.current, "static.txt"), "utf8")).toBe("current\n");
    },
  );

  it("rejects a changed candidate before moving the current Harness", async () => {
    const fixture = await createFixture();
    await writeFile(join(fixture.candidate, "static.txt"), "tampered\n", "utf8");
    await expect(publishProjectHarnessCandidate({
      ...fixture.options,
      transactionId: "publish-tampered",
    })).rejects.toThrow(/reviewed candidate/);
    expect(await readFile(join(fixture.current, "static.txt"), "utf8")).toBe("current\n");
  });

  it("recovers a crash after current moved by restoring the exact previous root", async () => {
    const fixture = await createFixture();
    const journal = await prepareCrashJournal(fixture, "recover-current-moved");
    await cp(fixture.candidate, journal.stagedCandidateRoot, { recursive: true, force: false });
    await rename(fixture.current, journal.previousRoot);
    journal.stage = "current-moved";
    await writeJournal(fixture.sidecar, journal);

    const recovered = await recoverProjectHarnessPublication({
      sidecarRoot: fixture.sidecar,
      journalPath: journalPath(fixture.sidecar, journal.transactionId),
      ownerId: "recovery-owner",
    });
    expect(recovered.stage).toBe("rolled-back");
    expect(await readFile(join(fixture.current, "static.txt"), "utf8")).toBe("current\n");
  });

  it("finishes a verified candidate after a crash at the publication commit point", async () => {
    const fixture = await createFixture();
    const journal = await prepareCrashJournal(fixture, "recover-candidate-published");
    await writeFile(join(fixture.candidate, "state", "changes", "active", "change.txt"), "current-state\n", "utf8");
    await rename(fixture.current, journal.previousRoot);
    await rename(fixture.candidate, fixture.current);
    journal.stage = "candidate-published";
    await writeJournal(fixture.sidecar, journal);

    const recovered = await recoverProjectHarnessPublication({
      sidecarRoot: fixture.sidecar,
      journalPath: journalPath(fixture.sidecar, journal.transactionId),
      ownerId: "recovery-owner",
    });
    expect(recovered.stage).toBe("completed");
    expect(await readFile(join(fixture.current, "static.txt"), "utf8")).toBe("candidate\n");
  });
});

async function createFixture(): Promise<{
  current: string;
  candidate: string;
  sidecar: string;
  options: {
    projectId: string;
    ownerId: string;
    currentSkillRoot: string;
    candidateSkillRoot: string;
    sidecarRoot: string;
    expectedCurrentFingerprint: string;
    expectedCandidateContentFingerprint: string;
  };
}> {
  const root = await mkdtemp(join(tmpdir(), "aho-publication-"));
  cleanup.push(root);
  const current = join(root, "skills", "sample-a1-harness");
  const candidate = join(root, "candidate", "sample-a1-harness");
  const sidecar = join(root, "sidecar");
  await createSkill(current, 27, "current");
  await createSkill(candidate, 28, "candidate");
  await mkdir(join(current, "state", "changes", "active"), { recursive: true });
  await writeFile(join(current, "state", "changes", "active", "change.txt"), "current-state\n", "utf8");
  await mkdir(join(candidate, "state", "changes", "active"), { recursive: true });
  await writeFile(join(candidate, "state", "changes", "active", "change.txt"), "candidate-state\n", "utf8");
  return {
    current,
    candidate,
    sidecar,
    options: {
      projectId: "sample-a1",
      ownerId: "test-owner",
      currentSkillRoot: current,
      candidateSkillRoot: candidate,
      sidecarRoot: sidecar,
      expectedCurrentFingerprint: await fingerprintProjectHarness(current),
      expectedCandidateContentFingerprint: await fingerprintProjectHarness(candidate, { exclude: PROJECT_HARNESS_DYNAMIC_PATHS }),
    },
  };
}

async function prepareCrashJournal(
  fixture: Awaited<ReturnType<typeof createFixture>>,
  transactionId: string,
): Promise<ProjectHarnessPublicationJournal> {
  const parent = join(fixture.current, "..");
  const now = new Date().toISOString();
  return {
    schemaVersion: "1.0",
    transactionId,
    projectId: "sample-a1",
    skillName: "sample-a1-harness",
    currentSkillRoot: fixture.current,
    sourceCandidateRoot: fixture.candidate,
    stagedCandidateRoot: join(parent, `.sample-a1-harness.${transactionId}.candidate`),
    previousRoot: join(parent, `.sample-a1-harness.${transactionId}.previous`),
    currentContentFingerprint: fixture.options.expectedCurrentFingerprint,
    candidateContentFingerprint: fixture.options.expectedCandidateContentFingerprint,
    preservedPaths: [...PROJECT_HARNESS_DYNAMIC_PATHS],
    stage: "prepared",
    error: null,
    createdAt: now,
    updatedAt: now,
  };
}

async function writeJournal(sidecar: string, journal: ProjectHarnessPublicationJournal): Promise<void> {
  const path = journalPath(sidecar, journal.transactionId);
  await mkdir(join(sidecar, "transactions"), { recursive: true });
  await writeFile(path, `${JSON.stringify(journal, null, 2)}\n`, "utf8");
}

function journalPath(sidecar: string, transactionId: string): string {
  return join(sidecar, "transactions", `${transactionId}.json`);
}

async function createSkill(root: string, revision: number, content: string): Promise<void> {
  await mkdir(join(root, "state"), { recursive: true });
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
}
