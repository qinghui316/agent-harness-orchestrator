import type { Command } from "commander";
import { closeChange, createChange, getChangeStatus } from "../../change/manager.js";
import {
  acceptPlanProposal,
  acceptSpecProposal,
  listPlanProposalSummaries,
  listSpecProposalSummaries,
  showPlanProposal,
  showSpecProposal,
  startPlanProposalRun,
  startSpecProposalRun,
} from "../../change/proposals.js";
import { printJson, printTable } from "../output.js";
import { readOptionalPromptInput, resolveManagedProject, type CliContext } from "../context.js";

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

  const changeSpec = change.command("spec").description("Generate and accept Spec Agent proposals");

  changeSpec
    .command("propose")
    .argument("<project>", "registered project id/name/path")
    .option("--prompt <text>", "additional instruction for the Spec Agent")
    .option("--prompt-file <path>", "file containing additional instruction, resolved from the current AHO cwd")
    .option("--json", "print JSON")
    .action(async (query: string, options: { prompt?: string; promptFile?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const prompt = await readOptionalPromptInput(options);
      const result = await startSpecProposalRun(project, { prompt });
      if (options.json) printJson(result);
      else {
        console.log(`Spec proposal ${result.proposal.id}: ${result.proposal.status}`);
        console.log(`Open questions: ${result.proposal.openQuestions.length}`);
        console.log(`Artifacts: ${result.run.artifacts.directory}`);
        console.log("Spec proposal is not accepted project truth until `aho change spec accept` is run.");
      }
      if (result.run.status === "failed") process.exitCode = result.run.exitCode ?? 1;
    });

  const specProposal = changeSpec.command("proposal").description("List and show Spec Agent proposals");

  specProposal
    .command("list")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const proposals = await listSpecProposalSummaries(project);
      if (options.json) printJson(proposals);
      else printTable(proposals.map((item) => ({
        id: item.id,
        change: item.changeId,
        status: item.status,
        questions: item.openQuestionCount,
        warnings: item.warningCount,
        startedAt: item.startedAt,
      })));
    });

  specProposal
    .command("show")
    .argument("<project>", "registered project id/name/path")
    .argument("<proposal-id>", "proposal id")
    .option("--json", "print JSON")
    .action(async (query: string, proposalId: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const proposal = await showSpecProposal(project, proposalId);
      if (options.json) printJson(proposal);
      else printTable([{
        id: proposal.id,
        change: proposal.changeId,
        status: proposal.status,
        openQuestions: proposal.openQuestions.length,
        warnings: proposal.warnings.length,
      }]);
    });

  changeSpec
    .command("accept")
    .argument("<project>", "registered project id/name/path")
    .argument("<proposal-id>", "proposal id")
    .option("--json", "print JSON")
    .action(async (query: string, proposalId: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await acceptSpecProposal(project, proposalId);
      if (options.json) printJson(result);
      else {
        console.log(`Accepted spec proposal ${result.proposal.id}.`);
        console.log(`Spec: ${result.specPath}`);
        console.log("Run `aho change plan propose` next, and use `aho spec-test drift/check` if accepted evidence may be stale.");
      }
    });

  const changePlan = change.command("plan").description("Generate and accept Planner proposals");

  changePlan
    .command("propose")
    .argument("<project>", "registered project id/name/path")
    .option("--prompt <text>", "additional instruction for the Planner")
    .option("--prompt-file <path>", "file containing additional instruction, resolved from the current AHO cwd")
    .option("--json", "print JSON")
    .action(async (query: string, options: { prompt?: string; promptFile?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const prompt = await readOptionalPromptInput(options);
      const result = await startPlanProposalRun(project, { prompt });
      if (options.json) printJson(result);
      else {
        console.log(`Plan proposal ${result.proposal.id}: ${result.proposal.status}`);
        console.log(`Open questions: ${result.proposal.openQuestions.length}`);
        console.log(`Artifacts: ${result.run.artifacts.directory}`);
        console.log("Plan/tasks proposal is not accepted project truth until `aho change plan accept` is run.");
      }
      if (result.run.status === "failed") process.exitCode = result.run.exitCode ?? 1;
    });

  const planProposal = changePlan.command("proposal").description("List and show Planner proposals");

  planProposal
    .command("list")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const proposals = await listPlanProposalSummaries(project);
      if (options.json) printJson(proposals);
      else printTable(proposals.map((item) => ({
        id: item.id,
        change: item.changeId,
        status: item.status,
        questions: item.openQuestionCount,
        warnings: item.warningCount,
        startedAt: item.startedAt,
      })));
    });

  planProposal
    .command("show")
    .argument("<project>", "registered project id/name/path")
    .argument("<proposal-id>", "proposal id")
    .option("--json", "print JSON")
    .action(async (query: string, proposalId: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const proposal = await showPlanProposal(project, proposalId);
      if (options.json) printJson(proposal);
      else printTable([{
        id: proposal.id,
        change: proposal.changeId,
        status: proposal.status,
        openQuestions: proposal.openQuestions.length,
        warnings: proposal.warnings.length,
      }]);
    });

  changePlan
    .command("accept")
    .argument("<project>", "registered project id/name/path")
    .argument("<proposal-id>", "proposal id")
    .option("--json", "print JSON")
    .action(async (query: string, proposalId: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await acceptPlanProposal(project, proposalId);
      if (options.json) printJson(result);
      else {
        console.log(`Accepted plan proposal ${result.proposal.id}.`);
        console.log(`Plan: ${result.planPath}`);
        console.log(`Tasks: ${result.tasksPath}`);
        console.log(`ACs: ${result.changeStatus.acMap?.acceptanceCriteria.length ?? 0}; tasks: ${result.changeStatus.acMap?.tasks.length ?? 0}`);
      }
    });


}
