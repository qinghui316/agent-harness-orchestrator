import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { initHarness } from "../../src/harness/init.js";
import { resolveProjectMemory } from "../../src/memory/resolver.js";
import type { ManagedProject } from "../../src/types/index.js";
import { createWorkbenchConversation } from "../../src/workbench/chat.js";
import { acceptCurrentConversationPlanningPackage, writePlannerChildProposal } from "../../src/workbench/planning/planner-child-proposal.js";
import { WorkbenchStore } from "../../src/workbench/store.js";
import { startOrResumeTaskQueue } from "../../src/task-queue/manager.js";
import { issueLocalExecutionAuthorization, readExecutionAuthorization } from "../../src/workflow-runtime/execution-authorization.js";

let root: string;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-planning-accept-"));
  await initHarness(project());
});

afterEach(async () => rm(root, { recursive: true, force: true }));

describe("conversation planner-child package acceptance", () => {
  it("rolls back a superseding graph scope when the acceptance commit fails", async () => {
    const conversation = await createWorkbenchConversation(project(), { title: "Atomic graph acceptance", body: "Plan it." }, undefined, { runMainAgent: false });
    const memory = await resolveProjectMemory(project());
    const store = await WorkbenchStore.open(memory);
    try {
      const oldScope = store.readConversation(project().id, conversation.conversationId)?.currentGraphScopeId ?? "";
      store.acceptConversationChangeBinding(project().id, conversation.conversationId, "old-change", new Date().toISOString(), "duplicate-commit", "hash-old");
      store.writeProviderThread({ projectId: project().id, conversationId: conversation.conversationId, providerId: "codex", providerThreadId: "parent-atomic", roleId: "main-agent", parentThreadId: null, changeId: "old-change", graphScopeId: oldScope, capabilityProfile: "main-agent-goal-v1", updatedAt: new Date().toISOString() });
      store.writeProviderThread({ projectId: project().id, conversationId: conversation.conversationId, providerId: "codex", providerThreadId: "child-atomic", roleId: "planning-agent", parentThreadId: "parent-atomic", changeId: "old-change", graphScopeId: oldScope, capabilityProfile: "planner-child-v1", runId: "run-atomic", updatedAt: new Date().toISOString() });

      expect(() => store.acceptConversationChangeBinding(
        project().id,
        conversation.conversationId,
        "new-change",
        new Date().toISOString(),
        "duplicate-commit",
        "hash-new",
        { graphScopeId: "graph:new-atomic", runId: "run-atomic", plannerThreadId: "child-atomic" },
      )).toThrow();

      expect(store.readConversation(project().id, conversation.conversationId)).toMatchObject({
        boundChangeId: "old-change",
        currentGraphScopeId: oldScope,
      });
      expect(store.findChangeForGraphScope(project().id, oldScope)).toBe("old-change");
      expect(store.findChangeForGraphScope(project().id, "graph:new-atomic")).toBeNull();
    } finally {
      store.close();
    }
  });

  it("writes same-child revisions as immutable hash-addressed artifacts", async () => {
    const conversation = await createWorkbenchConversation(project(), { title: "Revise health", body: "Plan health." }, undefined, { runMainAgent: false });
    const memory = await resolveProjectMemory(project());
    const initial = await proposalFor(memory.workbenchRoot, conversation.conversationId, "Initial health behavior.", "run-1", "child-1");
    const revised = await proposalFor(memory.workbenchRoot, conversation.conversationId, "Revised health behavior.", "run-2", "child-1");

    expect(revised.artifact).not.toBe(initial.artifact);
    expect(JSON.parse(await readFile(initial.artifact, "utf8"))).toMatchObject({ id: initial.id, hash: initial.hash });
    expect(JSON.parse(await readFile(revised.artifact, "utf8"))).toMatchObject({ id: revised.id, hash: revised.hash });
  });

  it("rejects ambiguous bare AC syntax from authored proposal files", async () => {
    const conversation = await createWorkbenchConversation(project(), { title: "Invalid", body: "Plan it." }, undefined, { runMainAgent: false });
    const memory = await resolveProjectMemory(project());
    await expect(proposalFor(memory.workbenchRoot, conversation.conversationId, "Expose health.", "run-1", "child-1", "AC-001: Health endpoint responds.\n"))
      .rejects.toThrow("'- AC-001: ...' form");
  });

  it("atomically creates accepted Change artifacts and one canonical graph without execution records", async () => {
    const conversation = await createWorkbenchConversation(project(), { title: "Add a health endpoint", body: "Add GET /health and test it." }, undefined, { runMainAgent: false });
    const memory = await resolveProjectMemory(project());
    const proposal = await proposalFor(memory.workbenchRoot, conversation.conversationId, "Return ok.");
    const beforeAcceptance = await WorkbenchStore.open(memory);
    beforeAcceptance.writeProviderThread({
      projectId: project().id,
      conversationId: conversation.conversationId,
      providerId: "codex",
      providerThreadId: "old-scope-child",
      roleId: "planning-agent",
      parentThreadId: "parent-old",
      changeId: null,
      graphScopeId: "graph-old",
      capabilityProfile: "planner-child-v1",
      updatedAt: new Date().toISOString(),
    });
    beforeAcceptance.close();

    const accepted = await acceptCurrentConversationPlanningPackage(project(), conversation.conversationId, proposal.artifact);
    const changePath = join(memory.changesRoot, "active", accepted.changeId);

    expect(await readFile(join(changePath, "spec.md"), "utf8")).toContain("AC-001");
    expect(await readFile(join(changePath, "plan.md"), "utf8")).toContain("## Workflow");
    expect(await readFile(join(changePath, "tasks.md"), "utf8")).toContain("T-001");
    expect(accepted.workflowGraphPlan).toMatchObject({ graphMode: "sequential-v1", authoringContractVersion: "1.0" });
    expect(existsSync(join(changePath, "planning", "workflow-graph-plan.json"))).toBe(true);
    expect(JSON.parse(await readFile(join(changePath, "planning", "execution-authorization-intent.json"), "utf8"))).toMatchObject({
      status: "pending",
      changeId: accepted.changeId,
      conversationId: conversation.conversationId,
      proposalId: proposal.id,
      proposalHash: proposal.hash,
      graphId: accepted.workflowGraphPlan.id,
      authorizationId: null,
    });
    expect(existsSync(join(memory.runsRoot, "task-runs", accepted.changeId))).toBe(false);
    expect(existsSync(memory.worktreeMetadataRoot)).toBe(false);

    const queue = await startOrResumeTaskQueue(project(), { changeId: accepted.changeId, workflowGraphPlanId: accepted.workflowGraphPlan.id });
    expect(queue).toMatchObject({ resumed: false, queue: { workflowGraphPlanId: accepted.workflowGraphPlan.id }, items: [{ taskId: "T-001" }] });

    const store = await WorkbenchStore.open(memory);
    try {
      expect(store.listConversationChangeIds(project().id, conversation.conversationId)).toEqual([accepted.changeId]);
      const acceptedScope = store.readConversation(project().id, conversation.conversationId)?.currentGraphScopeId ?? null;
      expect(store.findGraphScopeForChange(project().id, accepted.changeId)).toBe(acceptedScope);
      expect(acceptedScope && store.findChangeForGraphScope(project().id, acceptedScope)).toBe(accepted.changeId);
      const links = new Map(store.listProviderThreads(project().id, conversation.conversationId).map((link) => [link.providerThreadId, link]));
      expect(links.get("child-1")?.changeId).toBe(accepted.changeId);
      expect(links.get("old-scope-child")?.changeId).toBeNull();
    } finally {
      store.close();
    }
  });

  it("accepts a planner proposal from the uniquely matching non-Codex provider lineage", async () => {
    const conversation = await createWorkbenchConversation(project(), { title: "Provider plan", body: "Plan it with another provider." }, undefined, { runMainAgent: false });
    const memory = await resolveProjectMemory(project());
    const proposal = await proposalFor(memory.workbenchRoot, conversation.conversationId, "Return ok.", "run-provider", "child-provider", undefined, "test-provider");

    const accepted = await acceptCurrentConversationPlanningPackage(project(), conversation.conversationId, proposal.artifact);

    expect(accepted.proposalHash).toBe(proposal.hash);
    expect(accepted.workflowGraphPlan.changeId).toBe(accepted.changeId);
  });

  it("revises the same active Change and rejects forged cross-conversation proposal scope", async () => {
    const conversation = await createWorkbenchConversation(project(), { title: "Add a health endpoint", body: "Add it." }, undefined, { runMainAgent: false });
    const other = await createWorkbenchConversation(project(), { title: "Other", body: "Other." }, undefined, { runMainAgent: false });
    const memory = await resolveProjectMemory(project());
    const first = await proposalFor(memory.workbenchRoot, conversation.conversationId, "Return ok.");
    const accepted = await acceptCurrentConversationPlanningPackage(project(), conversation.conversationId, first.artifact);
    const second = await proposalFor(memory.workbenchRoot, conversation.conversationId, "Return healthy.", "run-2", "child-2");
    const revised = await acceptCurrentConversationPlanningPackage(project(), conversation.conversationId, second.artifact);

    expect(revised.changeId).toBe(accepted.changeId);
    expect(await readFile(join(memory.changesRoot, "active", accepted.changeId, "plan.md"), "utf8")).toContain("Return healthy.");
    await expect(acceptCurrentConversationPlanningPackage(project(), other.conversationId, second.artifact)).rejects.toThrow(/scope/);
  });

  it("revokes a superseded execution authorization before replacing accepted artifacts", async () => {
    const conversation = await createWorkbenchConversation(project(), { title: "Revocable plan", body: "Plan it." }, undefined, { runMainAgent: false });
    const memory = await resolveProjectMemory(project());
    const first = await proposalFor(memory.workbenchRoot, conversation.conversationId, "Return ok.");
    const accepted = await acceptCurrentConversationPlanningPackage(project(), conversation.conversationId, first.artifact);
    const hash = "a".repeat(64);
    const authorization = await issueLocalExecutionAuthorization(memory, {
      projectId: project().id, changeId: accepted.changeId, conversationId: conversation.conversationId,
      providerThreadId: "parent-1", goalIdentityHash: hash, mode: "stepwise",
      acceptedPlanId: accepted.proposalId, acceptedPlanHash: accepted.proposalHash,
      graphId: accepted.workflowGraphPlan.id, graphHash: hash, artifactManifestHash: hash,
      sourceHead: "commit-1", sourceStateHash: hash, permissionProfileHash: hash,
      providerScopeHash: hash, policyHash: hash,
      targets: [{ transition: "workflow.node.execute", targetId: "health", manifestHash: hash }],
      budget: { maxCompletedOperations: 8, maxReworks: 1, maxChangedFiles: 20, maxChangedBytes: 1_000_000 },
      userDecision: { decisionId: "execute-first", actorId: "user", decidedAt: new Date().toISOString() },
      issuedAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    await writeFile(join(memory.changesRoot, "active", accepted.changeId, "planning", "execution-authorization-intent.json"), JSON.stringify({
      version: "1.0", status: "issued", proposalHash: accepted.proposalHash, authorizationId: authorization.id,
    }), "utf8");
    const revised = await proposalFor(memory.workbenchRoot, conversation.conversationId, "Return healthy.", "run-2", "child-2");

    await acceptCurrentConversationPlanningPackage(project(), conversation.conversationId, revised.artifact);

    expect(await readExecutionAuthorization(memory, authorization.id)).toMatchObject({ status: "revoked", epoch: 1 });
  });

  it("rejects a bound Change id that escapes the active root", async () => {
    const conversation = await createWorkbenchConversation(project(), { title: "Traversal", body: "Plan it." }, undefined, { runMainAgent: false });
    const memory = await resolveProjectMemory(project());
    const proposal = await proposalFor(memory.workbenchRoot, conversation.conversationId, "Return ok.");
    const store = await WorkbenchStore.open(memory);
    try {
      store.acceptConversationChangeBinding(project().id, conversation.conversationId, "..\\escaped", new Date().toISOString(), "malicious-binding", proposal.hash);
    } finally {
      store.close();
    }
    await expect(acceptCurrentConversationPlanningPackage(project(), conversation.conversationId, proposal.artifact))
      .rejects.toThrow(/escapes the active Change root/);
  });

  it("creates a new Change when revising after execution evidence exists", async () => {
    const conversation = await createWorkbenchConversation(project(), { title: "Add a health endpoint", body: "Add it." }, undefined, { runMainAgent: false });
    const memory = await resolveProjectMemory(project());
    const first = await proposalFor(memory.workbenchRoot, conversation.conversationId, "Return ok.");
    const accepted = await acceptCurrentConversationPlanningPackage(project(), conversation.conversationId, first.artifact);
    const firstStore = await WorkbenchStore.open(memory);
    const firstScope = firstStore.findGraphScopeForChange(project().id, accepted.changeId);
    firstStore.close();
    await startOrResumeTaskQueue(project(), { changeId: accepted.changeId, workflowGraphPlanId: accepted.workflowGraphPlan.id });
    const second = await proposalFor(memory.workbenchRoot, conversation.conversationId, "Return healthy.", "run-2", "child-2");

    const revised = await acceptCurrentConversationPlanningPackage(project(), conversation.conversationId, second.artifact);

    expect(revised.changeId).not.toBe(accepted.changeId);
    expect(existsSync(join(memory.changesRoot, "active", accepted.changeId))).toBe(true);
    expect(await readFile(join(memory.changesRoot, "active", revised.changeId, "plan.md"), "utf8")).toContain("Return healthy.");
    const revisedStore = await WorkbenchStore.open(memory);
    try {
      const revisedScope = revisedStore.findGraphScopeForChange(project().id, revised.changeId);
      expect(revisedScope).toBeTruthy();
      expect(revisedScope).not.toBe(firstScope);
      expect(revisedStore.findChangeForGraphScope(project().id, firstScope!)).toBe(accepted.changeId);
      expect(revisedStore.findChangeForGraphScope(project().id, revisedScope!)).toBe(revised.changeId);
    } finally {
      revisedStore.close();
    }
  });

  it("serializes duplicate concurrent acceptance and returns one Change", async () => {
    const conversation = await createWorkbenchConversation(project(), { title: "Add a health endpoint", body: "Add it." }, undefined, { runMainAgent: false });
    const memory = await resolveProjectMemory(project());
    const proposal = await proposalFor(memory.workbenchRoot, conversation.conversationId, "Return ok.");

    const [first, second] = await Promise.all([
      acceptCurrentConversationPlanningPackage(project(), conversation.conversationId, proposal.artifact),
      acceptCurrentConversationPlanningPackage(project(), conversation.conversationId, proposal.artifact),
    ]);

    expect(second.changeId).toBe(first.changeId);
    expect(second.workflowGraphPlan.id).toBe(first.workflowGraphPlan.id);
    expect(second.authorizationIntentArtifact).toBe(first.authorizationIntentArtifact);
  });

  it("rolls back an uncommitted filesystem swap before accepting the same proposal", async () => {
    const conversation = await createWorkbenchConversation(project(), { title: "Add a health endpoint", body: "Add it." }, undefined, { runMainAgent: false });
    const memory = await resolveProjectMemory(project());
    const proposal = await proposalFor(memory.workbenchRoot, conversation.conversationId, "Return ok.");
    const accepted = await acceptCurrentConversationPlanningPackage(project(), conversation.conversationId, proposal.artifact);
    const activePath = join(memory.changesRoot, "active", accepted.changeId);
    const transactionRoot = join(memory.changesRoot, ".transactions");
    const backupPath = join(transactionRoot, "crash-before-db.backup");
    const stagingPath = join(transactionRoot, "crash-before-db.staging");
    await cp(activePath, backupPath, { recursive: true });
    await writeFile(join(activePath, "spec.md"), "# partial replacement\n", "utf8");
    await writeFile(join(transactionRoot, "crash-before-db.json"), JSON.stringify({
      version: "1.0",
      id: "crash-before-db",
      phase: "swapped",
      activePath,
      stagingPath,
      backupPath,
      replacing: true,
    }), "utf8");

    await acceptCurrentConversationPlanningPackage(project(), conversation.conversationId, proposal.artifact);

    expect(await readFile(join(activePath, "spec.md"), "utf8")).toContain("AC-001");
    expect(existsSync(backupPath)).toBe(false);
  });

  it("keeps a committed filesystem swap and only finishes transaction cleanup", async () => {
    const conversation = await createWorkbenchConversation(project(), { title: "Add a health endpoint", body: "Add it." }, undefined, { runMainAgent: false });
    const memory = await resolveProjectMemory(project());
    const proposal = await proposalFor(memory.workbenchRoot, conversation.conversationId, "Return ok.");
    const accepted = await acceptCurrentConversationPlanningPackage(project(), conversation.conversationId, proposal.artifact);
    const activePath = join(memory.changesRoot, "active", accepted.changeId);
    const transactionRoot = join(memory.changesRoot, ".transactions");
    const backupPath = join(transactionRoot, "crash-after-db.backup");
    const stagingPath = join(transactionRoot, "crash-after-db.staging");
    await mkdir(stagingPath, { recursive: true });
    await cp(activePath, backupPath, { recursive: true });
    await writeFile(join(transactionRoot, "crash-after-db.json"), JSON.stringify({
      version: "1.0",
      id: "crash-after-db",
      phase: "swapped",
      activePath,
      stagingPath,
      backupPath,
      replacing: true,
    }), "utf8");
    const store = await WorkbenchStore.open(memory);
    try {
      store.acceptConversationChangeBinding(project().id, conversation.conversationId, accepted.changeId, new Date().toISOString(), "crash-after-db", proposal.hash);
    } finally {
      store.close();
    }

    await acceptCurrentConversationPlanningPackage(project(), conversation.conversationId, proposal.artifact);

    expect(await readFile(join(activePath, "spec.md"), "utf8")).toContain("AC-001");
    expect(existsSync(backupPath)).toBe(false);
    expect(existsSync(stagingPath)).toBe(false);
  });
});

async function proposalFor(workbenchRoot: string, conversationId: string, prompt: string, runId = "run-1", childThreadId = "child-1", acceptance = "- AC-001: Health endpoint responds successfully.\n", providerId = "codex") {
  const directory = join(workbenchRoot, "conversations", conversationId, "runs", runId);
  const proposalDirectory = join(directory, "planner-proposal");
  await mkdir(proposalDirectory, { recursive: true });
  await writeFile(join(proposalDirectory, "spec.md"), `# Spec\n\n## Acceptance Criteria\n\n${acceptance}`, "utf8");
  await writeFile(join(proposalDirectory, "plan.md"), [
    "# Plan", "", "## Approach", "Implement the endpoint.", "", "## Workflow", "", "```json",
    JSON.stringify({ version: "1.0", mode: "sequential-v1", nodes: [{ id: "health", title: "Health endpoint", taskIds: ["T-001"], acIds: ["AC-001"], prompt: structuredPrompt(prompt), dependsOn: [], sourceScopes: ["src/**", "tests/**"] }] }, null, 2),
    "```", "",
  ].join("\n"), "utf8");
  await writeFile(join(proposalDirectory, "tasks.md"), "# Tasks\n\n- [ ] T-001: Implement and test the health endpoint.\n  - Covers: AC-001\n", "utf8");
  const proposal = await writePlannerChildProposal({
    directory,
    projectId: project().id,
    conversationId,
    runId,
    parentThreadId: "parent-1",
    childThreadId,
  });
  const memory = await resolveProjectMemory(project());
  const store = await WorkbenchStore.open(memory);
  const now = new Date().toISOString();
  try {
    const graphScopeId = store.readConversation(project().id, conversationId)?.currentGraphScopeId ?? null;
    store.writeProviderThread({ projectId: project().id, conversationId, providerId, providerThreadId: "parent-1", roleId: "main-agent", parentThreadId: null, changeId: null, graphScopeId, capabilityProfile: "main-agent-goal-v1", updatedAt: now });
    store.writeProviderThread({ projectId: project().id, conversationId, providerId, providerThreadId: childThreadId, roleId: "planning-agent", parentThreadId: "parent-1", changeId: null, graphScopeId, capabilityProfile: "planner-child-v1", updatedAt: now });
    store.appendMessage({
      id: `assistant:${conversationId}:${runId}:${childThreadId}`,
      projectId: project().id,
      conversationId,
      changeId: "",
      type: "assistant.message",
      timestamp: now,
      text: proposal.planMd,
      actionRunId: null,
      actionType: null,
      status: "completed",
      runId,
      artifact: proposal.artifact,
      error: null,
      rawJson: JSON.stringify({ agentRoleId: "planning-agent", artifact: proposal.artifact, graphScopeId }),
    });
  } finally {
    store.close();
  }
  return proposal;
}

function structuredPrompt(objective: string): string {
  return `Objective: ${objective} Required behavior: Complete the accepted task. Constraints: Stay within accepted source scopes. Expected evidence: Report changed files and verification results.`;
}

function project(): ManagedProject {
  return { id: "repo", name: "Repo", path: root, addedAt: "2026-07-10T00:00:00.000Z", lastSeenAt: "2026-07-10T00:00:00.000Z" };
}
