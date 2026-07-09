import type { Command } from "commander";
import { writeChangeIndex } from "../../ecl/index.js";
import { auditHarness } from "../../harness/audit.js";
import { initHarness } from "../../harness/init.js";
import { getMemoryStatus } from "../../memory/status.js";
import { assertWritableMemory, resolveMemory } from "../../memory/resolver.js";
import { readProjectMarker } from "../../project/marker.js";
import { getProjectStatus } from "../../project/status.js";
import { printJson, printTable } from "../output.js";
import {
  parseHarnessInitMemoryMode,
  resolveExistingDirectory,
  resolveRegisteredOrPath,
  type CliContext,
} from "../context.js";

export function installCoreCommands(program: Command, context: CliContext): void {
  const { store } = context;
  const project = program.command("project").description("Manage registered projects");

  project
    .command("add")
    .argument("<path>", "local project path")
    .option("--name <name>", "display name")
    .option("--json", "print JSON")
    .action(async (pathInput: string, options: { name?: string; json?: boolean }) => {
      const path = await resolveExistingDirectory(pathInput);
      const added = await store.addProject(path, options.name);
      if (options.json) printJson(added);
      else console.log(`Registered ${added.name} (${added.id}) at ${added.path}`);
    });

  project
    .command("list")
    .option("--json", "print JSON")
    .action(async (options: { json?: boolean }) => {
      const projects = await store.listProjects();
      const statuses = await Promise.all(projects.map((item) => getProjectStatus(item, item.path)));
      const rows = statuses.map((status) => ({
        id: status.project?.id,
        name: status.project?.name,
        path: status.path,
        exists: status.pathExists,
        git: status.isGitRepo,
        harness: status.harness.readiness,
        managed: status.managed,
      }));
      if (options.json) printJson(statuses);
      else printTable(rows);
    });

  project
    .command("status")
    .argument("<name-or-path>", "registered project id/name/path or local path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const resolved = await resolveRegisteredOrPath(store, query);
      const status = await getProjectStatus(resolved.project, resolved.path);
      if (options.json) printJson(status);
      else {
        printTable([
          {
            project: status.project?.id ?? "(unregistered)",
            path: status.path,
            exists: status.pathExists,
            git: status.isGitRepo,
            branch: status.branch ?? "",
            dirty: status.dirty ?? "",
            managed: status.managed,
            harness: status.harness.readiness,
            active: status.harness.activeChanges.map((change) => change.name).join(", "),
            pendingEvolution: status.harness.pendingEvolution,
          },
        ]);
      }
    });

  const harness = program.command("harness").description("Inspect and initialize project Harness memory");

  harness
    .command("audit")
    .argument("<name-or-path>", "registered project id/name/path or local path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const resolved = await resolveRegisteredOrPath(store, query);
      const audit = await auditHarness(resolved.path);
      const result = { registered: resolved.project !== null, ...audit };
      if (options.json) printJson(result);
      else {
        printTable(audit.components.map((component) => ({
          component: component.name,
          path: component.path,
          location: component.location,
          exists: component.exists,
        })));
        console.log(`Readiness: ${audit.readiness}; managed: ${audit.managed}; registered: ${resolved.project !== null}`);
      }
    });

  harness
    .command("init")
    .argument("<name-or-path>", "registered project id/name/path")
    .option("--memory <mode>", "memory mode: repo-local or external-local", "repo-local")
    .option("--json", "print JSON")
    .action(async (query: string, options: { memory?: string; json?: boolean }) => {
      const registered = await store.resolveProject(query);
      if (!registered) {
        throw new Error("Project must be registered with `aho project add` before `aho harness init`.");
      }
      const memoryMode = parseHarnessInitMemoryMode(options.memory);
      const result = await initHarness(registered, { memoryMode });
      if (options.json) printJson(result);
      else {
        console.log(`Harness initialized for ${registered.name} (${memoryMode}).`);
        console.log(`Created: ${result.created.length}; skipped existing: ${result.skipped.length}`);
      }
    });

  harness
    .command("reindex")
    .argument("<name-or-path>", "registered project id/name/path or local path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const resolved = await resolveRegisteredOrPath(store, query);
      const marker = await readProjectMarker(resolved.path);
      const memory = resolveMemory(resolved.project ? { ...resolved.project, marker } : { path: resolved.path, marker });
      assertWritableMemory(memory, "Harness reindex");
      const index = await writeChangeIndex(memory);
      if (options.json) printJson(index);
      else console.log(`Rebuilt harness/changes/INDEX.json for ${resolved.path}`);
    });

  const memory = program.command("memory").description("Diagnose AHO memory resolution");

  memory
    .command("status")
    .argument("<name-or-path>", "registered project id/name/path or local path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const resolved = await resolveRegisteredOrPath(store, query);
      const status = await getMemoryStatus(resolved.project, resolved.path);
      if (options.json) printJson(status);
      else {
        printTable([{
          registered: status.registered,
          managed: status.managed,
          mode: status.memoryMode,
            memoryAvailable: status.memoryAvailable,
            harnessReady: status.harnessReady,
            artifactBase: status.artifactBase,
            harnessRoot: status.roots.harnessRoot,
            runsRoot: status.roots.runsRoot,
          reason: status.unsupportedReason ?? "",
        }]);
      }
    });


}
