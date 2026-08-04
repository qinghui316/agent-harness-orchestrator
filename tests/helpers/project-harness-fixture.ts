import { cp, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { initializeProjectRuntimeSidecar } from "../../src/project-runtime/lifecycle.js";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";
import { getGitBranch, getGitCommit } from "../../src/project/git.js";
import { getProjectHarnessSkillScaffoldRoot } from "../../src/template-source/paths.js";
import type { ManagedProject } from "../../src/types/index.js";

export interface ReadyProjectHarnessFixture {
  project: ManagedProject;
  ahoHome: string;
  skillName: string;
  skillRoot: string;
}

export async function createReadyProjectHarnessFixture(input: {
  projectRoot: string;
  ahoHome: string;
  projectId?: string;
  projectName?: string;
}): Promise<ReadyProjectHarnessFixture> {
  const projectId = input.projectId ?? "repo";
  const projectName = input.projectName ?? "Repo";
  const skillName = `${projectId}-harness`;
  const skillRoot = join(input.projectRoot, ".agents", "skills", skillName);
  const [canonicalBranch, canonicalCommit] = await Promise.all([
    getGitBranch(input.projectRoot),
    getGitCommit(input.projectRoot),
  ]);
  await mkdir(join(input.projectRoot, ".agents", "skills"), { recursive: true });
  await cp(getProjectHarnessSkillScaffoldRoot(), skillRoot, { recursive: true });
  await writeFile(join(skillRoot, "SKILL.md"), `---\nname: ${skillName}\n---\n\n# ${projectName} Harness\n`, "utf8");
  await Promise.all([
    mkdir(join(skillRoot, "references", "project_wiki"), { recursive: true }),
    mkdir(join(skillRoot, "state", "changes", "active"), { recursive: true }),
    mkdir(join(skillRoot, "state", "changes", "parking"), { recursive: true }),
    mkdir(join(skillRoot, "state", "changes", "archive"), { recursive: true }),
    mkdir(join(skillRoot, "state", "registry", "changes"), { recursive: true }),
    mkdir(join(skillRoot, "state", "registry", "contracts"), { recursive: true }),
    mkdir(join(skillRoot, "state", "registry", "lanes"), { recursive: true }),
    mkdir(join(skillRoot, "state", "registry", "integrations"), { recursive: true }),
    mkdir(join(skillRoot, "state", "registry", "baseline-events"), { recursive: true }),
    mkdir(join(skillRoot, "state", "evolution"), { recursive: true }),
  ]);
  await Promise.all([
    writeJson(join(skillRoot, "state", "manifest.json"), {
      schema_version: "2.0",
      project_id: projectId,
      project_name: projectName,
      skill_name: skillName,
      skill_revision: 1,
      analysis_status: "complete",
    }),
    writeJson(join(skillRoot, "state", "changes", "INDEX.json"), {
      schema_version: "1.0",
      changes: [],
      generated_at: "1970-01-01T00:00:00.000Z",
    }),
    writeJson(join(skillRoot, "state", "registry", "baseline.json"), {
      schema_version: "1.0",
      canonical_branch: canonicalBranch,
      canonical_commit: canonicalCommit,
      updated_at: "2026-08-03T00:00:00.000Z",
    }),
    writeJson(join(skillRoot, "references", "project_wiki", ".ecl-baselines.json"), {
      schema_version: "1.0",
      project_id: projectId,
      documents: {},
    }),
    writeFile(join(skillRoot, "references", "project_wiki", "catalog.md"), "# Catalog\n", "utf8"),
  ]);
  await initializeProjectRuntimeSidecar(resolveProjectRuntimePaths(projectId, input.ahoHome));
  return {
    project: {
      id: projectId,
      name: projectName,
      path: input.projectRoot,
      addedAt: "2026-08-03T00:00:00.000Z",
      lastSeenAt: "2026-08-03T00:00:00.000Z",
      defaultProviderId: "codex",
    },
    ahoHome: input.ahoHome,
    skillName,
    skillRoot,
  };
}

async function writeJson(path: string, value: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}
