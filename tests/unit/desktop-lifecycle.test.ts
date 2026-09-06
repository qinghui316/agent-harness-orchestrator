import { describe, expect, it } from "vitest";
import { DesktopHostOperationGate, DesktopRecoveryController } from "../../src/desktop/lifecycle.js";

describe("desktop recovery lifecycle", () => {
  it("does not permit a new idle lease while any host operation is active", async () => {
    const gate = new DesktopHostOperationGate();
    const revoked: string[] = [];
    let idleNotifications = 0;
    let finishRevocation!: () => void;
    const revocation = new Promise<void>((resolve) => { finishRevocation = resolve; });
    const idleEpoch = gate.captureEpoch();
    expect(gate.canGrantIdleLease(idleEpoch)).toBe(true);

    const first = gate.begin(async () => { revoked.push("revoke"); await revocation; }, () => { idleNotifications += 1; });
    const activeEpoch = gate.captureEpoch();
    let secondStarted = false;
    const second = gate.begin(async () => { revoked.push("unexpected"); }, () => { idleNotifications += 1; })
      .then((end) => { secondStarted = true; return end; });
    await Promise.resolve();
    expect(revoked).toEqual(["revoke"]);
    expect(secondStarted).toBe(false);
    expect(gate.canGrantIdleLease(idleEpoch)).toBe(false);
    expect(gate.canGrantIdleLease(activeEpoch)).toBe(false);

    finishRevocation();
    const [endFirst, endSecond] = await Promise.all([first, second]);
    expect(secondStarted).toBe(true);

    endFirst();
    expect(gate.canGrantIdleLease(gate.captureEpoch())).toBe(false);
    expect(idleNotifications).toBe(0);
    endSecond();
    expect(gate.canGrantIdleLease(gate.captureEpoch())).toBe(true);
    expect(idleNotifications).toBe(1);
  });

  it("allows one retry before ready", () => {
    const owner = new DesktopRecoveryController();
    owner.begin("g1");
    expect(owner.unexpectedExit("g1", true)).toBe("restart");
    owner.begin("g2");
    expect(owner.unexpectedExit("g2", true)).toBe("manual-recovery");
  });

  it("requires a current idle lease after ready", () => {
    const owner = new DesktopRecoveryController();
    owner.begin("g1");
    expect(owner.unexpectedExit("g1", false)).toBe("manual-recovery");

    const idleOwner = new DesktopRecoveryController();
    idleOwner.begin("g1");
    expect(idleOwner.grantIdleLease("old", "lease")).toBe(false);
    expect(idleOwner.grantIdleLease("g1", "lease")).toBe(true);
    expect(idleOwner.revokeIdleLease("g1", "other")).toBe(false);
    expect(idleOwner.unexpectedExit("g1", false)).toBe("restart");
  });

  it("treats revoked and stale leases as unsafe", () => {
    const owner = new DesktopRecoveryController();
    owner.begin("g1");
    owner.grantIdleLease("g1", "lease");
    expect(owner.revokeIdleLease("g1", "lease")).toBe(true);
    expect(owner.unexpectedExit("g1", false)).toBe("manual-recovery");
  });

  it("requires the idle lease to be renewed within its bounded lifetime", () => {
    let now = 1_000;
    const owner = new DesktopRecoveryController(() => now, 5_000);
    owner.begin("g1");
    owner.grantIdleLease("g1", "lease");
    now += 4_000;
    owner.grantIdleLease("g1", "lease");
    now += 4_000;
    expect(owner.unexpectedExit("g1", false)).toBe("restart");

    let expiredNow = 1_000;
    const expired = new DesktopRecoveryController(() => expiredNow, 5_000);
    expired.begin("g1");
    expired.grantIdleLease("g1", "lease");
    expiredNow += 5_001;
    expect(expired.unexpectedExit("g1", false)).toBe("manual-recovery");
  });
});
