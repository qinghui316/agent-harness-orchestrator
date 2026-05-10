import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const source = join(root, "templates");
const target = join(root, "dist", "templates");

async function copyDir(from, to) {
  await mkdir(to, { recursive: true });
  const entries = await readdir(from, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = join(from, entry.name);
    const targetPath = join(to, entry.name);
    if (entry.isDirectory()) {
      await copyDir(sourcePath, targetPath);
    } else if (entry.isFile()) {
      await writeFile(targetPath, await readFile(sourcePath));
    }
  }
}

await rm(target, { recursive: true, force: true });
await copyDir(source, target);
