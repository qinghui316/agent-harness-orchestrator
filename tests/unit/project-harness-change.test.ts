import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeProjectHarnessChange,
  createProjectHarnessChange,
  listProjectHarnessChanges,
  loadProjectHarnessContract,
  parkProjectHarnessChange,
  preflightProjectHarnessChange,
  publishProjectHarnessChange,
  readProjectHarnessChangeContext,
  readProjectHarnessChangeEvidence,
  resumeProjectHarnessChange,
  searchProjectHarnessChanges,
  type SourceFingerprintSnapshot,
} from "../../src/project-harness/change.js";
import { validateProjectHarnessChangeEvidence } from "../../src/project-harness/change-evidence.js";
import {
  projectHarnessConversationLane,
  readProjectHarnessLane,
  writeProjectHarnessBaseline,
  type GitAncestryProbe,
  type ProjectHarnessRegistryContext,
} from "../../src/project-harness/registry.js";

const cleanup: string[] = [];
const equalGitProbe: GitAncestryProbe = {
  async isRepository() { return true; },
  async resolveCommit(_root, reference) { return reference; },
  async isAncestor() { return false; },
};
const emptySnapshot: SourceFingerprintSnapshot = {
  async fingerprintSources() { return new Map(); },
};

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness Change", () => {
  it("claims one Change per Lane and cleans only its own partial claim after failure", async () => {
    const fixture = await createFixture();
    await expect(createProjectHarnessChange(fixture.context("lane-a"), {
      changeId: "failed-change",
      failureInjection(stage) {
        if (stage === "evidence-created") throw new Error("injected failure");
      },
    })).rejects.toThrow("injected failure");
    expect(await listProjectHarnessChanges(fixture.skillRoot)).toEqual([]);
    expect(existsSync(join(fixture.skillRoot, "state", "changes", "active", "failed-change"))).toBe(false);

    const context = fixture.context("lane-a");
    const outcomes = await Promise.allSettled([
      createProjectHarnessChange(context, { changeId: "first-change" }),
      createProjectHarnessChange(context, { changeId: "second-change" }),
    ]);
    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect(await listProjectHarnessChanges(fixture.skillRoot)).toHaveLength(1);
    expect((await readProjectHarnessLane(context))?.active_change_id).toMatch(/^(first|second)-change$/);
  });

  it("owns concurrent Changes by explicit conversation graph scope instead of branch order", async () => {
    const fixture = await createFixture();
    const first = fixture.context("shared-branch");
    first.lane = projectHarnessConversationLane("conversation-a", "graph-a");
    const second = fixture.context("shared-branch");
    second.lane = projectHarnessConversationLane("conversation-a", "graph-b");

    await createProjectHarnessChange(first, { changeId: "graph-change-a" });
    await createProjectHarnessChange(second, { changeId: "graph-change-b" });

    expect((await readProjectHarnessLane(first))?.active_change_id).toBe("graph-change-a");
    expect(await readProjectHarnessLane(second)).toMatchObject({
      kind: "conversation",
      repository_lane_id: expect.stringMatching(/^lane-[a-f0-9]{10}$/),
      branch: "shared-branch",
      conversation_id: "conversation-a",
      graph_scope_id: "graph-b",
      active_change_id: "graph-change-b",
    });
    await expect(createProjectHarnessChange(second, { changeId: "same-graph-rejected" }))
      .rejects.toThrow(/Lane already has an active Change/);
  });

  it("keeps explicit graph-scope Lanes concurrent for a non-Git project", async () => {
    const fixture = await createFixture();
    const first = { ...fixture.context("unused"), mode: "single_lane" as const, branch: null };
    first.lane = projectHarnessConversationLane("conversation-a", "graph-a");
    const second = { ...fixture.context("unused"), mode: "single_lane" as const, branch: null };
    second.lane = projectHarnessConversationLane("conversation-b", "graph-b");

    await createProjectHarnessChange(first, { changeId: "non-git-a" });
    await createProjectHarnessChange(second, { changeId: "non-git-b" });

    expect((await listProjectHarnessChanges(fixture.skillRoot)).map((change) => change.change_id))
      .toEqual(["non-git-a", "non-git-b"]);
    expect((await readProjectHarnessLane(first))?.repository_lane_id).toBe("lane-single");
    expect((await readProjectHarnessLane(second))?.repository_lane_id).toBe("lane-single");
  });

  it("accepts multiline task evidence and rejects the retired Plan approved review field", async () => {
    const fixture = await createFixture();
    const context = fixture.context("lane-evidence");
    await createProjectHarnessChange(context, { changeId: "evidence-change" });
    const evidenceRoot = fixture.evidence("active", "evidence-change");

    await expect(validateProjectHarnessChangeEvidence(evidenceRoot)).resolves.toEqual({ valid: true, issues: [] });
    await writeFile(join(evidenceRoot, "reviews", "review.md"), "- Plan approved: yes\n", "utf8");
    const result = await validateProjectHarnessChangeEvidence(evidenceRoot);
    expect(result.valid).toBe(false);
    expect(result.issues).toContain("reviews/review.md does not approve the plan");
  });

  it("returns a deterministic typed evidence fingerprint for every physical Change file", async () => {
    const fixture = await createFixture();
    const context = fixture.context("lane-evidence-fingerprint");
    await createProjectHarnessChange(context, { changeId: "fingerprinted-change" });

    const first = await readProjectHarnessChangeEvidence(fixture.skillRoot, "fingerprinted-change");
    const second = await readProjectHarnessChangeEvidence(fixture.skillRoot, "fingerprinted-change");
    expect(second).toEqual(first);
    expect(first).toMatchObject({
      evidence_state: "active",
      evidence_path: "state/changes/active/fingerprinted-change",
      content_fingerprint: expect.stringMatching(/^[a-f0-9]{64}$/),
    });
    expect(first.files.map((file) => file.path)).toEqual([
      "plan.md",
      "reviews/review.md",
      "spec.md",
      "summary.md",
      "tasks.md",
    ]);

    await writeFile(join(fixture.evidence("active", "fingerprinted-change"), "summary.md"), "changed\n", "utf8");
    const changed = await readProjectHarnessChangeEvidence(fixture.skillRoot, "fingerprinted-change");
    expect(changed.content_fingerprint).not.toBe(first.content_fingerprint);
    expect(changed.files.find((file) => file.path === "summary.md")?.sha256)
      .not.toBe(first.files.find((file) => file.path === "summary.md")?.sha256);
  });

  it("serializes concurrent resume claims onto the destination Lane", async () => {
    const fixture = await createFixture();
    const source = fixture.context("lane-parking");
    await createProjectHarnessChange(source, { changeId: "parked-one" });
    await parkProjectHarnessChange(source, "parked-one");
    await createProjectHarnessChange(source, { changeId: "parked-two" });
    await parkProjectHarnessChange(source, "parked-two");
    const destination = fixture.context("lane-resume");

    const outcomes = await Promise.allSettled([
      resumeProjectHarnessChange(destination, "parked-one"),
      resumeProjectHarnessChange(destination, "parked-two"),
    ]);

    expect(outcomes.filter((outcome) => outcome.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome.status === "rejected")).toHaveLength(1);
    expect((await readProjectHarnessLane(destination))?.active_change_id).toMatch(/^parked-(one|two)$/);
  });

  it("publishes normalized scope and a bound architecture contract", async () => {
    const fixture = await createFixture();
    const context = fixture.context("lane-contract");
    await createProjectHarnessChange(context, { changeId: "contract-change" });

    const record = await publishProjectHarnessChange(context, {
      changeId: "contract-change",
      scope: "Own the project Harness Registry.",
      paths: ["src\\project-harness", "src/project-harness/change.ts"],
      modules: ["Project Harness"],
      tags: ["Registry"],
      status: "active",
      validation: ["vitest project-harness-change"],
      contract: {
        kind: "module_boundary",
        subject: "Project Harness Runtime",
        operation: "own daily Change lifecycle",
        owner_module: "Project Harness",
        affected_paths: ["src/project-harness"],
        consumers: ["Workbench Runtime"],
        depends_on: ["Project Runtime Paths"],
        depends_on_changes: [],
        compatibility: "single implementation",
        status: "active",
      },
    });

    expect(record).toMatchObject({
      status: "active",
      paths: ["src/project-harness", "src/project-harness/change.ts"],
      modules: ["project-harness"],
      tags: ["registry"],
      contract_required: true,
      contract_path: "state/registry/contracts/contract-change.json",
    });
    await expect(loadProjectHarnessContract(fixture.skillRoot, "contract-change")).resolves.toMatchObject({
      change_id: "contract-change",
      subject: "project-harness-runtime",
      owner_module: "project-harness",
      consumers: ["workbench-runtime"],
      depends_on: ["project-runtime-paths"],
    });
  });

  it("blocks active overlap but treats a completed non-integrated overlap as advisory", async () => {
    const fixture = await createFixture();
    const first = fixture.context("lane-first");
    const second = fixture.context("lane-second");
    await createProjectHarnessChange(first, { changeId: "first-change" });
    await publishProjectHarnessChange(first, {
      changeId: "first-change",
      status: "active",
      paths: ["src/project-harness"],
      validation: ["first validation"],
    });
    await createProjectHarnessChange(second, { changeId: "second-change" });
    await publishProjectHarnessChange(second, {
      changeId: "second-change",
      status: "active",
      paths: ["src/project-harness/change.ts"],
      validation: ["second validation"],
    });

    const conflict = await preflightProjectHarnessChange(second, {
      changeId: "second-change",
      sourceSnapshot: emptySnapshot,
      gitProbe: equalGitProbe,
    });
    expect(conflict.action).toBe("replan");
    expect(conflict.conflicts).toEqual([expect.objectContaining({ type: "path", other_change_id: "first-change" })]);

    await parkProjectHarnessChange(second, "second-change");
    await closeProjectHarnessChange(first, {
      changeId: "first-change",
      status: "completed",
      validationPassed: true,
      sourceSnapshot: emptySnapshot,
      gitProbe: equalGitProbe,
    });
    await resumeProjectHarnessChange(second, "second-change");
    const advisory = await preflightProjectHarnessChange(second, {
      changeId: "second-change",
      sourceSnapshot: emptySnapshot,
      gitProbe: equalGitProbe,
    });
    expect(advisory.action).toBe("continue");
    expect(advisory.conflicts).toEqual([]);
    expect(advisory.historical_overlaps).toEqual([
      expect.objectContaining({ type: "path", other_change_id: "first-change" }),
    ]);
  });

  it("uses one sorted unique source snapshot and returns refresh-needed for related drift", async () => {
    const fixture = await createFixture();
    const context = fixture.context("lane-drift");
    await createProjectHarnessChange(context, { changeId: "drift-change" });
    await publishProjectHarnessChange(context, {
      changeId: "drift-change",
      status: "active",
      paths: ["src/shared.ts"],
      contract: {
        kind: "module_boundary",
        subject: "Shared Owner",
        operation: "replace owner",
        owner_module: "shared-module",
        affected_paths: ["src/shared.ts"],
        consumers: [],
        depends_on: [],
        depends_on_changes: [],
        compatibility: "none",
        status: "active",
      },
    });
    await fixture.writeKnowledge("modules/shared.md", "shared-owner", "shared-module", ["src/shared.ts", "src/other.ts"]);
    await fixture.writeKnowledge("modules/unrelated.md", "unrelated-owner", "unrelated-module", ["src/unrelated.ts"]);
    await writeFile(join(fixture.wikiRoot, ".ecl-baselines.json"), `${JSON.stringify({
      documents: {
        "shared-owner": {
          path: "modules/shared.md",
          source_fingerprints: { "src/shared.ts": "old-shared", "src/other.ts": "same-other" },
        },
        "unrelated-owner": {
          path: "modules/unrelated.md",
          source_fingerprints: { "src/unrelated.ts": "unrelated" },
        },
      },
    }, null, 2)}\n`, "utf8");
    const fingerprintSources = vi.fn(async (paths: readonly string[]) => new Map(paths.map((path) => [
      path,
      path === "src/shared.ts" ? "new-shared" : "same-other",
    ])));

    const result = await preflightProjectHarnessChange(context, {
      changeId: "drift-change",
      sourceSnapshot: { fingerprintSources },
      gitProbe: equalGitProbe,
    });

    expect(fingerprintSources).toHaveBeenCalledTimes(1);
    expect(fingerprintSources).toHaveBeenCalledWith(["src/other.ts", "src/shared.ts"]);
    expect(result.knowledge).toMatchObject({
      status: "refresh-needed",
      candidate_items: 1,
      checked_sources: 2,
    });
    expect(result.knowledge.drift_impacts).toEqual([
      expect.objectContaining({ knowledge_id: "shared-owner", related_sources: ["src/shared.ts"] }),
    ]);
    expect(result.action).toBe("replan");
  });

  it("runs scoped preflight before multi-Lane close, archives without a completion commit, and keeps terminal evidence immutable", async () => {
    const fixture = await createFixture();
    const context = fixture.context("lane-close");
    await createProjectHarnessChange(context, { changeId: "close-change" });
    await publishProjectHarnessChange(context, {
      changeId: "close-change",
      status: "active",
      paths: ["src/project-harness/change.ts"],
      validation: ["targeted tests passed"],
    });
    const fingerprintSources = vi.fn(async () => new Map<string, string | null>());

    const closed = await closeProjectHarnessChange(context, {
      changeId: "close-change",
      status: "completed",
      validationPassed: true,
      sourceSnapshot: { fingerprintSources },
      gitProbe: equalGitProbe,
      now: () => "2026-08-03T02:00:00.000Z",
    });

    expect(closed.status).toBe("closed");
    expect(closed.preflight?.action).toBe("continue");
    expect(closed.change).toMatchObject({
      status: "completed",
      evidence_complete: true,
      completion_commit: null,
      evidence_paths: ["state/changes/archive/close-change"],
    });
    expect(existsSync(fixture.evidence("active", "close-change"))).toBe(false);
    expect(existsSync(fixture.evidence("archive", "close-change"))).toBe(true);
    expect((await readProjectHarnessLane(context))?.active_change_id).toBeNull();
    await expect(publishProjectHarnessChange(context, {
      changeId: "close-change",
      scope: "must not change",
    })).rejects.toThrow(/Terminal Change cannot be mutated/);

    const search = await searchProjectHarnessChanges(fixture.skillRoot, "close-change", ["completed"]);
    expect(search).toHaveLength(1);
    const loaded = await readProjectHarnessChangeContext(fixture.skillRoot, "close-change", true);
    expect(loaded.evidence_state).toBe("archive");
    expect(loaded.documents["tasks.md"]).toContain("owner: project-harness");
    const index = JSON.parse(await readFile(join(fixture.skillRoot, "state", "changes", "INDEX.json"), "utf8")) as {
      generated_at: string;
      changes: Array<{ change_id: string }>;
    };
    expect(index.generated_at).toBe("2026-08-03T02:00:00.000Z");
    expect(index.changes).toEqual([expect.objectContaining({ change_id: "close-change" })]);
    expect(existsSync(join(fixture.skillRoot, "state", "maintenance"))).toBe(false);
  });
});

async function createFixture(): Promise<{
  root: string;
  projectRoot: string;
  skillRoot: string;
  wikiRoot: string;
  context(branch: string): ProjectHarnessRegistryContext;
  evidence(state: "active" | "parking" | "archive", changeId: string): string;
  writeKnowledge(relativePath: string, id: string, module: string, evidence: string[]): Promise<void>;
}> {
  const root = await mkdtemp(join(tmpdir(), "aho-project-change-"));
  cleanup.push(root);
  const projectRoot = join(root, "project");
  const skillRoot = join(root, "skill");
  const wikiRoot = join(skillRoot, "references", "project_wiki");
  await mkdir(projectRoot, { recursive: true });
  await mkdir(wikiRoot, { recursive: true });
  await writeTemplates(skillRoot);
  await writeProjectHarnessBaseline(skillRoot, {
    schema_version: "1.0",
    canonical_branch: "main",
    canonical_commit: "same",
    updated_at: "2026-08-03T00:00:00.000Z",
  });
  return {
    root,
    projectRoot,
    skillRoot,
    wikiRoot,
    context(branch) {
      return {
        projectId: "sample-a1",
        projectRoot,
        skillRoot,
        mode: "multi_lane",
        branch,
        headCommit: "same",
      };
    },
    evidence(state, changeId) {
      return join(skillRoot, "state", "changes", state, changeId);
    },
    async writeKnowledge(relativePath, id, module, evidence) {
      const path = join(wikiRoot, ...relativePath.split("/"));
      await mkdir(join(path, ".."), { recursive: true });
      await writeFile(path, [
        "---",
        "ecl:",
        `  id: ${id}`,
        "  layer: L2",
        "  kind: current",
        "  status: implemented",
        `  owner: ${id}`,
        `  modules: [${module}]`,
        "  evidence:",
        ...evidence.map((item) => `    - ${item}`),
        "---",
        "",
        "Current evidence.",
        "",
      ].join("\n"), "utf8");
    },
  };
}

async function writeTemplates(skillRoot: string): Promise<void> {
  const root = join(skillRoot, "assets", "templates");
  await mkdir(root, { recursive: true });
  await Promise.all([
    writeFile(join(root, "summary.md"), "# {{CHANGE_ID}}\n\nComplete summary.\n", "utf8"),
    writeFile(join(root, "spec.md"), "# Specification\n\n- AC-001: The scoped behavior is verified.\n", "utf8"),
    writeFile(join(root, "plan.md"), "# Plan\n\n- Approved: yes\n", "utf8"),
    writeFile(join(root, "tasks.md"), [
      "# Tasks",
      "",
      "- [x] T001 Implement AC-001",
      "  - owner: project-harness",
      "  - path: src/project-harness/change.ts",
      "  - validation: targeted tests passed",
      "",
    ].join("\n"), "utf8"),
    writeFile(join(root, "review.md"), "# Review\n\n- Approved: yes\n", "utf8"),
  ]);
}
