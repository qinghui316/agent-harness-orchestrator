export type DesktopRecoveryDecision = "restart" | "manual-recovery";

export class DesktopHostOperationGate {
  private activeCount = 0;
  private epoch = 0;
  private revocation: Promise<void> | null = null;

  captureEpoch(): number {
    return this.epoch;
  }

  canGrantIdleLease(observedEpoch: number): boolean {
    return this.activeCount === 0 && observedEpoch === this.epoch;
  }

  async begin(revokeIdleLease: () => Promise<void>, onIdle: () => void): Promise<() => void> {
    this.activeCount += 1;
    this.epoch += 1;
    try {
      if (this.activeCount === 1) {
        const pending = revokeIdleLease();
        const guarded = pending.finally(() => {
          if (this.revocation === guarded) this.revocation = null;
        });
        this.revocation = guarded;
      }
      await this.revocation;
    } catch (cause) {
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.epoch += 1;
      throw cause;
    }
    let ended = false;
    return () => {
      if (ended) return;
      ended = true;
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.epoch += 1;
      if (this.activeCount === 0) onIdle();
    };
  }
}

export class DesktopRecoveryController {
  private generation: string | null = null;
  private idleLeaseId: string | null = null;
  private idleLeaseObservedAt = 0;
  private restartUsed = false;

  constructor(
    private readonly now: () => number = () => Date.now(),
    private readonly idleLeaseMaxAgeMs = 5_000,
  ) {}

  begin(generation: string): void {
    this.generation = generation;
    this.idleLeaseId = null;
    this.idleLeaseObservedAt = 0;
  }

  grantIdleLease(generation: string, leaseId: string): boolean {
    if (generation !== this.generation || !leaseId) return false;
    this.idleLeaseId = leaseId;
    this.idleLeaseObservedAt = this.now();
    return true;
  }

  revokeIdleLease(generation: string, leaseId: string): boolean {
    if (generation !== this.generation || leaseId !== this.idleLeaseId) return false;
    this.idleLeaseId = null;
    this.idleLeaseObservedAt = 0;
    return true;
  }

  unexpectedExit(generation: string, beforeReady: boolean): DesktopRecoveryDecision {
    const leaseIsCurrent = this.idleLeaseId !== null
      && this.now() - this.idleLeaseObservedAt <= this.idleLeaseMaxAgeMs;
    const safe = generation === this.generation && (beforeReady || leaseIsCurrent);
    if (!safe || this.restartUsed) return "manual-recovery";
    this.restartUsed = true;
    this.idleLeaseId = null;
    this.idleLeaseObservedAt = 0;
    return "restart";
  }
}
