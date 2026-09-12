import { randomUUID } from "node:crypto";
import type { UtilityProcess } from "electron";
import { isDesktopHostMessage, type DesktopHostMessage } from "./protocol.js";
import type { DesktopUpdateHostPort } from "./update-coordinator.js";
import { sameWorkbenchUpdate, type WorkbenchUpdateIdentity, type WorkbenchUpdateReceipt } from "../types/workbench-update.js";

export class DesktopUpdateHostBridge implements DesktopUpdateHostPort {
  private stopped: WorkbenchUpdateIdentity | null = null;
  constructor(
    private readonly binding: () => { child: UtilityProcess | null; generation: string | null },
    private readonly onInstallerExit: () => void,
  ) {}

  generation(): string | null { return this.binding().generation; }

  prepare(identity: WorkbenchUpdateIdentity): Promise<WorkbenchUpdateReceipt> {
    return this.request("prepare", identity).then(() => ({ identity, status: "prepared" }));
  }

  async stop(identity: WorkbenchUpdateIdentity): Promise<WorkbenchUpdateReceipt> {
    await this.request("stop", identity);
    this.stopped = { ...identity };
    return { identity, status: "stopped" };
  }

  cancel(identity: WorkbenchUpdateIdentity): Promise<void> { return this.request("cancel", identity); }

  authorizeInstallerExit(identity: WorkbenchUpdateIdentity): void {
    if (!this.stopped || !sameWorkbenchUpdate(identity, this.stopped)
      || this.binding().child !== null || identity.generation !== this.generation()) {
      throw new Error("Workbench has not proven successful process exit.");
    }
    this.onInstallerExit();
  }

  private async request(action: "prepare" | "stop" | "cancel", identity: WorkbenchUpdateIdentity): Promise<void> {
    const { child, generation } = this.binding();
    if (!child || generation !== identity.generation) throw new Error("Workbench generation changed.");
    const requestId = randomUUID();
    const expected = action === "prepare" ? "prepared" : action === "stop" ? "stopped" : "canceled";
    await new Promise<void>((resolve, reject) => {
      let acknowledged = false;
      let finished = false;
      const finish = (cause?: Error): void => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        child.off("message", onMessage);
        child.off("exit", onExit);
        if (cause) reject(cause); else resolve();
      };
      const onMessage = (value: unknown): void => {
        if (!isDesktopHostMessage(value) || value.type !== "update-result" || value.requestId !== requestId
          || value.generation !== generation || !sameWorkbenchUpdate(identity, value.identity)) return;
        if (value.result !== expected) { finish(new Error("Workbench update preparation failed.")); return; }
        acknowledged = true;
        if (action !== "stop") finish();
      };
      const onExit = (code: number): void => {
        if (action === "stop" && acknowledged && code === 0) finish();
        else finish(new Error("Workbench exited without a successful update receipt."));
      };
      const timer = setTimeout(() => finish(new Error("Workbench update response timed out.")), action === "stop" ? 9_000 : 31_000);
      child.on("message", onMessage);
      child.on("exit", onExit);
      child.postMessage({ type: "update-request", requestId, generation: generation!,
        identity, action } satisfies DesktopHostMessage);
    });
  }
}
