#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readdir, readFile, stat, writeFile } from "node:fs/promises";
import { basename, relative, resolve } from "node:path";
import process from "node:process";

const repositoryRoot = resolve(process.cwd());
const candidates = [
  { classification: "rejected-selected", root: "design-assets/agent-office/selected" },
  { classification: "rebuildable-intermediate", root: "design-assets/agent-office/build" },
  { classification: "published-runtime", root: "src/web/public/agent-office/actions" },
];
const referenceRoots = ["src", "scripts", "tests", "design-assets/agent-office/office-assets.manifest.json"];

const corpus = (await Promise.all(referenceRoots.map((path) => readTextTree(resolve(repositoryRoot, path))))).join("\n");
const files = [];
for (const candidate of candidates) {
  for (const path of await listFiles(resolve(repositoryRoot, candidate.root))) {
    const content = await readFile(path);
    const name = basename(path);
    files.push({
      path: relative(repositoryRoot, path).replaceAll("\\", "/"),
      classification: candidate.classification,
      bytes: content.byteLength,
      sha256: createHash("sha256").update(content).digest("hex"),
      productionReferences: countOccurrences(corpus, name),
    });
  }
}
files.sort((left, right) => left.path.localeCompare(right.path));
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  files,
  totals: {
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.bytes, 0),
    referenced: files.filter((file) => file.productionReferences > 0).length,
  },
};
const output = resolve(repositoryRoot, process.argv[2] ?? "design-assets/agent-office/cleanup-inventory-before.json");
await writeFile(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
process.stdout.write(`${JSON.stringify(report.totals)}\n`);

async function listFiles(path) {
  const metadata = await stat(path).catch(() => null);
  if (!metadata) return [];
  if (metadata.isFile()) return [path];
  const entries = await readdir(path, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => listFiles(resolve(path, entry.name))));
  return nested.flat();
}

async function readTextTree(path) {
  const files = await listFiles(path);
  const textFiles = files.filter((file) => /\.(?:ts|tsx|js|mjs|json|md|css)$/i.test(file) && basename(file).toLowerCase() !== "readme.md");
  return (await Promise.all(textFiles.map((file) => readFile(file, "utf8").catch(() => "")))).join("\n");
}

function countOccurrences(text, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while ((offset = text.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}
