import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listAgentRoles } from "../../src/agent/catalog.js";
import { writeProjectMarker } from "../../src/project/marker.js";
import type { ManagedProject } from "../../src/types/index.js";

let root: string;
let originalAhoHome: string | undefined;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-neutral-agent-catalog-"));
  originalAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(root, "aho-home");
});

afterEach(async () => {
  process.env.AHO_HOME = originalAhoHome;
  await rm(root, { recursive: true, force: true });
});

describe("provider-neutral Agent role catalog", () => {
  it("publishes compatibility and content identity without selecting a runtime", async () => {
    const repo = project();
    await mkdir(repo.path, { recursive: true });
    await writeProjectMarker(repo, "external-local");

    const roles = await listAgentRoles(repo);
    const coder = roles.find((role) => role.roleId === "coder-agent");
    const planner = roles.find((role) => role.roleId === "planning-agent");

    expect(coder).toMatchObject({
      contentHash: expect.any(String),
      compatibility: { requiredCapabilities: ["workspace.read", "workspace.write"] },
    });
    expect(planner?.compatibility.requiredCapabilities).toContain("skill.native-load");
    expect(coder).not.toHaveProperty("runtime");
    expect(coder).not.toHaveProperty("sourceHash");
    expect(coder).not.toHaveProperty("providerBindings");
  });
});

function project(): ManagedProject {
  return {
    id: "demo",
    name: "Demo",
    path: join(root, "repo"),
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}
