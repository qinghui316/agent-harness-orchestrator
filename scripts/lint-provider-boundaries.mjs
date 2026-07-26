import { readdir, readFile } from "node:fs/promises";
import { relative, resolve, sep } from "node:path";
import process from "node:process";

const root = resolve(process.cwd());
const sourceRoot = resolve(root, "src");
const files = await collectTypeScriptFiles(sourceRoot);
const violations = [];

const retiredSymbols = [
  "codexUserInput",
  "codexSessionId",
  "coder-codex",
  "codex-readonly",
  "codex-live-events",
  "runtimeTarget",
  "stageForNode",
  "RunGraphLane",
  "RunGraphStage",
  "ProjectDocumentLease",
  "MaintenanceDiffManifest",
  "ProjectMemoryApplyTransaction",
  "childContinuation",
  "codexChildContinuationPrompt",
  "stopAfterChildThreadId",
  "refineProviderAttemptSurfaceRole",
  "followup_task",
  "spawn_agent",
  "child-agent",
];

for (const file of files) {
  const relativePath = relative(root, file).split(sep).join("/");
  const text = await readFile(file, "utf8");
  const adapterPrivate = relativePath.startsWith("src/codex/")
    || /^src\/provider-runtime\/codex(?:-|\.)/.test(relativePath)
    || relativePath === "src/provider-runtime/default-registry.ts"
    || relativePath === "src/provider-runtime/index.ts";

  if (!adapterPrivate && /(?:from\s+|import\s*\()["'][^"']*(?:\/codex\/|\\codex\\)/.test(text)) {
    violations.push(`${relativePath}: generic code imports a Codex raw module`);
  }
  if (!adapterPrivate && /providerId\s*(?:===|!==)\s*["']codex["']|["']codex["']\s*(?:===|!==)\s*providerId/.test(text)) {
    violations.push(`${relativePath}: generic code branches on the Codex provider id`);
  }
  if (!adapterPrivate && /\bcodex\b|codex[A-Z]|Codex[A-Z]|codex-/i.test(text)) {
    violations.push(`${relativePath}: generic production code contains a Codex-specific identifier`);
  }
  for (const symbol of retiredSymbols) {
    if (text.includes(symbol)) violations.push(`${relativePath}: retired symbol ${symbol}`);
  }
}

if (violations.length > 0) {
  process.stderr.write("Provider boundary lint failed:\n" + violations.map((item) => `- ${item}`).join("\n") + "\n");
  process.exit(1);
}

process.stdout.write(`Provider boundary lint passed (${files.length} source files).\n`);

async function collectTypeScriptFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) {
      result.push(...await collectTypeScriptFiles(path));
    } else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) {
      result.push(path);
    }
  }
  return result;
}
