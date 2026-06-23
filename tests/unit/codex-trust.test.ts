import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getCodexProjectKey, readCodexProjectTrust, trustCodexProject } from "../../src/codex/trust.js";

let tempDir: string;
let codexHome: string;

describe("codex project trust", () => {
  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "aho-codex-trust-"));
    codexHome = join(tempDir, "codex-home");
  });

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  it("reports missing config as untrusted without writing it", async () => {
    const status = await readCodexProjectTrust(join(tempDir, "repo"), { codexHome, platform: "win32" });

    expect(status).toMatchObject({
      trusted: false,
      configExists: false,
      reason: "Codex config.toml was not found.",
    });
    expect(status.projectKey).toBe(getCodexProjectKey(join(tempDir, "repo"), { platform: "win32" }));
  });

  it("creates a scoped trusted project entry when explicitly requested", async () => {
    const projectPath = join(tempDir, "Repo");

    const status = await trustCodexProject(projectPath, { codexHome, platform: "win32" });

    expect(status.trusted).toBe(true);
    const config = await readFile(join(codexHome, "config.toml"), "utf8");
    expect(config).toContain(`[projects.'${resolve(projectPath).toLowerCase()}']`);
    expect(config).toContain('trust_level = "trusted"');
  });

  it("updates only the selected project trust entry", async () => {
    const projectPath = join(tempDir, "Repo");
    const otherPath = join(tempDir, "Other");
    await mkdir(codexHome, { recursive: true });
    await writeFile(join(codexHome, "config.toml"), [
      "[features]",
      "js_repl = false",
      "",
      `[projects.'${resolve(otherPath).toLowerCase()}']`,
      'trust_level = "trusted"',
      "",
      `[projects.'${resolve(projectPath).toLowerCase()}']`,
      'trust_level = "untrusted"',
      "",
    ].join("\n"), "utf8");

    const status = await trustCodexProject(projectPath, { codexHome, platform: "win32" });

    expect(status.trusted).toBe(true);
    const config = await readFile(join(codexHome, "config.toml"), "utf8");
    expect(config).toContain("[features]\njs_repl = false");
    expect(config).toContain(`[projects.'${resolve(otherPath).toLowerCase()}']\ntrust_level = "trusted"`);
    expect(config).toContain(`[projects.'${resolve(projectPath).toLowerCase()}']\ntrust_level = "trusted"`);
  });
});
