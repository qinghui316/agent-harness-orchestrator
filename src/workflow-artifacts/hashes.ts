import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { ResolvedMemory } from "../types/index.js";
import { resolveArtifactRef } from "./artifact-refs.js";

export async function hashArtifactRefs(memory: ResolvedMemory, refs: string[]): Promise<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const ref of refs) {
    result[ref] = await hashFile(resolveArtifactRef(memory, ref));
  }
  return result;
}

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
