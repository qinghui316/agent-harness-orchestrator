import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Desktop packaging must run through npm so its CLI path is explicit.");

run(process.execPath, ["scripts/generate-desktop-build-info.mjs", "--require-clean"]);
run(process.execPath, [npmCli, "run", "build:desktop"]);
run(process.execPath, ["scripts/generate-desktop-build-info.mjs", "--require-clean"]);
run(process.execPath, [resolve(root, "node_modules", "electron-builder", "cli.js"), "--config", "electron-builder.yml", "--win", "nsis", "--x64"]);

function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
