import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parseDesktopBuildInfo, readDesktopBuildInfo } from "../../src/desktop/build-info.js";

const cleanup: string[] = [];

afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe("desktop build identity", () => {
  it("reads an exact internal build identity", async () => {
    const root = await mkdtemp(join(tmpdir(), "beaver-build-info-"));
    cleanup.push(root);
    const path = join(root, "build-info.json");
    await mkdir(root, { recursive: true });
    await writeFile(path, `${JSON.stringify({
      version: "0.1.1",
      commit: "a".repeat(40),
      builtAt: "2026-09-11T00:00:00.000Z",
      channel: "internal",
      dirty: false,
    })}\n`, "utf8");

    expect(readDesktopBuildInfo(path)).toEqual({
      version: "0.1.1",
      commit: "a".repeat(40),
      builtAt: "2026-09-11T00:00:00.000Z",
      channel: "internal",
      dirty: false,
    });
  });

  it("rejects abbreviated commits and unsupported channels", () => {
    expect(() => parseDesktopBuildInfo({
      version: "0.1.1",
      commit: "abc123",
      builtAt: "2026-09-11T00:00:00.000Z",
      channel: "internal",
      dirty: false,
    })).toThrow(/build identity/i);
    expect(() => parseDesktopBuildInfo({
      version: "0.1.1",
      commit: "a".repeat(40),
      builtAt: "2026-09-11T00:00:00.000Z",
      channel: "public",
      dirty: false,
    })).toThrow(/build identity/i);
  });
});
