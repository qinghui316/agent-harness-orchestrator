import { describe, expect, it, vi } from "vitest";
import { DesktopUpdateCoordinator, type DesktopUpdateDownloadPort, type DesktopUpdateHostPort } from "../../src/desktop/update-coordinator.js";
import { isNewerStableVersion, parseDesktopUpdatePolicy } from "../../src/desktop/update-policy.js";
import { validateDesktopSignatureEvidence } from "../../src/desktop/update-signature.js";

const artifact = { version: "0.1.3", sha512: Buffer.alloc(64, 2).toString("base64") };
function fixture() {
  const downloads: DesktopUpdateDownloadPort = {
    check: vi.fn(async () => artifact), download: vi.fn(async () => {}),
    revalidate: vi.fn(async () => {}), install: vi.fn(async () => {}),
  };
  const host: DesktopUpdateHostPort = {
    generation: vi.fn(() => "generation"),
    prepare: vi.fn(async (identity) => ({ identity, status: "prepared" })),
    stop: vi.fn(async (identity) => ({ identity, status: "stopped" })),
    cancel: vi.fn(async () => {}), authorizeInstallerExit: vi.fn(),
  };
  const onState = vi.fn();
  return { downloads, host, onState, owner: new DesktopUpdateCoordinator("0.1.2", downloads, host, onState) };
}

describe("desktop update policy", () => {
  it.each(["0.1.2", "0.1.1", "0.1.3-beta", "v0.1.3", "01.1.3", "0.1.3+test"])("rejects non-new-stable %s", (version) => {
    expect(isNewerStableVersion(version, "0.1.2")).toBe(false);
  });
  it.each(["0.1.3", "0.2.0", "1.0.0"])("accepts newer stable %s", (version) => {
    expect(isNewerStableVersion(version, "0.1.2")).toBe(true);
  });
  it("requires a publisher and fixed production repo", () => {
    expect(() => parseDesktopUpdatePolicy({ mode: "stable" })).toThrow();
    expect(() => parseDesktopUpdatePolicy({ mode: "stable", owner: "other", repo: "other", publisherSubject: "CN=Test" })).toThrow();
    expect(parseDesktopUpdatePolicy({ mode: "disabled" })).toEqual({ mode: "disabled" });
  });
  it("does not allow HTTP, credentials or GitHub as a test feed", () => {
    for (const feedUrl of ["http://localhost/", "https://u:p@localhost/", "https://github.com/test", "file:///test", "https://localhost/?token=x"]) {
      expect(() => parseDesktopUpdatePolicy({ mode: "test", feedUrl, publisherSubject: "CN=Test" })).toThrow();
    }
  });
});

describe("signature evidence", () => {
  const evidence = { status: 0, path: "C:/cache/update.exe", subject: "CN=Test", timestamped: true };
  it("accepts only exact valid publisher, file and timestamp evidence", () => {
    expect(() => validateDesktopSignatureEvidence(evidence, evidence.path, evidence.subject)).not.toThrow();
    for (const patch of [{ status: 1 }, { path: "C:/different.exe" }, { subject: "CN=Other" }, { timestamped: false }]) {
      expect(() => validateDesktopSignatureEvidence({ ...evidence, ...patch }, evidence.path, evidence.subject)).toThrow();
    }
  });
  it("rejects renamed older installers even if their publisher is valid", () => {
    expect(() => validateDesktopSignatureEvidence({ ...evidence, productVersion: "0.1.2", productName: "Beaver Code" },
      evidence.path, evidence.subject, { version: "0.1.3", productName: "Beaver Code" })).toThrow("product or version");
  });
});

describe("desktop update coordinator", () => {
  it("installs once only after both exact receipts and final artifact verification", async () => {
    const { owner, host, downloads, onState } = fixture();
    const first = owner.check();
    expect(owner.check()).toBe(first);
    await first;
    expect(onState.mock.calls.flat()).toEqual(["checking", "downloading", "preparing", "stopping", "installing"]);
    expect(downloads.revalidate).toHaveBeenCalledTimes(2);
    expect(host.authorizeInstallerExit).toHaveBeenCalledTimes(1);
    expect(downloads.install).toHaveBeenCalledTimes(1);
    await owner.check(true);
    expect(downloads.install).toHaveBeenCalledTimes(1);
  });
  it("signature/checksum failure never stops the Workbench", async () => {
    const { owner, host, downloads } = fixture();
    vi.mocked(downloads.revalidate).mockRejectedValue(new Error("signature"));
    await owner.check();
    expect(owner.read()).toBe("failed");
    expect(host.prepare).not.toHaveBeenCalled();
    expect(downloads.install).not.toHaveBeenCalled();
  });
  it("failed save cancels preparation and suppresses repeated automatic interruption", async () => {
    const { owner, host, downloads } = fixture();
    vi.mocked(host.prepare).mockRejectedValue(new Error("save"));
    await owner.check();
    await owner.check();
    expect(host.prepare).toHaveBeenCalledTimes(1);
    expect(host.cancel).toHaveBeenCalledTimes(1);
    expect(host.stop).not.toHaveBeenCalled();
    expect(downloads.install).not.toHaveBeenCalled();
    await owner.check(true);
    expect(host.prepare).toHaveBeenCalledTimes(2);
  });
  it("does not mistake a wrong shutdown receipt for success", async () => {
    const { owner, host, downloads } = fixture();
    vi.mocked(host.stop).mockImplementation(async (identity) => ({ identity: { ...identity, updateId: "stale" }, status: "stopped" }));
    await owner.check();
    expect(downloads.install).not.toHaveBeenCalled();
    expect(host.authorizeInstallerExit).not.toHaveBeenCalled();
    expect(host.cancel).not.toHaveBeenCalled();
  });
  it("rejects a generation switch after shutdown", async () => {
    const { owner, host, downloads } = fixture();
    vi.mocked(host.stop).mockImplementation(async (identity) => {
      vi.mocked(host.generation).mockReturnValue("replacement");
      return { identity, status: "stopped" };
    });
    await owner.check();
    expect(downloads.install).not.toHaveBeenCalled();
  });
  it("does not install when the session ends during preparation", async () => {
    const { owner, host, downloads } = fixture();
    vi.mocked(host.prepare).mockImplementation(async (identity) => {
      owner.endSession();
      return { identity, status: "prepared" };
    });
    await owner.check();
    expect(host.cancel).toHaveBeenCalled();
    expect(downloads.install).not.toHaveBeenCalled();
  });
  it("rechecks cached files after shutdown", async () => {
    const { owner, downloads } = fixture();
    vi.mocked(downloads.revalidate).mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("tampered"));
    await owner.check();
    expect(downloads.install).not.toHaveBeenCalled();
  });
  it("does not authorize app quit when installer launch fails asynchronously", async () => {
    const { owner, downloads, host } = fixture();
    vi.mocked(downloads.install).mockImplementation(async () => {
      await Promise.resolve();
      throw new Error("spawn failed");
    });
    await owner.check();
    expect(owner.read()).toBe("failed");
    expect(owner.diagnostic()).toEqual({ stage: "installing", recoveryRequired: true });
    expect(host.authorizeInstallerExit).not.toHaveBeenCalled();
  });
});
