import { describe, expect, it } from "vitest";
import {
  projectSkillArtifact,
  projectSourceArtifact,
  parseOwnedArtifactRef,
  runtimeSidecarArtifact,
  skillRelativePath,
} from "../../src/project-harness/contracts.js";

describe("project Harness artifact contracts", () => {
  it("normalizes portable relative artifact paths and retains explicit ownership", () => {
    expect(projectSkillArtifact("state\\manifest.json")).toEqual({
      owner: "project-skill",
      path: "state/manifest.json",
    });
    expect(runtimeSidecarArtifact("runs/run-1/events.jsonl").owner).toBe("runtime-sidecar");
    expect(projectSourceArtifact("src/index.ts").owner).toBe("project-source");
  });

  it.each([
    "",
    ".",
    "../outside",
    "state/../outside",
    "/absolute/path",
    "C:\\absolute\\path",
    "\\\\server\\share\\path",
    "state//manifest.json",
    "state/./manifest.json",
    "state/manifest.json\0tail",
  ])("rejects non-portable or escaping paths: %s", (value) => {
    expect(() => skillRelativePath(value)).toThrow();
  });

  it("validates persisted artifact ownership instead of trusting a cast", () => {
    expect(parseOwnedArtifactRef({ owner: "runtime-sidecar", path: "runs/run-1/run.json" }))
      .toEqual({ owner: "runtime-sidecar", path: "runs/run-1/run.json" });
    expect(() => parseOwnedArtifactRef({ owner: "runtime-sidecar", path: "../outside" })).toThrow();
    expect(() => parseOwnedArtifactRef({ owner: "memory-root", path: "runs/run.json" })).toThrow();
    expect(() => parseOwnedArtifactRef({ owner: "project-source", path: "src/index.ts", absolute: "C:\\tmp" })).toThrow();
  });
});
