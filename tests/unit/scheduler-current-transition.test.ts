import { describe, expect, it } from "vitest";
import { resolveSchedulerCurrentTransition } from "../../src/workflow-actions/scheduler-current-transition.js";

const reservation = {
  reservationIntents: [
    { reservationIntentId: "wave-0-a", claimIntentId: "claim-0-a", status: "reserved", waveIndex: 0, sourceScopes: ["src/a.ts"] },
    { reservationIntentId: "wave-0-b", claimIntentId: "claim-0-b", status: "reserved", waveIndex: 0, sourceScopes: ["src/b.ts"] },
    { reservationIntentId: "wave-1-a", claimIntentId: "claim-1-a", status: "reserved", waveIndex: 1, sourceScopes: ["src/c.ts"] },
  ],
};

describe("Scheduler current transition", () => {
  it("does not replace the existing start-first gate before any worker has started", () => {
    const transition = resolveSchedulerCurrentTransition({
      reservation,
      workerPaths: [],
    });

    expect(transition).toMatchObject({
      kind: "none",
      reason: "Scheduler first worker has not started.",
    });
  });

  it("returns same-wave start-next before integration while a sibling is running", () => {
    const transition = resolveSchedulerCurrentTransition({
      reservation,
      workerPaths: [
        { start: { reservationIntentId: "wave-0-a" }, terminal: false },
      ],
    });

    expect(transition).toMatchObject({
      kind: "start-same-wave-worker",
      actionType: "planning.scheduler.worker.start-next",
      reservationIntent: { reservationIntentId: "wave-0-b", claimIntentId: "claim-0-b" },
    });
  });

  it("blocks next-wave and integration while the current wave is not terminal", () => {
    const transition = resolveSchedulerCurrentTransition({
      reservation,
      workerPaths: [
        { start: { reservationIntentId: "wave-0-a" }, terminal: true },
        { start: { reservationIntentId: "wave-0-b" }, terminal: false },
      ],
      integrationCandidate: { status: "waiting", readyCount: 2, blockedCount: 0 },
      integrationCandidateNeedsRefresh: false,
    });

    expect(transition).toMatchObject({
      kind: "blocked",
      reason: "Current scheduler wave is not terminal.",
    });
  });

  it("returns next-wave start-next after the current wave is terminal", () => {
    const transition = resolveSchedulerCurrentTransition({
      reservation,
      workerPaths: [
        { start: { reservationIntentId: "wave-0-a" }, terminal: true },
        { start: { reservationIntentId: "wave-0-b" }, terminal: true },
      ],
      integrationCandidate: { status: "waiting", readyCount: 2, blockedCount: 0 },
      integrationCandidateNeedsRefresh: false,
    });

    expect(transition).toMatchObject({
      kind: "start-next-wave-worker",
      actionType: "planning.scheduler.worker.start-next",
      reservationIntent: { reservationIntentId: "wave-1-a", claimIntentId: "claim-1-a" },
    });
  });

  it("returns integration-ready only after all waves are terminal", () => {
    const transition = resolveSchedulerCurrentTransition({
      reservation,
      workerPaths: [
        { start: { reservationIntentId: "wave-0-a" }, terminal: true },
        { start: { reservationIntentId: "wave-0-b" }, terminal: true },
        { start: { reservationIntentId: "wave-1-a" }, terminal: true },
      ],
      integrationCandidate: { status: "waiting", readyCount: 2, blockedCount: 0 },
      integrationCandidateNeedsRefresh: false,
    });

    expect(transition).toMatchObject({
      kind: "integration-check",
      actionType: "planning.scheduler.integration-check.run",
    });
  });

  it("returns integration candidate only after all waves are terminal and no worker remains", () => {
    const transition = resolveSchedulerCurrentTransition({
      reservation,
      workerPaths: [
        { start: { reservationIntentId: "wave-0-a" }, terminal: true },
        { start: { reservationIntentId: "wave-0-b" }, terminal: true },
        { start: { reservationIntentId: "wave-1-a" }, terminal: true },
      ],
    });

    expect(transition).toMatchObject({
      kind: "integration-candidate",
      actionType: "planning.scheduler.integration-candidate.compile",
    });
  });

  it("blocks a wave with conflicting source scopes before selecting a worker", () => {
    const transition = resolveSchedulerCurrentTransition({
      reservation: {
        reservationIntents: [
          { reservationIntentId: "wave-0-a", claimIntentId: "claim-0-a", status: "reserved", waveIndex: 0, sourceScopes: ["src/shared.ts"] },
          { reservationIntentId: "wave-0-b", claimIntentId: "claim-0-b", status: "reserved", waveIndex: 0, sourceScopes: ["src/shared.ts"] },
        ],
      },
      workerPaths: [
        { start: { reservationIntentId: "wave-0-a" }, terminal: false },
      ],
    });

    expect(transition).toMatchObject({
      kind: "blocked",
      reason: "Scheduler wave 0 has conflicting source scopes.",
    });
  });
});
