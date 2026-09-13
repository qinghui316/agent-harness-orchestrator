import { createHash, createPublicKey, verify } from "node:crypto";

export const BEAVER_UPDATE_MANIFEST_ASSET = "beaver-update-win-x64.json";
export const BEAVER_UPDATE_SIGNATURE_ASSET = `${BEAVER_UPDATE_MANIFEST_ASSET}.sig`;

export interface BeaverWindowsUpdateManifest {
  readonly schemaVersion: 1;
  readonly channel: "stable";
  readonly version: string;
  readonly tag: string;
  readonly commit: string;
  readonly platform: "win32";
  readonly arch: "x64";
  readonly publishedAt: string;
  readonly installer: Readonly<{ name: string; size: number; sha512: string }>;
  readonly blockmap: Readonly<{ name: string; size: number; sha512: string }>;
}

export interface BeaverUpdateSignature {
  readonly schemaVersion: 1;
  readonly algorithm: "ed25519";
  readonly keyId: string;
  readonly signature: string;
}

export interface BeaverUpdatePublicKey {
  readonly keyId: string;
  readonly publicKey: string;
}

export interface VerifiedBeaverUpdateManifest {
  readonly manifest: BeaverWindowsUpdateManifest;
  readonly manifestSha256: string;
  readonly releaseUrl: string;
}

export interface BeaverUpdateManifestPort {
  latest(): Promise<VerifiedBeaverUpdateManifest>;
  exact(expected: VerifiedBeaverUpdateManifest): Promise<void>;
}

const STABLE_OWNER = "qinghui316";
const STABLE_REPO = "beaver-code";
const ALLOWED_REDIRECT_HOSTS = new Set([
  "github.com",
  "objects.githubusercontent.com",
  "release-assets.githubusercontent.com",
  "github-releases.githubusercontent.com",
]);

export function parseBeaverUpdatePublicKeys(value: unknown): readonly BeaverUpdatePublicKey[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 2) throw new Error("Update trust roots are invalid.");
  const seen = new Set<string>();
  return Object.freeze(value.map((entry) => {
    if (!isRecord(entry) || !exactKeys(entry, ["keyId", "publicKey"]) || !boundedKeyId(entry.keyId)
      || typeof entry.publicKey !== "string" || entry.publicKey.length > 2048 || seen.has(entry.keyId)) {
      throw new Error("Update trust roots are invalid.");
    }
    const key = createPublicKey(entry.publicKey);
    if (key.asymmetricKeyType !== "ed25519") throw new Error("Update trust root is not Ed25519.");
    seen.add(entry.keyId);
    return Object.freeze({ keyId: entry.keyId, publicKey: entry.publicKey });
  }));
}

export function verifyBeaverUpdateManifest(
  manifestBytes: Uint8Array,
  signatureBytes: Uint8Array,
  trustedKeys: readonly BeaverUpdatePublicKey[],
): VerifiedBeaverUpdateManifest {
  if (manifestBytes.byteLength < 2 || manifestBytes.byteLength > 65_536 || signatureBytes.byteLength > 4_096) {
    throw new Error("Update metadata size is invalid.");
  }
  let envelope: unknown;
  try { envelope = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(signatureBytes)); }
  catch { throw new Error("Update signature envelope is invalid."); }
  if (!isRecord(envelope) || !exactKeys(envelope, ["schemaVersion", "algorithm", "keyId", "signature"])
    || envelope.schemaVersion !== 1 || envelope.algorithm !== "ed25519" || !boundedKeyId(envelope.keyId)
    || typeof envelope.signature !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(envelope.signature)) {
    throw new Error("Update signature envelope is invalid.");
  }
  const trust = trustedKeys.find((candidate) => candidate.keyId === envelope.keyId);
  if (!trust) throw new Error("Update signature key is not trusted.");
  if (!verify(null, manifestBytes, createPublicKey(trust.publicKey), Buffer.from(envelope.signature, "base64"))) {
    throw new Error("Update manifest signature is invalid.");
  }
  let raw: unknown;
  try { raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)); }
  catch { throw new Error("Signed update manifest is invalid."); }
  const manifest = parseBeaverWindowsUpdateManifest(raw);
  return Object.freeze({
    manifest,
    manifestSha256: createHash("sha256").update(manifestBytes).digest("hex"),
    releaseUrl: `https://github.com/${STABLE_OWNER}/${STABLE_REPO}/releases/tag/${manifest.tag}`,
  });
}

export function parseBeaverWindowsUpdateManifest(value: unknown): BeaverWindowsUpdateManifest {
  const fields = ["schemaVersion", "channel", "version", "tag", "commit", "platform", "arch", "publishedAt", "installer", "blockmap"];
  if (!isRecord(value) || !exactKeys(value, fields) || value.schemaVersion !== 1 || value.channel !== "stable"
    || value.platform !== "win32" || value.arch !== "x64" || !stableVersion(value.version)
    || value.tag !== `v${value.version}` || typeof value.commit !== "string" || !/^[0-9a-f]{40}$/.test(value.commit)
    || typeof value.publishedAt !== "string" || !isExactIsoTimestamp(value.publishedAt)) {
    throw new Error("Signed update manifest is invalid.");
  }
  const installerName = `Beaver-Code-Setup-${value.version}-win-x64.exe`;
  const installer = parseArtifact(value.installer, installerName, 1_000_000, 1_073_741_824);
  const blockmap = parseArtifact(value.blockmap, `${installerName}.blockmap`, 1, 134_217_728);
  return Object.freeze({
    schemaVersion: 1,
    channel: "stable",
    version: value.version,
    tag: value.tag,
    commit: value.commit,
    platform: "win32",
    arch: "x64",
    publishedAt: value.publishedAt,
    installer,
    blockmap,
  });
}

export class GitHubBeaverUpdateManifestClient implements BeaverUpdateManifestPort {
  private readonly keys: readonly BeaverUpdatePublicKey[];
  constructor(keys: readonly BeaverUpdatePublicKey[], private readonly request: typeof fetch = fetch) {
    this.keys = parseBeaverUpdatePublicKeys(keys);
  }

  async latest(): Promise<VerifiedBeaverUpdateManifest> {
    return this.read("latest/download");
  }

  async exact(expected: VerifiedBeaverUpdateManifest): Promise<void> {
    const current = await this.read(`download/${expected.manifest.tag}`);
    if (current.manifestSha256 !== expected.manifestSha256
      || JSON.stringify(current.manifest) !== JSON.stringify(expected.manifest)) {
      throw new Error("The published update changed after download.");
    }
  }

  private async read(release: string): Promise<VerifiedBeaverUpdateManifest> {
    const root = `https://github.com/${STABLE_OWNER}/${STABLE_REPO}/releases/${release}`;
    const [manifest, signature] = await Promise.all([
      fetchBounded(`${root}/${BEAVER_UPDATE_MANIFEST_ASSET}`, 65_536, this.request),
      fetchBounded(`${root}/${BEAVER_UPDATE_SIGNATURE_ASSET}`, 4_096, this.request),
    ]);
    const verified = verifyBeaverUpdateManifest(manifest, signature, this.keys);
    const blockmap = await fetchBoundedHash(`${root}/${verified.manifest.blockmap.name}`, 134_217_728, this.request);
    if (blockmap.size !== verified.manifest.blockmap.size || blockmap.sha512 !== verified.manifest.blockmap.sha512) {
      throw new Error("Signed update blockmap is invalid.");
    }
    return verified;
  }
}

async function fetchBoundedHash(url: string, limit: number, request: typeof fetch): Promise<{ size: number; sha512: string }> {
  let current = new URL(url);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    assertAllowedUrl(current);
    const response = await request(current, { redirect: "manual", headers: { Accept: "application/octet-stream" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === 5) throw new Error("Update metadata redirect is invalid.");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok || !response.body) throw new Error("Update metadata is unavailable.");
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > limit) throw new Error("Update metadata is too large.");
    const hash = createHash("sha512");
    let total = 0;
    const reader = response.body.getReader();
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > limit) { await reader.cancel(); throw new Error("Update metadata is too large."); }
      hash.update(result.value);
    }
    return { size: total, sha512: hash.digest("base64") };
  }
  throw new Error("Update metadata redirect is invalid.");
}

async function fetchBounded(url: string, limit: number, request: typeof fetch): Promise<Uint8Array> {
  let current = new URL(url);
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    assertAllowedUrl(current);
    const response = await request(current, { redirect: "manual", headers: { Accept: "application/octet-stream" } });
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get("location");
      if (!location || redirects === 5) throw new Error("Update metadata redirect is invalid.");
      current = new URL(location, current);
      continue;
    }
    if (!response.ok || !response.body) throw new Error("Update metadata is unavailable.");
    const declared = Number(response.headers.get("content-length") ?? "0");
    if (declared > limit) throw new Error("Update metadata is too large.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    const reader = response.body.getReader();
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      total += result.value.byteLength;
      if (total > limit) { await reader.cancel(); throw new Error("Update metadata is too large."); }
      chunks.push(result.value);
    }
    const result = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
    return result;
  }
  throw new Error("Update metadata redirect is invalid.");
}

function assertAllowedUrl(url: URL): void {
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.hash
    || !ALLOWED_REDIRECT_HOSTS.has(url.hostname)) throw new Error("Update metadata URL is not allowed.");
  if (url.hostname === "github.com"
    && (url.search || !url.pathname.startsWith(`/${STABLE_OWNER}/${STABLE_REPO}/releases/`))) {
    throw new Error("Update metadata URL is not allowed.");
  }
}

function parseArtifact(value: unknown, expectedName: string, minSize: number, maxSize: number) {
  if (!isRecord(value) || !exactKeys(value, ["name", "size", "sha512"]) || value.name !== expectedName
    || !Number.isSafeInteger(value.size) || Number(value.size) < minSize || Number(value.size) > maxSize
    || typeof value.sha512 !== "string" || !/^[A-Za-z0-9+/]{86}==$/.test(value.sha512)) {
    throw new Error("Signed update artifact identity is invalid.");
  }
  return Object.freeze({ name: value.name, size: Number(value.size), sha512: value.sha512 });
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && [...expected].sort().every((key, index) => key === keys[index]);
}

function stableVersion(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})$/.test(value);
}

function boundedKeyId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

function isExactIsoTimestamp(value: string): boolean {
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
