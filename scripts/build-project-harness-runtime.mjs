import { builtinModules } from "node:module";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const repositoryRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const outDir = resolve(process.argv[2] ?? join(repositoryRoot, "dist", "project-harness-runtime"));
const entry = join(repositoryRoot, "src", "project-harness", "daily-entry.ts");
const nodeBuiltins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

await mkdir(outDir, { recursive: true });
await build({
  configFile: false,
  logLevel: "warn",
  build: {
    emptyOutDir: true,
    lib: {
      entry,
      formats: ["es"],
      fileName: () => "runtime.mjs",
    },
    outDir,
    sourcemap: false,
    minify: false,
    rollupOptions: {
      external(id) {
        return nodeBuiltins.has(id);
      },
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});

const output = join(outDir, "runtime.mjs");
const source = await readFile(output, "utf8");
if (!source.includes("runProjectHarnessDailyCommand")) {
  throw new Error(`Built Runtime does not export runProjectHarnessDailyCommand: ${output}`);
}
process.stdout.write(`${output}\n`);
