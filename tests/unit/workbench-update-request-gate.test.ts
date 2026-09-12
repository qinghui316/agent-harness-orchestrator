import { describe, expect, it } from "vitest";
import { WorkbenchUpdateRequestGate } from "../../src/server/workbench/update-request-gate.js";
import { ConversationTurnControlOwner } from "../../src/workbench/conversation-turn-control.js";
import { ProviderRegistry } from "../../src/provider-runtime/registry.js";

describe("update request admission and drain", () => {
  it.each(["review", "retry", "queued-review"])("observes %s registration in its own async request scope", async (kind) => {
    const gate = new WorkbenchUpdateRequestGate();
    const control = new ConversationTurnControlOwner({
      providerRegistry: new ProviderRegistry(),
      projectRuntimeCoordinator: { resolve: async () => { throw new Error("not needed for registration"); } },
    });
    const unsubscribe = control.subscribeAdmission(() => gate.managedExecutionRegistered());
    const lease = gate.begin("mutation");
    let finish!: () => void;
    const held = new Promise<void>((resolve) => { finish = resolve; });
    const registration = {
      projectId: "project", productMode: "agent" as const, conversationId: kind,
      expectedAttemptId: kind, providerId: "codex", graphScopeId: "graph", runId: kind,
      roleId: "main-agent" as const, canSteer: false,
    };
    const executing = gate.runTracked(lease, async () => {
      await Promise.resolve();
      control.registerAttempt(registration);
      await held;
      control.release(registration);
    });
    gate.pause("update");
    await gate.drain(new AbortController().signal);
    finish();
    await executing;
    lease.complete("settled");
    unsubscribe();
  });

  it("does not attribute an unrelated async registration to a pending request", async () => {
    const gate = new WorkbenchUpdateRequestGate();
    const lease = gate.begin("mutation");
    let finish!: () => void;
    const held = new Promise<void>((resolve) => { finish = resolve; });
    const request = gate.runTracked(lease, async () => { await held; lease.complete("settled"); });
    gate.pause("update");
    gate.managedExecutionRegistered();
    let drained = false;
    const drain = gate.drain(new AbortController().signal).then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    finish();
    await request;
    await drain;
  });
  it("allows only exact transaction draft saves during the fence", () => {
    const gate = new WorkbenchUpdateRequestGate();
    gate.pause("update");
    expect(() => gate.begin("mutation")).toThrow();
    expect(() => gate.begin("draft-save")).toThrow();
    expect(() => gate.begin("draft-save", "stale")).toThrow();
    gate.begin("draft-save", "update").complete("settled");
    gate.begin("read").complete("settled");
  });
  it("waits for pre-fence mutations without losing their completion", async () => {
    const gate = new WorkbenchUpdateRequestGate();
    const mutation = gate.begin("mutation");
    gate.pause("update");
    let drained = false;
    const pending = gate.drain(new AbortController().signal).then(() => { drained = true; });
    await Promise.resolve();
    expect(drained).toBe(false);
    mutation.complete("settled");
    await pending;
    expect(drained).toBe(true);
  });
  it("requires explicit managed-execution admission before excluding a live request", async () => {
    const gate = new WorkbenchUpdateRequestGate();
    const request = gate.begin("mutation");
    gate.pause("update");
    request.admittedExecution();
    await gate.drain(new AbortController().signal);
    request.complete("settled");
  });
  it("never treats uncertain submission as saved", async () => {
    const gate = new WorkbenchUpdateRequestGate();
    const request = gate.begin("mutation");
    gate.pause("update");
    request.complete("uncertain");
    await expect(gate.drain(new AbortController().signal)).rejects.toThrow("reconciled");
  });
  it("releases only its own fence even if an old release is called twice", () => {
    const gate = new WorkbenchUpdateRequestGate();
    const release = gate.pause("first");
    release();
    gate.pause("second");
    release();
    expect(() => gate.begin("mutation")).toThrow();
  });
  it("cancels waiting without waiting for a stuck network request", async () => {
    const gate = new WorkbenchUpdateRequestGate();
    const mutation = gate.begin("mutation");
    gate.pause("update");
    const abort = new AbortController();
    const pending = gate.drain(abort.signal);
    const rejected = expect(pending).rejects.toThrow("canceled");
    abort.abort();
    await rejected;
    mutation.complete("settled");
  });
});
