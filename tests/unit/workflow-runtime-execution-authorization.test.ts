import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ExecutionAuthorizationSnapshot, ResolvedMemory } from "../../src/types/index.js";
import {
  SCOPED_AUTO_EXECUTION_ENABLED,
  appendLocalExecutionAuthorizationTargets,
  assertScopedAutoExecutionEnabled,
  assertTransitionExecutionCurrent,
  claimTransitionExecution,
  deterministicTransitionOperationId,
  heartbeatTransitionExecution,
  issueLocalExecutionAuthorization,
  markTransitionExecutionStarted,
  recordTransitionExecutionTerminal,
  recoverTransitionExecution,
  reconcileCommittedTransitionExecution,
  reserveTransitionExecutionCommitPoint,
  reactivateLocalExecutionAuthorizationAfterRollback,
  revokeLocalExecutionAuthorization,
} from "../../src/workflow-runtime/execution-authorization.js";
import { transitionExecutionPath } from "../../src/workflow-runtime/execution-authorization-repository.js";

const H = "a".repeat(64);
const H2 = "b".repeat(64);
const NOW = new Date("2026-07-11T00:00:00.000Z");
let root = "";
let memory: ResolvedMemory;

const snapshot: ExecutionAuthorizationSnapshot = {
  acceptedPlanHash: H,
  graphHash: H,
  artifactManifestHash: H,
  sourceHead: "commit-1",
  sourceStateHash: H,
  permissionProfileHash: H,
  providerScopeHash: H,
  policyHash: H,
};

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "aho-execution-authorization-"));
  memory = {
    mode: "external-local",
    supported: true,
    writable: true,
    artifactBase: "memory-root",
    projectId: "project-1",
    projectRoot: root,
    markerPath: join(root, "project.json"),
    agentGuidePath: join(root, "AGENTS.md"),
    memoryRoot: root,
    docsRoot: join(root, "docs"),
    harnessRoot: join(root, "harness"),
    changesRoot: join(root, "harness", "changes"),
    evolutionRoot: join(root, "harness", "evolution"),
    templatesRoot: join(root, "templates"),
    scriptsRoot: join(root, "scripts"),
    runsRoot: join(root, "runs"),
    workbenchRoot: join(root, "workbench"),
    workbenchDbPath: join(root, "workbench", "workbench.sqlite"),
    agentsRoot: join(root, "agents"),
    commandsRoot: join(root, "commands"),
    agentCatalogPath: join(root, "agents", "catalog.json"),
    skillsRoot: join(root, "skills"),
    worktreeMetadataRoot: join(root, "worktrees"),
    worktreeIndexPath: join(root, "worktrees", "index.json"),
  };
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

async function issue(overrides: { mode?: "stepwise" | "scoped-auto"; expiresAt?: string; maxCompletedOperations?: number; decisionId?: string } = {}) {
  return issueLocalExecutionAuthorization(memory, {
    projectId: "project-1",
    changeId: "change-1",
    conversationId: "conversation-1",
    providerThreadId: "thread-1",
    goalIdentityHash: H,
    mode: overrides.mode ?? "stepwise",
    acceptedPlanId: "plan-1",
    acceptedPlanHash: H,
    graphId: "graph-1",
    graphHash: H,
    artifactManifestHash: H,
    sourceHead: "commit-1",
    sourceStateHash: H,
    permissionProfileHash: H,
    providerScopeHash: H,
    policyHash: H,
    targets: [
      { transition: "task.start", targetId: "task-1", manifestHash: H },
      { transition: "task.start", targetId: "task-2", manifestHash: H2 },
    ],
    budget: {
      maxCompletedOperations: overrides.maxCompletedOperations ?? 2,
      maxReworks: 1,
      maxChangedFiles: 20,
      maxChangedBytes: 1_000_000,
    },
    userDecision: { decisionId: overrides.decisionId ?? "decision-1", actorId: "user-1", decidedAt: NOW.toISOString() },
    issuedAt: NOW.toISOString(),
    expiresAt: overrides.expiresAt ?? "2026-07-12T00:00:00.000Z",
  });
}

function claimInput(authorizationId: string, overrides: Partial<Parameters<typeof claimTransitionExecution>[1]> = {}) {
  return {
    authorizationId,
    authorizationEpoch: 0,
    transition: "task.start",
    targetId: "task-1",
    manifestHash: H,
    snapshot,
    claimedBy: "runtime-1",
    now: NOW,
    ...overrides,
  };
}

async function startAndReserve(claim: Awaited<ReturnType<typeof claimTransitionExecution>>, now = NOW) {
  await markTransitionExecutionStarted(memory, claim.operationId, claim.claimToken, claim.fencingToken, now);
  return reserveTransitionExecutionCommitPoint(memory, {
    operationId: claim.operationId,
    authorizationId: claim.authorizationId,
    authorizationEpoch: claim.authorizationEpoch,
    transition: claim.transition,
    targetId: claim.targetId,
    manifestHash: claim.manifestHash,
    claimToken: claim.claimToken,
    fencingToken: claim.fencingToken,
    now,
  });
}

describe("workflow runtime execution authorization", () => {
  it("persists stepwise and scoped-auto modes while scoped-auto dispatch stays disabled", async () => {
    const stepwise = await issue();
    const scopedAuto = await issue({ mode: "scoped-auto" });

    expect(stepwise.mode).toBe("stepwise");
    expect(scopedAuto.mode).toBe("scoped-auto");
    expect(SCOPED_AUTO_EXECUTION_ENABLED).toBe(false);
    expect(() => assertScopedAutoExecutionEnabled()).toThrow("feature-disabled");
  });

  it("derives a deterministic operation id and gives one concurrent claimant ownership", async () => {
    const authorization = await issue();
    const input = claimInput(authorization.id);
    expect(deterministicTransitionOperationId(input)).toBe(deterministicTransitionOperationId({ ...input }));

    const claims = await Promise.allSettled([
      claimTransitionExecution(memory, input),
      claimTransitionExecution(memory, { ...input, claimedBy: "runtime-2" }),
    ]);
    expect(claims.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(claims.filter((result) => result.status === "rejected")).toHaveLength(1);
  });

  it("recovers incomplete work and records a single terminal completion receipt", async () => {
    const authorization = await issue();
    const claim = await claimTransitionExecution(memory, claimInput(authorization.id));
    const executing = await startAndReserve(claim);

    expect(await recoverTransitionExecution(memory, claim.operationId)).toEqual(executing);
    const completed = await recordTransitionExecutionTerminal(memory, {
      operationId: claim.operationId,
      claimToken: claim.claimToken,
      fencingToken: claim.fencingToken,
      outcome: "completed",
      evidenceRefs: ["runs/run-1/result.json"],
      now: NOW,
    });
    expect(completed).toMatchObject({ status: "completed", receipt: { consumesAuthorization: true } });
    await expect(recordTransitionExecutionTerminal(memory, {
      operationId: claim.operationId,
      claimToken: claim.claimToken,
      fencingToken: claim.fencingToken,
      outcome: "completed",
      now: NOW,
    })).rejects.toThrow("terminal receipt");
  });

  it("reconciles a durably committed transition after its claim and authorization expire", async () => {
    const authorization = await issue({ expiresAt: "2026-07-11T00:00:01.000Z" });
    const claim = await claimTransitionExecution(memory, claimInput(authorization.id, { claimTtlMs: 500 }));
    await startAndReserve(claim);

    const completed = await reconcileCommittedTransitionExecution(memory, {
      operationId: claim.operationId,
      authorizationId: authorization.id,
      authorizationEpoch: authorization.epoch,
      transition: "task.start",
      targetId: "task-1",
      manifestHash: H,
      claimToken: claim.claimToken,
      fencingToken: claim.fencingToken,
      evidenceRefs: ["runs/apply-1/apply.json"],
      now: new Date(NOW.getTime() + 2_000),
    });

    expect(completed).toMatchObject({
      status: "completed",
      receipt: { outcome: "completed", evidenceRefs: ["runs/apply-1/apply.json"] },
    });
    await expect(reconcileCommittedTransitionExecution(memory, {
      operationId: claim.operationId,
      authorizationId: authorization.id,
      authorizationEpoch: authorization.epoch,
      transition: "task.start",
      targetId: "forged-target",
      manifestHash: H,
      claimToken: claim.claimToken,
      fencingToken: claim.fencingToken,
      evidenceRefs: [],
      now: new Date(NOW.getTime() + 2_001),
    })).rejects.toThrow(/stale or forged/);
  });

  it("rejects expired claims and revoked authorization at the commit point", async () => {
    const expiredAuthorization = await issue({ decisionId: "decision-expiring", expiresAt: "2026-07-11T00:00:10.000Z" });
    const expiredClaim = await claimTransitionExecution(memory, claimInput(expiredAuthorization.id, { claimTtlMs: 500 }));
    await markTransitionExecutionStarted(memory, expiredClaim.operationId, expiredClaim.claimToken, expiredClaim.fencingToken, NOW);
    await expect(assertTransitionExecutionCurrent(memory, {
      operationId: expiredClaim.operationId,
      authorizationId: expiredAuthorization.id,
      authorizationEpoch: expiredAuthorization.epoch,
      transition: "task.start",
      targetId: "task-1",
      manifestHash: H,
      claimToken: expiredClaim.claimToken,
      fencingToken: expiredClaim.fencingToken,
      now: new Date(NOW.getTime() + 501),
    })).rejects.toThrow("claim is expired");

    const active = await issue({ decisionId: "decision-revoked-before-commit" });
    const claim = await claimTransitionExecution(memory, claimInput(active.id, { targetId: "task-2", manifestHash: H2 }));
    await markTransitionExecutionStarted(memory, claim.operationId, claim.claimToken, claim.fencingToken, NOW);
    await revokeLocalExecutionAuthorization(memory, active.id, "cancel before commit", new Date(NOW.getTime() + 1));
    await expect(assertTransitionExecutionCurrent(memory, {
      operationId: claim.operationId,
      authorizationId: active.id,
      authorizationEpoch: active.epoch,
      transition: "task.start",
      targetId: "task-2",
      manifestHash: H2,
      claimToken: claim.claimToken,
      fencingToken: claim.fencingToken,
      now: new Date(NOW.getTime() + 2),
    })).rejects.toThrow(/epoch|revoked/);
  });

  it("does not consume budget for a failed terminal receipt", async () => {
    const authorization = await issue({ maxCompletedOperations: 1 });
    const failedClaim = await claimTransitionExecution(memory, claimInput(authorization.id));
    const failed = await recordTransitionExecutionTerminal(memory, {
      operationId: failedClaim.operationId,
      claimToken: failedClaim.claimToken,
      fencingToken: failedClaim.fencingToken,
      outcome: "terminal-failed",
      error: "executor crashed",
      now: NOW,
    });
    expect(failed).toMatchObject({ status: "terminal-failed", receipt: { consumesAuthorization: false } });

    const second = await claimTransitionExecution(memory, claimInput(authorization.id, {
      targetId: "task-2",
      manifestHash: H2,
    }));
    await startAndReserve(second);
    await recordTransitionExecutionTerminal(memory, {
      operationId: second.operationId,
      claimToken: second.claimToken,
      fencingToken: second.fencingToken,
      outcome: "completed",
      now: NOW,
    });
    await expect(claimTransitionExecution(memory, claimInput(authorization.id, {
      transition: "task.start",
      targetId: "task-1",
      manifestHash: H,
    }))).rejects.toThrow(/budget|already/);
  });

  it("fails closed for forged targets, stale snapshots, expiry, revocation epochs, and claim tokens", async () => {
    const authorization = await issue();
    await expect(claimTransitionExecution(memory, claimInput(authorization.id, { targetId: "forged" })))
      .rejects.toThrow("not authorized");
    await expect(claimTransitionExecution(memory, claimInput(authorization.id, {
      snapshot: { ...snapshot, sourceStateHash: H2 },
    }))).rejects.toThrow("sourceStateHash");

    const claim = await claimTransitionExecution(memory, claimInput(authorization.id));
    await expect(markTransitionExecutionStarted(memory, claim.operationId, "forged-token", claim.fencingToken, NOW))
      .rejects.toThrow("claim token");
    const revoked = await revokeLocalExecutionAuthorization(memory, authorization.id, "User stopped execution.", NOW);
    expect(revoked.epoch).toBe(1);
    await expect(markTransitionExecutionStarted(memory, claim.operationId, claim.claimToken, claim.fencingToken, NOW))
      .rejects.toThrow("epoch");

    const expired = await issue({ expiresAt: "2026-07-10T00:00:00.000Z", decisionId: "decision-expired" });
    await expect(claimTransitionExecution(memory, claimInput(expired.id))).rejects.toThrow("expired");
  });

  it("returns the existing authorization on retry and never revives a revoked authorization", async () => {
    const authorization = await issue();
    expect((await issue()).id).toBe(authorization.id);
    await revokeLocalExecutionAuthorization(memory, authorization.id, "Execution cancelled.", NOW);
    await expect(issue()).rejects.toThrow("cannot be reissued");
  });

  it("appends a broker-derived target with a new epoch and invalidates old claims", async () => {
    const authorization = await issue();
    const oldClaim = await claimTransitionExecution(memory, claimInput(authorization.id));
    const amended = await appendLocalExecutionAuthorizationTargets(memory, authorization.id, authorization.epoch, snapshot, { projectId: memory.projectId, changeId: "change-1" }, [
      { transition: "source.apply", targetId: "worktree-1", manifestHash: H2 },
    ], NOW);
    expect(amended).toMatchObject({ epoch: 1, targets: expect.arrayContaining([expect.objectContaining({ transition: "source.apply" })]) });
    await expect(markTransitionExecutionStarted(memory, oldClaim.operationId, oldClaim.claimToken, oldClaim.fencingToken, NOW))
      .rejects.toThrow(/epoch/);
    const retried = await appendLocalExecutionAuthorizationTargets(memory, authorization.id, amended.epoch, snapshot, { projectId: memory.projectId, changeId: "change-1" }, [
      { transition: "source.apply", targetId: "worktree-1", manifestHash: H2 },
    ], NOW);
    expect(retried.epoch).toBe(1);
  });

  it("rejects target amendments from another project or Change", async () => {
    const authorization = await issue();
    await expect(appendLocalExecutionAuthorizationTargets(
      memory,
      authorization.id,
      authorization.epoch,
      snapshot,
      { projectId: memory.projectId, changeId: "change-2" },
      [{ transition: "source.apply", targetId: "worktree-2", manifestHash: H2 }],
      NOW,
    )).rejects.toThrow(/scope does not match/);
  });

  it("atomically reserves completion budget across concurrent commit points", async () => {
    const authorization = await issue({ maxCompletedOperations: 1 });
    const claims = await Promise.all([
      claimTransitionExecution(memory, claimInput(authorization.id, { claimTtlMs: 100 })),
      claimTransitionExecution(memory, claimInput(authorization.id, {
        targetId: "task-2",
        manifestHash: H2,
        claimedBy: "runtime-2",
      })),
    ]);
    await Promise.all(claims.map((claim) => markTransitionExecutionStarted(memory, claim.operationId, claim.claimToken, claim.fencingToken, NOW)));
    const reservations = await Promise.allSettled(claims.map((claim) => reserveTransitionExecutionCommitPoint(memory, {
      operationId: claim.operationId,
      authorizationId: claim.authorizationId,
      authorizationEpoch: claim.authorizationEpoch,
      transition: claim.transition,
      targetId: claim.targetId,
      manifestHash: claim.manifestHash,
      claimToken: claim.claimToken,
      fencingToken: claim.fencingToken,
      now: NOW,
    })));
    expect(reservations.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(reservations.filter((result) => result.status === "rejected")).toHaveLength(1);

    const reserved = reservations.find((result): result is PromiseFulfilledResult<Awaited<ReturnType<typeof reserveTransitionExecutionCommitPoint>>> => result.status === "fulfilled")!.value;
    await expect(reserveTransitionExecutionCommitPoint(memory, {
      operationId: reserved.operationId,
      authorizationId: reserved.authorizationId,
      authorizationEpoch: reserved.authorizationEpoch,
      transition: reserved.transition,
      targetId: reserved.targetId,
      manifestHash: reserved.manifestHash,
      claimToken: reserved.claimToken,
      fencingToken: reserved.fencingToken,
      now: new Date(NOW.getTime() + 101),
    })).resolves.toMatchObject({ operationId: reserved.operationId, commitPointReservedAt: NOW.toISOString() });
  });

  it("serializes commit-point reservation with revocation without cancelling a won reservation", async () => {
    const authorization = await issue({ decisionId: "decision-reserve-revoke", maxCompletedOperations: 1 });
    const claim = await claimTransitionExecution(memory, claimInput(authorization.id));
    await markTransitionExecutionStarted(memory, claim.operationId, claim.claimToken, claim.fencingToken, NOW);
    const reservationInput = {
      operationId: claim.operationId,
      authorizationId: claim.authorizationId,
      authorizationEpoch: claim.authorizationEpoch,
      transition: claim.transition,
      targetId: claim.targetId,
      manifestHash: claim.manifestHash,
      claimToken: claim.claimToken,
      fencingToken: claim.fencingToken,
      now: NOW,
    };

    const [reservation, revocation] = await Promise.allSettled([
      reserveTransitionExecutionCommitPoint(memory, reservationInput),
      revokeLocalExecutionAuthorization(memory, authorization.id, "concurrent cancellation", NOW),
    ]);

    expect(revocation.status).toBe("fulfilled");
    if (reservation.status === "fulfilled") {
      expect(reservation.value.commitPointReservedAt).toBe(NOW.toISOString());
      await expect(reconcileCommittedTransitionExecution(memory, {
        ...reservationInput,
        evidenceRefs: ["runs/committed/result.json"],
        now: new Date(NOW.getTime() + 1),
      })).resolves.toMatchObject({ status: "completed" });
    } else {
      expect(reservation.reason).toBeInstanceOf(Error);
      expect(String(reservation.reason)).toMatch(/epoch|revoked/);
    }
  });

  it("keeps an old-epoch commit reservation charged against the authorization budget", async () => {
    const authorization = await issue({ decisionId: "decision-epoch-budget", maxCompletedOperations: 1 });
    const oldClaim = await claimTransitionExecution(memory, claimInput(authorization.id));
    await startAndReserve(oldClaim);
    const amended = await appendLocalExecutionAuthorizationTargets(
      memory,
      authorization.id,
      authorization.epoch,
      snapshot,
      { projectId: memory.projectId, changeId: "change-1" },
      [{ transition: "source.apply", targetId: "worktree-epoch-1", manifestHash: H2 }],
      NOW,
    );
    const newClaim = await claimTransitionExecution(memory, claimInput(amended.id, {
      authorizationEpoch: amended.epoch,
      transition: "source.apply",
      targetId: "worktree-epoch-1",
      manifestHash: H2,
    }));

    await expect(startAndReserve(newClaim)).rejects.toThrow("budget is exhausted");
    await expect(reconcileCommittedTransitionExecution(memory, {
      operationId: oldClaim.operationId,
      authorizationId: oldClaim.authorizationId,
      authorizationEpoch: oldClaim.authorizationEpoch,
      transition: oldClaim.transition,
      targetId: oldClaim.targetId,
      manifestHash: oldClaim.manifestHash,
      claimToken: oldClaim.claimToken,
      fencingToken: oldClaim.fencingToken,
      evidenceRefs: ["runs/old-epoch/result.json"],
      now: new Date(NOW.getTime() + 1),
    })).resolves.toMatchObject({ status: "completed" });
  });

  it("takes over expired claimed and executing work with a monotonic fence", async () => {
    const authorization = await issue();
    const first = await claimTransitionExecution(memory, claimInput(authorization.id, { claimTtlMs: 1_000 }));
    await markTransitionExecutionStarted(memory, first.operationId, first.claimToken, first.fencingToken, NOW);
    const takeoverNow = new Date(NOW.getTime() + 1_001);
    const takeover = await claimTransitionExecution(memory, claimInput(authorization.id, {
      claimedBy: "recovery-runtime",
      claimTtlMs: 1_000,
      now: takeoverNow,
    }));

    expect(takeover.fencingToken).toBe(first.fencingToken + 1);
    expect(takeover.claimToken).not.toBe(first.claimToken);
    await expect(recordTransitionExecutionTerminal(memory, {
      operationId: first.operationId,
      claimToken: first.claimToken,
      fencingToken: first.fencingToken,
      outcome: "completed",
      now: takeoverNow,
    })).rejects.toThrow(/claim token|fencing token/);
  });

  it("renews an executing claim so a live executor cannot be taken over", async () => {
    const authorization = await issue();
    const first = await claimTransitionExecution(memory, claimInput(authorization.id, { claimTtlMs: 1_000 }));
    await markTransitionExecutionStarted(memory, first.operationId, first.claimToken, first.fencingToken, NOW);
    const renewed = await heartbeatTransitionExecution(
      memory,
      first.operationId,
      first.claimToken,
      first.fencingToken,
      1_000,
      new Date(NOW.getTime() + 900),
    );
    expect(renewed.claimExpiresAt).toBe("2026-07-11T00:00:01.900Z");
    await expect(claimTransitionExecution(memory, claimInput(authorization.id, {
      claimedBy: "recovery-runtime",
      now: new Date(NOW.getTime() + 1_001),
    }))).rejects.toThrow(/already executing/);
  });

  it("allows retryable failure takeover but never takes over completed or terminal-failed work", async () => {
    const authorization = await issue();
    const retryableClaim = await claimTransitionExecution(memory, claimInput(authorization.id));
    await recordTransitionExecutionTerminal(memory, {
      operationId: retryableClaim.operationId,
      claimToken: retryableClaim.claimToken,
      fencingToken: retryableClaim.fencingToken,
      outcome: "retryable-failed",
      error: "worker crashed",
      now: NOW,
    });
    const retry = await claimTransitionExecution(memory, claimInput(authorization.id, { claimedBy: "recovery-runtime" }));
    expect(retry.fencingToken).toBe(2);

    await recordTransitionExecutionTerminal(memory, {
      operationId: retry.operationId,
      claimToken: retry.claimToken,
      fencingToken: retry.fencingToken,
      outcome: "terminal-failed",
      error: "not retryable",
      now: NOW,
    });
    await expect(claimTransitionExecution(memory, claimInput(authorization.id))).rejects.toThrow("terminal-failed");

    const completedClaim = await claimTransitionExecution(memory, claimInput(authorization.id, {
      targetId: "task-2",
      manifestHash: H2,
    }));
    await startAndReserve(completedClaim);
    await recordTransitionExecutionTerminal(memory, {
      operationId: completedClaim.operationId,
      claimToken: completedClaim.claimToken,
      fencingToken: completedClaim.fencingToken,
      outcome: "completed",
      now: NOW,
    });
    await expect(claimTransitionExecution(memory, claimInput(authorization.id, {
      targetId: "task-2",
      manifestHash: H2,
    }))).rejects.toThrow("completed");
  });

  it("rebuilds a missing JSON projection from SQLite after a simulated crash", async () => {
    const authorization = await issue();
    const claim = await claimTransitionExecution(memory, claimInput(authorization.id));
    await rm(transitionExecutionPath(memory, claim.operationId), { force: true });

    const recovered = await recoverTransitionExecution(memory, claim.operationId);
    expect(recovered).toEqual(claim);
    expect(await recoverTransitionExecution(memory, claim.operationId)).toEqual(claim);
  });

  it("serializes concurrent issue and revoke without reviving authorization", async () => {
    const [first, second] = await Promise.all([issue(), issue()]);
    expect(first.id).toBe(second.id);
    const revocations = await Promise.all([
      revokeLocalExecutionAuthorization(memory, first.id, "stop one", NOW),
      revokeLocalExecutionAuthorization(memory, first.id, "stop two", NOW),
    ]);
    expect(revocations.map((item) => item.epoch).sort()).toEqual([1, 2]);
    await expect(issue()).rejects.toThrow("cannot be reissued");
  });

  it("does not reactivate when another revocation superseded the transaction revocation", async () => {
    const authorization = await issue();
    const transactionReason = "Planning proposal superseded by transaction tx-1.";
    const superseded = await revokeLocalExecutionAuthorization(memory, authorization.id, transactionReason, NOW);
    expect(superseded.epoch).toBe(1);
    const userRevoked = await revokeLocalExecutionAuthorization(memory, authorization.id, "User cancelled execution.", NOW);
    expect(userRevoked.epoch).toBe(2);

    await expect(reactivateLocalExecutionAuthorizationAfterRollback(memory, authorization.id, {
      epoch: 1,
      reason: transactionReason,
    })).rejects.toThrow(/another decision/);
  });
});
