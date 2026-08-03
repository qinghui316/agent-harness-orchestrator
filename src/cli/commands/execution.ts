import type { Command } from "commander";
import { acceptAudit, getAuditStatus, listAuditSummaries, showAudit, startAuditRun } from "../../audit/manager.js";
import { getCodeStatus, listCodeRuns, showCodeRun, startCodeRun } from "../../code/manager.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import { listRuns, readRun, startLocalCommandRun } from "../../run/manager.js";
import { getSpecTestDriftReport } from "../../spec-test/drift.js";
import { startSpecTestGenerationRun } from "../../spec-test/generate.js";
import { checkSpecTests, getSpecTestStatus, linkSpecTest, unlinkSpecTest } from "../../spec-test/manager.js";
import {
  acceptSpecTestProposal,
  listSpecTestProposalSummaries,
  showSpecTestProposal,
  startSpecTestProposalRun,
} from "../../spec-test/proposal.js";
import { getValidationStatus, listValidationSummaries, showValidation, startValidationRun } from "../../validation/manager.js";
import { printJson, printTable } from "../output.js";
import {
  collectOption,
  printSpecTestDrift,
  printSpecTestStatus,
  resolveManagedProject,
  type CliContext,
} from "../context.js";

export function installExecutionCommands(program: Command, context: CliContext): void {
  const { store } = context;
  const run = program.command("run").description("Run local commands and record artifacts");

  const validate = program.command("validate").description("Run mechanical validation and record change-scoped evidence");

  const audit = program.command("audit").description("Run semantic audits and manage audit proposals");

  const code = program.command("code").description("Run provider-backed coder agents in AHO-owned worktrees");

  const specTest = program.command("spec-test").description("Manage Acceptance Criteria to test evidence mappings");

  specTest
    .command("generate")
    .argument("<project>", "registered project id/name/path")
    .option("--ac <ac-id>", "Acceptance Criterion id to generate tests for; can be repeated", collectOption, [])
    .option("--missing", "generate tests for ACs with no linked evidence")
    .option("--prompt <text>", "additional instruction for the generator")
    .option("--json", "print JSON")
    .action(async (query: string, options: { ac: string[]; missing?: boolean; prompt?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await startSpecTestGenerationRun(project, {
        acIds: options.ac,
        missing: options.missing === true,
        prompt: options.prompt,
      });
      if (options.json) printJson(result);
      else if (result.noOp) {
        console.log("No missing Acceptance Criteria found; no spec-test generation run was created.");
        for (const warning of result.warnings) console.log(`WARNING: ${warning}`);
      } else {
        console.log(`Spec-test generation ${result.run?.id}: ${result.run?.status}`);
        console.log(`Selected ACs: ${result.selectedAcs.join(", ")}`);
        console.log(`Artifacts: ${result.run?.artifacts.directory}`);
        if (result.run?.worktree) {
          console.log(`Worktree: ${result.run.worktree.worktreeId}`);
          console.log(`Checkout: ${result.run.worktree.checkoutPath}`);
        }
        for (const warning of result.warnings) console.log(`WARNING: ${warning}`);
        console.log("Generated tests are proposal-only; validate, audit, apply, and spec-test proposal accept are still required.");
      }
      if (result.run?.status === "failed") {
        process.exitCode = result.run.exitCode ?? 1;
      }
    });

  specTest
    .command("propose")
    .argument("<project>", "registered project id/name/path")
    .option("--worktree <worktree-id>", "include an AHO-managed worktree context for proposal only")
    .option("--prompt <text>", "additional instruction for the proposer")
    .option("--json", "print JSON")
    .action(async (query: string, options: { worktree?: string; prompt?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await startSpecTestProposalRun(project, { worktreeId: options.worktree, prompt: options.prompt });
      if (options.json) printJson(result);
      else {
        console.log(`Spec-test proposal ${result.proposal.id}: ${result.proposal.status}`);
        console.log(`Evidence candidates: ${result.proposal.evidence.length}`);
        console.log(`Artifacts: ${result.run.artifacts.directory}`);
        console.log("Proposal output is not accepted evidence until `aho spec-test proposal accept` is run.");
      }
      if (result.run.status === "failed") process.exitCode = result.run.exitCode ?? 1;
    });

  const specTestProposal = specTest.command("proposal").description("Review and accept spec-test evidence proposals");

  specTestProposal
    .command("list")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const proposals = await listSpecTestProposalSummaries(project);
      if (options.json) printJson(proposals);
      else {
        printTable(proposals.map((item) => ({
          id: item.id,
          change: item.changeId,
          status: item.status,
          evidence: item.evidenceCount,
          existing: item.existingEvidenceCount,
          acceptable: item.acceptedSourceRootCount,
          startedAt: item.startedAt,
        })));
      }
    });

  specTestProposal
    .command("show")
    .argument("<project>", "registered project id/name/path")
    .argument("<proposal-id>", "proposal id")
    .option("--json", "print JSON")
    .action(async (query: string, proposalId: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const proposal = await showSpecTestProposal(project, proposalId);
      if (options.json) printJson(proposal);
      else {
        printTable([{
          id: proposal.id,
          change: proposal.changeId,
          status: proposal.status,
          worktree: proposal.worktreeId ?? "",
          evidence: proposal.evidence.length,
          warnings: proposal.warnings.length,
        }]);
      }
    });

  specTestProposal
    .command("accept")
    .argument("<project>", "registered project id/name/path")
    .argument("<proposal-id>", "proposal id")
    .option("--ac <ac-id>", "Acceptance Criterion id for a single evidence candidate")
    .option("--ref <ref-id>", "proposal evidence ref id for a single evidence candidate")
    .option("--all-existing", "accept all source-root existingEvidence candidates")
    .option("--json", "print JSON")
    .action(async (query: string, proposalId: string, options: { ac?: string; ref?: string; allExisting?: boolean; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await acceptSpecTestProposal(project, proposalId, {
        ac: options.ac,
        ref: options.ref,
        allExisting: options.allExisting,
      });
      if (options.json) printJson(result);
      else {
        console.log(`Accepted ${result.accepted.length} spec-test evidence candidate(s).`);
        for (const skipped of result.skipped) console.log(`SKIPPED ${skipped.refId}: ${skipped.reason}`);
        printSpecTestStatus(result.status);
      }
    });

  specTest
    .command("drift")
    .argument("<project>", "registered project id/name/path")
    .option("--worktree <worktree-id>", "evaluate against an AHO-managed worktree validation context")
    .option("--json", "print JSON")
    .action(async (query: string, options: { worktree?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const report = await getSpecTestDriftReport(project, { worktreeId: options.worktree });
      if (options.json) printJson(report);
      else printSpecTestDrift(report);
    });

  specTest
    .command("status")
    .argument("<project>", "registered project id/name/path")
    .option("--worktree <worktree-id>", "evaluate against an AHO-managed worktree validation context")
    .option("--json", "print JSON")
    .action(async (query: string, options: { worktree?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const status = await getSpecTestStatus(project, { worktreeId: options.worktree });
      if (options.json) printJson(status);
      else printSpecTestStatus(status);
    });

  specTest
    .command("check")
    .argument("<project>", "registered project id/name/path")
    .option("--worktree <worktree-id>", "evaluate against an AHO-managed worktree validation context")
    .option("--strict", "fail when accepted evidence is invalid, stale, or tied to failed validation")
    .option("--json", "print JSON")
    .action(async (query: string, options: { worktree?: string; strict?: boolean; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const status = await checkSpecTests(project, { worktreeId: options.worktree });
      if (options.strict) {
        const drift = await getSpecTestDriftReport(project, { worktreeId: options.worktree });
        if (options.json) printJson({ status, drift });
        else {
          printSpecTestStatus(status);
          printSpecTestDrift(drift);
        }
        if (!drift.strict.passed) process.exitCode = 1;
      } else {
        if (options.json) printJson(status);
        else printSpecTestStatus(status);
        if (status.blockingIssues.length > 0) process.exitCode = 1;
      }
    });

  specTest
    .command("link")
    .argument("<project>", "registered project id/name/path")
    .requiredOption("--ac <ac-id>", "Acceptance Criterion id")
    .option("--file <path>", "repo-relative evidence file path")
    .option("--test-name <name>", "human-auditable test name; requires --file")
    .option("--command <name>", "validation command name")
    .option("--note <text>", "human note")
    .option("--json", "print JSON")
    .action(async (query: string, options: { ac: string; file?: string; testName?: string; command?: string; note?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const status = await linkSpecTest(project, options);
      if (options.json) printJson(status);
      else printSpecTestStatus(status);
    });

  specTest
    .command("unlink")
    .argument("<project>", "registered project id/name/path")
    .requiredOption("--ac <ac-id>", "Acceptance Criterion id")
    .option("--file <path>", "repo-relative evidence file path")
    .option("--test-name <name>", "human-auditable test name; requires --file")
    .option("--command <name>", "validation command name")
    .option("--note <text>", "human note")
    .option("--json", "print JSON")
    .action(async (query: string, options: { ac: string; file?: string; testName?: string; command?: string; note?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const status = await unlinkSpecTest(project, options);
      if (options.json) printJson(status);
      else printSpecTestStatus(status);
    });

  code
    .command("run")
    .argument("<project>", "registered project id/name/path")
    .option("--task <task-id>", "task id to focus on; can be repeated", collectOption, [])
    .option("--prompt <text>", "additional instruction for the coder")
    .option("--prompt-file <path>", "file containing additional instruction, resolved from the current AHO cwd")
    .option("--model <model>", "provider model to pass through")
    .option("--json", "print JSON")
    .action(async (query: string, options: { task: string[]; prompt?: string; promptFile?: string; model?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await startCodeRun(project, {
        taskIds: options.task,
        prompt: options.prompt,
        promptFile: options.promptFile,
        model: options.model,
      });
      if (options.json) printJson(result);
      else {
        console.log(`Code run ${result.run.id}: ${result.run.status}`);
        console.log(`Artifacts: ${result.run.artifacts.directory}`);
        if (result.run.worktree) {
          console.log(`Worktree: ${result.run.worktree.worktreeId}`);
          console.log(`Checkout: ${result.run.worktree.checkoutPath}`);
        }
        for (const warning of result.warnings) console.log(`WARNING: ${warning}`);
        console.log("Coder output is a proposal only; validate, audit, and human confirmation are still required.");
      }
      if (result.run.status === "failed") {
        process.exitCode = result.run.exitCode ?? 1;
      }
    });

  code
    .command("status")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const status = await getCodeStatus(project);
      if (options.json) printJson(status);
      else {
        printTable([{
          activeChange: status.activeChangeId ?? "",
          latest: status.latest?.id ?? "",
          status: status.latest?.status ?? "none",
          worktree: status.latest?.worktree?.worktreeId ?? "",
          runs: status.runs.length,
        }]);
      }
    });

  code
    .command("list")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const runs = await listCodeRuns(project);
      if (options.json) printJson(runs);
      else {
        printTable(runs.map((item) => ({
          id: item.id,
          change: item.changeId,
          status: item.status,
          worktree: item.worktree?.worktreeId ?? "",
          startedAt: item.startedAt,
          finishedAt: item.finishedAt ?? "",
        })));
      }
    });

  code
    .command("show")
    .argument("<project>", "registered project id/name/path")
    .argument("<run-id>", "coder run id")
    .option("--json", "print JSON")
    .action(async (query: string, runId: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const item = await showCodeRun(project, runId);
      if (options.json) printJson(item);
      else {
        printTable([{
          id: item.id,
          change: item.changeId,
          status: item.status,
          worktree: item.worktree?.worktreeId ?? "",
          artifacts: item.artifacts.directory,
        }]);
      }
    });

  validate
    .command("run")
    .argument("<project>", "registered project id/name/path")
    .option("--profile <profile>", "validation profile name", "default")
    .option("--worktree [worktree-id]", "run validation in a new or existing AHO-managed worktree")
    .option("--json", "print JSON")
    .action(async (query: string, options: { profile?: string; worktree?: boolean | string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await startValidationRun(project, { profile: options.profile, worktree: options.worktree ?? false });
      if (options.json) printJson(result);
      else {
        console.log(`Validation ${result.validation.id}: ${result.validation.status}`);
        console.log(`Profile: ${result.validation.profile}`);
        console.log(`Commands: ${result.validation.commands.length}`);
        console.log(`Artifacts: ${result.run.artifacts.directory}`);
        if (result.run.worktree) console.log(`Worktree: ${result.run.worktree.checkoutPath}`);
      }
      if (result.validation.status === "failed") {
        process.exitCode = 1;
      }
    });

  audit
    .command("run")
    .argument("<project>", "registered project id/name/path")
    .option("--worktree <worktree-id>", "AHO-managed worktree id whose diff should be audited")
    .option("--prompt <text>", "additional human prompt for the auditor")
    .option("--json", "print JSON")
    .action(async (query: string, options: { worktree?: string; prompt?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await startAuditRun(project, { worktreeId: options.worktree, prompt: options.prompt });
      if (options.json) printJson(result);
      else {
        console.log(`Audit ${result.audit.id}: ${result.audit.status}`);
        console.log(`Findings: ${result.audit.findings.length}`);
        console.log(`Artifacts: ${result.run.artifacts.directory}`);
        if (result.audit.worktreeId) console.log(`Worktree: ${result.audit.worktreeId}`);
        console.log("Auditor output is a proposal only; use `aho audit accept` to write reviews/review.md.");
      }
      if (result.audit.status === "failed") {
        process.exitCode = 1;
      }
    });

  audit
    .command("status")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const status = await getAuditStatus(project);
      if (options.json) printJson(status);
      else {
        printTable([{
          activeChange: status.activeChangeId ?? "",
          latest: status.latest?.id ?? "",
          status: status.latest?.status ?? "none",
          findings: status.latest?.findingCount ?? 0,
          audits: status.audits.length,
        }]);
      }
    });

  audit
    .command("list")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const audits = await listAuditSummaries(project);
      if (options.json) printJson(audits);
      else printTable(audits.map((item) => ({
        id: item.id,
        change: item.changeId,
        status: item.status,
        worktree: item.worktreeId ?? "",
        validation: item.validationId ?? "",
        findings: item.findingCount,
        startedAt: item.startedAt,
      })));
    });

  audit
    .command("show")
    .argument("<project>", "registered project id/name/path")
    .argument("<audit-id>", "audit id")
    .option("--json", "print JSON")
    .action(async (query: string, auditId: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await showAudit(project, auditId);
      if (options.json) printJson(result);
      else {
        printTable([{
          id: result.id,
          change: result.changeId,
          status: result.status,
          findings: result.findings.length,
          worktree: result.worktreeId ?? "",
          validation: result.validationId ?? "",
        }]);
      }
    });

  audit
    .command("accept")
    .argument("<project>", "registered project id/name/path")
    .argument("<audit-id>", "audit id")
    .option("--json", "print JSON")
    .action(async (query: string, auditId: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await acceptAudit(project, auditId);
      if (options.json) printJson(result);
      else {
        console.log(`Accepted audit ${result.audit.id}.`);
        console.log(`Review: ${result.reviewPath}`);
      }
    });

  validate
    .command("status")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const status = await getValidationStatus(project);
      if (options.json) printJson(status);
      else {
        printTable([{
          activeChange: status.activeChangeId ?? "",
          latest: status.latest?.id ?? "",
          status: status.latest?.status ?? "none",
          profile: status.latest?.profile ?? "",
          validations: status.validations.length,
        }]);
      }
    });

  validate
    .command("list")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const validations = await listValidationSummaries(project);
      if (options.json) printJson(validations);
      else printTable(validations.map((item) => ({
        id: item.id,
        change: item.changeId,
        status: item.status,
        profile: item.profile,
        mode: item.executionMode,
        commands: item.commandCount,
        startedAt: item.startedAt,
      })));
    });

  validate
    .command("show")
    .argument("<project>", "registered project id/name/path")
    .argument("<validation-id>", "validation id")
    .option("--json", "print JSON")
    .action(async (query: string, validationId: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const validation = await showValidation(project, validationId);
      if (options.json) printJson(validation);
      else {
        printTable([{
          id: validation.id,
          change: validation.changeId,
          status: validation.status,
          profile: validation.profile,
          mode: validation.executionMode,
          commands: validation.commands.length,
        }]);
      }
    });

  run
    .command("start")
    .argument("<project>", "registered project id/name/path")
    .argument("[commandArgs...]", "command and arguments after --")
    .allowUnknownOption(true)
    .option("--worktree", "run the command in a new AHO-managed worktree")
    .option("--json", "print JSON")
    .action(async (query: string, commandArgs: string[], options: { worktree?: boolean; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await startLocalCommandRun(project, commandArgs, { worktree: options.worktree === true });
      if (options.json) printJson(result);
      else {
        console.log(`Run ${result.run.id}: ${result.run.status}`);
        console.log(`Exit code: ${result.run.exitCode ?? ""}`);
        console.log(`Artifacts: ${result.run.artifacts.directory}`);
        if (result.run.worktree) console.log(`Worktree: ${result.run.worktree.checkoutPath}`);
      }
      if (result.run.status === "failed") {
        process.exitCode = result.run.exitCode ?? 1;
      }
    });

  run
    .command("list")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const runs = await listRuns(await resolveProjectMemory(project));
      if (options.json) printJson(runs);
      else {
        printTable(runs.map((item) => ({
          id: item.id,
          change: item.changeId,
          command: item.command.join(" "),
          status: item.status,
          exitCode: item.exitCode ?? "",
          startedAt: item.startedAt,
          finishedAt: item.finishedAt ?? "",
        })));
      }
    });

  run
    .command("show")
    .argument("<project>", "registered project id/name/path")
    .argument("<run-id>", "run id")
    .option("--json", "print JSON")
    .action(async (query: string, runId: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const item = await readRun(await resolveProjectMemory(project), runId);
      if (options.json) printJson(item);
      else {
        printTable([
          {
            id: item.id,
            change: item.changeId,
            command: item.command.join(" "),
            status: item.status,
            exitCode: item.exitCode ?? "",
            artifacts: item.artifacts.directory,
          },
        ]);
      }
    });


}
