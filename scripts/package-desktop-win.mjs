import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import process from "node:process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { desktopBuildVariant } from "./desktop-build-variant.mjs";

const root = process.cwd();
const npmCli = process.env.npm_execpath;
if (!npmCli) throw new Error("Desktop packaging must run through npm so its CLI path is explicit.");
if (process.platform !== "win32" || process.arch !== "x64") throw new Error("Desktop packaging requires Windows x64.");
const manifest = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const variant = desktopBuildVariant(root, manifest.version);
const configPath = resolve(root, "release", "desktop", "builder-" + variant.channel + ".json");
await mkdir(resolve(root, "release", "desktop"), { recursive: true });
await writeFile(configPath, JSON.stringify(variant.config, null, 2), "utf8");

run(process.execPath, ["scripts/generate-desktop-build-info.mjs", "--require-clean"]);
run(process.execPath, [npmCli, "run", "build:desktop"]);
run(process.execPath, ["scripts/generate-desktop-build-info.mjs", "--require-clean"]);
run(process.execPath, [resolve(root, "node_modules", "electron-builder", "cli.js"), "--config", configPath, "--win", "nsis", "--x64", "--publish", "never"]);
run(process.execPath, ["scripts/verify-desktop-package.mjs"]);
const packagedRoot = resolve(variant.output, "win-unpacked");
run(resolve(packagedRoot, variant.config.win.executableName + ".exe"), ["scripts/desktop-native-smoke.cjs"], {
  ...process.env,
  BEAVER_NATIVE_PACKAGE_ROOT: packagedRoot,
  ELECTRON_RUN_AS_NODE: "1",
});

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: root, stdio: "inherit", windowsHide: true, env });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
