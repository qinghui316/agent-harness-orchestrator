import { parseBeaverUpdatePublicKeys, type BeaverUpdatePublicKey } from "./update-manifest.js";

export type DesktopUpdatePolicy =
  | { readonly mode: "disabled" }
  | {
      readonly mode: "stable";
      readonly owner: "qinghui316";
      readonly repo: "beaver-code";
      readonly trustedKeys: readonly BeaverUpdatePublicKey[];
      readonly authenticodePublisher?: string;
    }
  | {
      readonly mode: "test";
      readonly feedUrl: string;
      readonly publisherSubject: string;
    };

export function parseDesktopUpdatePolicy(value: unknown): DesktopUpdatePolicy {
  if (!value || typeof value !== "object") throw new Error("Desktop update policy is missing.");
  const input = value as Record<string, unknown>;
  if (input.mode === "disabled") return Object.freeze({ mode: "disabled" });
  if (input.mode === "stable" && input.owner === "qinghui316" && input.repo === "beaver-code") {
    const trustedKeys = parseBeaverUpdatePublicKeys(input.trustedKeys);
    const authenticodePublisher = input.authenticodePublisher === undefined
      ? undefined : parsePublisher(input.authenticodePublisher);
    return Object.freeze({
      mode: "stable", owner: "qinghui316", repo: "beaver-code", trustedKeys,
      ...(authenticodePublisher ? { authenticodePublisher } : {}),
    });
  }
  if (input.mode === "test" && typeof input.feedUrl === "string") {
    const publisherSubject = parsePublisher(input.publisherSubject);
    const url = new URL(input.feedUrl);
    if (url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash
      && url.hostname !== "github.com" && !url.hostname.endsWith(".github.com")) {
      return Object.freeze({ mode: "test", feedUrl: url.href, publisherSubject });
    }
  }
  throw new Error("Desktop update policy is invalid.");
}

function parsePublisher(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("CN=") || value.length > 512 || /[\r\n\0]/.test(value)) {
    throw new Error("Desktop update publisher identity is invalid.");
  }
  return value;
}

export function isNewerStableVersion(candidate: string, installed: string): boolean {
  const parse = (value: string): number[] | null => {
    if (!/^(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})\.(0|[1-9]\d{0,7})$/.test(value)) return null;
    return value.split(".").map(Number);
  };
  const next = parse(candidate);
  const current = parse(installed);
  if (!next || !current) return false;
  for (let index = 0; index < 3; index += 1) {
    if (next[index] !== current[index]) return next[index] > current[index];
  }
  return false;
}
