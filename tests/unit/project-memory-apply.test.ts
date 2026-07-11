import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyReviewedMaintenanceAssignment, maintenanceApplyTransactionPath, MaintenanceApplyBlockedError } from "../../src/agent-task/project-memory-apply.js";
import { createMaintenanceDiffManifest } from "../../src/agent-task/maintenance-diff.js";
import { createMaintenanceWorkspace, hashTree, readMaintenanceTree } from "../../src/agent-task/maintenance-workspace.js";
import { parseHarnessEngineeringAssignment, type HarnessEngineeringAssignment } from "../../src/agent-task/harness-engineering-contract.js";
import { resolveMemory, repoLocalMemory } from "../../src/memory/resolver.js";
import type { ManagedProject, MaintenanceProviderRunEvidence, ProjectMemoryApplyFile, ResolvedMemory } from "../../src/types/index.js";
import { gitText } from "../../src/project/git.js";

const roots: string[] = [];

describe("project memory canonical apply", () => {
  const oldAhoHome = process.env.AHO_HOME;

  afterEach(async () => {
    if (oldAhoHome === undefined) delete process.env.AHO_HOME;
    else process.env.AHO_HOME = oldAhoHome;
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it("automatically applies reviewed external memory and project AGENTS.md without touching source", async () => {
    const root = await fixtureRoot();
    const sourceRoot = join(root, "project");
    const ahoHome = join(root, "aho-home");
    process.env.AHO_HOME = ahoHome;
    await mkdir(join(sourceRoot, "src"), { recursive: true });
    await writeFile(join(sourceRoot, "src", "server.ts"), "export const port = 3000;\n", "utf8");
    await writeFile(join(sourceRoot, "AGENTS.md"), "old project guidance\n", "utf8");
    const project = managedProject(sourceRoot, "external-project");
    const memory = externalMemory(sourceRoot, project.id);
    await mkdir(join(memory.memoryRoot, "docs"), { recursive: true });
    await writeFile(join(memory.memoryRoot, "docs", "STATUS.md"), "old status\n", "utf8");
    const assignment = await createAssignment(project, memory, {
      namespaces: ["docs"],
      additionalSources: [{ key: "project", root: sourceRoot, namespaces: ["AGENTS.md"] }],
    });
    await writeFile(join(assignment.workspace.workspaceRoot, "docs", "STATUS.md"), "new status\n", "utf8");
    await writeFile(join(assignment.workspace.workspaceRoot, "AGENTS.md"), "new project guidance\n", "utf8");
    const evidence = await approvedEvidence(assignment);

    const result = await applyReviewedMaintenanceAssignment({ project, memory, assignment, evidence });
    expect(result.status).toBe("applied");
    expect(await readFile(join(memory.memoryRoot, "docs", "STATUS.md"), "utf8")).toBe("new status\n");
    expect(await readFile(join(sourceRoot, "AGENTS.md"), "utf8")).toBe("new project guidance\n");
    expect(await readFile(join(sourceRoot, "src", "server.ts"), "utf8")).toBe("export const port = 3000;\n");
    const duplicate = await applyReviewedMaintenanceAssignment({ project, memory, assignment, evidence });
    expect(duplicate).toEqual(result);
  });

  it("applies repo-local Markdown through the same lease boundary", async () => {
    const root = await fixtureRoot();
    await mkdir(join(root, "docs"), { recursive: true });
    await mkdir(join(root, "src"), { recursive: true });
    await writeFile(join(root, "AGENTS.md"), "old guide\n", "utf8");
    await writeFile(join(root, "docs", "ECL.md"), "old ecl\n", "utf8");
    await writeFile(join(root, "src", "server.ts"), "export const ok = true;\n", "utf8");
    await gitText(root, ["init"]);
    await gitText(root, ["add", "."]);
    await gitText(root, ["-c", "user.name=AHO", "-c", "user.email=aho@example.local", "commit", "-m", "base"]);
    const project = managedProject(root, "repo-local-project");
    const memory = repoLocalMemory(root, project.id);
    const assignment = await createAssignment(project, memory, { namespaces: ["AGENTS.md", "docs"] });
    await writeFile(join(assignment.workspace.workspaceRoot, "AGENTS.md"), "new guide\n", "utf8");
    await writeFile(join(assignment.workspace.workspaceRoot, "docs", "ECL.md"), "new ecl\n", "utf8");

    const result = await applyReviewedMaintenanceAssignment({ project, memory, assignment, evidence: await approvedEvidence(assignment) });
    expect(result.status).toBe("applied");
    expect(await readFile(join(root, "AGENTS.md"), "utf8")).toBe("new guide\n");
    expect(await readFile(join(root, "docs", "ECL.md"), "utf8")).toBe("new ecl\n");
    expect(await readFile(join(root, "src", "server.ts"), "utf8")).toBe("export const ok = true;\n");
  });

  it("fails closed for canonical drift and forbidden system namespaces", async () => {
    const root = await fixtureRoot();
    const projectRoot = join(root, "project");
    process.env.AHO_HOME = join(root, "aho-home");
    await mkdir(join(projectRoot, "docs"), { recursive: true });
    const project = managedProject(projectRoot, "blocked-project");
    const memory = externalMemory(projectRoot, project.id);
    await mkdir(join(memory.memoryRoot, "docs"), { recursive: true });
    await writeFile(join(memory.memoryRoot, "docs", "STATUS.md"), "base\n", "utf8");
    const assignment = await createAssignment(project, memory, { namespaces: ["docs"] });
    await writeFile(join(assignment.workspace.workspaceRoot, "docs", "STATUS.md"), "agent\n", "utf8");
    await writeFile(join(memory.memoryRoot, "docs", "STATUS.md"), "user changed\n", "utf8");
    await expect(applyReviewedMaintenanceAssignment({ project, memory, assignment, evidence: await approvedEvidence(assignment) }))
      .rejects.toBeInstanceOf(MaintenanceApplyBlockedError);

    const forbiddenProject = managedProject(projectRoot, "forbidden-project");
    const forbiddenMemory = externalMemory(projectRoot, forbiddenProject.id);
    const forbidden = await createAssignment(forbiddenProject, forbiddenMemory, { namespaces: ["templates/system-skills"] });
    await expect(applyReviewedMaintenanceAssignment({ project: forbiddenProject, memory: forbiddenMemory, assignment: forbidden, evidence: await approvedEvidence(forbidden) }))
      .rejects.toThrow("namespace is not allowed");
  });

  it("recovers a partial transaction without overwriting unrelated memory", async () => {
    const root = await fixtureRoot();
    process.env.AHO_HOME = join(root, "aho-home");
    const projectRoot = join(root, "project");
    const project = managedProject(projectRoot, "recovery-project");
    const memory = externalMemory(projectRoot, project.id);
    await mkdir(join(memory.memoryRoot, "docs"), { recursive: true });
    await writeFile(join(memory.memoryRoot, "docs", "one.md"), "one-old\n", "utf8");
    await writeFile(join(memory.memoryRoot, "docs", "two.md"), "two-old\n", "utf8");
    const assignment = await createAssignment(project, memory, { namespaces: ["docs"] });
    await writeFile(join(assignment.workspace.workspaceRoot, "docs", "one.md"), "one-new\n", "utf8");
    await writeFile(join(assignment.workspace.workspaceRoot, "docs", "two.md"), "two-new\n", "utf8");
    const evidence = await approvedEvidence(assignment);
    const base = await readMaintenanceTree(assignment.workspace, "base");
    const desired = await readMaintenanceTree(assignment.workspace, "workspace");
    const files: ProjectMemoryApplyFile[] = desired.map((after) => {
      const before = base.find((entry) => entry.path === after.path);
      return {
        path: after.path,
        root: "memory",
        operation: "modify",
        beforeHash: before?.hash ?? null,
        afterHash: after.hash,
        beforeContent: before?.content ?? null,
        afterContent: after.content,
      };
    });
    const transactionPath = maintenanceApplyTransactionPath(memory, assignment.assignmentId);
    await mkdir(join(memory.workbenchRoot, "maintenance", "apply", assignment.assignmentId), { recursive: true });
    const persistedTransaction = {
      version: "1.0",
      id: `memory-apply-${sha256(`${memory.projectId}:${assignment.assignmentId}:${evidence.manifestHash}`)}`,
      assignmentId: assignment.assignmentId,
      projectId: memory.projectId,
      memoryMode: memory.mode,
      manifestHash: evidence.manifestHash,
      baseHash: assignment.workspace.baseHash,
      workspaceHash: evidence.manifestHash,
      beforeTreeHash: hashTree(base),
      afterTreeHash: hashTree(desired),
      stage: "applying",
      files,
      error: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await writeFile(transactionPath, `${JSON.stringify(persistedTransaction, null, 2)}\n`, "utf8");
    persistedTransaction.stage = "unknown";
    await writeFile(transactionPath, `${JSON.stringify(persistedTransaction, null, 2)}\n`, "utf8");
    await expect(applyReviewedMaintenanceAssignment({ project, memory, assignment, evidence }))
      .rejects.toThrow("Unknown project memory apply transaction stage");
    persistedTransaction.stage = "applying";
    persistedTransaction.id = "memory-apply-forged";
    await writeFile(transactionPath, `${JSON.stringify(persistedTransaction, null, 2)}\n`, "utf8");
    await expect(applyReviewedMaintenanceAssignment({ project, memory, assignment, evidence }))
      .rejects.toThrow("stale or belongs to another assignment");
    persistedTransaction.id = `memory-apply-${sha256(`${memory.projectId}:${assignment.assignmentId}:${evidence.manifestHash}`)}`;
    await writeFile(transactionPath, `${JSON.stringify(persistedTransaction, null, 2)}\n`, "utf8");
    await writeFile(join(memory.memoryRoot, "docs", "one.md"), "one-new\n", "utf8");

    const result = await applyReviewedMaintenanceAssignment({ project, memory, assignment, evidence });
    expect(result.status).toBe("applied");
    expect(await readFile(join(memory.memoryRoot, "docs", "one.md"), "utf8")).toBe("one-new\n");
    expect(await readFile(join(memory.memoryRoot, "docs", "two.md"), "utf8")).toBe("two-new\n");
  });
});

async function createAssignment(
  project: ManagedProject,
  memory: ResolvedMemory,
  request: { namespaces: string[]; additionalSources?: Array<{ key: "project"; root: string; namespaces: string[] }> },
): Promise<HarnessEngineeringAssignment> {
  const workspace = await createMaintenanceWorkspace({
    assignmentId: `assignment-${project.id}`,
    memoryMode: memory.mode,
    memoryRoot: memory.memoryRoot,
    maintenanceRoot: join(memory.workbenchRoot, "maintenance"),
    namespaces: request.namespaces,
    ...(request.additionalSources ? { additionalSources: request.additionalSources } : {}),
  });
  return parseHarnessEngineeringAssignment({
    mode: "maintain-assigned-closeout",
    projectId: project.id,
    assignmentId: workspace.assignmentId,
    inputCheckpoint: "checkpoint",
    policyVersion: "policy-v1",
    sourceWindowHash: "window",
    evidenceRefs: ["closeout:change-1"],
    currentDocumentRefs: [],
    currentStableMemoryRefs: [],
    workspace,
    namespaceClasses: ["content"],
    requiredVerification: [],
  });
}

async function approvedEvidence(assignment: HarnessEngineeringAssignment): Promise<MaintenanceProviderRunEvidence> {
  const manifest = await createMaintenanceDiffManifest(assignment.workspace);
  return {
    version: "2.0",
    assignmentId: assignment.assignmentId,
    mode: assignment.mode,
    manifestHash: manifest.workspaceHash,
    manifest,
    producer: { role: "maintenance-agent", threadIds: ["producer"], summary: "reviewed" },
    reviews: [{ decision: "approve", assignmentId: assignment.assignmentId, manifestHash: manifest.workspaceHash, summary: "approved", findings: [], role: "blind-reviewer", threadId: "reviewer", parentThreadId: "coordinator" }],
    quorum: { required: 1, approved: 1 },
    application: "not-applied",
  };
}

function externalMemory(projectRoot: string, projectId: string): ResolvedMemory {
  return resolveMemory({ path: projectRoot, id: projectId, marker: { version: "1.0", id: projectId, name: projectId, managedBy: "agent-harness-orchestrator", memoryMode: "external-local", createdAt: new Date().toISOString() } });
}

function managedProject(path: string, id: string): ManagedProject {
  return { id, name: id, path, addedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() };
}

async function fixtureRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), "aho-memory-apply-"));
  roots.push(root);
  return root;
}

function sha256(value: string): string { return createHash("sha256").update(value, "utf8").digest("hex"); }
