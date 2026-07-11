import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runCodexMaintenanceAssignment } from "../../src/agent-task/maintenance-codex-executor.js";
import { createMaintenanceDiffManifest } from "../../src/agent-task/maintenance-diff.js";
import { createMaintenanceWorkspace } from "../../src/agent-task/maintenance-workspace.js";
import type { HarnessEngineeringAssignment } from "../../src/agent-task/harness-engineering-contract.js";
import type { ManagedProject, ResolvedMemory } from "../../src/types/index.js";

describe("Codex maintenance evidence recovery", () => {
  const roots: string[] = [];
  afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

  it("reuses only evidence bound to the current assignment, workspace diff, and review quorum", async () => {
    const { memory, assignment, project } = await fixture();
    const diff = await createMaintenanceDiffManifest(assignment.workspace);
    await writeCache(memory, assignment, diff);
    await expect(runCodexMaintenanceAssignment(memory, project, assignment)).resolves.toMatchObject({ summary: "reviewed" });

    const evidencePath = join(memory.workbenchRoot, "maintenance", "provider-runs", assignment.assignmentId, `${diff.workspaceHash}.json`);
    const tampered = JSON.parse(await readFile(evidencePath, "utf8"));
    tampered.manifest.unifiedDiff = "forged diff";
    await writeFile(evidencePath, JSON.stringify(tampered), "utf8");
    await expect(runCodexMaintenanceAssignment(memory, project, assignment)).rejects.toThrow("stale or structurally invalid");
    await writeCache(memory, assignment, diff);

    await writeFile(join(assignment.workspace.workspaceRoot, "docs", "STATUS.md"), "mutated after review\n", "utf8");
    await expect(runCodexMaintenanceAssignment(memory, project, assignment)).rejects.toThrow("stale or structurally invalid");
  });

  it("rejects path-escaping or cross-assignment cache manifests before reading evidence", async () => {
    const { memory, assignment, project } = await fixture();
    const root = join(memory.workbenchRoot, "maintenance", "provider-runs", assignment.assignmentId);
    await mkdir(root, { recursive: true });
    await writeFile(join(root, "manifest.json"), JSON.stringify({
      version: "2.0", assignmentId: "another-assignment", manifestHash: "../escape", evidencePath: "../escape.json", summary: "bad",
    }), "utf8");
    await expect(runCodexMaintenanceAssignment(memory, project, assignment)).rejects.toThrow("does not match the current assignment");
  });

  async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "aho-maintenance-cache-"));
    roots.push(root);
    const memoryRoot = join(root, "memory");
    const workbenchRoot = join(root, "workbench");
    await mkdir(join(memoryRoot, "docs"), { recursive: true });
    await writeFile(join(memoryRoot, "docs", "STATUS.md"), "current\n", "utf8");
    const workspace = await createMaintenanceWorkspace({
      assignmentId: "assignment-1", memoryMode: "external-local", memoryRoot,
      maintenanceRoot: join(workbenchRoot, "maintenance"), namespaces: ["docs"],
    });
    const assignment: HarnessEngineeringAssignment = {
      mode: "maintain-assigned-closeout", projectId: "project-1", assignmentId: "assignment-1",
      inputCheckpoint: "checkpoint", policyVersion: "policy", sourceWindowHash: "window",
      evidenceRefs: ["change:closed"], currentDocumentRefs: [], currentStableMemoryRefs: [],
      workspace, namespaceClasses: ["content"], requiredVerification: [],
    };
    const memory = {
      mode: "external-local",
      supported: true,
      writable: true,
      projectId: "project-1",
      memoryRoot,
      workbenchRoot,
    } as ResolvedMemory;
    const project: ManagedProject = { id: "project-1", name: "Project", path: root, addedAt: "now", lastSeenAt: "now" };
    return { memory, assignment, project };
  }
});

async function writeCache(
  memory: ResolvedMemory,
  assignment: HarnessEngineeringAssignment,
  diff: Awaited<ReturnType<typeof createMaintenanceDiffManifest>>,
): Promise<void> {
  const root = join(memory.workbenchRoot, "maintenance", "provider-runs", assignment.assignmentId);
  await mkdir(root, { recursive: true });
  const evidence = {
    version: "2.0", assignmentId: assignment.assignmentId, mode: assignment.mode,
    manifestHash: diff.workspaceHash, manifest: diff,
    producer: { role: "maintenance-agent", threadIds: ["producer"], summary: "reviewed" },
    reviews: [{ decision: "approve", assignmentId: assignment.assignmentId, manifestHash: diff.workspaceHash, summary: "approved", findings: [], role: "blind-reviewer", threadId: "reviewer", parentThreadId: "coordinator" }],
    quorum: { required: 1, approved: 1 }, application: "not-applied",
  };
  const evidenceName = `${diff.workspaceHash}.json`;
  await writeFile(join(root, evidenceName), JSON.stringify(evidence), "utf8");
  await writeFile(join(root, "manifest.json"), JSON.stringify({
    version: "2.0", assignmentId: assignment.assignmentId, manifestHash: diff.workspaceHash,
    evidencePath: evidenceName, summary: "reviewed",
  }), "utf8");
}
