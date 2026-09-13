import { describe, expect, it, vi } from "vitest";
import { NsisUpdateAdapter } from "../../src/desktop/nsis-update-adapter.js";

const sha512 = Buffer.alloc(64, 5).toString("base64");
const signed = {
  manifest: {
    schemaVersion: 1 as const, channel: "stable" as const, version: "0.1.3", tag: "v0.1.3", commit: "a".repeat(40),
    platform: "win32" as const, arch: "x64" as const, publishedAt: "2026-09-13T00:00:00.000Z",
    installer: { name: "Beaver-Code-Setup-0.1.3-win-x64.exe", size: 123, sha512 },
    blockmap: { name: "Beaver-Code-Setup-0.1.3-win-x64.exe.blockmap", size: 10, sha512: Buffer.alloc(64, 6).toString("base64") },
  },
  manifestSha256: "a".repeat(64),
  releaseUrl: "https://github.com/qinghui316/beaver-code/releases/tag/v0.1.3",
};
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
    launchVerifiedUpdate: vi.fn(async () => {}),
  };
  const verifier = { signature: vi.fn(async () => {}), hash: vi.fn(async () => {}), size: vi.fn(async () => 123) };
  const manifests = { latest: vi.fn(async () => signed), exact: vi.fn(async () => {}) };
  const adapter = new NsisUpdateAdapter(nsis as unknown as ConstructorParameters<typeof NsisUpdateAdapter>[0],
    { mode: "stable", owner: "qinghui316", repo: "beaver-code", trustedKeys: [{ keyId: "test", publicKey: "unused-by-mock" }] }, verifier, manifests);
  return { nsis, verifier, manifests, adapter, cancellation, emitError: () => errorListener() };
}
describe("NSIS adapter security defaults", () => {
  it("disables implicit download/install, downgrade, prerelease and web installers", () => {
    const { nsis } = fixture();
    expect(nsis).toMatchObject({
      autoDownload: false, autoInstallOnAppQuit: false, allowPrerelease: false,
      allowDowngrade: false, disableWebInstaller: true, logger: null,
    });
  });
  it("requires independent manifest and artifact verification even when the library skips its callback", async () => {
    const { adapter, verifier, manifests, nsis } = fixture();
    const artifact = (await adapter.check())!;
    await adapter.download(artifact, new AbortController().signal);
    expect(verifier.signature).not.toHaveBeenCalled();
    expect(verifier.hash).toHaveBeenCalledWith("C:/cache/update.exe", sha512);
    expect(manifests.exact).toHaveBeenCalled();
    await adapter.install();
    expect(nsis.launchVerifiedUpdate).toHaveBeenCalledTimes(1);
    await expect(adapter.install()).rejects.toThrow();
  });
  it("cannot install after verifier failure", async () => {
    const { adapter, verifier, nsis } = fixture();
    const artifact = (await adapter.check())!;
    verifier.hash.mockRejectedValue(new Error("untrusted"));
    await expect(adapter.download(artifact, new AbortController().signal)).rejects.toThrow();
    await expect(adapter.install()).rejects.toThrow();
    expect(nsis.launchVerifiedUpdate).not.toHaveBeenCalled();
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
    await expect(adapter.install()).rejects.toThrow();
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
    await expect(adapter.install()).rejects.toThrow();
  });

  it("rejects a changed offered hash without touching the cached installer", async () => {
    const { adapter, nsis } = fixture();
    const artifact = (await adapter.check())!;
    await expect(adapter.download({ ...artifact, sha512: Buffer.alloc(64, 6).toString("base64") },
      new AbortController().signal)).rejects.toThrow();
    expect(nsis.downloadUpdate).not.toHaveBeenCalled();
  });
});
