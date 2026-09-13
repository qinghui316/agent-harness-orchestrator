import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflow = await read(".github/workflows/windows-desktop.yml");
const buildVariant = await read("scripts/desktop-build-variant.mjs");
const releaseGuide = await read("docs/DESKTOP-RELEASE.md");
const packageJson = JSON.parse(await read("package.json")) as { version: string; repository?: { url?: string } };

describe("Windows stable release contract", () => {
  it("publishes tags only through the protected new repository identity", () => {
    expect(workflow).toContain("tags:\n      - 'v*'");
    expect(workflow).toContain("github.repository == 'qinghui316/beaver-code'");
    expect(workflow).toContain("environment: windows-release");
    expect(workflow).toContain("BEAVER_RELEASE_ENABLED");
    expect(workflow).toContain("--draft --verify-tag");
    expect(workflow).toContain("--draft=false --latest");
    expect(workflow).not.toContain("qinghui316/agent-harness-orchestrator");
    expect(packageJson.repository?.url).toBe("git+https://github.com/qinghui316/beaver-code.git");
  });

  it("keeps the private key in protected environment inputs and ships seven verified assets", () => {
    expect(workflow).toContain("secrets.BEAVER_UPDATE_SIGNING_PRIVATE_KEY");
    expect(workflow).toContain("secrets.BEAVER_UPDATE_SIGNING_KEY_PASSWORD");
    expect(workflow).toContain("vars.BEAVER_UPDATE_SIGNING_KEY_ID");
    expect(workflow).toContain("if ($assets.Count -ne 7)");
    expect(workflow).toContain("node scripts/verify-update-release.mjs");
    expect(buildVariant).toContain('repo: "beaver-code"');
    expect(buildVariant).toContain('src/desktop/update-public-keys.json');
  });

  it("documents bootstrap, withdrawal and forward-only repair", () => {
    expect(packageJson.version).toBe("0.1.3");
    expect(releaseGuide).toContain("0.1.3");
    expect(releaseGuide).toContain("0.1.4");
    expect(releaseGuide).toContain("withdraw the Release");
    expect(releaseGuide).toContain("higher patch version");
    expect(releaseGuide).toContain("Never paste either secret");
  });
});

async function read(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}
