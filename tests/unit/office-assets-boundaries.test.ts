import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { runOfficeAssetCli } from "../../scripts/office-assets/office-assets.mjs";

const root = join("scripts", "office-assets");

describe("Office asset tool boundaries", () => {
  it("dispatches the read-only production manifest check through the single CLI", async () => {
    const result = await runOfficeAssetCli(["check-manifest"], process.cwd());
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.output)).toMatchObject({ characterActionCount: 13, propCount: 10, shadowCount: 4 });
  });

  it("keeps production pipeline independent from proofs and imports", async () => {
    for (const name of await listModules(join(root, "pipeline"))) {
      const source = await readFile(name, "utf8");
      expect(source, name).not.toMatch(/(?:from\s+|import\s*\()["'][^"']*(?:\/proofs\/|\/imports\/)/);
    }
  });

  it("uses office-assets.mjs as the only argv-owned CLI", async () => {
    for (const name of await listModules(root)) {
      const source = await readFile(name, "utf8");
      if (name.endsWith(join("office-assets", "office-assets.mjs"))) continue;
      expect(source, name).not.toContain("process.argv");
      expect(source, name).not.toContain("#!/usr/bin/env node");
    }
  });

  it("has no retired calibration compiler or prepare-shadows command", async () => {
    const [packageSource, cliSource] = await Promise.all([
      readFile("package.json", "utf8"),
      readFile(join(root, "office-assets.mjs"), "utf8"),
    ]);
    expect(packageSource).not.toContain("office-assets:compile-calibration");
    expect(packageSource).not.toContain("office-assets:prepare-shadows");
    expect(cliSource).not.toContain("prepare-shadows");
    await expect(readFile(join(root, "compile-runtime-calibration.mjs"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
  });
});

async function listModules(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listModules(path) : entry.name.endsWith(".mjs") ? [path] : [];
  }));
  return nested.flat();
}
