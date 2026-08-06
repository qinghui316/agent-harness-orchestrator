import type { Command } from "commander";
import { auditProjectHarness, doctorProjectHarness } from "../../project-harness/diagnostics.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../provider-runtime/project-harness-discovery.js";
import { ProjectRuntimeCoordinator } from "../../project-runtime/coordinator.js";
import { getProjectStatus } from "../../project/status.js";
import { printJson, printTable } from "../output.js";
import {
  resolveExistingDirectory,
  resolveRegisteredOrPath,
  type CliContext,
} from "../context.js";

export function installCoreCommands(program: Command, context: CliContext): void {
  const { store } = context;
  const coordinator = new ProjectRuntimeCoordinator({
    store,
    discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
  });
  const project = program.command("project").description("Manage registered projects");

  project
    .command("add")
    .argument("<path>", "local project path")
    .option("--name <name>", "display name")
    .option("--json", "print JSON")
    .action(async (pathInput: string, options: { name?: string; json?: boolean }) => {
      const path = await resolveExistingDirectory(pathInput);
      const state = await coordinator.register({ path, name: options.name });
      const added = state.project;
      if (options.json) printJson({ project: added, runtimeState: state.state });
      else console.log(`Registered ${added.name} (${added.id}) at ${added.path}; Harness state: ${state.state}`);
    });

  project
    .command("list")
    .option("--json", "print JSON")
    .action(async (options: { json?: boolean }) => {
      const projects = await store.listProjects();
      const statuses = await Promise.all(projects.map((item) => getProjectStatus(item, item.path)));
      if (options.json) printJson(statuses);
      else printTable(statuses.map((status) => ({
        id: status.project?.id,
        name: status.project?.name,
        path: status.path,
        exists: status.pathExists,
        git: status.isGitRepo,
        harness: status.harness.readiness,
        managed: status.managed,
      })));
    });

  project
    .command("status")
    .argument("<name-or-path>", "registered project id/name/path or local path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const resolved = await resolveRegisteredOrPath(store, query);
      const status = await getProjectStatus(resolved.project, resolved.path);
      if (options.json) printJson(status);
      else printTable([{
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
      }]);
    });

  const harness = program.command("harness").description("Inspect the discovered project Harness Skill");
  for (const action of ["doctor", "audit"] as const) {
    harness
      .command(action)
      .argument("<project>", "registered project id/name/path")
      .option("--json", "print JSON")
      .action(async (query: string, options: { json?: boolean }) => {
        const registered = await store.resolveProject(query);
        if (!registered) throw new Error("Project must be registered before Harness diagnostics.");
        const state = await coordinator.resolve(registered);
        if (state.state === "onboarding") {
          const result = { healthy: false, state: "onboarding", projectId: state.reservedProjectId };
          if (options.json) printJson(result);
          else console.log(`Project Harness onboarding is incomplete for ${state.reservedProjectId}.`);
          return;
        }
        const diagnosticOptions = {
          skillRoot: state.resolution.harness.skillRoot,
          projectRoot: state.resolution.projectRoot,
          expectedProjectId: state.resolution.harness.projectId,
          discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY,
        };
        const result = action === "doctor"
          ? await doctorProjectHarness(diagnosticOptions)
          : await auditProjectHarness(diagnosticOptions);
        if (options.json) printJson(result);
        else {
          console.log(`${action}: ${result.healthy ? "healthy" : "unhealthy"}`);
          for (const finding of result.findings) console.log(`${finding.severity.toUpperCase()}: ${finding.message}`);
        }
        if (!result.healthy) process.exitCode = 1;
      });
  }
}
