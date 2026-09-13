import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  GitHubBeaverUpdateManifestClient,
  parseBeaverWindowsUpdateManifest,
  verifyBeaverUpdateManifest,
} from "../../src/desktop/update-manifest.js";

const pair = generateKeyPairSync("ed25519");
const publicKey = pair.publicKey.export({ type: "spki", format: "pem" }).toString();
const trust = [{ keyId: "release-2026", publicKey }];
const blockmapBytes = Buffer.from("signed blockmap fixture", "utf8");
const manifest = {
  schemaVersion: 1,
  channel: "stable",
  version: "0.1.3",
  tag: "v0.1.3",
  commit: "a".repeat(40),
  platform: "win32",
  arch: "x64",
  publishedAt: "2026-09-13T00:00:00.000Z",
  installer: { name: "Beaver-Code-Setup-0.1.3-win-x64.exe", size: 2_000_000, sha512: Buffer.alloc(64, 1).toString("base64") },
  blockmap: {
    name: "Beaver-Code-Setup-0.1.3-win-x64.exe.blockmap",
    size: blockmapBytes.byteLength,
    sha512: createHash("sha512").update(blockmapBytes).digest("base64"),
  },
} as const;

function signed(value: unknown = manifest, keyId = "release-2026") {
  const bytes = Buffer.from(`${JSON.stringify(value)}\n`);
  const envelope = Buffer.from(JSON.stringify({
    schemaVersion: 1, algorithm: "ed25519", keyId,
    signature: sign(null, bytes, pair.privateKey).toString("base64"),
  }));
  return { bytes, envelope };
}

describe("Beaver Code signed update manifest", () => {
  it("verifies raw bytes before parsing and returns an exact release identity", () => {
    const value = signed();
    expect(verifyBeaverUpdateManifest(value.bytes, value.envelope, trust)).toMatchObject({
      manifest,
      releaseUrl: "https://github.com/qinghui316/beaver-code/releases/tag/v0.1.3",
    });
  });

  it("rejects tampering, unknown keys, extra fields and non-stable identities", () => {
    const value = signed();
    expect(() => verifyBeaverUpdateManifest(Buffer.concat([value.bytes, Buffer.from(" ")]), value.envelope, trust)).toThrow("signature");
    expect(() => verifyBeaverUpdateManifest(value.bytes, signed(manifest, "unknown").envelope, trust)).toThrow("not trusted");
    for (const candidate of [
      { ...manifest, hidden: true },
      { ...manifest, version: "0.1.3-beta", tag: "v0.1.3-beta" },
      { ...manifest, tag: "v0.1.4" },
      { ...manifest, installer: { ...manifest.installer, name: "other.exe" } },
      { ...manifest, commit: "A".repeat(40) },
    ]) expect(() => parseBeaverWindowsUpdateManifest(candidate)).toThrow();
  });

  it("rejects redirects outside the bounded GitHub asset allowlist", async () => {
    const request = vi.fn(async () => new Response(null, { status: 302, headers: { location: "https://evil.example/update" } }));
    const client = new GitHubBeaverUpdateManifestClient(trust, request as typeof fetch);
    await expect(client.latest()).rejects.toThrow("not allowed");
  });

  it("requires an exact unchanged signed tag during install-time revalidation", async () => {
    const first = signed();
    const changed = signed({ ...manifest, commit: "b".repeat(40) });
    const responses = [first.bytes, first.envelope, blockmapBytes, changed.bytes, changed.envelope, blockmapBytes];
    const request = vi.fn(async () => new Response(responses.shift(), { status: 200 }));
    const client = new GitHubBeaverUpdateManifestClient(trust, request as typeof fetch);
    const offered = await client.latest();
    expect(String(request.mock.calls[0]?.[0])).toContain("/releases/latest/download/beaver-update-win-x64.json");
    await expect(client.exact(offered)).rejects.toThrow("changed after download");
  });

  it("accepts bounded GitHub asset redirects with signed CDN query parameters", async () => {
    const value = signed();
    const redirected = new Set<string>();
    const request = vi.fn(async (input: URL | RequestInfo) => {
      const url = String(input);
      if (url.includes("github.com/") && !redirected.has(url)) {
        redirected.add(url);
        return new Response(null, { status: 302, headers: {
          location: `https://release-assets.githubusercontent.com/github-production-release-asset/1/${url.endsWith(".sig") ? "signature" : url.endsWith(".blockmap") ? "blockmap" : "manifest"}?sp=r&sig=opaque`,
        } });
      }
      if (url.includes("signature")) return new Response(value.envelope, { status: 200 });
      if (url.includes("blockmap")) return new Response(blockmapBytes, { status: 200 });
      return new Response(value.bytes, { status: 200 });
    });
    await expect(new GitHubBeaverUpdateManifestClient(trust, request as typeof fetch).latest()).resolves.toMatchObject({ manifest });
  });

  it("rejects a blockmap that does not match the signed manifest", async () => {
    const value = signed();
    const responses = [value.bytes, value.envelope, Buffer.from("tampered")];
    const request = vi.fn(async () => new Response(responses.shift(), { status: 200 }));
    await expect(new GitHubBeaverUpdateManifestClient(trust, request as typeof fetch).latest()).rejects.toThrow("blockmap");
  });
});
