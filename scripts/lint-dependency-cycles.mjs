import { readdir, readFile } from "node:fs/promises";
import { dirname, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import ts from "typescript";

export const DEFAULT_ALLOWED_ROOT_CYCLES = [
  [
    "src/apply/apply-discard.ts",
    "src/apply/execution-scope.ts",
    "src/apply/manager.ts",
    "src/apply/preview.ts",
    "src/integration-check/apply-discard.ts",
    "src/integration-check/candidates.ts",
    "src/integration-check/manager.ts",
    "src/integration-check/service.ts",
    "src/project-runtime/planning-publication.ts",
  ],
  [
    "src/demand-worker/queue-projection.ts",
    "src/demand-worker/repository.ts",
    "src/demand-worker/slot-policy.ts",
  ],
  [
    "src/project-runtime/workflow-start.ts",
    "src/workflow-runtime/skill-native-ready-set.ts",
  ],
];

export async function lintDependencyCycles(
  rootDirectory = process.cwd(),
  options = {},
) {
  const repositoryRoot = resolve(rootDirectory);
  const sourceRoot = resolve(repositoryRoot, "src");
  const webRoot = resolve(sourceRoot, "web/src");
  const allowedRootCycles = options.allowedRootCycles ?? DEFAULT_ALLOWED_ROOT_CYCLES;
  const files = await collectSourceFiles(sourceRoot);
  const fileSet = new Set(files);
  const graph = new Map(files.map((file) => [file, new Set()]));

  for (const file of files) {
    const source = ts.createSourceFile(file, await readFile(file, "utf8"), ts.ScriptTarget.Latest, true);
    for (const specifier of staticModuleSpecifiers(source)) {
      if (!specifier.startsWith(".")) continue;
      const dependency = resolveSourceModule(dirname(file), specifier, fileSet);
      if (dependency) graph.get(file).add(dependency);
    }
  }

  const cycles = stronglyConnectedComponents(graph)
    .filter((component) => component.length > 1 || graph.get(component[0])?.has(component[0]))
    .map((component) => component.map((file) => toRepositoryPath(file, repositoryRoot)).sort())
    .sort(compareComponents);
  const webCycles = cycles.filter((component) => component.every((file) => (
    resolve(repositoryRoot, file).startsWith(`${webRoot}${sep}`)
  )));
  const registered = allowedRootCycles.map((component) => [...component].sort()).sort(compareComponents);
  const unexpected = cycles.filter((component) => !registered.some((allowed) => sameComponent(component, allowed)));
  const missing = registered.filter((allowed) => !cycles.some((component) => sameComponent(component, allowed)));
  const violations = [];
  for (const component of webCycles) {
    violations.push(`Web Client cycle: ${formatCyclePath(component, graph, repositoryRoot)}`);
  }
  for (const component of unexpected.filter((candidate) => !webCycles.includes(candidate))) {
    violations.push(`Unregistered source cycle: ${formatCyclePath(component, graph, repositoryRoot)} [members: ${component.join(", ")}]`);
  }
  for (const component of missing) {
    violations.push(`Registered cycle changed or disappeared: ${component.join(" -> ")}`);
  }
  return {
    violations,
    filesChecked: files.length,
    cycles,
    webCycles,
    registeredCycles: registered,
  };
}

function staticModuleSpecifiers(source) {
  const result = [];
  source.forEachChild((node) => {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node))
      && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      result.push(node.moduleSpecifier.text);
    } else if (ts.isImportEqualsDeclaration(node)
      && ts.isExternalModuleReference(node.moduleReference)
      && node.moduleReference.expression && ts.isStringLiteralLike(node.moduleReference.expression)) {
      result.push(node.moduleReference.expression.text);
    }
  });
  return result;
}

function resolveSourceModule(parent, specifier, knownFiles) {
  const raw = resolve(parent, specifier);
  const withoutRuntimeExtension = raw.replace(/\.(?:js|mjs|cjs)$/i, "");
  const candidates = [
    raw,
    `${withoutRuntimeExtension}.ts`,
    `${withoutRuntimeExtension}.tsx`,
    resolve(withoutRuntimeExtension, "index.ts"),
    resolve(withoutRuntimeExtension, "index.tsx"),
  ];
  return candidates.find((candidate) => knownFiles.has(candidate)) ?? null;
}

function stronglyConnectedComponents(input) {
  let index = 0;
  const indices = new Map();
  const lowLinks = new Map();
  const stack = [];
  const onStack = new Set();
  const components = [];

  function visit(node) {
    indices.set(node, index);
    lowLinks.set(node, index);
    index += 1;
    stack.push(node);
    onStack.add(node);
    for (const dependency of input.get(node) ?? []) {
      if (!indices.has(dependency)) {
        visit(dependency);
        lowLinks.set(node, Math.min(lowLinks.get(node), lowLinks.get(dependency)));
      } else if (onStack.has(dependency)) {
        lowLinks.set(node, Math.min(lowLinks.get(node), indices.get(dependency)));
      }
    }
    if (lowLinks.get(node) !== indices.get(node)) return;
    const component = [];
    while (stack.length > 0) {
      const current = stack.pop();
      onStack.delete(current);
      component.push(current);
      if (current === node) break;
    }
    components.push(component);
  }

  for (const node of input.keys()) if (!indices.has(node)) visit(node);
  return components;
}

function formatCyclePath(component, input, repositoryRoot) {
  const members = new Set(component.map((file) => resolve(repositoryRoot, file)));
  const start = resolve(repositoryRoot, component[0]);
  const path = findCycle(start, start, input, members, [], new Set());
  return (path ?? component.map((file) => resolve(repositoryRoot, file)))
    .map((file) => toRepositoryPath(file, repositoryRoot))
    .join(" -> ");
}

function findCycle(start, node, input, members, path, visiting) {
  const nextPath = [...path, node];
  visiting.add(node);
  for (const dependency of input.get(node) ?? []) {
    if (!members.has(dependency)) continue;
    if (dependency === start) return [...nextPath, start];
    if (!visiting.has(dependency)) {
      const found = findCycle(start, dependency, input, members, nextPath, visiting);
      if (found) return found;
    }
  }
  visiting.delete(node);
  return null;
}

async function collectSourceFiles(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) result.push(...await collectSourceFiles(path));
    else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) result.push(path);
  }
  return result;
}

function toRepositoryPath(file, repositoryRoot) {
  return relative(repositoryRoot, file).split(sep).join("/");
}

function sameComponent(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function compareComponents(left, right) {
  return left.join("\0").localeCompare(right.join("\0"));
}

const isCli = process.argv[1]
  && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isCli) {
  const result = await lintDependencyCycles(process.cwd());
  if (result.violations.length > 0) {
    process.stderr.write(`Dependency-cycle lint failed:\n${result.violations.map((line) => `- ${line}`).join("\n")}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write(`Dependency-cycle lint passed (${result.filesChecked} source files, ${result.cycles.length} registered root cycles, 0 Web Client cycles).\n`);
  }
}
