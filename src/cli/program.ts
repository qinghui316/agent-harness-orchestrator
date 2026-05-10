import { Command } from "commander";
import { resolveExistingDirectory } from "../fs/path.js";
import { ProjectRegistryStore } from "../registry/store.js";
import { getProjectStatus } from "../project/status.js";
import { auditHarness } from "../harness/audit.js";
import { initHarness } from "../harness/init.js";
import { writeChangeIndex } from "../ecl/index.js";
import { printJson, printTable } from "./output.js";

async function resolveRegisteredOrPath(store: ProjectRegistryStore, query: string): Promise<{ project: Awaited<ReturnType<ProjectRegistryStore["resolveProject"]>>; path: string }> {
  const project = await store.resolveProject(query);
  if (project) return { project, path: project.path };
  return { project: null, path: await resolveExistingDirectory(query) };
}

export function createProgram(): Command {
  const program = new Command();
  const store = new ProjectRegistryStore();

  program.name("aho").description("Agent Harness Orchestrator").version("0.1.0");

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

  const harness = program.command("harness").description("Inspect and initialize repo-local Harness");

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
          exists: component.exists,
        })));
        console.log(`Readiness: ${audit.readiness}; managed: ${audit.managed}; registered: ${resolved.project !== null}`);
      }
    });

  harness
    .command("init")
    .argument("<name-or-path>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const registered = await store.resolveProject(query);
      if (!registered) {
        throw new Error("Project must be registered with `aho project add` before `aho harness init`.");
      }
      const result = await initHarness(registered);
      if (options.json) printJson(result);
      else {
        console.log(`Harness initialized for ${registered.name}.`);
        console.log(`Created: ${result.created.length}; skipped existing: ${result.skipped.length}`);
      }
    });

  harness
    .command("reindex")
    .argument("<name-or-path>", "registered project id/name/path or local path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const resolved = await resolveRegisteredOrPath(store, query);
      const index = await writeChangeIndex(resolved.path);
      if (options.json) printJson(index);
      else console.log(`Rebuilt harness/changes/INDEX.json for ${resolved.path}`);
    });

  return program;
}
