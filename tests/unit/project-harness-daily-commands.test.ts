import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { runProjectHarnessDailyCommand } from "../../src/project-harness/daily-entry.js";

const cleanup: string[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness standalone daily commands", () => {
  it("wires Change, Integration status, and Evolution status through the compiled entry contract", async () => {
    const fixture = await createFixture();
    const created = await runProjectHarnessDailyCommand({
      command: "change",
      skillRoot: fixture.skillRoot,
      args: ["new", "daily-change", "--project-root", fixture.projectRoot],
    }) as { change_id: string; status: string };
    expect(created).toMatchObject({ change_id: "daily-change", status: "planning" });

    const status = await runProjectHarnessDailyCommand({
      command: "change",
      skillRoot: fixture.skillRoot,
      args: ["status", "--project-root", fixture.projectRoot, "--change-id", "daily-change"],
    }) as { evidence_state: string };
    expect(status.evidence_state).toBe("active");

    await expect(runProjectHarnessDailyCommand({
      command: "integrate",
      skillRoot: fixture.skillRoot,
      args: ["status", "--project-root", fixture.projectRoot],
    })).resolves.toEqual({ integrations: [] });

    await expect(runProjectHarnessDailyCommand({
      command: "evolve",
      skillRoot: fixture.skillRoot,
      args: ["status", "--project-root", fixture.projectRoot],
    })).resolves.toMatchObject({ pending: false, threshold: 5 });
  });

  it("refreshes the durable Evolution window from completed Change records without a maintenance AgentTask", async () => {
    const fixture = await createFixture();
    for (let index = 1; index <= 5; index += 1) {
      const changeId = `daily-close-${index}`;
      await runProjectHarnessDailyCommand({
        command: "change",
        skillRoot: fixture.skillRoot,
        args: ["new", changeId, "--project-root", fixture.projectRoot],
      });
      const closed = await runProjectHarnessDailyCommand({
        command: "change",
        skillRoot: fixture.skillRoot,
        args: [
          "close", changeId, "--project-root", fixture.projectRoot,
          "--status", "completed", "--validation", "targeted", "--validation-passed",
        ],
      }) as { status: string; evolution: { pending: boolean; pending_change_ids: string[] } };
      expect(closed.status).toBe("closed");
      expect(closed.evolution.pending).toBe(index === 5);
    }

    await expect(runProjectHarnessDailyCommand({
      command: "evolve",
      skillRoot: fixture.skillRoot,
      args: ["status", "--project-root", fixture.projectRoot],
    })).resolves.toMatchObject({
      pending: true,
      pending_change_ids: ["daily-close-1", "daily-close-2", "daily-close-3", "daily-close-4", "daily-close-5"],
    });
  });

  it("rejects ambiguous options and creator-only commands", async () => {
    const fixture = await createFixture();
    await expect(runProjectHarnessDailyCommand({
      command: "change",
      skillRoot: fixture.skillRoot,
      args: ["status", "--project-root", fixture.projectRoot, "--project-root", fixture.projectRoot],
    })).rejects.toThrow(/only once/);
    await expect(runProjectHarnessDailyCommand({
      command: "change",
      skillRoot: fixture.skillRoot,
      args: ["status", "--project-root", fixture.projectRoot, "--sidecar-root", join(fixture.root, "other-sidecar")],
    })).rejects.toThrow(/canonical project runtime sidecar/);
    await expect(runProjectHarnessDailyCommand({
      command: "change",
      skillRoot: fixture.skillRoot,
      args: ["status", "--project-root", fixture.projectRoot, "--typo", "value"],
    })).rejects.toThrow(/Unknown command option/);
    const unrelatedProject = join(fixture.root, "unrelated-project");
    await mkdir(unrelatedProject);
    await expect(runProjectHarnessDailyCommand({
      command: "change",
      skillRoot: fixture.skillRoot,
      args: ["status", "--project-root", unrelatedProject],
    })).rejects.toThrow(/discovery is missing/);
    await expect(runProjectHarnessDailyCommand({
      command: "integrate",
      skillRoot: fixture.skillRoot,
      args: ["--help"],
    })).resolves.toEqual(expect.objectContaining({
      command: "integrate",
      actions: ["start", "status", "complete", "abort"],
    }));
  });

  it("does not accept I2 or E1 authority from Agent-authored JSON", async () => {
    const fixture = await createFixture();
    const integrationInput = join(fixture.root, "integration.json");
    const evolutionInput = join(fixture.root, "evolution.json");
    const reconsiderE1Input = join(fixture.root, "reconsider-e1.json");
    const reconsiderAuthorityInput = join(fixture.root, "reconsider-authority.json");
    await writeFile(integrationInput, `${JSON.stringify({ confirmI2: true })}\n`, "utf8");
    await writeFile(evolutionInput, `${JSON.stringify({ e1Approved: true })}\n`, "utf8");
    await writeFile(reconsiderE1Input, `${JSON.stringify({ e1Approved: true })}\n`, "utf8");
    await writeFile(reconsiderAuthorityInput, `${JSON.stringify({ reconsiderApproved: true })}\n`, "utf8");

    await expect(runProjectHarnessDailyCommand({
      command: "integrate",
      skillRoot: fixture.skillRoot,
      args: ["complete", "integration-one", "--project-root", fixture.projectRoot, "--input-json", integrationInput],
    })).rejects.toThrow(/must not be supplied by input JSON/);
    await expect(runProjectHarnessDailyCommand({
      command: "evolve",
      skillRoot: fixture.skillRoot,
      args: ["stage", "--project-root", fixture.projectRoot, "--input-json", evolutionInput],
    })).rejects.toThrow(/must not be supplied by input JSON/);
    await expect(runProjectHarnessDailyCommand({
      command: "evolve",
      skillRoot: fixture.skillRoot,
      args: [
        "reconsider", "--project-root", fixture.projectRoot, "--input-json", reconsiderE1Input,
        "--confirm-e1", "--confirm-reconsider",
      ],
    })).rejects.toThrow(/must not be supplied by input JSON/);
    await expect(runProjectHarnessDailyCommand({
      command: "evolve",
      skillRoot: fixture.skillRoot,
      args: [
        "reconsider", "--project-root", fixture.projectRoot, "--input-json", reconsiderAuthorityInput,
        "--confirm-e1", "--confirm-reconsider",
      ],
    })).rejects.toThrow(/must not be supplied by input JSON/);
  });

  it("requires both current-invocation authorities for Evolution reconsideration", async () => {
    const fixture = await createFixture();
    const base = [
      "reconsider", "--project-root", fixture.projectRoot,
      "--rejected-proposal-id", "rejected-one", "--proposal-id", "reconsider-one", "--owner", "operator-one",
    ];
    await expect(runProjectHarnessDailyCommand({
      command: "evolve",
      skillRoot: fixture.skillRoot,
      args: base,
    })).rejects.toThrow(/confirm-e1/);
    await expect(runProjectHarnessDailyCommand({
      command: "evolve",
      skillRoot: fixture.skillRoot,
      args: [...base, "--confirm-e1"],
    })).rejects.toThrow(/confirm-reconsider/);
  });

  it("rejects value-like positional arguments after explicit I2 and E1 flags before mutation", async () => {
    const fixture = await createFixture();
    const integrationInput = join(fixture.root, "integration.json");
    const evolutionInput = join(fixture.root, "evolution.json");
    await writeFile(integrationInput, "{}\n", "utf8");
    await writeFile(evolutionInput, "{}\n", "utf8");

    await expect(runProjectHarnessDailyCommand({
      command: "integrate",
      skillRoot: fixture.skillRoot,
      args: [
        "complete", "integration-one", "--project-root", fixture.projectRoot,
        "--input-json", integrationInput, "--confirm-i2", "false",
      ],
    })).rejects.toThrow(/exactly one identifier/);
    await expect(runProjectHarnessDailyCommand({
      command: "evolve",
      skillRoot: fixture.skillRoot,
      args: ["stage", "--project-root", fixture.projectRoot, "--input-json", evolutionInput, "--confirm-e1", "false"],
    })).rejects.toThrow(/does not accept positional arguments/);
  });

  it("operates from one valid Host binding without requiring another Host link", async () => {
    const fixture = await createFixture({ includeClaudeLink: false });
    await expect(runProjectHarnessDailyCommand({
      command: "change",
      skillRoot: fixture.skillRoot,
      args: ["status", "--project-root", fixture.projectRoot],
    })).resolves.toEqual({ changes: [] });
  });

  it("advertises Evolution reconsideration as a distinct action", async () => {
    const fixture = await createFixture();
    await expect(runProjectHarnessDailyCommand({
      command: "evolve",
      skillRoot: fixture.skillRoot,
      args: ["--help"],
    })).resolves.toEqual(expect.objectContaining({
      command: "evolve",
      actions: ["check", "status", "reconsider", "stage", "mark-complete"],
    }));
  });
});

async function createFixture(options: { includeClaudeLink?: boolean } = {}) {
  const root = await mkdtemp(join(tmpdir(), "aho-daily-runtime-"));
  cleanup.push(root);
  const projectRoot = join(root, "project");
  const ahoHome = join(root, "aho-home");
  const skillRoot = join(projectRoot, ".agents", "skills", "sample-a1-harness");
  const sidecarRoot = join(ahoHome, "projects", "sample-a1");
  vi.stubEnv("AHO_HOME", ahoHome);
  await mkdir(projectRoot, { recursive: true });
  await mkdir(join(skillRoot, "assets", "templates"), { recursive: true });
  await mkdir(join(skillRoot, "state", "registry"), { recursive: true });
  await mkdir(join(skillRoot, "state", "evolution"), { recursive: true });
  await writeFile(join(skillRoot, "SKILL.md"), "---\nname: sample-a1-harness\n---\n", "utf8");
  await writeFile(join(skillRoot, "state", "manifest.json"), `${JSON.stringify({
    schema_version: "2.0",
    project_id: "sample-a1",
    project_name: "sample",
    skill_name: "sample-a1-harness",
    skill_revision: 1,
    analysis_status: "complete",
  }, null, 2)}\n`, "utf8");
  await writeFile(join(skillRoot, "state", "evolution", "state.json"), `${JSON.stringify({
    schema_version: "1.0",
    threshold: 5,
    evaluated_change_ids: [],
    pending_change_ids: [],
    pending: false,
  }, null, 2)}\n`, "utf8");
  if (options.includeClaudeLink !== false) {
    const claudeSkillsRoot = join(projectRoot, ".claude", "skills");
    await mkdir(claudeSkillsRoot, { recursive: true });
    await symlink(skillRoot, join(claudeSkillsRoot, "sample-a1-harness"), process.platform === "win32" ? "junction" : "dir");
  }
  await Promise.all([
    writeFile(join(skillRoot, "assets", "templates", "summary.md"), "# {{CHANGE_ID}}\n\nSummary.\n", "utf8"),
    writeFile(join(skillRoot, "assets", "templates", "spec.md"), "# Spec\n\n- AC-001: verified\n", "utf8"),
    writeFile(join(skillRoot, "assets", "templates", "plan.md"), "# Plan\n\n- Approved: yes\n", "utf8"),
    writeFile(join(skillRoot, "assets", "templates", "tasks.md"), "# Tasks\n\n- [x] T001 [AC-001] Verify\n  - owner: test\n  - path: src/test.ts\n  - validation: passed\n", "utf8"),
    writeFile(join(skillRoot, "assets", "templates", "review.md"), "# Review\n\n- Approved: yes\n", "utf8"),
  ]);
  return { root, projectRoot, skillRoot, sidecarRoot };
}
