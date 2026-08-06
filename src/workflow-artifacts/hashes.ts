import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { WorkflowGraphPlan } from "../types/index.js";

export async function hashFile(path: string): Promise<string> {
  const bytes = await readFile(path);
  if (basename(path) === "ac-map.json") {
    try {
      const parsed = JSON.parse(bytes.toString("utf8")) as { generatedAt?: string };
      delete parsed.generatedAt;
      return hashText(JSON.stringify(parsed));
    } catch {
      return createHash("sha256").update(bytes).digest("hex");
    }
  }
  return createHash("sha256").update(bytes).digest("hex");
}

export function hashText(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function hashWorkflowGraphPlan(graph: WorkflowGraphPlan): string {
  return hashText(stableJson(graph));
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableJson(item === undefined ? null : item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}
