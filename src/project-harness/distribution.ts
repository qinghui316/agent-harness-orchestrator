import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { assertPhysicalDirectory, resolveWithinPhysicalRoot } from "./path-safety.js";

export const PROJECT_HARNESS_DAILY_COMMANDS = [
  "doctor",
  "audit",
  "knowledge",
  "change",
  "integrate",
  "evolve",
] as const;

export type ProjectHarnessDailyCommand = typeof PROJECT_HARNESS_DAILY_COMMANDS[number];

export interface ProjectHarnessDailyRuntimeInvocation {
  command: ProjectHarnessDailyCommand;
  args: readonly string[];
  skillRoot: string;
}

export type ProjectHarnessDailyRuntimeEntry = (
  invocation: ProjectHarnessDailyRuntimeInvocation,
) => Promise<unknown> | unknown;

export interface InstallProjectHarnessRuntimeDistributionOptions {
  skillRoot: string;
  compiledRuntimeEntry: string;
  failureInjection?: (stage: ProjectHarnessDistributionStage) => Promise<void> | void;
}

export type ProjectHarnessDistributionStage =
  | "staged"
  | "previous-moved"
  | "published";

export interface ProjectHarnessRuntimeDistributionResult {
  runtimeRoot: string;
  runtimeSha256: string;
  commands: readonly ProjectHarnessDailyCommand[];
  files: readonly string[];
}

interface ProjectHarnessRuntimeDistributionManifest {
  schema_version: "1.0";
  runtime: "compiled-javascript";
  entry: "runtime.mjs";
  commands: readonly ProjectHarnessDailyCommand[];
  sha256: string;
}

const distributionDirectory = "scripts/project-harness-runtime";
const runtimeFiles = [
  "runtime.mjs",
  "cli.mjs",
  "runtime-manifest.json",
  "harness.ps1",
  "harness.cmd",
  "harness.sh",
] as const;

export async function installProjectHarnessRuntimeDistribution(
  options: InstallProjectHarnessRuntimeDistributionOptions,
): Promise<ProjectHarnessRuntimeDistributionResult> {
  const skillRoot = await assertPhysicalDirectory(options.skillRoot, "project Harness Skill root");
  const compiledSource = await readCompiledRuntimeEntry(options.compiledRuntimeEntry);
  const runtimeSha256 = createHash("sha256").update(compiledSource).digest("hex");
  const runtimeRoot = await resolveWithinPhysicalRoot(skillRoot, distributionDirectory, "project Harness Runtime");
  const parent = dirname(runtimeRoot);
  await mkdir(parent, { recursive: true });

  const transactionId = randomUUID();
  const stagedRoot = join(parent, `.project-harness-runtime.${transactionId}.candidate`);
  const previousRoot = join(parent, `.project-harness-runtime.${transactionId}.previous`);
  assertExactSibling(parent, stagedRoot);
  assertExactSibling(parent, previousRoot);

  let previousMoved = false;
  let published = false;
  try {
    await mkdir(stagedRoot);
    await writeDistribution(stagedRoot, compiledSource, runtimeSha256);
    await options.failureInjection?.("staged");

    if (await pathExists(runtimeRoot)) {
      await rename(runtimeRoot, previousRoot);
      previousMoved = true;
      await options.failureInjection?.("previous-moved");
    }

    await rename(stagedRoot, runtimeRoot);
    published = true;
    await options.failureInjection?.("published");
    if (previousMoved) await rm(previousRoot, { recursive: true, force: false });
  } catch (error) {
    const rollbackErrors: string[] = [];
    if (published) {
      try {
        await rm(runtimeRoot, { recursive: true, force: false });
      } catch (rollbackError) {
        rollbackErrors.push(`remove candidate: ${(rollbackError as Error).message}`);
      }
    }
    if (previousMoved) {
      try {
        await rename(previousRoot, runtimeRoot);
      } catch (rollbackError) {
        rollbackErrors.push(`restore previous: ${(rollbackError as Error).message}`);
      }
    }
    await rm(stagedRoot, { recursive: true, force: true });
    const detail = rollbackErrors.length > 0 ? ` Rollback failed: ${rollbackErrors.join("; ")}` : "";
    throw new Error(`Project Harness Runtime distribution failed: ${(error as Error).message}.${detail}`);
  }

  return {
    runtimeRoot,
    runtimeSha256,
    commands: PROJECT_HARNESS_DAILY_COMMANDS,
    files: runtimeFiles,
  };
}

async function readCompiledRuntimeEntry(path: string): Promise<string> {
  const absolute = resolve(path);
  const info = await lstat(absolute);
  if (!info.isFile() || info.isSymbolicLink()) {
    throw new Error(`Compiled project Harness Runtime entry must be a physical file: ${absolute}`);
  }
  if (!/\.(?:m?js)$/i.test(absolute)) {
    throw new Error(`Compiled project Harness Runtime entry must be JavaScript: ${absolute}`);
  }
  if (normalizeForIdentity(await realpath(absolute)) !== normalizeForIdentity(absolute)) {
    throw new Error(`Compiled project Harness Runtime entry must not traverse a link or Junction: ${absolute}`);
  }
  const source = await readFile(absolute, "utf8");
  if (source.trim().length === 0) {
    throw new Error(`Compiled project Harness Runtime entry is empty: ${absolute}`);
  }
  assertSelfContainedModule(source);
  return source.endsWith("\n") ? source : `${source}\n`;
}

function assertSelfContainedModule(source: string): void {
  const specifiers = [
    ...source.matchAll(/\bfrom\s*["']([^"']+)["']/g),
    ...source.matchAll(/\bimport\s*(?:\(\s*)?["']([^"']+)["']/g),
    ...source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']/g),
  ].map((match) => match[1]);
  for (const specifier of specifiers) {
    if (specifier.startsWith("node:")) continue;
    throw new Error(`Compiled project Harness Runtime must be self-contained; external import found: ${specifier}`);
  }
  for (const match of source.matchAll(/\b(import|require)\s*\(([^)]*)\)/g)) {
    const expression = match[2].trim();
    if (/^["']node:[^"']+["']$/.test(expression)) continue;
    if (/^["'][^"']+["']$/.test(expression)) continue;
    throw new Error(`Compiled project Harness Runtime must not use computed module loading: ${expression}`);
  }
}

function normalizeForIdentity(path: string): string {
  const normalized = resolve(path).replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

async function writeDistribution(root: string, runtimeSource: string, runtimeSha256: string): Promise<void> {
  const manifest: ProjectHarnessRuntimeDistributionManifest = {
    schema_version: "1.0",
    runtime: "compiled-javascript",
    entry: "runtime.mjs",
    commands: PROJECT_HARNESS_DAILY_COMMANDS,
    sha256: runtimeSha256,
  };
  await Promise.all([
    writeFile(join(root, "runtime.mjs"), runtimeSource, "utf8"),
    writeFile(join(root, "cli.mjs"), renderCli(), "utf8"),
    writeFile(join(root, "runtime-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8"),
    writeFile(join(root, "harness.ps1"), renderPowerShellLauncher(), "utf8"),
    writeFile(join(root, "harness.cmd"), renderCmdLauncher(), "utf8"),
    writeFile(join(root, "harness.sh"), renderShLauncher(), { encoding: "utf8", mode: 0o755 }),
  ]);
}

function renderCli(): string {
  return `#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const allowed = new Set(${JSON.stringify(PROJECT_HARNESS_DAILY_COMMANDS)});
const [command, ...args] = process.argv.slice(2);
const nodeMajor = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10);
if (nodeMajor < 20) {
  process.stderr.write(JSON.stringify({
    ok: false,
    error: "unsupported_node_runtime",
    required: ">=20",
    actual: process.versions.node,
  }) + "\\n");
  process.exitCode = 2;
} else if (!command || !allowed.has(command)) {
  process.stderr.write(JSON.stringify({
    ok: false,
    error: "unsupported_command",
    allowed: [...allowed],
  }) + "\\n");
  process.exitCode = 2;
} else {
  try {
    const runtime = await import("./runtime.mjs");
    if (typeof runtime.runProjectHarnessDailyCommand !== "function") {
      throw new Error("Runtime entry does not export runProjectHarnessDailyCommand.");
    }
    const runtimeRoot = dirname(fileURLToPath(import.meta.url));
    const result = await runtime.runProjectHarnessDailyCommand({
      command,
      args,
      skillRoot: resolve(runtimeRoot, "../.."),
    });
    if (result !== undefined) {
      process.stdout.write((typeof result === "string" ? result : JSON.stringify(result, null, 2)) + "\\n");
    }
  } catch (error) {
    process.stderr.write(JSON.stringify({
      ok: false,
      error: "runtime_failed",
      message: error instanceof Error ? error.message : String(error),
    }) + "\\n");
    process.exitCode = 1;
  }
}
`;
}

function renderPowerShellLauncher(): string {
  return `$ErrorActionPreference = 'Stop'
$entry = Join-Path $PSScriptRoot 'cli.mjs'
if ($env:AHO_NODE) {
    & $env:AHO_NODE $entry @args
} elseif (Get-Command node -ErrorAction SilentlyContinue) {
    & node $entry @args
} else {
    Write-Error 'Node.js 20 or newer is required. Install it or set AHO_NODE for this host.'
    exit 2
}
exit $LASTEXITCODE
`;
}

function renderCmdLauncher(): string {
  return `@echo off
if defined AHO_NODE goto aho_node_override
where node >nul 2>nul
if %errorlevel% equ 0 goto aho_node
echo Node.js 20 or newer is required. Install it or set AHO_NODE for this host. 1>&2
exit /b 2
:aho_node_override
"%AHO_NODE%" "%~dp0cli.mjs" %*
exit /b %errorlevel%
:aho_node
node "%~dp0cli.mjs" %*
exit /b %errorlevel%
`;
}

function renderShLauncher(): string {
  return `#!/usr/bin/env sh
set -eu
SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
if [ -n "\${AHO_NODE:-}" ]; then
  exec "$AHO_NODE" "$SCRIPT_DIR/cli.mjs" "$@"
elif command -v node >/dev/null 2>&1; then
  exec node "$SCRIPT_DIR/cli.mjs" "$@"
else
  echo 'Node.js 20 or newer is required. Install it or set AHO_NODE for this host.' >&2
  exit 2
fi
`;
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

function assertExactSibling(parent: string, path: string): void {
  const rel = relative(parent, resolve(path));
  if (!rel || rel === ".." || rel.startsWith(`..${sep}`) || rel.includes(sep)) {
    throw new Error(`Project Harness Runtime staging path is not an exact sibling: ${path}`);
  }
}
