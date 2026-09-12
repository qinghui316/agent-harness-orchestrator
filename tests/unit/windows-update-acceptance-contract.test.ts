import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflow = await read(".github/workflows/windows-update-acceptance.yml");
const runner = await read("scripts/run-windows-update-acceptance.ps1");
const fixture = await read("scripts/desktop-update-acceptance-fixture.mjs");
const feed = await read("scripts/serve-desktop-update-fixture.mjs");
const main = await read("src/desktop/main.ts");

describe("Windows update acceptance boundary", () => {
  it("runs only for the exact candidate branch on a GitHub-hosted runner", () => {
    expect(workflow).toContain("github.ref == 'refs/heads/codex/aho-windows-release-update-foundation-v1'");
    expect(workflow).toContain("BEAVER_UPDATE_ACCEPTANCE_SHA: ${{ github.sha }}");
    for (const source of [runner, fixture, feed]) {
      expect(source).toContain('RUNNER_ENVIRONMENT');
      expect(source).toContain('github-hosted');
      expect(source).toContain('GITHUB_REPOSITORY');
      expect(source).toContain('GITHUB_REF');
      expect(source).toContain('GITHUB_SHA');
      expect(source).toContain('BEAVER_UPDATE_ACCEPTANCE_SHA');
    }
  });

  it("proves the installed packaged runtime became ready and reads data through its ASAR", () => {
    expect(main).toContain('log("workbench-ready", `version=${buildInfo.version} commit=${buildInfo.commit}`)');
    expect(runner).toContain('workbench-ready version=$ExpectedVersion commit=$ExpectedCommit');
    expect(runner).toContain('resources\\app.asar\\dist');
    expect(runner).toContain('Verify-Fixture $installedExecutable $installedRuntime');
    expect(fixture).not.toContain('from "../dist/');
    expect(fixture).toContain('loadRuntime("workbench/persistence/open-workbench-database.js")');
  });

  it("publishes success only after certificate cleanup is verified", () => {
    expect(runner.indexOf('if ($passedResult)')).toBeGreaterThan(runner.indexOf('finally {'));
    expect(runner).toContain('A disposable acceptance certificate was not removed.');
  });
});

async function read(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}
