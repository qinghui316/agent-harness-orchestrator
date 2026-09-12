import {
  isWorkbenchUpdateIdentity,
  sameWorkbenchUpdate,
  type WorkbenchUpdateIdentity,
  type WorkbenchUpdateReceipt,
  type WorkbenchUpdateSnapshot,
} from "../types/workbench-update.js";

export interface WorkbenchUpdateLifecyclePorts {
  /** Synchronously fence new work/dispatch; release only this transaction's fence. */
  pauseNewWork(identity: WorkbenchUpdateIdentity): () => void;
  /** Freeze Renderer editing and prove all scoped draft revisions durably saved. */
  prepareRenderer(identity: WorkbenchUpdateIdentity, signal: AbortSignal): Promise<void>;
  /** Prove existing submission/upload/queue writes have a definite outcome. */
  drainMutations(signal: AbortSignal): Promise<void>;
  /** A failure here can leave the runtime partially stopped. Never resume it implicitly. */
  shutdown(deadlineMs: number, signal: AbortSignal): Promise<void>;
  /** Idempotently release the Renderer editing fence after a reversible cancellation. */
  cancelRenderer(identity: WorkbenchUpdateIdentity): Promise<void>;
}

interface UpdateTransaction {
  readonly identity: WorkbenchUpdateIdentity;
  readonly abort: AbortController;
  readonly release: () => void;
  prepare: Promise<WorkbenchUpdateReceipt> | null;
  stop: Promise<WorkbenchUpdateReceipt> | null;
  releaseCalled: boolean;
}

/**
 * Update-only admission over existing lifecycle owners. There is deliberately no
 * installer or persistence dependency. Timeouts invalidate the transaction, not
 * just its caller's wait, so late completion can never produce a valid receipt.
 */
export class WorkbenchUpdateLifecycle {
  private current: UpdateTransaction | null = null;
  private phase: WorkbenchUpdateSnapshot["phase"] = "idle";
  private cancellation: Promise<void> | null = null;

  constructor(
    private readonly ports: WorkbenchUpdateLifecyclePorts,
    private readonly generation: string,
    private readonly limits = { prepareMs: 30_000, shutdownMs: 8_000 },
  ) {}

  snapshot(): WorkbenchUpdateSnapshot {
    return { identity: this.current ? { ...this.current.identity } : null, phase: this.phase };
  }

  prepare(identity: WorkbenchUpdateIdentity): Promise<WorkbenchUpdateReceipt> {
    if (!isWorkbenchUpdateIdentity(identity) || identity.generation !== this.generation) {
      return Promise.reject(conflict("Update identity is not current."));
    }
    if (this.cancellation) return Promise.reject(conflict("Update cancellation is still settling."));
    if (this.current && sameWorkbenchUpdate(this.current.identity, identity)) {
      if (this.phase === "preparing" || this.phase === "prepared") return this.current.prepare!;
      return Promise.reject(conflict("Update transaction is no longer preparable."));
    }
    if (this.phase !== "idle" && this.phase !== "canceled") {
      return Promise.reject(conflict("Another update transaction owns the runtime."));
    }
    let release: () => void;
    try { release = this.ports.pauseNewWork(identity); }
    catch (cause) { return Promise.reject(cause); }
    const transaction: UpdateTransaction = {
      identity: Object.freeze({ ...identity }), abort: new AbortController(),
      release, prepare: null, stop: null, releaseCalled: false,
    };
    this.current = transaction;
    this.phase = "preparing";
    transaction.prepare = this.runPreparation(transaction);
    return transaction.prepare;
  }

  stop(identity: WorkbenchUpdateIdentity): Promise<WorkbenchUpdateReceipt> {
    const transaction = this.match(identity);
    if (!transaction) return Promise.reject(conflict("Update identity is not current."));
    if (this.phase === "shutting-down" || this.phase === "stopped") return transaction.stop!;
    if (this.phase !== "prepared") return Promise.reject(conflict("Update has no successful preparation."));
    this.phase = "shutting-down";
    transaction.stop = this.runShutdown(transaction);
    return transaction.stop;
  }

  cancel(identity: WorkbenchUpdateIdentity): Promise<void> {
    const transaction = this.match(identity);
    if (!transaction) return Promise.reject(conflict("Update identity is not current."));
    if (this.cancellation) return this.cancellation;
    if (this.phase === "canceled") return Promise.resolve();
    if (this.phase !== "preparing" && this.phase !== "prepared") {
      return Promise.reject(conflict("Runtime teardown cannot be reversed."));
    }
    transaction.abort.abort();
    this.phase = "canceled";
    this.cancellation = this.releasePreparation(transaction).finally(() => { this.cancellation = null; });
    return this.cancellation;
  }

  private async runPreparation(transaction: UpdateTransaction): Promise<WorkbenchUpdateReceipt> {
    try {
      await withinDeadline(async () => {
        await this.ports.prepareRenderer(transaction.identity, transaction.abort.signal);
        this.assertPreparing(transaction);
        await this.ports.drainMutations(transaction.abort.signal);
        this.assertPreparing(transaction);
      }, this.limits.prepareMs, transaction.abort.signal);
      this.assertPreparing(transaction);
      this.phase = "prepared";
      return { identity: { ...transaction.identity }, status: "prepared" };
    } catch (cause) {
      if (this.phase === "preparing" && this.current === transaction) {
        await this.cancel(transaction.identity);
      }
      throw cause;
    }
  }

  private async runShutdown(transaction: UpdateTransaction): Promise<WorkbenchUpdateReceipt> {
    try {
      // The shutdown port owns the product deadline. This outer watchdog only
      // invalidates a broken port that ignores it and therefore needs a small
      // scheduling envelope instead of racing the same timer.
      await withinDeadline(
        () => this.ports.shutdown(this.limits.shutdownMs, transaction.abort.signal),
        this.limits.shutdownMs + shutdownWatchdogEnvelope(this.limits.shutdownMs),
        transaction.abort.signal,
      );
      if (this.current !== transaction || this.phase !== "shutting-down") throw conflict("Update shutdown is stale.");
      this.phase = "stopped";
      // Keep admission fenced until process exit. Installing is the host's responsibility.
      return { identity: { ...transaction.identity }, status: "stopped" };
    } catch (cause) {
      transaction.abort.abort();
      this.phase = "recovery-required";
      throw cause;
    }
  }

  private async releasePreparation(transaction: UpdateTransaction): Promise<void> {
    try {
      await withinDeadline(() => this.ports.cancelRenderer(transaction.identity), this.limits.prepareMs);
      if (!transaction.releaseCalled) {
        transaction.releaseCalled = true;
        transaction.release();
      }
    } catch (cause) {
      this.phase = "recovery-required";
      throw cause;
    }
  }

  private match(identity: WorkbenchUpdateIdentity): UpdateTransaction | null {
    return isWorkbenchUpdateIdentity(identity) && this.current && sameWorkbenchUpdate(this.current.identity, identity)
      ? this.current : null;
  }

  private assertPreparing(transaction: UpdateTransaction): void {
    if (transaction.abort.signal.aborted || this.current !== transaction || this.phase !== "preparing") {
      throw conflict("Update preparation is no longer current.");
    }
  }
}

function shutdownWatchdogEnvelope(deadlineMs: number): number {
  return Math.max(1, Math.min(250, Math.ceil(deadlineMs / 8)));
}

async function withinDeadline<T>(operation: () => Promise<T>, ms: number, signal?: AbortSignal): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(() => {
        if (signal?.aborted) throw conflict("Update preparation was canceled.");
        return operation();
      }),
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(conflict("Update lifecycle deadline exceeded.")), ms);
        onAbort = () => reject(conflict("Update preparation was canceled."));
        signal?.addEventListener("abort", onAbort, { once: true });
        if (signal?.aborted) onAbort();
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
    if (onAbort) signal?.removeEventListener("abort", onAbort);
  }
}

function conflict(message: string): Error {
  const error = new Error(message);
  error.name = "Conflict";
  return error;
}
