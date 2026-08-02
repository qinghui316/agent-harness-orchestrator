import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProjectHarnessHandle } from "../../src/project-harness/contracts.js";
import { fingerprintProjectHarnessContent } from "../../src/project-harness/fingerprint.js";
import {
  createProjectHarnessRuntime,
  type ProjectHarnessCommandPort,
  type ProjectHarnessRegistryPort,
} from "../../src/project-harness/runtime.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../src/provider-runtime/project-harness-discovery.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness daily Runtime facade", () => {
  it("exposes only daily namespaces and delegates with one command-scoped context", async () => {
    const fixture = await createFixture();
    const commandRun = vi.fn<ProjectHarnessCommandPort["run"]>(async (context, args) => ({
      status: "completed",
      details: { args, projectId: context.handle.projectId },
    }));
    const preflight = vi.fn<ProjectHarnessRegistryPort["preflight"]>(async (context, changeId) => {
      await context.sourceSnapshot.prime(["src/a.ts", "src/a.ts"]);
      return {
        status: "continue",
        details: { changeId, digest: await context.sourceSnapshot.digest(["src/a.ts"]) },
      };
    });
    const runtime = createProjectHarnessRuntime({
      projectRoot: fixture.projectRoot,
      skillRoot: fixture.skillRoot,
      sidecarRoot: fixture.sidecarRoot,
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
      change: { run: commandRun },
      registry: { preflight },
      integration: { run: commandRun },
      evolution: { run: commandRun },
    });

    expect(Object.keys(runtime).sort()).toEqual([
      "change", "evolution", "integration", "knowledge", "project", "registry",
    ]);
    await expect(runtime.change.run(fixture.handle, ["status"])).resolves.toMatchObject({
      ok: true,
      status: "completed",
      projectId: "sample-a1",
      revision: 27,
    });
    await expect(runtime.registry.preflight(fixture.handle, "change-1")).resolves.toMatchObject({
      ok: true,
      status: "continue",
      details: { changeId: "change-1" },
    });
    expect(commandRun).toHaveBeenCalledTimes(1);
    expect(preflight).toHaveBeenCalledTimes(1);
  });

  it("rejects a stale handle before any mutating namespace runs", async () => {
    const fixture = await createFixture();
    const commandRun = vi.fn<ProjectHarnessCommandPort["run"]>(async () => ({ status: "completed" }));
    const runtime = createProjectHarnessRuntime({
      projectRoot: fixture.projectRoot,
      skillRoot: fixture.skillRoot,
      sidecarRoot: fixture.sidecarRoot,
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
      change: { run: commandRun },
      registry: { async preflight() { return { status: "continue" }; } },
      integration: { run: commandRun },
      evolution: { run: commandRun },
    });
    await writeFile(join(fixture.skillRoot, "static.txt"), "changed\n", "utf8");
    await expect(runtime.change.run(fixture.handle, ["status"])).rejects.toThrow(/fingerprint is stale/);
    expect(commandRun).not.toHaveBeenCalled();
  });

  it("keeps the handle valid when only dynamic lifecycle state changes", async () => {
    const fixture = await createFixture();
    const commandRun = vi.fn<ProjectHarnessCommandPort["run"]>(async () => ({ status: "completed" }));
    const runtime = createProjectHarnessRuntime({
      projectRoot: fixture.projectRoot,
      skillRoot: fixture.skillRoot,
      sidecarRoot: fixture.sidecarRoot,
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
      change: { run: commandRun },
      registry: { async preflight() { return { status: "continue" }; } },
      integration: { run: commandRun },
      evolution: { run: commandRun },
    });
    const changeRoot = join(fixture.skillRoot, "state", "changes", "active", "change-1");
    await mkdir(changeRoot, { recursive: true });
    await writeFile(join(changeRoot, "summary.md"), "# Dynamic evidence\n", "utf8");

    await expect(runtime.change.run(fixture.handle, ["status"])).resolves.toMatchObject({ status: "completed" });
    expect(commandRun).toHaveBeenCalledTimes(1);
  });

  it("requires Runtime-owned Agent attempt and artifact verification for onboarding", async () => {
    const fixture = await createFixture();
    const commandRun = vi.fn<ProjectHarnessCommandPort["run"]>(async () => ({ status: "completed" }));
    const common = {
      projectId: "sample-a1",
      projectRoot: fixture.projectRoot,
      skillRoot: fixture.skillRoot,
      sidecarRoot: fixture.sidecarRoot,
      discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
      change: { run: commandRun },
      registry: { async preflight() { return { status: "continue" }; } },
      integration: { run: commandRun },
      evolution: { run: commandRun },
    };
    const unverified = createProjectHarnessRuntime(common);
    await expect(unverified.project.init.prepare("main-attempt-1"))
      .rejects.toThrow(/Runtime-owned ProviderAttempt verifier/);

    const mismatched = createProjectHarnessRuntime({
      ...common,
      onboarding: {
        executions: {
          async verify(input) {
            return { ...input, roleId: "auditor" };
          },
        },
      },
    });
    await expect(mismatched.project.init.prepare("main-attempt-1"))
      .rejects.toThrow(/does not match the required Agent attempt and artifact/);
  });
});

async function createFixture(): Promise<{
  projectRoot: string;
  skillRoot: string;
  sidecarRoot: string;
  handle: ProjectHarnessHandle;
}> {
  const root = await mkdtemp(join(tmpdir(), "aho-project-harness-runtime-"));
  cleanup.push(root);
  const projectRoot = join(root, "project");
  const skillRoot = join(root, "sample-a1-harness");
  const sidecarRoot = join(root, "sidecar");
  await Promise.all([
    mkdir(join(projectRoot, "src"), { recursive: true }),
    mkdir(join(skillRoot, "state"), { recursive: true }),
    mkdir(sidecarRoot),
  ]);
  await writeFile(join(projectRoot, "src", "a.ts"), "export const a = true;\n", "utf8");
  await writeFile(join(skillRoot, "SKILL.md"), "---\nname: sample-a1-harness\n---\n", "utf8");
  await writeFile(join(skillRoot, "static.txt"), "current\n", "utf8");
  await writeFile(join(skillRoot, "state", "manifest.json"), `${JSON.stringify({
    schema_version: "2.0",
    project_id: "sample-a1",
    project_name: "sample",
    skill_name: "sample-a1-harness",
    skill_revision: 27,
    analysis_status: "complete",
  }, null, 2)}\n`, "utf8");
  return {
    projectRoot,
    skillRoot,
    sidecarRoot,
    handle: {
      projectId: "sample-a1",
      skillName: "sample-a1-harness",
      skillRevision: 27,
      skillRoot,
      contentFingerprint: await fingerprintProjectHarnessContent(skillRoot),
    },
  };
}
