/** Host lifecycle facts only. This contract cannot authorize Provider or database operations. */
export interface WorkbenchUpdateIdentity {
  readonly updateId: string;
  readonly generation: string;
  readonly targetVersion: string;
  readonly artifactSha512: string;
}

export type WorkbenchUpdatePhase = "idle" | "preparing" | "prepared" | "shutting-down" | "stopped" | "canceled" | "recovery-required";

export interface WorkbenchUpdateSnapshot {
  readonly identity: WorkbenchUpdateIdentity | null;
  readonly phase: WorkbenchUpdatePhase;
}

export interface WorkbenchUpdateReceipt {
  readonly identity: WorkbenchUpdateIdentity;
  readonly status: "prepared" | "stopped";
}

export interface DesktopUpdateOffer {
  readonly offerId: string;
  readonly version: string;
  readonly releaseUrl: string;
}

export type DesktopUpdateChoice = "install" | "later";

export function isDesktopUpdateOffer(value: unknown): value is DesktopUpdateOffer {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  if (!boundedId(item.offerId) || typeof item.version !== "string"
    || !/^\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(item.version) || typeof item.releaseUrl !== "string") return false;
  try {
    const url = new URL(item.releaseUrl);
    return url.protocol === "https:" && url.hostname === "github.com" && !url.username && !url.password
      && !url.port && !url.search && !url.hash
      && url.pathname === `/qinghui316/beaver-code/releases/tag/v${item.version}`;
  } catch { return false; }
}

export function sameWorkbenchUpdate(left: WorkbenchUpdateIdentity, right: WorkbenchUpdateIdentity): boolean {
  return left.updateId === right.updateId && left.generation === right.generation
    && left.targetVersion === right.targetVersion && left.artifactSha512 === right.artifactSha512;
}

export function isWorkbenchUpdateIdentity(value: unknown): value is WorkbenchUpdateIdentity {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return boundedId(item.updateId) && boundedId(item.generation)
    && typeof item.targetVersion === "string" && /^\d{1,8}\.\d{1,8}\.\d{1,8}$/.test(item.targetVersion)
    && typeof item.artifactSha512 === "string" && /^[A-Za-z0-9+/]{86}==$/.test(item.artifactSha512);
}

function boundedId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_:-]{1,128}$/.test(value);
}
