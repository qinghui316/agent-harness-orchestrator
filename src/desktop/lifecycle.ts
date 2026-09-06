export type DesktopRecoveryDecision = "restart" | "manual-recovery";

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
