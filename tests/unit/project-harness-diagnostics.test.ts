import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { auditProjectHarness, doctorProjectHarness } from "../../src/project-harness/diagnostics.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness diagnostics", () => {
  it("reports a structurally consistent self-contained Skill as healthy", async () => {
    const skillRoot = await createSkill();
    const doctor = await doctorProjectHarness({ skillRoot, expectedProjectId: "sample-a1" });
    expect(doctor.healthy).toBe(true);
    expect(doctor.revision).toBe(27);
    expect(doctor.counts).toMatchObject({
      activeChanges: 1,
      parkingChanges: 0,
      archivedChanges: 0,
      registryChanges: 1,
      lanes: 1,
      contracts: 1,
      integrations: 0,
      evolutionPending: false,
    });

    const audit = await auditProjectHarness({ skillRoot, expectedProjectId: "sample-a1" });
    expect(audit.healthy).toBe(true);
    expect(audit.findings).toEqual([]);
  });

  it("finds INDEX/Registry lifecycle drift without changing state", async () => {
    const skillRoot = await createSkill();
    const indexPath = join(skillRoot, "state", "changes", "INDEX.json");
    await writeJson(indexPath, { schema_version: "1.0", changes: [] });
    const beforeAudit = await readFile(indexPath, "utf8");
    const result = await auditProjectHarness({ skillRoot });
    expect(result.healthy).toBe(false);
    expect(result.findings.map((item) => item.code)).toContain("change_index_drift");
    expect(await readFile(indexPath, "utf8")).toBe(beforeAudit);
  });

  it("rejects machine absolute paths in portable project Skill state", async () => {
    const skillRoot = await createSkill();
    await writeJson(join(skillRoot, "state", "registry", "baseline.json"), {
      schema_version: "1.0",
      project_path: "C:\\machine\\project",
    });
    const result = await auditProjectHarness({ skillRoot });
    expect(result.healthy).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: "absolute_path_in_skill_state",
      path: "state/registry/baseline.json",
    }));
  });

  it("fails when a required daily workflow is missing", async () => {
    const skillRoot = await createSkill();
    await rm(join(skillRoot, "references", "workflows", "close.md"));
    const result = await doctorProjectHarness({ skillRoot });
    expect(result.healthy).toBe(false);
    expect(result.findings).toContainEqual(expect.objectContaining({
      code: "missing_required_file",
      path: "references/workflows/close.md",
    }));
  });
});

async function createSkill(): Promise<string> {
  const parent = await mkdtemp(join(tmpdir(), "aho-diagnostics-"));
  cleanup.push(parent);
  const root = join(parent, "sample-a1-harness");
  const directories = [
    "references/project_wiki",
    "references/rules/by-stage",
    "references/workflows",
    "state/analysis",
    "state/changes/active/change-1/reviews",
    "state/changes/parking",
    "state/changes/archive",
    "state/registry/changes",
    "state/registry/contracts",
    "state/registry/integrations",
    "state/registry/lanes",
    "state/registry/locks",
    "state/evolution",
  ];
  await Promise.all(directories.map((path) => mkdir(join(root, path), { recursive: true })));
  await writeFile(join(root, "SKILL.md"), "---\nname: sample-a1-harness\n---\n", "utf8");
  await writeJson(join(root, "references", "audit-rubric.json"), { schema_version: "1.0" });
  await writeFile(join(root, "references", "project_wiki", "catalog.md"), "# Catalog\n", "utf8");
  await writeJson(join(root, "references", "project_wiki", ".ecl-baselines.json"), { schema_version: "1.0", documents: {} });
  await writeFile(join(root, "references", "rules", "red_lines.yaml"), "schema_version: '1.0'\n", "utf8");
  await writeFile(join(root, "references", "rules", "critical.md"), "# Critical\n", "utf8");
  for (const stage of ["intake", "locate", "plan", "implement", "verify", "close", "integrate", "evolve", "bootstrap-project"]) {
    await writeFile(join(root, "references", "workflows", `${stage}.md`), `# ${stage}\n`, "utf8");
  }
  await writeJson(join(root, "state", "manifest.json"), {
    schema_version: "2.0",
    project_id: "sample-a1",
    project_name: "sample",
    skill_name: "sample-a1-harness",
    skill_revision: 27,
    analysis_status: "complete",
  });
  for (const file of ["summary.md", "spec.md", "plan.md", "tasks.md"]) {
    await writeFile(join(root, "state", "changes", "active", "change-1", file), `# ${file}\n`, "utf8");
  }
  await writeFile(join(root, "state", "changes", "active", "change-1", "reviews", "review.md"), "# Review\n", "utf8");
  await writeJson(join(root, "state", "changes", "INDEX.json"), {
    schema_version: "1.0",
    changes: [{ change_id: "change-1", status: "active" }],
  });
  await writeJson(join(root, "state", "registry", "baseline.json"), { schema_version: "1.0", events: [] });
  await writeJson(join(root, "state", "registry", "changes", "change-1.json"), {
    schema_version: "1.0",
    change_id: "change-1",
    lane_id: "lane-main",
    status: "active",
  });
  await writeJson(join(root, "state", "registry", "contracts", "change-1.json"), {
    schema_version: "1.0",
    change_id: "change-1",
  });
  await writeJson(join(root, "state", "registry", "lanes", "lane-main.json"), {
    schema_version: "1.0",
    lane_id: "lane-main",
    active_change_id: "change-1",
  });
  await writeFile(join(root, "state", "evolution", "results.tsv"), "timestamp\tproposal_id\tstatus\n", "utf8");
  return root;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
