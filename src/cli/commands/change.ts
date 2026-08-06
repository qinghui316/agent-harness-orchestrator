import type { Command } from "commander";
import { getChangeStatus } from "../../change/manager.js";
import { slugify } from "../../fs/path.js";
import { createProjectHarnessChange } from "../../project-harness/change.js";
import { resolveProjectHarnessRegistryContext } from "../../project-harness/registry.js";
import { DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY } from "../../provider-runtime/project-harness-discovery.js";
import { resolveProjectRuntimeState } from "../../project-runtime/coordinator.js";
import { printJson, printTable } from "../output.js";
import { resolveManagedProject, type CliContext } from "../context.js";

export function installChangeCommands(program: Command, context: CliContext): void {
  const { store } = context;
  const change = program.command("change").description("Manage structured ECL changes");

  change
    .command("new")
    .argument("<project>", "registered project id/name/path")
    .requiredOption("--title <title>", "change title")
    .option("--body <text>", "raw user request or context")
    .option("--json", "print JSON")
    .action(async (query: string, options: { title: string; body?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const state = await resolveProjectRuntimeState(project, { discoveryPolicy: DEFAULT_PROJECT_HARNESS_DISCOVERY_POLICY });
      if (state.state !== "ready") throw new Error(`Project Harness is not ready for Change creation: ${state.state}.`);
      const context = await resolveProjectHarnessRegistryContext({
        projectId: state.resolution.harness.projectId,
        projectRoot: state.resolution.projectRoot,
        skillRoot: state.resolution.harness.skillRoot,
      });
      const result = await createProjectHarnessChange(context, {
        changeId: slugify(options.title),
        scope: options.body?.trim() || options.title,
      });
      if (options.json) printJson(result);
      else {
        console.log(`Created Change ${result.change_id} in the project Harness.`);
        console.log("Main must still author and accept planning evidence before execution.");
      }
    });

  change
    .command("status")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const status = await getChangeStatus(project);
      if (options.json) printJson(status);
      else {
        printTable([
          {
            active: status.change?.id ?? status.activeChanges.map((item) => item.name).join(", "),
            review: status.reviewStatus,
            acs: status.acMap?.acceptanceCriteria.length ?? 0,
            tasks: status.acMap?.tasks.length ?? 0,
            warnings: status.closeGate.warnings.length,
            blocking: status.closeGate.blockingIssues.length,
            ready: status.closeGate.ready,
          },
        ]);
        for (const issue of status.closeGate.blockingIssues) console.log(`BLOCKING: ${issue}`);
        for (const warning of status.closeGate.warnings) console.log(`WARNING: ${warning}`);
      }
    });

}
