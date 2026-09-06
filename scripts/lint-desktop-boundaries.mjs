import console from "node:console";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const main = await readFile(resolve(root, "src/desktop/main.ts"), "utf8");
const utility = await readFile(resolve(root, "src/desktop/utility.ts"), "utf8");
const failures = [];

for (const match of main.matchAll(/from\s+["']([^"']+)["']/g)) {
  const source = match[1];
  if (source.startsWith("../") && !source.startsWith("./")) failures.push(`Electron Main imports non-desktop module: ${source}`);
}
for (const match of utility.matchAll(/from\s+["']([^"']+)["']/g)) {
  const source = match[1];
  if (source.startsWith("../") && !["../server/workbench-server.js", "../server/workbench/types.js"].includes(source)) {
    failures.push(`Utility imports unsupported business module: ${source}`);
  }
}
if (/ipcRenderer|contextBridge|nodeIntegration\s*:\s*true/.test(main + utility)) failures.push("Desktop host exposes a forbidden Renderer bridge or Node integration.");

if (failures.length) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Desktop Main/Utility boundaries are valid.");
}
