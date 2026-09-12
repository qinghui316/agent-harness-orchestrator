import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const packaging = await read("scripts/package-desktop-win.mjs");
const smoke = await read("scripts/desktop-native-smoke.cjs");

describe("desktop packaged native smoke boundary", () => {

  it("tests the packaged executable instead of a development Electron install", () => {
    expect(packaging).toContain('resolve(packagedRoot, variant.config.win.executableName + ".exe")');
    expect(packaging).toContain('ELECTRON_RUN_AS_NODE: "1"');
    expect(packaging).toContain("BEAVER_NATIVE_PACKAGE_ROOT: packagedRoot");
    expect(packaging).not.toContain('node_modules", "electron", "dist"');
  });

  it("loads packaged native modules without requiring a BrowserWindow lifecycle", () => {
    expect(smoke).toContain('load("better-sqlite3")');
    expect(smoke).toContain('load("node-pty")');
    expect(smoke).not.toContain('require("electron")');
    expect(smoke).not.toContain("app.whenReady");
    expect(smoke).toContain("process.exit(0)");
    expect(smoke).toContain("process.exit(1)");
  });
});

async function read(path: string): Promise<string> {
  return readFile(new URL(`../../${path}`, import.meta.url), "utf8");
}
