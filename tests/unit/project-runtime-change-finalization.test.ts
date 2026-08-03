import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  providerThreadId: "thread-main",
  attemptStatus: "running" as "running" | "completed",
  authorizationStatus: "active",
  authorizationChangeId: "change-1",
  validationStatus: "passed",
  closeCalls: 0,
  closeFails: false,
  claimCalls: 0,
  terminalReceiptFails: false,
  reconcileCalls: 0,
  failLockAfterClose: false,
  sourceDirty: false,
  decisions: new Map<string, Record<string, unknown>>(),
  writerTail: Promise.resolve() as Promise<void>,
}));

vi.mock("../../src/workbench/persistence/open-workbench-database.js", () => ({
  openProjectRuntimeWorkbenchDatabase: async () => ({
    conversations: {
      readConversation: () => ({
        state: "active",
        boundChangeId: "change-1",
        currentGraphScopeId: "graph-scope-1",
        selectedProviderId: "codex",
      }),
    },
    providerAttempts: {
      readProviderAttempt: () => ({
        conversationId: "conversation-1",
        graphScopeId: "graph-scope-1",
        roleId: "main-agent",
        status: state.attemptStatus,
      }),
      readProviderThread: () => ({
        attemptId: "attempt-main",
        providerThreadId: state.providerThreadId,
      }),
    },
    decisions: {
      listDecisions: (_projectId: string, changeId?: string) => [...state.decisions.values()]
        .filter((item) => !changeId || item.changeId === changeId),
      upsertDecision: (item: Record<string, unknown>) => { state.decisions.set(item.id as string, item); },
    },
    transaction: (operation: () => unknown) => operation(),
    close: () => undefined,
  }),
}));

vi.mock("../../src/project-harness/planning-gate-query.js", () => ({
  readProjectHarnessPlanningGate: async () => ({
    change: { change_id: "change-1", status: "active" },
    lane: {},
    contract: null,
    graph: { id: "graph-1" },
    schedulerPlanning: null,
    authorizationIntent: {
      authorizationId: "authorization-1",
      proposalId: "proposal-1",
      proposalHash: "proposal-hash",
    },
    mainAcceptance: {},
  }),
}));

vi.mock("../../src/workflow-artifacts/hashes.js", () => ({
  hashWorkflowGraphPlan: () => "graph-hash",
}));

vi.mock("../../src/workflow-runtime/execution-authorization.js", () => ({
  readExecutionAuthorization: async () => ({
    id: "authorization-1",
    epoch: 1,
    status: state.authorizationStatus,
    projectId: "project-1",
    changeId: state.authorizationChangeId,
    conversationId: "conversation-1",
    providerThreadId: "thread-main",
    acceptedPlanId: "proposal-1",
    acceptedPlanHash: "proposal-hash",
    graphId: "graph-1",
    graphHash: "graph-hash",
    artifactManifestHash: "artifact-hash",
    sourceHead: "source-head",
    sourceStateHash: "source-state",
    permissionProfileHash: "permission-hash",
    providerScopeHash: "provider-hash",
    policyHash: "policy-hash",
    targets: [{ transition: "change.finalize", targetId: "change-1", manifestHash: "finalize-hash" }],
  }),
  claimTransitionExecution: async () => {
    state.claimCalls += 1;
    return {
      operationId: "operation-1",
      claimToken: "claim-token",
      fencingToken: 1,
    };
  },
  markTransitionExecutionStarted: async () => ({
    operationId: "operation-1",
    authorizationId: "authorization-1",
    authorizationEpoch: 1,
    transition: "change.finalize",
    targetId: "change-1",
    manifestHash: "finalize-hash",
    claimToken: "claim-token",
    fencingToken: 1,
  }),
  reserveTransitionExecutionCommitPoint: async (_runtime: unknown, execution: object) => ({
    ...execution,
    commitPointReservedAt: "now",
  }),
  readTransitionExecution: async () => ({
    operationId: "operation-1",
    authorizationId: "authorization-1",
    authorizationEpoch: 1,
    transition: "change.finalize",
    targetId: "change-1",
    manifestHash: "finalize-hash",
    claimToken: "claim-token",
    fencingToken: 1,
    commitPointReservedAt: "now",
  }),
  reconcileCommittedTransitionExecution: async () => { state.reconcileCalls += 1; },
  recordTransitionExecutionTerminal: async () => {
    if (state.terminalReceiptFails) throw new Error("receipt write failed");
  },
}));

vi.mock("../../src/project-harness/change-evidence.js", () => ({
  validateProjectHarnessChangeEvidence: async () => ({ valid: true, issues: [] }),
}));

vi.mock("../../src/validation/artifacts.js", () => ({
  getLatestValidationSummary: async () => ({
    id: "validation-1",
    status: state.validationStatus,
    worktreeId: "worktree-1",
    worktreeDiffHash: "diff-hash",
  }),
}));

vi.mock("../../src/audit/artifacts.js", () => ({
  getLatestAuditSummary: async () => ({
    id: "audit-1",
    status: "approved",
    validationId: "validation-1",
    worktreeId: "worktree-1",
    worktreeDiffHash: "diff-hash",
  }),
}));

vi.mock("../../src/worktree/manager.js", () => ({
  listWorktreesForChange: async () => [{
    worktreeId: "worktree-1",
    status: "applied",
    appliedCommit: "source-head",
    worktreeDiffHash: "diff-hash",
  }],
}));

vi.mock("../../src/project/git.js", () => ({
  getGitCommit: async () => "source-head",
  getGitStatusShort: async () => state.sourceDirty ? [" M changed.ts"] : [],
}));
vi.mock("../../src/project-harness/registry.js", () => ({
  resolveProjectHarnessRegistryContext: async () => ({ projectId: "project-1" }),
  projectHarnessConversationLane: () => ({ kind: "conversation", conversationId: "conversation-1", graphScopeId: "graph-scope-1" }),
}));
vi.mock("../../src/project-harness/source-fingerprint.js", () => ({
  SourceFingerprintSnapshot: class { fingerprints = async () => ({}); },
}));
vi.mock("../../src/project-harness/change.js", () => ({
  closeProjectHarnessChange: async () => {
    state.closeCalls += 1;
    if (state.closeFails) throw new Error("close transaction failed");
    return { change: { change_id: "change-1" } };
  },
}));
vi.mock("../../src/project-harness/writer-lock.js", () => ({
  projectHarnessSharedWriterRoot: (value: string) => value,
  withProjectHarnessWriterLock: async (_root: string, _options: unknown, action: (scope: { assertCurrent(): Promise<void> }) => Promise<unknown>) => {
    const previous = state.writerTail;
    let release!: () => void;
    state.writerTail = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try {
      return await action({
        assertCurrent: async () => {
          if (state.failLockAfterClose && state.closeCalls > 0) throw new Error("writer lock lost after durable close");
        },
      });
    } finally {
      release();
    }
  },
}));

import {
  assertSkillNativeChangeFinalizationReady,
  finalizeSkillNativeProjectHarnessChange,
  listPendingSkillNativeProjectHarnessChangeFinalizations,
  requestSkillNativeProjectHarnessChangeFinalization,
} from "../../src/project-runtime/change-finalization.js";
import { changeFinalizationToConfirmationItems } from "../../src/workbench/projections/read-model/confirmation/change-finalization.js";

describe("Skill-native Change finalization", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "aho-finalization-"));
    state.providerThreadId = "thread-main";
    state.attemptStatus = "running";
    state.authorizationStatus = "active";
    state.authorizationChangeId = "change-1";
    state.validationStatus = "passed";
    state.closeCalls = 0;
    state.closeFails = false;
    state.claimCalls = 0;
    state.terminalReceiptFails = false;
    state.reconcileCalls = 0;
    state.failLockAfterClose = false;
    state.sourceDirty = false;
    state.decisions.clear();
    state.writerTail = Promise.resolve();
    const evidence = join(root, "skill", "state", "changes", "active", "change-1");
    await mkdir(evidence, { recursive: true });
    await writeFile(join(evidence, "summary.md"), "ready\n", "utf8");
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("accepts only exact Main lineage and terminal evidence", async () => {
    const ready = await assertSkillNativeChangeFinalizationReady(project(root), resolution(root), input());
    expect(ready.authorization.id).toBe("authorization-1");
    expect(ready.manifestHash).toBe("finalize-hash");
  });

  it("rejects a stale authorization, wrong Change, wrong Main thread, and incomplete readiness", async () => {
    state.authorizationStatus = "revoked";
    await expect(assertSkillNativeChangeFinalizationReady(project(root), resolution(root), input()))
      .rejects.toThrow("authorization lineage");
    state.authorizationStatus = "active";
    state.authorizationChangeId = "another-change";
    await expect(assertSkillNativeChangeFinalizationReady(project(root), resolution(root), input()))
      .rejects.toThrow("authorization lineage");
    state.authorizationChangeId = "change-1";
    state.providerThreadId = "another-thread";
    await expect(assertSkillNativeChangeFinalizationReady(project(root), resolution(root), input()))
      .rejects.toThrow("exact current Main Agent thread");
    state.providerThreadId = "thread-main";
    state.validationStatus = "failed";
    await expect(assertSkillNativeChangeFinalizationReady(project(root), resolution(root), input()))
      .rejects.toThrow("same diff");
    state.validationStatus = "passed";
    state.sourceDirty = true;
    await expect(assertSkillNativeChangeFinalizationReady(project(root), resolution(root), input()))
      .rejects.toThrow("same diff");
  });

  it("persists a Main-owned request without closing and projects it once", async () => {
    const request = await requestSkillNativeProjectHarnessChangeFinalization(project(root), resolution(root), input());
    expect(request).toMatchObject({ changeId: "change-1", status: "pending" });
    expect(state.claimCalls).toBe(0);
    expect(state.closeCalls).toBe(0);
    await expect(listPendingSkillNativeProjectHarnessChangeFinalizations(resolution(root), "change-1"))
      .resolves.toEqual([request]);
    const [item] = changeFinalizationToConfirmationItems(project(root), [request]);
    expect(item?.actions).toEqual([expect.objectContaining({
      actionType: "harness-change.close",
      finalizationRequestId: request.id,
      requiresConfirmation: true,
    })]);
    await expect(requestSkillNativeProjectHarnessChangeFinalization(project(root), resolution(root), input()))
      .rejects.toThrow("already pending human confirmation");
  });

  it("serializes concurrent Main requests onto one pending confirmation", async () => {
    const [first, second] = await Promise.allSettled([
      requestSkillNativeProjectHarnessChangeFinalization(project(root), resolution(root), input()),
      requestSkillNativeProjectHarnessChangeFinalization(project(root), resolution(root), { ...input(), turnId: "turn-2" }),
    ]);
    expect([first.status, second.status].sort()).toEqual(["fulfilled", "rejected"]);
    expect([...state.decisions.values()].filter((item) => item.status === "pending")).toHaveLength(1);
  });

  it("publishes one human-confirmed close and rejects duplicate execution", async () => {
    const request = await requestSkillNativeProjectHarnessChangeFinalization(project(root), resolution(root), input());
    state.attemptStatus = "completed";
    const first = await finalizeSkillNativeProjectHarnessChange(project(root), resolution(root), confirmation(request.id));
    expect(first).toMatchObject({ changeId: "change-1", archivePath: "state/changes/archive/change-1" });
    expect(state.claimCalls).toBe(1);
    expect(state.closeCalls).toBe(1);
    await expect(finalizeSkillNativeProjectHarnessChange(project(root), resolution(root), confirmation(request.id)))
      .rejects.toThrow("already been consumed");
    expect(state.claimCalls).toBe(1);
    expect(state.closeCalls).toBe(1);
  });

  it("reconciles a committed close when the terminal receipt write fails", async () => {
    state.terminalReceiptFails = true;
    const request = await requestSkillNativeProjectHarnessChangeFinalization(project(root), resolution(root), input());
    const result = await finalizeSkillNativeProjectHarnessChange(project(root), resolution(root), confirmation(request.id));
    expect(result.archivePath).toBe("state/changes/archive/change-1");
    expect(state.closeCalls).toBe(1);
    expect(state.reconcileCalls).toBe(1);
  });

  it("reconciles a durable close when writer ownership is lost before receipt assignment", async () => {
    const request = await requestSkillNativeProjectHarnessChangeFinalization(project(root), resolution(root), input());
    state.failLockAfterClose = true;
    const result = await finalizeSkillNativeProjectHarnessChange(project(root), resolution(root), confirmation(request.id));
    expect(result.archivePath).toBe("state/changes/archive/change-1");
    expect(state.reconcileCalls).toBe(1);
    expect(state.decisions.get(request.id)?.status).toBe("completed");
  });

  it("keeps a request pending when confirmation lineage becomes stale", async () => {
    const request = await requestSkillNativeProjectHarnessChangeFinalization(project(root), resolution(root), input());
    state.providerThreadId = "replacement-thread";
    await expect(finalizeSkillNativeProjectHarnessChange(project(root), resolution(root), confirmation(request.id)))
      .rejects.toThrow("exact current Main Agent thread");
    expect(state.claimCalls).toBe(0);
    expect(state.closeCalls).toBe(0);
    await expect(listPendingSkillNativeProjectHarnessChangeFinalizations(resolution(root), "change-1"))
      .resolves.toHaveLength(1);
  });

  it("leaves no closed Change and retains the exact request after a failed transaction", async () => {
    const request = await requestSkillNativeProjectHarnessChangeFinalization(project(root), resolution(root), input());
    state.closeFails = true;
    await expect(finalizeSkillNativeProjectHarnessChange(project(root), resolution(root), confirmation(request.id)))
      .rejects.toThrow("close transaction failed");
    expect(state.closeCalls).toBe(1);
    await expect(listPendingSkillNativeProjectHarnessChangeFinalizations(resolution(root), "change-1"))
      .resolves.toEqual([request]);
  });

  it("fails closed instead of projecting competing finalization requests", async () => {
    const request = await requestSkillNativeProjectHarnessChangeFinalization(project(root), resolution(root), input());
    const duplicate = { ...request, id: `${request.id}-duplicate` };
    state.decisions.set(duplicate.id, {
      ...state.decisions.get(request.id),
      id: duplicate.id,
      payloadJson: JSON.stringify(duplicate),
    });
    await expect(listPendingSkillNativeProjectHarnessChangeFinalizations(resolution(root), "change-1"))
      .rejects.toThrow("Multiple pending Change finalization requests");
  });
});

function project(root: string) {
  return { id: "project-1", name: "Project", path: join(root, "project"), addedAt: "now", lastSeenAt: "now", defaultProviderId: "codex" } as const;
}

function resolution(root: string) {
  return {
    projectRoot: join(root, "project"),
    harness: { projectId: "project-1", skillRoot: join(root, "skill"), contentFingerprint: "skill-fingerprint" },
    paths: {
      projectId: "project-1",
      sidecarRoot: join(root, "sidecar"),
      runsRoot: join(root, "sidecar", "runs"),
      workbenchDbPath: join(root, "sidecar", "workbench.sqlite"),
      worktreeMetadataRoot: join(root, "sidecar", "worktrees"),
      worktreeIndexPath: join(root, "sidecar", "worktrees", "index.json"),
    },
  } as never;
}

function confirmation(finalizationRequestId: string) {
  return { changeId: "change-1", finalizationRequestId };
}

function input() {
  return {
    changeId: "change-1",
    conversationId: "conversation-1",
    graphScopeId: "graph-scope-1",
    mainAttemptId: "attempt-main",
    providerThreadId: "thread-main",
    turnId: "turn-1",
  };
}
