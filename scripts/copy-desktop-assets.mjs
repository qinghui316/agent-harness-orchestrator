import { copyFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "src/desktop/startup.html");
const target = resolve(root, "dist/desktop/startup.html");
await mkdir(dirname(target), { recursive: true });
await copyFile(source, target);
