import { describe, expect, it, vi } from "vitest";
import { NsisUpdateAdapter } from "../../src/desktop/nsis-update-adapter.js";

const sha512 = Buffer.alloc(64, 5).toString("base64");
function fixture() {
  const cancellation = { cancel: vi.fn() };
  let errorListener: () => void = () => {};
  const nsis = {
    autoDownload: true, autoInstallOnAppQuit: true, autoRunAppAfterInstall: false,
    allowPrerelease: true, allowDowngrade: true, disableWebInstaller: false, logger: null,
    verifyUpdateCodeSignature: vi.fn(async () => null),
    on: vi.fn((_event: string, listener: () => void) => { errorListener = listener; }),
    checkForUpdates: vi.fn(async () => ({
      isUpdateAvailable: true, updateInfo: { version: "0.1.3", files: [{ url: "Beaver-Code-Setup-0.1.3-win-x64.exe", sha512 }] },
      cancellationToken: cancellation,
    })),
    downloadUpdate: vi.fn(async () => ["C:/cache/update.exe"]),
    quitAndInstall: vi.fn(),
  };
  const verifier = { signature: vi.fn(async () => {}), hash: vi.fn(async () => {}) };
  const adapter = new NsisUpdateAdapter(nsis as unknown as ConstructorParameters<typeof NsisUpdateAdapter>[0],
    { mode: "stable", owner: "qinghui316", repo: "agent-harness-orchestrator", publisherSubject: "CN=Beaver Publisher" }, verifier);
  return { nsis, verifier, adapter, cancellation, emitError: () => errorListener() };
}
describe("NSIS adapter security defaults", () => {
  it("disables implicit download/install, downgrade, prerelease and web installers", () => {
    const { nsis } = fixture();
    expect(nsis).toMatchObject({
      autoDownload: false, autoInstallOnAppQuit: false, allowPrerelease: false,
      allowDowngrade: false, disableWebInstaller: true, logger: null,
    });
  });
  it("requires independent signature verification even when library skips its callback", async () => {
    const { adapter, verifier, nsis } = fixture();
    const artifact = (await adapter.check())!;
    await adapter.download(artifact, new AbortController().signal);
    expect(verifier.signature).toHaveBeenCalledWith("C:/cache/update.exe", "CN=Beaver Publisher");
    expect(verifier.hash).toHaveBeenCalledWith("C:/cache/update.exe", sha512);
    adapter.install();
    expect(nsis.quitAndInstall).toHaveBeenCalledWith(true, true);
    expect(() => adapter.install()).toThrow();
  });
  it("cannot install after verifier failure", async () => {
    const { adapter, verifier, nsis } = fixture();
    const artifact = (await adapter.check())!;
    verifier.signature.mockRejectedValue(new Error("untrusted"));
    await expect(adapter.download(artifact, new AbortController().signal)).rejects.toThrow();
    expect(() => adapter.install()).toThrow();
    expect(nsis.quitAndInstall).not.toHaveBeenCalled();
  });
  it("rejects remote metadata file URLs and wrong architecture before download", async () => {
    const { adapter, nsis } = fixture();
    for (const url of ["https://other/installer.exe", "Beaver-Code-Setup-0.1.3-win-arm64.exe", "../installer.exe"]) {
      nsis.checkForUpdates.mockResolvedValueOnce({
        isUpdateAvailable: true, updateInfo: { version: "0.1.3", files: [{ url, sha512 }] },
        cancellationToken: { cancel: vi.fn() },
      });
      await expect(adapter.check()).rejects.toThrow();
    }
    expect(nsis.downloadUpdate).not.toHaveBeenCalled();
  });
  it("does not install after an asynchronous library error", async () => {
    const { adapter, emitError } = fixture();
    const artifact = (await adapter.check())!;
    await adapter.download(artifact, new AbortController().signal);
    emitError();
    expect(() => adapter.install()).toThrow();
  });

  it("passes the check's cancellation token into the actual download", async () => {
    const { adapter, nsis, cancellation } = fixture();
    const artifact = (await adapter.check())!;
    const abort = new AbortController();
    nsis.downloadUpdate.mockImplementationOnce(async () => {
      abort.abort();
      return ["C:/cache/update.exe"];
    });
    await expect(adapter.download(artifact, abort.signal)).rejects.toThrow();
    expect(nsis.downloadUpdate).toHaveBeenCalledWith(cancellation);
    expect(cancellation.cancel).toHaveBeenCalledTimes(1);
    expect(() => adapter.install()).toThrow();
  });

  it("rejects a changed offered hash without touching the cached installer", async () => {
    const { adapter, nsis } = fixture();
    const artifact = (await adapter.check())!;
    await expect(adapter.download({ ...artifact, sha512: Buffer.alloc(64, 6).toString("base64") },
      new AbortController().signal)).rejects.toThrow();
    expect(nsis.downloadUpdate).not.toHaveBeenCalled();
  });
});
