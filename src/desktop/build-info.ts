import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export interface DesktopBuildInfo {
  version: string;
  commit: string;
  builtAt: string;
  channel: "internal";
  dirty: boolean;
}

export function readDesktopBuildInfo(path = join(dirname(fileURLToPath(import.meta.url)), "build-info.json")): DesktopBuildInfo {
  return parseDesktopBuildInfo(JSON.parse(readFileSync(path, "utf8")) as unknown);
}

export function parseDesktopBuildInfo(value: unknown): DesktopBuildInfo {
  if (!isRecord(value)
    || typeof value.version !== "string"
    || !/^\d+\.\d+\.\d+$/.test(value.version)
    || typeof value.commit !== "string"
    || !/^[0-9a-f]{40}$/.test(value.commit)
    || typeof value.builtAt !== "string"
    || !Number.isFinite(Date.parse(value.builtAt))
    || value.channel !== "internal"
    || typeof value.dirty !== "boolean") {
    throw new Error("Beaver Code build identity is invalid.");
  }
  return {
    version: value.version,
    commit: value.commit,
    builtAt: value.builtAt,
    channel: value.channel,
    dirty: value.dirty,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
