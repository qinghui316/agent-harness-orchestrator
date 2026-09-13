import { describe, expect, it } from "vitest";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { desktopBuildVariant } from "../../scripts/desktop-build-variant.mjs";
import { parseDesktopBuildInfo } from "../../src/desktop/build-info.js";

describe("desktop build channel isolation", () => {
  it("keeps internal updates disabled and publishing off", () => {
    const variant = desktopBuildVariant("C:/workspace", "0.1.2", {});
    expect(variant.channel).toBe("internal");
    expect(variant.updatePolicy).toEqual({ mode: "disabled" });
    expect(variant.config.publish).toBeNull();
    expect(variant.config.win.signExecutable).toBe(false);
    expect(variant.config.artifactName).toBe("Beaver-Code-Setup-${version}-win-${arch}.${ext}");
  });
  it("isolates signed test identity without embedding certificate credentials", () => {
    const variant = desktopBuildVariant("C:/workspace", "0.1.2", {
      BEAVER_BUILD_CHANNEL: "test", BEAVER_TEST_VERSION: "0.1.3",
      BEAVER_TEST_UPDATE_URL: "https://beaver-update.test/",
      BEAVER_PUBLISHER_SUBJECT: "CN=Beaver Test", CSC_LINK: "private-certificate", CSC_KEY_PASSWORD: "private-password",
    });
    expect(variant.version).toBe("0.1.3");
    expect(variant.config.appId).toBe("com.agentharness.desktop.update-test");
    expect(variant.config.extraMetadata.name).toBe("beaver-code-update-test");
    expect(variant.config.win.forceCodeSigning).toBe(true);
    expect(variant.config.nsis.runAfterFinish).toBe(false);
    expect(JSON.stringify(variant)).not.toContain("private-password");
    expect(JSON.stringify(variant)).not.toContain("private-certificate");
  });
  it("builds stable updates without Authenticode only when a committed Ed25519 trust root exists", () => {
    const root = mkdtempSync(join(tmpdir(), "beaver-build-"));
    const key = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    const keyFile = join(root, "keys.json");
    writeFileSync(keyFile, JSON.stringify([{ keyId: "release", publicKey: key }]));
    const variant = desktopBuildVariant(root, "0.1.3", {
      BEAVER_BUILD_CHANNEL: "stable", BEAVER_UPDATE_PUBLIC_KEYS_FILE: keyFile,
    });
    expect(variant.updatePolicy).toMatchObject({ mode: "stable", owner: "qinghui316", repo: "beaver-code" });
    expect(variant.config.win.signExecutable).toBe(false);
    expect(variant.config.publish).toMatchObject({ repo: "beaver-code" });
  });
  it("rejects a partially configured stable Authenticode identity", () => {
    const root = mkdtempSync(join(tmpdir(), "beaver-build-"));
    const key = generateKeyPairSync("ed25519").publicKey.export({ type: "spki", format: "pem" }).toString();
    const keyFile = join(root, "keys.json");
    writeFileSync(keyFile, JSON.stringify([{ keyId: "release", publicKey: key }]));
    expect(() => desktopBuildVariant(root, "0.1.3", {
      BEAVER_BUILD_CHANNEL: "stable", BEAVER_UPDATE_PUBLIC_KEYS_FILE: keyFile,
      BEAVER_PUBLISHER_SUBJECT: "CN=Beaver Code",
    })).toThrow("requires both");
    expect(() => desktopBuildVariant(root, "0.1.3", {
      BEAVER_BUILD_CHANNEL: "stable", BEAVER_UPDATE_PUBLIC_KEYS_FILE: keyFile,
      CSC_LINK: "credential",
    })).toThrow("requires both");
  });
  it("rejects dirty signed builds and mixed channel policies at runtime", () => {
    const build = { version: "0.1.2", commit: "a".repeat(40), builtAt: "2026-09-12T00:00:00Z", dirty: false };
    expect(() => parseDesktopBuildInfo({ ...build, channel: "internal", updatePolicy: {
      mode: "stable", owner: "qinghui316", repo: "beaver-code", trustedKeys: [],
    } })).toThrow();
    expect(() => parseDesktopBuildInfo({ ...build, channel: "stable", updatePolicy: { mode: "disabled" } })).toThrow();
  });
});
