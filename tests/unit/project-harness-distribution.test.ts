import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import {
  installProjectHarnessRuntimeDistribution,
  PROJECT_HARNESS_DAILY_COMMANDS,
} from "../../src/project-harness/distribution.js";

const execFileAsync = promisify(execFile);
const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("project Harness Runtime distribution", () => {
  it("builds the real TypeScript daily entry as one self-contained ESM file", async () => {
    const fixture = await createFixture();
    const outputRoot = join(fixture.root, "real-build");
    await writeFile(join(fixture.skillRoot, "state", "manifest.json"), `${JSON.stringify({
      schema_version: "2.0",
      project_id: "sample-a1",
      project_name: "sample",
      skill_name: "sample-a1-harness",
      skill_revision: 3,
      analysis_status: "complete",
    }, null, 2)}\n`, "utf8");

    await execFileAsync(process.execPath, ["scripts/build-project-harness-runtime.mjs", outputRoot], {
      cwd: process.cwd(),
    });
    const builtEntry = join(outputRoot, "runtime.mjs");
    const source = await readFile(builtEntry, "utf8");
    const nonNodeImports = [...source.matchAll(/\bfrom\s*["']([^"']+)["']/g)]
      .map((match) => match[1])
      .filter((specifier) => !specifier.startsWith("node:"));
    expect(nonNodeImports).toEqual([]);
    expect(source).toContain("runProjectHarnessDailyCommand");

    const runtime = await import(`${pathToFileURL(builtEntry).href}?test=${Date.now()}`) as {
      describeProjectHarnessDailyRuntime(skillRoot: string): Promise<{
        projectId: string;
        revision: number;
        contentFingerprint: string;
      }>;
    };
    const description = await runtime.describeProjectHarnessDailyRuntime(fixture.skillRoot);
    expect(description.projectId).toBe("sample-a1");
    expect(description.revision).toBe(3);
    expect(description.contentFingerprint).toMatch(/^[a-f0-9]{64}$/);

    const installed = await installProjectHarnessRuntimeDistribution({
      skillRoot: fixture.skillRoot,
      compiledRuntimeEntry: builtEntry,
    });
    expect(await readFile(join(installed.runtimeRoot, "runtime.mjs"), "utf8")).toBe(source);
  });

  it("publishes a self-contained daily Runtime with only the supported commands", async () => {
    const fixture = await createFixture();
    const result = await installProjectHarnessRuntimeDistribution({
      skillRoot: fixture.skillRoot,
      compiledRuntimeEntry: fixture.entry,
    });

    expect(result.commands).toEqual(PROJECT_HARNESS_DAILY_COMMANDS);
    expect(result.files).toEqual([
      "runtime.mjs",
      "cli.mjs",
      "runtime-manifest.json",
      "harness.ps1",
      "harness.cmd",
      "harness.sh",
    ]);

    const manifest = JSON.parse(await readFile(join(result.runtimeRoot, "runtime-manifest.json"), "utf8")) as {
      commands: string[];
      runtime: string;
    };
    expect(manifest.commands).toEqual(["doctor", "audit", "knowledge", "change", "integrate", "evolve"]);
    expect(manifest.commands).not.toContain("init");
    expect(manifest.commands).not.toContain("migrate");
    expect(manifest.runtime).toBe("compiled-javascript");

    const { stdout } = await execFileAsync(process.execPath, [join(result.runtimeRoot, "cli.mjs"), "doctor", "--json"]);
    expect(JSON.parse(stdout)).toEqual({
      ok: true,
      command: "doctor",
      args: ["--json"],
      skillRoot: fixture.skillRoot.replace(/\\/g, "/"),
    });

    await expect(execFileAsync(process.execPath, [join(result.runtimeRoot, "cli.mjs"), "migrate"]))
      .rejects.toMatchObject({ code: 2 });

    const output = await Promise.all(result.files.map((file) => readFile(join(result.runtimeRoot, file), "utf8")));
    const combined = output.join("\n").toLowerCase();
    expect(combined).not.toContain("python");
    expect(combined).not.toContain("ecl_harness");
    expect(combined).not.toContain("src/web");
  });

  it("rejects external module dependencies and linked inputs", async () => {
    const fixture = await createFixture();
    await writeFile(fixture.entry, 'import value from "external-runtime";\nexport { value };\n', "utf8");
    await expect(installProjectHarnessRuntimeDistribution({
      skillRoot: fixture.skillRoot,
      compiledRuntimeEntry: fixture.entry,
    })).rejects.toThrow(/must be self-contained/);

    const physicalDirectory = join(fixture.root, "physical-runtime");
    const linkedDirectory = join(fixture.root, "linked-runtime");
    const physicalEntry = join(physicalDirectory, "entry.mjs");
    const linkedEntry = join(linkedDirectory, "entry.mjs");
    await mkdir(physicalDirectory);
    await writeRuntimeEntry(physicalEntry);
    if (process.platform === "win32") {
      await execFileAsync("cmd", ["/c", "mklink", "/J", linkedDirectory, physicalDirectory], { windowsHide: true });
    } else {
      await symlink(physicalDirectory, linkedDirectory, "dir");
    }
    await expect(installProjectHarnessRuntimeDistribution({
      skillRoot: fixture.skillRoot,
      compiledRuntimeEntry: linkedEntry,
    })).rejects.toThrow(/must not traverse a link or Junction/);
  });

  it.each([
    "const name = 'external-runtime'; export const value = import(name);\n",
    "export const value = import(`external-runtime`);\n",
    "const name = 'external-runtime'; export const value = require(name);\n",
  ])("rejects computed module loading in a supposedly self-contained Runtime", async (source) => {
    const fixture = await createFixture();
    await writeFile(fixture.entry, source, "utf8");
    await expect(installProjectHarnessRuntimeDistribution({
      skillRoot: fixture.skillRoot,
      compiledRuntimeEntry: fixture.entry,
    })).rejects.toThrow(/computed module loading/);
  });

  it("rejects creator commands before loading the daily Runtime entry", async () => {
    const fixture = await createFixture();
    const marker = join(fixture.root, "entry-loaded.txt");
    await writeFile(fixture.entry, `import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(marker)}, "loaded\\n", "utf8");
export function runProjectHarnessDailyCommand() { return { ok: true }; }
`, "utf8");
    const distribution = await installProjectHarnessRuntimeDistribution({
      skillRoot: fixture.skillRoot,
      compiledRuntimeEntry: fixture.entry,
    });

    await expect(execFileAsync(process.execPath, [join(distribution.runtimeRoot, "cli.mjs"), "init"]))
      .rejects.toMatchObject({ code: 2 });
    await expect(readFile(marker, "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });

  it.each(["previous-moved", "published"] as const)(
    "restores the previous distribution after a failure at %s",
    async (failureStage) => {
      const fixture = await createFixture();
      const first = await installProjectHarnessRuntimeDistribution({
        skillRoot: fixture.skillRoot,
        compiledRuntimeEntry: fixture.entry,
      });
      const before = await readFile(join(first.runtimeRoot, "runtime.mjs"), "utf8");
      await writeFile(fixture.entry, `${before}\n// replacement\n`, "utf8");

      await expect(installProjectHarnessRuntimeDistribution({
        skillRoot: fixture.skillRoot,
        compiledRuntimeEntry: fixture.entry,
        failureInjection(stage) {
          if (stage === failureStage) throw new Error(`injected ${stage}`);
        },
      })).rejects.toThrow(/distribution failed/);

      expect(await readFile(join(first.runtimeRoot, "runtime.mjs"), "utf8")).toBe(before);
    },
  );
});

async function createFixture(): Promise<{ root: string; skillRoot: string; entry: string }> {
  const root = await mkdtemp(join(tmpdir(), "aho-project-harness-distribution-"));
  cleanup.push(root);
  const skillRoot = join(root, "sample-a1-harness");
  const entry = join(root, "compiled", "daily-runtime.mjs");
  await mkdir(join(skillRoot, "state"), { recursive: true });
  await mkdir(join(root, "compiled"), { recursive: true });
  await writeFile(join(skillRoot, "SKILL.md"), "---\nname: sample-a1-harness\n---\n", "utf8");
  await writeRuntimeEntry(entry);
  return { root, skillRoot, entry };
}

async function writeRuntimeEntry(path: string): Promise<void> {
  await writeFile(path, `export async function runProjectHarnessDailyCommand(invocation) {
  return {
    ok: true,
    command: invocation.command,
    args: invocation.args,
    skillRoot: invocation.skillRoot.replaceAll("\\\\", "/"),
  };
}
`, "utf8");
}
