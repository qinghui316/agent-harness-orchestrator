import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { readChangeMetadataFile } from "./metadata.js";
import { requiredChangeFiles } from "./schemas.js";
import type { ChangeMetadata } from "../types/index.js";

export function getMissingRequiredFiles(changePath: string): string[] {
  return requiredChangeFiles.filter((file) => !existsSync(join(changePath, file)));
}

export async function readChangeMetadata(changePath: string): Promise<ChangeMetadata | null> {
  return readChangeMetadataFile(changePath);
}

export async function readChangeContents(changePath: string): Promise<Record<(typeof requiredChangeFiles)[number], string | null>> {
  const entries = await Promise.all(requiredChangeFiles.map(async (file) => {
    const path = join(changePath, file);
    if (!existsSync(path)) return [file, null] as const;
    return [file, await readFile(path, "utf8")] as const;
  }));
  return Object.fromEntries(entries) as Record<(typeof requiredChangeFiles)[number], string | null>;
}

export function buildPlaceholderFiles(contents: Record<(typeof requiredChangeFiles)[number], string | null>): Array<{ path: string; content: string }> {
  const files: Array<{ path: string; content: string }> = [];
  for (const path of requiredChangeFiles) {
    const content = contents[path];
    if (content !== null) files.push({ path, content });
  }
  return files;
}
