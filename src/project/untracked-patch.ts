import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { gitText } from "./git.js";

export async function renderUntrackedTextPatch(cwd: string, file: string): Promise<string> {
  const normalized = file.replace(/\\/g, "/");
  const contentBytes = await readFile(join(cwd, file));
  const rawObjectId = gitBlobObjectId(contentBytes);
  const objectId = await gitFilteredBlobObjectId(cwd, normalized).catch(() => rawObjectId);
  const content = objectId === rawObjectId
    ? contentBytes.toString("utf8")
    : contentBytes.toString("utf8").replace(/\r\n/g, "\n");
  const lines = content.endsWith("\n") ? content.slice(0, -1).split(/\r?\n/) : content.split(/\r?\n/);
  const lineCount = Math.max(lines.length, 1);
  const addedRange = lineCount === 1 ? "+1" : `+1,${lineCount}`;
  return [
    `diff --git a/${normalized} b/${normalized}`,
    "new file mode 100644",
    `index 0000000..${objectId.slice(0, 7)}`,
    "--- /dev/null",
    `+++ b/${normalized}`,
    `@@ -0,0 ${addedRange} @@`,
    ...lines.map((line) => `+${line}`),
    "",
  ].join("\n");
}

async function gitFilteredBlobObjectId(cwd: string, normalizedPath: string): Promise<string> {
  return (await gitText(cwd, ["hash-object", `--path=${normalizedPath}`, normalizedPath])).trim();
}

function gitBlobObjectId(content: Buffer): string {
  return createHash("sha1")
    .update(`blob ${content.length}\0`)
    .update(content)
    .digest("hex");
}
