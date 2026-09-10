import { execFileSync } from "node:child_process";
import console from "node:console";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const requireClean = process.argv.includes("--require-clean");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const commit = git(["rev-parse", "HEAD"]);
const dirty = git(["status", "--porcelain", "--untracked-files=normal"]).length > 0;

if (!/^[0-9a-f]{40}$/.test(commit)) throw new Error("Desktop packaging requires a full Git commit.");
if (requireClean && dirty) throw new Error("Desktop packaging requires a clean Git worktree.");

const output = resolve(root, "dist", "desktop", "build-info.json");
await mkdir(resolve(root, "dist", "desktop"), { recursive: true });
await writeFile(output, `${JSON.stringify({
  version: String(packageJson.version),
  commit,
  builtAt: new Date().toISOString(),
  channel: "internal",
  dirty,
}, null, 2)}\n`, "utf8");
console.log(`Desktop build identity: ${packageJson.version} ${commit.slice(0, 12)}${dirty ? " dirty" : " clean"}`);

function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", windowsHide: true }).trim();
}
