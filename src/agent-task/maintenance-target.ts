import { isAbsolute, resolve } from "node:path";
import type { CanonicalMaintenanceTarget, CanonicalMaintenanceTargetRequest, CanonicalMaintenanceTargetSource } from "../types/index.js";

export async function createCanonicalMaintenanceTarget(request: CanonicalMaintenanceTargetRequest): Promise<CanonicalMaintenanceTarget> {
  if (request.memoryMode === "remote") throw new Error("Remote canonical maintenance is not supported.");
  const assignmentId = requireIdentifier(request.assignmentId);
  const baseRoot = resolve(request.memoryRoot);
  const namespaces = normalizeNamespaces(request.namespaces);
  const additionalSources = normalizeAdditionalSources(request.additionalSources ?? []);
  return {
    version: "1.0",
    assignmentId,
    mode: "canonical-direct",
    memoryMode: request.memoryMode,
    baseRoot,
    namespaces,
    ...(additionalSources.length > 0 ? { additionalSources } : {}),
  };
}

function normalizeNamespaces(values: string[]): string[] {
  const result = values.map((value) => value.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, ""));
  if (result.length === 0) throw new Error("At least one maintenance namespace is required.");
  for (const value of result) {
    if (!value || isAbsolute(value) || value === ".." || value.startsWith("../") || value.includes("/../") || value.includes("\0")) {
      throw new Error(`Invalid maintenance namespace: ${value}`);
    }
  }
  return [...new Set(result)].sort((left, right) => left.localeCompare(right, "en"));
}

function normalizeAdditionalSources(values: CanonicalMaintenanceTargetSource[]): CanonicalMaintenanceTargetSource[] {
  const seen = new Set<string>();
  return values.map((source) => {
    if (source.key !== "project" || seen.has(source.key)) throw new Error("Unsupported or duplicate maintenance source key.");
    seen.add(source.key);
    return { key: source.key, root: resolve(source.root), namespaces: normalizeNamespaces(source.namespaces) };
  });
}

function requireIdentifier(value: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(value)) throw new Error("Maintenance assignment id contains unsafe characters.");
  return value;
}
