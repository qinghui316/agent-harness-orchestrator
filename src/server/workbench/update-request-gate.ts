import { AsyncLocalStorage } from "node:async_hooks";

export interface WorkbenchUpdateRequestLease {
  admittedExecution(): void;
  complete(outcome: "settled" | "uncertain"): void;
}

/**
 * HTTP lifecycle bookkeeping, not Conversation truth. A live request may leave
 * the mutation drain only after its domain owner has admitted managed execution.
 * Merely setting a text/event-stream header is never sufficient.
 */
export class WorkbenchUpdateRequestGate {
  private readonly requestScope = new AsyncLocalStorage<WorkbenchUpdateRequestLease>();
  private pausedBy: string | null = null;
  private readonly mutations = new Set<symbol>();
  private readonly waiters = new Set<() => void>();
  private uncertain = false;

  get paused(): boolean { return this.pausedBy !== null; }
  get updateId(): string | null { return this.pausedBy; }

  pause(updateId: string): () => void {
    if (!updateId || this.pausedBy !== null) throw conflict("Workbench update gate is already held.");
    this.pausedBy = updateId;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (this.pausedBy === updateId) this.pausedBy = null;
    };
  }

  runTracked<T>(lease: WorkbenchUpdateRequestLease, operation: () => Promise<T>): Promise<T> {
    return this.requestScope.run(lease, operation);
  }

  managedExecutionRegistered(): void {
    this.requestScope.getStore()?.admittedExecution();
  }

  begin(kind: "read" | "mutation" | "draft-save", updateId?: string): WorkbenchUpdateRequestLease {
    if (this.pausedBy && kind !== "read" && !(kind === "draft-save" && updateId === this.pausedBy)) {
      throw conflict("Workbench is preparing an update.");
    }
    const token = Symbol();
    let complete = false;
    let promoted = false;
    if (kind !== "read") this.mutations.add(token);
    const release = (): void => {
      this.mutations.delete(token);
      if (this.mutations.size === 0) {
        for (const waiter of [...this.waiters]) waiter();
      }
    };
    return {
      admittedExecution: () => {
        if (complete || promoted) return;
        if (kind !== "mutation") throw conflict("Request has no promotable mutation.");
        promoted = true;
        release();
      },
      complete: (outcome) => {
        if (complete) return;
        complete = true;
        // Managed execution terminal reconciliation belongs to its domain Owner.
        if (outcome === "uncertain" && kind !== "read" && !promoted) this.uncertain = true;
        release();
      },
    };
  }

  async drain(signal: AbortSignal): Promise<void> {
    if (!this.pausedBy) throw conflict("Update drain requires a held admission gate.");
    if (signal.aborted) throw conflict("Update drain was canceled.");
    if (this.mutations.size) {
      await new Promise<void>((resolve, reject) => {
        const cleanup = (): void => {
          this.waiters.delete(done);
          signal.removeEventListener("abort", abort);
        };
        const done = (): void => { cleanup(); resolve(); };
        const abort = (): void => { cleanup(); reject(conflict("Update drain was canceled.")); };
        this.waiters.add(done);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) abort();
      });
    }
    if (signal.aborted || this.uncertain) throw conflict("A request outcome must be reconciled before updating.");
  }
}

function conflict(message: string): Error {
  const error = new Error(message);
  error.name = "Conflict";
  return error;
}
