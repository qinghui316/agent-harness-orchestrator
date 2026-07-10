import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import console from "node:console";
import process from "node:process";

const execFileAsync = promisify(execFile);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const workspaceRoot = resolve(process.env.AHO_ACCEPTANCE_WORKSPACE ?? join(tmpdir(), "aho-provider-golden-acceptance"));
const acceptanceRelative = relative(root, workspaceRoot);
if (!acceptanceRelative || (!acceptanceRelative.startsWith("..") && !isAbsolute(acceptanceRelative))) {
  throw new Error(`AHO_ACCEPTANCE_WORKSPACE must be outside the AHO product repository: ${workspaceRoot}`);
}
await mkdir(workspaceRoot, { recursive: true });
const projectRoot = join(workspaceRoot, "project");
const ahoHome = join(workspaceRoot, "aho-home");
const readyMarker = join(workspaceRoot, ".aho-provider-golden-ready.json");
const fixtureRoot = join(root, "tests", "fixtures", "provider-golden-project");
const requestedPort = Number.parseInt(process.env.AHO_ACCEPTANCE_PORT ?? "4327", 10);

if (!Number.isInteger(requestedPort) || requestedPort < 0 || requestedPort > 65535) {
  throw new Error(`Invalid AHO_ACCEPTANCE_PORT: ${process.env.AHO_ACCEPTANCE_PORT ?? ""}`);
}

process.env.AHO_HOME = ahoHome;

const [{ ProjectRegistryStore }, { initHarness }, { startWorkbenchServer }] = await Promise.all([
  import("../dist/registry/store.js"),
  import("../dist/harness/init.js"),
  import("../dist/server/workbench-server.js"),
]);

const store = new ProjectRegistryStore(ahoHome);
let project;
const entries = await readdir(workspaceRoot);
const hasReadyMarker = existsSync(readyMarker);
const canAdoptLegacyWorkspace = !hasReadyMarker && await isCompleteLegacyWorkspace();
if (!hasReadyMarker && !canAdoptLegacyWorkspace) {
  if (entries.length > 0) throw new Error(`Persistent acceptance workspace is incomplete and will not be overwritten: ${workspaceRoot}`);
  await mkdir(projectRoot, { recursive: true });
  await cp(fixtureRoot, projectRoot, { recursive: true });
  await runGit(["init"]);
  await runGit(["config", "user.email", "aho-provider-acceptance@example.invalid"]);
  await runGit(["config", "user.name", "AHO Provider Acceptance"]);
  project = await store.addProject(projectRoot, "Provider Golden Project");
  await initHarness(project, { memoryMode: "repo-local" });
  await runGit(["add", "."]);
  await runGit(["commit", "-m", "provider golden baseline"]);
  await writeReadyMarker(await runGitOutput(["rev-parse", "HEAD"]));
} else {
  const marker = hasReadyMarker ? JSON.parse(await readFile(readyMarker, "utf8")) : null;
  if (marker && (marker.version !== 1 || marker.projectRoot !== projectRoot || typeof marker.baselineCommit !== "string")) {
    throw new Error(`Persistent acceptance workspace marker is invalid: ${readyMarker}`);
  }
  if (!await isCompleteLegacyWorkspace()) {
    throw new Error(`Persistent acceptance workspace failed integrity checks: ${workspaceRoot}`);
  }
  if (marker) {
    const roots = (await runGitOutput(["rev-list", "--max-parents=0", "HEAD"])).split(/\r?\n/);
    if (!roots.includes(marker.baselineCommit)) {
      throw new Error(`Persistent acceptance workspace baseline is not in repository history: ${marker.baselineCommit}`);
    }
  }
  project = await store.addProject(projectRoot, "Provider Golden Project");
  if (!marker) await writeReadyMarker(await runGitOutput(["rev-list", "--max-parents=0", "HEAD"]));
}

const handle = await startWorkbenchServer({ project, path: projectRoot }, {
  host: "127.0.0.1",
  port: requestedPort,
  store,
});

console.log(`AHO provider acceptance project: ${projectRoot}`);
console.log(`AHO provider acceptance home: ${ahoHome}`);
console.log(`AHO provider acceptance run: ${workspaceRoot}`);
console.log("AHO provider acceptance mode: persistent");
console.log(`AHO provider acceptance URL: ${handle.url}/?project=${encodeURIComponent(project.id)}`);
console.log("Demand: Add GET /healthz returning HTTP 200 and {\"status\":\"ok\"}, with a regression test; preserve GET /.");
console.log("Press Ctrl+C to stop.");

async function runGit(args) {
  await execFileAsync("git", args, { cwd: projectRoot, windowsHide: true });
}

async function runGitOutput(args) {
  const { stdout } = await execFileAsync("git", args, { cwd: projectRoot, windowsHide: true });
  return stdout.trim();
}

async function isCompleteLegacyWorkspace() {
  if (!existsSync(join(projectRoot, ".git")) || !existsSync(join(projectRoot, "harness", "config")) || !existsSync(join(ahoHome, "registry.json"))) return false;
  try {
    const fixturePackage = JSON.parse(await readFile(join(projectRoot, "package.json"), "utf8"));
    if (fixturePackage.name !== "aho-provider-golden-project") return false;
    return Boolean(await runGitOutput(["rev-parse", "HEAD"]));
  } catch {
    return false;
  }
}

async function writeReadyMarker(baselineCommit) {
  const temporary = `${readyMarker}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify({ version: 1, projectRoot, baselineCommit }, null, 2)}\n`, "utf8");
  await rename(temporary, readyMarker);
}
