import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getMemoryStatus } from "../../src/memory/status.js";
import { assertWritableMemory, resolveMemory } from "../../src/memory/resolver.js";
import { readProjectMarker, writeProjectMarker } from "../../src/project/marker.js";
import type { ManagedProject } from "../../src/types/index.js";

let tempDir: string;
let originalAhoHome: string | undefined;

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), "aho-memory-"));
  originalAhoHome = process.env.AHO_HOME;
  process.env.AHO_HOME = join(tempDir, "aho-home");
});

afterEach(async () => {
  process.env.AHO_HOME = originalAhoHome;
  await rm(tempDir, { recursive: true, force: true });
});

function project(path = tempDir): ManagedProject {
  return {
    id: "repo",
    name: "Repo",
    path,
    addedAt: new Date().toISOString(),
    lastSeenAt: new Date().toISOString(),
  };
}

describe("memory resolver", () => {
  it("writes new markers with repo-local memory mode", async () => {
    await writeProjectMarker(project());

    const raw = JSON.parse(await readFile(join(tempDir, ".agent-harness", "project.json"), "utf8"));
    const marker = await readProjectMarker(tempDir);

    expect(raw.memoryMode).toBe("repo-local");
    expect(marker?.memoryMode).toBe("repo-local");
  });

  it("reads old markers without memoryMode as repo-local", async () => {
    await mkdir(join(tempDir, ".agent-harness"), { recursive: true });
    await writeFile(join(tempDir, ".agent-harness", "project.json"), JSON.stringify({
      version: "1.0",
      id: "legacy",
      name: "Legacy",
      managedBy: "agent-harness-orchestrator",
      createdAt: new Date().toISOString(),
    }), "utf8");

    const marker = await readProjectMarker(tempDir);

    expect(marker?.memoryMode).toBe("repo-local");
  });

  it("resolves repo-local roots under the project", () => {
    const memory = resolveMemory(project());

    expect(memory).toMatchObject({
      mode: "repo-local",
      supported: true,
      writable: true,
      projectId: "repo",
      harnessRoot: tempDir,
      changesRoot: join(tempDir, "harness", "changes"),
      runsRoot: join(tempDir, ".agent-harness", "runs"),
    });
  });

  it("reports external-local and remote as unsupported planned layouts", () => {
    const external = resolveMemory({ path: tempDir, id: "repo", marker: marker("external-local") });
    const remote = resolveMemory({ path: tempDir, id: "repo", marker: marker("remote") });

    expect(external).toMatchObject({ mode: "external-local", supported: false, writable: false });
    expect(remote).toMatchObject({ mode: "remote", supported: false, writable: false });
    expect(() => assertWritableMemory(external, "Change creation")).toThrow("external-local");
    expect(() => assertWritableMemory(remote, "Change creation")).toThrow("remote");
  });

  it("reports memory status separately from harness readiness", async () => {
    const unmanaged = await getMemoryStatus(null, tempDir);
    expect(unmanaged).toMatchObject({
      registered: false,
      managed: false,
      memoryMode: "repo-local",
      memoryAvailable: false,
      harnessReady: false,
    });

    await writeProjectMarker(project());
    const managed = await getMemoryStatus(project(), tempDir);
    expect(managed).toMatchObject({
      registered: true,
      managed: true,
      memoryMode: "repo-local",
      memoryAvailable: true,
      harnessReady: false,
    });
  });
});

function marker(memoryMode: "external-local" | "remote") {
  return {
    version: "1.0" as const,
    id: "repo",
    name: "Repo",
    managedBy: "agent-harness-orchestrator" as const,
    memoryMode,
    createdAt: new Date().toISOString(),
  };
}
