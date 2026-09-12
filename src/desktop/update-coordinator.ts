import { randomUUID } from "node:crypto";
import type { WorkbenchUpdateIdentity, WorkbenchUpdateReceipt } from "../types/workbench-update.js";
import { sameWorkbenchUpdate } from "../types/workbench-update.js";
import { isNewerStableVersion } from "./update-policy.js";

export interface DesktopUpdateArtifact {
  readonly version: string;
  readonly sha512: string;
}

export interface DesktopUpdateDownloadPort {
  check(): Promise<DesktopUpdateArtifact | null>;
  download(artifact: DesktopUpdateArtifact, signal: AbortSignal): Promise<void>;
  revalidate(artifact: DesktopUpdateArtifact): Promise<void>;
  install(): void;
}

export interface DesktopUpdateHostPort {
  generation(): string | null;
  prepare(identity: WorkbenchUpdateIdentity): Promise<WorkbenchUpdateReceipt>;
  stop(identity: WorkbenchUpdateIdentity): Promise<WorkbenchUpdateReceipt>;
  cancel(identity: WorkbenchUpdateIdentity): Promise<void>;
  /** Must not terminate a possibly active Utility. Only detach a proven stopped runtime. */
  authorizeInstallerExit(identity: WorkbenchUpdateIdentity): void;
}

export type DesktopUpdateState = "idle" | "checking" | "downloading" | "preparing" | "stopping" | "installing" | "failed";

/** One transaction owns the entire update; library download events never authorize installation. */
export class DesktopUpdateCoordinator {
  private state: DesktopUpdateState = "idle";
  private pending: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private ending = false;
  private failedVersion: string | null = null;
  private failureStage: DesktopUpdateState | null = null;
  private recoveryRequired = false;

  constructor(
    private readonly installedVersion: string,
    private readonly downloads: DesktopUpdateDownloadPort,
    private readonly host: DesktopUpdateHostPort,
    private readonly onState: (state: DesktopUpdateState) => void,
  ) {}

  read(): DesktopUpdateState { return this.state; }
  diagnostic(): { stage: DesktopUpdateState | null; recoveryRequired: boolean } {
    return { stage: this.failureStage, recoveryRequired: this.recoveryRequired };
  }

  check(manual = false): Promise<void> {
    if (this.pending) return this.pending;
    if (this.ending || this.state === "installing") return Promise.resolve();
    const controller = new AbortController();
    this.controller = controller;
    this.pending = this.run(manual, controller).finally(() => {
      this.pending = null;
      if (this.controller === controller) this.controller = null;
    });
    return this.pending;
  }

  endSession(): void {
    this.ending = true;
    this.controller?.abort();
  }

  private async run(manual: boolean, controller: AbortController): Promise<void> {
    this.failureStage = null;
    this.recoveryRequired = false;
    let identity: WorkbenchUpdateIdentity | null = null;
    let teardownStarted = false;
    try {
      this.setState("checking");
      const offered = await this.downloads.check();
      this.assertSession(controller);
      if (!offered || !isNewerStableVersion(offered.version, this.installedVersion)
        || (!manual && offered.version === this.failedVersion)) {
        this.setState("idle");
        return;
      }
      const artifact = Object.freeze({ ...offered });
      if (!/^[A-Za-z0-9+/]{86}==$/.test(artifact.sha512)) throw new Error("Invalid update artifact.");
      this.setState("downloading");
      await this.downloads.download(artifact, controller.signal);
      this.assertSession(controller);
      await this.downloads.revalidate(artifact);
      this.assertSession(controller);
      const generation = this.host.generation();
      if (!generation) throw new Error("Workbench is unavailable for updating.");
      identity = Object.freeze({ updateId: randomUUID(), generation, targetVersion: artifact.version, artifactSha512: artifact.sha512 });
      this.setState("preparing");
      const prepared = await this.host.prepare(identity);
      this.assertCurrent(identity, prepared, "prepared", controller);
      this.setState("stopping");
      teardownStarted = true;
      const stopped = await this.host.stop(identity);
      this.assertCurrent(identity, stopped, "stopped", controller);
      // Check the cached installer again after the potentially long preparation.
      await this.downloads.revalidate(artifact);
      this.assertCurrent(identity, stopped, "stopped", controller);
      this.host.authorizeInstallerExit(identity);
      this.setState("installing");
      this.downloads.install();
    } catch {
      this.failureStage = this.state;
      this.recoveryRequired = teardownStarted;
      if (identity) {
        this.failedVersion = identity.targetVersion;
        if (!teardownStarted) {
          try { await this.host.cancel(identity); } catch { this.recoveryRequired = true; }
        }
      }
      this.setState("failed");
    }
  }

  private assertSession(controller: AbortController): void {
    if (this.ending || controller.signal.aborted) throw new Error("Update session ended.");
  }

  private assertCurrent(identity: WorkbenchUpdateIdentity, receipt: WorkbenchUpdateReceipt,
    status: WorkbenchUpdateReceipt["status"], controller: AbortController): void {
    this.assertSession(controller);
    if (receipt.status !== status || !sameWorkbenchUpdate(identity, receipt.identity)
      || this.host.generation() !== identity.generation) throw new Error("Update receipt is stale.");
  }

  private setState(state: DesktopUpdateState): void {
    this.state = state;
    this.onState(state);
  }
}
