import console from "node:console";
import { existsSync } from "node:fs";
import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const release = resolve(root, process.env.DESKTOP_RELEASE_DIR ?? "release/desktop");
const packageJson = JSON.parse(await readFile(resolve(root, "package.json"), "utf8"));
const escapedVersion = String(packageJson.version).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const files = existsSync(release) ? await walk(release) : [];
const installerPattern = new RegExp(`Beaver-Code-Setup-${escapedVersion}-win-x64\\.exe$`, "i");
const installer = files.find((file) => installerPattern.test(file));
const unpacked = files.filter((file) => /app\.asar\.unpacked[\\/]node_modules[\\/](better-sqlite3|node-pty)/i.test(file));
const required = [
  /better-sqlite3.*\.node$/i,
  /node-pty.*\.node$/i,
];
const nativeBinaries = unpacked.filter((file) => /\.(?:node|dll|exe)$/i.test(file));
const failures = [];
if (!installer) failures.push("Windows x64 NSIS installer was not found.");
for (const pattern of required) if (!unpacked.some((file) => pattern.test(file))) failures.push(`Missing unpacked native resource: ${pattern}`);
if (nativeBinaries.some((file) => /arm64|darwin|linux/i.test(file))) failures.push("Package contains an unexpected non-Windows or arm64 native binary.");
if (installer && (await stat(installer)).size < 1_000_000) failures.push("Installer is unexpectedly small.");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Desktop package verified: ${installer}`);
}

async function walk(directory) {
  const results = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) results.push(...await walk(path));
    else results.push(path);
  }
  return results;
}
