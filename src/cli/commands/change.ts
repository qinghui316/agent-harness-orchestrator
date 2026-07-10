import type { Command } from "commander";
import { closeChange, createChange, getChangeStatus } from "../../change/manager.js";
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
      const result = await createChange(project, { title: options.title, body: options.body });
      if (options.json) printJson(result);
      else {
        console.log(`Created change ${result.change.id} at ${result.path}`);
        console.log(`ACs: ${result.acMap.acceptanceCriteria.length}; tasks: ${result.acMap.tasks.length}`);
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

  change
    .command("close")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await closeChange(project);
      if (options.json) printJson(result);
      else console.log(`Archived change ${result.change.id} at ${result.archivePath}`);
    });


}
