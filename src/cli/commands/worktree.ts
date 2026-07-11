import type { Command } from "commander";
import { applyWorktree, discardWorktree, previewWorktreeApply } from "../../apply/manager.js";
import { getChangeStatus } from "../../change/manager.js";
import { resolveProjectMemory } from "../../memory/resolver.js";
import { createWorktree, getWorktreeStatus, listWorktreeStatuses, removeWorktree } from "../../worktree/manager.js";
import { printJson, printTable } from "../output.js";
import { resolveManagedMemoryProject, resolveManagedProject, type CliContext } from "../context.js";

export function installWorktreeCommands(program: Command, context: CliContext): void {
  const { store } = context;
  const worktree = program.command("worktree").description("Manage AHO-owned Git worktrees");

  worktree
    .command("create")
    .argument("<project>", "registered project id/name/path")
    .option("--base <ref>", "base ref for the worktree")
    .option("--json", "print JSON")
    .action(async (query: string, options: { base?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const memory = await resolveProjectMemory(project);
      const status = await getChangeStatus(project);
      if (status.activeChanges.length !== 1 || !status.change) {
        throw new Error("Cannot create worktree: expected exactly one active change.");
      }
      const result = await createWorktree(project, memory, status.change.id, { baseRef: options.base });
      if (options.json) printJson(result);
      else {
        console.log(`Created worktree ${result.metadata.worktreeId}`);
        console.log(`Branch: ${result.metadata.branchName}`);
        console.log(`Checkout: ${result.metadata.checkoutPath}`);
        for (const warning of result.warnings) console.log(`WARNING: ${warning}`);
      }
    });

  worktree
    .command("list")
    .argument("<project>", "registered project id/name/path")
    .option("--json", "print JSON")
    .action(async (query: string, options: { json?: boolean }) => {
      const { memory } = await resolveManagedMemoryProject(store, query, "Worktree list");
      const items = await listWorktreeStatuses(memory);
      if (options.json) printJson(items);
      else printTable(items.map((item) => ({
        id: item.worktreeId,
        change: item.changeId,
        branch: item.branch,
        dirty: item.dirty ?? "",
        exists: item.exists,
        checkout: item.checkoutPath,
      })));
    });

  worktree
    .command("show")
    .argument("<project>", "registered project id/name/path")
    .argument("<worktree-id>", "worktree id")
    .option("--json", "print JSON")
    .action(async (query: string, worktreeId: string, options: { json?: boolean }) => {
      const { memory } = await resolveManagedMemoryProject(store, query, "Worktree show");
      const item = await getWorktreeStatus(memory, worktreeId);
      if (options.json) printJson(item);
      else printTable([{
        id: item.worktreeId,
        change: item.changeId,
        branch: item.branch,
        dirty: item.dirty ?? "",
        head: item.headCommit ?? "",
        checkout: item.checkoutPath,
      }]);
    });

  worktree
    .command("remove")
    .argument("<project>", "registered project id/name/path")
    .argument("<worktree-id>", "worktree id")
    .option("--force", "remove even if the worktree is dirty")
    .option("--json", "print JSON")
    .action(async (query: string, worktreeId: string, options: { force?: boolean; json?: boolean }) => {
      const { memory } = await resolveManagedMemoryProject(store, query, "Worktree remove");
      const result = await removeWorktree(memory, worktreeId, options.force === true);
      if (options.json) printJson(result);
      else console.log(`Removed worktree ${result.removed.worktreeId}`);
    });

  worktree
    .command("preview")
    .argument("<project>", "registered project id/name/path")
    .argument("<worktree-id>", "worktree id")
    .option("--json", "print JSON")
    .action(async (query: string, worktreeId: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await previewWorktreeApply(project, worktreeId);
      if (options.json) printJson(result);
      else {
        printTable([{
          worktree: result.gate.worktree.worktreeId,
          change: result.gate.changeId,
          ready: result.gate.ready,
          diffHash: result.gate.diffHash,
          validation: result.gate.validation?.id ?? "",
          audit: result.gate.audit?.id ?? "",
          blocking: result.gate.blockingIssues.length,
        }]);
        for (const issue of result.gate.blockingIssues) console.log(`BLOCKING: ${issue}`);
        for (const warning of result.gate.warnings) console.log(`WARNING: ${warning}`);
      }
    });

  worktree
    .command("apply")
    .argument("<project>", "registered project id/name/path")
    .argument("<worktree-id>", "worktree id")
    .option("--commit", "commit the applied patch after applying it")
    .option("--message <message>", "commit message; requires --commit")
    .option("--json", "print JSON")
    .action(async (query: string, worktreeId: string, options: { commit?: boolean; message?: string; json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await applyWorktree(project, worktreeId, { commit: options.commit === true, message: options.message, userConfirmed: true });
      if (options.json) printJson(result);
      else {
        console.log(`Applied worktree ${result.apply.worktreeId}: ${result.apply.status}`);
        console.log(`Run: ${result.run.id}`);
        if (result.apply.commitHash) console.log(`Commit: ${result.apply.commitHash}`);
      }
      if (result.apply.status === "failed") process.exitCode = 1;
    });

  worktree
    .command("discard")
    .argument("<project>", "registered project id/name/path")
    .argument("<worktree-id>", "worktree id")
    .option("--json", "print JSON")
    .action(async (query: string, worktreeId: string, options: { json?: boolean }) => {
      const project = await resolveManagedProject(store, query);
      const result = await discardWorktree(project, worktreeId);
      if (options.json) printJson(result);
      else console.log(`Discarded worktree ${result.discard.worktreeId}: ${result.discard.status}`);
      if (result.discard.status === "failed") process.exitCode = 1;
    });


}
