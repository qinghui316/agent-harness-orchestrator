import { isAbsolute, join } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveProjectRuntimePaths } from "../../src/project-runtime/paths.js";

describe("project runtime sidecar paths", () => {
  it("keeps operational paths under one project-id sidecar root", () => {
    const paths = resolveProjectRuntimePaths("project-a1b2", "C:\\aho-home");
    expect(paths.sidecarRoot).toBe(join("C:\\aho-home", "projects", "project-a1b2"));
    for (const [name, value] of Object.entries(paths)) {
      if (name === "projectId") continue;
      expect(isAbsolute(value), name).toBe(true);
      expect(value.startsWith(paths.sidecarRoot), name).toBe(true);
    }
  });

  it.each(["aho-self/other", "../aho-self", "AHO", "", "project_id"])(
    "rejects an unsafe or non-portable project id: %s",
    (projectId) => expect(() => resolveProjectRuntimePaths(projectId, "C:\\aho-home")).toThrow(),
  );
});
