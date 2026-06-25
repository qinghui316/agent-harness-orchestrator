import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { initHarness } from "../../src/harness/init.js";
import { runAggregateValidation } from "../../src/integration-check/aggregate-validation.js";
import { integrationCheckRoot } from "../../src/integration-check/paths.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import { execFileAsync, getTempDir, git, initGitRepository, project } from "./workbench/fixtures.js";

describe("integration aggregate validation", () => {
  it("runs the project validation profile in the integration checkout", async () => {
    const oldAhoHome = process.env.AHO_HOME;
    process.env.AHO_HOME = join(getTempDir(), ".aho-home");
    try {
      await initGitRepository(getTempDir());
      await writeFile(join(getTempDir(), ".gitignore"), ".aho-home/\n.agent-harness/\nharness/\n", "utf8");
      await writeFile(join(getTempDir(), "package.json"), JSON.stringify({
        scripts: {
          test: "node scripts/aggregate-check.mjs",
        },
      }, null, 2), "utf8");
      await mkdir(join(getTempDir(), "scripts"), { recursive: true });
      await mkdir(join(getTempDir(), "src"), { recursive: true });
      await writeFile(join(getTempDir(), "scripts", "aggregate-check.mjs"), [
        "import { existsSync, readFileSync } from 'node:fs';",
        "const alpha = readFileSync('src/alpha.ts', 'utf8');",
        "const beta = readFileSync('src/beta.ts', 'utf8');",
        "if (alpha.includes('modern') && beta.includes('modern') && !existsSync('src/integration-note.ts')) {",
        "  console.error('Combined modern alpha/beta changes require src/integration-note.ts.');",
        "  process.exit(1);",
        "}",
        "",
      ].join("\n"), "utf8");
      await writeFile(join(getTempDir(), "src", "alpha.ts"), "export const alpha = 'legacy';\n", "utf8");
      await writeFile(join(getTempDir(), "src", "beta.ts"), "export const beta = 'legacy';\n", "utf8");
      await git(getTempDir(), ["add", "."]);
      await git(getTempDir(), ["commit", "-m", "initial"]);
      await initHarness(project());

      const memory = await resolveProjectMemory(project());
      const directory = join(integrationCheckRoot(memory), "check-real-validation");
      const checkoutPath = join(getTempDir(), "integration-checkout");
      await execFileAsync("git", ["worktree", "add", "--detach", checkoutPath, "HEAD"], { cwd: getTempDir() });
      await writeFile(join(checkoutPath, "src", "alpha.ts"), "export const alpha = 'modern';\n", "utf8");
      await writeFile(join(checkoutPath, "src", "beta.ts"), "export const beta = 'modern';\n", "utf8");

      const failed = await runAggregateValidation(memory, directory, "check-real-validation", checkoutPath, true);
      expect(failed.status).toBe("failed");
      expect(failed.command).toEqual(["npm", "run", "test"]);
      expect(failed.stderr).toContain("Combined modern alpha/beta changes require src/integration-note.ts.");

      await writeFile(join(checkoutPath, "src", "integration-note.ts"), "export const integrationReady = true;\n", "utf8");
      const passed = await runAggregateValidation(memory, directory, "check-real-validation", checkoutPath, true);
      expect(passed.status).toBe("passed");
      expect(passed.command).toEqual(["aggregate-validation-profile", "default", "test"]);
    } finally {
      if (oldAhoHome === undefined) delete process.env.AHO_HOME;
      else process.env.AHO_HOME = oldAhoHome;
    }
  });
});
