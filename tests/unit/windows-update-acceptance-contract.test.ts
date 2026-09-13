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
    expect(fixture).toContain('loadRuntime("provider-runtime/execution-contract.js")');
    expect(fixture).toContain('defaultExecutionContractRegistry.read("agent.turn")');
    expect(fixture).not.toContain('executionContractFamily: "agent-conversation"');
  });

  it("publishes success only after certificate cleanup is verified", () => {
    expect(runner).not.toContain("Start-Job");
    expect(runner).not.toContain("New-SelfSignedCertificate");
    expect(runner).not.toContain("Import-Certificate");
    expect(runner).not.toContain('certutil.exe');
    expect(runner).toContain('function Add-MachineCertificate');
    expect(runner).toContain('StoreLocation]::LocalMachine');
    expect(runner).toContain('WindowsBuiltInRole]::Administrator');
    expect(runner).toContain('$store.Add($Certificate)');
    expect(workflow).toContain("timeout-minutes: 75");
    expect(workflow).toContain("openssl req -x509");
    expect(workflow).toContain('basicConstraints=critical,CA:TRUE');
    expect(workflow).toContain('basicConstraints=critical,CA:FALSE');
    expect(workflow).toContain('-certfile "$cert_root/root-ca.pem"');
    expect(workflow).toContain("export MSYS2_ARG_CONV_EXCL='*'");
    expect(workflow).toContain("-passout env:BEAVER_ACCEPTANCE_CERT_PASSWORD");
    expect(runner).toContain('1200 "Old signed package build"');
    expect(runner).toContain('1200 "New signed package build"');
    expect(runner).toContain('-RedirectStandardOutput $stdoutPath -RedirectStandardError $stderrPath');
    expect(runner).toContain('Get-Content -LiteralPath $path -Tail 120');
    expect(runner).toContain('$safeLine.Replace($passwordText, "[REDACTED]")');
    expect(runner).toContain('Where-Object Subject -EQ $subject');
    expect(runner.indexOf('if ($passedResult)')).toBeGreaterThan(runner.indexOf('finally {'));
    expect(runner).toContain('A disposable acceptance certificate was not removed.');
    expect(runner).toContain('$process = Start-Process -FilePath $Executable -PassThru');
    expect(runner).not.toContain('$process = Start-Process -FilePath $Executable -WindowStyle Hidden -PassThru');
  });

  it("serves the updater cache-busted channel request and emits bounded failure evidence", () => {
    expect(feed).toContain('url.searchParams.get("noCache")');
    expect(feed).toContain('url.pathname === "/latest.yml" && url.searchParams.size === 1');
    expect(feed).toContain('/^[0-9a-v]+$/.test(noCache)');
    expect(runner).toContain('if ($content.Contains(" update failed"))');
    expect(runner).toContain('function Write-SafeUpdateLogEvidence');
    expect(runner).toContain('Get-Content -LiteralPath $desktopLog -Tail 120');
    expect(runner).toContain('$_ -match " (build|workbench-ready|update|update-failed|startup-failed|utility-exit) "');
  });
});

async function read(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}
