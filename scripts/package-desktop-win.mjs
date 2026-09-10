import { spawnSync } from "node:child_process";
import process from "node:process";

run(process.execPath, ["scripts/generate-desktop-build-info.mjs", "--require-clean"]);
run(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "build:desktop"]);
run(process.execPath, ["scripts/generate-desktop-build-info.mjs", "--require-clean"]);
run(process.platform === "win32" ? "npx.cmd" : "npx", ["electron-builder", "--config", "electron-builder.yml", "--win", "nsis", "--x64"]);

function run(command, args) {
  const result = spawnSync(command, args, { stdio: "inherit", windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
