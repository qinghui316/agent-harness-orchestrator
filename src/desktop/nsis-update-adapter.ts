import type { NsisUpdater } from "electron-updater";
import type { DesktopUpdateArtifact, DesktopUpdateDownloadPort } from "./update-coordinator.js";
import type { DesktopUpdatePolicy } from "./update-policy.js";
import { verifyDesktopUpdateHash, verifyDesktopUpdateSignature } from "./update-signature.js";

type EnabledPolicy = Exclude<DesktopUpdatePolicy, { mode: "disabled" }>;
type NsisPort = Pick<NsisUpdater,
  "autoDownload" | "autoInstallOnAppQuit" | "autoRunAppAfterInstall" | "allowPrerelease" |
  "allowDowngrade" | "disableWebInstaller" | "verifyUpdateCodeSignature" | "logger" |
  "checkForUpdates" | "downloadUpdate" | "quitAndInstall" | "on">;

export interface DesktopArtifactVerifier {
  signature(file: string, publisherSubject: string): Promise<void>;
  hash(file: string, sha512: string): Promise<void>;
}

/** All electron-updater calls and its default-policy overrides belong here. */
export class NsisUpdateAdapter implements DesktopUpdateDownloadPort {
  private offered: DesktopUpdateArtifact | null = null;
  private cached: { artifact: DesktopUpdateArtifact; path: string } | null = null;
  private cancellation: Parameters<NsisPort["downloadUpdate"]>[0] = undefined;
  private validated = false;
  private installStarted = false;
  private errored = false;

  constructor(
    private readonly nsis: NsisPort,
    private readonly policy: EnabledPolicy,
    private readonly verifier: DesktopArtifactVerifier = {
      signature: verifyDesktopUpdateSignature, hash: verifyDesktopUpdateHash,
    },
  ) {
    nsis.autoDownload = false;
    nsis.autoInstallOnAppQuit = false;
    nsis.autoRunAppAfterInstall = true;
    nsis.allowPrerelease = false;
    nsis.allowDowngrade = false;
    nsis.disableWebInstaller = true;
    // Library diagnostics can include absolute paths and entire certificate records.
    nsis.logger = null;
    nsis.on("error", () => { this.errored = true; this.validated = false; });
    nsis.verifyUpdateCodeSignature = async (_publishers, file) => {
      await this.verifier.signature(file, this.policy.publisherSubject);
      return null;
    };
  }

  async check(): Promise<DesktopUpdateArtifact | null> {
    this.offered = null;
    this.validated = false;
    this.errored = false;
    this.cancellation = undefined;
    const result = await this.nsis.checkForUpdates();
    if (this.errored) throw new Error("Update check failed.");
    if (!result?.isUpdateAvailable) return null;
    const info = result.updateInfo;
    const name = this.policy.mode === "test" ? "Beaver-Code-Test-Setup" : "Beaver-Code-Setup";
    const expected = name + "-" + info.version + "-win-x64.exe";
    const files = info.files.filter((file) => file.url === expected);
    if (files.length !== 1 || info.files.length !== 1 || !/^[A-Za-z0-9+/]{86}==$/.test(files[0].sha512)) {
      throw new Error("Update metadata does not identify one Windows x64 installer.");
    }
    this.offered = Object.freeze({ version: info.version, sha512: files[0].sha512 });
    this.cancellation = result.cancellationToken;
    return this.offered;
  }

  async download(artifact: DesktopUpdateArtifact, signal: AbortSignal): Promise<void> {
    this.assertArtifact(artifact);
    if (signal.aborted || !this.cancellation) throw new Error("Update download is not current.");
    const cancel = () => this.cancellation?.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    this.cached = null;
    this.validated = false;
    try {
      const files = await this.nsis.downloadUpdate(this.cancellation);
      if (signal.aborted || this.errored || files.length !== 1 || !files[0].toLowerCase().endsWith(".exe")) {
        throw new Error("Update download did not complete.");
      }
      this.cached = { artifact: Object.freeze({ ...artifact }), path: files[0] };
      await this.revalidate(artifact);
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  }

  async revalidate(artifact: DesktopUpdateArtifact): Promise<void> {
    this.validated = false;
    this.assertArtifact(artifact);
    const cached = this.cached;
    if (!cached || !sameArtifact(cached.artifact, artifact)) throw new Error("Update cache does not match the requested artifact.");
    // This check is unconditional even if app-update.yml is absent or lacks publisherName.
    await this.verifier.signature(cached.path, this.policy.publisherSubject);
    await this.verifier.hash(cached.path, artifact.sha512);
    if (this.errored || this.cached !== cached) throw new Error("Update cache became invalid.");
    this.validated = true;
  }

  install(): void {
    if (this.installStarted || this.errored || !this.validated || !this.cached) {
      throw new Error("Update installer has no current verified artifact.");
    }
    this.installStarted = true;
    this.validated = false;
    this.nsis.quitAndInstall(true, true);
    if (this.errored) throw new Error("Update installer could not be started.");
  }

  private assertArtifact(artifact: DesktopUpdateArtifact): void {
    if (!this.offered || !sameArtifact(this.offered, artifact)) throw new Error("Update artifact changed after checking.");
  }
}

export async function createNsisUpdateAdapter(policy: EnabledPolicy): Promise<NsisUpdateAdapter> {
  // Load the CJS package only inside the Electron host, never the Workbench process.
  const module = await import("electron-updater");
  const sdk = module.default;
  const nsis = new sdk.NsisUpdater(policy.mode === "stable"
    ? { provider: "github", owner: policy.owner, repo: policy.repo }
    : { provider: "generic", url: policy.feedUrl });
  return new NsisUpdateAdapter(nsis, policy);
}

function sameArtifact(left: DesktopUpdateArtifact, right: DesktopUpdateArtifact): boolean {
  return left.version === right.version && left.sha512 === right.sha512;
}
